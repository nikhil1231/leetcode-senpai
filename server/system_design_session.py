"""Adaptive lesson sessions: warm-up, a frozen per-learner plan, and tutor moments.

The plan is computed deterministically from the ledger and the warm-up, then frozen on the
lesson record so sections don't collapse while you work through them. It goes stale after
PLAN_DAYS, so revisiting a lesson later re-tailors it. Tutor notes refine the plan when the
model is available; every tutor moment saves the learner's text first and degrades to the
authored content without the model. Redesign-from-memory is a scheduled ledger item.
"""
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth, knowledge, llm, system_design_adaptive as adaptive, system_design_coach as coach
from . import system_design_items as ledger_items, system_design_tutor as tutor
from .store import get_store
from .system_design_content import CASES
from .system_design_curriculum import LESSONS, QUESTIONS

router = APIRouter(prefix='/api/system-design', tags=['system-design-session'])
PLAN_DAYS = 3
WALKTHROUGHS = [k for k, l in LESSONS.items() if adaptive.is_walkthrough(l)]


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


def put(store, key, doc, revision=None):
    try:
        return store.put_design_record(key, doc, revision)
    except ValueError as exc:
        raise HTTPException(409, 'This lesson changed in another tab. Reload to continue.') from exc


def lesson_or_404(key):
    if key not in LESSONS or not LESSONS[key].get('blocks'):
        raise HTTPException(404, 'Unknown lesson')
    return LESSONS[key]


def state_of(store, key):
    return store.get_design_record('course_' + key) or {}


def save_state(store, key, changes):
    for _ in range(3):
        old = store.get_design_record('course_' + key)
        base = old or {'kind': 'course_lesson', 'lesson_id': key, 'skill': LESSONS[key]['skill'],
                       'opened_at': int(time.time()), 'at': int(time.time())}
        try:
            return store.put_design_record('course_' + key, {**base, **changes}, old['revision'] if old else None)
        except ValueError:
            continue
    raise HTTPException(409, 'Reload to recover the saved lesson')


def ledger_views(records, now):
    return knowledge.summary(ledger_items.ITEMS, ledger_items.events(records), now, history_days=1)['items']


def planned(state, now):
    return bool(state.get('plan')) and now - state['plan'].get('at', 0) < PLAN_DAYS * 86400


def session(store, key, now=None):
    """Everything the lesson player needs. Frozen modes win over live evidence once planned."""
    now = time.time() if now is None else now
    lesson = lesson_or_404(key)
    records = store.list_design_records()
    views = ledger_views(records, now)
    statuses = {v['id']: v['status'] for v in views}
    state = next((r for r in records if r.get('id') == 'course_' + key), {})
    position = WALKTHROUGHS.index(key) if key in WALKTHROUGHS else None
    is_planned = planned(state, now)
    frozen = state['plan'] if is_planned else {}
    notes = (frozen.get('notes') or {}) if is_planned else {}
    result = adaptive.plan(lesson, statuses, fresh=frozen.get('fresh', False), position=position,
                           overrides={n['id']: n for n in notes.get('sections', [])})
    for s in result['sections']:
        if is_planned and s['id'] in frozen.get('modes', {}):
            s['mode'] = frozen['modes'][s['id']]
    attempts = {}
    for r in sorted((r for r in records if r.get('kind') == 'stage_attempt' and r.get('lesson_id') == key),
                    key=lambda r: r['created_at']):
        attempts[r['section']] = {'id': r['id'], 'text': r['text'], 'feedback': r.get('feedback'), 'skipped': r.get('skipped', False)}
    calls = frozen.get('callbacks', []) if is_planned else []
    return {'lesson_id': key, 'planned': is_planned, 'fresh': frozen.get('fresh', False),
            'probes': frozen.get('probes', []) if is_planned else adaptive.probes(lesson, statuses),
            'sections': result['sections'], 'finale': result['finale'], 'known_share': result['known_share'],
            'walkthrough': result['walkthrough'], 'position': position, 'intro': notes.get('intro', ''),
            'notes_pending': is_planned and not notes and llm.enabled(store.get_settings()),
            'callbacks': [{'id': q, 'lesson_id': QUESTIONS[q]['lesson_id'],
                           'lesson_title': LESSONS[QUESTIONS[q]['lesson_id']]['title']} for q in calls if q in QUESTIONS],
            'attempts': attempts, 'tutor': llm.enabled(store.get_settings()),
            'redesign': f'redesign:{key}' in ledger_items.BY_ID}


@router.get('/course/lessons/{key}/session')
def get_session(key: str, store=Depends(store_for)):
    return session(store, key)


class PlanBody(BaseModel):
    fresh: bool = False
    note: str = Field(default='', max_length=1000)
    probes: list[str] = Field(default_factory=list, max_length=10)


@router.post('/course/lessons/{key}/plan')
def make_plan(key: str, body: PlanBody, store=Depends(store_for)):
    """Freeze the plan after the warm-up. The learner's own note is kept as raw data."""
    lesson = lesson_or_404(key)
    now = time.time()
    records = store.list_design_records()
    views = ledger_views(records, now)
    statuses = {v['id']: v['status'] for v in views}
    position = WALKTHROUGHS.index(key) if key in WALKTHROUGHS else None
    result = adaptive.plan(lesson, statuses, fresh=body.fresh, position=position)
    order = list(LESSONS)
    save_state(store, key, {'plan': {'at': now, 'fresh': body.fresh, 'self_report': body.note.strip(),
                                     'probes': [p for p in body.probes if any(b.get('key') == p for b in lesson['blocks'])],
                                     'modes': {s['id']: s['mode'] for s in result['sections']},
                                     'callbacks': adaptive.callbacks(key, order, views), 'notes': None}})
    return session(store, key, now)


@router.post('/course/lessons/{key}/plan/reset')
def reset_plan(key: str, store=Depends(store_for)):
    lesson_or_404(key)
    save_state(store, key, {'plan': None})
    return session(store, key)


@router.post('/course/lessons/{key}/plan/notes')
async def plan_notes(key: str, store=Depends(store_for)):
    """Tutor refinement of a frozen plan: an intro, per-section notes and mode changes."""
    lesson = lesson_or_404(key)
    current = session(store, key)
    state = state_of(store, key)
    if not current['planned'] or current['walkthrough']:
        return current
    probe_results = [{'block': k, 'section': next((s['id'] for s in current['sections'] if k in s['blocks']), None),
                      'correct': (state.get('activities') or {}).get(k, {}).get('first_correct')}
                     for k in state['plan'].get('probes', [])]
    result, message = await tutor.plan_notes(lesson, current['sections'], probe_results,
                                             state['plan'].get('self_report'), store.get_settings())
    if not result:
        return {**current, 'message': message}
    modes = dict(state['plan']['modes'])
    wrong = {s['id'] for s in current['sections'] if s['evidence']['wrong']}
    for n in result['sections']:
        if not (n['mode'] == 'known' and n['id'] in wrong):
            modes[n['id']] = n['mode']
    save_state(store, key, {'plan': {**state['plan'], 'modes': modes, 'notes': result}})
    return session(store, key)


def section_or_404(lesson, sid):
    found = next((s for s in adaptive.sections(lesson)['sections'] if s['id'] == sid), None)
    if not found:
        raise HTTPException(404, 'Unknown section')
    return found


class TutorBody(BaseModel):
    section: str = Field(max_length=8)
    question: str = Field(default='', max_length=1500)
    block: str = Field(default='', max_length=8)
    answer: str = Field(default='', max_length=1500)


@router.post('/course/lessons/{key}/tutor')
async def ask_tutor(key: str, body: TutorBody, store=Depends(store_for)):
    """Explain a mistake or answer a question, grounded in the section's text."""
    lesson = lesson_or_404(key)
    section = section_or_404(lesson, body.section)
    block = next((b for b in lesson['blocks'] if body.block and b.get('key') == body.block), None)
    question = body.question.strip() or 'I got this activity wrong. Explain what I misunderstood.'
    doc = put(store, 'tutor_' + secrets.token_hex(16), {'kind': 'tutor', 'lesson_id': key, 'section': body.section,
                                                       'block': body.block, 'question': question,
                                                       'answer': body.answer, 'created_at': time.time()})
    result, message = await tutor.explain(lesson, section, question, block, body.answer, store.get_settings())
    if result:
        put(store, doc['id'], {**doc, 'reply': result}, doc['revision'])
    return {'reply': result['reply'] if result else None, 'message': message}


class AttemptBody(BaseModel):
    section: str = Field(max_length=8)
    text: str = Field(default='', max_length=6000)
    skip: bool = False


@router.post('/course/lessons/{key}/attempt')
async def stage_attempt(key: str, body: AttemptBody, store=Depends(store_for)):
    """Attempt a walkthrough stage before reading it; the attempt is saved before feedback."""
    lesson = lesson_or_404(key)
    section = section_or_404(lesson, body.section)
    if not body.skip and len(body.text.strip()) < 10:
        raise HTTPException(422, 'Write a few lines first, or skip this stage')
    doc = put(store, 'attempt_' + secrets.token_hex(16), {'kind': 'stage_attempt', 'lesson_id': key,
                                                         'section': body.section, 'text': body.text.strip(),
                                                         'skipped': body.skip, 'created_at': time.time()})
    message = None
    if not body.skip:
        result, message = await tutor.compare_attempt(lesson, section, body.text.strip(), store.get_settings())
        if result:
            doc = put(store, doc['id'], {**doc, 'feedback': result}, doc['revision'])
    return {'id': doc['id'], 'text': doc['text'], 'feedback': doc.get('feedback'), 'skipped': body.skip, 'message': message}


class PitchBody(BaseModel):
    block: str = Field(pattern=r'^b\d{1,3}$')
    followup: int | None = Field(default=None, ge=0, le=9)
    text: str = Field(min_length=1, max_length=4000)


@router.post('/course/lessons/{key}/pitch')
async def pitch(key: str, body: PitchBody, store=Depends(store_for)):
    """Grade a typed interview pitch or follow-up answer against the authored model."""
    lesson = lesson_or_404(key)
    block = next((b for b in lesson['blocks'] if b.get('key') == body.block and b['type'] == 'interview'), None)
    if not block or (body.followup is not None and body.followup >= len(block['followups'])):
        raise HTTPException(404, 'Unknown interview prompt')
    doc = put(store, 'pitch_' + secrets.token_hex(16), {'kind': 'pitch', 'lesson_id': key, 'block': body.block,
                                                       'followup': body.followup, 'text': body.text,
                                                       'created_at': time.time()})
    result, message = await tutor.grade_pitch(block, body.text, body.followup, store.get_settings(), lesson['title'])
    if result:
        put(store, doc['id'], {**doc, 'grade': result}, doc['revision'])
    return {'grade': result, 'message': message}


class TwistBody(BaseModel):
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    section: str = Field(default='', max_length=8)


@router.post('/course/lessons/{key}/twist')
async def make_twist(key: str, body: TwistBody, store=Depends(store_for)):
    """A curveball written for this lesson; its rubric is frozen for grading."""
    lesson = lesson_or_404(key)
    rid = 'twist_' + body.request_id
    old = store.get_design_record(rid)
    if old:
        return twist_public(old)
    focus = section_or_404(lesson, body.section) if body.section else None
    result, message = await tutor.twist(lesson, adaptive.sections(lesson)['sections'], focus, store.get_settings())
    if not result:
        raise HTTPException(503, message)
    doc = put(store, rid, {'kind': 'twist', 'lesson_id': key, 'section': body.section, 'created_at': time.time(),
                           'twist': result})
    return twist_public(doc)


def twist_public(doc):
    t = doc['twist']
    out = {'id': doc['id'], 'scenario': t['scenario'], 'question': t['question'], 'answer': doc.get('answer')}
    if doc.get('answer'):
        out.update(points=t['points'], model=t['model'], grade=doc.get('grade'))
    return out


class TextBody(BaseModel):
    text: str = Field(min_length=1, max_length=6000)


@router.post('/course/twists/{tid}/answer')
async def answer_twist(tid: str, body: TextBody, store=Depends(store_for)):
    doc = store.get_design_record(tid)
    if not doc or doc.get('kind') != 'twist':
        raise HTTPException(404, 'Unknown curveball')
    if doc.get('answer'):
        return twist_public(doc)
    doc = put(store, tid, {**doc, 'answer': body.text, 'answered_at': time.time()}, doc['revision'])
    t = doc['twist']
    result, message = await coach.grade_recall({'prompt': t['scenario'] + '\n\n' + t['question'],
                                                'points': t['points'], 'model': t['model']},
                                               body.text, store.get_settings())
    if result:
        doc = put(store, tid, {**doc, 'grade': result}, doc['revision'])
    return {**twist_public(doc), 'message': message}


# ---------- Redesign from memory ----------
def redesign_rubric(key):
    """Rubric for a blank-page redesign: the walkthrough's recall points plus its numbered stages."""
    lesson = LESSONS[key]
    recall = next((b for b in lesson['blocks'] if b['type'] == 'recall'), None)
    interview = next((b for b in lesson['blocks'] if b['type'] == 'interview'), None)
    case = CASES.get(lesson.get('case_id') or '', {})
    return {'prompt': case.get('prompt') or lesson['principle'], 'requirements': case.get('requirements', []),
            'points': list(recall['points']) if recall else [], 'model': interview['say'] if interview else recall['model'],
            'stages': [s['title'] for s in adaptive.sections(lesson)['sections'] if s['title']]}


@router.get('/redesign/{key}')
def redesign_brief(key: str, store=Depends(store_for)):
    if f'redesign:{key}' not in ledger_items.BY_ID:
        raise HTTPException(404, 'No redesign for this lesson')
    r = redesign_rubric(key)
    past = sorted((x for x in store.list_design_records() if x.get('kind') == 'redesign' and x['lesson_id'] == key),
                  key=lambda x: x['created_at'])
    return {'lesson_id': key, 'title': LESSONS[key]['title'], 'prompt': r['prompt'], 'requirements': r['requirements'],
            'stages': r['stages'], 'points': len(r['points']), 'tutor': llm.enabled(store.get_settings()),
            'history': [{'id': x['id'], 'at': x['created_at'], 'score': x.get('score')} for x in past[-5:]]}


class RedesignBody(BaseModel):
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    text: str = Field(min_length=20, max_length=12000)
    elapsed_sec: int = Field(default=0, ge=0, le=86400)


@router.post('/redesign/{key}')
async def submit_redesign(key: str, body: RedesignBody, store=Depends(store_for)):
    if f'redesign:{key}' not in ledger_items.BY_ID:
        raise HTTPException(404, 'No redesign for this lesson')
    rid = 'redesign_' + body.request_id
    old = store.get_design_record(rid)
    if old:
        return redesign_public(old)
    r = redesign_rubric(key)
    doc = put(store, rid, {'kind': 'redesign', 'lesson_id': key, 'text': body.text, 'elapsed_sec': body.elapsed_sec,
                           'created_at': time.time(), 'score': None})
    result, message = await coach.grade_recall({'prompt': r['prompt'], 'points': r['points'], 'model': r['model']},
                                               body.text, store.get_settings())
    if result:
        covered = sum(p['status'] == 'covered' for p in result['points']) + sum(p['status'] == 'partial' for p in result['points']) / 2
        doc = put(store, rid, {**doc, 'grade': result, 'score': round(covered / len(r['points']), 2)}, doc['revision'])
    return {**redesign_public(doc), 'message': message}


class SelfBody(BaseModel):
    covered: int = Field(ge=0, le=12)


@router.post('/redesign/{rid}/self')
def self_mark_redesign(rid: str, body: SelfBody, store=Depends(store_for)):
    doc = store.get_design_record(rid)
    if not doc or doc.get('kind') != 'redesign':
        raise HTTPException(404, 'Unknown redesign')
    if doc.get('score') is not None:
        return redesign_public(doc)
    n = len(redesign_rubric(doc['lesson_id'])['points'])
    doc = put(store, rid, {**doc, 'self_covered': min(body.covered, n), 'score': round(min(body.covered, n) / n, 2)},
              doc['revision'])
    return redesign_public(doc)


def redesign_public(doc):
    r = redesign_rubric(doc['lesson_id'])
    return {'id': doc['id'], 'lesson_id': doc['lesson_id'], 'score': doc.get('score'), 'grade': doc.get('grade'),
            'points': r['points'], 'model': r['model'], 'stages': r['stages']}
