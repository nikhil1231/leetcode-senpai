"""Questions tied to your day: open Uber, get asked about ride matching, in the moment. Pure.

A phone automation ("when Uber is opened") posts the app's name to /api/drip/opened; the bot
sends a card from that app's lessons straight away (apps.yaml says which). Limits keep it a
nudge, not noise: only inside the drip's window, not while paused, each app at most once every
APP_COOLDOWN, at most DAILY_CAP a day, and never on top of a card that arrived in the last
FRESH. An older unanswered card is replaced (it counts as shown).
"""
import os

import yaml

from ..knowledge_base import model as kmodel

HERE = os.path.dirname(os.path.abspath(__file__))
APP_COOLDOWN = 3 * 3600
DAILY_CAP = 4
FRESH = 10 * 60
PRIORITY = ('misconception', 'shaky', 'fading', 'unconfirmed', 'new', 'held', 'unready')


def load(path=os.path.join(HERE, 'apps.yaml')):
    with open(path, encoding='utf-8') as fh:
        apps = yaml.safe_load(fh)['apps']
    index = {}
    for a in apps:
        for name in [a['name']] + list(a.get('aliases') or []):
            index[name.strip().lower()] = a
    return index


APPS = load()


def find(name, apps=None):
    key = ' '.join(str(name or '').lower().split())
    return (apps or APPS).get(key)


def decide(app, state, pending_sent_at, now, in_window):
    """-> (ok, reason). `state`: the bot's state; `pending_sent_at`: when the open card was sent, or None."""
    if not app:
        return False, 'unknown app'
    if state.get('paused'):
        return False, 'paused'
    if not in_window:
        return False, 'outside the window'
    ctx = state.get('context') or {}
    if now - (ctx.get('last') or {}).get(app['name'], 0) < APP_COOLDOWN:
        return False, 'asked about this app recently'
    if ctx.get('day') == state.get('day') and ctx.get('count', 0) >= DAILY_CAP:
        return False, 'enough for today'
    if pending_sent_at is not None and now - pending_sent_at < FRESH:
        return False, 'a question just arrived'
    return True, 'ok'


def remember(state, app, now):
    ctx = dict(state.get('context') or {})
    count = ctx.get('count', 0) if ctx.get('day') == state.get('day') else 0
    ctx.update(day=state.get('day'), count=count + 1, last={**(ctx.get('last') or {}), app['name']: now})
    state['context'] = ctx


def pick(catalog, states, seen, misconceptions, now, app, cooldown):
    """The most useful point in the app's lessons: weak before new before held, earlier lessons first."""
    best = None
    for rank, lesson in enumerate(app['lessons']):
        for r in kmodel.pick(catalog, states, seen, misconceptions, now, n=3, mode='any', lesson=lesson, cooldown=cooldown):
            key = (PRIORITY.index(r['reason']) if r['reason'] in PRIORITY else len(PRIORITY), rank)
            if best is None or key < best[0]:
                best = (key, r['point'], r['reason'])
            break
    return (best[1], best[2]) if best else (None, None)
