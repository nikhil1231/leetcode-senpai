"""One timed activity across sections. Source records own completion and saved work.

The small compare-and-swap lease serializes starts across tabs AND server processes.
It retains source references so another process needn't trust its collection cache.
"""
import inspect
import time
from contextlib import contextmanager
from functools import wraps
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from . import auth, plans, poller
from .store import get_store

router = APIRouter(prefix='/api/timed-sessions', tags=['timed sessions'])
TRACK, KEY = 'timed_sessions', 'current'


def _refs(store, registry):
    refs = set(tuple(r) for r in (registry or {}).get('sources', []))
    refs.update(('leetcode', s['id']) for s in store.list_active_sessions())
    refs.update(('mock', m['id']) for m in store.list_mocks() if m.get('status') == 'active')
    refs.update(('sprint', s['id']) for s in store.list_sprint_rounds() if s.get('status') == 'active')
    for track in ('coding', 'practical'):
        refs.update((track, a['id']) for a in store.list_track_records(track)
                    if a.get('kind') == 'attempt' and a.get('status') == 'open')
    refs.update(('design', d['id']) for d in store.list_design_records()
                if not d.get('timer_ended') and (
                    (d.get('kind') == 'paper' and d.get('status') == 'sitting') or
                    (d.get('kind') == 'sprint' and not d.get('finished_at')) or
                    (d.get('kind') == 'session' and d.get('timed_session')) or
                    d.get('kind') == 'redesign_run'))
    return refs


def _activity(store, source, key, now):
    if source == 'leetcode':
        d = store.get_session(key)
        if not d or d.get('status') != 'active':
            return None
        p = store.get_problem(d['slug']) or {}
        return dict(kind='leetcode', title=p.get('title', d['slug']), label='LeetCode', href='/leetcode/today',
                    elapsed_sec=poller.run_clock(d, now) + plans.plan_sec(d), paused=bool(d.get('paused_at')),
                    ticking=not bool(d.get('paused_at')), slug=d['slug'], mock=d.get('kind') == 'mock')
    if source == 'mock':
        d = store.get_mock(key)
        if not d or d.get('status') != 'active':
            return None
        return dict(kind='mock', title='Mock interview', label='LeetCode', href='/leetcode/today',
                    elapsed_sec=max(0, now - d['started_at']), duration_sec=d['duration_sec'], ticking=True,
                    slugs=[p['slug'] for p in d['problems']])
    if source == 'sprint':
        d = store.get_sprint_round(key)
        if not d or d.get('status') != 'active':
            return None
        return dict(kind='sprint', title='Pattern sprint', label='LeetCode', href='/leetcode/today',
                    elapsed_sec=max(0, now - d['started_at']), ticking=True)
    if source in ('coding', 'practical'):
        d = store.get_track_record(source, key)
        if not d or d.get('status') != 'open':
            return None
        title = d.get('title')
        if source == 'practical':
            from .tracks.practical import exercise
            title = exercise(d['exercise_id'])['title']
        return dict(kind=source, title=title or 'Coding exercise', label='Coding practice' if source == 'coding' else 'Practical coding',
                    href=f'/practical/coding/{quote(key)}' if source == 'coding' else '/practical/exercise/' + quote(d['exercise_id']),
                    elapsed_sec=max(0, now - d['started_at']), ticking=True, mode=d.get('mode'), exercise_id=d['exercise_id'])
    d = store.get_design_record(key)
    if not d or d.get('timer_ended'):
        return None
    if d['kind'] == 'paper' and d.get('status') == 'sitting':
        return _visible_clock(store, 'design:' + key, now, dict(kind='paper', title=d['scope_label'], label='System design paper',
                    href='/system-design/papers?session=' + quote(key), elapsed_sec=max(0, now - d['created_at']),
                    duration_sec=d['time_limit_sec'], paused=True, ticking=False))
    if d['kind'] == 'sprint':
        from .system_design_drills import finished
        if finished(d, now):
            return None
        return dict(kind='drill', title=d['label'], label='Estimation drill', href='/system-design/drills?session=' + quote(key),
                    elapsed_sec=max(0, now - d['created_at']), duration_sec=d.get('seconds') or None, ticking=True)
    if d['kind'] == 'redesign_run':
        from .system_design_curriculum import LESSONS
        return dict(kind='redesign', title=LESSONS[d['lesson_id']]['title'], label='Redesign from memory',
                    href='/system-design/redesign/' + quote(d['lesson_id']), elapsed_sec=max(0, now - d['created_at']),
                    duration_sec=600, ticking=True)
    if d['kind'] == 'session' and d.get('timed_session'):
        from .system_design_content import CASES
        return _visible_clock(store, 'design:' + key, now, dict(kind='design', title=CASES[d['case_id']]['title'], label='System design',
                    href='/system-design/workspace?session=' + quote(key), elapsed_sec=d.get('elapsed_sec', 0),
                    paused=True, ticking=False))
    return None


def _visible_clock(store, key, now, activity):
    clock = store.get_track_record('timed_clocks', key)
    if clock:
        # These activities count visible work, unlike wall-clock mocks and coding.
        # A closed/crashed tab stops being considered live after its heartbeat expires.
        age = max(0, now - clock['at'])
        running = not clock['paused'] and age < 25
        activity.update(elapsed_sec=clock['elapsed_sec'] + (min(age, 25) if not clock['paused'] else 0),
                        ticking=running, paused=not running)
    return activity


def activities(store, registry=None):
    if registry is None:
        registry = store.get_track_record(TRACK, KEY)
    now = time.time()
    out = []
    for source, key in sorted(_refs(store, registry)):
        a = _activity(store, source, key, now)
        if a:
            out.append({**a, 'key': source + ':' + key, 'source': source, 'id': key})
    # A mock's editor question is part of the interview, not a competing timer.
    for m in (a for a in out if a['kind'] == 'mock'):
        children = [a for a in out if a['kind'] == 'leetcode' and a.get('mock') and a['slug'] in m['slugs']]
        if children:
            m['run_id'] = children[0]['id']
            m['run_title'] = children[0]['title']
            out = [a for a in out if a not in children]
    return out


def _conflict(active=None):
    title = active['title'] if active else 'A session is starting in another tab'
    raise HTTPException(409, {'code': 'timed_session_active', 'message': f'{title}. Finish or end the active session before starting another.',
                              'activity': active})


@contextmanager
def exclusive(store, allowed=()):
    old = store.get_track_record(TRACK, KEY)
    if old and old.get('starting_at') and time.time() - old['starting_at'] < 120:
        _conflict()
    try:
        lease = store.put_track_record(TRACK, KEY, {**(old or {}), 'starting_at': time.time()},
                                       old['revision'] if old else None)
    except ValueError:
        _conflict()
    try:
        active = activities(store, lease)
        for a in active:
            if a['key'] not in allowed:
                _conflict(a)
        yield
    finally:
        # Even a failed start releases its lease; existing work stays untouched.
        sources = [list(r) for r in _refs(store, lease) if _activity(store, *r, time.time())]
        store.put_track_record(TRACK, KEY, {'starting_at': None, 'sources': sources}, lease['revision'])


def _allowed(operation, values, store):
    body = values.get('body')
    if operation == 'sprint':
        return [a['key'] for a in activities(store) if a['kind'] == 'sprint']
    if operation == 'redesign':
        return [a['key'] for a in activities(store) if a['kind'] == 'redesign' and a['href'].endswith('/' + values['key'])]
    if operation == 'mock':
        return [a['key'] for a in activities(store) if a['kind'] == 'mock']
    if operation == 'leetcode' and getattr(body, 'kind', None) == 'mock':
        return [a['key'] for a in activities(store) if a['kind'] == 'mock' and body.slug in a['slugs'] and not a.get('run_id')]
    if operation == 'coding' and not body.new:
        return [a['key'] for a in activities(store) if a['kind'] == 'coding' and a.get('mode') == values['mode']]
    if operation == 'practical':
        return [a['key'] for a in activities(store) if a['kind'] == 'practical' and a['exercise_id'] == values['key']]
    if operation in ('paper', 'drill', 'design'):
        prefix = {'paper': 'paper_', 'drill': 'sprint_', 'design': 'session_'}[operation]
        return ['design:' + prefix + body.request_id]
    if operation == 'resume-design':
        return ['design:' + values['key']]
    return []


def timed_start(operation):
    """Wrap the actual write, not just a browser preflight or a request dependency."""
    def decorate(fn):
        signature = inspect.signature(fn)
        def context(args, kwargs):
            values = signature.bind(*args, **kwargs).arguments
            store = values.get('store') or fn.__globals__['get_store'](values['uid'])
            return exclusive(store, _allowed(operation, values, store))
        if inspect.iscoroutinefunction(fn):
            @wraps(fn)
            async def wrapped(*args, **kwargs):
                with context(args, kwargs):
                    return await fn(*args, **kwargs)
        else:
            @wraps(fn)
            def wrapped(*args, **kwargs):
                with context(args, kwargs):
                    return fn(*args, **kwargs)
        return wrapped
    return decorate


@router.get('')
def status(uid: str = Depends(auth.require_user)):
    return {'activities': activities(get_store(uid)), 'server_now': time.time()}


class End(BaseModel):
    key: str


@router.post('/end')
def end(body: End, background: BackgroundTasks, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    a = next((a for a in activities(store) if a['key'] == body.key), None)
    if not a:
        return {'ok': True}
    if a['source'] == 'leetcode':
        store.update_session(a['id'], {'status': 'cancelled'})
    elif a['source'] == 'mock':
        from . import mock
        mock.finish(store, a['id'])
    elif a['source'] == 'sprint':
        store.update_sprint_round(a['id'], {'status': 'abandoned', 'finished_at': int(time.time())})
    elif a['source'] in ('coding', 'practical'):
        d = store.get_track_record(a['source'], a['id'])
        store.put_track_record(a['source'], a['id'], {**d, 'status': 'abandoned', 'elapsed_sec': int(a['elapsed_sec'])}, d['revision'])
    elif a['kind'] == 'paper':
        from .system_design_papers import finish, Finish
        finish(a['id'], Finish(elapsed_sec=min(86400, int(a['elapsed_sec']))), background, store)
    elif a['kind'] == 'drill':
        from .system_design_drills import close
        d = store.get_design_record(a['id'])
        store.put_design_record(a['id'], close(d, time.time()), d['revision'])
    else:
        d = store.get_design_record(a['id'])
        store.put_design_record(a['id'], {**d, 'timer_ended': True}, d['revision'])
    return {'ok': True}


class Clock(BaseModel):
    key: str
    elapsed_sec: int
    paused: bool


@router.post('/clock')
def clock(body: Clock, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    if not 0 <= body.elapsed_sec <= 604800:
        raise HTTPException(422, 'Invalid elapsed time')
    source, _, key = body.key.partition(':')
    if source != 'design' or not _activity(store, source, key, time.time()):
        raise HTTPException(409, 'This timed session has ended.')
    old = store.get_track_record('timed_clocks', body.key)
    try:
        store.put_track_record('timed_clocks', body.key,
                               {'at': time.time(), 'elapsed_sec': body.elapsed_sec, 'paused': body.paused},
                               old['revision'] if old else None)
    except ValueError:
        pass  # A newer heartbeat already won.
    return {'ok': True}
