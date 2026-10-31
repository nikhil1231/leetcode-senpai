"""The feed: a few full-screen cards to swipe through, Shorts-style, on the phone. /feed

Built for a short "toll" before YouTube (an iOS Shortcut opens /feed?then=youtube when YouTube
opens), and good for any spare minute. Cards are chosen like the Telegram drip's (open gaps first,
then misconceptions, shaky and fading points, then the rest), never the point a drip card is
still waiting on, and read in the cast's voice. You tap to see the idea and say whether you knew
it (self-graded, soft evidence); a card swiped past is an exposure. A "knew it" on a gap card
closes the gap. No model is involved anywhere.

Bedtime and morning: ?set=tonight deals the ideas you missed today first (the drip links to it
at bedtime), ?set=morning re-checks last night's misses you have not answered since, after sleep.
The default, auto, picks morning before noon and tonight from 20:00. GET /api/feed/tonight.txt
is today's misses as plain text, for the nightly write-up. Pure: deck, card, misses, morning,
choose_set. I/O: the router.
Intent: docs/plans/ambient-learning.md.
"""
import datetime as dt
import random
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from .drip import cards as dcards
from .knowledge_base import api as kb_api, catalog as kcat, model as kmodel
from .tutor import story

router = APIRouter(prefix='/api/feed', tags=['feed'])
SOURCE = 'feed'


def card(point, reason, gap=None):
    who = dcards.speaker(point)
    return {'point': point['id'], 'reason': reason, 'tag': dcards.TAG.get(reason, ''), 'kind': point['kind'],
            'speaker': who['name'], 'role': who['role'], 'lead': dcards.LEAD[who['id']],
            'ask': (gap or {}).get('ask') or point['prompt'], 'claim': point['claim'],
            'focus': (gap or {}).get('text') or '', 'gap': (gap or {}).get('_key') or '',
            'lesson': point['lesson_title'], 'section': point['section']}


def misses(events, start, end):
    """Points answered wrongly or partly between start and end, latest first, once each."""
    found = {}
    for e in events:
        if e['kind'] == 'answer' and not e['clean'] and start <= e['at'] < end:
            found[e['point']] = max(found.get(e['point'], 0), e['at'])
    return sorted(found, key=lambda p: -found[p])


def morning(events, yesterday, today):
    """Yesterday's misses that nothing has asked about since midnight: the check after sleep."""
    since = {e['point'] for e in events if e['kind'] == 'answer' and e['at'] >= today}
    return [p for p in misses(events, yesterday, today) if p not in since]


def choose_set(name, hour):
    if name != 'auto':
        return name
    return 'morning' if hour < 12 else 'tonight' if hour >= 20 else 'due'


def deck(catalog, states, seen, misconceptions, now, n, rng=None, exclude=(), first=(), first_reason='tonight'):
    """-> up to n cards, best first, no point twice. `first`: point ids to deal before anything else."""
    rng, out, taken = rng or random.Random(), [], set(exclude)
    for pid in first:
        if len(out) >= n:
            break
        pid = kcat.canonical(catalog, pid)
        if pid and pid not in taken:
            taken.add(pid)
            out.append(card(catalog['points'][pid], first_reason, dcards.open_gap(misconceptions, pid)))
    while len(out) < n:
        point, reason = dcards.pick(catalog, states, seen, misconceptions, now, rng, exclude=tuple(taken))
        if not point:
            break
        taken.add(point['id'])
        gap = dcards.open_gap(misconceptions, point['id']) if reason == 'gap' else None
        out.append(card(point, reason, gap))
    return out


def _waiting_on(store):
    """The point a drip card is still waiting on, so the same question is not open in two places."""
    state = store.get_knowledge('drip', 'state') or {}
    c = store.get_knowledge('drip', f'card-{state["pending"]}') if state.get('pending') is not None else None
    return [c['point']] if c and c.get('status') == 'pending' else []


def day_bounds(now, tz):
    """-> (yesterday's local midnight, today's, the local hour) as timestamps."""
    local = dt.datetime.fromtimestamp(now, tz)
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return (midnight - dt.timedelta(days=1)).timestamp(), midnight.timestamp(), local.hour


def tonight_points(store, now):
    _, events, _, _, _ = kb_api.evidence(store, now)
    _, today, _ = day_bounds(now, dcards.tz_for(store.get_settings()))
    return misses(events, today, now + 1)


@router.get('')
def get_deck(n: int = Query(default=3, ge=1, le=10), set: Literal['auto', 'due', 'tonight', 'morning'] = 'auto',
             who=Depends(kb_api.caller)):
    now, store = time.time(), kb_api.get_store(who['uid'])
    c, events, states, seen, mis = kb_api.evidence(store, now)
    yesterday, today, hour = day_bounds(now, dcards.tz_for(store.get_settings()))
    chosen = choose_set(set, hour)
    first = misses(events, today, now + 1) if chosen == 'tonight' else morning(events, yesterday, today) if chosen == 'morning' else []
    summary = kmodel.summary(c, states, seen, mis, now)
    sc = story.scale(summary)
    return {'cards': deck(c, states, seen, mis, now, n, exclude=_waiting_on(store), first=first, first_reason=chosen),
            'set': chosen, 'first': len(first),
            'company': {'label': sc['label'], 'users': sc['users'], 'pct': summary['pct']}}


@router.get('/tonight.txt', response_class=PlainTextResponse)
def tonight_text(who=Depends(kb_api.caller)):
    """Today's misses as plain text, one question and its idea each, for the nightly write-up."""
    now, store = time.time(), kb_api.get_store(who['uid'])
    pts = [kcat.CATALOG['points'][p] for p in tonight_points(store, now)]
    if not pts:
        return 'Nothing missed today.\n'
    return ''.join(f'- {p["prompt"]}\n  {p["claim"]}\n' for p in pts)


class ResultIn(BaseModel):
    key: str = Field(pattern=kb_api.KEY)
    point: str = Field(max_length=200)
    outcome: Literal['knew', 'missed', 'seen']
    gap: str = Field(default='', max_length=200)


@router.post('/result')
def result(body: ResultIn, who=Depends(kb_api.caller)):
    now, store = time.time(), kb_api.get_store(who['uid'])
    pid = kcat.canonical(kcat.CATALOG, body.point)
    if not pid:
        raise HTTPException(404, f'Unknown knowledge point {body.point}')
    point = kcat.CATALOG['points'][pid]
    if body.outcome == 'seen':
        event = {'key': body.key, 'kind': 'exposure', 'points': [pid]}
    else:
        knew = body.outcome == 'knew'
        event = {'key': body.key, 'points': [pid], 'clean': knew, 'strength': 'soft', 'ref': body.key,
                 'depth': dcards.depth(point) if knew else 'recall', 'note': f'self-graded: {body.outcome}'}
    recorded, _ = kb_api.write_events(store, SOURCE, [event], now)
    closed = []
    if recorded and body.outcome == 'knew' and body.gap:
        closed = kb_api.resolve_open(store, pid, now, 'Knew the missing piece in the feed.', kind='gap')
    return {'recorded': bool(recorded), 'closed_gaps': closed}
