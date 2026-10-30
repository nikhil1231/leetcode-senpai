"""Ripple, the company that grows as you learn. Pure: the knowledge summary in, the story state out.

Company size follows the share of knowledge points you hold now (so it can shrink as memory
fades), milestones unlock when one area is held well enough, and each lesson's category sets the
scene. Story events (incidents, decisions) are kept in tutor memory and fed back to the tutor, so
consequences carry from one session to the next.
"""
import os

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_EVENTS = 8


def _load():
    with open(os.path.join(HERE, 'story.yaml'), encoding='utf-8') as fh:
        bible = yaml.safe_load(fh)
    bible['tiers'] = sorted(bible['tiers'], key=lambda t: t['at'])
    return bible


BIBLE = _load()


def _category_pct(summary, section, category):
    for s in summary.get('sections', []):
        if s['id'] == section:
            for c in s['categories']:
                if c['id'] == category:
                    return c['pct']
    return 0.0


def scale(summary):
    """-> {pct, label, users, next, milestones} from a knowledge-base summary (model.summary)."""
    pct = summary.get('pct', 0.0)
    tiers = BIBLE['tiers']
    now = max((t for t in tiers if pct >= t['at']), key=lambda t: t['at'])
    later = [t for t in tiers if t['at'] > pct]
    nxt = None
    if later:
        n = later[0]
        span = n['at'] - now['at']
        nxt = {'label': n['label'], 'users': n['users'], 'at': n['at'],
               'progress': round(100 * (pct - now['at']) / span) if span else 100}
    milestones = []
    for m in BIBLE['milestones']:
        got = _category_pct(summary, m['section'], m['category'])
        milestones.append({'id': m['id'], 'title': m['title'], 'done': got >= m['at'],
                           'progress': min(100, round(100 * got / m['at'])), 'area': m['category'], 'section': m['section']})
    return {'pct': pct, 'label': now['label'], 'users': now['users'], 'next': nxt, 'milestones': milestones}


def chapter(section, category):
    return BIBLE['chapters'].get(section, {}).get(category, '')


def cast():
    return BIBLE['cast']


def remember(events, new, at):
    """Story events, newest last, capped. Blank events are ignored."""
    text = ' '.join((new or '').split())
    if not text:
        return list(events or [])
    return (list(events or []) + [{'at': at, 'text': text[:300]}])[-MAX_EVENTS:]


def public(summary, memory=None):
    """What the UI shows: the company, its size, the cast and what happened last."""
    memory = memory or {}
    return {'company': BIBLE['company'], 'pitch': BIBLE['pitch'], 'you': BIBLE['you'], 'cast': cast(),
            'scale': scale(summary), 'events': memory.get('events', []), 'previously': memory.get('summary', '')}
