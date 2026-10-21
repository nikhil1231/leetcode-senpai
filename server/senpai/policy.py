"""Senpai's authority: what a plan change may do on its own, what needs approval. Pure; no I/O.

The plan says how learning time is split (allocation shares per bucket), what is in focus (at most a few
capabilities), which objectives are protected, and which temporary overlays apply (e.g. an imminent
interview). `classify` decides whether a proposed change is applied automatically, routed for approval,
deferred until evidence is sustained, or rejected; `apply` produces the next plan revision.

Allocation changes are damped by a learning rate scaled by confidence, capped per ISO week and floored at
protected minimums. Factual corrections (an objective done, an overlay removed) are not damped. The Charter
(free text, in settings) shapes teaching style; these limits are enforced in code and never edited by the model.
"""
import copy
import datetime as dt
import hashlib
import json

BUCKETS = ('dsa', 'system_design', 'behavioural', 'stack')
IN_APP = ('dsa', 'system_design')
BUCKET_LABELS = {'dsa': 'Coding (DSA)', 'system_design': 'System design',
                 'behavioural': 'Behavioural (outside the app)', 'stack': 'Role stack (outside the app)'}
CONFIDENCE = {'low': 1 / 3, 'medium': 2 / 3, 'high': 1.0}
KINDS = ('rebalance', 'focus_add', 'focus_remove', 'overlay_add', 'overlay_remove', 'objective_add',
         'objective_complete', 'objective_remove', 'set_protected', 'weekly_minutes', 'authority')
ALWAYS_APPROVAL = {'set_protected', 'weekly_minutes', 'authority'}
DAY = 86400

DEFAULT_LIMITS = {
    'learning_rate': 0.5,        # fraction of a requested allocation move applied at once (× confidence)
    'max_weekly_shift': 0.10,    # total share that may move between buckets per ISO week, automatically
    'max_focus': 3,
    'focus_cooldown_days': 7,    # a capability removed from focus can't come straight back
    'min_evidence_weeks': 2,     # market signals must persist this many weeks before becoming a focus
    'overlay_max_weight': 0.5,
    'overlay_max_days': 21,
    'max_objectives': 6,
}


def limits(settings):
    out = dict(DEFAULT_LIMITS)
    for key in DEFAULT_LIMITS:
        value = (settings or {}).get('senpai_' + key)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0:
            out[key] = value
    out['learning_rate'] = min(1.0, out['learning_rate'])
    out['max_weekly_shift'] = min(1.0, out['max_weekly_shift'])
    out['overlay_max_weight'] = min(0.9, out['overlay_max_weight'])
    return out


def iso_week(at):
    y, w, _ = dt.datetime.fromtimestamp(at, dt.timezone.utc).isocalendar()
    return f'{y}-W{w:02d}'


def default_plan(settings, now):
    return {
        'revision': 1, 'created_at': now, 'updated_at': now,
        'weekly_minutes': int((settings or {}).get('senpai_weekly_minutes') or 420),
        'allocation': {'dsa': 0.55, 'system_design': 0.30, 'behavioural': 0.10, 'stack': 0.05},
        'protected': {'dsa': 0.30, 'system_design': 0.15},
        'objectives': [
            {'id': 'core-dsa', 'title': 'Solve core interview patterns independently, and keep them retained',
             'bucket': 'dsa', 'capability_ids': [], 'protected': True, 'status': 'active', 'created_at': now,
             'source': 'default'},
            {'id': 'sd-course', 'title': 'Work through the system design curriculum with recorded checks',
             'bucket': 'system_design', 'capability_ids': [], 'protected': True, 'status': 'active',
             'created_at': now, 'source': 'default'},
        ],
        'focus': [], 'focus_history': [], 'overlays': [],
        'movement': {'week': iso_week(now), 'moved': 0.0},
    }


def _normalise(alloc):
    alloc = {b: max(0.0, float(alloc.get(b, 0.0))) for b in BUCKETS}
    total = sum(alloc.values()) or 1.0
    return {b: round(v / total, 4) for b, v in alloc.items()}


def with_shares(current, target):
    """Set the named buckets exactly; the others share what is left in their current proportions."""
    fixed = {k: max(0.0, min(1.0, float(v))) for k, v in target.items() if k in BUCKETS}
    total_fixed = sum(fixed.values())
    if total_fixed >= 1:
        return _normalise(fixed)
    rest = {b: current.get(b, 0) for b in BUCKETS if b not in fixed}
    scale = (1 - total_fixed) / (sum(rest.values()) or 1)
    return _normalise({**{b: v * scale for b, v in rest.items()}, **fixed})


def _floor(alloc, protected):
    """Raise buckets to their protected minimums, taking the difference proportionally from the others."""
    alloc = dict(alloc)
    for _ in range(len(BUCKETS)):
        short = {b: protected.get(b, 0) - alloc[b] for b in BUCKETS if alloc[b] < protected.get(b, 0) - 1e-9}
        if not short:
            break
        need = sum(short.values())
        donors = {b: alloc[b] - protected.get(b, 0) for b in BUCKETS if b not in short and alloc[b] > protected.get(b, 0)}
        spare = sum(donors.values())
        if spare <= 0:
            break
        for b in short:
            alloc[b] = protected[b]
        for b, room in donors.items():
            alloc[b] -= need * room / spare
    return _normalise(alloc)


def shift(a, b):
    """Share moved between two allocations: the sum of increases."""
    return round(sum(max(0.0, b.get(k, 0) - a.get(k, 0)) for k in BUCKETS), 4)


def active_overlays(plan, now):
    return [o for o in plan.get('overlays', []) if o.get('starts_at', 0) <= now < o.get('expires_at', 0)]


def effective_allocation(plan, now):
    alloc = _normalise(plan['allocation'])
    for o in active_overlays(plan, now):
        w = float(o.get('weight', 0))
        target = _normalise(o.get('allocation', {}))
        alloc = {b: (1 - w) * alloc[b] + w * target[b] for b in BUCKETS}
    return _floor(_normalise(alloc), plan.get('protected', {}))


def active_focus(plan):
    return [f for f in plan.get('focus', []) if f.get('status', 'active') == 'active']


def _movement_left(plan, lim, now):
    m = plan.get('movement') or {}
    used = m.get('moved', 0.0) if m.get('week') == iso_week(now) else 0.0
    return max(0.0, lim['max_weekly_shift'] - used)


def damp(plan, target, confidence, lim, now):
    """The allocation an automatic rebalance may reach this week, toward `target`."""
    current = _normalise(plan['allocation'])
    goal = _floor(with_shares(current, target), plan.get('protected', {}))
    rate = lim['learning_rate'] * CONFIDENCE.get(confidence, CONFIDENCE['low'])
    step = {b: current[b] + rate * (goal[b] - current[b]) for b in BUCKETS}
    moved, left = shift(current, step), _movement_left(plan, lim, now)
    if moved > left:
        scale = left / moved if moved else 0
        step = {b: current[b] + scale * (step[b] - current[b]) for b in BUCKETS}
    return _floor(_normalise(step), plan.get('protected', {}))


def change_key(change, base_revision):
    """Idempotency key: the same change against the same plan revision is one change."""
    core = {k: v for k, v in change.items() if k not in ('rationale', 'evidence', 'confidence', 'source', 'at')}
    return hashlib.sha256(json.dumps([core, base_revision], sort_keys=True, default=str).encode()).hexdigest()[:20]


def classify(plan, change, lim, now, known_capabilities=None):
    """-> (decision, reasons, effective_change). decision: auto | approval | defer | reject."""
    kind = change.get('kind')
    if kind not in KINDS:
        return 'reject', [f'Unknown change kind {kind!r}.'], change
    if kind in ALWAYS_APPROVAL:
        return 'approval', ['Changes to time commitments, protections or Senpai\'s authority need your approval.'], change
    if kind == 'rebalance':
        target = {k: float(v) for k, v in (change.get('target') or {}).items() if k in BUCKETS and v is not None}
        if not target:
            return 'reject', ['A rebalance needs at least one target share.'], change
        if change.get('immediate'):
            return 'approval', ['An immediate (undamped) allocation change exceeds the automatic limits.'], change
        reached = damp(plan, target, change.get('confidence', 'low'), lim, now)
        if shift(_normalise(plan['allocation']), reached) < 0.005:
            return 'defer', ['This week\'s automatic allocation movement is used up, or the step is negligible.'], change
        return 'auto', [f"Damped by learning rate {lim['learning_rate']} × {change.get('confidence', 'low')} "
                        f"confidence; weekly cap {lim['max_weekly_shift']}."], {**change, 'target': reached}
    if kind == 'focus_add':
        cid = change.get('capability_id')
        if not cid or (known_capabilities is not None and cid not in known_capabilities):
            return 'reject', [f'Unknown capability {cid!r}.'], change
        focus = active_focus(plan)
        if any(f['capability_id'] == cid for f in focus):
            return 'reject', ['Already in focus.'], change
        removed = [h for h in plan.get('focus_history', []) if h.get('capability_id') == cid]
        if removed and now - max(h['removed_at'] for h in removed) < lim['focus_cooldown_days'] * DAY:
            return 'defer', [f"Removed from focus within the last {lim['focus_cooldown_days']} days (cooldown)."], change
        if change.get('basis') == 'market' and (change.get('sustained_weeks') or 0) < lim['min_evidence_weeks']:
            return 'defer', [f"Market signals must persist {lim['min_evidence_weeks']} weeks before becoming a focus."], change
        if len(focus) >= lim['max_focus']:
            return 'approval', [f"Focus is full ({lim['max_focus']}); adding means choosing what to drop."], change
        return 'auto', ['Within the active-focus limit.'], change
    if kind == 'focus_remove':
        if not any(f['capability_id'] == change.get('capability_id') for f in active_focus(plan)):
            return 'reject', ['Not in focus.'], change
        return 'auto', ['Removing a focus is always allowed.'], change
    if kind == 'overlay_add':
        weight = float(change.get('weight') or 0)
        expires, starts = change.get('expires_at') or 0, change.get('starts_at') or now
        if expires <= now or not change.get('allocation'):
            return 'reject', ['An overlay needs an allocation and a future expiry.'], change
        if any(o.get('source_ref') == change.get('source_ref') and o.get('expires_at', 0) > now
               for o in plan.get('overlays', []) if change.get('source_ref')):
            return 'reject', ['An overlay for this source already exists.'], change
        if (change.get('basis') == 'interview' and weight <= lim['overlay_max_weight']
                and expires - starts <= lim['overlay_max_days'] * DAY):
            return 'auto', ['A temporary interview overlay within the weight and duration limits.'], change
        return 'approval', ['Overlays beyond the interview limits need approval.'], change
    if kind == 'overlay_remove':
        if not any(o.get('id') == change.get('overlay_id') for o in plan.get('overlays', [])):
            return 'reject', ['No such overlay.'], change
        return 'auto', ['Removing an overlay restores the plan.'], change
    if kind == 'objective_add':
        if change.get('bucket') not in BUCKETS or not (change.get('title') or '').strip():
            return 'reject', ['An objective needs a title and a bucket.'], change
        active = [o for o in plan.get('objectives', []) if o.get('status') == 'active']
        if len(active) >= lim['max_objectives'] or change.get('protected'):
            return 'approval', ['Adding protected objectives or exceeding the objective limit needs approval.'], change
        return 'auto', ['A small, unprotected objective.'], change
    objective = next((o for o in plan.get('objectives', []) if o.get('id') == change.get('objective_id')), None)
    if objective is None or objective.get('status') != 'active':
        return 'reject', ['No such active objective.'], change
    if kind == 'objective_complete':
        if objective.get('protected'):
            return 'approval', ['Completing a protected objective needs your confirmation.'], change
        return 'auto', ['A factual correction.'], change
    if objective.get('protected'):  # objective_remove
        return 'approval', ['Removing a protected objective needs approval.'], change
    return 'auto', ['Removing an unprotected objective.'], change


def apply(plan, change, now):
    """Apply an already-classified (or approved) change. Returns the next plan revision."""
    p = copy.deepcopy(plan)
    kind = change['kind']
    if kind == 'rebalance':
        before = _normalise(p['allocation'])
        if change.get('immediate'):
            after = _floor(with_shares(before, change['target']), p.get('protected', {}))
        else:
            after = _normalise(change['target'])
        moved = shift(before, after)
        m = p.get('movement') or {}
        week = iso_week(now)
        p['movement'] = {'week': week, 'moved': round((m.get('moved', 0) if m.get('week') == week else 0) + moved, 4)}
        p['allocation'] = after
    elif kind == 'focus_add':
        p['focus'] = active_focus(p) + [{'capability_id': change['capability_id'], 'reason': change.get('rationale', ''),
                                         'since': now, 'status': 'active', 'basis': change.get('basis', 'learning')}]
    elif kind == 'focus_remove':
        p['focus'] = [f for f in active_focus(p) if f['capability_id'] != change['capability_id']]
        p['focus_history'] = (p.get('focus_history', []) + [{'capability_id': change['capability_id'], 'removed_at': now}])[-30:]
    elif kind == 'overlay_add':
        oid = change.get('id') or hashlib.sha256(f"{change.get('source_ref')}:{now}".encode()).hexdigest()[:12]
        p['overlays'] = [o for o in p.get('overlays', []) if o.get('expires_at', 0) > now] + [{
            'id': oid, 'label': change.get('label', 'Temporary priority'), 'basis': change.get('basis'),
            'allocation': _normalise(change['allocation']), 'weight': float(change.get('weight', 0)),
            'starts_at': change.get('starts_at') or now, 'expires_at': change['expires_at'],
            'source_ref': change.get('source_ref')}]
    elif kind == 'overlay_remove':
        p['overlays'] = [o for o in p.get('overlays', []) if o.get('id') != change['overlay_id']]
    elif kind == 'objective_add':
        oid = change.get('id') or hashlib.sha256(f"{change['title']}:{now}".encode()).hexdigest()[:10]
        p['objectives'] = p.get('objectives', []) + [{
            'id': oid, 'title': change['title'].strip()[:200], 'bucket': change['bucket'],
            'capability_ids': change.get('capability_ids', [])[:8], 'protected': bool(change.get('protected')),
            'status': 'active', 'created_at': now, 'source': change.get('source', 'senpai')}]
    elif kind in ('objective_complete', 'objective_remove'):
        status = 'done' if kind == 'objective_complete' else 'retired'
        p['objectives'] = [{**o, 'status': status, 'closed_at': now} if o.get('id') == change['objective_id'] else o
                           for o in p.get('objectives', [])]
    elif kind == 'set_protected':
        p['protected'] = {**p.get('protected', {}), change['bucket']: max(0.0, min(0.8, float(change['share'])))}
        p['allocation'] = _floor(_normalise(p['allocation']), p['protected'])
    elif kind == 'weekly_minutes':
        p['weekly_minutes'] = max(30, min(3000, int(change['minutes'])))
    elif kind == 'authority':
        p['limits_note'] = change.get('rationale', '')
    p['overlays'] = [o for o in p.get('overlays', []) if o.get('expires_at', 0) > now]
    p['revision'] = plan['revision'] + 1
    p['updated_at'] = now
    return p


def bucket_minutes(plan, now, minutes=None):
    alloc = effective_allocation(plan, now)
    total = plan.get('weekly_minutes', 420) if minutes is None else minutes
    return {b: round(total * alloc[b]) for b in BUCKETS}
