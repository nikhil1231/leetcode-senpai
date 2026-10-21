"""Curriculum and Quickfire contracts; no live Firestore or model calls."""
from copy import deepcopy
import uuid

import pytest
from fastapi.testclient import TestClient
from server import auth, main, system_design as sd, system_design_learning as learning
from server.system_design_curriculum import LESSONS, QUESTIONS, CATEGORIES
from tests.fake_store import FakeStore


def rid():
    return uuid.uuid4().hex


@pytest.fixture
def client(monkeypatch):
    stores = {name: FakeStore(name) for name in ('alice', 'bob')}
    monkeypatch.setattr(sd, 'get_store', lambda uid: stores[uid])
    monkeypatch.setattr(learning, 'get_store', lambda uid: stores[uid])
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    c = TestClient(main.app)
    c.store = stores['alice']
    yield c
    main.app.dependency_overrides.clear()


def post(client, path, **body):
    response = client.post('/api/system-design' + path, json=body)
    assert response.status_code == 200, response.text
    return response.json()


def fire(client, **filters):
    return post(client, '/quickfire/next', request_id=rid(), **filters)


def answer_fire(client, item, **fields):
    return post(client, '/quickfire/' + item['id'] + '/answer', question_id=item['question']['id'], **fields)


def test_course_has_complete_ordered_content_and_distinct_question_pools():
    assert len(LESSONS) == 32 and len(QUESTIONS) == 192 and len(CATEGORIES) == 8
    previous = None
    prompts = set()
    for key, lesson in LESSONS.items():
        assert lesson['prerequisite'] == previous
        assert len(lesson['quiz_ids']) == len(lesson['quickfire_ids']) == 3
        assert lesson['objectives'] and lesson['worked'] and lesson['tradeoff'] and lesson['mistake']
        for qid in lesson['quiz_ids'] + lesson['quickfire_ids']:
            q = QUESTIONS[qid]
            assert q['lesson_id'] == key
            assert q['prompt'] not in prompts
            prompts.add(q['prompt'])
            assert len({c['text'] for c in q['choices']}) == len(q['choices']) == 3
            assert q['correct'] in {c['id'] for c in q['choices']}
            assert q['explanation']
        previous = key
    assert all(sum(l['category'] == c[0] for l in LESSONS.values()) == 4 for c in CATEGORIES)


def test_empty_course_has_no_invented_mastery(client):
    data = client.get('/api/system-design').json()
    assert data['profile']['level'] == 'foundation'
    assert data['course']['totals']['completed'] == 0
    assert data['course']['next_lesson'] == 'request-flow'
    assert all(l['accuracy'] is None and l['calibration'] == 'not_assessed' for l in data['course']['lessons'])


def test_lesson_reading_does_not_imply_quiz_success(client):
    data = post(client, '/course/lessons/request-flow/open')
    assert len(data['lesson']['questions']) == 3
    assert all('correct' not in q and 'explanation' not in q for q in data['lesson']['questions'])
    post(client, '/course/lessons/request-flow/read')
    lesson = client.get('/api/system-design').json()['course']['lessons'][0]
    assert lesson['read'] and not lesson['passed'] and not lesson['completed']


def test_quiz_records_each_attempt_and_retries_cannot_rewrite_results(client):
    post(client, '/course/lessons/request-flow/open')
    post(client, '/course/lessons/request-flow/read')
    body = {'request_id': rid(), 'lesson_id': 'request-flow'}
    quiz = post(client, '/course/quizzes', **body)
    assert 'contracts' not in quiz
    assert post(client, '/course/quizzes', **body)['id'] == quiz['id']
    for i, q in enumerate(quiz['questions']):
        path = '/course/quizzes/' + quiz['id'] + '/answer'
        saved = post(client, path, question_id=q['id'], answer=QUESTIONS[q['id']]['correct'], reveal=i == 0)
        repeated = post(client, path, question_id=q['id'], answer=QUESTIONS[q['id']]['correct'])
        assert repeated == saved
    summary = client.get('/api/system-design').json()['course']
    assert summary['totals']['completed'] == 1 and summary['totals']['passed'] == 0
    assert summary['totals']['quiz_answers'] == 3 and summary['totals']['quickfire_attempts'] == 0
    assert summary['lessons'][0]['latest_score'] == 2
    assert summary['lessons'][0]['needs_review']
    assert all(a['assisted'] for a in saved['answers'].values())
    new_quiz = post(client, '/course/quizzes', request_id=rid(), lesson_id='request-flow')
    for q in new_quiz['questions']:
        post(client, '/course/quizzes/' + new_quiz['id'] + '/answer', question_id=q['id'], answer=QUESTIONS[q['id']]['correct'])
    summary = client.get('/api/system-design').json()['course']
    assert summary['totals']['completed'] == 1 and summary['totals']['passed'] == 1
    assert summary['lessons'][0]['latest_score'] == summary['lessons'][0]['best_score'] == 3
    assert not summary['lessons'][0]['needs_review']
    assert summary['lessons'][0]['mistakes'] == 0
    assert len(summary['history']) == 6


def test_quiz_rejects_a_foreign_question_and_reused_request(client):
    request = rid()
    quiz = post(client, '/course/quizzes', request_id=request, lesson_id='request-flow')
    assert client.post('/api/system-design/course/quizzes', json={'request_id': request, 'lesson_id': 'guarantees'}).status_code == 409
    assert client.post('/api/system-design/course/quizzes/' + quiz['id'] + '/answer', json={'question_id': 'not-this-quiz', 'answer': 'c0'}).status_code == 422


def test_quickfire_filters_answer_safety_and_idempotency(client):
    request = rid()
    item = post(client, '/quickfire/next', request_id=request, lesson_id='indexes', difficulty='beginner')
    q = item['question']
    assert q['lesson_id'] == 'indexes' and q['difficulty'] == 'beginner'
    assert 'correct' not in q and 'explanation' not in q
    assert post(client, '/quickfire/next', request_id=request, lesson_id='indexes', difficulty='beginner') == item
    assert client.post('/api/system-design/quickfire/next', json={'request_id': request}).status_code == 409
    saved = answer_fire(client, item, answer=QUESTIONS[q['id']]['correct'], elapsed_sec=9)
    assert saved['result']['correct'] and not saved['result']['assisted']
    assert answer_fire(client, item, reveal=True) == saved
    assert client.get('/api/system-design/quickfire/' + item['id']).json() == saved
    summary = client.get('/api/system-design').json()['course']
    assert summary['totals']['quickfire_attempts'] == 1
    assert summary['totals']['independent_correct'] == 1
    assert not client.store.reviews and not client.store.attempts


def test_no_immediate_repeat_when_narrow_topic_has_alternatives(client):
    first = fire(client, lesson_id='indexes')
    second = fire(client, lesson_id='indexes', recent=[first['question']['id']])
    assert first['question']['id'] != second['question']['id']


def test_supported_work_and_guesses_are_not_independent_success(client):
    item = fire(client, lesson_id='indexes')
    correct = QUESTIONS[item['question']['id']]['correct']
    answer_fire(client, item, answer=correct)
    post(client, '/quickfire/' + item['id'] + '/guess')
    summary = client.get('/api/system-design').json()['course']
    assert summary['totals']['independent_correct'] == 0
    post(client, '/course/lessons/indexes/open')
    next_item = fire(client, lesson_id='indexes', recent=[item['question']['id']])
    saved = answer_fire(client, next_item, answer=QUESTIONS[next_item['question']['id']]['correct'])
    assert saved['result']['assisted']
    summary = client.get('/api/system-design').json()['course']
    assert summary['totals']['supported_attempts'] == 1
    assert summary['totals']['independent_attempts'] == 1


def test_reveal_cannot_be_guessed_or_rewritten(client):
    item = fire(client)
    saved = answer_fire(client, item, reveal=True)
    assert not saved['result']['correct']
    assert client.post('/api/system-design/quickfire/' + item['id'] + '/guess', json={}).status_code == 422
    assert answer_fire(client, item, answer=QUESTIONS[item['question']['id']]['correct']) == saved


def test_mistakes_and_learned_modes_have_explicit_empty_states(client):
    assert fire(client, mode='mistakes')['empty']
    assert fire(client, mode='learned')['empty']
    post(client, '/course/lessons/guarantees/open')
    post(client, '/course/lessons/guarantees/read')
    item = fire(client, mode='learned')
    assert item['question']['lesson_id'] == 'guarantees'
    answer_fire(client, item, reveal=True)
    assert fire(client, mode='mistakes')['question']['id'] == item['question']['id']


def test_saved_contract_survives_content_changes(client, monkeypatch):
    item = fire(client)
    qid = item['question']['id']
    original = deepcopy(QUESTIONS[qid])
    monkeypatch.setitem(QUESTIONS, qid, {**original, 'correct': 'changed', 'prompt': 'Changed later'})
    restored = client.get('/api/system-design/quickfire/' + item['id']).json()
    assert restored['question'] == item['question']
    saved = answer_fire(client, item, answer=original['correct'])
    assert saved['result']['correct'] and saved['result']['explanation'] == original['explanation']


def test_course_work_marks_later_related_design_supported(client):
    post(client, '/course/lessons/retry-identity/open')
    session = post(client, '/sessions', request_id=rid(), case_id='jobs', mode='interview')
    assert session['assisted']


def test_account_boundaries_and_invalid_inputs(client):
    quiz = post(client, '/course/quizzes', request_id=rid(), lesson_id='indexes')
    item = fire(client)
    main.app.dependency_overrides[auth.require_user] = lambda: 'bob'
    for path in ('/course/quizzes/' + quiz['id'], '/quickfire/' + item['id']):
        assert client.get('/api/system-design' + path).status_code == 404
    assert client.post('/api/system-design/quickfire/' + item['id'] + '/guess', json={}).status_code == 404
    assert client.post('/api/system-design/quickfire/next', json={'request_id': rid(), 'category': 'unknown'}).status_code == 422
    assert client.post('/api/system-design/course/lessons/unknown/open', json={}).status_code == 404


def test_repeat_answers_do_not_inflate_independent_accuracy_or_reviews():
    a = {'id': '1', 'kind': 'quickfire', 'question_id': 'indexes-fire-1-v1', 'lesson_id': 'indexes',
         'result': {'answered_at': 100, 'correct': True, 'assisted': False}}
    b = {**deepcopy(a), 'id': '2'}
    b['result']['answered_at'] = 105
    first = learning.course_summary([a], now=200)
    repeated = learning.course_summary([a, b], now=200)
    assert repeated['totals']['independent_attempts'] == first['totals']['independent_attempts'] == 1
    assert repeated['reviews'] == first['reviews']
    b['result']['guessed'] = True
    b['result']['answered_at'] = 100 + 4*learning.DAY
    review = learning.course_summary([a, b], now=100+6*learning.DAY)['reviews'][0]
    assert review['interval'] == 1


def test_daily_coach_records_learning_once_without_answer_text(client):
    from server.senpai.daily import collect_activity
    post(client, '/course/lessons/indexes/open')
    quiz = post(client, '/course/quizzes', request_id=rid(), lesson_id='indexes')
    q = quiz['questions'][0]
    post(client, '/course/quizzes/' + quiz['id'] + '/answer', question_id=q['id'], answer=QUESTIONS[q['id']]['correct'])
    import datetime as dt
    day = dt.datetime.now(dt.timezone.utc).date().isoformat()
    data = collect_activity(client.store, day, 'UTC')
    checks = [e for e in data['evidence'] if e['id'].startswith('design-learning:')]
    assert len(checks) == 1
    assert 'answer' not in checks[0] and 'explanation' not in checks[0]


def test_lesson_checks_schedule_separate_application_questions(client, monkeypatch):
    post(client, '/course/lessons/indexes/open')
    quiz = post(client, '/course/quizzes', request_id=rid(), lesson_id='indexes')
    q = quiz['questions'][0]
    post(client, '/course/quizzes/' + quiz['id'] + '/answer', question_id=q['id'], answer=QUESTIONS[q['id']]['correct'])
    now = learning.time.time()
    monkeypatch.setattr(learning.time, 'time', lambda: now + 2*learning.DAY)
    item = fire(client, lesson_id='indexes')
    assert item['question']['id'] == q['id'].replace('-check-', '-fire-')
    answer_fire(client, item, answer=QUESTIONS[item['question']['id']]['correct'])
    lesson = next(l for l in client.get('/api/system-design').json()['course']['lessons'] if l['id'] == 'indexes')
    assert lesson['due'] == 0
    assert lesson['objective_progress'][0]['status'] == 'passed'


def test_revealed_quickfire_repeats_are_supported(client):
    first = fire(client, lesson_id='indexes', difficulty='beginner')
    answer_fire(client, first, reveal=True)
    again = fire(client, lesson_id='indexes', difficulty='beginner')
    saved = answer_fire(client, again, answer=QUESTIONS[again['question']['id']]['correct'])
    assert saved['result']['assisted']
    assert client.get('/api/system-design').json()['course']['totals']['independent_correct'] == 0


def test_supported_correct_answers_are_not_mistakes(client):
    post(client, '/course/lessons/indexes/open')
    item = fire(client, lesson_id='indexes')
    result = answer_fire(client, item, answer=QUESTIONS[item['question']['id']]['correct'])
    assert result['result']['assisted']
    assert fire(client, mode='mistakes')['empty']
    lesson = next(l for l in client.get('/api/system-design').json()['course']['lessons'] if l['id'] == 'indexes')
    assert lesson['mistakes'] == 0 and not lesson['needs_review']
