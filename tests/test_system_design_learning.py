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


def right(qid):
    """The correct answer for any question format, as the client would send it."""
    correct = QUESTIONS[qid]['correct']
    return correct if isinstance(correct, str) else ','.join(correct) if isinstance(correct, list) else str(correct)


def fire(client, **filters):
    return post(client, '/quickfire/next', request_id=rid(), **filters)


def answer_fire(client, item, **fields):
    return post(client, '/quickfire/' + item['id'] + '/answer', question_id=item['question']['id'], **fields)


def test_course_has_complete_ordered_content_and_distinct_question_pools():
    assert len(CATEGORIES) == 10
    previous = None
    prompts = set()
    for key, lesson in LESSONS.items():
        assert lesson['prerequisite'] == previous
        assert len(lesson['quiz_ids']) >= 3 and len(lesson['quickfire_ids']) >= 3
        assert lesson['objectives'] and (lesson.get('blocks') or lesson.get('worked'))
        for qid in lesson['quiz_ids'] + lesson['quickfire_ids']:
            q = QUESTIONS[qid]
            assert q['lesson_id'] == key and not q.get('retired')
            assert q['prompt'] not in prompts
            prompts.add(q['prompt'])
            assert len({c['text'] for c in q['choices']}) == len(q['choices'])
            fmt = q.get('format', 'choice')
            ids = {c['id'] for c in q['choices']}
            if fmt == 'choice':
                assert q['correct'] in ids and len(ids) >= 3
            elif fmt in ('multi', 'order'):
                assert set(q['correct']) <= ids
            else:
                assert q['correct'] > 0 and not ids
            assert q['explanation']
        previous = key
    assert {l['category'] for l in LESSONS.values()} <= {c[0] for c in CATEGORIES}


def test_every_linked_case_exists():
    from server.system_design_content import CASES
    assert all(l['case_id'] in CASES for l in LESSONS.values() if l.get('case_id'))
    assert all(set(c['skills']) <= set(sd.SKILLS) for c in CASES.values())


def test_rewritten_lessons_retire_but_keep_v1_questions():
    rich = [k for k, l in LESSONS.items() if l.get('blocks')]
    assert 'cache-aside' in rich
    retired = [q for q in QUESTIONS.values() if q.get('retired')]
    assert retired and all(q['lesson_id'] in rich and q['version'] == 1 for q in retired)


def test_judge_grades_every_format():
    choice = {'choices': [{'id': 'c0', 'text': 'a'}, {'id': 'c1', 'text': 'b'}], 'correct': 'c1'}
    assert learning.judge(choice, 'c1')[0] and not learning.judge(choice, 'c0')[0]
    multi = {**choice, 'format': 'multi', 'correct': ['c0', 'c1']}
    assert learning.judge(multi, 'c1,c0')[0] and not learning.judge(multi, 'c0')[0]
    order = {**choice, 'format': 'order', 'correct': ['c1', 'c0']}
    assert learning.judge(order, 'c1,c0')[0] and not learning.judge(order, 'c0,c1')[0]
    numeric = {'format': 'numeric', 'choices': [], 'correct': 95.0, 'tolerance': 0.01, 'unit': '%'}
    assert learning.judge(numeric, '95.5')[0] and not learning.judge(numeric, '90')[0]
    assert learning.judge(numeric, None)[1]['text'] == '95 %'
    for contract, bad in ((choice, 'c9'), (multi, 'c0,c0'), (order, 'c0'), (numeric, 'lots')):
        with pytest.raises(Exception):
            learning.judge(contract, bad)


def test_lesson_parser_rejects_broken_content():
    from server import system_design_lessons as rich
    good = open(rich.HERE + '/cache-aside.md', encoding='utf-8').read()
    assert rich.parse(good, 'x')['interactive'] > 5
    with pytest.raises(rich.LessonError):
        rich.parse(good.replace('answer: 3\n  explain', 'answer: 30\n  explain'), 'x')
    with pytest.raises(rich.LessonError):
        rich.parse(good.replace('```questions', '```nothing'), 'x')


def test_unsure_correct_answers_count_as_guesses_and_activities_record(client, monkeypatch):
    post(client, '/course/lessons/cache-aside/open')
    quiz = post(client, '/course/quizzes', request_id=rid(), lesson_id='cache-aside')
    q = quiz['questions'][0]
    contract = QUESTIONS[q['id']]
    answer = right(q['id'])
    saved = post(client, '/course/quizzes/' + quiz['id'] + '/answer', question_id=q['id'], answer=answer, confidence='unsure')
    assert saved['answers'][q['id']]['correct'] and saved['answers'][q['id']]['guessed']
    assert 'whys' not in q and 'whys' in saved['answers'][q['id']]
    block = next(b['key'] for b in LESSONS['cache-aside']['blocks'] if b['type'] == 'predict')
    state = post(client, '/course/lessons/cache-aside/activity', block=block, correct=True)
    state = post(client, '/course/lessons/cache-aside/activity', block=block, correct=False)
    assert state['activities'][block]['first_correct'] is True and state['activities'][block]['attempts'] == 2
    lesson = next(l for l in client.get('/api/system-design').json()['course']['lessons'] if l['id'] == 'cache-aside')
    assert lesson['activities_done'] == 1 and lesson['check_count'] == 4
    assert client.post('/api/system-design/course/lessons/cache-aside/activity', json={'block': 'b999'}).status_code == 404


def test_recall_is_saved_without_a_model(client, monkeypatch):
    monkeypatch.setattr(learning.coach.llm, 'enabled', lambda settings=None: False)
    post(client, '/course/lessons/cache-aside/open')
    block = next(b for b in LESSONS['cache-aside']['blocks'] if b['type'] == 'recall')
    result = post(client, '/course/lessons/cache-aside/recall', block=block['key'], text='Cache-aside reads the cache first.')
    assert result['grade'] is None and result['points'] == block['points'] and result['message']
    assert client.store.get_design_record(result['id'])['text'].startswith('Cache-aside')


def test_retired_questions_leave_practice_and_review(client):
    old = 'cache-aside-fire-1-v1'
    assert QUESTIONS[old]['retired']
    for _ in range(12):
        item = fire(client, lesson_id='cache-aside')
        assert not item['question']['id'].endswith('-v1')
    records = [{'kind': 'quickfire', 'id': 'f1', 'question_id': old, 'lesson_id': 'cache-aside',
                'result': {'correct': False, 'revealed': False, 'answered_at': 0}}]
    summary = learning.course_summary(records, now=10 ** 9)
    lesson = next(l for l in summary['lessons'] if l['id'] == 'cache-aside')
    assert lesson['due'] == 0 and lesson['mistakes'] == 0 and len(summary['history']) == 1


def test_empty_course_has_no_invented_mastery(client):
    data = client.get('/api/system-design').json()
    assert data['profile']['level'] == 'foundation'
    assert data['course']['totals']['completed'] == 0
    assert data['course']['next_lesson'] == 'request-flow'
    assert all(l['accuracy'] is None and l['calibration'] == 'not_assessed' for l in data['course']['lessons'])


def test_lesson_reading_does_not_imply_quiz_success(client):
    data = post(client, '/course/lessons/request-flow/open')
    assert len(data['lesson']['questions']) == len(LESSONS['request-flow']['quiz_ids'])
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
        saved = post(client, path, question_id=q['id'], answer=right(q['id']), reveal=i == 0)
        repeated = post(client, path, question_id=q['id'], answer=right(q['id']))
        assert repeated == saved
    summary = client.get('/api/system-design').json()['course']
    assert summary['totals']['completed'] == 1 and summary['totals']['passed'] == 0
    n = len(quiz['questions'])
    assert summary['totals']['quiz_answers'] == n and summary['totals']['quickfire_attempts'] == 0
    assert summary['lessons'][0]['latest_score'] == n - 1
    assert summary['lessons'][0]['needs_review']
    assert all(a['assisted'] for a in saved['answers'].values())
    new_quiz = post(client, '/course/quizzes', request_id=rid(), lesson_id='request-flow')
    for q in new_quiz['questions']:
        post(client, '/course/quizzes/' + new_quiz['id'] + '/answer', question_id=q['id'], answer=right(q['id']))
    summary = client.get('/api/system-design').json()['course']
    assert summary['totals']['completed'] == 1 and summary['totals']['passed'] == 1
    assert summary['lessons'][0]['latest_score'] == summary['lessons'][0]['best_score'] == n
    assert not summary['lessons'][0]['needs_review']
    assert summary['lessons'][0]['mistakes'] == 0
    assert len(summary['history']) == 2 * n


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
    saved = answer_fire(client, item, answer=right(q['id']), elapsed_sec=9)
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
    correct = right(item['question']['id'])
    answer_fire(client, item, answer=correct)
    post(client, '/quickfire/' + item['id'] + '/guess')
    summary = client.get('/api/system-design').json()['course']
    assert summary['totals']['independent_correct'] == 0
    post(client, '/course/lessons/indexes/open')
    next_item = fire(client, lesson_id='indexes', recent=[item['question']['id']])
    saved = answer_fire(client, next_item, answer=right(next_item['question']['id']))
    assert saved['result']['assisted']
    summary = client.get('/api/system-design').json()['course']
    assert summary['totals']['supported_attempts'] == 1
    assert summary['totals']['independent_attempts'] == 1


def test_reveal_cannot_be_guessed_or_rewritten(client):
    item = fire(client)
    saved = answer_fire(client, item, reveal=True)
    assert not saved['result']['correct']
    assert client.post('/api/system-design/quickfire/' + item['id'] + '/guess', json={}).status_code == 422
    assert answer_fire(client, item, answer=right(item['question']['id'])) == saved


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
    original, answer = deepcopy(QUESTIONS[qid]), right(qid)
    monkeypatch.setitem(QUESTIONS, qid, {**original, 'correct': 'changed', 'prompt': 'Changed later'})
    restored = client.get('/api/system-design/quickfire/' + item['id']).json()
    assert restored['question'] == item['question']
    saved = answer_fire(client, item, answer=answer)
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
    a = {'id': '1', 'kind': 'quickfire', 'question_id': 'indexes-fire-1-v2', 'lesson_id': 'indexes',
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
    post(client, '/course/quizzes/' + quiz['id'] + '/answer', question_id=q['id'], answer=right(q['id']))
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
    post(client, '/course/quizzes/' + quiz['id'] + '/answer', question_id=q['id'], answer=right(q['id']))
    now = learning.time.time()
    monkeypatch.setattr(learning.time, 'time', lambda: now + 2*learning.DAY)
    item = fire(client, lesson_id='indexes')
    assert item['question']['id'] == q['id'].replace('-check-', '-fire-')
    answer_fire(client, item, answer=right(item['question']['id']))
    lesson = next(l for l in client.get('/api/system-design').json()['course']['lessons'] if l['id'] == 'indexes')
    assert lesson['due'] == 0
    assert lesson['objective_progress'][0]['status'] == 'passed'


def test_revealed_quickfire_repeats_are_supported(client):
    first = fire(client, lesson_id='indexes', difficulty='beginner')
    answer_fire(client, first, reveal=True)
    again = fire(client, lesson_id='indexes', difficulty='beginner')
    saved = answer_fire(client, again, answer=right(again['question']['id']))
    assert saved['result']['assisted']
    assert client.get('/api/system-design').json()['course']['totals']['independent_correct'] == 0


def test_supported_correct_answers_are_not_mistakes(client):
    post(client, '/course/lessons/indexes/open')
    item = fire(client, lesson_id='indexes')
    result = answer_fire(client, item, answer=right(item['question']['id']))
    assert result['result']['assisted']
    assert fire(client, mode='mistakes')['empty']
    lesson = next(l for l in client.get('/api/system-design').json()['course']['lessons'] if l['id'] == 'indexes')
    assert lesson['mistakes'] == 0 and not lesson['needs_review']
