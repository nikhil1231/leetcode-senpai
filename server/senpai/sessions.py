"""Assemble a practice session around an objective and a time budget. Pure; no I/O, no LLM.

Senpai composes sessions from material the app already has: due reviews and new problems (the scheduler's
queue), reserved application checks, recovery lessons, Quickfire, the system-design curriculum and its checks.
There is no fixed recipe: the budget is split across in-app buckets by the plan's effective allocation, and
each bucket is filled by priority. Retention checks come first because they are short and time-sensitive;
a stale or untested capability gets a quick diagnostic before any substantial remedial work; focus
capabilities and active objectives are preferred. Modes restrict activity types: `mixed` interleaves
subjects, `retrieval` keeps to recall, `learn` favours explanation, `interview` keeps to independent
implementation and design under interview conditions.
"""
import hashlib

from . import policy

MODES = ('mixed', 'retrieval', 'learn', 'interview')
DEPTHS = ('balanced', 'deep', 'broad')
PAR_MIN = {'Easy': 15, 'Medium': 25, 'Hard': 40}
ACTIVITY_MODES = {
    'mixed': {'check', 'retrieval', 'implementation', 'explanation', 'design'},
    'retrieval': {'check', 'retrieval'},
    'learn': {'check', 'explanation', 'retrieval'},
    'interview': {'implementation', 'design'},
}


def _block(kind, bucket, capability, activity, minutes, title, why, action, priority):
    return {'kind': kind, 'bucket': bucket, 'capability_id': capability, 'activity': activity,
            'minutes': int(minutes), 'title': title, 'why': why, 'action': action, 'priority': priority}


def candidates(capabilities, queue, sd_summary, quickfire_topics, focus_ids, objective_buckets, depth,
               llm_enabled, mode, tracks=None):
    caps = {c['id']: c for c in capabilities}
    out = []
    focus_ids = set(focus_ids)

    def bonus(cid, bucket):
        return (30 if cid in focus_ids else 0) + (10 if bucket in objective_buckets else 0)

    for c in queue.get('learning_checks', []):
        out.append(_block('application_check', 'dsa', None, 'check', 5, 'Later application check',
                          'A reserved retention check is due; it only means something on time.',
                          {'type': 'application', 'id': c['id']}, 100))
    for r in queue.get('reviews', []):
        cid = 'dsa:' + _skill_for(r.get('category'))
        recall = r.get('mode') == 'recall'
        out.append(_block('review', 'dsa', cid, 'retrieval' if recall else 'implementation',
                          8 if recall else PAR_MIN.get(r.get('difficulty'), 25),
                          r['title'], ('Leech: needs a full re-solve' if r.get('leech') else
                                       'Due for spaced review' + (' (quick recall)' if recall else ' (full re-solve)')),
                          {'type': 'problem', 'slug': r['slug'], 'kind': 'review', 'mode': r.get('mode') or '',
                           'title': r['title'], 'category': r.get('category')},
                          70 + (10 if r.get('leech') else 0) + bonus(cid, 'dsa')))
    for n in queue.get('new', []):
        cid = 'dsa:' + _skill_for(n.get('category'))
        out.append(_block('new_problem', 'dsa', cid, 'implementation', PAR_MIN.get(n.get('difficulty'), 25) + 5,
                          n['title'], f"New problem in {n.get('category')}: builds coverage where evidence is thin.",
                          {'type': 'problem', 'slug': n['slug'], 'kind': 'new', 'mode': '', 'title': n['title'],
                           'category': n.get('category')},
                          40 + (10 if depth == 'deep' else 0) + bonus(cid, 'dsa')))
    rec = queue.get('learning_recovery')
    if rec:
        out.append(_block('lesson_sequence', 'dsa', None, 'explanation', 10, rec['title'],
                          rec.get('reason', 'Repeated difficulty') + ': a short worked lesson before more practice.',
                          {'type': 'sequence', 'sequence': rec['sequence']}, 75))
    from .. import curriculum
    order = {'dsa:' + sid: i for i, sid in enumerate(curriculum.SKILLS)}
    spare_diagnostic = True   # beyond focus, one diagnostic per session, in curriculum order
    for c in sorted(capabilities, key=lambda c: (c['id'] not in focus_ids, order.get(c['id'], 99), c['id'])):
        cid, status = c['id'], c['status']
        relevant = cid in focus_ids or (c['bucket'] in objective_buckets and spare_diagnostic)
        if c['bucket'] == 'dsa' and c['name'] in quickfire_topics:
            if status in ('stale', 'untested') and relevant:
                if cid not in focus_ids:
                    spare_diagnostic = False
                out.append(_block('diagnostic', 'dsa', cid, 'retrieval', 5, f"Quickfire: {c['name']}",
                                  ('Not practised recently. A quick check first; no recent activity is not a weakness.'
                                   if status == 'stale' else 'No recorded evidence yet. A quick diagnostic before planning work.'),
                                  {'type': 'quickfire', 'topic': c['name']}, 60 + bonus(cid, 'dsa') + (10 if depth == 'broad' else 0)))
            elif status == 'needs_check':
                out.append(_block('retrieval', 'dsa', cid, 'retrieval', 5, f"Quickfire: {c['name']}",
                                  'Recent attempts needed help. Independent retrieval shows whether it has settled.',
                                  {'type': 'quickfire', 'topic': c['name']}, 55 + bonus(cid, 'dsa')))
        if llm_enabled and status == 'needs_check' and cid in focus_ids:
            out.append(_block('explain', c['bucket'], cid, 'explanation', 10, f"Talk it through: {c['name']}",
                              'A guided explanation for a focus capability that keeps needing help. Recorded as assistance.',
                              {'type': 'teach', 'capability_id': cid}, 50 + bonus(cid, c['bucket'])))
    lessons = {l['id']: l for l in (sd_summary or {}).get('lessons', [])}
    review = [l for l in lessons.values() if l.get('due') or l.get('mistakes')]
    if review:
        cats = {'sd:' + l['category'] for l in review}
        cid = next((c for c in cats if c in focus_ids), sorted(cats)[0])
        out.append(_block('sd_review', 'system_design', cid, 'retrieval', min(12, 4 + 2 * len(review)),
                          'System design Quickfire',
                          f"{len(review)} lesson(s) have checks due or missed ({', '.join(l['title'] for l in review[:3])}"
                          f"{'…' if len(review) > 3 else ''}); retrieval before new material.",
                          {'type': 'sd_quickfire'}, 65 + max(bonus(c, 'system_design') for c in cats)))
    nxt = lessons.get((sd_summary or {}).get('next_lesson'))
    if nxt:
        cid = 'sd:' + nxt['category']
        out.append(_block('sd_lesson', 'system_design', cid, 'explanation', nxt.get('minutes') or 12, nxt['title'],
                          'Next lesson in the system design curriculum, with its recorded checks.',
                          {'type': 'sd_lesson', 'id': nxt['id']}, 45 + bonus(cid, 'system_design')))
    out.append(_block('sd_case', 'system_design', None, 'design', 40 if depth == 'deep' else 30,
                      'Design case', 'Apply the material end-to-end under realistic constraints.',
                      {'type': 'sd_cases'}, 30 + (25 if mode == 'interview' or depth == 'deep' else 0)))
    out += _track_blocks(tracks or {}, objective_buckets, depth)
    if mode == 'interview':
        for b in out:
            if b['activity'] == 'implementation':
                b['action'] = {**b['action'], 'interview': True}
                b['why'] += ' Interview conditions: plain editor, capped runs, no hints.'
    unique = {}
    for b in out:
        key = (b['kind'], b['capability_id'], b['title'])
        if key not in unique or unique[key]['priority'] < b['priority']:
            unique[key] = b
    return list(unique.values())


TRACK_TITLES = {'fundamentals': 'Fundamentals', 'ai': 'AI Engineering'}


def _track_blocks(tracks, objective_buckets, depth):
    """Blocks from the Experience, Fundamentals, AI Engineering and Practical Coding sections."""
    out = []
    go = lambda track, view: {'type': 'track', 'track': track, 'view': view}
    for track, title in TRACK_TITLES.items():
        t = tracks.get(track)
        if not t:
            continue
        bonus = 10 if 'stack' in objective_buckets else 0
        if t['due'] or t['mistakes']:
            out.append(_block('track_quickfire', 'stack', None, 'retrieval', 6, f'{title} Quickfire',
                              f"{t['mistakes']} to fix and {t['due']} fading: retrieval before new material.",
                              go(track, 'quickfire'), 62 + bonus))
        if t['next_lesson']:
            n = t['next_lesson']
            out.append(_block('track_lesson', 'stack', None, 'explanation', n['minutes'], n['title'],
                              f'Next {title} lesson, with a short check at the end.',
                              go(track, 'lesson/' + n['id']), 42 + bonus - (5 if track == 'ai' and t['answers'] else 0)))
    ex = (tracks.get('practical') or {}).get('next')
    if ex:
        out.append(_block('practical', 'stack', None, 'implementation', ex['minutes'], ex['title'],
                          'A practical round: build, extend, debug or review realistic code against tests.',
                          go('practical', 'exercise/' + ex['id']), 36 + (15 if depth == 'deep' else 0)))
    e = tracks.get('experience')
    if e:
        bonus = 10 if 'behavioural' in objective_buckets else 0
        out.append(_block('behavioural_answer', 'behavioural', None, 'retrieval', 8, 'Timed behavioural answer',
                          (f"{e['due'] + e['mistakes']} prompt(s) due or missed. " if e['due'] or e['mistakes'] else '')
                          + f"Next: “{e['next_prompt']}” Answer out loud, then self-check.",
                          go('experience', 'drill'), (64 if e['due'] or e['mistakes'] else 48) + bonus))
        if e['gaps'] and e['stories'] < 12:
            out.append(_block('story', 'behavioural', None, 'explanation', 15, 'Write a story for your bank',
                              f"{e['gaps']} competencies have no story yet; draft one from your CV.",
                              go('experience', 'stories'), 40 + bonus))
    return out


def _skill_for(category):
    from .. import curriculum
    return curriculum.CATEGORY_SKILLS.get(category, 'unknown')


def prepare(plan, now, date, capabilities, queue, sd_summary, quickfire_topics, *, budget=60, mode='mixed',
            depth='balanced', objective=None, llm_enabled=False, tracks=None):
    mode = mode if mode in MODES else 'mixed'
    depth = depth if depth in DEPTHS else 'balanced'
    focus_ids = [f['capability_id'] for f in policy.active_focus(plan)]
    objectives = [o for o in plan.get('objectives', []) if o.get('status') == 'active']
    objective_buckets = {o['bucket'] for o in objectives}
    if objective:
        obj = next((o for o in objectives if o['id'] == objective), None)
        if obj:
            focus_ids = focus_ids + obj.get('capability_ids', [])
            objective_buckets = {obj['bucket']}
        elif objective.startswith(('dsa:', 'sd:')):
            focus_ids = focus_ids + [objective]
    allowed = ACTIVITY_MODES[mode]
    pool = [b for b in candidates(capabilities, queue, sd_summary, quickfire_topics, focus_ids, objective_buckets,
                                  depth, llm_enabled, mode, tracks) if b['activity'] in allowed]
    alloc = policy.effective_allocation(plan, now)
    in_app = {b: alloc[b] for b in policy.IN_APP}
    if objective and objective_buckets <= set(policy.IN_APP):
        in_app = {b: (1.0 if b in objective_buckets else 0.0) for b in policy.IN_APP}
    total = sum(in_app.values()) or 1
    share = {b: budget * v / total for b, v in in_app.items()}
    chosen, used = [], {b: 0 for b in policy.IN_APP}
    pool.sort(key=lambda b: (-b['priority'], b['minutes'], b['title']))
    for b in pool:  # fill each bucket up to its share
        if used[b['bucket']] + b['minutes'] <= share[b['bucket']] + 3:
            chosen.append(b)
            used[b['bucket']] += b['minutes']
    for b in pool:  # leftover time goes to the best remaining fit
        if b not in chosen and sum(used.values()) + b['minutes'] <= budget + 3 and share.get(b['bucket'], 0) > 0:
            chosen.append(b)
            used[b['bucket']] += b['minutes']
    if not chosen and pool:
        chosen = [min(pool, key=lambda b: (b['minutes'], -b['priority']))]
    chosen = _order(chosen, mode)
    for i, b in enumerate(chosen):
        b['id'] = hashlib.sha256(f"{date}:{i}:{b['kind']}:{b['title']}".encode()).hexdigest()[:10]
    outside = [{'bucket': b, 'label': policy.BUCKET_LABELS[b],
                'minutes_per_week': round(plan.get('weekly_minutes', 420) * alloc[b])}
               for b in policy.BUCKETS if b not in policy.IN_APP and alloc[b] > 0]
    return {'date': date, 'mode': mode, 'depth': depth, 'objective': objective, 'budget_minutes': budget,
            'planned_minutes': sum(b['minutes'] for b in chosen), 'blocks': chosen,
            'allocation': {b: round(alloc[b], 3) for b in policy.BUCKETS}, 'outside': outside,
            'focus': focus_ids, 'plan_revision': plan['revision'], 'generated_at': now, 'generated_by': 'rules',
            'note': ('Nothing is due and no material matched this mode. Try mixed mode or a longer budget.'
                     if not chosen else '')}


def _order(blocks, mode):
    """Checks warm up the session; then subjects interleave (mixed) or stay grouped."""
    checks = [b for b in blocks if b['activity'] == 'check']
    rest = sorted((b for b in blocks if b['activity'] != 'check'), key=lambda b: -b['priority'])
    if mode != 'mixed':
        return checks + rest
    queues = {k: [b for b in rest if b['bucket'] == k] for k in policy.IN_APP}
    out = []
    while any(queues.values()):
        for k in policy.IN_APP:
            if queues[k]:
                out.append(queues[k].pop(0))
    return checks + out
