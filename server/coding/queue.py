"""The ready queue: about two validated exercises per mode, topped up in the background and never waited on.

Starting an exercise only takes one that is already stored. Generation runs one at a time for the whole process (the box is
shared, and LocalRouter has limited slots), is triggered by opening the section or taking an exercise, and stops once the
buffer is full. Exercises made before the last attempt was graded may no longer fit; picking uses the latest results, and a
ready exercise two levels away from the target is replaced rather than served. With no model, or nothing ready, the curated
pool answers immediately.
"""
import asyncio
import logging
import time

from ..store import get_store
from . import fallback, generate, model_io, spec as S, validate

log = logging.getLogger(__name__)
EX, AT = 'coding_ex', 'coding'
KEEP_SERVED = 40
EXECUTABLE_ON = True   # repair exercises are generated too: their tests run in the sandbox (runner.py)

_busy: set = set()
_sem = None
errors: dict = {}      # (uid, mode) -> last failure, for the overview


def _lock():
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(1)
    return _sem


def exercises(store):
    return store.list_track_records(EX)


def attempts(store):
    return [r for r in store.list_track_records(AT) if r.get('kind') == 'attempt']


def ready(store, mode, exs=None):
    return [e for e in (exs if exs is not None else exercises(store)) if e.get('mode') == mode and e.get('status') == 'ready']


def generating(uid, mode):
    return (uid, mode) in _busy


def make(spec):
    """Blocking: generate, then validate. Raises when the exercise is not good enough to serve."""
    ex = generate.generate(spec)
    ex['validation'] = validate.validate(ex)
    if not ex['validation']['ok']:
        raise generate.GenError('failed validation: ' + '; '.join(c['detail'] or c['name'] for c in ex['validation']['checks'] if not c['ok']))
    ex['status'] = 'ready'
    return ex


async def refill(uid, mode):
    """Top the buffer up. Safe to call as often as you like: one run per user and mode, and it stops when full."""
    key = (uid, mode)
    if key in _busy or not model_io.available():
        return
    _busy.add(key)
    try:
        async with _lock():
            failures = 0
            while failures < 3:
                store = get_store(uid)
                exs, done = exercises(store), attempts(store)
                level = S.difficulty(done, mode)
                fresh = [e for e in ready(store, mode, exs) if e.get('source') != 'curated' and not S.stale(e, level)]
                if len(fresh) >= S.TARGET_READY:
                    break
                for old in [e for e in ready(store, mode, exs) if S.stale(e, level)][:1]:
                    store.delete_track_record(EX, old['id'])      # made for an older level: replace, don't serve
                recent = [e.get('archetype') for e in sorted(exs, key=lambda e: -e.get('created_at', 0))[:12]]
                spec = S.choose(done, mode, recent_archetypes=recent, executable=EXECUTABLE_ON)
                try:
                    ex = await asyncio.to_thread(make, spec)
                except Exception as e:   # a failed attempt is logged, never shown as a broken exercise
                    failures += 1
                    errors[key] = f'{type(e).__name__}: {e}'[:300]
                    log.warning('coding: generation failed for %s %s: %s', mode, spec['category'], e)
                    continue
                errors.pop(key, None)
                store.put_track_record(EX, ex['id'], ex)
            _prune(get_store(uid))
    except Exception:
        log.exception('coding: refill crashed')
    finally:
        _busy.discard(key)


def kick(uid, mode):
    """Start a refill without waiting for it."""
    try:
        asyncio.get_running_loop().create_task(refill(uid, mode))
    except RuntimeError:
        pass


def _prune(store):
    served = sorted((e for e in exercises(store) if e.get('status') == 'served'), key=lambda e: -e.get('created_at', 0))
    for old in served[KEEP_SERVED:]:
        store.delete_track_record(EX, old['id'])


def take(store, mode, category=None):
    """The best ready exercise for the latest results, marked served; else one from the curated pool. Never waits."""
    exs, done = exercises(store), attempts(store)
    level = S.difficulty(done, mode)
    weak = S.weakness(done, mode, 'category', list(S.CATEGORIES[mode]))
    pool = [e for e in ready(store, mode, exs) if category in (None, e['category'])]
    if pool:
        best = min(pool, key=lambda e: (S.fit(e, level), -weak.get(e['category'], 0.5), e.get('created_at', 0)))
        return store.put_track_record(EX, best['id'], {**best, 'status': 'served', 'served_at': time.time()}, best.get('revision'))
    seen = {e['title'] for e in exs if e.get('source') == 'curated'}
    ex = fallback.pick(mode, category, seen)
    if ex is None:
        return None
    return store.put_track_record(EX, ex['id'], {**ex, 'status': 'served', 'served_at': time.time()})
