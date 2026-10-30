"""HTTP API for the learning tracks: /api/tracks/... Raw answers are saved before any model call."""
import secrets
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import llm, system_design_coach
from ..system_design_learning import judge
from . import TRACKS, courses, experience, practical
from .http import put, store_for

router = APIRouter(prefix='/api/tracks', tags=['tracks'])


def course_track(track):
    if track not in courses.COURSES:
        raise HTTPException(404, 'Unknown course')
    return track


def lesson_of(track, key):
    if key not in courses.lessons(track):
        raise HTTPException(404, 'Unknown lesson')
    return courses.lessons(track)[key]


@router.get('')
def list_tracks(store=Depends(store_for)):
    """One summary row per track, for the section menu and Senpai."""
    now = time.time()
    out = []
    for tid, meta in TRACKS.items():
        records = store.list_track_records(tid)
        if meta['kind'] == 'course':
            o = courses.overview(tid, records, now)
        elif meta['kind'] == 'experience':
            o = experience.overview(records, now)
        else:
            o = practical.overview(records, now)
        out.append({'id': tid, **meta, 'knowledge': o['knowledge'], 'total': o['total'], 'pct': o['pct'], 'due': o['due']})
    return out


@router.get('/{track}')
def get_track(track: str, store=Depends(store_for)):
    if track not in TRACKS:
        raise HTTPException(404, 'Unknown track')
    records, now, meta = store.list_track_records(track), time.time(), TRACKS[track]
    if meta['kind'] == 'course':
        body = courses.overview(track, records, now)
    elif meta['kind'] == 'experience':
        body = experience.overview(records, now, store.get_senpai('senpai', 'job_context'))
    else:
        body = practical.overview(records, now)
    return {'track': {'id': track, **meta}, 'llm': llm.enabled(store.get_settings()), **body}


# ---- course lessons ------------------------------------------------------------------

class Activity(BaseModel):
    block: str = Field(pattern=r'^b\d{1,3}$')
    correct: bool | None = None


class Recall(BaseModel):
    block: str = Field(pattern=r'^b\d{1,3}$')
    text: str = Field(min_length=1, max_length=3000)


class Answer(BaseModel):
    question_id: str = Field(max_length=120)
    answer: str = Field(default='', max_length=400)
    reveal: bool = False
    guessed: bool = False
    source: Literal['quickfire', 'check'] = 'quickfire'
    elapsed_sec: int = Field(default=0, ge=0, le=86400)


class NextQuestion(BaseModel):
    exclude: list[str] = Field(default_factory=list, max_length=200)
    lesson: str | None = None


@router.get('/{track}/lessons/{key}')
def open_lesson(track: str, key: str, store=Depends(store_for)):
    course_track(track)
    lesson_of(track, key)
    now = int(time.time())
    old = store.get_track_record(track, 'lesson_' + key)
    record = put(store, track, 'lesson_' + key, {**(old or {}), 'kind': 'lesson', 'lesson_id': key,
                                                 'opened_at': (old or {}).get('opened_at', now), 'at': now},
                 old['revision'] if old else None)
    return courses.public_lesson(track, key, record)


@router.post('/{track}/lessons/{key}/activity')
def record_activity(track: str, key: str, body: Activity, store=Depends(store_for)):
    """First-try correctness is kept; later attempts only count as practice."""
    course_track(track)
    lesson = lesson_of(track, key)
    if not any(b.get('key') == body.block for b in lesson['blocks']):
        raise HTTPException(404, 'Unknown activity')
    for _ in range(3):
        state = store.get_track_record(track, 'lesson_' + key)
        if not state:
            raise HTTPException(404, 'Open the lesson first')
        acts = dict(state.get('activities') or {})
        old = acts.get(body.block, {})
        acts[body.block] = {'done': True, 'first_correct': old.get('first_correct', body.correct),
                            'attempts': old.get('attempts', 0) + 1, 'at': old.get('at', int(time.time()))}
        try:
            return put(store, track, state['id'], {**state, 'activities': acts}, state['revision'])
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
    raise HTTPException(409, 'Reload to recover the saved lesson')


@router.post('/{track}/lessons/{key}/recall')
async def grade_recall(track: str, key: str, body: Recall, store=Depends(store_for)):
    course_track(track)
    lesson = lesson_of(track, key)
    block = next((b for b in lesson['blocks'] if b.get('key') == body.block and b['type'] == 'recall'), None)
    if not block:
        raise HTTPException(404, 'Unknown recall activity')
    doc = put(store, track, 'recall_' + secrets.token_hex(12),
              {'kind': 'recall', 'lesson_id': key, 'block': body.block, 'text': body.text, 'created_at': time.time()})
    result, message = await system_design_coach.grade_recall(block, body.text, store.get_settings(),
                                                             subject=TRACKS[track]['title'])
    if result:
        put(store, track, doc['id'], {**doc, 'grade': result}, doc['revision'])
    return {'grade': result, 'message': message}


@router.post('/{track}/lessons/{key}/checked')
def mark_checked(track: str, key: str, store=Depends(store_for)):
    course_track(track)
    state = store.get_track_record(track, 'lesson_' + key)
    if not state:
        raise HTTPException(404, 'Open the lesson first')
    if state.get('checked_at'):
        return state
    return put(store, track, state['id'], {**state, 'checked_at': int(time.time())}, state['revision'])


@router.post('/{track}/quickfire/next')
def next_question(track: str, body: NextQuestion, store=Depends(store_for)):
    course_track(track)
    if body.lesson:
        lesson_of(track, body.lesson)
    q = courses.next_question(track, store.list_track_records(track), time.time(), set(body.exclude), body.lesson)
    return {'question': courses.public_question(q) if q else None}


@router.post('/{track}/answer')
def answer(track: str, body: Answer, store=Depends(store_for)):
    course_track(track)
    q = courses.questions(track).get(body.question_id)
    if not q:
        raise HTTPException(404, 'Unknown question')
    correct, right = judge(q, None if body.reveal else body.answer)
    now = time.time()
    put(store, track, 'ans_' + secrets.token_hex(12),
        {'kind': 'answer', 'question_id': q['id'], 'lesson_id': q['lesson_id'], 'answer': body.answer,
         'correct': bool(correct) and not body.reveal, 'revealed': body.reveal, 'guessed': body.guessed,
         'source': body.source, 'elapsed_sec': body.elapsed_sec, 'at': now})
    return {'correct': bool(correct) and not body.reveal, 'correct_answer': right,
            'explanation': q['explanation'], 'whys': q.get('whys', {})}


router.include_router(experience.router)
router.include_router(practical.router)
