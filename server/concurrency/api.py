"""HTTP API for custom concurrency questions (/api/concurrency/...), and the hooks main.py calls when the in-app editor
or the post-solve review meets a custom problem: Run and Submit go to the Java sandbox instead of LeetCode's judge, and
grading compares the code's measurements with the reference solution's instead of reading runtime percentiles. The
reference solution, the hidden tests and the broken solutions never leave the server."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import auth, coach, llm
from ..coding import model_io
from ..store import get_store
from . import judge, queue, spec as S

router = APIRouter(prefix='/api/concurrency', tags=['concurrency'])


def _question(store, qid):
    q = store.get_track_record(queue.QK, qid)
    if not q or q.get('kind') != 'question':
        raise HTTPException(404, 'Question not found')
    return q


def _done_row(q, attempts):
    mine = sorted(attempts, key=lambda a: a.get('solved_at') or 0)
    last = mine[-1]
    score = (last.get('solution_grade') or {}).get('score')
    return {**S.public(q, done=True), 'attempts': len(mine), 'last_attempt_at': last.get('solved_at'),
            'solved': any(not a.get('unsolved') for a in mine), 'score': score}


@router.get('/overview')
def overview(uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    qs = queue.questions(store)
    st = queue.state(store, qs)
    level = S.current_level(queue.history(store, qs))
    if S.should_refill(len(st['ready']), len(st['in_progress'])):
        queue.kick(uid)
    active = store.latest_active_session()
    return {
        'model': model_io.available(), 'level': level, 'level_label': S.LEVELS[level]['label'],
        'generating': queue.generating(uid), 'error': queue.errors.get(uid),
        'ready': [S.public(q) for q in st['ready']],
        'in_progress': [{**S.public(q), 'active': bool(active and active.get('slug') == q.get('slug'))} for q in st['in_progress']],
        'done': [_done_row(q, st['attempts'][q['slug']]) for q in st['done']],
        'target_ready': S.TARGET_READY, 'max_unfinished': S.MAX_UNCOMPLETED,
        'reasons': [{'key': k, 'label': v} for k, v in S.DISCARD_REASONS.items()],
    }


@router.post('/generate')
def generate_one(uid: str = Depends(auth.require_user)):
    if not model_io.available():
        raise HTTPException(503, 'Generating questions needs a model, and none is configured.')
    queue.kick(uid, extra=True)
    return {'ok': True}


@router.post('/{qid}/start')
def start(qid: str, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    q = _question(store, qid)
    if q['status'] == 'discarded':
        raise HTTPException(410, 'This question was discarded')
    q = queue.start(store, q)
    queue.kick(uid)
    return {'slug': q['slug'], 'title': q['title'], 'category': S.CATEGORY}


class Discard(BaseModel):
    reason: str
    note: str = ''


@router.post('/{qid}/discard')
def discard(qid: str, body: Discard, uid: str = Depends(auth.require_user)):
    if body.reason not in S.DISCARD_REASONS:
        raise HTTPException(422, 'Unknown reason')
    store = get_store(uid)
    q = _question(store, qid)
    queue.discard(store, q, body.reason, body.note)
    queue.kick(uid)
    return {'ok': True}


# ---- hooks for main.py's editor and grading -------------------------------------------------------------------------
def is_custom(p):
    return (p or {}).get('source') == 'custom'


def question_for(store, p):
    q = store.get_track_record(queue.QK, p.get('custom_id') or '') or queue.by_slug(store, p['slug'])
    if not q:
        raise HTTPException(410, 'This question is no longer stored.')
    return q


async def editor_run(store, p, code):
    q = question_for(store, p)
    result = await asyncio.to_thread(judge.run, q, code)
    return judge.run_view(result, judge.RUN['repeats'])


async def editor_submit(store, p, code):
    """-> (the editor's submit result, the full measurements to keep on the attempt)."""
    q = question_for(store, p)
    result = await asyncio.to_thread(judge.submit, q, code)
    return judge.submit_view(result), judge.measured(result)


def finished(uid, slug):
    """A solve or an ended run on a custom question: the buffer may need topping up."""
    if S.is_custom(slug):
        queue.kick(uid)


async def grade_solution(store, attempt):
    """The post-solve review for a custom question. -> (result, error) like coach.grade_solution; (None, None) with
    no model, so the solve is logged and scheduled as usual."""
    settings = store.get_settings()
    if not llm.enabled(settings) or not attempt.get('code'):
        return None, None
    p = store.get_problem(attempt['slug']) or {}
    q = question_for(store, p)
    mine, ref = attempt.get('custom_measured'), q.get('reference_metrics')
    return await llm.extract_or_error('grade_concurrency', {
        'title': q['title'], 'level': q['level'], 'primary_tool': q.get('primary_tool'),
        'statement': coach.statement_text(q['statement_html'], limit=8000), 'key_ideas': '; '.join(q['key_ideas']),
        'reference': q['solution'], 'code': attempt['code'],
        'execution_status': 'ended_unsolved' if attempt.get('unsolved') else 'accepted: passed every test, 20 runs each',
        'measured': S.measurement_text(mine, ref), 'flags': '; '.join(S.measurement_flags(mine, ref)),
        'asked': attempt.get('followups_asked') or [],
    }, settings=settings)


def wants_review_card(attempt, current_card):
    """Custom questions join the review schedule only when the solve went badly (rated low, hints or the solution
    needed, or unsolved); one already on the schedule stays on it like any other."""
    if current_card:
        return True
    return S.outcome({**attempt, 'solution_grade': None}) == 'struggle'
