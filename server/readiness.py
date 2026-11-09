"""Interview readiness across every section, on one scale. The pure part has no I/O; the route is at the bottom.

Each section reports a unit: how many things it holds in total, how many have been tested, and how much of it you
would get right today (`held`, the sum of recall probabilities for the knowledge sections, an evidence-weighted
count of skills for coding). From that:

  ready     held / total, the share of the whole syllabus you could produce now
  coverage  tested / total, how much of the syllabus the number is based on

An untested section is unknown, never zero: below MIN_COVERAGE the band says so instead of "early". The overall
figure weights sections by how the Senpai plan splits time (the stack share is split evenly across Fundamentals,
AI Engineering and Practical Coding), so it moves the way the plan says it should.
"""
import asyncio
import datetime as dt
import time

from fastapi import APIRouter, Depends

from .tracks.http import store_for

SECTIONS = (('leetcode', 'LeetCode', 'dsa'), ('system-design', 'System Design', 'system_design'),
            ('fundamentals', 'Fundamentals', 'stack'), ('ai', 'AI Engineering', 'stack'),
            ('experience', 'Experience', 'behavioural'), ('practical', 'Practical Coding', 'stack'))
TITLE = {sid: title for sid, title, _ in SECTIONS}
BUCKET = {sid: bucket for sid, _, bucket in SECTIONS}

MIN_COVERAGE = 15     # percent of the syllabus tested before a score means anything
BANDS = ((70, 'Interview-ready'), (50, 'Nearly there'), (25, 'Building'), (0, 'Early'))
CODING_WEIGHT = {'demonstrated': 1.0, 'developing': .5, 'practised': .3, 'stale': .5, 'overdue': .5,
                 'needs_check': .25, 'untested': 0.0}
STORY_SHARE = .3      # Experience: how much of readiness is "has a story for each competency"


def pct(num, den):
    return round(100 * num / den) if den else 0


def band(ready, coverage):
    if coverage < MIN_COVERAGE:
        return 'Not enough tested to say' if coverage else 'Not started'
    return next(name for floor, name in BANDS if ready >= floor)


def unit(total, tested, held, slipping=0, ready=None, focus='', headline=''):
    """One section's numbers. `ready` may be given when the section blends in more than recall."""
    r = pct(held, total) if ready is None else round(ready)
    c = pct(tested, total)
    return {'total': total, 'tested': tested, 'held': round(held, 1), 'slipping': slipping,
            'ready': r, 'coverage': c, 'band': band(r, c), 'focus': focus, 'headline': headline}


# ---- one adapter per kind of section -----------------------------------------------------------

def coding_unit(rows):
    """Senpai capability rows for the DSA bucket -> unit."""
    mine = [r for r in rows if r.get('bucket') == 'dsa']
    by = {}
    for r in mine:
        by.setdefault(r['status'], []).append(r['name'])
    held = sum(CODING_WEIGHT.get(r['status'], 0) for r in mine)
    tested = sum(1 for r in mine if r['status'] != 'untested')
    slipping = sum(len(by.get(k, ())) for k in ('needs_check', 'overdue', 'stale'))
    demonstrated = len(by.get('demonstrated', ()))
    if by.get('needs_check'):
        focus = f"{len(by['needs_check'])} skill{'s' if len(by['needs_check']) != 1 else ''} need a re-check: {', '.join(by['needs_check'][:2])}"
    elif by.get('overdue'):
        focus = f"{len(by['overdue'])} skill{'s' if len(by['overdue']) != 1 else ''} with reviews overdue"
    elif by.get('untested'):
        focus = f"{len(by['untested'])} skills with no evidence yet, such as {', '.join(by['untested'][:2])}"
    else:
        focus = 'Every skill has evidence and none is slipping'
    return unit(len(mine), tested, held, slipping, focus=focus,
                headline=f'{demonstrated} of {len(mine)} skills demonstrated')


def knowledge_unit(rep):
    """A knowledge-base report (System Design, Fundamentals, AI) -> unit."""
    untested = [a['title'] for a in rep.get('areas', ()) if not a.get('tested')]
    if rep.get('slipping'):
        focus = f"{rep['slipping']} idea{'s' if rep['slipping'] != 1 else ''} slipping, due a review"
    elif untested:
        focus = f"{len(untested)} area{'s' if len(untested) != 1 else ''} not tested yet, such as {', '.join(untested[:2])}"
    elif rep.get('misconceptions'):
        focus = f"{rep['misconceptions']} misconception{'s' if rep['misconceptions'] != 1 else ''} to clear up"
    else:
        focus = 'Everything tested is holding'
    u = unit(rep['total'], rep['tested'], rep['knowledge'], rep.get('slipping', 0), focus=focus,
             headline=f"{rep['held']} of {rep['total']} ideas held right now")
    u['week'] = rep.get('week') or {}
    return u


def ledger_unit(ov, noun, focus=''):
    """A track overview built on the generic knowledge ledger (Experience, Practical) -> unit."""
    counts = ov.get('counts') or {}
    total = ov['total']
    tested = total - counts.get('unseen', 0)
    slipping = counts.get('fading', 0) + counts.get('shaky', 0)
    held = counts.get('solid', 0) + counts.get('learning', 0)
    return unit(total, tested, ov['knowledge'], slipping, focus=focus, headline=f'{held} of {total} {noun} held right now')


def experience_unit(ov):
    """Prompts and deep dives held, blended with whether every competency has a story to tell."""
    comps = ov.get('coverage') or []
    storied = sum(1 for c in comps if c['stories'])
    gaps = [c['title'] for c in comps if not c['stories']]
    recall = pct(ov['knowledge'], ov['total'])
    story = pct(storied, len(comps)) if comps else 0
    if gaps:
        focus = f"{len(gaps)} competenc{'ies' if len(gaps) != 1 else 'y'} with no story yet, such as {', '.join(gaps[:2])}"
    elif ov.get('due'):
        focus = f"{ov['due']} answer{'s' if ov['due'] != 1 else ''} fading"
    else:
        focus = 'Every competency has a story'
    u = ledger_unit(ov, 'answers', focus)
    u['headline'] = (f"{u['headline'].split(' held right now')[0]} held · {storied} of {len(comps)} competencies have a story"
                     if comps else u['headline'])
    u['ready'] = round((1 - STORY_SHARE) * recall + STORY_SHARE * story)
    u['band'] = band(u['ready'], u['coverage'] if not storied else max(u['coverage'], MIN_COVERAGE))
    u['stories'] = {'count': len(ov.get('stories') or []), 'competencies': len(comps), 'covered': storied}
    return u


def practical_unit(ov):
    fix = len((ov.get('mistakes') or {}).get('fix', ()))
    focus = f"{fix} exercise{'s' if fix != 1 else ''} to redo" if fix else (f"{ov['due']} fading" if ov.get('due') else '')
    return ledger_unit(ov, 'exercises', focus or 'Nothing waiting')


def interview(date_str, today, ready, target=70):
    """Days until the interview and the weekly gain needed to reach `target`. None without a valid date."""
    try:
        day = dt.date.fromisoformat((date_str or '').strip())
    except ValueError:
        return None
    days = (day - today).days
    gap = max(0, target - ready)
    weeks = days / 7
    per_week = 0 if not gap else (round(gap / weeks, 1) if weeks >= 1 else gap)
    return {'date': day.isoformat(), 'days_left': days, 'target': target, 'gap': gap, 'per_week': per_week}


# ---- the overall picture -----------------------------------------------------------------------

def weights(alloc):
    """Plan bucket shares -> a weight per section, summing to 1. Equal weights if the plan is unusable."""
    stack = [sid for sid, _, b in SECTIONS if b == 'stack']
    out = {}
    for sid, _, b in SECTIONS:
        share = float((alloc or {}).get(b, 0) or 0)
        out[sid] = share / len(stack) if b == 'stack' else share
    total = sum(out.values())
    if total <= 0:
        return {sid: 1 / len(SECTIONS) for sid in out}
    return {sid: w / total for sid, w in out.items()}


def build(units, alloc=None):
    """{section id: unit} + the plan's bucket shares -> the payload the page draws."""
    w = weights(alloc)
    rows = []
    for sid, title, bucket in SECTIONS:
        u = units.get(sid)
        if u is None:
            continue
        rows.append({'id': sid, 'title': title, 'bucket': bucket, 'weight': round(w[sid], 3), **u})
    total_w = sum(r['weight'] for r in rows) or 1
    ready = sum(r['ready'] * r['weight'] for r in rows) / total_w
    coverage = sum(r['coverage'] * r['weight'] for r in rows) / total_w
    ranked = sorted(rows, key=lambda r: (r['ready'], -r['weight']))
    gained = sum((r.get('week') or {}).get('gained', 0) for r in rows)
    slipped = sum((r.get('week') or {}).get('slipped', 0) for r in rows)
    for r in rows:
        r.pop('week', None)
    return {'sections': rows,
            'overall': {'ready': round(ready), 'coverage': round(coverage), 'band': band(round(ready), round(coverage)),
                        'weakest': ranked[0]['id'] if ranked else None, 'strongest': ranked[-1]['id'] if ranked else None,
                        'slipping': sum(r['slipping'] for r in rows), 'gained_week': gained, 'slipped_week': slipped}}


# ---- route -------------------------------------------------------------------------------------

router = APIRouter(prefix='/api/readiness', tags=['readiness'])


def compute(store, now=None):
    from .knowledge_base import api as kb_api, progress, model
    from .senpai import policy, service
    from .tracks import experience, practical
    now = now or time.time()
    b = service.bundle(store, now)
    units = {'leetcode': coding_unit(b['rows'])}
    c, events, states, seen, mis = kb_api.evidence(store, now)
    week_ago, _ = model.replay(events, now - progress.WEEK)
    for section in ('system-design', 'fundamentals', 'ai'):
        rep = progress.report(c, states, week_ago, seen, mis, now, section)
        units[section] = knowledge_unit(rep)
    units['experience'] = experience_unit(experience.overview(b['tracks'].get('experience', []), now))
    units['practical'] = practical_unit(practical.overview(b['tracks'].get('practical', []), now))
    try:
        alloc = policy.effective_allocation(service.load_plan(store, now), now)
    except Exception:  # a broken plan never hides the picture
        alloc = None
    out = build(units, alloc)
    try:
        out['interview'] = interview(b['settings'].get('interview_date'), dt.date.fromisoformat(b['today']), out['overall']['ready'])
    except ValueError:
        out['interview'] = None
    return {**out, 'now': now}


@router.get('')
async def get_readiness(store=Depends(store_for)):
    return await asyncio.to_thread(compute, store)
