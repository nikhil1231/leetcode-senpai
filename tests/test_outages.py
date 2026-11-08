"""Outage cases in lessons: the shipped JSON is what the build script writes, lessons carry the
case they name, the tutor gets the story rather than the graph, and the tutor's designs can take a
component down. The engine side (breaks, then fixed) is tests/test_outages.cjs."""
import json
import os

import pytest

from scripts import build_outages
from server import system_design_lessons as lessons
from server.system_design_curriculum import LESSONS
from server.tracks import courses
from server.tutor import lessons as tutor_lessons, rig


def test_shipped_cases_are_what_the_build_script_writes():
    with open(build_outages.OUT, encoding='utf-8') as fh:
        assert json.load(fh) == json.loads(json.dumps(build_outages.build()))


def test_a_lesson_block_carries_its_whole_case():
    block = next(b for b in LESSONS['overload']['blocks'] if b['type'] == 'outage')
    assert block['key'] == 'b950' and block['case'] == 'facebook-2010'
    assert block['kind'] == 'real' and block['culprit'] == 'n5'
    assert block['start']['nodes'] and block['fix']['solution']['nodes'] and block['sources']
    rag = courses.lessons('ai')['rag']
    assert any(b['type'] == 'outage' and b['case'] == 'air-canada-2024' for b in rag['blocks'])


def _lesson(case, lesson='overload'):
    with open(os.path.join(lessons.HERE, f'{lesson}.md'), encoding='utf-8') as fh:
        return fh.read().replace('case: facebook-2010', f'case: {case}')


def test_an_unknown_case_or_one_from_another_lesson_fails_at_import():
    with pytest.raises(lessons.LessonError, match='unknown outage case'):
        lessons.parse(_lesson('no-such-case'))
    with pytest.raises(lessons.LessonError, match='belongs to lesson'):
        lessons.parse(_lesson('gitlab-2017'))


def test_every_lesson_case_is_in_its_lesson_and_archive_cases_are_in_none():
    owned = {(b['case'], key) for key, l in LESSONS.items() for b in l['blocks'] if b['type'] == 'outage'}
    owned |= {(b['case'], key) for key, l in courses.lessons('ai').items() for b in l['blocks'] if b['type'] == 'outage'}
    for c in lessons.cases().values():
        if c.get('lesson'):
            assert (c['id'], c['lesson']) in owned
    assert all(c.get('lesson') or c['id'] not in {o for o, _ in owned} for c in lessons.cases().values())


def test_the_tutor_reads_the_story_and_the_fix_not_the_graph():
    lesson = LESSONS['replication']
    notes = tutor_lessons.notes(lesson, limit=100000)
    assert '[BLOCK b950 · outage] A real outage: GitHub' in notes
    assert 'He watches it break' in notes and 'The fix he is asked for' in notes
    assert "'nodes'" not in notes.split('[BLOCK b950')[1].split('[BLOCK')[0] and 'defId' not in notes
    assert any(t['key'] == 'b950' and t['type'] == 'outage' for t in tutor_lessons.tools(lesson))


def test_a_tutor_design_can_take_a_component_down():
    d = rig.clean({'nodes': [{'id': 'dns', 'kind': 'dns'}, {'id': 'app', 'kind': 'app-server'}, {'id': 'db', 'kind': 'db'}],
                   'edges': [['client', 'dns'], ['dns', 'app'], ['app', 'db']],
                   'incidents': [{'type': 'node-down', 'component': 'dns', 'at': 11, 'dur': 2}, {'type': 'node-down', 'component': 'nonsense'}]})
    assert [(e['type'], e['params']) for e in d['scenario']['events']] == [('node-down', {'defId': 'dns'})]
    assert 'node-down' in rig.guide()
