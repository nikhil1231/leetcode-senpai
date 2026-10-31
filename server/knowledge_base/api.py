"""HTTP API for the knowledge base: /api/knowledge/... Raw evidence is stored before anything is derived.

Reads recompute what you hold from every source on each request (one user, small data).
Writes are answers and exposures (`POST /events`, idempotent per source and key) and
misconceptions. Callers are the signed-in browser, or a service on the box holding a source
token (config.KNOWLEDGE_SOURCE_TOKENS), whose name is recorded as the source.
"""
import hmac
import time
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from .. import auth, config
from ..store import get_store
from . import catalog as cat, model, sources

router = APIRouter(prefix='/api/knowledge', tags=['knowledge'])
KEY = r'^[A-Za-z0-9_.:-]{1,120}$'
SOURCE = r'^[a-z][a-z0-9-]{1,30}$'
LATE = 30 * 86400   # a queued answer may arrive late, but not from long ago
SKEW = 300
COURSE_TRACKS = ('fundamentals', 'ai')


async def caller(authorization: str = Header(None), cf_access_jwt_assertion: str = Header(None)):
    """-> {uid, source}. A source token pins the source; a browser caller names its own."""
    if authorization and authorization.lower().startswith('bearer ') and config.KNOWLEDGE_SOURCE_TOKENS:
        token = authorization.split(' ', 1)[1].strip().encode()
        for name, secret in config.KNOWLEDGE_SOURCE_TOKENS.items():
            if hmac.compare_digest(token, secret.encode()):
                return {'uid': config.ACCESS_UID, 'source': name}
    return {'uid': await auth.require_user(authorization, cf_access_jwt_assertion), 'source': None}


def evidence(store, now):
    c = cat.CATALOG
    records = {'system-design': store.list_design_records(), **{t: store.list_track_records(t) for t in COURSE_TRACKS}}
    events = sources.derived(c, records) + sources.direct(c, store.list_knowledge('knowledge_events'))
    states, seen = model.replay(events, now)
    return c, events, states, seen, store.list_knowledge('knowledge_misconceptions')


def _point(pid):
    c = cat.CATALOG
    canonical = cat.canonical(c, pid)
    if not canonical:
        raise HTTPException(404, f'Unknown knowledge point {pid}')
    return canonical


def _source(who, named):
    return who['source'] or named or 'app'


@router.get('')
def overview(who=Depends(caller)):
    """Totals and the section → category → lesson → subtopic tree, plus catalog health."""
    now = time.time()
    c, events, states, seen, mis = evidence(get_store(who['uid']), now)
    by_source = {}
    for e in events:
        by_source[e.get('source') or 'unknown'] = by_source.get(e.get('source') or 'unknown', 0) + 1
    return {**model.summary(c, states, seen, mis, now),
            'catalog': {'points': len(cat.active(c)), 'aliases': len(c['aliases']), 'stale': c['stale'],
                        'unmapped': {s: len(v) for s, v in c['unmapped'].items()}, 'problems': c['problems']},
            'evidence': by_source}


@router.get('/catalog')
def catalog(section: str | None = None, lesson: str | None = None, who=Depends(caller)):
    """The points themselves (no learner state), with links and the items that test each."""
    c = cat.CATALOG
    tested = {}
    for item, pids in c['items'].items():
        for p in pids:
            tested.setdefault(p, []).append(item)
    return {'points': [{**{k: p[k] for k in ('id', 'section', 'category', 'lesson', 'lesson_title', 'subtopic', 'kind',
                                             'claim', 'prompt', 'objectives', 'requires')},
                        'used_by': c['used_by'].get(p['id'], []), 'items': sorted(tested.get(p['id'], []))}
                       for p in cat.active(c)
                       if (not section or p['section'] == section) and (not lesson or p['lesson'] == lesson)],
            'aliases': c['aliases']}


@router.get('/points')
def points(section: str | None = None, category: str | None = None, lesson: str | None = None,
           status: list[str] = Query(default=[]), kind: list[str] = Query(default=[]),
           limit: int = Query(default=2000, ge=1, le=5000), who=Depends(caller)):
    now = time.time()
    c, _, states, seen, mis = evidence(get_store(who['uid']), now)
    out = [v for v in model.views(c, states, seen, mis, now)
           if (not section or v['section'] == section) and (not category or v['category'] == category)
           and (not lesson or v['lesson'] == lesson) and (not status or v['status'] in status)
           and (not kind or v['kind'] in kind)]
    return {'points': out[:limit], 'total': len(out)}


@router.get('/points/{pid}')
def point(pid: str, who=Depends(caller)):
    """One point: what you hold, its prerequisites and dependants, the items that test it, its history."""
    pid, now = _point(pid), time.time()
    c, events, states, seen, mis = evidence(get_store(who['uid']), now)
    p = c['points'][pid]
    vs = {v['id']: v for v in model.views(c, states, seen, mis, now,
                                          [c['points'][x] for x in [pid] + p['requires'] + c['used_by'].get(pid, [])])}
    history = sorted((e for e in events if e['point'] == pid), key=lambda e: -e['at'])[:50]
    return {**vs[pid], 'objectives': p['objectives'],
            'requires': [vs[r] for r in p['requires']], 'used_by': [vs[u] for u in c['used_by'].get(pid, [])],
            'items': sorted(i for i, pids in c['items'].items() if pid in pids),
            'aliases': sorted(a for a, t in c['aliases'].items() if t == pid),
            'history': [{k: e.get(k) for k in ('at', 'kind', 'clean', 'depth', 'strength', 'blame', 'source', 'ref')}
                        for e in history],
            'misconception_log': sorted((m for m in mis if m['point'] == pid), key=lambda m: -m['created_at'])}


@router.get('/next')
def next_points(n: int = Query(default=10, ge=1, le=50), mode: Literal['review', 'learn', 'any'] = 'review',
                section: str | None = None, category: str | None = None, lesson: str | None = None,
                kind: list[str] = Query(default=[]), exclude: list[str] = Query(default=[]),
                cooldown: int = Query(default=0, ge=0, le=7 * 86400), who=Depends(caller)):
    """What to practise next, most useful first, each with why it was chosen. For any surface."""
    now = time.time()
    c, _, states, seen, mis = evidence(get_store(who['uid']), now)
    picked = model.pick(c, states, seen, mis, now, n=n, mode=mode, section=section, category=category,
                        lesson=lesson, kinds=set(kind) or None, exclude=exclude, cooldown=cooldown)
    vs = {v['id']: v for v in model.views(c, states, seen, mis, now, [x['point'] for x in picked])}
    return {'points': [{'reason': x['reason'], **vs[x['point']['id']]} for x in picked]}


class EventIn(BaseModel):
    key: str = Field(pattern=KEY, description="The source's idempotency key: a retried post records once.")
    kind: Literal['answer', 'exposure'] = 'answer'
    points: list[str] = Field(min_length=1, max_length=10)
    clean: bool | None = Field(default=None, description='Answers only: right first time, without help.')
    failed: list[str] = Field(default_factory=list, max_length=10,
                              description='For a miss, the points that failed, when the source knows.')
    depth: Literal['recognise', 'recall', 'explain', 'apply'] | None = None
    strength: Literal['hard', 'soft'] = 'hard'
    partial: bool = Field(default=False, description='A miss that was partly right: weakens memory instead of resetting it.')
    at: float | None = None
    note: str = Field(default='', max_length=500)
    ref: str = Field(default='', max_length=200)


class EventsIn(BaseModel):
    source: str | None = Field(default=None, pattern=SOURCE)
    events: list[EventIn] = Field(min_length=1, max_length=100)


@router.post('/events')
def record(body: EventsIn, who=Depends(caller)):
    """Record answers and exposures from any source. Unknown points reject the whole batch."""
    now, store, source = time.time(), get_store(who['uid']), _source(who, body.source)
    problems = []
    for e in body.events:
        unknown = [p for p in e.points + e.failed if not cat.canonical(cat.CATALOG, p)]
        if unknown:
            problems.append(f'{e.key}: unknown points {unknown}')
        if e.kind == 'answer' and e.clean is None:
            problems.append(f'{e.key}: an answer needs clean')
        if not set(e.failed) <= set(e.points):
            problems.append(f'{e.key}: failed points must be among its points')
        if e.partial and e.clean is not False:
            problems.append(f'{e.key}: only a miss can be partial')
        if e.at is not None and not now - LATE <= e.at <= now + SKEW:
            problems.append(f'{e.key}: at is outside the last 30 days')
    if problems:
        raise HTTPException(422, problems)
    recorded, duplicates = write_events(store, source, [e.model_dump() for e in body.events], now)
    touched = [p for e in body.events for p in e.points]
    c, _, states, seen, mis = evidence(store, time.time())
    ids = list(dict.fromkeys(cat.canonical(c, p) for p in touched))
    return {'recorded': recorded, 'duplicates': duplicates,
            'points': model.views(c, states, seen, mis, time.time(), [c['points'][p] for p in ids])}


class MisconceptionIn(BaseModel):
    key: str = Field(pattern=KEY)
    point: str = Field(max_length=200)
    text: str = Field(min_length=3, max_length=500, description='A wrong belief ("write-through prevents stale reads"), or for a gap the piece the learner keeps missing.')
    quote: str = Field(default='', max_length=1000, description="The learner's own words that showed it.")
    source: str | None = Field(default=None, pattern=SOURCE)
    kind: Literal['belief', 'gap'] = 'belief'
    ask: str = Field(default='', max_length=300, description='For a gap: a question about just the missing piece.')


class MisconceptionUpdate(BaseModel):
    status: Literal['open', 'resolved']
    note: str = Field(default='', max_length=500)


@router.get('/misconceptions')
def misconceptions(status: Literal['open', 'resolved'] | None = None, point: str | None = None, who=Depends(caller)):
    found = get_store(who['uid']).list_knowledge('knowledge_misconceptions')
    pid = cat.canonical(cat.CATALOG, point) if point else None
    return {'misconceptions': sorted((m for m in found if (not status or m['status'] == status)
                                      and (not point or m['point'] == pid)), key=lambda m: -m['created_at'])}


@router.post('/misconceptions')
def add_misconception(body: MisconceptionIn, who=Depends(caller)):
    store, source, pid, now = get_store(who['uid']), _source(who, body.source), _point(body.point), time.time()
    if body.kind == 'gap':
        return open_gap(store, source, body.key, pid, body.text, body.ask, body.quote, now)
    return add_misconception(store, source, body.key, pid, body.text, body.quote, now)


@router.patch('/misconceptions/{key}')
def update_misconception(key: str, body: MisconceptionUpdate, who=Depends(caller)):
    saved = set_misconception(get_store(who['uid']), key, body.status, body.note, time.time())
    if saved is None:
        raise HTTPException(404, 'Unknown misconception')
    return saved


# ---- writes shared with other modules (the tutor) -----------------------------------------
# Inputs are already validated: point ids exist and keys match KEY.

def write_events(store, source, events, now):
    """Store answer/exposure dicts (EventIn fields) once each. -> (recorded, duplicate keys)."""
    recorded, duplicates = 0, []
    for e in events:
        doc = {'kind': e.get('kind', 'answer'), 'points': list(e['points']), 'at': min(e.get('at') or now, now),
               'source': source, 'recorded_at': now, 'note': e.get('note', ''), 'ref': e.get('ref', '')}
        if doc['kind'] == 'answer':
            doc.update(clean=bool(e['clean']), failed=list(e.get('failed') or []), depth=e.get('depth'),
                       strength=e.get('strength', 'hard'), partial=bool(e.get('partial')) and not e['clean'])
        if store.create_knowledge('knowledge_events', f'{source}:{e["key"]}', doc) is None:
            duplicates.append(e['key'])
        else:
            recorded += 1
    return recorded, duplicates


def add_misconception(store, source, key, point, text, quote, now, kind='belief', ask=''):
    key = f'{source}:{key}'
    doc = {'point': point, 'text': text.strip(), 'quote': (quote or '').strip(), 'source': source,
           'status': 'open', 'created_at': now, 'resolved_at': None, 'note': '', 'kind': kind, 'ask': (ask or '').strip()}
    saved = store.create_knowledge('knowledge_misconceptions', key, doc)
    if saved is None:
        return {'duplicate': True, **next(m for m in store.list_knowledge('knowledge_misconceptions') if m['_key'] == key)}
    return {'duplicate': False, **saved}


def open_gap(store, source, key, point, text, ask, quote, now):
    """A piece of an idea the learner keeps missing. One open gap per point: a repeat updates it."""
    found = next((m for m in store.list_knowledge('knowledge_misconceptions')
                  if m['point'] == point and m['status'] == 'open' and m.get('kind') == 'gap'), None)
    if not found:
        return add_misconception(store, source, key, point, text, quote, now, kind='gap', ask=ask)
    doc = {k: v for k, v in found.items() if k != '_key'}
    doc.update(text=text.strip() or doc['text'], ask=(ask or '').strip() or doc.get('ask', ''),
               quote=(quote or '').strip() or doc['quote'], repeats=doc.get('repeats', 0) + 1, updated_at=now)
    return {'duplicate': True, **store.put_knowledge('knowledge_misconceptions', found['_key'], doc)}


def resolve_open(store, point, now, note, kind=None):
    """Close every open misconception (or only one kind) on a point. -> keys closed."""
    keys = [m['_key'] for m in store.list_knowledge('knowledge_misconceptions')
            if m['point'] == point and m['status'] == 'open' and (kind is None or m.get('kind', 'belief') == kind)]
    for k in keys:
        set_misconception(store, k, 'resolved', note, now)
    return keys


def set_misconception(store, key, status, note, now):
    found = next((m for m in store.list_knowledge('knowledge_misconceptions') if m['_key'] == key), None)
    if not found:
        return None
    doc = {k: v for k, v in found.items() if k != '_key'}
    doc.update(status=status, note=note or found.get('note', ''), resolved_at=now if status == 'resolved' else None)
    return store.put_knowledge('knowledge_misconceptions', key, doc)
