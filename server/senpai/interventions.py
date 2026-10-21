"""Did advice get tried, and did it help? Pure; no I/O.

An intervention records what a piece of advice intended to improve (capabilities plus the evidence that would
show it), when to check, and your response. Whether it was tried is read from evidence, not self-report.
After the check date: a later independent success on a target capability is `helped`, only failures or
assisted work is `not_helped`, nothing recorded is `not_tried`. These are descriptive one-person observations,
not causal estimates; the point is to stop re-prescribing advice that is not working.
"""
DAY = 86400
CHECK_DAYS = 7


def new(source, action, rationale, capability_ids, intended_outcome, now, evidence=(), check_days=CHECK_DAYS,
        ref=None):
    import hashlib
    iid = hashlib.sha256(f'{source}:{ref}:{action}'.encode()).hexdigest()[:16]
    return {'id': iid, 'created_at': now, 'source': source, 'ref': ref, 'action': action[:500],
            'rationale': (rationale or '')[:500], 'capability_ids': list(capability_ids)[:6],
            'intended_outcome': (intended_outcome or '')[:300], 'evidence': list(evidence)[:12],
            'check_at': now + check_days * DAY, 'response': 'pending', 'tried_at': None,
            'outcome': 'pending', 'evaluated_at': None, 'outcome_evidence': []}


def evaluate(item, events_by_capability, now):
    """Return the item with tried/outcome brought up to date. Responses are left alone."""
    item = dict(item)
    after = [e for cid in item.get('capability_ids', []) for e in events_by_capability.get(cid, [])
             if (e.get('at') or 0) > item['created_at'] and e.get('outcome') != 'exposure']
    after.sort(key=lambda e: e.get('at') or 0)
    if after and not item.get('tried_at'):
        item['tried_at'] = after[0]['at']
    if item.get('response') == 'dismissed' or now < item.get('check_at', 0) or item.get('outcome') not in ('pending', 'not_tried'):
        return item
    clean = [e for e in after if e['outcome'] == 'success' and e.get('help') in ('none', 'clarification')]
    if not item.get('capability_ids'):
        outcome = 'unclear'
    elif clean:
        outcome = 'helped'
    elif after:
        outcome = 'not_helped'
    else:
        outcome = 'not_tried'
    item['outcome'] = outcome
    item['evaluated_at'] = now
    item['outcome_evidence'] = [e['id'] for e in (clean or after)][-5:]
    return item


def summary(items, limit=8):
    """Bounded history for prompts: what was advised, the response, and what happened."""
    ranked = sorted(items, key=lambda i: i['created_at'], reverse=True)[:limit]
    return [{k: i.get(k) for k in ('id', 'action', 'capability_ids', 'intended_outcome', 'response', 'outcome')}
            for i in ranked]


def ineffective(items):
    """Advice that was tried and did not help, or repeatedly not tried: revise rather than repeat."""
    return [i for i in items if i.get('outcome') == 'not_helped'
            or (i.get('outcome') == 'not_tried' and i.get('response') == 'accepted')]
