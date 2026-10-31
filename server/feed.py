"""The feed: a few full-screen cards to swipe through, Shorts-style, on the phone. /feed

Built for a short "toll" before YouTube (an iOS Shortcut opens /feed?then=youtube when YouTube
opens), and good for any spare minute. Cards are chosen like the Telegram drip's (open gaps first,
then misconceptions, shaky and fading points, then the rest), never the point a drip card is
still waiting on, and read in the cast's voice. You tap to see the idea and say whether you knew
it (self-graded, soft evidence); a card swiped past is an exposure. A "knew it" on a gap card
closes the gap. No model is involved anywhere. Pure: deck, card. I/O: the router.
Intent: docs/plans/ambient-learning.md.
"""
import random
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
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


def deck(catalog, states, seen, misconceptions, now, n, rng=None, exclude=()):
    """-> up to n cards, best first, no point twice."""
    rng, out, taken = rng or random.Random(), [], set(exclude)
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


@router.get('')
def get_deck(n: int = Query(default=3, ge=1, le=10), who=Depends(kb_api.caller)):
    now, store = time.time(), kb_api.get_store(who['uid'])
    c, _, states, seen, mis = kb_api.evidence(store, now)
    summary = kmodel.summary(c, states, seen, mis, now)
    sc = story.scale(summary)
    return {'cards': deck(c, states, seen, mis, now, n, exclude=_waiting_on(store)),
            'company': {'label': sc['label'], 'users': sc['users'], 'pct': summary['pct']}}


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
