"""The wall: bright posters of what you are learning, for any screen you glance at. /wall

A poster is one knowledge point: its question large, its idea revealed a little later. Weak
points come up more often (open misconceptions, then shaky, fading and unconfirmed ones), and
ideas from lessons you have started fill the rest. The fading map draws Ripple's architecture,
each part coloured by how much of that area you currently hold, so it fades as memory does.

Surfaces: /wall cycles posters full screen (a TV, a projector, a Mac screensaver, a phone on
StandBy); /wall?print=1 lays six out for a weekly colour print; /api/wall/poster.png draws one
as a phone or desktop wallpaper, a new question every two hours and its answer in the second
hour. Showing a poster records nothing unless asked (?log=1), because a screen on the wall is
not proof anyone looked. Pure: weight, posters, slot, fading_map. I/O: render_png, the router.
Intent: docs/plans/ambient-learning.md.
"""
import datetime as dt
import hashlib
import io
import os
import random
import time
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from .drip import cards as dcards
from .knowledge_base import api as kb_api, model as kmodel
from .tutor import story

router = APIRouter(prefix='/api/wall', tags=['wall'])
FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')
COLOURS = {'fact': '#ffd84d', 'principle': '#ff8fb8', 'mechanism': '#5fe0e8', 'tradeoff': '#ffad5c', 'procedure': '#8ce99a'}
INK = '#12131a'
SLOT_HOURS = 2


def weight(v, started):
    """How often a point should appear. 0: never (an idea from a lesson you have not opened)."""
    if v['misconceptions']:
        return 6
    if v['status'] == 'unseen':
        return 1.5 if v['lesson'] in started else 0
    if v['unconfirmed']:
        return 3
    return {'shaky': 5, 'fading': 4, 'learning': 2, 'solid': 1}.get(v['status'], 1)


def started_lessons(views):
    return {v['lesson'] for v in views if v['status'] != 'unseen' or v['exposures']}


def poster(v):
    who = dcards.speaker(v)
    reason = 'misconception' if v['misconceptions'] else 'unconfirmed' if v['unconfirmed'] else \
        {'unseen': 'new', 'solid': 'held', 'learning': 'held'}.get(v['status'], v['status'])
    return {'point': v['id'], 'kind': v['kind'], 'colour': COLOURS.get(v['kind'], COLOURS['fact']),
            'ask': v['prompt'], 'claim': v['claim'], 'lesson': v['lesson_title'], 'status': v['status'],
            'tag': dcards.TAG.get(reason, ''), 'speaker': who['name'], 'role': who['role']}


def posters(views, n, rng=None):
    """Up to n distinct posters, sampled by weight; with nothing started, the course's first ideas."""
    rng = rng or random.Random()
    started = started_lessons(views)
    pool = [(v, weight(v, started)) for v in views]
    pool = [(v, w) for v, w in pool if w > 0]
    if not pool:
        first = views[0]['lesson'] if views else None
        pool = [(v, 1) for v in views if v['lesson'] == first]
    out = []
    while pool and len(out) < n:
        x = rng.uniform(0, sum(w for _, w in pool))
        for i, (v, w) in enumerate(pool):
            x -= w
            if x <= 0 or i == len(pool) - 1:
                out.append(poster(v))
                pool.pop(i)
                break
    return out


def slot(now_local):
    """-> (key, reveal): a new point every SLOT_HOURS, its answer shown in the second half."""
    block = now_local.hour // SLOT_HOURS
    key = f'{now_local.date().isoformat()}-{block}'
    return key, (now_local.hour % SLOT_HOURS) >= SLOT_HOURS / 2


def slot_poster(views, key):
    seed = int(hashlib.sha256(key.encode()).hexdigest()[:12], 16)
    found = posters(views, 1, random.Random(seed))
    return found[0] if found else None


# Ripple's architecture: system design areas as the parts of one system (x, y, w, h on a 1600x900
# canvas, and a name for the part), then the other sections as rooms beside it.
LAYOUT = {
    'designs': (40, 30, 590, 110, 'Whole-system designs'),
    'casebook': (670, 30, 590, 110, 'Classic designs'),
    'specialised': (980, 190, 280, 160, 'Search, geo and feeds'),
    'caching': (660, 190, 280, 160, 'Cache'),
    'foundations': (40, 390, 260, 160, 'Edge and networking'),
    'apis': (340, 390, 280, 160, 'API servers'),
    'storage': (660, 390, 280, 160, 'Databases'),
    'distributed': (980, 390, 280, 160, 'Replication and consistency'),
    'queues': (340, 590, 280, 150, 'Queues and workers'),
    'reliability': (40, 780, 1220, 90, 'Reliability and on-call'),
}
EDGES = [('foundations', 'apis'), ('apis', 'caching'), ('apis', 'storage'), ('caching', 'storage'),
         ('apis', 'queues'), ('storage', 'distributed'), ('caching', 'specialised')]


def fading_map(summary):
    """-> {parts, edges, rooms}: every area with how well you hold the ideas you have met there
    (strength, which fades with memory) and how much of the area you have met at all (coverage)."""
    def area(c):
        met = c['total'] - c['counts'].get('unseen', 0)
        strength = round(100 * c['knowledge'] / met) if met else 0   # how well you hold what you have met
        return {'id': c['id'], 'title': c['title'], 'pct': c['pct'], 'total': c['total'], 'met': met,
                'strength': min(100, strength), 'coverage': round(100 * met / c['total']) if c['total'] else 0,
                'shaky': c['counts'].get('shaky', 0), 'fading': c['counts'].get('fading', 0)}
    parts, rooms = [], []
    for s in summary['sections']:
        if s['id'] == 'system-design':
            for c in s['categories']:
                if c['id'] in LAYOUT:
                    x, y, w, h, name = LAYOUT[c['id']]
                    parts.append({**area(c), 'name': name, 'x': x, 'y': y, 'w': w, 'h': h})
        else:
            rooms.append({'id': s['id'], 'title': s['title'], 'pct': s['pct'],
                          'areas': [area(c) for c in s['categories']]})
    ids = {p['id'] for p in parts}
    return {'parts': parts, 'edges': [e for e in EDGES if e[0] in ids and e[1] in ids], 'rooms': rooms}


# ---- drawing a wallpaper -----------------------------------------------------------------

def _font(size, bold=True):
    from PIL import ImageFont
    return ImageFont.truetype(os.path.join(FONTS, 'NotoSans-Bold.ttf' if bold else 'NotoSans-Regular.ttf'), size)


def _wrap(draw, text, font, width):
    lines, line = [], ''
    for word in text.split():
        trial = f'{line} {word}'.strip()
        if draw.textlength(trial, font=font) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + ([line] if line else [])


def _fit(draw, text, width, height, start, bold=True, floor=18, lh=1.25):
    """The largest font size (from start down) at which text wraps into the box."""
    size = start
    while size > floor:
        font = _font(size, bold)
        lines = _wrap(draw, text, font, width)
        if len(lines) * int(size * lh) <= height:
            return font, lines, size
        size -= 2
    font = _font(floor, bold)
    return font, _wrap(draw, text, font, width), floor


def render_png(p, w, h, reveal, top=0.0):
    """One poster as a PNG. `top` leaves that share of the height clear (a lock screen's clock)."""
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (w, h), p['colour'])
    d = ImageDraw.Draw(img)
    for y0 in range(0, int(h * 0.55), 4):   # a soft light wash at the top, like the feed's cards
        d.rectangle([0, y0, w, y0 + 4], fill=_mix(p['colour'], '#ffffff', 0.3 * (1 - y0 / (h * 0.55))))
    m = int(w * 0.08)
    y = int(h * top) + m
    inner = w - 2 * m
    meta = _font(max(18, w // 34), bold=False)
    d.text((m, y), f'{p["speaker"]} · {p["role"]}', font=meta, fill=_mix(INK, p['colour'], 0.35))
    y += int(meta.size * 1.9)
    room = h - y - m - int(meta.size * 2.4)
    ask_share = 0.45 if reveal else 0.8
    font, lines, size = _fit(d, p['ask'], inner, room * ask_share, max(30, w // 11))
    for line in lines:
        d.text((m, y), line, font=font, fill=INK)
        y += int(size * 1.25)
    if reveal:
        y += int(size * 0.6)
        pad = int(m * 0.4)
        cfont, clines, csize = _fit(d, p['claim'], inner - 2 * pad, h - y - m - int(meta.size * 2.2) - 2 * pad,
                                    max(24, w // 17), bold=False, lh=1.3)
        box_h = len(clines) * int(csize * 1.3) + 2 * pad
        d.rounded_rectangle([m, y, w - m, y + box_h], radius=int(w * 0.035), fill=_mix(p['colour'], '#ffffff', 0.55))
        cy = y + pad
        for line in clines:
            d.text((m + pad, cy), line, font=cfont, fill=INK)
            cy += int(csize * 1.3)
    else:
        d.text((m, h - m - int(meta.size * 2.6)), 'Think of the answer. It appears next hour.', font=meta,
               fill=_mix(INK, p['colour'], 0.35))
    d.text((m, h - m - int(meta.size * 1.3)), p['lesson'], font=meta, fill=_mix(INK, p['colour'], 0.35))
    out = io.BytesIO()
    img.save(out, 'PNG', optimize=True)
    return out.getvalue()


def _mix(a, b, t):
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return tuple(round(x + (y - x) * t) for x, y in zip(pa, pb))


# ---- HTTP ---------------------------------------------------------------------------------

def _views(uid, now):
    c, _, states, seen, mis = kb_api.evidence(kb_api.get_store(uid), now)
    return c, states, seen, mis, kmodel.views(c, states, seen, mis, now)


@router.get('')
def wall(n: int = Query(default=12, ge=1, le=40), who=Depends(kb_api.caller)):
    now = time.time()
    c, states, seen, mis, views = _views(who['uid'], now)
    summary = kmodel.summary(c, states, seen, mis, now)
    sc = story.scale(summary)
    return {'posters': posters(views, n), 'map': fading_map(summary),
            'company': {'label': sc['label'], 'users': sc['users'], 'pct': summary['pct']}}


def _current(uid, now):
    store = kb_api.get_store(uid)
    _, _, _, _, views = _views(uid, now)
    key, reveal = slot(dt.datetime.fromtimestamp(now, dcards.tz_for(store.get_settings())))
    return slot_poster(views, key), reveal


@router.get('/now')
def now_poster(who=Depends(kb_api.caller)):
    """The poster the wallpaper shows right now, as data (for widgets)."""
    p, reveal = _current(who['uid'], time.time())
    return {'poster': p, 'reveal': bool(p) and reveal}


@router.get('/poster.png')
def poster_png(w: int = Query(default=1179, ge=320, le=4000), h: int = Query(default=2556, ge=320, le=4000),
               side: Literal['auto', 'question', 'answer'] = 'auto', top: float = Query(default=0.3, ge=0, le=0.6),
               who=Depends(kb_api.caller)):
    """A wallpaper. iPhone lock screen: the defaults (the top 30% stays clear for the clock).
    A Mac desktop: w=2560&h=1600&top=0."""
    p, reveal = _current(who['uid'], time.time())
    if not p:
        p = {'kind': 'fact', 'colour': COLOURS['fact'], 'ask': 'Open a lesson and its ideas appear here.',
             'claim': '', 'lesson': 'Leetcode Senpai', 'speaker': 'Jo', 'role': 'Junior engineer'}
    reveal = side == 'answer' or (side == 'auto' and reveal and bool(p['claim']))
    return Response(render_png(p, w, h, reveal, top), media_type='image/png',
                    headers={'Cache-Control': 'no-store'})
