"""Coding Practice: the pure rules (references, difficulty, choice), what the browser may see, generation parsing, and the
HTTP flow with the model stubbed out."""
import json
import random

import httpx
import pytest
from fastapi.testclient import TestClient

from server import auth, config, llm, main, model_areas
from server.coding import api, assistant, fallback, generate, grade, queue, runner, spec as S, validate

FILES = {'a.py': 'def f():\n    return 1\n\n\ndef g():\n    return 2\n', 'pkg/b.py': 'x = 1\n'}


def attempt(mode='reading', score=80, category='comprehension', skills=('state',), at=1, hints=0):
    return {'mode': mode, 'status': 'submitted', 'score': score, 'category': category, 'skills': list(skills),
            'submitted_at': at, 'hints_used': hints}


def test_refs_parse_typed_text_into_structured_ranges():
    refs = S.parse_refs('the ack in [a.py:5-6] and [pkg/b.py:1] but not [a.py:99] or [c.py:1]', FILES)
    assert refs == [{'path': 'a.py', 'start': 5, 'end': 6}, {'path': 'pkg/b.py', 'start': 1, 'end': 1}]
    assert S.parse_refs('[a.py:6-2]', FILES) == [{'path': 'a.py', 'start': 2, 'end': 6}]
    assert S.ref_token('a.py', 3, 3) == '[a.py:3]' and S.ref_token('a.py', 3, 5) == '[a.py:3-5]'


def test_locate_gives_lines_of_an_exact_snippet():
    assert S.locate(FILES, 'a.py', 'return 2') == (6, 6)
    assert S.locate(FILES, 'a.py', 'def f():\n    return 1') == (1, 2)
    assert S.locate(FILES, 'a.py', 'nope') is None and S.locate(FILES, 'zzz.py', 'x') is None


def test_difficulty_rises_on_two_good_scores_falls_on_a_poor_one_and_is_per_mode():
    assert S.difficulty([], 'reading') == 2
    good = [attempt(score=90, at=1), attempt(score=85, at=2)]
    assert S.difficulty(good, 'reading') == 3
    assert S.difficulty(good + [attempt(score=20, at=3)], 'reading') == 2
    assert S.difficulty(good, 'assisted') == 2                     # independent progress
    assert S.difficulty([attempt(score=80, hints=3, at=1), attempt(score=80, hints=3, at=2)], 'reading') == 2   # hints cost


def test_choose_targets_weak_categories_and_avoids_recent_scenarios():
    done = [attempt(category='comprehension', score=95, at=i) for i in range(1, 7)] + [attempt(category='localisation', score=10, at=7)]
    picks = [S.choose(done, 'reading', random.Random(i))['category'] for i in range(200)]
    assert picks.count('localisation') > picks.count('comprehension')
    assert 'repair' not in picks                                    # executable categories only when asked for
    spec = S.choose(done, 'reading', random.Random(1), recent_archetypes=S.ARCHETYPES[:-1])
    assert spec['archetype'] == S.ARCHETYPES[-1]
    assert S.choose([], 'assisted', random.Random(1), executable=True)['category'] in ('feature', 'bugfix')


def test_skills_follow_the_weakest_results():
    done = [attempt(skills=('retries',), score=10, at=i) for i in range(1, 4)] + [attempt(skills=('state',), score=100, at=9)]
    assert 'retries' in S.choose(done, 'reading', random.Random(3))['skills']


def test_public_view_never_carries_hidden_material():
    ex = fallback.pick('reading', 'localisation')
    ex.update(hidden_tests={'t.py': 'secret'}, reference_fix={'a.py': 'fixed'}, assistant_plan={'mistake': 'x'})
    pub = S.public(ex)
    for hidden in ('findings', 'model_answer', 'rubric', 'hidden_tests', 'reference_fix', 'assistant_plan', 'fix_summary', 'review'):
        assert hidden not in pub
    assert 'secret' not in repr(pub) and "'fixed'" not in repr(pub)
    assert set(S.public(ex)) <= set(S.PUBLIC_KEYS) | {'files', 'editable', 'readonly', 'can_run', 'hint_count', 'curated', 'minutes', 'assistant'}


REPLY = '''<<<META>>>
{"title": "Ledger", "task": "What happens when a payment is retried?", "model_answer": "It is applied twice because the key is checked after the write.",
 "findings": [{"id": "f1", "text": "Dedup check is after the write", "key": true, "anchors": [{"path": "ledger/pay.py", "snippet": "    balance += amount"}]}],
 "rubric": ["names the ordering", "explains the duplicate"], "hints": ["look at pay", "look at the order", "key check"],
 "review": {"expected_behaviour": "applied once"}}
<<<END>>>
<<<FILE ledger/pay.py>>>
balance = 0


def pay(amount, key, seen):
    global balance
    balance += amount
    seen.add(key)
<<<END>>>
<<<FILE README.md>>>
# ledger
<<<END>>>'''
SPEC = {'mode': 'reading', 'category': 'localisation', 'language': 'python', 'difficulty': 2, 'skills': ['retries'], 'archetype': 'x'}


def test_assemble_computes_lines_from_anchors_and_rejects_bad_exercises():
    ex = generate.assemble(SPEC, REPLY, 'm')
    assert ex['findings'][0]['locations'] == [{'path': 'ledger/pay.py', 'start': 6, 'end': 6}]
    assert ex['editable'] == [] and ex['status'] == 'draft'
    with pytest.raises(generate.GenError, match='not in the files'):
        generate.assemble(SPEC, REPLY.replace('    balance += amount"', '    balance -= amount"'), 'm')
    with pytest.raises(generate.GenError, match='does not parse'):
        generate.assemble(SPEC, REPLY.replace('def pay(', 'def pay(((('), 'm')
    with pytest.raises(generate.GenError, match='comments on its own bug'):
        generate.assemble(SPEC, REPLY.replace('    balance += amount\n', '    balance += amount  # bug: no dedup\n').replace('"    balance += amount"', '"    balance += amount  # bug: no dedup"'), 'm')
    with pytest.raises(generate.GenError, match='unsafe path'):
        generate.assemble(SPEC, REPLY.replace('ledger/pay.py>>>', '../pay.py>>>'), 'm')


def test_curated_exercises_have_located_findings():
    for e in fallback.CURATED:
        ex = fallback.pick('reading', e['category'])
        assert all(f['locations'] for f in ex['findings']) and len(ex['hints']) == 3


# ---- HTTP ----

@pytest.fixture
def client(store, monkeypatch):
    monkeypatch.setattr(api, 'get_store', lambda uid: store)
    monkeypatch.setattr(queue, 'get_store', lambda uid: store)
    monkeypatch.setattr(api.queue, 'kick', lambda *a: None)
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def graded(*a, **k):
    return {'score': 82, 'process': 70, 'process_note': 'ok', 'findings': [{'id': 'f1', 'met': True, 'note': 'yes'}], 'misconceptions': ['x'],
            'strengths': ['s'], 'improve': ['i'], 'summary': 'Good.', 'alternative_accepted': False, 'model': 'm', 'by': 'examiner'}


def test_flow_start_hint_save_submit_review_without_leaking(client, store, monkeypatch):
    monkeypatch.setattr(api.model_io, 'available', lambda: True)
    monkeypatch.setattr(api.grade, 'mark', graded)
    r = client.post('/api/coding/reading/start', json={'category': 'localisation'}).json()    # nothing ready: curated pool, no wait
    ex, at = r['exercise'], r['attempt']
    blob = repr(r)
    for hidden in ('model_answer', 'findings', 'rubric', 'fix_summary', 'hidden_tests', 'reference_fix'):
        assert hidden not in blob
    assert ex['curated'] and ex['readonly'] and 'appendleft' in repr(ex['files'])             # the bug is in the code, not in the task
    assert client.post('/api/coding/reading/start', json={}).json()['attempt']['id'] == at['id']   # resumes the open attempt
    h = client.post(f"/api/coding/attempts/{at['id']}/hint").json()
    assert len(h['hints']) == 1
    saved = client.put(f"/api/coding/attempts/{at['id']}", json={'explanation': 'draft [jobq/queue.py:31]', 'revision': h['revision']}).json()
    assert client.put(f"/api/coding/attempts/{at['id']}", json={'explanation': 'old', 'revision': 1}).status_code == 409
    text = 'next_due re-queues a not-due job at the front [jobq/queue.py:31] so later jobs starve.'
    done = client.post(f"/api/coding/attempts/{at['id']}/submit", json={'explanation': text, 'revision': saved['revision']}).json()['attempt']
    assert done['result']['score'] == 82 and done['refs'] == [{'path': 'jobq/queue.py', 'start': 31, 'end': 31}]
    assert 'model_answer' in done['review'] and done['review']['findings'][0]['locations']
    assert client.post(f"/api/coding/attempts/{at['id']}/submit", json={'explanation': text, 'revision': 9}).status_code == 409
    ov = client.get('/api/coding/overview').json()
    assert ov['modes']['reading']['attempts'] == 1 and ov['recent'][0]['score'] == 82


@pytest.mark.parametrize('serve_local', [False, True])
def test_examiner_marks_via_sol_when_claude_is_unavailable(client, monkeypatch, serve_local):
    model = 'anthropic/claude-sonnet-5.5'
    monkeypatch.setattr(model_areas, '_chosen', {'coding': model})
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    monkeypatch.setattr(config, 'LOCALROUTER_URL', 'http://lr.test')
    monkeypatch.setattr(llm, '_local_models', lambda: {model} if serve_local else set())

    def post(url, *, json: dict, **kwargs):
        if url == 'http://lr.test/chat/completions':
            assert json['model'] == model
            return httpx.Response(429)
        assert url == llm.OPENROUTER_CHAT
        if json['model'] != '~openai/gpt-sol-latest':
            return httpx.Response(404)
        if json.get('max_tokens', 0) < 4_000:
            return httpx.Response(200, json={'choices': [{'finish_reason': 'length', 'message': {'content': ''}}]})
        return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': reply}}]})

    reply = json.dumps({'correctness': 84, 'findings': [], 'summary': 'The cursor moved too far.'})
    monkeypatch.setattr(llm.httpx, 'post', post)
    at = client.post('/api/coding/reading/start', json={'category': 'localisation'}).json()['attempt']
    response = client.post(f"/api/coding/attempts/{at['id']}/submit", json={
        'explanation': 'The cursor is advanced one entry too far.', 'revision': at['revision'],
    })
    out = response.json()
    assert response.status_code == 200 and out['message'] is None
    assert out['attempt']['result']['by'] == 'examiner'
    assert out['attempt']['result']['score'] == 84 and not out['attempt']['needs_self_mark']


def test_without_a_model_the_attempt_is_saved_and_self_marked(client, monkeypatch):
    monkeypatch.setattr(api.model_io, 'available', lambda: False)
    r = client.post('/api/coding/reading/start', json={'category': 'comprehension'}).json()
    aid = r['attempt']['id']
    out = client.post(f'/api/coding/attempts/{aid}/submit', json={'explanation': 'It retries timeouts three times.', 'revision': r['attempt']['revision']}).json()
    assert out['attempt']['needs_self_mark'] and out['attempt']['review']['findings']
    ids = [f['id'] for f in out['attempt']['review']['findings']]
    marked = client.post(f'/api/coding/attempts/{aid}/mark', json={'met': ids[:1]}).json()['attempt']
    assert 0 < marked['result']['score'] < 100 and marked['result']['by'] == 'self'
    assert client.post(f'/api/coding/attempts/{aid}/mark', json={'met': ids}).status_code == 409


def test_take_prefers_the_ready_exercise_that_fits_the_latest_level(store):
    def ready(i, level):
        ex = fallback.pick('reading', 'comprehension')
        ex.update(id=f'ex_{i}', difficulty=level, source='generated', status='ready')
        store.put_track_record(queue.EX, ex['id'], ex)
    ready(1, 2), ready(2, 4)
    for i, s in enumerate([90, 90, 90, 90]):                       # two levels up
        store.put_track_record(queue.AT, f'a{i}', {'kind': 'attempt', **attempt(score=s, at=i + 1)})
    assert S.difficulty(queue.attempts(store), 'reading') == 4
    assert queue.take(store, 'reading')['id'] == 'ex_2'
    assert store.get_track_record(queue.EX, 'ex_2')['status'] == 'served'


async def test_refill_stops_at_the_target_and_never_serves_a_failed_validation(store, monkeypatch):
    monkeypatch.setattr(queue, 'get_store', lambda uid: store)
    monkeypatch.setattr(queue.model_io, 'available', lambda: True)
    monkeypatch.setattr(queue, 'EXECUTABLE_ON', False)
    n = {'made': 0}

    def fake_make(spec):
        n['made'] += 1
        if n['made'] == 1:
            raise generate.GenError('failed validation: nope')
        ex = generate.assemble({**SPEC, 'category': spec['category'], 'language': 'python'}, REPLY, 'm')
        ex['difficulty'] = spec['difficulty']
        ex['status'] = 'ready'
        return ex
    monkeypatch.setattr(queue, 'make', fake_make)
    await queue.refill('alice', 'reading')
    full = S.TARGET_READY * len(queue.categories('reading'))
    assert len(queue.ready(store, 'reading')) == full and n['made'] == full + 1
    assert all(len([e for e in queue.ready(store, 'reading') if e['category'] == c]) == S.TARGET_READY for c in queue.categories('reading'))
    await queue.refill('alice', 'reading')
    assert n['made'] == full + 1                            # full: nothing more is made


async def test_truncated_generation_stops_until_the_model_changes(store, monkeypatch):
    monkeypatch.setattr(queue, 'get_store', lambda uid: store)
    monkeypatch.setattr(queue, '_truncated', {})
    monkeypatch.setattr(queue, 'errors', {})
    monkeypatch.setattr(queue, 'EXECUTABLE_ON', False)
    monkeypatch.setattr(config, 'LOCALROUTER_URL', '')
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    monkeypatch.setattr(model_areas, '_chosen', {'coding_gen': 'anthropic/claude-sonnet-5.5'})
    calls = 0

    def post(url, **kwargs):
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={'choices': [{'finish_reason': 'length', 'message': {'content': ''}}]})

    monkeypatch.setattr(llm.httpx, 'post', post)
    await queue.refill('alice', 'reading')
    await queue.refill('alice', 'reading')
    assert calls == 1 and not queue.generating('alice', 'reading')
    assert not queue.ready(store, 'reading')
    assert 'exceeded the output limit' in queue.errors['alice', 'reading']
    assert queue.take(store, 'reading')['source'] == 'curated'

    def recover(spec):
        ex = generate.assemble({**SPEC, 'category': spec['category']}, REPLY, 'm')
        return {**ex, 'difficulty': spec['difficulty'], 'status': 'ready'}

    model_areas._chosen['coding_gen'] = 'openai/gpt-6.1-sol'
    monkeypatch.setattr(queue, 'make', recover)
    await queue.refill('alice', 'reading')
    assert len(queue.ready(store, 'reading')) == S.TARGET_READY * len(queue.categories('reading'))
    assert ('alice', 'reading') not in queue.errors


# ---- Phase 2: repair, in the real sandbox ----

def test_the_curated_repair_exercise_validates_in_the_sandbox():
    ex = fallback.pick('reading', 'repair')
    checks = runner.check_exercise(ex)
    assert all(c['ok'] for c in checks), checks
    assert ex['editable'] == ['limiter/api.py', 'limiter/window.py'] and 'tests/test_visible.py' in ex['files']


def test_runner_overlay_only_applies_editable_files_and_diffs_them():
    ex = fallback.pick('reading', 'repair')
    mine = {'limiter/window.py': ex['files']['limiter/window.py'].replace('> self.limit', '>= self.limit'), 'tests/test_visible.py': 'import os\n'}
    assert runner.overlay(ex, mine)['tests/test_visible.py'] == ex['files']['tests/test_visible.py']
    assert '-        if len(hits) > self.limit:' in runner.unified(ex, mine) and runner.unified(ex, None) == ''


def test_a_broken_exercise_fails_validation_by_running():
    ex = fallback.pick('reading', 'repair')
    ex['reference_fix'] = {'limiter/window.py': ex['files']['limiter/window.py']}      # a "fix" that fixes nothing
    bad = [c['name'] for c in runner.check_exercise(ex) if not c['ok']]
    assert 'the reference fix passes the hidden tests' in bad or 'the reference fix passes the visible tests' in bad


def test_repair_flow_runs_visible_tests_submits_and_never_leaks_hidden_ones(client, store, monkeypatch):
    monkeypatch.setattr(api.model_io, 'available', lambda: False)
    r = client.post('/api/coding/reading/start', json={'category': 'repair'}).json()
    ex, at = r['exercise'], r['attempt']
    assert ex['can_run'] and not ex['readonly'] and 'tests/test_hidden.py' not in ex['files'] and 'test_hidden' not in repr(r)
    aid = at['id']
    first = client.post(f'/api/coding/attempts/{aid}/run', json={'files': {}}).json()
    assert first['total'] == 4 and first['passed'] == 3
    assert [x['status'] for x in first['rows']].count('failed') == 1
    fixed = {'limiter/window.py': ex['files']['limiter/window.py'].replace('> self.limit', '>= self.limit')}
    run = client.post(f'/api/coding/attempts/{aid}/run', json={'files': fixed}).json()
    assert run['passed'] == 4 and '+        if len(hits) >= self.limit:' in run['diff']
    out = client.post(f'/api/coding/attempts/{aid}/submit', json={'explanation': 'The comparison used > instead of >=.', 'revision': run['revision'], 'files': fixed}).json()['attempt']
    assert out['result']['score'] == 100 and out['result']['by'] == 'tests'
    assert out['result']['tests']['hidden_summary'] == {'passed': 5, 'total': 5, 'failed': []}
    assert '>= self.limit' in out['review']['reference_diff'] and '>= self.limit' in out['review']['your_diff']
    # a learner who ships the bug gets the hidden failures only after submitting
    r2 = client.post('/api/coding/reading/start', json={'category': 'repair', 'new': True}).json()
    bad = client.post(f"/api/coding/attempts/{r2['attempt']['id']}/submit", json={'explanation': 'I think it is fine as it is.', 'revision': r2['attempt']['revision']}).json()['attempt']
    assert bad['result']['score'] < 100 and bad['result']['tests']['hidden_summary']['failed']


def test_runs_are_capped_and_only_editable_files_are_accepted(client, monkeypatch):
    monkeypatch.setattr(api.model_io, 'available', lambda: False)
    monkeypatch.setattr(S, 'MAX_RUNS', 1)
    r = client.post('/api/coding/reading/start', json={'category': 'repair'}).json()
    aid = r['attempt']['id']
    evil = {'tests/test_visible.py': 'import unittest\nclass T(unittest.TestCase):\n    def test_x(self): pass\n'}
    out = client.post(f'/api/coding/attempts/{aid}/run', json={'files': evil}).json()
    assert out['total'] == 4                                       # the learner cannot swap the tests
    assert client.post(f'/api/coding/attempts/{aid}/run', json={'files': {}}).status_code == 429


# ---- Phase 3: the AI assistant ----

def test_the_curated_feature_and_its_flawed_patch_validate_by_running():
    ex = fallback.pick('assisted', 'feature')
    assert all(c['ok'] for c in runner.check_exercise(ex)), runner.check_exercise(ex)
    names = [c['name'] for c in runner.check_exercise(ex)]
    assert 'the flawed patch passes the visible tests' in names and 'the flawed patch fails a hidden test' in names


def test_a_flawed_patch_that_is_actually_fine_is_rejected():
    ex = fallback.pick('assisted', 'feature')
    ex['assistant_plan']['flawed_files'] = dict(ex['reference_fix'])
    assert 'the flawed patch fails a hidden test' in [c['name'] for c in runner.check_exercise(ex) if not c['ok']]


def test_assistant_gets_the_flaw_or_the_solution_but_the_browser_never_does(client, store, monkeypatch):
    monkeypatch.setattr(api.model_io, 'available', lambda: True)
    seen = {}

    def fake_chat(model, messages, options=None):
        seen['system'] = messages[0]['content']
        return {'content': "Here you go.\n<<<PATCH limiter/window.py>>>\nVALUE = 1\n<<<END>>>", 'model': 'm'}
    monkeypatch.setattr('server.llm._raw_chat', fake_chat)
    monkeypatch.setattr(api.grade, 'mark', graded)
    r = client.post('/api/coding/assisted/start', json={'category': 'feature'}).json()
    aid, ex = r['attempt']['id'], r['exercise']
    assert ex['assistant'] and ex['minutes'] and ex['can_run'] and 'flawed' not in repr(r) and 'assistant_plan' not in repr(r)
    q = client.post(f'/api/coding/attempts/{aid}/assist', json={'message': 'Where is the limit checked?', 'files': {}}).json()
    assert 'PRIVATE NOTES' in seen['system'] and 'allow(key)' not in seen['system']        # no solution before the planted answer
    out = client.post(f'/api/coding/attempts/{aid}/assist', json={'message': 'Please implement allow_n', 'files': {}}).json()
    flawed = fallback.CURATED[-1]['assistant_plan']['flawed_files']
    assert out['message']['patch'] == flawed and 'planted' not in out['message']          # injected, not asked of the model
    later = client.post(f'/api/coding/attempts/{aid}/assist', json={'message': 'remaining() is 0 after a refusal, why?', 'files': flawed}).json()
    assert 'has a flaw' in seen['system'] and later['message']['patch'] == {'limiter/window.py': 'VALUE = 1\n'}
    shown = client.get(f'/api/coding/attempts/{aid}').json()
    assert 'planted' not in repr(shown) and 'flaw' not in repr(shown['exercise'])
    assert q['message']['text'].startswith('Here you go')


def test_applying_the_flawed_patch_uncritically_is_recorded_and_revealed_only_after_submit(client, store, monkeypatch):
    monkeypatch.setattr(api.model_io, 'available', lambda: False)
    r = client.post('/api/coding/assisted/start', json={'category': 'feature'}).json()
    aid, att = r['attempt']['id'], r['attempt']
    flawed = fallback.CURATED[-1]['assistant_plan']['flawed_files']
    out = client.post(f'/api/coding/attempts/{aid}/submit', json={'explanation': 'I used the assistant patch as it was given.', 'revision': att['revision'], 'files': flawed}).json()['attempt']
    ai = out['review']['ai']
    assert ai['planted'] and ai['kind'] == 'partial-state' and ai['applied_flawed'] and ai['detected'] is False
    assert out['result']['tests']['hidden_summary']['failed']                           # the flaw shows in the hidden tests
    ov = client.get('/api/coding/overview').json()
    assert ov['modes']['assisted']['attempts'] == 1


def test_overreliance_is_read_from_recent_sessions_and_makes_planted_mistakes_less_common():
    a = lambda i, planted, detected: {'mode': 'assisted', 'status': 'submitted', 'score': 50, 'submitted_at': i, 'ai': {'planted': planted, 'detected': detected}}
    careless = [a(1, True, False), a(2, True, False), a(3, False, None)]
    assert S.overreliance(careless) and not S.overreliance(careless[:2])
    share = lambda done: sum(S.choose(done, 'assisted', random.Random(i), executable=True)['plan'] is None for i in range(300))
    assert share(careless) < share([])


def test_practical_coach_uses_live_rules_and_only_public_context(monkeypatch):
    from server.coding import coach
    ex = {'task': 'Trace the request', 'model_answer': 'SECRET ANSWER', 'assistant_plan': {'secret': True}}
    captured = {}

    def ask(area, system, prompt, **kwargs):
        captured.update(area=area, system=system, prompt=prompt)
        return {'text': 'What changes here? [a.py:2] [missing.py:1]'}, 'model'

    monkeypatch.setattr(coach.model_io, 'ask_json', ask)
    out = coach.reply(ex, FILES, [{'role': 'user', 'text': 'I checked f'}], 'My draft', 'Where next?')
    assert out['refs'] == [{'path': 'a.py', 'start': 2, 'end': 2}]
    assert captured['system'].startswith(llm.TASKS['live_hint'].system)
    assert captured['area'] == 'run_coach'
    assert 'SECRET ANSWER' not in captured['prompt'] and 'assistant_plan' not in captured['prompt']
    assert '2:     return 1' in captured['prompt'] and 'My draft' in captured['prompt'] and 'I checked f' in captured['prompt']


def test_practical_coach_saved_counted_resumed_and_unavailable(client, monkeypatch):
    monkeypatch.setattr(api.model_io, 'available', lambda: True)
    monkeypatch.setattr(api.coach, 'reply', lambda *args: {'text': 'Trace this call.', 'refs': []})
    start = client.post('/api/coding/reading/start', json={'category': 'localisation'}).json()
    aid = start['attempt']['id']
    url = f'/api/coding/attempts/{aid}/coach'
    response = client.post(url, json={'message': 'Where next?', 'explanation': 'My draft'})
    assert response.status_code == 200
    assert [m['role'] for m in response.json()['chat']] == ['user', 'assistant']
    resumed = client.post('/api/coding/reading/start', json={}).json()['attempt']
    assert resumed['coach_chat'] == response.json()['chat'] and resumed['hints_used'] == 1
    assert resumed['hints'] == []  # coach turns must not unlock unseen canned hints
    monkeypatch.setattr(api.model_io, 'available', lambda: False)
    assert client.post(url, json={}).status_code == 503
    assert client.post('/api/coding/reading/start', json={}).json()['attempt']['hints_used'] == 1
