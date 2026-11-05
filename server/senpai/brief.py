"""This week, in a few lines: what to do toward the career goal and why. Pure; no I/O, no LLM.

The plan's shares and capability statuses are bookkeeping; this is what a coach would say. At most four
items, each one concrete thing with a reason drawn from your data and one action:
- target: the first area your career target names that has no recent evidence, through its first open lesson;
- cv: the CV claim an interviewer is most likely to dig into, defended in a tutor interview;
- gap: an idea Telegram asked about twice without an answer, handed to the tutor instead;
- coding: step up to interview conditions when reviews come back clean, else get the reps in.
"""
import datetime as dt

from . import career

DAY = 86400
FRESH = ('untested', 'stale', 'needs_check')
CV_EVERY_DAYS = 14
RECENT_DAYS = 14
STEP_UP_SOLVES, STEP_UP_CLEAN = 6, 0.8
KEYWORD_LABEL = {'zookeeper': 'ZooKeeper', 'llm': 'LLM features', 'rag': 'RAG', 'mongodb': 'MongoDB',
                 'kubernetes': 'Kubernetes', 'kafka': 'Kafka'}


def _week(now):
    y, w, _ = dt.datetime.fromtimestamp(now, dt.timezone.utc).isocalendar()
    return f'{y}-W{w:02d}'


def _lesson_for(cid, sd_lessons, tracks):
    """-> (section, lesson id, title, minutes) of a capability's first open lesson, or None."""
    if cid.startswith('sd:'):
        l = next((l for l in sd_lessons if 'sd:' + l['category'] == cid and not l.get('completed')), None)
        return l and ('system-design', l['id'], l['title'], l.get('minutes') or 12)
    if cid.startswith('track:'):
        _, track, cat = cid.split(':', 2)
        n = ((tracks.get(track) or {}).get('next_by_category') or {}).get(cat)
        return n and (track, n['id'], n['title'], n['minutes'])
    return None


def _tutor(section, lesson, **extra):
    return {'type': 'tutor', 'section': section, 'lesson': lesson, **extra}


def target_item(goal, job, plan, rows, sd_lessons, tracks):
    caps = [c for o in plan.get('objectives', []) if o.get('status') == 'active' and o['id'].startswith('career-')
            for c in o.get('capability_ids', [])]
    caps += [f['capability_id'] for f in plan.get('focus', []) if f.get('status', 'active') == 'active']
    by_id = {r['id']: r for r in rows}
    demand = ((job or {}).get('context') or {}).get('demand') or {}
    roles = (demand.get('cohort') or {}).get('roles') or 0
    mapped = [{'tag': t['tag'], 'share': t.get('share') or 0, 'capability_id': career._cap_of_tag(t['tag'])}
              for t in demand.get('tags') or []]
    for cid in dict.fromkeys(caps):
        r = by_id.get(cid)
        found = r and r['status'] in FRESH and _lesson_for(cid, sd_lessons, tracks)
        if not found:
            continue
        section, lesson, title, minutes = found
        named = cid in career.target_capabilities(goal)
        why = [f"Your target ({career.short_target(goal)}) names {r['name']}." if named and goal
               else f"{r['name']} is in focus."]
        market = career.why_market(cid, mapped, roles)
        if market:
            why.append(market)
        why.append({'untested': 'Nothing recorded on it yet, so start with the lesson.',
                    'stale': 'Not practised for three weeks: a lesson brings it back.',
                    'needs_check': 'Your recent answers needed help: go through it with the tutor.'}[r['status']])
        return {'kind': 'target', 'label': 'Toward your target', 'title': title, 'why': ' '.join(why),
                'minutes': minutes, 'capability_id': cid, 'action': _tutor(section, lesson)}
    return None


def cv_item(job, cv_sessions_at, now, llm_enabled):
    ctx = (job or {}).get('context') or {}
    hook = career.cv_hook(ctx.get('experience'), ctx.get('self_reported_topics'))
    if not hook or not llm_enabled or any(now - t < CV_EVERY_DAYS * DAY for t in cv_sessions_at):
        return None
    label = KEYWORD_LABEL.get(hook['keyword'], hook['keyword'].capitalize())
    excerpt = _clause(hook['excerpt'], hook['keyword'])
    why = [f"Your CV says: “{excerpt[:160].rstrip('. ')}{'…' if len(excerpt) > 160 else '.'}”"]
    if hook.get('cited_by_roles'):
        why.append(f"It matches {hook['cited_by_roles']} of the roles you're looking at, so interviewers will dig in.")
    if hook['weak']:
        why.append('You rated ' + ' and '.join(t.split('—')[-1].strip() for t in hook['weak'][:2]) + ' as needing work.')
    why.append('Marcus interviews you on your own work, then debriefs.')
    return {'kind': 'cv', 'label': 'Defend your CV', 'title': f'Defend your {label} work', 'why': ' '.join(why),
            'minutes': 20, 'action': _tutor(hook['section'], hook['lesson'], mode='cv')}


def gap_item(gaps):
    g = next(iter(gaps), None)
    if not g:
        return None
    return {'kind': 'gap', 'label': 'Close a gap', 'title': g['lesson_title'],
            'why': f"Telegram asked about this {'twice' if g['ignored'] == 2 else str(g['ignored']) + ' times'} with no answer: "
                   f"{g['text'][:1].upper() + g['text'][1:].rstrip('. ')}. One tutor session will land it better than another card.",
            'minutes': 15, 'action': _tutor(g['section'], g['lesson'], focus=g['text'])}


def _score(a):
    g = a.get('solution_grade')
    g = g.get('score') if isinstance(g, dict) else g
    return g if isinstance(g, (int, float)) else None


def _clause(excerpt, keyword):
    """The sentence or clause of a CV excerpt that mentions the keyword, without its header."""
    parts = [p.strip(' .|') for chunk in excerpt.split(' | ') for p in chunk.replace('. ', ' - ').split(' - ')]
    hit = next((p for p in parts if keyword in p.lower()), excerpt)
    return hit[0].upper() + hit[1:] if hit else excerpt


def coding_item(attempts, problems, rows, now):
    diff = {p['slug']: p.get('difficulty') for p in problems}
    recent = [a for a in attempts if (a.get('solved_at') or 0) > now - RECENT_DAYS * DAY and a.get('kind') != 'recall']
    clean = [a for a in recent if a.get('independence') == 'solo' and not a.get('gave_up')
             and (_score(a) or 0) >= 4]
    weak = [r['name'] for r in rows if r['bucket'] == 'dsa' and r['status'] == 'needs_check'][:2]
    keep = f" Keep {' and '.join(weak)} in rotation." if weak else ''
    if len(recent) >= STEP_UP_SOLVES and len(clean) / len(recent) >= STEP_UP_CLEAN:
        hard = sum(diff.get(a.get('slug')) == 'Hard' for a in recent)
        return {'kind': 'coding', 'label': 'Coding', 'title': 'Step up: timed Mediums and Hards, interview conditions',
                'why': f"{len(clean)} of your last {len(recent)} solves were clean and unassisted"
                       f"{f', only {hard} of them Hard' if hard < 3 else ''}. Reviews alone won't stretch you now; "
                       f"a plain editor, a clock and no hints will.{keep}",
                'minutes': 60, 'action': {'type': 'session', 'mode': 'interview'}}
    if len(recent) < 3:
        return {'kind': 'coding', 'label': 'Coding', 'title': 'Get the coding reps back in',
                'why': f"{len(recent)} solve{'s' if len(recent) != 1 else ''} in the last two weeks. "
                       f"Coding rounds are still most loops' first filter.{keep}",
                'minutes': 45, 'action': {'type': 'session', 'mode': 'mixed'}}
    return {'kind': 'coding', 'label': 'Coding', 'title': 'Keep the reviews honest',
            'why': f"{len(clean)} of your last {len(recent)} solves were clean. Work through today's reviews before "
                   f"adding new problems.{keep}",
            'minutes': 45, 'action': {'type': 'session', 'mode': 'mixed'}}


def build(goal, job, plan, rows, sd_lessons, tracks, attempts, problems, gaps, cv_sessions_at, now, llm_enabled):
    """-> {week, goal, items: [...]} with at most four items, most useful first."""
    items = [target_item(goal, job, plan, rows, sd_lessons, tracks), cv_item(job, cv_sessions_at, now, llm_enabled),
             gap_item(gaps) if llm_enabled else None, coding_item(attempts, problems, rows, now)]
    items = [i for i in items if i]
    for i, it in enumerate(items):
        it['id'] = f"{_week(now)}:{it['kind']}"
    return {'week': _week(now), 'goal': career.short_target(goal) if goal else '', 'items': items}
