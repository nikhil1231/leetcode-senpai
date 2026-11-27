"""Coding Practice for a practical round: choosing the language (Kotlin is read, not run), the service walkthrough, writing
your own test, and the spoken practice interview with its informal debrief."""
import copy
import random

import pytest
from fastapi.testclient import TestClient

from server import auth, main
from server.coding import api, fallback, generate, interview, queue, runner, spec as S


@pytest.fixture
def client(store, monkeypatch):
    monkeypatch.setattr(api, 'get_store', lambda uid: store)
    monkeypatch.setattr(queue, 'get_store', lambda uid: store)
    monkeypatch.setattr(api.queue, 'kick', lambda *a: None)
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


# ---- the language you practise in ----

def test_target_language_follows_the_choice_and_runs_kotlin_as_java():
    assert S.target_language('mixed', 'comprehension') is None and S.target_language('nonsense', 'repair') is None
    assert S.target_language('python', 'repair') == 'python' and S.target_language('java', 'walkthrough') == 'java'
    assert S.target_language('kotlin', 'walkthrough') == 'kotlin' and S.target_language('kotlin', 'localisation') == 'kotlin'
    assert S.target_language('kotlin', 'repair') == 'java' and S.target_language('kotlin', 'bugfix') == 'java'


def _ready(store, i, category, language, mode='reading'):
    template = fallback.pick('reading', 'comprehension')
    ex = {**copy.deepcopy(template), 'id': f'r{i}', 'mode': mode, 'category': category, 'language': language,
          'status': 'ready', 'source': 'generated', 'difficulty': 2, 'created_at': i}
    store.put_track_record(queue.EX, ex['id'], ex)
    return ex


def test_take_serves_your_language_first_then_a_curated_one_in_it_then_any(store):
    _ready(store, 1, 'comprehension', 'java')
    _ready(store, 2, 'comprehension', 'python')
    store.update_settings({'coding_language': 'python'})
    assert queue.take(store, 'reading', 'comprehension')['language'] == 'python'
    store.update_settings({'coding_language': 'kotlin'})
    walk = queue.take(store, 'reading', 'walkthrough')             # nothing generated in Kotlin: the curated Kotlin one
    assert walk['language'] == 'kotlin' and walk['source'] == 'curated' and walk['idioms']
    assert queue.take(store, 'reading', 'comprehension')['id'] == 'r1'   # no Kotlin anywhere: a ready one, not a wait


async def test_refill_makes_your_language_and_java_for_what_kotlin_cannot_run(store, monkeypatch):
    monkeypatch.setattr(queue, 'get_store', lambda uid: store)
    monkeypatch.setattr(queue.model_io, 'available', lambda: True)
    store.update_settings({'coding_language': 'kotlin'})
    _ready(store, 1, 'comprehension', 'java')
    _ready(store, 2, 'comprehension', 'java')
    made = []

    def fake_make(spec):
        made.append((spec['category'], spec['language']))
        return {**copy.deepcopy(fallback.pick('reading', 'comprehension')), 'id': f'm{len(made)}', 'category': spec['category'],
                'language': spec['language'], 'difficulty': spec['difficulty'], 'status': 'ready', 'source': 'generated', 'created_at': 100 + len(made)}
    monkeypatch.setattr(queue, 'make', fake_make)
    await queue.refill('alice', 'reading')
    assert {lang for c, lang in made if c in S.EXECUTABLE} == {'java'}
    assert {lang for c, lang in made if c not in S.EXECUTABLE} == {'kotlin'}
    assert len([c for c, _ in made if c == 'comprehension']) == S.TARGET_READY      # the Java ones did not count
    assert {'r1', 'r2'} <= {e['id'] for e in queue.ready(store, 'reading')}          # kept, in case you switch back


def test_choosing_a_language_is_saved_and_shown(client, store):
    assert client.get('/api/coding/overview').json()['language']['choice'] == 'mixed'
    assert client.put('/api/coding/language', json={'language': 'cobol'}).status_code == 422
    out = client.put('/api/coding/language', json={'language': 'kotlin'}).json()['language']
    assert out['choice'] == 'kotlin' and 'Java' in out['note'] and store.get_settings()['coding_language'] == 'kotlin'
    assert [c['id'] for c in out['choices']] == list(S.LANGUAGE_CHOICES)


def test_starting_says_when_it_could_not_give_you_your_language(client, store):
    store.update_settings({'coding_language': 'kotlin'})
    r = client.post('/api/coding/reading/start', json={'category': 'localisation'}).json()
    assert r['exercise']['language'] == 'python' and 'Kotlin' in r['note']
    first = store.get_track_record(queue.AT, r['attempt']['id'])
    store.put_track_record(queue.AT, first['id'], {**first, 'status': 'abandoned'}, first.get('revision'))
    r = client.post('/api/coding/reading/start', json={'category': 'walkthrough', 'new': True}).json()
    assert r['exercise']['language'] == 'kotlin' and r['note'] is None


# ---- generation ----

WALK = '''<<<META>>>
{"title": "Holds", "task": "1. Trace 2. State 3. Fails 4. Test", "model_answer": "It holds the seat before paying.",
 "findings": [{"id": "f1", "part": "trace", "text": "hold calls pay", "key": true, "anchors": [{"path": "h/Hold.kt", "snippet": "    pay()"}]},
              {"id": "f2", "part": "failure", "text": "seat stays held", "key": true, "anchors": [{"path": "h/Hold.kt", "snippet": "    held = true"}]},
              {"id": "f3", "part": "test", "text": "fake payments that throw, assert free", "key": false}],
 "rubric": ["traces", "failure"], "hints": ["a", "b", "c"], "review": {"root_cause": "held before pay"},
 "idioms": [{"kotlin": "val x = y ?: 0", "java": "y != null ? y : 0", "note": "Elvis"}, {"kotlin": "missing java"}]}
<<<END>>>
<<<FILE h/Hold.kt>>>
var held = false

fun hold() {
    held = true
    pay()
}
<<<END>>>
'''


def test_a_walkthrough_keeps_each_findings_question_and_kotlin_keeps_its_idioms():
    spec = {'mode': 'reading', 'category': 'walkthrough', 'language': 'kotlin', 'difficulty': 2, 'skills': ['state'], 'archetype': 'x'}
    ex = generate.assemble(spec, WALK, 'm')
    assert [f.get('part') for f in ex['findings']] == ['trace', 'failure', 'test']
    assert ex['idioms'] == [{'kotlin': 'val x = y ?: 0', 'java': 'y != null ? y : 0', 'note': 'Elvis'}]
    with pytest.raises(generate.GenError, match='trace and for the failure'):
        generate.assemble(spec, WALK.replace('"part": "failure"', '"part": "state"'), 'm')
    prompt = generate.build_prompt(spec)
    assert 'idiomatic Kotlin' in prompt and 'four numbered questions' in prompt and 'exports/Store.kt' in prompt
    assert 'Kotlin' not in generate.build_prompt({**spec, 'language': 'java'})


def test_a_walkthroughs_review_says_which_question_each_finding_answers():
    ex = fallback.pick('reading', 'walkthrough', language='java', strict=True)
    from server.coding import grade
    assert {f['part'] for f in grade.review(ex)['findings']} == set(S.WALKTHROUGH_PARTS)
    assert "The test you'd write" in grade.build(ex, 'answer', [], 0)


# ---- your own test ----

def test_own_test_verdict():
    ok = lambda n: {'passed': n, 'total': n, 'failed': []}
    bad = {'passed': 0, 'total': 1, 'failed': ['t']}
    assert S.own_test_verdict(bad, ok(1))['catches']
    assert not S.own_test_verdict(ok(1), ok(1))['catches'] and 'would not have caught' in S.own_test_verdict(ok(1), ok(1))['note']
    assert 'something other' in S.own_test_verdict(bad, bad)['note']
    assert 'fix it and check again' in S.own_test_verdict(bad, bad, 'yours')['note']
    assert "didn't run" in S.own_test_verdict({'total': 0}, ok(1))['note']


MY_TEST = '''import unittest

from limiter.window import SlidingWindowLimiter


class MyTest(unittest.TestCase):
    def test_exactly_the_limit_is_allowed(self):
        limiter = SlidingWindowLimiter(3, 10, lambda: 0.0)
        self.assertEqual([limiter.allow("a") for _ in range(4)], [True, True, True, False])
'''


def test_your_test_runs_on_the_original_and_your_code_and_is_judged_on_the_fix(client, store, monkeypatch):
    monkeypatch.setattr(api.model_io, 'available', lambda: False)
    r = client.post('/api/coding/reading/start', json={'category': 'repair'}).json()
    ex, aid = r['exercise'], r['attempt']['id']
    path = ex['own_test']
    assert path == 'tests/test_mine.py' and path in ex['files'] and path in ex['editable']
    assert client.post(f'/api/coding/attempts/{aid}/own-test', json={'files': {}}).status_code == 422   # still the starter
    out = client.post(f'/api/coding/attempts/{aid}/own-test', json={'files': {path: MY_TEST}}).json()
    assert out['fails_before'] and not out['passes_after'] and not out['catches']         # not fixed yet
    broken = client.post(f'/api/coding/attempts/{aid}/run', json={'files': {path: 'this is not python'}}).json()
    assert broken['total'] == 4                                                           # your test never breaks theirs
    window = ex['files']['limiter/window.py'].replace('> self.limit', '>= self.limit')
    att = client.get(f'/api/coding/attempts/{aid}').json()['attempt']
    done = client.post(f'/api/coding/attempts/{aid}/submit', json={'explanation': 'The comparison let one extra through.', 'revision': att['revision'],
                                                                   'files': {path: MY_TEST, 'limiter/window.py': window}}).json()['attempt']
    assert done['own_test']['catches'] and done['own_test']['against'] == 'fix'


# ---- the practice interview ----

def test_flagged_skills_come_from_recent_debriefs_and_steer_the_next_exercise():
    talks = [{'interview': {'debrief': {'skills': ['transactions', 'nonsense'], 'at': 2}}}, {'interview': {'debrief': {'skills': ['retries'], 'at': 1}}}, {}]
    assert S.flagged_skills(talks) == ['transactions', 'retries']
    rng = random.Random(0)
    picks = [S.choose(talks, 'reading', rng)['skills'] for _ in range(20)]
    assert all('transactions' in p for p in picks)


def test_the_interview_saves_your_turn_first_then_debriefs_without_a_score(client, store, monkeypatch):
    monkeypatch.setattr(api.model_io, 'available', lambda: True)
    seen = []

    def fake_ask(area, system, prompt, **kw):
        seen.append((area, system, prompt))
        if 'debrief' in system:
            return {'summary': 'You traced it well.', 'went_well': ['the trace'], 'work_on': ['the retry'], 'misconceptions': [],
                    'skills': ['retries', 'made-up']}, 'm'
        return {'kind': 'event' if len(seen) > 1 else 'question', 'text': 'Look at [giftcards/service/RedemptionService.java:39]. What now?'}, 'm'
    monkeypatch.setattr(interview.model_io, 'ask_json', fake_ask)
    store.update_settings({'coding_language': 'java'})
    r = client.post('/api/coding/reading/start', json={'category': 'walkthrough'}).json()
    aid = r['attempt']['id']
    assert client.post(f'/api/coding/attempts/{aid}/interview/finish', json={}).status_code == 422     # nothing said yet
    opened = client.post(f'/api/coding/attempts/{aid}/interview', json={'text': ''}).json()['interview']
    assert [t['role'] for t in opened['turns']] == ['interviewer'] and 'Open the interview' in seen[0][2]
    assert seen[0][0] == 'coding_interview' and 'PRIVATE NOTES' in seen[0][2] and 'never say' in seen[0][2]

    def down(*a, **k):
        raise interview.model_io.ModelError('busy')
    monkeypatch.setattr(interview.model_io, 'ask_json', down)
    assert client.post(f'/api/coding/attempts/{aid}/interview', json={'text': 'It saves the balance first.'}).status_code == 502
    kept = client.get(f'/api/coding/attempts/{aid}').json()['attempt']['interview']['turns']
    assert kept[-1] == {**kept[-1], 'role': 'you', 'text': 'It saves the balance first.'}            # saved before the model
    monkeypatch.setattr(interview.model_io, 'ask_json', fake_ask)
    turn = client.post(f'/api/coding/attempts/{aid}/interview', json={'text': 'Then the ledger call.'}).json()['interview']['turns'][-1]
    assert turn['kind'] == 'event' and turn['refs'][0]['start'] == 39
    assert 'It saves the balance first.' in seen[-1][2] and 'Then the ledger call.' in seen[-1][2]

    done = client.post(f'/api/coding/attempts/{aid}/interview/finish', json={}).json()['attempt']
    assert done['status'] == 'submitted' and done['via'] == 'interview' and done['result'] is None and not done['needs_self_mark']
    assert done['interview']['debrief']['skills'] == ['retries'] and done['review']['model_answer']
    assert 'You: It saves the balance first.' in done['explanation']
    stored = queue.attempts(store)
    assert S.difficulty(stored, 'reading') == 2 and S.flagged_skills(stored) == ['retries']           # no score, but it steers
    assert client.post(f'/api/coding/attempts/{aid}/interview', json={'text': 'more'}).status_code == 409


def test_the_interview_is_unavailable_without_a_model(client, monkeypatch):
    monkeypatch.setattr(api.model_io, 'available', lambda: False)
    aid = client.post('/api/coding/reading/start', json={}).json()['attempt']['id']
    assert client.post(f'/api/coding/attempts/{aid}/interview', json={'text': 'hi'}).status_code == 503


def test_transcript_and_fold_debrief_are_pure():
    talk = {'turns': [{'role': 'interviewer', 'text': 'Go on'}, {'role': 'you', 'text': 'It debits first'}]}
    assert interview.transcript(talk) == 'Interviewer: Go on\n\nYou: It debits first' and interview.yours(talk) == 1
    d = interview.fold_debrief({'summary': ' ok ', 'went_well': ['a', '', 'b', 'c', 'd'], 'skills': ['state', 'x']}, 5)
    assert d['summary'] == 'ok' and d['went_well'] == ['a', 'b', 'c'] and d['skills'] == ['state'] and d['misconceptions'] == []
