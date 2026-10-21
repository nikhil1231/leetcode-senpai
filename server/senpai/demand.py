"""Turn Job Scout's brief into learning signals. Pure; no I/O.

Job ads name tools and domains, not interview patterns, so demand never ranks DSA topics. It maps tags to
buckets and to system-design categories; language/tool tags are "outside the curriculum", never gaps.
A tag becomes a candidate focus only after it stays prominent across weeks *with fresh evidence*
(new roles or a later last-seen date), so the same vacancies observed again do not count twice.
Imminent interviews become temporary, expiring overlays whose shape follows the round type.
"""
import datetime as dt

SD_TAGS = {
    'system design': 'designs', 'distributed systems': 'distributed', 'scalability': 'distributed',
    'microservices': 'apis', 'api design': 'apis', 'rest apis': 'apis', 'graphql': 'apis', 'grpc': 'apis',
    'event-driven architecture': 'queues', 'kafka': 'queues', 'message queues': 'queues', 'rabbitmq': 'queues',
    'streaming': 'queues', 'caching': 'caching', 'redis': 'caching', 'databases': 'storage', 'sql': 'storage',
    'postgresql': 'storage', 'mysql': 'storage', 'nosql': 'storage', 'data modelling': 'storage',
    'data modeling': 'storage', 'reliability': 'reliability', 'observability': 'reliability', 'on call': 'reliability',
    'sre': 'reliability', 'high availability': 'reliability', 'incident response': 'reliability',
    'performance': 'reliability', 'consistency': 'distributed', 'concurrency': 'distributed',
}
DSA_TAGS = {'algorithms', 'data structures', 'data structures and algorithms', 'problem solving', 'coding',
            'computer science fundamentals', 'leetcode'}
BEHAVIOURAL_TAGS = {'communication', 'leadership', 'mentoring', 'collaboration', 'stakeholder management',
                    'ownership', 'teamwork', 'product thinking', 'cross functional collaboration'}
ROUND_SHAPES = {
    'technical': {'dsa': 0.8, 'system_design': 0.1, 'behavioural': 0.1},
    'system_design': {'system_design': 0.75, 'dsa': 0.15, 'behavioural': 0.1},
    'behavioural': {'behavioural': 0.6, 'dsa': 0.25, 'system_design': 0.15},
    'final': {'dsa': 0.4, 'system_design': 0.35, 'behavioural': 0.25},
    'other': {'dsa': 0.45, 'system_design': 0.35, 'behavioural': 0.2},
}
OVERLAY_WEIGHT = 0.4
OVERLAY_LEAD_DAYS = 14
PROMINENT_SHARE = 0.15


def classify_tag(tag):
    if tag in SD_TAGS:
        return 'system_design', 'sd:' + SD_TAGS[tag]
    if tag in DSA_TAGS:
        return 'dsa', None
    if tag in BEHAVIOURAL_TAGS:
        return 'behavioural', None
    return 'stack', None


def _ts(text):
    try:
        return int(dt.datetime.fromisoformat(text).timestamp())
    except (TypeError, ValueError):
        return None


def brief(context, previous_signals, week, now):
    """-> {mapped, outside, buckets, signals, overlays, interviews, debriefs, notes}. Bounded."""
    demand = (context or {}).get('demand') or {}
    roles = (demand.get('cohort') or {}).get('roles') or 0
    mapped, outside, bucket_companies = [], [], {}
    for t in demand.get('tags', []):
        bucket, cap = classify_tag(t['tag'])
        row = {'tag': t['tag'], 'bucket': bucket, 'capability_id': cap, 'roles': t.get('roles', 0),
               'companies': t.get('companies', 0), 'share': t.get('share', 0), 'last_seen': t.get('last_seen')}
        bucket_companies[bucket] = bucket_companies.get(bucket, 0) + row['companies']
        (outside if bucket == 'stack' else mapped).append(row)
    signals = {}
    previous_signals = previous_signals or {}
    for row in mapped:
        if not row['capability_id'] or row['share'] < PROMINENT_SHARE:
            continue
        old = signals.get(row['capability_id']) or previous_signals.get(row['capability_id']) or {}
        fresh = (row['roles'] > old.get('roles', 0) or (row['last_seen'] or '') > (old.get('last_seen') or ''))
        if old.get('week') == week:
            weeks = old.get('weeks', 1)   # already counted this week
        elif fresh:
            weeks = old.get('weeks', 0) + 1
        else:
            weeks = old.get('weeks', 0)   # same vacancies observed again: no new evidence
        signals[row['capability_id']] = {'weeks': weeks, 'week': week, 'roles': max(row['roles'], old.get('roles', 0)),
                                         'last_seen': max(row['last_seen'] or '', old.get('last_seen') or ''),
                                         'tags': sorted(set(old.get('tags', [])) | {row['tag']})[:6]}
    overlays, interviews = [], []
    for iv in ((context or {}).get('interviews') or {}).get('upcoming', []):
        start = _ts(iv.get('starts_at'))
        if not start:
            continue
        interviews.append({'id': iv['id'], 'company': iv.get('company'), 'round': iv.get('round'),
                           'starts_at': start, 'documented': [d['statement'] for d in iv['expectations']['documented']][:4],
                           'predicted_topics': [t for p in iv['expectations']['predicted'] for t in p.get('topics', [])][:8]})
        shape = ROUND_SHAPES.get(iv.get('round'))
        if not shape or start - now > OVERLAY_LEAD_DAYS * 86400 or start < now:
            continue
        overlays.append({'kind': 'overlay_add', 'basis': 'interview', 'label': f"{iv.get('round_label', 'Interview')} — {iv.get('company')}",
                         'allocation': shape, 'weight': OVERLAY_WEIGHT, 'starts_at': now, 'expires_at': start + 86400,
                         'source_ref': f"job_scout:interview:{iv['id']}", 'confidence': 'high',
                         'rationale': f"{iv.get('round_label', 'Interview')} with {iv.get('company')} on "
                                      f"{dt.datetime.fromtimestamp(start, dt.timezone.utc):%a %d %b}; temporary until the day after."})
    total = sum(bucket_companies.values()) or 1
    notes = []
    if roles < 5:
        notes.append(f'Only {roles} relevant roles: market shares are tentative.')
    return {'roles': roles, 'mapped': mapped[:20], 'outside': outside[:12],
            'buckets': {b: round(n / total, 3) for b, n in bucket_companies.items()},
            'signals': signals, 'overlays': overlays, 'interviews': interviews,
            'debriefs': ((context or {}).get('interviews') or {}).get('debriefs', [])[:4],
            'fingerprint': (context or {}).get('fingerprint'), 'notes': notes + (context or {}).get('uncertainty', [])[:3]}


def focus_candidates(signals, min_weeks):
    """Sustained market signals that may become focus proposals (still subject to policy)."""
    return [{'kind': 'focus_add', 'capability_id': cid, 'basis': 'market', 'sustained_weeks': s['weeks'],
             'confidence': 'medium', 'rationale': f"Prominent in relevant roles for {s['weeks']} weeks with fresh "
                                                  f"postings: {', '.join(s['tags'])}."}
            for cid, s in sorted(signals.items()) if s['weeks'] >= min_weeks]
