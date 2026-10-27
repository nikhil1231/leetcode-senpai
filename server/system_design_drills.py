"""Estimation drills: endless back-of-envelope questions from parametric templates.

Each template turns a seeded random draw of round numbers into a prompt, an answer and the
working. A sprint is a fixed list generated up front and stored, so grading never depends
on regenerating anything. An answer within 25% counts: the skill is order-of-magnitude
fluency, not long division. Blitz is three minutes, as many as you can; Ten is ten questions.
"""
import math
import random
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth
from .store import get_store

router = APIRouter(prefix='/api/system-design', tags=['system-design-drills'])
TOLERANCE = 1.25
MODES = {'blitz': {'label': 'estimation blitz', 'seconds': 180, 'count': 40},
         'ten': {'label': 'ten estimates', 'seconds': None, 'count': 10}}
DAY_SECONDS = 86400


def _fmt(n):
    return f'{n:,.10g}'


def _qps_from_dau(r):
    dau, per = r.choice([1, 2, 5, 10, 20, 50, 100, 200]), r.choice([2, 5, 10, 20, 50])
    ans = dau * 1e6 * per / DAY_SECONDS
    return (f'{dau}M daily active users each make {per} requests a day. Average requests per second?', ans, 'req/s',
            f'{dau}M × {per} = {_fmt(dau * per)}M requests/day; ÷ ~86,400 s (≈ 10⁵) ≈ **{_fmt(round(ans))}/s**. Shortcut: 1M/day ≈ 12/s.')


def _peak(r):
    avg, factor = r.choice([200, 500, 1200, 3000, 8000]), r.choice([2, 3, 5])
    return (f'Average load is {_fmt(avg)} req/s and peak is {factor}× average. Peak requests per second?', avg * factor, 'req/s',
            f'{_fmt(avg)} × {factor} = **{_fmt(avg * factor)}/s**. Size for the peak, not the average.')


def _storage_year(r):
    items, kb = r.choice([1, 2, 5, 10, 50, 100]), r.choice([1, 2, 5, 10, 100, 500])
    ans = items * 1e6 * kb * 1e3 * 365 / 1e12
    return (f'{items}M new records a day, {kb} KB each. Storage added per year, in TB?', ans, 'TB',
            f'{items}M × {kb} KB = {_fmt(items * kb)} GB/day; × 365 ≈ **{_fmt(round(ans, 1))} TB/year** (before replication).')


def _bandwidth(r):
    qps, kb = r.choice([500, 1000, 2000, 5000, 20000]), r.choice([2, 10, 50, 200])
    ans = qps * kb / 1000
    return (f'{_fmt(qps)} responses/s, {kb} KB each. Egress in MB/s?', ans, 'MB/s',
            f'{_fmt(qps)} × {kb} KB = {_fmt(qps * kb)} KB/s ≈ **{_fmt(ans)} MB/s** (× 8 ≈ {_fmt(ans * 8 / 1000)} Gbit/s).')


def _cache_memory(r):
    hot, kb = r.choice([0.5, 1, 2, 5, 10, 20]), r.choice([0.5, 1, 2, 4])
    ans = hot * 1e6 * kb * 1e3 * 1.5 / 1e9
    return (f'{_fmt(hot)}M hot keys, {_fmt(kb)} KB values, budget 1.5× for per-key overhead. Cache memory in GB?', ans, 'GB',
            f'{_fmt(hot)}M × {_fmt(kb)} KB = {_fmt(hot * kb)} GB; × 1.5 ≈ **{_fmt(round(ans, 2))} GB**.')


def _db_load(r):
    reads, hit = r.choice([10000, 20000, 40000, 100000]), r.choice([80, 90, 95, 98, 99])
    ans = reads * (100 - hit) / 100
    return (f'{_fmt(reads)} reads/s with a {hit}% cache hit rate. Reads/s reaching the database?', ans, 'reads/s',
            f'Database load = requests × miss rate = {_fmt(reads)} × {100 - hit}% = **{_fmt(ans)}/s**.')


def _servers(r):
    peak, cap = r.choice([5000, 12000, 30000, 80000]), r.choice([500, 1000, 2000])
    ans = math.ceil(peak / (cap * 0.7))
    return (f'Peak {_fmt(peak)} req/s; one server handles {_fmt(cap)} req/s and you run them at 70%. Servers needed?', ans, 'servers',
            f'{_fmt(peak)} ÷ ({_fmt(cap)} × 0.7 = {_fmt(cap * 0.7)}) ≈ **{ans}** (add one or two for failures).')


def _littles_law(r):
    rate, ms = r.choice([200, 1000, 5000, 20000]), r.choice([20, 50, 100, 250, 500])
    ans = rate * ms / 1000
    return (f'{_fmt(rate)} req/s arrive and each takes {ms} ms. Requests in flight on average (Little’s law)?', ans, 'requests',
            f'L = λ × W = {_fmt(rate)}/s × {ms / 1000:g} s = **{_fmt(ans)}** concurrent requests.')


def _downtime(r):
    nines = r.choice([(99.9, '99.9'), (99.95, '99.95'), (99.99, '99.99'), (99.0, '99')])
    ans = (100 - nines[0]) / 100 * 30 * 24 * 60
    return (f'An SLO of {nines[1]}% availability over a 30-day month allows how many minutes of downtime?', ans, 'minutes',
            f'{100 - nines[0]:g}% of 43,200 minutes ≈ **{_fmt(round(ans, 1))} min**.')


def _retention(r):
    msgs, size, days = r.choice([1000, 10000, 50000, 200000]), r.choice([200, 500, 1000, 2000]), r.choice([1, 3, 7])
    ans = msgs * size * DAY_SECONDS * days / 1e12
    return (f'A log receives {_fmt(msgs)} msgs/s of {_fmt(size)} bytes, kept for {days} day{"s" if days > 1 else ""}. Retained data in TB (one copy)?', ans, 'TB',
            f'{_fmt(msgs)} × {_fmt(size)} B = {_fmt(msgs * size / 1e6)} MB/s; × 86,400 × {days} ≈ **{_fmt(round(ans, 2))} TB**.')


def _partitions(r):
    mb, per = r.choice([50, 120, 300, 800]), r.choice([5, 10, 20])
    ans = math.ceil(mb / per)
    return (f'A topic must absorb {mb} MB/s and one partition handles about {per} MB/s. Minimum partitions?', ans, 'partitions',
            f'{mb} ÷ {per} = **{ans}**; round up and leave headroom for consumers and growth.')


def _per_second(r):
    billions = r.choice([1, 2, 5, 10, 50])
    ans = billions * 1e9 / DAY_SECONDS
    return (f'{billions} billion events a day. Events per second on average?', ans, 'events/s',
            f'{billions}B ÷ 86,400 ≈ **{_fmt(round(ans))}/s** (1B/day ≈ 11.6k/s).')


def _shards(r):
    total, node = r.choice([20, 60, 150, 400]), r.choice([2, 4, 8])
    rf = r.choice([1, 3])
    ans = math.ceil(total * rf / node)
    return (f'{total} TB of data, replication factor {rf}, {node} TB usable per node. Nodes needed for storage?', ans, 'nodes',
            f'{total} × {rf} = {total * rf} TB; ÷ {node} TB ≈ **{ans} nodes** (plus headroom).')


TEMPLATES = {
    'qps-from-dau': ('Requests per second from daily users', _qps_from_dau),
    'peak-load': ('Peak from average load', _peak),
    'storage-per-year': ('Storage growth per year', _storage_year),
    'bandwidth': ('Bandwidth from request rate', _bandwidth),
    'cache-memory': ('Cache memory for a working set', _cache_memory),
    'db-load': ('Database load from hit rate', _db_load),
    'servers-needed': ('Servers for a peak', _servers),
    'littles-law': ('Concurrency from Little’s law', _littles_law),
    'downtime': ('Downtime from an SLO', _downtime),
    'retention': ('Log retention size', _retention),
    'partitions': ('Partitions for throughput', _partitions),
    'per-second': ('Per-second from per-day', _per_second),
    'shards': ('Nodes for a dataset', _shards),
}


def generate(seed, count):
    """A reproducible list of questions, cycling templates so no kind repeats back to back."""
    r = random.Random(seed)
    keys, out = [], []
    while len(keys) < count:
        batch = list(TEMPLATES)
        r.shuffle(batch)
        if keys and batch[0] == keys[-1]:
            batch.append(batch.pop(0))
        keys += batch
    for n, key in enumerate(keys[:count]):
        prompt, answer, unit, working = TEMPLATES[key][1](r)
        out.append({'n': n, 'template': key, 'prompt': prompt, 'answer': float(answer), 'unit': unit, 'working': working})
    return out


def judge(answer, value):
    """True when within ×1.25 either way."""
    if value is None or value <= 0:
        return False
    ratio = value / answer
    return 1 / TOLERANCE <= ratio <= TOLERANCE


def number(text):
    text = str(text).strip().replace(',', '').replace('_', '').replace(' ', '').lower()
    scale = {'k': 1e3, 'm': 1e6, 'b': 1e9}.get(text[-1:], 1)
    try:
        return float(text[:-1] if scale != 1 else text) * scale
    except ValueError:
        return None


# ---------- API ----------
class StartSprint(BaseModel):
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    mode: Literal['blitz', 'ten'] = 'blitz'


class SprintAnswer(BaseModel):
    n: int = Field(ge=0, le=99)
    value: str = Field(default='', max_length=40)


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


def read(store, key):
    doc = store.get_design_record(key)
    if not doc or doc.get('kind') != 'sprint':
        raise HTTPException(404, 'Sprint not found')
    return doc


def public(doc):
    out = {k: v for k, v in doc.items() if k != 'questions'}
    answered = doc.get('answers', {})
    out['questions'] = [{k: q[k] for k in ('n', 'template', 'prompt', 'unit')} | (
        {'answer': q['answer'], 'working': q['working']} if str(q['n']) in answered or doc.get('finished_at') else {})
        for q in doc['questions']]
    return out


def finished(doc, now):
    mode = MODES[doc['drill']]
    if doc.get('finished_at'):
        return True
    if mode['seconds'] and now - doc['created_at'] > mode['seconds'] + 5:
        return True
    return len(doc.get('answers', {})) >= len(doc['questions'])


def close(doc, now):
    mode = MODES[doc['drill']]
    end = min(now, doc['created_at'] + mode['seconds']) if mode['seconds'] else now
    score = sum(a['correct'] for a in doc.get('answers', {}).values())
    return {**doc, 'finished_at': int(end), 'elapsed_sec': int(end - doc['created_at']), 'score': score}


@router.post('/drills')
def start_sprint(body: StartSprint, store=Depends(store_for)):
    key = 'sprint_' + body.request_id
    old = store.get_design_record(key)
    if old:
        return public(old)
    mode = MODES[body.mode]
    doc = store.put_design_record(key, {'kind': 'sprint', 'drill': body.mode, 'label': mode['label'],
                                        'created_at': time.time(), 'seconds': mode['seconds'],
                                        'questions': generate(body.request_id, mode['count']), 'answers': {}})
    return public(doc)


@router.get('/drills/{key}')
def get_sprint(key: str, store=Depends(store_for)):
    return public(read(store, key))


@router.post('/drills/{key}/answer')
def answer_sprint(key: str, body: SprintAnswer, store=Depends(store_for)):
    for _ in range(3):
        doc = read(store, key)
        now = time.time()
        if body.n >= len(doc['questions']):
            raise HTTPException(422, 'Unknown question')
        if str(body.n) in doc['answers'] or finished(doc, now):
            if not doc.get('finished_at') and finished(doc, now):
                doc = store.put_design_record(key, close(doc, now), doc['revision'])
            return public(doc)
        q = doc['questions'][body.n]
        value = number(body.value)
        if value is None:
            raise HTTPException(422, 'Enter a number')
        answers = {**doc['answers'], str(body.n): {'value': body.value, 'correct': judge(q['answer'], value), 'at': now}}
        update = {**doc, 'answers': answers}
        if finished(update, now):
            update = close(update, now)
        try:
            return public(store.put_design_record(key, update, doc['revision']))
        except ValueError:
            continue
    raise HTTPException(409, 'Reload to recover the sprint')


@router.post('/drills/{key}/finish')
def finish_sprint(key: str, store=Depends(store_for)):
    doc = read(store, key)
    if doc.get('finished_at'):
        return public(doc)
    try:
        return public(store.put_design_record(key, close(doc, time.time()), doc['revision']))
    except ValueError as exc:
        raise HTTPException(409, 'Reload to recover the sprint') from exc


@router.get('/drills')
def list_sprints(store=Depends(store_for)):
    rows = [r for r in store.list_design_records() if r.get('kind') == 'sprint' and r.get('finished_at')]
    rows.sort(key=lambda r: -r['finished_at'])
    best = {}
    for r in rows:
        if r['score'] > best.get(r['drill'], -1):
            best[r['drill']] = r['score']
    return {'modes': {k: {'label': v['label'], 'seconds': v['seconds'], 'count': v['count']} for k, v in MODES.items()},
            'best': best, 'recent': [{k: r[k] for k in ('id', 'drill', 'score', 'finished_at', 'elapsed_sec')}
                                     | {'answered': len(r['answers'])} for r in rows[:10]],
            'templates': {k: v[0] for k, v in TEMPLATES.items()}}
