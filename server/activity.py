"""One activity history across sections: LeetCode solves and system design marks per day.

Pure merging over plain data; each section supplies its own per-day counts. The streak counts
consecutive days with any practice in any section, ending today (or yesterday, so a day that
has not started yet does not break it).
"""
import datetime as dt
import time

from fastapi import APIRouter, Depends

from . import auth
from .store import get_store
from . import system_design_items

router = APIRouter(prefix='/api', tags=['activity'])
DAYS = 182


def leetcode_daily(attempts, now, days=DAYS):
    start = dt.date.fromtimestamp(now) - dt.timedelta(days=days - 1)
    out = {}
    for a in attempts:
        ts = a.get('solved_at')
        if not ts:
            continue
        d = dt.date.fromtimestamp(ts)
        if d >= start:
            out[d.isoformat()] = out.get(d.isoformat(), 0) + 1
    return out


def merge(leetcode, design, now, days=DAYS):
    today = dt.date.fromtimestamp(now)
    out = []
    for back in range(days - 1, -1, -1):
        d = (today - dt.timedelta(days=back)).isoformat()
        sd = design.get(d, {})
        out.append({'day': d, 'leetcode': leetcode.get(d, 0), 'design': sd.get('marks', 0), 'design_answers': sd.get('answers', 0)})
    active = {r['day'] for r in out if r['leetcode'] or r['design_answers']}
    day = today if today.isoformat() in active else today - dt.timedelta(days=1)
    streak = 0
    while day.isoformat() in active:
        streak += 1
        day -= dt.timedelta(days=1)
    return {'days': out, 'streak': streak, 'active_days': len(active),
            'totals': {'leetcode': sum(r['leetcode'] for r in out), 'design': round(sum(r['design'] for r in out), 1)}}


@router.get('/activity')
def activity(uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    now = int(time.time())
    design = system_design_items.knowledge.daily(system_design_items.events(store.list_design_records()), now, DAYS)
    return merge(leetcode_daily(store.list_attempts(), now), design, now)
