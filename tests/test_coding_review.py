import copy
import random
from collections import Counter

import pytest

from server.coding import grade, spec as S, generate, fallback, queue
from tests.fake_store import FakeStore


def response(ex):
    return {'correctness': 85, 'reasoning': {'score': 80, 'note': 'Traced the condition.'},
            'findings': [{'id': f['id'], 'met': True, 'note': 'Covered.'} for f in ex['findings']],
            'takeaways': [{'principle': 'State the invariant.', 'evidence': 'Compared the limit.', 'next_time': 'Check below, at and above the boundary.'}],
            'strengths': [], 'misconceptions': [], 'omissions': [], 'communication': [], 'summary': 'Found the cause.'}


def test_mark_preserves_structured_coaching(monkeypatch):
    ex = fallback.pick('reading', 'localisation')
    data = response(ex)
    def ask(*args, **kw):
        kw['check'](data)
        return data, 'test-model'
    monkeypatch.setattr(grade.model_io, 'ask_json', ask)
    result = grade.mark(ex, 'The condition is wrong.', [])
    assert result['takeaways'] == data['takeaways']
    assert result['feedback_version'] == 2 and result['improve'] == []
    assert result['score'] == 85


@pytest.mark.parametrize('fault', ['missing_finding', 'duplicate_finding', 'string_boolean', 'nan_score', 'missing_evidence', 'too_many_takeaways'])
def test_grader_rejects_incomplete_or_ambiguous_results(fault):
    ex = fallback.pick('reading', 'localisation')
    data = response(ex)
    if fault == 'missing_finding': data['findings'].pop()
    if fault == 'duplicate_finding': data['findings'].append(data['findings'][0])
    if fault == 'string_boolean': data['findings'][0]['met'] = 'false'
    if fault == 'nan_score': data['correctness'] = float('nan')
    if fault == 'missing_evidence': del data['takeaways'][0]['evidence']
    if fault == 'too_many_takeaways': data['takeaways'] *= 3
    with pytest.raises(grade.model_io.ModelError):
        grade._check(ex)(data)


def test_language_balance_and_execution_subset():
    for executable, expected in [(False, {'java': 28, 'python': 10, 'go': 1, 'typescript': 1}),
                                 (True, {'java': 28, 'python': 10})]:
        records = []
        for _ in range(sum(expected.values())):
            deficit = S.language_deficits(records, executable)
            records.append({'language': max(deficit, key=deficit.get), 'category': 'repair' if executable else 'comprehension'})
        assert Counter(r['language'] for r in records) == expected
    for i in range(100):
        for mode in S.MODES:
            chosen = S.choose([], mode, random.Random(i), executable=True, category='repair' if mode == 'reading' else 'feature')
            assert chosen['language'] in ('java', 'python')


def test_java_prompt_uses_java_tests_and_typescript_reading():
    spec = S.choose([], 'reading', category='repair', executable=True)
    prompt = generate.build_prompt({**spec, 'language': 'java'})
    assert 'public static void testDescriptiveName()' in prompt
    assert 'tests/VisibleTest.java' in prompt and 'tests/HiddenTest.java' in prompt
    assert 'unittest' not in prompt and 'Python 3' not in prompt
    assert 'TypeScript' not in prompt
    assert S.LANGUAGES['typescript'] == ('ts', 'tsx')


def test_ready_queue_prefers_underrepresented_language():
    store = FakeStore('review-test')
    template = fallback.pick('reading', 'comprehension')
    for lang in ('python', 'java'):
        ex = {**copy.deepcopy(template), 'id': lang, 'status': 'ready', 'language': lang, 'difficulty': 2}
        store.put_track_record(queue.EX, lang, ex)
    chosen = queue.take(store, 'reading', 'comprehension')
    assert chosen['language'] == 'java'
