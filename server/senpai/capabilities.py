"""What Senpai can say about each capability, from recorded evidence only. Pure; no I/O.

A capability is a DSA skill (curriculum.SKILLS) or a system-design curriculum category. Status describes the
evidence, not the person: `untested` means nothing is recorded, `practised` means problems in the category were
solved but the technique was never confirmed (catalog tags are not proof), `stale` means nothing recent (a
retention check is due, not remediation), `needs_check` means recent unresolved help or failure, `overdue` means
scheduled reviews are late. CV claims, job-fit scores and generated interpretations never enter this module.
"""
from .. import curriculum, learning_evidence
from ..system_design_curriculum import CATEGORIES as SD_CATEGORIES, LESSONS as SD_LESSONS

DAY = 86400
STALE_DAYS = 21
OVERDUE_DAYS = 7


def _sd_events(design_records):
    from ..system_design_learning import rows
    out = {}
    for a in rows(design_records):
        lesson = SD_LESSONS.get(a.get('lesson_id'), {})
        cat = lesson.get('category')
        if not cat:
            continue
        out.setdefault('sd:' + cat, []).append({
            'id': 'design-learning:' + a['id'], 'at': a.get('answered_at'),
            'outcome': 'success' if a.get('correct') else 'failure',
            'help': 'assisted' if any(a.get(k) for k in ('assisted', 'revealed', 'guessed')) else 'none',
            'format': 'retrieval' if a.get('source') == 'quickfire' else 'check'})
    for r in design_records:
        if r.get('kind') == 'course_lesson':
            cat = SD_LESSONS.get(r.get('lesson_id'), {}).get('category')
            if cat and r.get('at'):
                out.setdefault('sd:' + cat, []).append({'id': 'design-course:' + str(r.get('id')), 'at': r['at'],
                                                        'outcome': 'exposure', 'help': 'none', 'format': 'lesson'})
    return out


def build(problems, attempts, reviews, answers=(), learning_records=(), design_records=(), now=0, today=None):
    """-> (rows, events_by_capability). Rows are sorted by id."""
    events = learning_evidence.project(problems, attempts, answers, learning_records)
    by_skill = {}
    for e in events:
        by_skill.setdefault('dsa:' + e['skill'], []).append(
            {'id': e['id'], 'at': e.get('at'), 'outcome': e['outcome'], 'help': e['help'], 'format': e['format']})
    summary = learning_evidence.reduce(events)
    today = today or ''
    cat_of = {p['slug']: p.get('neetcode_category') for p in problems}
    due, overdue = {}, {}
    cutoff = None
    if today:
        import datetime as dt
        cutoff = (dt.date.fromisoformat(today) - dt.timedelta(days=OVERDUE_DAYS)).isoformat()
    for r in reviews:
        sid = curriculum.CATEGORY_SKILLS.get(cat_of.get(r.get('slug')))
        if not sid or not r.get('due_date') or not today or r['due_date'] > today:
            continue
        due[sid] = due.get(sid, 0) + 1
        if r['due_date'] < cutoff:
            overdue[sid] = overdue.get(sid, 0) + 1
    practice, history = {}, {}
    for a in attempts:
        sid = curriculum.CATEGORY_SKILLS.get(cat_of.get(a.get('slug')))
        if not sid or not a.get('solved_at'):
            continue
        history[sid] = history.get(sid, 0) + 1
        if a.get('source') != 'backfill':  # imported history is exposure, not recent practice
            practice[sid] = max(practice.get(sid, 0), a['solved_at'])
    rows = []
    for sid, skill in curriculum.SKILLS.items():
        cid = 'dsa:' + sid
        obs = by_skill.get(cid, [])
        s = summary.get(sid, {})
        last = max([e['at'] for e in obs if e.get('at')] + ([practice[sid]] if sid in practice else []), default=None)
        if not obs and not history.get(sid):
            status = 'untested'
        elif s.get('recent_needs'):
            status = 'needs_check'
        elif overdue.get(sid):
            status = 'overdue'
        elif last and now - last > STALE_DAYS * DAY:
            status = 'stale'
        elif s.get('ready'):
            status = 'demonstrated'
        elif obs:
            status = 'developing'
        else:
            status = 'practised'
        rows.append({'id': cid, 'bucket': 'dsa', 'name': skill['name'], 'status': status, 'last_at': last,
                     'signals': {'observations': len(obs), 'solved_problems': history.get(sid, 0),
                                 'independent_examples': s.get('independent_examples', 0),
                                 'delayed_checks': s.get('delayed_checks', 0), 'due_reviews': due.get(sid, 0),
                                 'overdue_reviews': overdue.get(sid, 0), 'latest_outcome': s.get('latest_outcome'),
                                 'recent_needs': len(s.get('recent_needs', []))},
                     'prerequisites': ['dsa:' + p for p in skill.get('prerequisites', [])],
                     'evidence': [e['id'] for e in obs][-5:]})
    sd = _sd_events(design_records)
    for key, title, _ in SD_CATEGORIES:
        cid = 'sd:' + key
        obs = sorted(sd.get(cid, []), key=lambda e: e.get('at') or 0)
        checks = [e for e in obs if e['outcome'] != 'exposure']
        last = max((e['at'] for e in obs if e.get('at')), default=None)
        recent = checks[-5:]
        failing = [e for e in recent if e['outcome'] == 'failure' or e['help'] != 'none']
        clean = [e for e in checks if e['outcome'] == 'success' and e['help'] == 'none']
        lessons = [l for l in SD_LESSONS.values() if l['category'] == key]
        if not checks:
            status = 'untested'
        elif failing and failing[-1] is recent[-1]:
            status = 'needs_check'
        elif last and now - last > STALE_DAYS * DAY:
            status = 'stale'
        elif len(clean) >= 3 and len(failing) <= 1 and len({e['at'] // DAY for e in clean}) >= 2:
            status = 'demonstrated'
        else:
            status = 'developing'
        rows.append({'id': cid, 'bucket': 'system_design', 'name': title, 'status': status, 'last_at': last,
                     'signals': {'observations': len(checks), 'clean_checks': len(clean), 'recent_misses': len(failing),
                                 'lessons': len(lessons)},
                     'prerequisites': [], 'evidence': [e['id'] for e in obs][-5:]})
    all_events = {**by_skill, **sd}
    return sorted(rows, key=lambda r: r['id']), all_events


STATUS_ORDER = {'needs_check': 0, 'overdue': 1, 'stale': 2, 'untested': 3, 'practised': 4, 'developing': 5, 'demonstrated': 6}


def digest(rows, focus_ids=(), limit=24):
    """Bounded summary for prompts: focus first, then whatever needs attention."""
    focus_ids = set(focus_ids)
    ranked = sorted(rows, key=lambda r: (r['id'] not in focus_ids, STATUS_ORDER.get(r['status'], 9), r['id']))
    return [{k: r[k] for k in ('id', 'name', 'bucket', 'status', 'last_at', 'signals')} for r in ranked[:limit]]
