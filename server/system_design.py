"""System design practice: immutable assessment snapshots and conservative reviews."""
from copy import deepcopy
import hashlib
import time
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth, llm, system_design_coach as coach
from .store import get_store
from .system_design_content import (VERSION, CASES, FIELDS, SKILLS, LESSONS,
                                    EXERCISES, public_case, public_exercise, check_exercise)

router = APIRouter(prefix='/api/system-design', tags=['system-design'])
DAY = 86400
Identifier = str


def design_store(uid: str = Depends(auth.require_user)):
    return get_store(uid)


class Profile(BaseModel):
    revision: int | None = None
    level: Literal['foundation', 'mid', 'senior'] = 'mid'
    minutes: Literal[5, 15, 45] = 15


class Start(BaseModel):
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    case_id: str
    mode: Literal['learn', 'interview'] = 'learn'
    minutes: Literal[5, 15, 45] = 15


class DesignFields(BaseModel):
    requirements: str = Field(default='', max_length=8000)
    interfaces: str = Field(default='', max_length=8000)
    flow: str = Field(default='', max_length=8000)
    diagram: str = Field(default='', max_length=4000)
    tradeoffs: str = Field(default='', max_length=8000)
    failures: str = Field(default='', max_length=8000)


class Save(BaseModel):
    revision: int = Field(ge=1)
    fields: DesignFields
    elapsed_sec: int = Field(ge=0, le=604800)
    timing_uncertain: bool = False


class Request(BaseModel):
    revision: int = Field(ge=1)
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')


class Chat(Request):
    message: str = Field(min_length=1, max_length=2000)


class PracticeStart(BaseModel):
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    exercise_id: str


class PracticeAnswer(BaseModel):
    answer: str = Field(default='', max_length=300)
    reveal: bool = False
    elapsed_sec: int | None = Field(default=None, ge=0, le=86400)


def put(store, key, doc, revision=None):
    try:
        return store.put_design_record(key, doc, revision)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


def record(store, key, kind):
    doc = store.get_design_record(key)
    if not doc or doc.get('kind') != kind:
        raise HTTPException(404, 'Practice record not found')
    return doc


def review_schedule(records):
    """Recognition and retrieval reviews never count as complete design evidence."""
    schedule = {}
    for r in sorted(records, key=lambda r: r.get('answered_at', 0)):
        if r.get('kind') != 'practice' or not r.get('answered_at'):
            continue
        skill, at = r['skill'], r['answered_at']
        old = schedule.get(skill)
        clean = r.get('correct') and not r.get('assisted') and not r.get('revealed')
        if old and at - old['last_at'] < DAY:
            # Repeating an answer immediately does not compound retention.
            if not clean:
                old['due_at'] = min(old['due_at'], at + DAY)
            continue
        interval = min(21, (old['interval'] * 3 if old else 7)) if clean else 1
        schedule[skill] = {'skill': skill, 'last_at': at, 'interval': interval,
                           'due_at': at + interval * DAY}
    return schedule


def evidence(records):
    result = {s: {'designs': 0, 'independent_cases': 0, 'later_checks': 0, 'needs_work': 0}
              for s in SKILLS}
    # Latest assessment per saved answer; repeated grading is not more practice.
    snapshots = {}
    for r in sorted(records, key=lambda x: x.get('created_at', 0)):
        if r.get('kind') == 'assessment' and r.get('status') == 'complete':
            snap = r['snapshot']
            signature = (r['session_id'], hashlib.sha256(str(sorted(snap['fields'].items())).encode()).hexdigest())
            snapshots[signature] = r
    clean = {s: [] for s in SKILLS}
    for r in snapshots.values():
        for f in r['assessment']['result']['findings']:
            skill = f['skill']
            if skill not in result:
                continue
            if f['status'] == 'needs_work':
                result[skill]['needs_work'] += 1
            if f['status'] != 'demonstrated':
                continue
            result[skill]['designs'] += 1
            if not r['snapshot'].get('assisted') and not r['assessment']['result'].get('assisted'):
                clean[skill].append(r)
    for skill, rows in clean.items():
        rows.sort(key=lambda r: r['created_at'])
        result[skill]['independent_cases'] = len({r['snapshot']['case_id'] for r in rows})
        result[skill]['later_checks'] = sum(any(
            r['session_id'] != earlier['session_id'] and r['created_at'] - earlier['created_at'] >= DAY
            for earlier in rows[:i]) for i, r in enumerate(rows))
    return result


def recommendation(records, minutes, now):
    due = sorted((v for v in review_schedule(records).values() if v['due_at'] <= now),
                 key=lambda v: v['due_at'])
    if due:
        skill = due[0]['skill']
        choices = [k for k, q in EXERCISES.items() if q['skill'] == skill]
        seen = {r.get('exercise_id') for r in records if r.get('kind') == 'practice'}
        key = next((k for k in choices if k not in seen), choices[-1])
        return {'kind': 'practice', 'id': key, 'reason': 'A later check is due: ' + SKILLS[skill]}
    assessed = sorted((r for r in records if r.get('kind') == 'assessment' and r.get('status') == 'complete'),
                      key=lambda r: r['created_at'], reverse=True)
    if assessed:
        skill = assessed[0]['assessment']['result']['next_skill']
        if minutes == 5 or any(f['status'] == 'needs_work' for f in assessed[0]['assessment']['result']['findings']):
            key = next(k for k, q in EXERCISES.items() if q['skill'] == skill and not q['transfer'])
            return {'kind': 'practice', 'id': key, 'reason': 'Practise the focus from your latest assessment: ' + SKILLS[skill]}
    if minutes == 5:
        return {'kind': 'practice', 'id': 'scope-promise', 'reason': 'Use five minutes to practise one design decision.'}
    counts = {k: sum(r.get('kind') == 'session' and r.get('case_id') == k for r in records) for k in CASES}
    return {'kind': 'case', 'id': min(counts, key=counts.get), 'reason': 'Build a complete design, then identify what to practise.'}


@router.get('')
def catalog(store=Depends(design_store)):
    records = store.list_design_records()
    profile = store.get_design_record('profile') or {'level': 'mid', 'minutes': 15, 'revision': None}
    sessions = sorted((r for r in records if r.get('kind') == 'session'), key=lambda r: r['updated_at'], reverse=True)
    return {'cases': [public_case(k) for k in CASES], 'skills': SKILLS, 'fields': FIELDS,
            'profile': profile, 'coach_enabled': llm.enabled(store.get_settings()),
            'exercises': [{'id': k, 'title': q['title'], 'skill': q['skill']} for k, q in EXERCISES.items() if not q['transfer']],
            'profiles': {k: {'model': p['model'], 'effort': p['effort']} for k, p in coach.profiles().items()},
            'sessions': [{k: r[k] for k in ('id', 'case_id', 'mode', 'updated_at', 'elapsed_sec')} for r in sessions[:20]],
            'evidence': evidence(records), 'reviews': list(review_schedule(records).values()),
            'recommendation': recommendation(records, profile['minutes'], int(time.time())),
            'storage_scope': hashlib.sha256(store.uid.encode()).hexdigest()[:20]}


@router.put('/profile')
def profile(body: Profile, store=Depends(design_store)):
    return put(store, 'profile', {'kind': 'profile', 'level': body.level, 'minutes': body.minutes}, body.revision)


@router.post('/sessions')
def start(body: Start, store=Depends(design_store)):
    if body.case_id not in CASES:
        raise HTTPException(404, 'Unknown design case')
    key = 'session_' + body.request_id
    old = store.get_design_record(key)
    if old:
        if old['case_id'] != body.case_id or old['mode'] != body.mode:
            raise HTTPException(409, 'Request ID already used for a different design')
        return old
    now = int(time.time())
    level = (store.get_design_record('profile') or {}).get('level', 'mid')
    recent_help = any((r.get('kind') == 'exposure' and r.get('skill') in CASES[body.case_id]['skills']
                       and now - r.get('at', 0) < DAY) or
                      (r.get('kind') == 'assessment' and r.get('status') == 'complete'
                       and r['snapshot']['case_id'] == body.case_id and now - r.get('finished_at', 0) < DAY)
                      for r in store.list_design_records())
    return put(store, key, {'kind': 'session', 'case_id': body.case_id, 'case_version': VERSION,
                           'mode': body.mode, 'level': level, 'minutes': body.minutes, 'created_at': now,
                           'updated_at': now, 'elapsed_sec': 0, 'timing_uncertain': False,
                           'fields': {k: '' for k in FIELDS}, 'chat': [], 'assisted': recent_help})


@router.get('/sessions/{key}')
def get_session(key: str, store=Depends(design_store)):
    session = record(store, key, 'session')
    assessments = sorted((r for r in store.list_design_records()
                          if r.get('kind') == 'assessment' and r.get('session_id') == key),
                         key=lambda r: r['created_at'], reverse=True)
    return {'session': session, 'case': public_case(session['case_id']), 'assessments': assessments}


@router.put('/sessions/{key}')
def save(key: str, body: Save, store=Depends(design_store)):
    session = record(store, key, 'session')
    return put(store, key, {**session, 'fields': body.fields.model_dump(),
                           'elapsed_sec': max(body.elapsed_sec, session['elapsed_sec']),
                           'timing_uncertain': session['timing_uncertain'] or body.timing_uncertain,
                           'updated_at': int(time.time())}, body.revision)


async def assess_saved(store, key):
    job = record(store, key, 'assessment')
    output, error = await coach.generate('assessor', job['snapshot'], store.get_settings())
    latest = record(store, key, 'assessment')
    if latest['revision'] != job['revision']:
        return
    put(store, key, {**job, 'status': 'error' if error else 'complete', 'error': error,
                     'assessment': output, 'finished_at': int(time.time())}, job['revision'])


@router.post('/sessions/{key}/assess')
def assess(key: str, body: Request, background: BackgroundTasks, store=Depends(design_store)):
    session = record(store, key, 'session')
    aid = 'assessment_' + body.request_id
    old = store.get_design_record(aid)
    if old:
        if old['session_id'] != key:
            raise HTTPException(409, 'Request ID already used')
        return {'assessment': old, 'session': session}
    if session['revision'] != body.revision:
        raise HTTPException(409, 'Save your latest design before requesting assessment')
    if any(r.get('kind') == 'assessment' and r.get('session_id') == key
           and r.get('status') == 'pending' and int(time.time()) - r.get('started_at', r['created_at']) < 180
           for r in store.list_design_records()):
        raise HTTPException(409, 'An assessment is already running for this design')
    if len(''.join(session['fields'].values()).strip()) < 40:
        raise HTTPException(422, 'Describe your design before requesting assessment')
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, 'Coaching is unavailable. Your draft is saved; use the lessons and practice below.')
    snapshot = deepcopy(session)
    snapshot['case_contract'] = deepcopy(CASES[session['case_id']])
    # All subsequent revisions have been exposed to assessment/repair support.
    session = put(store, key, {**session, 'assisted': True}, session['revision'])
    job = put(store, aid, {'kind': 'assessment', 'session_id': key, 'created_at': int(time.time()),
                           'snapshot': snapshot, 'status': 'pending', 'assessment': None, 'error': None})
    background.add_task(assess_saved, store, aid)
    return {'assessment': job, 'session': session}


@router.post('/assessments/{key}/retry')
def retry_assessment(key: str, background: BackgroundTasks, store=Depends(design_store)):
    job = record(store, key, 'assessment')
    if job['status'] == 'complete':
        return job
    if job['status'] == 'pending' and int(time.time()) - job.get('started_at', job['created_at']) < 180:
        raise HTTPException(409, 'Assessment is still running')
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, 'Coaching is unavailable')
    job = put(store, key, {**job, 'status': 'pending', 'error': None, 'started_at': int(time.time())}, job['revision'])
    background.add_task(assess_saved, store, key)
    return job


@router.post('/sessions/{key}/chat')
async def chat(key: str, body: Chat, store=Depends(design_store)):
    if not body.message.strip():
        raise HTTPException(422, 'Write a question or explanation first')
    session = record(store, key, 'session')
    old = next((m for m in session['chat'] if m.get('request_id') == body.request_id and m['role'] == 'coach'), None)
    if old:
        return session
    if len(session['chat']) >= 60:
        raise HTTPException(422, 'This conversation is full. Save and assess your design.')
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, 'The live coach is unavailable. Your workspace and authored practice still work.')
    if session.get('chat_pending') and int(time.time()) - session['chat_pending']['at'] < 100:
        raise HTTPException(409, 'The coach is still responding')
    message = {'role': 'candidate', 'text': body.message, 'request_id': body.request_id, 'at': int(time.time())}
    session = put(store, key, {**session, 'chat': session['chat'] + [message],
                               'chat_pending': {'id': body.request_id, 'at': int(time.time())},
                               'assisted': session['assisted'] or session['mode'] == 'learn'}, body.revision)
    output, error = await coach.generate('tutor', session, store.get_settings())
    for _ in range(3):
        latest = record(store, key, 'session')
        if (latest.get('chat_pending') or {}).get('id') != body.request_id:
            return latest
        reply = {'role': 'coach', 'text': error or output['result']['reply'],
                 'request_id': body.request_id, 'at': int(time.time()), 'error': bool(error),
                 'assistance': bool(output and output['result']['assistance']),
                 'model': output['model'] if output else None}
        try:
            return put(store, key, {**latest, 'chat': latest['chat'] + [reply], 'chat_pending': None,
                                   'assisted': latest['assisted'] or reply['assistance']}, latest['revision'])
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
    raise HTTPException(409, 'Your question is saved. Reload to recover the conversation.')


@router.post('/lessons/{skill}')
def lesson(skill: str, body: dict, store=Depends(design_store)):
    if skill not in LESSONS:
        raise HTTPException(404, 'Unknown lesson')
    # Record exposure before revealing instruction; a later attempt is not blind.
    now = int(time.time())
    key = 'lesson_' + skill
    old = store.get_design_record(key)
    put(store, key, {'kind': 'exposure', 'skill': skill, 'at': now}, old['revision'] if old else None)
    session = None
    if body.get('session_id'):
        session = record(store, body['session_id'], 'session')
        session = put(store, session['id'], {**session, 'assisted': True}, session['revision'])
    return {'lesson': LESSONS[skill], 'session': session}


@router.post('/practice')
def start_practice(body: PracticeStart, store=Depends(design_store)):
    if body.exercise_id not in EXERCISES:
        raise HTTPException(404, 'Unknown exercise')
    key = 'practice_' + body.request_id
    old = store.get_design_record(key)
    if old and old['exercise_id'] != body.exercise_id:
        raise HTTPException(409, 'Request ID already used')
    skill = EXERCISES[body.exercise_id]['skill']
    exposure = store.get_design_record('lesson_' + skill)
    now = int(time.time())
    doc = old or put(store, key, {'kind': 'practice', 'exercise_id': body.exercise_id,
                                'content_version': VERSION, 'skill': skill, 'created_at': now,
                                'assisted': bool(exposure and now - exposure['at'] < DAY)})
    return {'record': doc, 'question': public_exercise(body.exercise_id)}


@router.post('/practice/{key}/answer')
def answer(key: str, body: PracticeAnswer, store=Depends(design_store)):
    doc = record(store, key, 'practice')
    item = EXERCISES[doc['exercise_id']]
    if not doc.get('answered_at'):
        exposure = store.get_design_record('lesson_' + doc['skill'])
        doc = put(store, key, {**doc, 'answer': body.answer, 'revealed': body.reveal,
                              'correct': not body.reveal and check_exercise(doc['exercise_id'], body.answer),
                              'assisted': doc['assisted'] or bool(exposure and exposure['at'] >= doc['created_at']),
                              'answered_at': int(time.time()), 'elapsed_sec': body.elapsed_sec,
                              'format': 'recognition' if item['choices'] else 'retrieval'}, doc['revision'])
    return {'record': doc, 'explanation': item['explanation'],
            'answer': item['choices'][item['correct']] if item['choices'] else item['correct']}
