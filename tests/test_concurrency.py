"""Custom concurrency questions: the pure rules (levels, variance, refill), assembly of a model reply, and the routes and
editor hooks with the judge faked. The Java runner itself is in test_concurrency_java.py."""
import random

import pytest
from fastapi.testclient import TestClient

from server import auth, main
from server.concurrency import api as capi, generate, judge, queue, spec as S
from tests.fake_store import FakeStore
from tests.fixtures import concurrency_buffer as F


# ---- the refill rule ------------------------------------------------------------------------------------------------
@pytest.mark.parametrize('ready,in_progress,want', [
    (0, 0, True), (1, 0, True), (2, 0, False),      # keep two ready
    (1, 1, True), (2, 1, False),                     # start one: make one, ending at 2 + 1
    (1, 2, False), (0, 3, False), (0, 2, True),      # never more than three unfinished
])
def test_should_refill(ready, in_progress, want):
    assert S.should_refill(ready, in_progress) is want


# ---- outcomes and the level ------------------------------------------------------------------------------------------
def test_outcome():
    assert S.outcome({'unsolved': True}) == 'struggle'
    assert S.outcome({'confidence': 1}) == 'struggle'
    assert S.outcome({'confidence': 3, 'independence': 'hints'}) == 'struggle'
    assert S.outcome({'confidence': 3, 'solution_grade': {'score': 2}}) == 'struggle'
    assert S.outcome({'confidence': 3, 'independence': 'solo', 'wrong_before_ac': 1, 'solution_grade': {'score': 4}}) == 'clean'
    assert S.outcome({'confidence': 2, 'independence': 'solo'}) == 'clean'          # not graded yet: the rating stands
    assert S.outcome({'confidence': 3, 'solution_grade': {'score': 3}}) is None      # correct but middling
    assert S.outcome({'confidence': 3, 'wrong_before_ac': 5}) is None
    assert S.outcome({}) is None                                                     # not rated yet


def clean(level, base=False):
    return {'level': level, 'outcome': 'clean', 'base': base}


def struggle(level, base=False):
    return {'level': level, 'outcome': 'struggle', 'base': base}


def test_level_climbs_after_two_clean_solves_and_drops_after_a_struggle():
    assert S.current_level([]) == 1
    assert S.current_level([clean(1)]) == 1
    assert S.current_level([clean(1), clean(1)]) == 2
    assert S.current_level([clean(1), clean(1), clean(2), clean(2), clean(3), clean(3)]) == 4
    assert S.current_level([clean(1), clean(1), clean(2), struggle(2)]) == 1


def test_easier_questions_do_not_count_and_a_failed_stretch_does_not_pull_you_down():
    up = [clean(1), clean(1)]                   # level 2
    assert S.current_level(up + [clean(1), clean(1)]) == 2
    assert S.current_level(up + [struggle(3)]) == 2
    assert S.current_level(up + [clean(3), clean(3)]) == 3


def test_leetcode_problems_count_half_and_their_struggles_do_not_demote():
    assert S.current_level([clean(2, base=True)] * 3) == 1
    assert S.current_level([clean(2, base=True)] * 4) == 2
    assert S.current_level([clean(1), clean(1), struggle(2, base=True)]) == 2


def test_level_never_leaves_one_to_five():
    assert S.current_level([clean(5)] * 20) == 5
    assert S.current_level([struggle(1)] * 3) == 1


# ---- variance ----------------------------------------------------------------------------------------------------------
def test_pick_level_mixes_easier_and_stretch_questions_around_yours():
    rng = random.Random(1)
    picks = [S.pick_level(3, [], rng) for _ in range(4000)]
    share = {lv: picks.count(lv) / len(picks) for lv in range(1, 6)}
    assert set(picks) == {1, 2, 3, 4}
    assert 0.45 < share[3] < 0.55 and 0.21 < share[2] < 0.29 and 0.12 < share[1] < 0.18 and 0.07 < share[4] < 0.13


def test_pick_level_clamps_at_the_edges():
    rng = random.Random(2)
    assert {S.pick_level(1, [], rng) for _ in range(500)} == {1, 2}
    assert {S.pick_level(5, [], rng) for _ in range(500)} == {3, 4, 5}


def test_a_stretch_in_the_buffer_means_the_next_one_is_not_above_your_level():
    rng = random.Random(3)
    assert max(S.pick_level(3, [4], rng) for _ in range(500)) <= 3
    assert max(S.pick_level(3, [2], rng) for _ in range(2000)) == 4     # with an easy one ready, a stretch can come


def test_weak_tools_and_topics():
    hist = [{'tools': ['Semaphore'], 'outcome': 'struggle'}, {'tools': ['Semaphore'], 'outcome': 'struggle'},
            {'tools': ['CountDownLatch'], 'outcome': 'clean'}]
    assert S.weak_tools(hist) == ['Semaphore']
    rng = random.Random(4)
    for _ in range(200):
        topic, focus = S.choose_topic(1, [], [], rng)
        assert topic['min_level'] <= 1 and focus is None
    recent = ['ordering', 'alternation', 'shared-counter']
    assert all(S.choose_topic(1, recent, [], rng)[0]['key'] == 'producer-consumer' for _ in range(50))
    focused = [S.choose_topic(2, [], ['Semaphore'], rng) for _ in range(400)]
    with_focus = [t for t, f in focused if f == 'Semaphore']
    assert 120 < len(with_focus) < 280 and all('Semaphore' in t['tools'] for t in with_focus)


def test_every_topic_names_a_known_tool_and_fits_some_level():
    known = {t for lv in S.LEVELS.values() for t in lv['tools']}
    for t in S.TOPICS:
        assert set(t['tools']) <= known, t
        assert 1 <= t['min_level'] <= 5


def test_the_tool_is_hidden_until_solved():
    q = {'id': 'cq_1', 'title': 'T', 'level': 3, 'status': 'ready', 'primary_tool': 'Semaphore', 'topic': 'gate'}
    assert 'tool' not in S.public(q)
    assert S.public(q, done=True)['tool'] == 'Semaphore'


def test_measurement_flags():
    ref = {'wall_ms': 400, 'cpu_ms': 200, 'tests': {'HiddenTest.testReaders': {'metrics': {'max_readers': 8}}}}
    assert S.measurement_flags({'wall_ms': 420, 'cpu_ms': 260, 'tests': {}}, ref) == []
    spin = S.measurement_flags({'wall_ms': 450, 'cpu_ms': 3000, 'tests': {}}, ref)
    assert len(spin) == 1 and 'spinning' in spin[0]
    serial = S.measurement_flags({'wall_ms': 2400, 'cpu_ms': 220,
                                  'tests': {'HiddenTest.testReaders': {'metrics': {'max_readers': 1}}}}, ref)
    assert any('serialised' in f for f in serial) and any('max_readers reached 1' in f for f in serial)
    assert S.measurement_flags(None, ref) == []


# ---- assembling a model reply -----------------------------------------------------------------------------------------
STATEMENT = '<p>' + 'A bounded buffer shared by producer and consumer threads. ' * 6 + '</p><script>x()</script><p onclick="y">Ex</p>'


def reply(**over):
    import json
    meta = {'title': 'Bounded buffer', 'class_name': 'BoundedBuffer', 'statement_html': STATEMENT,
            'primary_tool': 'ReentrantLock with several Conditions', 'tools': ['ReentrantLock with several Conditions'],
            'key_ideas': ['two conditions'], 'hints': ['a', 'b', 'c'], 'timeout_ms': 2000,
            'broken': [{'n': 1, 'kind': 'no lock', 'description': 'races', 'weaker_tool': True},
                       {'n': 2, 'kind': 'missed signal', 'description': 'hangs', 'weaker_tool': False}]}
    meta.update(over.pop('meta', {}))
    blocks = {'STARTER': F.STARTER, 'SOLUTION': F.SOLUTION, 'VISIBLE': F.VISIBLE, 'HIDDEN': F.HIDDEN, **over}
    text = f'<<<META>>>\n{json.dumps(meta)}\n<<<END>>>\n'
    for k, v in blocks.items():
        text += f'<<<{k}>>>\n{v}<<<END>>>\n'
    return text + f'<<<BROKEN 1>>>\n```java\n{F.UNSYNCHRONISED}```\n<<<END>>>\n<<<BROKEN 2>>>\n{F.NO_SIGNAL}'


SPEC = {'level': 3, 'topic': 'producer-consumer'}


def test_assemble_a_reply():
    q = generate.assemble(SPEC, reply(), 'm')
    assert q['class_name'] == 'BoundedBuffer' and q['level'] == 3 and q['status'] == 'draft'
    assert [b['n'] for b in q['broken']] == [1, 2] and q['broken'][0]['weaker_tool'] and '```' not in q['broken'][0]['code']
    assert 'script' not in q['statement_html'] and 'onclick' not in q['statement_html'] and '<p>' in q['statement_html']
    assert 'x()' in q['statement_html']   # text kept, escaped and inert


@pytest.mark.parametrize('over,why', [
    ({'meta': {'class_name': 'Conc'}}, 'class name'),
    ({'STARTER': 'package x;\n' + F.STARTER}, 'package'),
    ({'STARTER': F.STARTER.replace('return 0;', 'return 0; // use a Semaphore here')}, 'comments on the approach'),
    ({'VISIBLE': F.VISIBLE.replace('VisibleTest', 'Examples')}, 'VisibleTest'),
    ({'meta': {'hints': []}}, 'hints'),
])
def test_assemble_rejects(over, why):
    with pytest.raises(generate.GenError, match=why):
        generate.assemble(SPEC, reply(**over), 'm')


def test_assemble_needs_two_broken_solutions():
    text = reply().split('<<<BROKEN 2>>>')[0]
    with pytest.raises(generate.GenError, match='broken'):
        generate.assemble(SPEC, text, 'm')


def test_prompt_names_the_level_tools_and_the_weaker_tool_rule():
    text = generate.build_prompt({'level': 4, 'topic': 'reader-writer', 'focus_tool': 'StampedLock',
                                  'avoid_titles': ['Old one'], 'discarded': ['X: Too easy']})
    assert 'ReentrantReadWriteLock' in text and 'Semaphore' in text and 'weaker_tool' in text
    assert 'StampedLock' in text and 'Old one' in text and 'Too easy' in text
    assert 'uses a weaker tool' not in generate.build_prompt({'level': 1, 'topic': 'ordering'})


# ---- routes and editor hooks ------------------------------------------------------------------------------------------
@pytest.fixture
def client(monkeypatch):
    store = FakeStore('test')
    monkeypatch.setattr(main, 'get_store', lambda uid: store)
    monkeypatch.setattr(capi, 'get_store', lambda uid: store)
    monkeypatch.setattr(queue, 'get_store', lambda uid: store)
    kicked = []
    monkeypatch.setattr(queue, 'kick', lambda uid, extra=False: kicked.append(extra))
    main.app.dependency_overrides[auth.require_user] = lambda: 'test'
    main.app.dependency_overrides[auth.leetcode_auth] = lambda: {}
    c = TestClient(main.app)
    c.store, c.kicked = store, kicked
    yield c
    main.app.dependency_overrides.clear()


def add_ready(store, level=3, qid='cq_0011223344556677'):
    q = {**F.question(level=level), 'kind': 'question', 'id': qid, 'status': 'ready', 'title': 'Bounded buffer',
         'topic': 'producer-consumer', 'statement_html': '<p>Make a bounded buffer.</p>', 'primary_tool': 'ReentrantLock',
         'tools': ['ReentrantLock with several Conditions'], 'key_ideas': ['two conditions'], 'hints': ['h1', 'h2', 'h3'],
         'reference_metrics': {'wall_ms': 100, 'cpu_ms': 100, 'tests': {}}, 'created_at': 1}
    store.put_track_record(queue.QK, qid, q)
    return q


def test_overview_lists_ready_questions_without_their_private_parts(client):
    add_ready(client.store)
    r = client.get('/api/concurrency/overview').json()
    assert [q['title'] for q in r['ready']] == ['Bounded buffer'] and r['level'] == 1
    assert 'solution' not in str(r) and 'HiddenTest' not in str(r) and 'tool' not in r['ready'][0]
    assert client.kicked == [False]        # one ready of two: topping up


def test_start_puts_it_in_the_library_and_the_editor_judges_it_in_the_sandbox(client, monkeypatch):
    q = add_ready(client.store)
    started = client.post(f"/api/concurrency/{q['id']}/start").json()
    slug = started['slug']
    assert slug.startswith('cc-') and started['category'] == 'Concurrency'
    p = client.store.get_problem(slug)
    assert p['source'] == 'custom' and p['in_library'] and p['difficulty'] == 'Medium' and p['hint_ladder'] == ['h1', 'h2', 'h3']
    assert client.post(f"/api/concurrency/{q['id']}/start").json()['slug'] == slug      # starting again is a no-op

    s = client.post('/api/session/start', json={'slug': slug, 'surface': 'editor'}).json()
    assert s['editor']['custom'] and s['editor']['can_judge'] and s['editor']['lang'] == 'java'
    assert s['editor']['code'] == F.STARTER
    state = client.get('/api/editor/state', params={'session_id': s['session_id']}).json()
    assert state['available'] and state['custom']

    rows = [{'id': 'VisibleTest.testFifoOrder', 'status': 'passed', 'message': '', 'runs': 3, 'wall_ms': 5, 'cpu_ms': 5,
             'stdout': '', 'metrics': {}}]
    monkeypatch.setattr(judge, 'run', lambda q, code: {'rows': rows, 'compile_error': '', 'error': '', 'seconds': 1})
    run = client.post('/api/editor/run', json={'session_id': s['session_id'], 'code': F.SOLUTION, 't': 1000,
                                                'events': [], 'data_input': ''}).json()
    assert run['ok'] and run['result']['passed'] and run['result']['cases'][0]['input'] == 'Fifo order'

    fail = [{**rows[0], 'id': 'HiddenTest.testPutBlocksWhenFull', 'status': 'timeout', 'message': 'Timed out'}]
    monkeypatch.setattr(judge, 'submit', lambda q, code: {'rows': fail, 'compile_error': '', 'error': '', 'seconds': 1})
    bad = client.post('/api/editor/submit', json={'session_id': s['session_id'], 'code': F.NO_SIGNAL, 't': 2000,
                                                   'events': []}).json()
    assert bad['result']['status'] == 'Time Limit Exceeded' and bad['result']['input'] == 'Put blocks when full'
    assert bad['attempt_id'] is None

    good = [{**rows[0], 'runs': 20, 'wall_ms': 400, 'cpu_ms': 3000}]
    monkeypatch.setattr(judge, 'submit', lambda q, code: {'rows': good, 'compile_error': '', 'error': '', 'seconds': 1})
    ok = client.post('/api/editor/submit', json={'session_id': s['session_id'], 'code': F.SOLUTION, 't': 3000,
                                                  'events': []}).json()
    assert ok['result']['accepted'] and ok['result']['runtime_percentile'] is None and ok['attempt_id']
    a = client.store.get_attempt(ok['attempt_id'])
    assert a['custom_measured']['cpu_ms'] == 3000 and a['wrong_before_ac'] == 1 and a['lang'] == 'java'

    over = client.get('/api/concurrency/overview').json()
    assert [d['slug'] for d in over['done']] == [slug] and over['done'][0]['tool'] == 'ReentrantLock'

    seen = {}

    async def extract_or_error(task, payload, settings=None):
        seen.update(task=task, **payload)
        return {'score': 3, 'analysis': 'Spins.', 'positives': [], 'negatives': ['busy-waits'], 'improve': [],
                'followup': '', 'optimal': False}, None
    monkeypatch.setattr(main.llm, 'enabled', lambda settings=None: True)
    monkeypatch.setattr(capi.llm, 'enabled', lambda settings=None: True)
    monkeypatch.setattr(capi.llm, 'extract_or_error', extract_or_error)
    graded = client.post(f"/api/attempt/{ok['attempt_id']}/grade-solution").json()
    assert graded['grading_status'] in ('viewed', 'graded') or graded.get('graded'), graded
    assert seen['task'] == 'grade_concurrency' and 'spinning' in seen['flags'] and 'percentile' not in seen['measured']
    assert seen['reference'] == F.SOLUTION


def test_a_custom_question_that_went_well_gets_no_review_card(client):
    a = {'slug': 'cc-x', 'confidence': 3, 'independence': 'solo'}
    assert not capi.wants_review_card(a, None)
    assert capi.wants_review_card({**a, 'confidence': 1}, None)
    assert capi.wants_review_card({**a, 'unsolved': True}, None)
    assert capi.wants_review_card(a, {'due_date': '2026-12-01'})


def test_discard_removes_it_from_the_list_and_the_library(client):
    q = add_ready(client.store)
    slug = client.post(f"/api/concurrency/{q['id']}/start").json()['slug']
    assert client.post(f"/api/concurrency/{q['id']}/discard", json={'reason': 'nope'}).status_code == 422
    assert client.post(f"/api/concurrency/{q['id']}/discard", json={'reason': 'tests-wrong', 'note': 'flaky'}).json()['ok']
    over = client.get('/api/concurrency/overview').json()
    assert not over['ready'] and not over['in_progress'] and not over['done']
    assert client.store.get_problem(slug)['in_library'] is False
    spec = queue.next_spec(client.store, random.Random(0))
    assert any('A test was wrong or flaky (flaky)' in d for d in spec['discarded'])


def test_generate_asks_for_one_more(client, monkeypatch):
    monkeypatch.setattr(capi.model_io, 'available', lambda: True)
    assert client.post('/api/concurrency/generate').json()['ok']
    assert client.kicked == [True]


def test_custom_questions_stay_out_of_the_pack_totals(client):
    q = add_ready(client.store)
    client.post(f"/api/concurrency/{q['id']}/start")
    tree = client.get('/api/topics/tree').json()
    assert 'cc-' not in str(tree)
