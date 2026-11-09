"""The one thing to do next, grounded in the week's time split. Pure; no I/O.

Senpai's plan says how learning time is split between buckets (coding, system design, behavioural, role stack).
Today's session is a list of blocks that already respects that split for the day. This module looks at the whole
week: how many minutes each bucket has had so far against its target, and picks the open block from whichever
bucket is furthest behind its share. Minutes are estimates from recorded evidence (solve times where known, a
fixed allowance per lesson, check or case otherwise); they are for steering, not for reporting.
"""
BUCKETS = ('dsa', 'system_design', 'behavioural', 'stack')
LABELS = {'dsa': 'Coding', 'system_design': 'System design', 'behavioural': 'Behavioural', 'stack': 'Role stack'}

SOLVE_DEFAULT_MIN = 10   # a solve with no recorded time
SOLVE_MAX_MIN = 90
QUICKFIRE_MIN = 1        # one answered question
LESSON_MIN = 15
CASE_MIN = 20
TRACK_RECORD_MIN = 8
TIE = 0.1                # shares of target closer than this are a tie; session order decides


def _ts(rec, *keys):
    return max((rec.get(k) or 0 for k in keys), default=0)


def evidence(b):
    """A bundle (senpai.service.bundle) -> [(bucket, at, minutes)] of work done, from recorded evidence only."""
    out = []
    for a in b.get('attempts', ()):
        at = a.get('solved_at')
        if not at:
            continue
        sec = a.get('time_taken_sec')
        minutes = min(SOLVE_MAX_MIN, max(1, sec / 60)) if sec else SOLVE_DEFAULT_MIN
        out.append(('dsa', at, minutes))
    for r in b.get('answers', ()):
        if r.get('answered_at'):
            out.append(('dsa', r['answered_at'], QUICKFIRE_MIN))
    design = list(b.get('design', ()))
    try:
        from .system_design_learning import rows as design_rows
        for r in design_rows(design):
            if r.get('answered_at'):
                out.append(('system_design', r['answered_at'], QUICKFIRE_MIN))
    except Exception:  # an older record shape never stops the app picking something
        pass
    for r in design:
        if r.get('kind') == 'course_lesson' and r.get('at'):
            out.append(('system_design', r['at'], LESSON_MIN))
        elif r.get('kind') == 'session':
            at = _ts(r, 'updated_at', 'created_at')
            if at:
                out.append(('system_design', at, CASE_MIN))
    try:
        from .tracks import TRACKS
    except Exception:
        TRACKS = {}
    for track, records in (b.get('tracks') or {}).items():
        bucket = (TRACKS.get(track) or {}).get('bucket')
        if bucket not in BUCKETS:
            continue
        for r in records:
            at = _ts(r, 'at', 'updated_at', 'answered_at', 'completed_at')
            if at:
                out.append((bucket, at, TRACK_RECORD_MIN))
    return out


def served(items, start, now=None):
    """Minutes per bucket since `start` (and not in the future)."""
    mins = {k: 0 for k in BUCKETS}
    for bucket, at, minutes in items:
        if bucket in mins and at >= start and (now is None or at <= now + 60):
            mins[bucket] += minutes
    return {k: round(v) for k, v in mins.items()}


def standing(target, done):
    """Per bucket: target and served minutes and the share reached, for the card and the choice."""
    out = []
    for k in BUCKETS:
        t = target.get(k, 0) or 0
        s = done.get(k, 0) or 0
        out.append({'id': k, 'label': LABELS[k], 'target_min': t, 'served_min': s,
                    'ratio': round(s / t, 3) if t > 0 else None})
    return out


def _ratio(row):
    return 9.9 if row['ratio'] is None else row['ratio']


def _reason(block, rows, open_buckets):
    by_id = {r['id']: r for r in rows}
    row = by_id.get(block['bucket'])
    if not row or row['target_min'] <= 0:
        return 'Today\'s plan puts this first.'
    others = [by_id[k] for k in open_buckets if k != block['bucket'] and k in by_id and by_id[k]['target_min'] > 0]
    pct = round(100 * row['ratio'])
    if not others:
        return f"Only {row['label'].lower()} work is left in today's session, and it is at {pct}% of its week."
    lead = min(others, key=_ratio)
    if row['ratio'] >= 1:
        return f"Every bucket is at or past its share this week; this one is next in today's plan."
    if abs(_ratio(lead) - row['ratio']) < TIE:
        if row['served_min'] == 0:
            return f"Nothing logged for {row['label'].lower()} yet this week ({row['target_min']} min planned), and today's plan puts it first."
        return f"{row['label']} is at {pct}% of its weekly share, about level with the rest, so today's plan decides."
    return (f"{row['label']} is at {row['served_min']} of {row['target_min']} min this week ({pct}%), "
            f"the furthest behind its share.")


def choose(blocks, target, done, alternatives=2):
    """Open session blocks + the week's target and served minutes -> the primary block, a few alternatives, standing."""
    rows = standing(target, done)
    by_id = {r['id']: r for r in rows}
    open_ = [(i, b) for i, b in enumerate(blocks) if not b.get('done')]
    if not open_:
        return {'primary': None, 'alternatives': [], 'standing': rows, 'reason': ''}
    ranked = sorted(open_, key=lambda ib: (round(_ratio(by_id.get(ib[1]['bucket'], {'ratio': None})) / TIE), ib[0]))
    primary = ranked[0][1]
    open_buckets = {b['bucket'] for _, b in open_}
    alts, seen = [], {primary['bucket']}
    for _, b in ranked[1:]:  # a different bucket each, so the alternatives are real choices
        if b['bucket'] not in seen and len(alts) < alternatives:
            alts.append(b)
            seen.add(b['bucket'])
    for _, b in ranked[1:]:
        if len(alts) >= alternatives:
            break
        if b not in alts:
            alts.append(b)
    return {'primary': primary, 'alternatives': alts, 'standing': rows,
            'reason': _reason(primary, rows, open_buckets)}
