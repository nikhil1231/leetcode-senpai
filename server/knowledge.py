"""Generic knowledge ledger: countable items, answer events, and what you hold right now.

A learning section declares items ({id, category, topic, kind, label}) and reports answer
events ({item, at, marks, max, clean, source}). Everything here is pure and section-agnostic,
so a new section only writes an adapter. Events for unknown items still count as activity.

Memory model (deliberately simple, FSRS-shaped): each item has a stability S in days and
retrievability R(t) = (1 + t / (9 S))^-1, the chance you would answer it cleanly now.
A clean answer on a later day grows S, more when it was nearly forgotten; a miss shrinks it.
Same-day repeats never grow S, so cramming cannot inflate the numbers. An item counts toward
the knowledge number only while its latest answer was clean.
"""
import datetime as dt

DAY = 86400
TARGET = 0.85        # an item you hold is due once R drops below this
SOLID_DAYS = 7       # stability at which an item is "solid"
MAX_STABILITY = 365
GRADES = [
    ('A*', 85, 'Interview-ready on this material. It comes out fluently, with numbers and failure modes.'),
    ('A', 75, 'Strong. Good enough for most interviews if you can also drive the design.'),
    ('B', 65, 'Probably passes. Expect follow-up questions to find a gap or two.'),
    ('C', 50, 'Borderline. Real gaps would show under follow-up questions.'),
    ('D', 35, 'Not ready yet on this material.'),
    ('U', 0, 'Mostly unfamiliar. Study the lessons before sitting papers.'),
]


def grade(pct):
    for letter, floor, meaning in GRADES:
        if pct >= floor:
            return {'grade': letter, 'meaning': meaning}
    return {'grade': 'U', 'meaning': GRADES[-1][2]}


def retrievability(days, stability):
    if stability <= 0:
        return 0.0
    return (1 + max(0.0, days) / (9 * stability)) ** -1


def _apply(state, e):
    at, day = e['at'], int(e['at'] // DAY)
    if state is None:
        state = {'answers': 0, 'clean_answers': 0, 'stability': 0.0, 'last_at': at, 'last_day': day,
                 'last_clean': False, 'last_miss_day': None, 'first_at': at}
    elapsed = (at - state['last_at']) / DAY
    if e['clean']:
        if state['answers'] == 0:
            s = 1.0
        elif day == state['last_day'] or state['stability'] <= 0:
            # Same-day success, or relearning after a miss: held, but only briefly.
            s = max(state['stability'], 0.5)
        else:
            r = retrievability(elapsed, state['stability'])
            s = state['stability'] * (2 + 3 * (1 - r))
        state.update(stability=min(MAX_STABILITY, s), last_clean=True)
        state['clean_answers'] += 1
    else:
        state.update(stability=state['stability'] * 0.3 if state['last_clean'] else 0.0,
                     last_clean=False, last_miss_day=day)
    state.update(answers=state['answers'] + 1, last_at=at, last_day=day)
    return state


def replay(events, until=None):
    """Per-item memory state from events (any order) up to `until` inclusive."""
    states = {}
    for e in sorted(events, key=lambda e: e['at']):
        if until is not None and e['at'] > until:
            break
        states[e['item']] = _apply(states.get(e['item']), e)
    return states


def held(state, now):
    if not state or not state['last_clean']:
        return 0.0
    return retrievability((now - state['last_at']) / DAY, state['stability'])


def status(state, now):
    """unseen · shaky (latest answer wrong) · learning · solid, plus `fading` when due."""
    if not state:
        return 'unseen'
    if not state['last_clean']:
        return 'shaky'
    if held(state, now) < TARGET:
        return 'fading'
    return 'solid' if state['stability'] >= SOLID_DAYS else 'learning'


def item_view(item, state, now):
    return {**item, 'status': status(state, now), 'r': round(held(state, now), 3),
            'stability': round(state['stability'], 1) if state else 0,
            'answers': state['answers'] if state else 0, 'last_at': state['last_at'] if state else None}


def knowledge(items, states, now):
    ids = {i['id'] for i in items}
    return sum(held(s, now) for k, s in states.items() if k in ids)


def mistakes(items, states, now):
    """Latest answer wrong (to fix), or fixed only on the day it was missed (confirm on a later day)."""
    fix, confirm = [], []
    for item in items:
        s = states.get(item['id'])
        if not s:
            continue
        if not s['last_clean']:
            fix.append(item_view(item, s, now))
        elif s['last_miss_day'] is not None and s['last_miss_day'] == s['last_day']:
            confirm.append(item_view(item, s, now))
    fix.sort(key=lambda v: -v['last_at'])
    return {'fix': fix, 'confirm': confirm}


def due(items, states, now):
    return [item_view(i, states[i['id']], now) for i in items
            if i['id'] in states and states[i['id']]['last_clean'] and held(states[i['id']], now) < TARGET]


def history(items, events, now, days=60):
    """Knowledge at the end of each of the last `days` days (the last point is now)."""
    ids = {i['id'] for i in items}
    ordered = sorted((e for e in events if e['item'] in ids), key=lambda e: e['at'])
    today = dt.date.fromtimestamp(now)
    states, pos, out = {}, 0, []
    for back in range(days - 1, -1, -1):
        day = today - dt.timedelta(days=back)
        cut = now if back == 0 else dt.datetime.combine(day + dt.timedelta(days=1), dt.time()).timestamp() - 1
        while pos < len(ordered) and ordered[pos]['at'] <= cut:
            e = ordered[pos]
            states[e['item']] = _apply(states.get(e['item']), e)
            pos += 1
        out.append({'day': day.isoformat(), 'value': round(sum(held(s, cut) for s in states.values()), 1)})
    return out


def daily(events, now, days=182):
    """Marks and answers per local day for the activity calendar."""
    start = dt.date.fromtimestamp(now) - dt.timedelta(days=days - 1)
    out = {}
    for e in events:
        d = dt.date.fromtimestamp(e['at'])
        if d < start:
            continue
        row = out.setdefault(d.isoformat(), {'marks': 0.0, 'answers': 0})
        row['marks'] += e.get('marks', 1 if e['clean'] else 0)
        row['answers'] += 1
    return {k: {'marks': round(v['marks'], 1), 'answers': v['answers']} for k, v in sorted(out.items())}


def combo(events, sources=('quickfire',)):
    """Longest run of consecutive clean answers from fast-answer sources."""
    best = run = 0
    for e in sorted(events, key=lambda e: e['at']):
        if e.get('source') not in sources:
            continue
        run = run + 1 if e['clean'] else 0
        best = max(best, run)
    return best


def records(events, papers=(), sprints=()):
    """Personal bests. Each is {key, label, value, display, at}; higher is better."""
    out = []
    def add(key, label, value, display, at):
        if value:
            out.append({'key': key, 'label': label, 'value': value, 'display': display, 'at': at})
    days = {}
    for e in events:
        d = dt.date.fromtimestamp(e['at']).isoformat()
        days[d] = days.get(d, 0) + e.get('marks', 1 if e['clean'] else 0)
    if days:
        d, v = max(days.items(), key=lambda kv: (kv[1], kv[0]))
        add('day_marks', 'Most marks in a day', round(v, 1), f'{round(v, 1):g} marks', d)
    c = combo(events)
    add('combo', 'Longest Quickfire streak', c, f'{c} in a row', None)
    best = {}
    for p in papers:
        if p.get('pct') is None:
            continue
        key = 'paper:' + p['scope_key']
        if key not in best or p['pct'] > best[key]['pct']:
            best[key] = p
    for key, p in best.items():
        add(key, f'Best {p["scope_label"]} paper', p['pct'], f'{p["pct"]}% · {grade(p["pct"])["grade"]}', p['finished_at'])
    fast = [p for p in papers if p.get('pct') is not None and p['pct'] >= GRADES[0][1] and p.get('elapsed_sec')]
    if fast:
        p = min(fast, key=lambda p: p['elapsed_sec'] / max(1, p['max']))
        pace = round(p['elapsed_sec'] / max(1, p['max']))
        # Lower is better, so the value is inverted for comparisons.
        add('pace', 'Fastest A* pace', 1 / max(pace, 1), f'{pace}s per mark', p['finished_at'])
    for s in sprints:
        key = 'sprint:' + s['kind']
        prior = next((r for r in out if r['key'] == key), None)
        if s['score'] and (not prior or s['score'] > prior['value']):
            if prior:
                out.remove(prior)
            add(key, f'Best {s["label"]}', s['score'], f'{s["score"]} correct', s['finished_at'])
    return out


def slip(items, events, since, now, papers=(), sprints=()):
    """The results slip for a session: what changed between `since` and `now`."""
    ids = {i['id'] for i in items}
    session = [e for e in events if since <= e['at'] <= now]
    before, after = replay(events, since - 1), replay(events, now)
    became_solid = [k for k, s in after.items() if k in ids and status(s, now) == 'solid'
                    and status(before.get(k), since) != 'solid']
    old = {r['key']: r for r in records([e for e in events if e['at'] < since],
                                        [p for p in papers if p['finished_at'] < since],
                                        [s for s in sprints if s['finished_at'] < since])}
    new = records(events, papers, sprints)
    broken = [r for r in new if r['key'] not in old or r['value'] > old[r['key']]['value']]
    first_seen = sum(1 for k in {e['item'] for e in session} if k in ids and k not in before)
    k0, k1 = knowledge(items, before, since), knowledge(items, after, now)
    return {'answers': len(session), 'clean': sum(e['clean'] for e in session),
            'marks': round(sum(e.get('marks', 1 if e['clean'] else 0) for e in session), 1),
            'max': round(sum(e.get('max', 1) for e in session), 1),
            'new_items': first_seen, 'became_solid': len(became_solid),
            'knowledge_before': round(k0, 1), 'knowledge_after': round(k1, 1),
            'knowledge_delta': round(k1 - k0, 1), 'records': broken}


def summary(items, events, now, history_days=60):
    states = replay(events, now)
    views = [item_view(i, states.get(i['id']), now) for i in items]
    counts = {}
    for v in views:
        counts[v['status']] = counts.get(v['status'], 0) + 1
    k = knowledge(items, states, now)
    return {'knowledge': round(k, 1), 'total': len(items),
            'pct': round(100 * k / len(items), 1) if items else 0,
            'counts': counts, 'items': views, 'mistakes': mistakes(items, states, now),
            'due': len(due(items, states, now)), 'history': history(items, events, now, history_days),
            'daily': daily(events, now)}
