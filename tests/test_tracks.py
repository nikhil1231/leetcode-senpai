"""Learning tracks: content integrity, pure selection/scoring logic, and the HTTP round trips."""
import os
import shutil
import sys

import pytest
from fastapi.testclient import TestClient

from server import auth, main
from server.tracks import ai_round, courses, experience, http, practical
from server.tracks.experience_content import PROMPTS, STAR_CHECKS
from tests.fake_store import FakeStore

STATIC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'static')
sys.path.insert(0, STATIC)
import practical_runner  # noqa: E402

DAY = 86400


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    monkeypatch.setattr(http, 'get_store', lambda uid: store)
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    c = TestClient(main.app)
    c.store = store
    yield c
    main.app.dependency_overrides.clear()


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


# ---- content -------------------------------------------------------------------------

def test_courses_load_with_unique_ids_and_questions():
    for track in courses.COURSES:
        ids = [i['id'] for i in courses.items(track)]
        assert len(ids) == len(set(ids))
        for lesson in courses.lessons(track).values():
            kinds = [q['kind'] for q in lesson['questions'].values()]
            assert kinds.count('quiz') >= 3 and kinds.count('quickfire') >= 3


@pytest.mark.parametrize('key', [k for k, ex in practical.EXERCISES.items() if ex['category'] != 'review'])
def test_exercise_solutions_pass_and_starters_fail(key, tmp_path):
    """Every reference solution passes its tests and checks; every starter fails something."""
    ex = practical.EXERCISES[key]
    modules = [m[:-3] for m in ex['tests'] + ex.get('checks', [])]
    for label in ('starter', 'solution'):
        root = tmp_path / label
        root.mkdir()
        for name, text in ex['contents'].items():
            (root / name).write_text(text)
        if label == 'solution':
            for name, text in ex['solution'].items():
                (root / name).write_text(text)
        result = practical_runner.run(modules, str(root))
        if label == 'solution':
            assert result['passed'] == result['total'] > 0, [r for r in result['results'] if not r['ok']]
        else:
            assert result['passed'] < result['total']
        shutil.rmtree(root)


@pytest.mark.parametrize('key', [k for k, ex in practical.EXERCISES.items() if ex['category'] == 'assisted'])
def test_ai_suggestion_passes_the_bug_tests_but_not_the_checks(key, tmp_path):
    """The canned AI patch is the point of an AI-assisted round: plausible, green on the visible
    bug tests, and caught only by the edge cases a careful candidate would test."""
    folder = os.path.join(practical.HERE, key, 'ai_patch')
    ex = practical.EXERCISES[key]
    for name, text in ex['contents'].items():
        (tmp_path / name).write_text(text)
    for name in os.listdir(folder):
        shutil.copy(os.path.join(folder, name), tmp_path / name)
    phase1 = practical_runner.run(['test_phase1'], str(tmp_path))
    assert phase1['passed'] == phase1['total'] > 0
    edges = practical_runner.run(['check_edges'], str(tmp_path))
    assert edges['passed'] < edges['total']
    assert 'AI_SUGGESTION.md' in ex['readonly'] and practical.public(ex)['pair'] is True


def test_review_exercises_hide_issues_until_submitted():
    for ex in practical.EXERCISES.values():
        shown = practical.public(ex)
        assert 'issues' not in shown and 'solution' not in shown and 'discussion' not in shown
        assert not any(n.startswith('check_') for n in shown['starter'])


# ---- pure logic ------------------------------------------------------------------------

def answer(qid, correct, at, source='quickfire'):
    return {'kind': 'answer', 'question_id': qid, 'lesson_id': qid.rsplit('-', 3)[0], 'correct': correct,
            'revealed': False, 'guessed': False, 'source': source, 'at': at}


def test_quickfire_prefers_missed_then_opened_lessons():
    now = 100 * DAY
    first = next(iter(courses.questions('ai')))
    records = [answer(first, False, now - 60)]
    assert courses.next_question('ai', records, now)['id'] == first
    opened = list(courses.lessons('ai'))[3]
    records = [{'kind': 'lesson', 'lesson_id': opened, 'activities': {}}]
    assert courses.next_question('ai', records, now)['lesson_id'] == opened
    assert courses.next_question('ai', records, now, exclude={q for q in courses.questions('ai')
                                                              if q.startswith(opened)})['lesson_id'] != opened


def test_course_overview_counts_first_try_lesson_activities():
    lesson = next(iter(courses.lessons('fundamentals').values()))
    block = next(b for b in lesson['blocks'] if b['type'] != 'md')
    records = [{'kind': 'lesson', 'lesson_id': lesson['id'], 'at': 10,
                'activities': {block['key']: {'done': True, 'first_correct': True, 'at': 10}}}]
    o = courses.overview('fundamentals', records, 20)
    assert o['knowledge'] > 0 and o['answers'] == 1
    assert o['course'][0]['lessons'][0]['opened']


def test_drill_is_clean_only_with_required_checks_and_time():
    all_on = {k: True for k, _ in STAR_CHECKS}
    assert experience.drill_clean(all_on, 150)
    assert not experience.drill_clean(all_on, 300)            # rambling
    assert not experience.drill_clean({**all_on, 'result': False}, 120)
    assert experience.drill_clean({**all_on, 'reflection': False}, 120)


def test_next_prompt_prefers_prompts_you_have_a_story_for():
    story = {'kind': 'story', 'id': 's1', 'competencies': ['failure'], 'updated_at': 1}
    p = experience.next_prompt([story], 10)
    assert 'failure' in p['competencies']
    missed = {'kind': 'drill', 'prompt_id': 'p-incident', 'clean': False, 'at': 5}
    assert experience.next_prompt([story, missed], 10)['id'] == 'p-incident'


def test_cv_claims_link_stories_and_packs():
    ctx = {'context': {'experience': [{'ref': 'cv.1', 'excerpt': 'Upgraded ZooKeeper'}],
                       'self_reported_topics': [{'topic': 'ZooKeeper — leader election', 'state': 'Needs work'}]}}
    out = experience.cv_claims(ctx, [{'id': 's1', 'source_ref': 'cv.1'}])
    assert out['claims'][0]['story_id'] == 's1'
    assert out['topics'][0]['pack'] == 'zookeeper'
    assert experience.cv_claims(None, [])['available'] is False


def test_practical_clean_rules():
    ex = practical.EXERCISES['lru-ttl-cache']
    good = {'tests': {'passed': 5, 'total': 5}, 'checks': {'passed': 7, 'total': 7},
            'rubric': [True] * len(ex['rubric'])}
    assert practical.clean(ex, good)
    assert not practical.clean(ex, {**good, 'revealed_before_submit': True})
    assert not practical.clean(ex, {**good, 'checks': {'passed': 6, 'total': 7}})
    review = practical.EXERCISES['review-webhook']
    assert practical.clean(review, {'found': list(range(6))})
    assert not practical.clean(review, {'found': [0, 1]})


def test_process_signals_reward_reading_first_and_specific_prompts():
    base = {'started_at': 0, 'runs': [{'at': 60, 'passed': 1, 'total': 3}, {'at': 900, 'passed': 3, 'total': 3}],
            'edits': [400, 880], 'checks': {'passed': 5, 'total': 5},
            'walkthrough': 'The overlap check was inclusive on both sides. ' * 8 + 'I added a test for both orders and ran the suite.'}
    good = ai_round.signals(base, [{'text': 'In rooms.py make overlaps() half-open in both directions', 'at': 200}])
    assert all(a['ok'] for a in good['areas'])
    assert good['stats'] == {'prompts': 1, 'runs': 2, 'runs_before_first_prompt': 1, 'seconds_to_first_prompt': 200}
    rushed = {**base, 'runs': [{'at': 300, 'passed': 3, 'total': 3}], 'edits': [500], 'walkthrough': 'Fixed it.',
              'checks': {'passed': 3, 'total': 5}}
    bad = {a['key']: a for a in ai_round.signals(rushed, [{'text': 'fix it', 'at': 20}, {'text': 'rewrite the whole file', 'at': 90}])['areas']}
    assert not any(a['ok'] for a in bad.values())
    assert any('re-running' in n for n in bad['verification']['notes'])
    assert any('2 hidden checks failed' in n for n in bad['verification']['notes'])
    none = {a['key']: a['ok'] for a in ai_round.signals({**base, 'walkthrough': ''}, [])['areas']}
    assert none == {'approach': None, 'control': None, 'verification': True, 'communication': False}


def test_vague_prompts():
    for text in ('fix it', 'Fix the bug.', 'please solve this', 'make it work', 'rewrite the entire module'):
        assert ai_round.vague(text), text
    for text in ('Why does free_slots return a taken slot?', 'Write a test for `overlaps` with adjacent ranges',
                 'Explain what chunk() does when overlap is larger than the gap to the last space'):
        assert not ai_round.vague(text), text


def test_ai_overview_maps_the_interview_loop():
    o = courses.overview('ai', [], 0, {'ai-pair-rooms': {'title': 'Rooms', 'minutes': 45, 'status': 'solid'},
                                       'ai-pair-chunker': {'title': 'Chunker', 'minutes': 45, 'status': 'unseen'}})
    assert o['course'][0]['id'] == 'assisted' and o['next_lesson']['id'] == 'ai-coding-round'
    first = o['rounds'][0]
    assert first['id'] == 'assisted' and [e['id'] for e in first['exercises']] == ['ai-pair-rooms', 'ai-pair-chunker']
    assert first['held'] == 1 and first['items'] > 2
    known = {k for spec in courses.COURSES['ai']['rounds'] for k in spec[3]}
    assert known <= set(courses.lessons('ai'))
    assert {e for spec in courses.COURSES['ai']['rounds'] for e in spec[4]} <= set(practical.EXERCISES)
    assert courses.overview('fundamentals', [], 0)['rounds'] == []


# ---- HTTP ------------------------------------------------------------------------------

def test_course_lesson_quickfire_round_trip(client):
    lesson = ok(client.get('/api/tracks/ai/lessons/rag'))
    assert lesson['checks'] and 'correct' not in lesson['checks'][0]
    block = next(b for b in lesson['blocks'] if b['type'] not in ('md', 'arch'))
    ok(client.post('/api/tracks/ai/lessons/rag/activity', json={'block': block['key'], 'correct': True}))
    q = ok(client.post('/api/tracks/ai/quickfire/next', json={'lesson': 'rag'}))['question']
    full = courses.questions('ai')[q['id']]
    right = full['correct'] if isinstance(full['correct'], str) else ','.join(full['correct'])
    if full['format'] == 'numeric':
        right = str(full['correct'])
    res = ok(client.post('/api/tracks/ai/answer', json={'question_id': q['id'], 'answer': right}))
    assert res['correct'] is True
    o = ok(client.get('/api/tracks/ai'))
    assert o['knowledge'] > 0 and o['track']['title'] == 'AI Engineering'
    summary = ok(client.get('/api/tracks'))
    assert {t['id'] for t in summary} == {'fundamentals', 'ai', 'experience', 'practical'}


def test_recall_without_model_is_saved_and_self_checked(client):
    ok(client.get('/api/tracks/fundamentals/lessons/java-concurrency'))
    lesson = courses.lessons('fundamentals')['java-concurrency']
    block = next(b for b in lesson['blocks'] if b['type'] == 'recall')
    res = ok(client.post('/api/tracks/fundamentals/lessons/java-concurrency/recall',
                         json={'block': block['key'], 'text': 'volatile gives visibility only'}))
    assert res['grade'] is None and res['message']
    assert any(r['kind'] == 'recall' for r in client.store.list_track_records('fundamentals'))


def test_experience_story_drill_and_dive(client):
    story = ok(client.post('/api/tracks/experience/stories', json={
        'title': 'ZooKeeper upgrade', 'competencies': ['ownership', 'technical'], 'situation': 'x'}))
    updated = ok(client.put(f'/api/tracks/experience/stories/{story["id"]}', json={
        'title': 'ZooKeeper upgrade', 'competencies': ['ownership'], 'result': 'zero downtime',
        'revision': story['revision']}))
    assert updated['result'] == 'zero downtime' and updated['created_at'] == story['created_at']
    nxt = ok(client.post('/api/tracks/experience/drill/next', json={'exclude': []}))
    assert story['id'] in nxt['stories']
    drill = ok(client.post('/api/tracks/experience/drills', json={
        'prompt_id': nxt['prompt']['id'], 'story_id': story['id'], 'seconds': 130,
        'checks': {k: True for k, _ in STAR_CHECKS}}))
    assert drill['drill']['clean'] is True and drill['feedback'] is None
    dive = ok(client.post('/api/tracks/experience/dives/zk-quorum', json={'text': 'majority of 5 is 3'}))
    assert dive['grade'] is None and len(dive['points']) == 4
    marked = ok(client.post(f'/api/tracks/experience/dives/attempts/{dive["attempt"]["id"]}/self', json={'covered': 3}))
    assert marked['clean'] is True
    o = ok(client.get('/api/tracks/experience'))
    assert o['knowledge'] > 0 and o['stories'][0]['drills'] == 1
    assert next(c for c in o['coverage'] if c['id'] == 'ownership')['stories'] == [story['id']]
    draft = ok(client.post('/api/tracks/experience/draft', json={'excerpt': 'Upgraded the ZooKeeper platform'}))
    assert draft['draft']['situation'] == 'Upgraded the ZooKeeper platform'
    probes = ok(client.post('/api/tracks/experience/probes', json={'claim': 'Upgraded the ZooKeeper platform'}))
    assert probes['generated'] is False and len(probes['probes']) == 8
    ok(client.post(f'/api/tracks/experience/stories/{story["id"]}/archive'))
    assert ok(client.get('/api/tracks/experience'))['stories'] == []


def test_experience_rejects_unknown_ids(client):
    assert client.post('/api/tracks/experience/drills', json={'prompt_id': 'nope', 'seconds': 1, 'checks': {}}).status_code == 404
    assert client.post('/api/tracks/experience/stories', json={'title': 't', 'competencies': ['bogus']}).status_code == 422


def test_practical_attempt_submit_and_review_marking(client):
    ex = ok(client.get('/api/tracks/practical/exercises/retry-backoff'))
    assert ex['attempt'] is None and 'check_retry.py' not in ex['exercise']['starter']
    attempt = ok(client.post('/api/tracks/practical/exercises/retry-backoff/attempts'))
    again = ok(client.post('/api/tracks/practical/exercises/retry-backoff/attempts'))
    assert again['id'] == attempt['id']
    saved = ok(client.put(f'/api/tracks/practical/attempts/{attempt["id"]}', json={
        'files': {'retry.py': 'pass'}, 'revision': attempt['revision'], 'run': {'passed': 1, 'total': 4}}))
    assert saved['files']['retry.py'] == 'pass' and saved['runs'][0]['passed'] == 1
    assert client.put(f'/api/tracks/practical/attempts/{attempt["id"]}', json={
        'files': {'evil.py': ''}, 'revision': saved['revision']}).status_code == 422
    checks = ok(client.post(f'/api/tracks/practical/attempts/{attempt["id"]}/checks'))['checks']
    assert 'check_retry.py' in checks
    n = len(practical.EXERCISES['retry-backoff']['rubric'])
    done = ok(client.post(f'/api/tracks/practical/attempts/{attempt["id"]}/submit', json={
        'files': {}, 'revision': saved['revision'], 'tests': {'passed': 4, 'total': 4},
        'checks': {'passed': 6, 'total': 6}, 'rubric': [True] * n}))
    assert done['attempt']['clean'] is True and 'retry.py' in done['solution']

    review = ok(client.post('/api/tracks/practical/exercises/review-cache/attempts'))
    sub = ok(client.post(f'/api/tracks/practical/attempts/{review["id"]}/submit', json={
        'revision': review['revision'], 'review': 'The key ignores tenant.'}))
    assert sub['attempt']['needs_self_mark'] and len(sub['issues']) == 6
    marked = ok(client.post(f'/api/tracks/practical/attempts/{review["id"]}/found', json={'found': [0, 1, 2, 3, 4]}))
    assert marked['clean'] is True
    o = ok(client.get('/api/tracks/practical'))
    assert o['knowledge'] > 0


def test_ai_pair_round_logs_prompts_and_reviews_the_process(client):
    ex = ok(client.get('/api/tracks/practical/exercises/ai-pair-rooms'))
    assert ex['exercise']['pair'] and ex['chat'] == []
    attempt = ok(client.post('/api/tracks/practical/exercises/ai-pair-rooms/attempts'))
    url = f'/api/tracks/practical/attempts/{attempt["id"]}'
    run = ok(client.put(url, json={'files': {}, 'revision': attempt['revision'], 'run': {'passed': 1, 'total': 6}}))
    assert run['edits'] == [] and len(run['runs']) == 1
    logged = ok(client.post(url + '/assist', json={'message': 'In rooms.py, make overlaps() half-open both ways', 'logged': True}))
    assert logged == {'reply': None, 'logged': True, 'message': None}
    offline = ok(client.post(url + '/assist', json={'message': 'Why does free_slots offer taken slots?'}))
    assert offline['reply'] is None and 'own assistant' in offline['message']
    assert [m['role'] for m in ok(client.get('/api/tracks/practical/exercises/ai-pair-rooms'))['chat']] == ['user', 'user']
    edited = ok(client.put(url, json={'files': {'rooms.py': '# fixed'}, 'revision': run['revision']}))
    assert len(edited['edits']) == 1
    n = len(practical.EXERCISES['ai-pair-rooms']['rubric'])
    done = ok(client.post(url + '/submit', json={
        'files': {}, 'revision': edited['revision'], 'tests': {'passed': 6, 'total': 6},
        'checks': {'passed': 7, 'total': 7}, 'rubric': [True] * n, 'walkthrough': 'The bug was the inclusive overlap.'}))
    process = done['attempt']['process']
    assert [a['key'] for a in process['areas']] == ['approach', 'control', 'verification', 'communication']
    assert process['stats']['prompts'] == 2 and done['attempt']['process_review'] is None
    assert client.post(url + '/assist', json={'message': 'hello'}).status_code == 409
    other = ok(client.post('/api/tracks/practical/exercises/retry-backoff/attempts'))
    assert client.post(f'/api/tracks/practical/attempts/{other["id"]}/assist', json={'message': 'hi'}).status_code == 409
    o = ok(client.get('/api/tracks/ai'))
    assert o['rounds'][0]['exercises'][0]['id'] == 'ai-pair-rooms'


def test_revealing_the_solution_first_means_not_held(client):
    attempt = ok(client.post('/api/tracks/practical/exercises/log-stats/attempts'))
    ok(client.post(f'/api/tracks/practical/attempts/{attempt["id"]}/reveal'))
    current = client.store.get_track_record('practical', attempt['id'])
    n = len(practical.EXERCISES['log-stats']['rubric'])
    done = ok(client.post(f'/api/tracks/practical/attempts/{attempt["id"]}/submit', json={
        'revision': current['revision'], 'tests': {'passed': 4, 'total': 4},
        'checks': {'passed': 6, 'total': 6}, 'rubric': [True] * n}))
    assert done['attempt']['clean'] is False


# ---- Senpai ------------------------------------------------------------------------------

def test_senpai_rows_material_and_progress():
    from server.tracks import senpai as ts
    now = 200 * DAY
    qid = next(iter(courses.questions('fundamentals')))
    records = {'fundamentals': [answer(qid, False, now - 100)],
               'experience': [{'kind': 'drill', 'prompt_id': 'p-incident', 'clean': True, 'at': now - 50}]}
    rows = {r['id']: r for r in ts.capability_rows(records, now)}
    cat = courses.questions('fundamentals')[qid]['category']
    assert rows[f'track:fundamentals:{cat}']['status'] == 'needs_check'
    assert rows['track:experience:pressure']['status'] in ('developing', 'demonstrated')
    assert rows['track:ai:models']['status'] == 'untested' and rows['track:ai:models']['bucket'] == 'stack'
    m = ts.material(records, now)
    assert m['fundamentals']['mistakes'] == 1 and m['practical']['next']['id'] == 'lru-ttl-cache'
    assert m['experience']['gaps'] == 12
    lesson = {'kind': 'lesson', 'lesson_id': 'rag', 'checked_at': now + 5, 'at': now + 5}
    assert ts.done({'type': 'track', 'track': 'ai', 'view': 'lesson/rag'}, {'ai': [lesson]}, now)
    assert not ts.done({'type': 'track', 'track': 'ai', 'view': 'lesson/rag'}, {'ai': [lesson]}, now + 10)


def test_sessions_include_behavioural_and_stack_blocks():
    from server.senpai import policy, sessions
    from server.tracks import senpai as ts
    now = 200 * DAY
    plan = policy.default_plan({}, now)
    session = sessions.prepare(plan, now, '2026-10-30', [], {'reviews': [], 'new': []}, {'lessons': []}, set(),
                               budget=90, tracks=ts.material({}, now))
    kinds = {b['kind'] for b in session['blocks']}
    assert 'behavioural_answer' in kinds
    assert kinds & {'track_lesson', 'practical', 'track_quickfire'}
    assert session['outside'] == []
    block = next(b for b in session['blocks'] if b['kind'] == 'behavioural_answer')
    assert block['action'] == {'type': 'track', 'track': 'experience', 'view': 'drill'}
