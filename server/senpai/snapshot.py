"""Senpai's compact state and its readable Markdown snapshot. Pure; no I/O.

The structured state is the memory: priorities, progress, uncertainties and open questions, each pointing at
evidence by reference. The Markdown is rendered from it on demand and never edited or summarised again, so
nothing degrades through summaries of summaries; detail is fetched from the owning source when needed.
"""
import datetime as dt

from . import capabilities as caps_mod, policy

DAY = 86400
SUBJECT_BUCKET = {'Coding': 'dsa', 'Coding knowledge': 'dsa', 'Quickfire': 'dsa', 'System design': 'system_design'}


def progress(activity_events, rows, now):
    out = {b: {'activities_7d': 0, 'measured_minutes_7d': 0, 'unmeasured_7d': 0} for b in policy.IN_APP}
    for e in activity_events:
        b = SUBJECT_BUCKET.get(e.get('subject'))
        if not b or now - e['at'] > 7 * DAY:
            continue
        out[b]['activities_7d'] += 1
        if isinstance(e.get('elapsed_sec'), (int, float)) and e['elapsed_sec'] > 0:
            out[b]['measured_minutes_7d'] += round(e['elapsed_sec'] / 60)
        else:
            out[b]['unmeasured_7d'] += 1
    for r in rows:
        counts = out[r['bucket']].setdefault('status', {})
        counts[r['status']] = counts.get(r['status'], 0) + 1
    return out


def build(previous, plan, rows, activity_events, questions, job, now):
    names = {r['id']: r['name'] for r in rows}
    by_id = {r['id']: r for r in rows}
    priorities = [{'kind': 'focus', 'capability_id': f['capability_id'], 'name': names.get(f['capability_id'], f['capability_id']),
                   'status': by_id.get(f['capability_id'], {}).get('status'), 'why': f.get('reason', '')}
                  for f in policy.active_focus(plan)]
    priorities += [{'kind': 'overlay', 'name': o['label'], 'until': o['expires_at'], 'why': 'Temporary: ' + o['label']}
                   for o in policy.active_overlays(plan, now)]
    priorities += [{'kind': 'objective', 'objective_id': o['id'], 'name': o['title'], 'protected': o.get('protected')}
                   for o in plan.get('objectives', []) if o.get('status') == 'active']
    uncertainties = []
    untested = [r['name'] for r in rows if r['status'] == 'untested']
    if untested:
        uncertainties.append(f"No recorded evidence for {len(untested)} capabilities (e.g. {', '.join(untested[:3])}); "
                             "that is unknown, not weak.")
    if not job or not job.get('fetched_at'):
        uncertainties.append('No Job Scout brief yet: career context comes from the locally saved target only.')
    elif now - job['fetched_at'] > 8 * DAY:
        uncertainties.append('The Job Scout brief is more than a week old.')
    uncertainties.append('Only practice recorded in this app is visible; outside learning and time are unknown.')
    return {**(previous or {}), 'revision': (previous or {}).get('revision', 0) + 1, 'updated_at': now,
            'plan_revision': plan['revision'], 'priorities': priorities,
            'progress': progress(activity_events, rows, now), 'uncertainties': uncertainties,
            'questions': [q for q in questions if not q.get('answered_at')][:5],
            'capabilities': caps_mod.digest(rows, [f['capability_id'] for f in policy.active_focus(plan)], 40),
            'job_context': {k: (job or {}).get(k) for k in ('fingerprint', 'fetched_at', 'generated_at', 'error', 'career_target')}}


def _when(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime('%Y-%m-%d') if ts else 'never'


def render(state, plan, now):
    alloc = policy.effective_allocation(plan, now)
    lines = [f"# Senpai snapshot", f"_State r{state.get('revision')}, plan r{plan['revision']}, {_when(state.get('updated_at'))}_", '']
    target = (state.get('job_context') or {}).get('career_target')
    if target:
        lines += ['## Career target', target, '']
    lines += ['## Time allocation', f"{plan.get('weekly_minutes')} minutes a week."]
    for b in policy.BUCKETS:
        base = plan['allocation'].get(b, 0)
        note = f" (plan {base:.0%})" if abs(alloc[b] - base) > 0.005 else ''
        protected = f", protected ≥ {plan['protected'][b]:.0%}" if plan.get('protected', {}).get(b) else ''
        lines.append(f"- {policy.BUCKET_LABELS[b]}: {alloc[b]:.0%}{note}{protected}")
    lines.append('')
    lines.append('## Priorities')
    for p in state.get('priorities', []) or [{'kind': '-', 'name': 'None set'}]:
        extra = f" — {p['status']}" if p.get('status') else ''
        extra += f" (until {_when(p['until'])})" if p.get('until') else ''
        extra += ' [protected]' if p.get('protected') else ''
        lines.append(f"- **{p['kind']}**: {p['name']}{extra}" + (f" — {p['why']}" if p.get('why') else ''))
    lines += ['', '## Progress (last 7 days)']
    for b, v in (state.get('progress') or {}).items():
        status = ', '.join(f"{k} {n}" for k, n in sorted((v.get('status') or {}).items()))
        lines.append(f"- {policy.BUCKET_LABELS[b]}: {v['activities_7d']} activities, {v['measured_minutes_7d']} measured "
                     f"minutes ({v['unmeasured_7d']} unmeasured). Capabilities: {status}.")
    lines += ['', '## Uncertainties'] + [f"- {u}" for u in state.get('uncertainties', [])]
    if state.get('questions'):
        lines += ['', '## Open questions'] + [f"- {q['text']}" for q in state['questions']]
    return '\n'.join(lines) + '\n'
