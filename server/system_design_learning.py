"""Recorded curriculum checks and adaptive, deterministic-grading Quickfire."""
from copy import deepcopy
import secrets
import time
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth, system_design_coach as coach, system_design_variants as variants
from .store import get_store
from .system_design_curriculum import (CATEGORIES, LESSONS, QUESTIONS, VERSION,
                                        LEGACY_LESSONS, public_lesson, public_question)

router = APIRouter(prefix='/api/system-design', tags=['system-design-learning'])
DAY = 86400


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


def put(store, key, doc, revision=None):
    try:
        return store.put_design_record(key, doc, revision)
    except ValueError as exc:
        raise HTTPException(409, 'This learning record changed. Reload to recover the saved result.') from exc


def read(store, key, kind):
    doc = store.get_design_record(key)
    if not doc or doc.get('kind') != kind:
        raise HTTPException(404, 'Learning record not found')
    return doc


class StartQuiz(BaseModel):
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    lesson_id: str


class Answer(BaseModel):
    question_id: str
    # One choice ID, comma-separated IDs (multi/order) or a number (numeric).
    answer: str = Field(default='', max_length=400)
    reveal: bool = False
    guessed: bool = False
    confidence: Literal['', 'sure', 'unsure'] = ''
    elapsed_sec: int = Field(default=0, ge=0, le=86400)


class Activity(BaseModel):
    block: str = Field(pattern=r'^b\d{1,3}$')
    correct: bool | None = None


class Recall(BaseModel):
    block: str = Field(pattern=r'^b\d{1,3}$')
    text: str = Field(min_length=1, max_length=3000)


class NextQuestion(BaseModel):
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    category: str = ''
    lesson_id: str = ''
    difficulty: Literal['mixed', 'beginner', 'standard'] = 'mixed'
    mode: Literal['adaptive', 'mistakes', 'learned', 'placement'] = 'adaptive'  # placement: one question per untested lesson
    question_id: str = ''  # one specific question, e.g. a callback inside a later lesson
    recent: list[str] = Field(default_factory=list, max_length=100)


def rows(records):
    """One event per answer. Quiz containers are never additional practice events."""
    out = []
    for r in records:
        if r.get('kind') == 'quiz':
            for qid, a in r.get('answers', {}).items():
                out.append({**a, 'id': r['id'] + ':' + qid, 'question_id': qid,
                            'lesson_id': r['lesson_id'], 'source': 'quiz'})
        elif r.get('kind') == 'quickfire' and r.get('result'):
            out.append({**r['result'], 'id': r['id'], 'question_id': r['question_id'],
                        'lesson_id': r['lesson_id'], 'source': 'quickfire'})
    return sorted(out, key=lambda a: (a['answered_at'], a['id']))


def active(qid):
    q = QUESTIONS.get(qid.replace('-check-', '-fire-'))
    return bool(q) and not q.get('retired')


def clean(a):
    return a.get('correct') and not any(a.get(k) for k in ('assisted', 'revealed', 'guessed'))


def needs_repair(a):
    return not a.get('correct') or bool(a.get('revealed') or a.get('guessed'))


def schedules(answers):
    result = {}
    for a in answers:
        # A supported lesson check schedules its separate application question.
        qid, at = a['question_id'].replace('-check-', '-fire-'), a['answered_at']
        old = result.get(qid)
        if old and at - old['last_at'] < DAY:
            if not clean(a):
                old['due_at'] = min(old['due_at'], at + DAY)
            continue
        interval = min(21, old['interval'] * 3 if old else 3) if clean(a) else 1
        result[qid] = {'question_id': qid, 'lesson_id': a['lesson_id'], 'last_at': at,
                       'interval': interval, 'due_at': at + interval * DAY}
    return result


def course_summary(records, now=None):
    now = int(time.time()) if now is None else now
    answers = rows(records)
    # Retired v1 questions stay in history but no longer ask for review.
    review = {k: v for k, v in schedules(answers).items() if active(k)}
    states = {r['lesson_id']: r for r in records if r.get('kind') == 'course_lesson'}
    for r in records:
        if r.get('kind') == 'exposure' and r.get('skill') in LEGACY_LESSONS:
            states.setdefault(LEGACY_LESSONS[r['skill']], {'opened_at': r.get('at')})
    lessons = []
    for key, item in LESSONS.items():
        state = states.get(key, {})
        quizzes = [r for r in records if r.get('kind') == 'quiz' and r.get('lesson_id') == key]
        complete = sorted((r for r in quizzes if r.get('completed_at')), key=lambda r: (r['completed_at'], r['created_at']))
        topic_answers = [a for a in answers if a['lesson_id'] == key]
        fires = [a for a in topic_answers if a['source'] == 'quickfire']
        # Count first independent response to a question per UTC day for calibration.
        independent, seen = [], set()
        for a in fires:
            signature = (a['question_id'], int(a['answered_at']) // DAY)
            if a.get('assisted') or a.get('revealed') or signature in seen:
                continue
            seen.add(signature)
            independent.append(a)
        recent = independent[-5:]
        last_by_question = {}
        for a in topic_answers:
            last_by_question[a['question_id']] = a
        mistakes = sum(needs_repair(a) for k, a in last_by_question.items() if active(k))
        due = sum(v['lesson_id'] == key and v['due_at'] <= now for v in review.values())
        passed = any(all(a['correct'] and not a['revealed'] for a in r['answers'].values()) for r in complete)
        latest_score = sum(a['correct'] and not a['revealed'] for a in complete[-1]['answers'].values()) if complete else None
        latest_total = len(complete[-1]['answers']) if complete else None
        activities = state.get('activities', {})
        done = bool(state.get('read_at') and complete)
        calibration = ('not_assessed' if not independent else 'more_practice'
                       if len(recent) < 3 else 'needs_work'
                       if sum(clean(a) for a in recent) / len(recent) < .7 else 'developing_strength')
        objective_progress = []
        for title, qid in zip(item['objectives'], item['quiz_ids']):
            last = last_by_question.get(qid)
            objective_progress.append({'title': title, 'status': 'not_checked' if not last else
                                       'passed' if last['correct'] and not last['revealed'] else 'review'})
        lessons.append({k: item[k] for k in ('id', 'category', 'skill', 'title', 'minutes', 'objectives', 'prerequisite', 'case_id')} | {
            'check_count': len(item['quiz_ids']), 'latest_total': latest_total,
            'activities_total': item.get('interactive', 0),
            'activities_done': sum(1 for a in activities.values() if a.get('done')),
            'objective_progress': objective_progress, 'opened': bool(state.get('opened_at')), 'read': bool(state.get('read_at')),
            'completed': done, 'passed': passed, 'quiz_attempts': len(quizzes),
            'latest_score': latest_score, 'best_score': max((sum(a['correct'] and not a['revealed'] for a in r['answers'].values()) for r in complete), default=None),
            'status': 'completed' if done else 'in_progress' if state or quizzes else 'not_started',
            'needs_review': bool(due or mistakes), 'mistakes': mistakes, 'due': due,
            'quickfire_attempts': len(fires), 'independent_attempts': len(independent),
            'independent_correct': sum(clean(a) for a in independent),
            'supported_attempts': sum(bool(a.get('assisted') or a.get('revealed')) for a in fires),
            'accuracy': round(100 * sum(clean(a) for a in independent) / len(independent)) if independent else None,
            'calibration': calibration,
        })
    categories = []
    for key, title, description in CATEGORIES:
        subset = [l for l in lessons if l['category'] == key]
        categories.append({'id': key, 'title': title, 'description': description,
                           'total': len(subset), 'completed': sum(l['completed'] for l in subset),
                           'needs_review': sum(l['needs_review'] for l in subset), 'lessons': subset})
    next_lesson = next((l for l in lessons if not l['completed']), None)
    fire_answers = [a for a in answers if a['source'] == 'quickfire']
    return {'categories': categories, 'lessons': lessons, 'next_lesson': next_lesson['id'] if next_lesson else None,
            'totals': {'lessons': len(lessons), 'completed': sum(l['completed'] for l in lessons),
                       'passed': sum(l['passed'] for l in lessons), 'due': sum(l['due'] for l in lessons),
                       'quickfire_questions': sum(q['kind'] == 'quickfire' and not q.get('retired') for q in QUESTIONS.values()),
                       'quickfire_attempts': len(fire_answers),
                       'independent_attempts': sum(l['independent_attempts'] for l in lessons),
                       'independent_correct': sum(l['independent_correct'] for l in lessons),
                       'supported_attempts': sum(l['supported_attempts'] for l in lessons),
                       'quiz_answers': sum(a['source'] == 'quiz' for a in answers),
                       'quiz_correct': sum(a['source'] == 'quiz' and a['correct'] for a in answers)},
            'history': list(reversed(answers))[:100], 'reviews': list(review.values())}


@router.post('/course/lessons/{key}/open')
def open_lesson(key: str, store=Depends(store_for)):
    key = LEGACY_LESSONS.get(key, key)
    if key not in LESSONS:
        raise HTTPException(404, 'Unknown lesson')
    now = int(time.time())
    old = store.get_design_record('course_' + key)
    state = put(store, 'course_' + key, {**(old or {}), 'kind': 'course_lesson', 'lesson_id': key,
                 'skill': LESSONS[key]['skill'], 'opened_at': (old or {}).get('opened_at', now),
                 'at': now}, old['revision'] if old else None)
    return {'lesson': public_lesson(key), 'state': state}


@router.post('/course/lessons/{key}/read')
def mark_read(key: str, store=Depends(store_for)):
    state = read(store, 'course_' + key, 'course_lesson')
    if state.get('read_at'):
        return state
    return put(store, state['id'], {**state, 'read_at': int(time.time())}, state['revision'])


def lesson_block(key, block, kind=None):
    if key not in LESSONS:
        raise HTTPException(404, 'Unknown lesson')
    found = next((b for b in LESSONS[key].get('blocks', []) if b.get('key') == block), None)
    if not found or (kind and found['type'] != kind):
        raise HTTPException(404, 'Unknown activity')
    return found


@router.post('/course/lessons/{key}/activity')
def record_activity(key: str, body: Activity, store=Depends(store_for)):
    """In-lesson exercises are supported learning: recorded for progress, never scheduled."""
    lesson_block(key, body.block)
    for _ in range(3):
        state = read(store, 'course_' + key, 'course_lesson')
        activities = dict(state.get('activities', {}))
        old = activities.get(body.block, {})
        activities[body.block] = {'done': True, 'first_correct': old.get('first_correct', body.correct),
                                  'attempts': old.get('attempts', 0) + 1, 'at': int(time.time())}
        try:
            return put(store, state['id'], {**state, 'activities': activities}, state['revision'])
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
    raise HTTPException(409, 'Reload to recover the saved lesson')


@router.post('/course/lessons/{key}/recall')
async def grade_recall(key: str, body: Recall, store=Depends(store_for)):
    """Free recall is saved first; model feedback is optional and derived."""
    block = lesson_block(key, body.block, 'recall')
    now = time.time()
    doc = put(store, 'recall_' + secrets.token_hex(16), {'kind': 'recall', 'lesson_id': key, 'block': body.block,
                                                         'text': body.text, 'created_at': now})
    grade_result, message = await coach.grade_recall(block, body.text, store.get_settings())
    if grade_result:
        doc = put(store, doc['id'], {**doc, 'grade': grade_result}, doc['revision'])
    return {'id': doc['id'], 'grade': grade_result, 'message': message, 'points': block['points'],
            'model': block['model']}


def quiz_public(doc):
    result = {k: deepcopy(v) for k, v in doc.items() if k != 'contracts'}
    result['questions'] = [public_contract(doc['contracts'][k]) for k in doc['question_ids']]
    return result


@router.post('/course/quizzes')
def start_quiz(body: StartQuiz, store=Depends(store_for)):
    if body.lesson_id not in LESSONS:
        raise HTTPException(404, 'Unknown lesson')
    key = 'quiz_' + body.request_id
    old = store.get_design_record(key)
    if old:
        if old.get('kind') != 'quiz' or old['lesson_id'] != body.lesson_id:
            raise HTTPException(409, 'Request ID already used')
        return quiz_public(old)
    ids = LESSONS[body.lesson_id]['quiz_ids']
    records = store.list_design_records()
    seen = {a['question_id'] for a in rows(records)}
    # A retake serves fresh variants of questions already answered, when the tutor has written them.
    contracts = {k: (k in seen and variants.take(store, records, k)) or deepcopy(QUESTIONS[k]) for k in ids}
    doc = put(store, key, {'kind': 'quiz', 'lesson_id': body.lesson_id,
                          'content_version': LESSONS[body.lesson_id].get('version', VERSION),
                          'created_at': time.time(), 'question_ids': ids, 'answers': {},
                          'contracts': contracts})
    return quiz_public(doc)


@router.get('/course/quizzes/{key}')
def get_quiz(key: str, store=Depends(store_for)):
    return quiz_public(read(store, key, 'quiz'))


def number(text):
    return f'{text:,.10g}'


def judge(contract, answer):
    """(is_correct, correct_answer) for every question format; raises on malformed input."""
    fmt = contract.get('format', 'choice')
    by_id = {c['id']: c for c in contract['choices']}
    if fmt == 'numeric':
        expected = contract['correct']
        right = {'text': f"{number(expected)} {contract.get('unit', '')}".strip()}
        if answer is None:
            return False, right
        try:
            value = float(answer.replace(',', '').strip())
        except ValueError as exc:
            raise HTTPException(422, 'Enter a number') from exc
        return abs(value - expected) <= contract['tolerance'] * abs(expected), right
    if fmt in ('multi', 'order'):
        ids = contract['correct']
        joiner = ' → ' if fmt == 'order' else ' · '
        right = {'ids': ids, 'text': joiner.join(by_id[k]['text'] for k in ids)}
        if answer is None:
            return False, right
        picked = [k for k in answer.split(',') if k]
        if not picked or any(k not in by_id for k in picked) or len(set(picked)) != len(picked):
            raise HTTPException(422, 'Choose an answer first')
        if fmt == 'order' and len(picked) != len(ids):
            raise HTTPException(422, 'Place every item in order')
        return (picked == ids if fmt == 'order' else set(picked) == set(ids)), right
    right = by_id[contract['correct']]
    if answer is None:
        return False, right
    if answer not in by_id:
        raise HTTPException(422, 'Choose an answer first')
    return answer == right['id'], right


def grade(contract, body, assisted, now):
    correct, right = judge(contract, None if body.reveal else body.answer)
    return {'answer': body.answer, 'correct': correct and not body.reveal,
            'revealed': body.reveal, 'guessed': body.guessed or (correct and body.confidence == 'unsure'),
            'confidence': body.confidence, 'assisted': assisted,
            'answered_at': now, 'elapsed_sec': body.elapsed_sec, 'timing_source': 'visible_active',
            'explanation': contract['explanation'], 'correct_answer': right, 'whys': contract.get('whys', {}),
            'format': contract.get('format', 'choice'), 'unit': contract.get('unit', ''),
            'question_title': contract['prompt'], 'choices': contract['choices'],
            'content_version': contract['version']}


@router.post('/course/quizzes/{key}/answer')
def quiz_answer(key: str, body: Answer, background: BackgroundTasks, store=Depends(store_for)):
    background.add_task(variants.ensure, store, body.question_id)
    for _ in range(3):
        doc = read(store, key, 'quiz')
        if body.question_id not in doc['question_ids']:
            raise HTTPException(422, 'Question is not part of this quiz')
        if body.question_id in doc['answers']:
            return quiz_public(doc)
        result = grade(doc['contracts'][body.question_id], body, True, time.time())
        answers = {**doc['answers'], body.question_id: result}
        updated = {**doc, 'answers': answers}
        if len(answers) == len(doc['question_ids']):
            updated['completed_at'] = result['answered_at']
        try:
            return quiz_public(put(store, key, updated, doc['revision']))
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
    raise HTTPException(409, 'Reload to recover the saved quiz')


def public_contract(contract, order=None):
    item = {k: deepcopy(v) for k, v in contract.items() if k not in ('correct', 'explanation', 'whys', 'retired', 'tolerance')}
    if order:
        choices = {c['id']: c for c in item['choices']}
        item['choices'] = [choices[k] for k in order]
    return item


def fire_public(doc):
    return {'id': doc['id'], 'question': public_contract(doc['contract'], doc['choice_order']),
            'result': doc.get('result')}


def placement_pool(candidates, answers, recent):
    """Questions from lessons with no answers yet and not already asked this round."""
    tested = {a['lesson_id'] for a in answers}
    asked = {QUESTIONS[q]['lesson_id'] for q in recent if q in QUESTIONS}
    return [q for q in candidates if q['lesson_id'] not in tested | asked and q['difficulty'] != 'standard'] \
        or [q for q in candidates if q['lesson_id'] not in tested | asked]


@router.post('/quickfire/next')
def next_question(body: NextQuestion, store=Depends(store_for)):
    key = 'fire_' + body.request_id
    old = store.get_design_record(key)
    filters = body.model_dump(exclude={'request_id', 'recent'})
    if old:
        if old.get('kind') != 'quickfire' or old.get('filters') != filters:
            raise HTTPException(409, 'Request ID already used with different filters')
        return fire_public(old)
    if body.category and body.category not in {c[0] for c in CATEGORIES}:
        raise HTTPException(422, 'Unknown category')
    if body.lesson_id and body.lesson_id not in LESSONS:
        raise HTTPException(422, 'Unknown topic')
    if body.question_id and not active(body.question_id):
        raise HTTPException(422, 'Unknown question')
    records = store.list_design_records()
    answers = rows(records)
    review = schedules(answers)
    latest = {a['question_id']: a for a in answers}
    learned = {r['lesson_id'] for r in records if r.get('kind') == 'course_lesson' and r.get('read_at')}
    candidates = [q for q in QUESTIONS.values() if q['kind'] == 'quickfire' and not q.get('retired')
                  and (not body.category or q['category'] == body.category)
                  and (not body.lesson_id or q['lesson_id'] == body.lesson_id)
                  and (body.difficulty == 'mixed' or q['difficulty'] == body.difficulty)
                  and (body.mode != 'learned' or q['lesson_id'] in learned)
                  and (body.mode != 'mistakes' or (q['id'] in latest and needs_repair(latest[q['id']])))]
    if body.mode == 'placement':
        candidates = placement_pool(candidates, answers, body.recent)
    if body.question_id:
        candidates = [QUESTIONS[body.question_id]]
    if not candidates:
        return {'empty': True, 'message': 'No matching questions yet. Try mixed practice or read a lesson first.'}
    # Avoid immediate repeats when alternatives exist, including in a narrow topic.
    recent = set(body.recent[-min(8, max(1, len(candidates) - 1)):])
    pool = [q for q in candidates if q['id'] not in recent] or candidates
    now = int(time.time())
    topic_rows = {}
    for a in answers:
        if a['source'] == 'quickfire':
            topic_rows.setdefault(a['lesson_id'], []).append(a)
    def priority(q):
        schedule = review.get(q['id'])
        if schedule and schedule['due_at'] <= now:
            return (0, schedule['due_at'])
        if q['id'] in latest and needs_repair(latest[q['id']]):
            return (1, 0)
        if q['id'] not in latest:
            topic = topic_rows.get(q['lesson_id'], [])[-5:]
            miss_rate = sum(needs_repair(a) for a in topic) / len(topic) if topic else 0
            return (2, -miss_rate)
        return (3, schedule['due_at'] if schedule else now)
    best = min(map(priority, pool))
    item = secrets.choice([q for q in pool if priority(q) == best])
    if item['id'] in latest:
        item = variants.take(store, records, item['id']) or item
    order = [c['id'] for c in item['choices']]
    secrets.SystemRandom().shuffle(order)
    try:
        doc = put(store, key, {'kind': 'quickfire', 'question_id': item['id'], 'lesson_id': item['lesson_id'],
                               'skill': item['skill'], 'content_version': item['version'], 'created_at': now,
                               'filters': filters, 'choice_order': order, 'contract': deepcopy(item)})
    except HTTPException:
        # A concurrent request with the same id won the race: return its question.
        doc = store.get_design_record(key)
        if not doc or doc.get('kind') != 'quickfire' or doc.get('filters') != filters:
            raise
    return fire_public(doc)


@router.get('/quickfire/{key}')
def get_fire(key: str, store=Depends(store_for)):
    return fire_public(read(store, key, 'quickfire'))


@router.post('/quickfire/{key}/answer')
def fire_answer(key: str, body: Answer, background: BackgroundTasks, store=Depends(store_for)):
    doc = read(store, key, 'quickfire')
    background.add_task(variants.ensure, store, doc['question_id'])
    if body.question_id != doc['question_id']:
        raise HTTPException(422, 'Question does not match this attempt')
    if doc.get('result'):
        return fire_public(doc)
    exposure = store.get_design_record('course_' + doc['lesson_id'])
    legacy = store.get_design_record('lesson_' + doc['skill'])
    now = time.time()
    assisted = any(e and (now - e.get('at', 0) < DAY or e.get('at', 0) >= doc['created_at'])
                   for e in (exposure, legacy))
    # Feedback already seen today makes a repeat supported, even without a lesson.
    assisted = assisted or any(r.get('kind') == 'quickfire' and r.get('question_id') == doc['question_id']
                               and r.get('result') and now - r['result']['answered_at'] < DAY
                               for r in store.list_design_records())
    result = grade(doc['contract'], body, assisted, now)
    try:
        doc = put(store, key, {**doc, 'result': result}, doc['revision'])
    except HTTPException as exc:
        if exc.status_code != 409:
            raise
        doc = read(store, key, 'quickfire')
        if not doc.get('result'):
            raise
    return fire_public(doc)


@router.post('/quickfire/{key}/guess')
def mark_guess(key: str, store=Depends(store_for)):
    for _ in range(3):
        doc = read(store, key, 'quickfire')
        result = doc.get('result')
        if not result or not result['correct'] or result['revealed']:
            raise HTTPException(422, 'Only a correct answer can be marked as guessed')
        if result.get('guessed'):
            return fire_public(doc)
        try:
            return fire_public(put(store, key, {**doc, 'result': {**result, 'guessed': True}}, doc['revision']))
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
    raise HTTPException(409, 'Reload to recover the saved answer')
