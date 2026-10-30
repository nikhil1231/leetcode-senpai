"""What you hold, point by point, recomputed from evidence. Pure; no I/O.

An event is {point, at, kind, source, ...}. `answer` events carry `clean`, a `depth` (recognise ·
recall · explain · apply), a `strength` (hard: a deterministic check; soft: a model's judgement
of free text) and a `blame` (full, or shared: an unattributed miss on a question that tests
several points). `exposure` events (shown on a wallpaper, played in a podcast) never change
memory; they are counted so that their effect can be measured later.

Memory per point is the ledger's model (knowledge.py: stability S, R(t) = (1 + t/9S)^-1,
same-day repeats never grow S), plus one rule: a shared miss weakens S instead of resetting
it, because it is not known which of the question's points failed. Depth is the highest level
whose latest answer was clean. Soft evidence counts like hard evidence for now, but a point held
without a hard clean answer since its last miss is `unconfirmed`, and is offered for a check.
"""
from .. import knowledge
from . import catalog as cat

DEPTHS = ('recognise', 'recall', 'explain', 'apply')
STRENGTHS = ('hard', 'soft')
SHARED_MISS = 0.7
STATUSES = ('unseen', 'shaky', 'fading', 'learning', 'solid')
MODES = ('review', 'learn', 'any')


def _answer(state, e):
    at = e['at']
    if e['clean'] or e.get('blame', 'full') == 'full' or state is None:
        state = knowledge._apply(state, e)
    else:
        state.update(stability=state['stability'] * SHARED_MISS, answers=state['answers'] + 1)
    state.setdefault('depths', {})
    state.setdefault('hard_clean_at', None)
    state.setdefault('full_miss_at', None)
    state.setdefault('soft_answers', 0)
    if e.get('depth') in DEPTHS:
        state['depths'][e['depth']] = {'clean': bool(e['clean']), 'at': at, 'strength': e.get('strength', 'hard')}
    if e.get('strength') == 'soft':
        state['soft_answers'] += 1
    if e['clean'] and e.get('strength', 'hard') == 'hard':
        state['hard_clean_at'] = at
    if not e['clean'] and e.get('blame', 'full') == 'full':
        state['full_miss_at'] = at
    state['last_source'] = e.get('source')
    return state


def replay(events, until=None):
    """-> (memory state per point, exposures per point) from events in any order."""
    states, seen = {}, {}
    for e in sorted(events, key=lambda e: e['at']):
        if until is not None and e['at'] > until:
            break
        if e.get('kind', 'answer') == 'exposure':
            x = seen.setdefault(e['point'], {'count': 0, 'last_at': None})
            x['count'] += 1
            x['last_at'] = e['at']
        else:
            states[e['point']] = _answer(states.get(e['point']), e)
    return states, seen


def depth(state):
    """Highest depth whose latest answer was clean, or None."""
    held = [d for d in DEPTHS if (state or {}).get('depths', {}).get(d, {}).get('clean')]
    return held[-1] if held else None


def confirmed(state):
    if not state or not state.get('hard_clean_at'):
        return False
    return state['full_miss_at'] is None or state['hard_clean_at'] > state['full_miss_at']


def view(point, state, exposure, misconceptions, now):
    """A point with what you hold of it. `misconceptions` are this point's open ones."""
    v = knowledge.item_view({k: point[k] for k in (
        'id', 'section', 'category', 'lesson', 'lesson_title', 'subtopic', 'kind', 'claim', 'prompt')}, state, now)
    v.update(depth=depth(state), confirmed=confirmed(state), unconfirmed=bool(state) and state['last_clean'] and not confirmed(state),
             depths=(state or {}).get('depths', {}), exposures=(exposure or {}).get('count', 0),
             last_exposed_at=(exposure or {}).get('last_at'), misconceptions=len(misconceptions))
    return v


def views(catalog, states, seen, misconceptions, now, points=None):
    open_by = {}
    for m in misconceptions:
        if m.get('status') == 'open':
            open_by.setdefault(m['point'], []).append(m)
    return [view(p, states.get(p['id']), seen.get(p['id']), open_by.get(p['id'], []), now)
            for p in (cat.active(catalog) if points is None else points)]


def _node(vs):
    counts = {s: 0 for s in STATUSES}
    for v in vs:
        counts[v['status']] += 1
    held = sum(v['r'] for v in vs)
    return {'total': len(vs), 'knowledge': round(held, 1), 'pct': round(100 * held / len(vs), 1) if vs else 0,
            'counts': counts, 'unconfirmed': sum(v['unconfirmed'] for v in vs),
            'misconceptions': sum(v['misconceptions'] for v in vs)}


def summary(catalog, states, seen, misconceptions, now):
    """Totals, then section → category → lesson → subtopic, in course order."""
    vs = views(catalog, states, seen, misconceptions, now)
    tree = {}
    for v in vs:
        p = catalog['points'][v['id']]
        level = tree
        for key, title in ((v['section'], p['section_title']), (v['category'], p['category_title']),
                           (v['lesson'], v['lesson_title']), (v['subtopic'], v['subtopic'])):
            node = level.setdefault(key, {'id': key, 'title': title, 'views': [], 'children': {}})
            node['views'].append(v)
            level = node['children']
    names = ('categories', 'lessons', 'subtopics', None)

    def out(node, level):
        d = {'id': node['id'], 'title': node['title'], **_node(node['views'])}
        if names[level]:
            d[names[level]] = [out(c, level + 1) for c in node['children'].values()]
        return d
    return {**_node(vs), 'due': sum(v['status'] == 'fading' for v in vs),
            'sections': [out(n, 0) for n in tree.values()]}


def _ready(p, states, now):
    return all(knowledge.held(states.get(r), now) > 0 for r in p['requires'])


def pick(catalog, states, seen, misconceptions, now, n=10, mode='review', section=None, category=None,
         lesson=None, kinds=None, exclude=(), cooldown=0):
    """What to practise next, most useful first, each with the reason it was chosen.

    review: open misconceptions, then shaky, fading (weakest first) and unconfirmed points.
    learn: also new points whose prerequisites you hold, in course order.
    any: also the rest (new points not yet ready, then held points, weakest first).
    `cooldown` skips points answered or shown in the last that-many seconds.
    """
    open_points = {m['point'] for m in misconceptions if m.get('status') == 'open'}
    exclude = set(exclude)
    ranked = []
    for p in cat.active(catalog):
        if (section and p['section'] != section) or (category and p['category'] != category) \
                or (lesson and p['lesson'] != lesson) or (kinds and p['kind'] not in kinds) or p['id'] in exclude:
            continue
        s, x = states.get(p['id']), seen.get(p['id'])
        if cooldown:
            last = max((s or {}).get('last_at') or 0, (x or {}).get('last_at') or 0)
            if last and now - last < cooldown:
                continue
        status, r = knowledge.status(s, now), knowledge.held(s, now)
        if p['id'] in open_points:
            tier, reason = 0, 'misconception'
        elif status == 'shaky':
            tier, reason = 1, 'shaky'
        elif status == 'fading':
            tier, reason = 2, 'fading'
        elif s and s['last_clean'] and not confirmed(s):
            tier, reason = 3, 'unconfirmed'
        elif status == 'unseen':
            ready = _ready(p, states, now)
            if mode == 'review' or (mode == 'learn' and not ready):
                continue
            tier, reason = (4, 'new') if ready else (5, 'new')
        else:
            if mode != 'any':
                continue
            tier, reason = 6, 'held'
        ranked.append(((tier, r if tier in (2, 6) else 0, p['order']), p, reason))
    ranked.sort(key=lambda t: t[0])
    return [{'reason': reason, 'point': p} for _, p, reason in ranked[:n]]
