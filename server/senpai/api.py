"""Authenticated Senpai API: plan, state, sessions, approvals, history, teaching, and the daily review."""
import asyncio
import datetime as dt
import time
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from .. import auth, llm
from ..store import get_store
from . import daily as daily_coach, jobscout, policy, service, snapshot, teach

router = APIRouter(prefix='/api/senpai', tags=['senpai'])
daily_router = APIRouter(tags=['senpai-daily'])


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


class SessionRequest(BaseModel):
    budget: int | None = Field(default=None, ge=10, le=240)
    mode: Literal['mixed', 'retrieval', 'learn', 'interview'] | None = None
    depth: Literal['balanced', 'deep', 'broad'] | None = None
    objective: str | None = Field(default=None, max_length=80)


class Resolve(BaseModel):
    note: str = Field(default='', max_length=500)


class UserChange(BaseModel):
    kind: Literal['rebalance', 'focus_add', 'focus_remove', 'overlay_remove', 'objective_add',
                  'objective_complete', 'objective_remove', 'set_protected']
    capability_id: str | None = Field(default=None, max_length=80)
    objective_id: str | None = Field(default=None, max_length=40)
    overlay_id: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=200)
    bucket: Literal['dsa', 'system_design', 'behavioural', 'stack'] | None = None
    target: dict[str, float] | None = None
    share: float | None = Field(default=None, ge=0, le=0.8)
    protected: bool = False
    rationale: str = Field(default='', max_length=500)


class Answer(BaseModel):
    answer: str = Field(min_length=1, max_length=1000)


class Response(BaseModel):
    response: Literal['accepted', 'dismissed', 'pending']


class Checkpoint(BaseModel):
    capability_id: str = Field(max_length=80)
    days: int = Field(default=7, ge=1, le=30)
    reason: str = Field(default='', max_length=300)


class TeachRequest(BaseModel):
    capability_id: str = Field(max_length=80)
    message: str = Field(min_length=1, max_length=4000)
    history: list[dict] = Field(default_factory=list, max_length=40)
    mode: Literal['learn', 'independent', 'interview'] = 'learn'


def _clean(doc):
    if isinstance(doc, dict):
        doc = dict(doc)
        doc.pop('_key', None)
    return doc


def overview(store, now=None):
    now = int(time.time() if now is None else now)
    b = service.bundle(store, now)
    plan = service.load_plan(store, now)
    state = _clean(store.get_senpai('senpai', 'state')) or service.refresh_state(store, now, b)
    job = _clean(store.get_senpai('senpai', 'job_context')) or {}
    decisions = sorted((_clean(d) for d in store.list_senpai('senpai_decisions')), key=lambda d: (d['at'], d.get('seq', 0)), reverse=True)
    proposals = sorted((_clean(p) for p in store.list_senpai('senpai_proposals')), key=lambda p: p['created_at'], reverse=True)
    items = sorted((_clean(i) for i in store.list_senpai('senpai_interventions')), key=lambda i: i['created_at'], reverse=True)
    weekly = sorted((_clean(w) for w in store.list_senpai('senpai_weekly')), key=lambda w: w['iso_week'], reverse=True)
    teaching = sorted((_clean(t) for t in store.list_senpai('senpai_teaching')), key=lambda t: t['at'], reverse=True)
    s = b['settings']
    ctx = job.get('context') or {}
    return {
        'plan': plan, 'plan_summary': service.plan_summary(plan, now), 'limits': policy.limits(s),
        'buckets': policy.BUCKET_LABELS, 'state': state, 'snapshot_md': snapshot.render(state, plan, now),
        'capabilities': b['rows'], 'proposals': [p for p in proposals if p['status'] == 'pending'],
        'resolved_proposals': [p for p in proposals if p['status'] != 'pending'][:10],
        'decisions': decisions[:30], 'interventions': items[:12], 'weekly': weekly[:4], 'teaching': teaching[:10],
        'job_scout': {'configured': jobscout.configured(), 'links': jobscout.public_links(),
                      'fetched_at': job.get('fetched_at'), 'generated_at': job.get('generated_at'),
                      'error': job.get('error'), 'career_target': job.get('career_target'),
                      'interviews': (ctx.get('interviews') or {}).get('upcoming', [])[:5],
                      'demand': {'cohort': (ctx.get('demand') or {}).get('cohort'),
                                 'tags': (ctx.get('demand') or {}).get('tags', [])[:12]},
                      'uncertainty': ctx.get('uncertainty', [])},
        'settings': {k: s.get(k) for k in ('target_job', 'target_job_source', 'senpai_charter', 'senpai_weekly_minutes',
                                           'senpai_session_minutes', 'senpai_mode', 'senpai_depth', 'senpai_focus_note',
                                           'senpai_weekly_day')},
        'model_enabled': llm.enabled(s), 'now': now,
    }


@router.get('')
async def get_overview(store=Depends(store_for)):
    return await asyncio.to_thread(overview, store)


@router.get('/today')
async def get_today(store=Depends(store_for)):
    return await asyncio.to_thread(service.today_session, store)


@router.post('/session')
async def new_session(body: SessionRequest, store=Depends(store_for)):
    def run():
        b = service.bundle(store)
        return service.session_progress(service.prepare_session(store, budget=body.budget, mode=body.mode, depth=body.depth,
                                                                objective=body.objective, b=b), b)
    return await asyncio.to_thread(run)


@router.post('/proposals/{pid}/{action}')
async def resolve(pid: str, action: Literal['approve', 'reject'], body: Resolve, store=Depends(store_for)):
    try:
        out = await asyncio.to_thread(service.resolve_proposal, store, pid, action == 'approve', None, body.note)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    await asyncio.to_thread(service.refresh_state, store)
    return out


@router.post('/changes')
async def user_change(body: UserChange, store=Depends(store_for)):
    """Your own edits. You are the approver, so approval-only changes apply directly; structure is still validated."""
    def run():
        now = int(time.time())
        change = {k: v for k, v in body.model_dump().items() if v not in (None, '')}
        change['source'] = 'user'
        if change['kind'] == 'rebalance':
            change['immediate'] = True
        plan = service.load_plan(store, now)
        known = {r['id'] for r in service.bundle(store, now)['rows']}
        decision, reasons, _ = policy.classify(plan, change, {**policy.limits(store.get_settings()), 'max_focus': 99,
                                                              'max_objectives': 99, 'focus_cooldown_days': 0}, now, known)
        if decision == 'reject':
            raise HTTPException(400, '; '.join(reasons))
        if change['kind'] == 'focus_add' and len(policy.active_focus(plan)) >= policy.limits(store.get_settings())['max_focus']:
            raise HTTPException(400, 'Focus is full. Remove one first.')
        new = policy.apply(plan, change, now)
        service.save_plan(store, new, plan['revision'])
        service.record_decision(store, now, kind=change['kind'], decision='user', change=change,
                                rationale=body.rationale or 'Changed by you.', source='user',
                                before=plan['revision'], after=new['revision'])
        service.refresh_state(store, now)
        return {'plan': new}
    try:
        return await asyncio.to_thread(run)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post('/questions/{qid}')
async def answer(qid: str, body: Answer, store=Depends(store_for)):
    try:
        return {'question': await asyncio.to_thread(service.answer_question, store, qid, body.answer)}
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post('/interventions/{iid}')
async def respond(iid: str, body: Response, store=Depends(store_for)):
    item = await asyncio.to_thread(store.get_senpai, 'senpai_interventions', iid)
    if not item:
        raise HTTPException(404, 'No such intervention.')
    item = {**_clean(item), 'response': body.response, 'responded_at': int(time.time())}
    await asyncio.to_thread(store.put_senpai, 'senpai_interventions', iid, item)
    return {'intervention': item}


@router.post('/checkpoints')
async def checkpoint(body: Checkpoint, store=Depends(store_for)):
    rows = await asyncio.to_thread(lambda: {r['id'] for r in service.bundle(store)['rows']})
    if body.capability_id not in rows:
        raise HTTPException(400, 'Unknown capability.')
    return {'intervention': await asyncio.to_thread(service.request_checkpoint, store, body.capability_id, body.days,
                                                     body.reason or 'Requested by you', None, 'user')}


@router.get('/capabilities/{cid}')
async def capability(cid: str, store=Depends(store_for)):
    def run():
        b = service.bundle(store)
        return {**service.inspect_evidence(b, cid), 'resources': service.find_resources(b, cid)}
    try:
        return await asyncio.to_thread(run)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post('/sync')
async def sync(store=Depends(store_for)):
    if not jobscout.configured():
        raise HTTPException(409, 'Job Scout is not configured on this server (JOB_SCOUT_URL, JOB_SCOUT_TOKEN).')
    record = await asyncio.to_thread(jobscout.sync, store)
    return {k: (record or {}).get(k) for k in ('fetched_at', 'error', 'career_target', 'fingerprint')}


@router.post('/weekly')
async def run_weekly(store=Depends(store_for)):
    return await service.weekly(store, force=True)


@router.post('/teach')
async def teach_turn(body: TeachRequest, store=Depends(store_for)):
    try:
        return await teach.turn(store, body.capability_id, body.message, body.history, body.mode)
    except teach.TeachUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get('/snapshot.md', response_class=PlainTextResponse)
async def snapshot_md(store=Depends(store_for)):
    def run():
        plan = service.load_plan(store)
        state = _clean(store.get_senpai('senpai', 'state')) or service.refresh_state(store)
        return snapshot.render(state, plan, int(time.time()))
    return await asyncio.to_thread(run)


@router.get('/history')
async def history(store=Depends(store_for)):
    def run():
        plans = sorted((_clean(p) for p in store.list_senpai('senpai_plans')), key=lambda p: p['revision'], reverse=True)
        decisions = sorted((_clean(d) for d in store.list_senpai('senpai_decisions')), key=lambda d: (d['at'], d.get('seq', 0)), reverse=True)
        return {'plans': [{k: p.get(k) for k in ('revision', 'updated_at', 'allocation', 'focus', 'overlays')} for p in plans[:50]],
                'decisions': decisions[:200]}
    return await asyncio.to_thread(run)


# ---- the daily review (mounted at /api/coach/daily and /api/senpai/daily) -------------------------

class GenerateReview(BaseModel):
    date: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    force: bool = False


class ReviewFeedback(BaseModel):
    timezone: str = Field(max_length=100)
    status: Literal['accepted', 'dismissed', 'pending']
    note: str = Field(default='', max_length=2000)


def validate_date(date):
    try:
        if dt.date.fromisoformat(date).isoformat() != date:
            raise ValueError()
    except ValueError:
        raise HTTPException(400, 'Use a calendar date in YYYY-MM-DD format.') from None


@daily_router.get('')
async def latest(uid: str = Depends(auth.require_user)):
    store = await asyncio.to_thread(get_store, uid)
    settings = await asyncio.to_thread(store.get_settings)
    reports = await asyncio.to_thread(daily_coach.history, store)
    status = (await asyncio.to_thread(store.get_flags)).get('daily_coach_status')
    eligible = daily_coach.review_date(settings)
    if status and (status.get('timezone') != settings['daily_coach_timezone']
                   or status.get('target_job') != settings['target_job'] or status.get('date') != eligible):
        status = None
    return {'reports': reports, 'target_job': settings['target_job'],
            'target_job_source': settings.get('target_job_source', 'local'),
            'enabled': settings['daily_coach_enabled'], 'timezone': settings['daily_coach_timezone'],
            'review_time': settings['daily_coach_time'], 'eligible_date': eligible,
            'today': daily_coach.local_now(settings).date().isoformat(),
            'model_enabled': llm.enabled(settings), 'status': status}


@daily_router.post('')
async def generate(body: GenerateReview, uid: str = Depends(auth.require_user)):
    store = await asyncio.to_thread(get_store, uid)
    try:
        return {'report': await daily_coach.generate(store, body.date, force=body.force)}
    except daily_coach.ReviewUnavailable as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@daily_router.post('/{date}/feedback')
async def feedback(date: str, body: ReviewFeedback, uid: str = Depends(auth.require_user)):
    validate_date(date)
    try:
        ZoneInfo(body.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(400, 'Use a valid IANA timezone.') from None
    store = await asyncio.to_thread(get_store, uid)
    report = await asyncio.to_thread(store.update_daily_review_feedback, date, body.timezone,
                                    body.status, body.note.strip())
    if report is None:
        raise HTTPException(404, 'Daily review not found.')

    def link():  # your response to the advice is part of its follow-through record
        for item in store.list_senpai('senpai_interventions'):
            if item.get('ref') == f'daily:{date}':
                store.put_senpai('senpai_interventions', item['id'],
                                 {**_clean(item), 'response': body.status, 'responded_at': int(time.time())})
    await asyncio.to_thread(link)
    return {'report': report}



