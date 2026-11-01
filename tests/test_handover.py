"""Handover to an outside tutor: the pure brief and choices, and the read-once / report-once endpoints."""
import pytest
from fastapi.testclient import TestClient

from server import auth, handover as ho, main, study_prompt as sp
from server.knowledge_base import api as kb_api
from server.tutor import lessons, session as tses
from tests.fake_store import FakeStore
from tests.test_study_prompt import MIS, VIEWS

LESSON = {'section': 'system-design', 'id': 'a', 'title': 'Lesson a', 'summary': 'Caches hide latency.',
          'objectives': ['Explain a miss', 'Pick a TTL']}


def test_brief_numbers_the_ideas_and_hands_over_where_the_app_tutor_left_off():
    session = {'objectives': [{'status': tses.DEMONSTRATED}, {'status': tses.OPEN}],
               'turns': [{'role': 'learner', 'text': 'old ' * 5}] * 8 + [
                   {'role': 'tutor', 'say': 'What happens on a miss?'}, {'role': 'block', 'block': 'b1', 'correct': True},
                   {'role': 'learner', 'text': 'It goes to the   database'}, {'role': 'tutor', 'say': 'Debrief text', 'debrief': True}]}
    text, refs = ho.brief(VIEWS, MIS, LESSON, {'summary': 'Got misses, TTLs next.'}, session, 'abc234')
    assert refs == {'P1': 'a1', 'P2': 'a2'} and 'P2: claim a2' in text
    assert 'The lesson in one line: Caches hide latency.' in text
    assert '- Explain a miss (✓ shown)' in text and '- Pick a TTL (○ not yet)' in text
    assert 'Last session on this lesson: Got misses, TTLs next.' in text
    tail = text.split('Where that session stopped')[1]
    assert '- Tutor: What happens on a miss?\n- Me: It goes to the database' in tail and 'Debrief text' not in tail
    assert tail.split('How this handover')[0].count('- Me: old') == ho.LAST_TURNS - 2  # only the last six turns
    assert "don't call any tools" in text and 'learning_handback once with session abc234' in text
    assert 'SENPAI-DEBRIEF' not in text


def test_brief_without_any_tutor_history_still_lists_objectives():
    text, _ = ho.brief(VIEWS, MIS, {**LESSON, 'summary': ''}, {}, None, 'x')
    assert '- Explain a miss (○ not yet)' in text and 'Last session' not in text and 'stopped' not in text
    assert ho.brief(VIEWS, MIS, {**LESSON, 'id': 'nope'}, {}, None, 'x') is None


def test_find_lesson_by_title_then_subtopic_within_allowed_sections():
    assert ho.find_lesson(VIEWS, ('system-design',), 'lesson  B') == ('system-design', 'b')
    assert ho.find_lesson(VIEWS, ('system-design',), 'edges') == ('system-design', 'a')
    assert ho.find_lesson(VIEWS, ('system-design',), 'lesson z') is None
    assert ho.find_lesson(VIEWS, ('ai',), 'lesson z') == ('ai', 'z')


def test_recent_lesson_is_the_latest_one_still_teachable_in_an_allowed_section():
    mems = [{'_key': 'lesson:system-design:a', 'last_at': 5}, {'_key': 'lesson:ai:z', 'last_at': 9},
            {'_key': 'lesson:system-design:gone', 'last_at': 10}, {'_key': 'story', 'last_at': 99}]
    ok = lambda s, l: l != 'gone'
    assert ho.recent_lesson(mems, ('system-design', 'ai'), ok) == ('ai', 'z', 9)
    assert ho.recent_lesson(mems, ('system-design',), ok) == ('system-design', 'a', 5)
    assert ho.recent_lesson(mems, ('fundamentals',), ok) is None


def test_rows_keep_the_exact_words_and_the_last_grade_per_idea():
    out = ho.rows([{'ref': 'P1', 'verdict': 'wrong', 'depth': 'recall', 'said': 'x', 'missing': ''},
                   {'ref': 'P1', 'verdict': 'right', 'depth': 'explain', 'said': ' it goes to the DB ', 'missing': 'ignored'},
                   {'ref': 'P2', 'verdict': 'partial', 'depth': 'apply', 'said': 'TTL of a day', 'missing': 'no jitter'}])
    assert out == [{'ref': 'P1', 'verdict': 'right', 'depth': 'explain', 'note': 'it goes to the DB', 'quote': 'it goes to the DB'},
                   {'ref': 'P2', 'verdict': 'partial', 'depth': 'apply', 'note': 'no jitter', 'quote': 'TTL of a day'}]


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('me')
    for mod in (ho, kb_api, sp):
        monkeypatch.setattr(mod, 'get_store', lambda uid: store)
    main.app.dependency_overrides[kb_api.caller] = lambda: {'uid': 'me', 'source': 'personal-mcp'}
    main.app.dependency_overrides[auth.require_user] = lambda: 'me'
    yield TestClient(main.app), store
    main.app.dependency_overrides.clear()


def test_handover_then_handback_records_once_and_tells_the_app_tutor(client):
    http, store = client
    h = http.get('/api/knowledge/handover', params={'lesson': 'cache-aside'}).json()
    assert h['section'] == 'system-design' and h['lesson_title'].startswith('Cache-aside') and h['ideas'] >= 3
    assert f"learning_handback once with session {h['session']}" in h['brief'] and 'P1:' in h['brief']
    refs = store.get_knowledge('study_sessions', h['session'])['refs']
    assert http.get(f"/api/knowledge/handover/{h['session']}").json() == {
        'session': h['session'], 'section': 'system-design', 'lesson': 'cache-aside', 'graded': [], 'handed_back_at': None}

    grades = [{'ref': 'P1', 'verdict': 'right', 'depth': 'explain', 'said': 'the app reads the cache first'},
              {'ref': 'P2', 'verdict': 'wrong', 'said': 'you can skip the cache', 'missing': 'thought a cache is optional for capacity'},
              {'ref': 'P99', 'verdict': 'right'}]
    body = {'session': h['session'], 'grades': grades, 'summary': 'Read path done;  next, invalidation.'}
    r = http.post('/api/knowledge/handback', json=body).json()
    assert r['recorded'] == ['P1', 'P2'] and r['counts'] == {'right': 1, 'partial': 0, 'wrong': 1} and r['summary_saved']
    assert any('P99' in s for s in r['skipped'])
    events = {e['_key']: e for e in store.list_knowledge('knowledge_events')}
    first = events[f"personal-mcp:{h['session']}.P1"]
    assert first['strength'] == 'soft' and first['clean'] and first['points'] == [refs['P1']]
    mis = {m['point']: m for m in store.list_knowledge('knowledge_misconceptions')}
    assert mis[refs['P2']]['text'] == 'thought a cache is optional for capacity'
    assert mis[refs['P2']]['quote'] == 'you can skip the cache' and mis[refs['P2']]['source'] == 'personal-mcp'
    mem = store.get_knowledge('tutor_memory', 'lesson:system-design:cache-aside')
    assert mem['summary'] == 'Read path done; next, invalidation.' and mem['summary_from'] == 'outside tutor'

    again = http.post('/api/knowledge/handback', json={**body, 'grades': grades + [{'ref': 'P3', 'verdict': 'partial', 'missing': 'mass misses'}]}).json()
    assert again['recorded'] == ['P3'] and again['already_graded'] == ['P1', 'P2']
    assert again['counts'] == {'right': 1, 'partial': 1, 'wrong': 1} and len(store.list_knowledge('knowledge_events')) == 3
    assert http.get(f"/api/knowledge/handover/{h['session']}").json()['graded'] == ['P1', 'P2', 'P3']

    nxt = http.get('/api/knowledge/handover').json()  # no lesson named: the one a tutor touched last
    assert nxt['lesson'] == 'cache-aside' and nxt['chosen'] == 'the lesson I was on most recently'
    assert 'Last session on this lesson: Read path done; next, invalidation.' in nxt['brief']


def test_handover_choices_and_errors(client):
    http, _ = client
    first = http.get('/api/knowledge/handover', params={'section': 'system-design'}).json()
    assert first['chosen'] == 'what to learn next' and lessons.get('system-design', first['lesson'])
    by_topic = http.get('/api/knowledge/handover', params={'topic': 'cache-aside'}).json()
    assert by_topic['lesson'] == 'cache-aside'
    assert http.get('/api/knowledge/handover', params={'topic': 'zzqq nothing'}).status_code == 404
    assert http.get('/api/knowledge/handover', params={'lesson': 'cache-aside', 'section': 'ai'}).status_code == 404
    assert http.post('/api/knowledge/handback', json={'session': 'zzzzzz', 'grades': []}).status_code == 404
    assert http.get('/api/knowledge/handover/zzzzzz').status_code == 404
