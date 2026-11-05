"""The wall: bright posters of what you are learning, for any screen you glance at. /wall

A /wall poster is one knowledge point: its question large, its idea revealed a little later. Weak
points come up more often (open misconceptions, then shaky, fading and unconfirmed ones), and
ideas from lessons you have started fill the rest. The fading map draws Ripple's architecture,
each part coloured by how much of that area you currently hold, so it fades as memory does.

The wallpaper (/api/wall/poster.png, for a phone lock screen or a desktop) is different: an
infographic of a whole lesson you have covered and hold badly, every weak idea on it at once.
server/wall_gen.py makes them in the background on a cadence (an image model draws, a second
model reviews) and keeps them; this module decides which lessons need one and which poster is up
now. The poster changes only in waking hours, so the one up overnight was also up all evening
and none is seen only asleep. Without a model, or before the first poster, a plain card stands in.

Surfaces: /wall cycles posters full screen (a TV, a projector, a Mac screensaver, a phone on
StandBy); /wall?print=1 lays six out for a weekly colour print. Showing a poster records nothing,
because a screen on the wall is not proof anyone looked. Pure: weight, posters, struggles, brief,
wake_slot, shelf, current, to_make, fading_map. I/O: render_card, fit_image, the router.
Intent: docs/plans/ambient-learning.md.
"""
import asyncio
import datetime as dt
import io
import os
import random
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from . import config, llm
from .drip import cards as dcards
from .knowledge_base import api as kb_api, model as kmodel
from .tutor import story

router = APIRouter(prefix='/api/wall', tags=['wall'])
FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')
COLOURS = {'fact': '#ffd84d', 'principle': '#ff8fb8', 'mechanism': '#5fe0e8', 'tradeoff': '#ffad5c', 'procedure': '#8ce99a'}
INK = '#12131a'


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


# ---- the wallpaper: which lessons, and which poster is up --------------------------------

def struggle(v):
    """How much a point you have met needs work; None for one you have not met (never on a poster)."""
    if v['status'] == 'unseen' and not v['misconceptions']:
        return None
    return {'shaky': 5, 'fading': 4, 'learning': 1}.get(v['status'], 0) + 6 * bool(v['misconceptions']) \
        + 2 * bool(v['unconfirmed'])


def struggles(views, n=6, per=3):
    """The lessons you have covered and hold worst, weakest first, each with its weakest points
    you have met (up to `per`: more and the text gets too small to read on a lock screen). -> [{lesson, title, section, score, points}]"""
    by = {}
    for v in views:
        s = struggle(v)
        if s:
            by.setdefault(v['lesson'], []).append((s, v))
    out = []
    for lesson, items in by.items():
        items.sort(key=lambda t: -t[0])
        out.append({'lesson': lesson, 'title': items[0][1]['lesson_title'], 'section': items[0][1]['section'],
                    'score': sum(s for s, _ in items), 'points': [v['id'] for _, v in items[:per]]})
    return sorted(out, key=lambda l: (-l['score'], l['lesson']))[:n]


def brief(lesson, views, misconceptions):
    """What one poster teaches: the lesson's weak ideas (claims, the source of truth) and, for
    points with an open misconception, what went wrong, so the poster can draw the distinction."""
    by_id = {v['id']: v for v in views}
    wrong = {}
    for m in misconceptions:
        if m.get('status') == 'open' and m.get('text'):
            wrong.setdefault(m['point'], m['text'])
    return {'lesson': lesson['lesson'], 'title': lesson['title'], 'section': lesson['section'],
            'points': list(lesson['points']),
            'ideas': [{'point': p, 'claim': by_id[p]['claim'], 'kind': by_id[p]['kind'], 'status': by_id[p]['status'],
                       **({'pitfall': wrong[p]} if p in wrong else {})} for p in lesson['points'] if p in by_id]}


def wake_slot(now_local, window, slot_hours):
    """The number of waking slots since day one: it advances every slot_hours within the waking
    window ('08:30-22:30') and stands still outside it, so the night keeps the evening's poster."""
    start, end = dcards.window(window)
    slot = max(1, round(slot_hours * 60))
    per_day = max(1, (end - start) // slot)
    day = now_local.date().toordinal()
    minute = now_local.hour * 60 + now_local.minute
    if minute < start:
        return (day - 1) * per_day + per_day - 1
    return day * per_day + min(per_day - 1, (minute - start) // slot)


def shelf(library, ranked, least=3):
    """The posters in rotation, weakest lesson first: the newest passing poster of each lesson you
    still struggle with, then older passing posters (reuse) until there are at least `least`."""
    good = sorted((p for p in library if p.get('ok')), key=lambda p: -p['created_at'])
    out, used = [], set()
    for l in ranked:
        p = next((p for p in good if p['lesson'] == l['lesson']), None)
        if p:
            out.append(p)
            used.add(p['_key'])
    for p in good:
        if len(out) >= least:
            break
        if p['_key'] not in used and p['lesson'] not in {q['lesson'] for q in out}:
            out.append(p)
            used.add(p['_key'])
    return out


def current(library, ranked, n):
    """The poster up in waking slot n, or None before there is one."""
    on = shelf(library, ranked)
    return on[n % len(on)] if on else None


def to_make(ranked, library, now, version, fresh_days=7, retry_hours=20):
    """The weakest lesson that needs a new poster, or None: one with no passing poster of this
    prompt version made in the last fresh_days that covers at least half its weak points now.
    A lesson whose last try failed review waits retry_hours, so one stubborn lesson can't eat the budget."""
    for l in ranked:
        mine = [p for p in library if p['lesson'] == l['lesson'] and p.get('version') == version]
        if any(not p.get('ok') and now - p['created_at'] < retry_hours * 3600 for p in mine):
            continue
        fresh = [p for p in mine if p.get('ok') and now - p['created_at'] < fresh_days * 86400
                 and len(set(p['points']) & set(l['points'])) * 2 >= len(l['points'])]
        if not fresh:
            return l
    return None


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


SECTION_HINT = {'system-design': 'system design', 'fundamentals': '', 'ai': 'LLM'}


def search_query(lesson_title, section):
    """A YouTube search for a lesson: its title, tidied, plus a hint of the field."""
    title = ' '.join(lesson_title.replace(' - ', ' ').replace(':', ' ').replace(', end to end', '').split())
    hint = SECTION_HINT.get(section, '')
    return f'{title} {hint}'.strip() if hint and hint.lower() not in title.lower() else title


def topics(views, n):
    """Up to n lessons to watch videos about, weakest first: where misconceptions, shaky and fading
    points gather, then lessons started but barely held. -> [{lesson, title, section, query, why}]"""
    score = {}
    for v in views:
        w = {'shaky': 5, 'fading': 4}.get(v['status'], 0) + 6 * bool(v['misconceptions']) + 2 * bool(v['unconfirmed'])
        started = v['status'] != 'unseen'
        s = score.setdefault(v['lesson'], {'w': 0, 'started': False, 'title': v['lesson_title'], 'section': v['section']})
        s['w'] += w
        s['started'] = s['started'] or started
    ranked = sorted((k for k, s in score.items() if s['started']), key=lambda k: -score[k]['w'])
    out = []
    for k in ranked[:n]:
        s = score[k]
        out.append({'lesson': k, 'title': s['title'], 'section': s['section'], 'query': search_query(s['title'], s['section']),
                    'why': 'slipping' if s['w'] else 'started'})
    return out


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


def render_card(card, w, h, top=0.0):
    """The stand-in wallpaper (no model, or no poster yet): a lesson's title and its ideas, all
    shown, on its colour. `top` leaves that share of the height clear (a lock screen's clock)."""
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (w, h), card['colour'])
    d = ImageDraw.Draw(img)
    for y0 in range(0, int(h * 0.55), 4):   # a soft light wash at the top, like the feed's cards
        d.rectangle([0, y0, w, y0 + 4], fill=_mix(card['colour'], '#ffffff', 0.3 * (1 - y0 / (h * 0.55))))
    m = int(w * 0.08)
    y = int(h * top) + m
    inner = w - 2 * m
    meta = _font(max(18, w // 34), bold=False)
    font, lines, size = _fit(d, card['title'], inner, h * 0.16, max(30, w // 12))
    for line in lines:
        d.text((m, y), line, font=font, fill=INK)
        y += int(size * 1.25)
    y += int(size * 0.5)
    ideas = card['ideas'] or ['Open a lesson and its ideas appear here.']
    pad = int(m * 0.35)
    room = (h - y - m - int(meta.size * 2)) / len(ideas)
    for text in ideas:
        cfont, clines, csize = _fit(d, text, inner - 2 * pad, room - 3 * pad, max(22, w // 22), bold=False, lh=1.3)
        box = len(clines) * int(csize * 1.3) + 2 * pad
        d.rounded_rectangle([m, y, w - m, y + box], radius=int(w * 0.03), fill=_mix(card['colour'], '#ffffff', 0.55))
        cy = y + pad
        for line in clines:
            d.text((m + pad, cy), line, font=cfont, fill=INK)
            cy += int(csize * 1.3)
        y += box + pad
    d.text((m, h - m - int(meta.size * 1.3)), 'Leetcode Senpai', font=meta, fill=_mix(INK, card['colour'], 0.35))
    out = io.BytesIO()
    img.save(out, 'PNG', optimize=True)
    return out.getvalue()


def fit_image(data, w, h):
    """A stored poster fitted to a w x h screen without cutting anything off: scaled to fit, and
    the space left over filled by stretching the poster's own edge rows and columns (the prompt
    keeps its edges plain). The spare height goes on top, where a lock screen's clock sits. -> JPEG."""
    from PIL import Image
    src = Image.open(io.BytesIO(data)).convert('RGB')
    scale = min(w / src.width, h / src.height)
    sw, sh = max(1, round(src.width * scale)), max(1, round(src.height * scale))
    src = src.resize((sw, sh), Image.LANCZOS)
    out = Image.new('RGB', (w, h))
    x, y = (w - sw) // 2, h - sh
    out.paste(src, (x, y))
    if y:
        out.paste(src.crop((0, 0, sw, 1)).resize((sw, y)), (x, 0))
    if x:
        out.paste(out.crop((x, 0, x + 1, h)).resize((x, h)), (0, 0))
        out.paste(out.crop((x + sw - 1, 0, x + sw, h)).resize((w - x - sw, h)), (x + sw, 0))
    buf = io.BytesIO()
    out.save(buf, 'JPEG', quality=90)
    return buf.getvalue()


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


def _wallpaper(uid, now):
    """-> (poster, None) when one is up, else (None, the lesson card standing in for it, or None)."""
    from . import wall_gen
    store = kb_api.get_store(uid)
    _, _, _, mis, views = _views(uid, now)
    ranked = struggles(views)
    n = wake_slot(dt.datetime.fromtimestamp(now, dcards.tz_for(store.get_settings())), config.DRIP_WINDOW,
                  config.WALL_SLOT_HOURS)
    p = current(store.list_knowledge(wall_gen.POSTERS), ranked, n)
    if p or not ranked:
        return p, None
    b = brief(ranked[n % len(ranked)], views, mis)
    return None, {'lesson': b['lesson'], 'title': b['title'], 'ideas': [i['claim'] for i in b['ideas']],
                  'colour': COLOURS.get(b['ideas'][0]['kind'], COLOURS['fact'])}


def _public(p):
    return {**{k: p.get(k) for k in ('lesson', 'title', 'ideas', 'created_at', 'model', 'review', 'ok')},
            'id': p['_key'], 'image': f'/api/wall/posters/{p["_key"]}.jpg'}


@router.get('/topics')
def watch_topics(n: int = Query(default=4, ge=1, le=12), who=Depends(kb_api.caller)):
    """What to watch: YouTube searches for your weakest lessons (the YouTube extension)."""
    _, _, _, _, views = _views(who['uid'], time.time())
    return {'topics': topics(views, n)}


@router.get('/now')
def now_poster(who=Depends(kb_api.caller)):
    """What the wallpaper shows now, as data (for widgets): a poster, or the card standing in."""
    p, card = _wallpaper(who['uid'], time.time())
    return {'poster': _public(p) if p else None, 'card': card}


@router.get('/poster.png')
def poster_png(w: int = Query(default=1179, ge=320, le=4000), h: int = Query(default=2556, ge=320, le=4000),
               top: float = Query(default=0.3, ge=0, le=0.6), who=Depends(kb_api.caller)):
    """The wallpaper now. iPhone lock screen: the defaults. A Mac desktop: w=2560&h=1600&top=0.
    A generated poster comes back as a JPEG; the path keeps its name for the shortcuts using it."""
    from . import wall_gen
    p, card = _wallpaper(who['uid'], time.time())
    img = p and kb_api.get_store(who['uid']).get_knowledge(wall_gen.IMAGES, p['_key'])
    headers = {'Cache-Control': 'no-store'}
    if img:
        return Response(fit_image(img['data'], w, h), media_type='image/jpeg', headers=headers)
    card = card or {'title': 'Leetcode Senpai', 'ideas': [], 'colour': COLOURS['fact']}
    return Response(render_card(card, w, h, top), media_type='image/png', headers=headers)


@router.get('/posters')
def list_posters(who=Depends(kb_api.caller)):
    """Every poster made, newest first, with its review (failed ones too: they never go up)."""
    from . import wall_gen
    library = kb_api.get_store(who['uid']).list_knowledge(wall_gen.POSTERS)
    return {'posters': [_public(p) for p in sorted(library, key=lambda p: -p['created_at'])]}


@router.get('/posters/{pid}.jpg')
def poster_image(pid: str, who=Depends(kb_api.caller)):
    from . import wall_gen
    img = kb_api.get_store(who['uid']).get_knowledge(wall_gen.IMAGES, pid)
    if not img:
        raise HTTPException(404, 'no such poster')
    return Response(img['data'], media_type='image/jpeg', headers={'Cache-Control': 'max-age=86400'})


@router.post('/posters')
async def make_poster(lesson: str = Query(default=''), who=Depends(kb_api.caller)):
    """Make a poster now, outside the cadence: for `lesson`, or the weakest lesson needing one."""
    from . import wall_gen
    if not llm.enabled():
        raise HTTPException(503, 'Posters need a model (OPENROUTER_API_KEY)')
    p = await asyncio.to_thread(wall_gen.make, kb_api.get_store(who['uid']), time.time(), lesson or None)
    if not p:
        raise HTTPException(409, 'No lesson you have covered needs a poster')
    return _public(p)
