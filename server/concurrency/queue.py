"""The question buffer: TARGET_READY ready, at most MAX_UNCOMPLETED unfinished, topped up in the background.

A question's state is read from the data rather than kept in step by hand: ready until started; once started it is a
problem in the library, in progress until any attempt on its slug exists, then done. Discarded questions leave the list
and the library. Generation runs one at a time for the whole process (the box is shared, LocalRouter has limited slots),
is triggered by opening the list, starting a question and finishing one, and stops when spec.should_refill says so. The
Generate button asks for one more whatever the buffer holds. Nothing here is ever waited on by the solve flow."""
import asyncio
import logging
import random
import time

from .. import assessment, packs
from ..coding import model_io
from ..store import get_store
from . import generate, spec as S, validate

log = logging.getLogger(__name__)
QK = 'conc_q'
RECENT = 12

_busy: set = set()
_extra: dict = {}       # uid -> Generate presses not yet served
_sem = None
errors: dict = {}       # uid -> last failure, for the list


def _lock():
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(1)
    return _sem


def questions(store):
    return store.list_track_records(QK)


def custom_attempts(store):
    return [a for a in store.list_attempts() if S.is_custom(a.get('slug')) and a.get('kind') not in ('recall', 'sprint')]


def state(store, qs=None, attempts=None):
    """{ready, in_progress, done, discarded}: lists of questions, newest first, and attempts by slug."""
    qs = questions(store) if qs is None else qs
    attempts = custom_attempts(store) if attempts is None else attempts
    by_slug = {}
    for a in attempts:
        by_slug.setdefault(a['slug'], []).append(a)
    out = {'ready': [], 'in_progress': [], 'done': [], 'discarded': [], 'attempts': by_slug}
    for q in sorted(qs, key=lambda q: -(q.get('started_at') or q.get('created_at') or 0)):
        if q.get('status') == 'discarded':
            out['discarded'].append(q)
        elif q.get('status') == 'ready':
            out['ready'].append(q)
        elif q.get('status') == 'started':
            out['done' if by_slug.get(q.get('slug')) else 'in_progress'].append(q)
    return out


def history(store, qs=None):
    """Solves in time order for spec.current_level: custom questions at their level, LeetCode's own at level 2."""
    qs = questions(store) if qs is None else qs
    by_slug = {q['slug']: q for q in qs if q.get('slug')}
    base = set(packs.CONCURRENCY['Concurrency'])
    out = []
    for a in sorted(store.list_attempts(), key=lambda a: a.get('solved_at') or 0):
        if a.get('kind') in ('recall', 'sprint'):
            continue
        slug = a.get('slug')
        q = by_slug.get(slug)
        if q is None and slug not in base:
            continue
        outcome = S.outcome({**a, 'independence': assessment.independence(a)})
        out.append({'level': q['level'] if q else S.BASE_LEVEL, 'outcome': outcome, 'base': q is None,
                    'tools': (q or {}).get('tools') or []})
    return out


def next_spec(store, rng=random):
    qs = questions(store)
    hist = history(store, qs)
    level = S.current_level(hist)
    st = state(store, qs)
    target = S.pick_level(level, [q['level'] for q in st['ready']], rng)
    recent = sorted(qs, key=lambda q: -(q.get('created_at') or 0))[:RECENT]
    topic, focus = S.choose_topic(target, [q.get('topic') for q in reversed(recent)], S.weak_tools(hist), rng)
    discarded = [f"{q['title']}: {S.DISCARD_REASONS.get((q.get('discard') or {}).get('reason'), 'discarded')}"
                 + (f" ({q['discard']['note']})" if (q.get('discard') or {}).get('note') else '')
                 for q in st['discarded'][:4]]
    return {'level': target, 'topic': topic['key'], 'focus_tool': focus,
            'avoid_titles': [q['title'] for q in recent], 'discarded': discarded}


def generating(uid):
    return uid in _busy


async def refill(uid):
    """Make questions until the buffer is full and every Generate press is served. One run per user; three failures
    in a row end it (the error shows in the list)."""
    if uid in _busy or not model_io.available():
        return
    _busy.add(uid)
    try:
        async with _lock():
            failures = 0
            while failures < 3:
                store = get_store(uid)
                st = state(store)
                if _extra.get(uid, 0) <= 0 and not S.should_refill(len(st['ready']), len(st['in_progress'])):
                    break
                spec = next_spec(store)
                try:
                    q = await asyncio.to_thread(validate.make, spec)
                except Exception as e:   # a failed question is logged, never served
                    failures += 1
                    errors[uid] = f'{type(e).__name__}: {e}'[:400]
                    log.warning('concurrency: generation failed at level %s (%s): %s', spec['level'], spec['topic'], e)
                    if isinstance(e, model_io.OutputLimitError):
                        break
                    continue
                failures = 0
                errors.pop(uid, None)
                if _extra.get(uid, 0) > 0:
                    _extra[uid] -= 1
                store.put_track_record(QK, q['id'], q)
    except Exception:
        log.exception('concurrency: refill crashed')
    finally:
        _busy.discard(uid)


def kick(uid, extra=False):
    """Start a refill without waiting for it; `extra` is a Generate press."""
    if extra:
        _extra[uid] = _extra.get(uid, 0) + 1
    try:
        asyncio.get_running_loop().create_task(refill(uid))
    except RuntimeError:
        pass


def problem_doc(q):
    """The library problem a started question becomes: what the editor, the plan modal, hints and grading read."""
    return {'slug': q['slug'], 'title': q['title'], 'difficulty': S.difficulty(q['level']),
            'neetcode_category': S.CATEGORY, 'in_library': True, 'source': 'custom', 'custom_id': q['id'],
            'custom_level': q['level'], 'url': '', 'content_html': q['statement_html'], 'question_id': 'custom',
            'starter_code': q['starter'], 'snippets': {'java': q['starter']}, 'editor_lang': 'java',
            'example_testcases': [], 'hint_ladder': q['hints'], 'similar_slugs': [], 'leetcode_tags': [],
            'canonical_summary': {'key_ideas': q['key_ideas'], 'time': '', 'space': ''}}


def start(store, q):
    """Mark a ready question started and put it in the library. Starting one already started (or done) is a no-op."""
    if q.get('status') == 'ready':
        q = {**q, 'status': 'started', 'started_at': time.time(), 'slug': q.get('slug') or S.SLUG_PREFIX + q['id'][3:]}
        store.upsert_problem(problem_doc(q))
        q = store.put_track_record(QK, q['id'], q, q.get('revision'))
    return q


def discard(store, q, reason, note=''):
    """Drop a question from the list (and the library, with its review card) without deleting attempt history."""
    q = store.put_track_record(QK, q['id'], {**q, 'status': 'discarded',
                                             'discard': {'reason': reason, 'note': note[:300], 'at': time.time(),
                                                         'from': q.get('status')}}, q.get('revision'))
    if q.get('slug'):
        store.upsert_problem({'slug': q['slug'], 'in_library': False})
        store.cancel_active_sessions(slug=q['slug'])
    return q


def by_slug(store, slug):
    return next((q for q in questions(store) if q.get('slug') == slug), None)
