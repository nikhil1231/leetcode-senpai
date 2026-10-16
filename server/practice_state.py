"""Chronological per-template projection. UTC seconds, source IDs and revisions."""
DAY = 86400
VERSION = 1


def rebuild(events):
    unique = {}
    for e in events:
        key = e.get('question_id') or e.get('id') or f"legacy:{e.get('template')}:{e.get('answered_at')}"
        if not key:
            continue
        old = unique.get(key)
        if old is None or e.get('revision', 0) >= old.get('revision', 0):
            fields = ('question_id', 'template', 'answered_at', 'exposed_at', 'correct', 'guessed',
                      'revealed', 'assisted', 'unverified', 'revision', 'exposure_only', 'recall', 'skill_id', 'practice_only')
            unique[key] = {k: e[k] for k in fields if k in e}
    out = {'version': VERSION, 'spaced_successes': 0, 'last_exposure': None,
           'last_qualifying_retrieval': None, 'due_at': None, 'status': 'unseen'}
    for e in sorted(unique.values(), key=lambda e: (e.get('exposed_at') or e.get('answered_at') or 0, e.get('question_id', ''))):
        at = e.get('exposed_at') or e.get('answered_at')
        if at is None:
            continue
        ok = bool(e.get('correct')) and not any(e.get(k) for k in ('guessed', 'revealed', 'assisted', 'unverified'))
        previous = out['last_exposure']
        due = out['due_at']
        # New tasks can establish the first 1-day check; later advances need
        # both due status and 24 hours since any exposure, including choices.
        qualifies = not e.get('practice_only') and not e.get('exposure_only') and ok and (previous is None or at - previous >= DAY) and (due is None or at >= due)
        if qualifies:
            out['spaced_successes'] += 1
            out['last_qualifying_retrieval'] = at
            out['due_at'] = at + DAY * 3 ** min(out['spaced_successes'] - 1, 10)
        elif not ok and not e.get('exposure_only'):
            out['spaced_successes'] = 0
            out['due_at'] = at + DAY
        out['last_exposure'] = at
        if not e.get('exposure_only'):
            out['status'] = 'learned' if ok else 'missed'
    out['events'] = unique
    return out
