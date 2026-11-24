"""Behavioural prep across every application in flight, weighted by how soon each one's next round is. Pure.

Each application's weight comes from its next round: a booked round counts 1 / (1 + days / TAU), so one in two days
outweighs one in a fortnight, and a round that is expected but not booked yet counts a little. Once a round has
happened it stops counting and the application keeps only the weight of what comes after it, so attention moves to
whatever is next without dropping the topics the two share. The round's type sets what it asks for (a recruiter
screen is introductions and motivation, a final is the whole story bank), and the role pack says how relevant each
question is to that role. A question's priority is the sum over applications, so a question two upcoming screens
both ask rises to the top, scaled by how far you are from holding it.
"""
from collections import Counter

DAY = 86400
TAU = 4.0                 # days: a round this far away counts half as much as one today
EXPECTED = 0.2            # an expected round with no date yet
BASE = 0.15               # every active question, interviews or not
UNKNOWN_RELEVANCE = 0.5   # an application without a role pack
ROUND_MIX = {             # what each round asks for, by question kind
    'recruiter_screen': {'Introduction': 1.0, 'Motivation': 1.0, 'Story': 0.3},
    'behavioural': {'Introduction': 0.6, 'Motivation': 0.6, 'Story': 1.0},
    'final': {'Introduction': 0.6, 'Motivation': 0.9, 'Story': 1.0},
    'technical': {'Introduction': 0.4, 'Motivation': 0.2, 'Story': 0.4},
    'system_design': {'Introduction': 0.2, 'Motivation': 0.1, 'Story': 0.2},
    'other': {'Introduction': 0.6, 'Motivation': 0.6, 'Story': 0.6},
}
ROUND_LABEL = {'recruiter_screen': 'Recruiter screen', 'behavioural': 'Behavioural', 'final': 'Final',
               'technical': 'Technical', 'system_design': 'Technical'}
TECHNICAL = {'technical'}  # competency that a technical round's story questions lean on
MAX_STORIES = 5


def _ts(v):
    if isinstance(v, (int, float)):
        return float(v)
    if not v:
        return None
    import datetime as dt
    try:
        d = dt.datetime.fromisoformat(str(v).replace('Z', '+00:00'))
    except ValueError:
        return None
    return (d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)).timestamp()


def app_weight(app, now):
    """-> (weight, days until the next round or None, the next round's kind)."""
    nxt = app.get('next') or {}
    kind = nxt.get('kind') or 'other'
    start = _ts(nxt.get('starts_at'))
    if nxt.get('status') == 'scheduled' and start:
        days = max(0.0, (start - now) / DAY)
        return 1.0 / (1.0 + days / TAU), days, kind
    return (EXPECTED, None, kind) if nxt else (0.0, None, kind)


def _mix(kind, prompt):
    m = ROUND_MIX.get(kind, ROUND_MIX['other']).get(prompt.get('kind') or 'Story', 0.6)
    if kind in ('technical', 'system_design') and set(prompt.get('competencies') or []) & TECHNICAL:
        m = max(m, 0.8)
    label = ROUND_LABEL.get(kind)
    if prompt.get('rounds') and label and label not in prompt['rounds']:
        m *= 0.6
    return m


def focus(apps, prompts, need, now):
    """apps: Job Scout applications (next round, answers with relevance and themes). prompts: active prompts with
    kind, rounds and competencies. need: prompt id -> 0 (held) .. 1 (not held).
    -> {applications, ranked: [{id, score, for: [company]}], shared_themes, stories: [story id], active}"""
    rows, themes = [], Counter()
    for a in apps:
        w, days, kind = app_weight(a, now)
        if w <= 0:
            continue
        pack = a.get('answers') or {}
        rel = {i['id']: (i.get('relevance') or 0, i.get('story_id')) for i in pack.get('items') or []}
        themes.update(set(pack.get('themes') or []))
        rows.append({'job_id': a['job_id'], 'company': a['company'], 'title': a.get('title'), 'weight': round(w, 3),
                     'days': None if days is None else round(days, 1), 'round': kind,
                     'round_label': (a.get('next') or {}).get('label') or ROUND_LABEL.get(kind, 'Interview'),
                     'scheduled': (a.get('next') or {}).get('status') == 'scheduled',
                     'has_pack': bool(rel), '_rel': rel})
    ranked = []
    for p in prompts:
        score, why = BASE if p.get('source') != 'role' else 0.0, []
        for r in rows:
            if p.get('source') == 'role' and p.get('job_id') != r['job_id']:
                continue
            relevance = r['_rel'][p['id']][0] if p['id'] in r['_rel'] else (0.0 if r['has_pack'] else UNKNOWN_RELEVANCE)
            part = r['weight'] * _mix(r['round'], p) * relevance
            if part >= 0.05:
                why.append(r['company'])
            score += part
        n = need.get(p['id'], 1.0)
        ranked.append({'id': p['id'], 'score': round(score * (0.35 + 0.65 * n), 4), 'for': why})
    ranked.sort(key=lambda x: -x['score'])
    return {'applications': [{k: v for k, v in r.items() if k != '_rel'} for r in sorted(rows, key=lambda r: -r['weight'])],
            'ranked': ranked, 'shared_themes': [t for t, c in themes.most_common() if c >= 2],
            'stories': story_set(ranked, rows), 'active': bool(rows)}


def story_set(ranked, rows, top=12):
    """The fewest stories that answer the most-weighted questions (greedy cover over the role packs' picks)."""
    picks = Counter()
    by_q = {}
    for r in rows:
        for qid, (_, sid) in r['_rel'].items():
            if sid:
                by_q.setdefault(qid, set()).add(sid)
    weights = {x['id']: x['score'] for x in ranked[:top] if x['score'] > 0}
    for qid, w in weights.items():
        for sid in by_q.get(qid, ()):
            picks[sid] += w
    chosen, covered = [], set()
    while len(chosen) < MAX_STORIES:
        gain = {sid: sum(w for q, w in weights.items() if q not in covered and sid in by_q.get(q, ()))
                for sid in picks if sid not in chosen}
        if not gain or max(gain.values()) <= 0:
            break
        best = max(gain, key=lambda s: (gain[s], s))
        chosen.append(best)
        covered |= {q for q in weights if best in by_q.get(q, ())}
    return chosen
