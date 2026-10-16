"""Rebuildable observations; source revisions replace events, never add practice."""
from . import assessment, curriculum

VERSION = 1


def project(problems, attempts, answers=(), learning_records=()):
    catalog = {p['slug']: p for p in problems}
    events = {}
    for raw in attempts:
        if not raw.get('id'):
            continue
        a = assessment.episode_attempt(raw, attempts)
        p = catalog.get(a.get('slug'), {})
        # Potential teaching tags are never proof of the technique used.
        skills = a.get('demonstrated_skill_ids') or a.get('failed_skill_ids') or []
        if not skills and (a.get('unsolved') or assessment.assistance(a) == 'solution'):
            candidates = curriculum.PROBLEM_SKILLS.get(a.get('slug'), [])
            if len(candidates) == 1:
                skills = candidates
        skills = [s for s in skills if s in curriculum.SKILLS]
        kind = a.get('kind')
        format_ = 'conceptual_recall' if kind == 'recall' else 'recognition' if kind == 'sprint' else 'implementation'
        outcome = 'unknown'
        if a.get('unsolved'):
            outcome = 'failure'
        elif kind == 'recall':
            g = (a.get('recall_grade') or {}).get('grade')
            if g is not None:
                outcome = 'success' if g >= 2 else 'failure'
            elif a.get('self_confidence') is not None:
                outcome = 'success'
        elif kind != 'sprint' and (a.get('submission_id') or a.get('source') == 'manual'):
            outcome = 'success'
        for skill in skills:
            eid = f"attempt:{a['id']}:{skill}"
            events[eid] = {'id': eid, 'source_id': a['id'], 'revision': a.get('assessment_revision', 0),
                'skill': skill, 'task': a.get('slug'), 'format': format_, 'outcome': outcome,
                'help': assessment.assistance(a), 'at': a.get('solved_at'),
                'episode': a.get('episode') or a['id'], 'assessment_version': a.get('assessment_version'),
                'probe': bool(a.get('transfer_probe')), 'delay_sec': a.get('probe_delay_sec'),
                'transfer': bool(a.get('transfer_probe') and (a.get('probe_delay_sec') or 0) >= 86400 and a.get('novelty_confirmed')
                                 and not a.get('prior_exposure') and not a.get('support_revealed')),
                'timing': timing(a)}
    for a in answers:
        skill = a.get('skill_id')
        if skill not in curriculum.SKILLS or not a.get('question_id'):
            continue
        eid = f"quickfire:{a['question_id']}:{skill}"
        events[eid] = {'id': eid, 'source_id': a['question_id'], 'revision': a.get('revision', 0),
            'skill': skill, 'task': a.get('template'), 'format': 'retrieval' if a.get('recall') else 'recognition',
            'outcome': 'unknown' if a.get('unverified') else 'success' if a.get('correct') else 'failure',
            'help': 'solution' if a.get('revealed') else 'conceptual_hint' if a.get('assisted') or a.get('guessed') else 'none',
            'at': a.get('answered_at'), 'episode': a.get('episode') or a['question_id'],
            'transfer': False, 'timing': timing(a)}
    for r in learning_records:
        if r.get('probe_answered_at') is None:
            continue
        sequence = r.get('sequence')
        from .learning_sequences import SEQUENCES
        if sequence not in SEQUENCES:
            continue
        eid = 'application:' + r['id']
        events[eid] = {'id': eid, 'source_id': r['id'], 'revision': 0,
            'skill': SEQUENCES[sequence]['skill'], 'task': sequence + ':held-out-v1:' + str(r.get('probe_index', 1)),
            'format': 'application', 'outcome': 'success' if r.get('probe_correct') else 'failure',
            'help': 'conceptual_hint' if r.get('probe_assisted') else 'none',
            'at': r['probe_answered_at'], 'episode': r['id'] + ':probe', 'probe': True,
            'delay_sec': r.get('probe_delay_sec'),
            'transfer': bool(r.get('probe_novel') and not r.get('probe_assisted') and (r.get('probe_delay_sec') or 0) >= 86400),
            'timing': timing(r)}
    return sorted(events.values(), key=lambda e: (e.get('at') or 0, e['id']))


def reduce(events):
    # Highest revision wins, independent of delivery order.
    unique = {}
    for e in events:
        old = unique.get(e['id'])
        if old is None or e.get('revision', 0) >= old.get('revision', 0):
            unique[e['id']] = e
    groups = {}
    for e in sorted(unique.values(), key=lambda e: (e.get('at') or 0, e['id'])):
        groups.setdefault(e['skill'], []).append(e)
    out = {}
    for skill, observations in groups.items():
        clean = [e for e in observations if e['outcome'] == 'success' and e['help'] in ('none', 'clarification')]
        impl = {e['task'] for e in clean if e['format'] == 'implementation'}
        delayed = [e for e in clean if e.get('at') and any(
            earlier.get('at') and e['at'] - earlier['at'] >= 86400 and earlier['episode'] != e['episode']
            for earlier in observations if earlier['id'] != e['id'])]
        recent = observations[-5:]
        last = recent[-1]
        unresolved = [e['id'] for e in recent if (e['outcome'] == 'failure' or e['help'] in ('solution', 'conceptual_hint', 'code_hint'))
                      and not any(x['help'] in ('none', 'clarification') and x['outcome'] == 'success'
                                  and (x.get('at') or 0) > (e.get('at') or 0) for x in recent)]
        out[skill] = {'version': VERSION, 'independent_examples': len({e['task'] for e in clean}),
            'implementation_tasks': len(impl), 'delayed_checks': len(delayed),
            'transfer_checks': sum(bool(e.get('transfer')) for e in delayed),
            'recent_needs': unresolved, 'latest_outcome': last['outcome'],
            'ready': len({e['task'] for e in clean if e['format'] != 'recognition'}) >= 2 and bool(delayed),
            'sources': [e['id'] for e in observations]}
    return out


def timing(record):
    raw = record.get('timing') or {}
    elapsed = raw.get('elapsed_sec', record.get('time_taken_sec'))
    source = raw.get('source', 'missing' if elapsed is None else 'estimated')
    paused = raw.get('pause_sec', 0)
    away = raw.get('uncertain_sec')
    reliable = elapsed is not None and source == 'measured' and 0 <= elapsed <= 14400 and not away
    return {'elapsed_sec': elapsed, 'pause_sec': paused, 'uncertain_sec': away,
            'source': source, 'quality': 'reliable' if reliable else 'missing' if elapsed is None else 'uncertain'}


def evaluate(records, events):
    times = [timing(r) for r in records]
    total = sum(t['elapsed_sec'] or 0 for t in times)
    reliable = sum(t['elapsed_sec'] or 0 for t in times if t['quality'] == 'reliable')
    probes = [e for e in events if e.get('probe')]
    passed = [e for e in probes if e['outcome'] == 'success' and e['help'] == 'none' and e.get('transfer')]
    return {'passed': len({(e['skill'], e['task']) for e in passed}), 'attempted': len(probes),
            'recorded_hours': total / 3600, 'reliable_time_proportion': reliable / total if total else None,
            'passed_per_recorded_hour': len(passed) / (total / 3600) if total else None,
            'missing_time_records': sum(t['elapsed_sec'] is None for t in times),
            'assisted_probes': sum(e['help'] != 'none' for e in probes),
            'probe_delays_sec': [e.get('delay_sec') for e in probes],
            'interpretation': 'Descriptive one-user observations; missing time and intervening exposure limit comparisons.'}
