"""What Senpai reads from the tracks: capability rows, session material and block progress. Pure.

Experience feeds the `behavioural` bucket; Fundamentals, AI Engineering and Practical Coding feed
the role `stack`. Capabilities are per track category, from ledger evidence only (never CV claims).
"""
from .. import knowledge
from . import TRACKS, courses, experience, practical

DAY = 86400
STALE_DAYS = 21


def _ledger(track, records, now):
    kind = TRACKS[track]['kind']
    if kind == 'course':
        return courses.items(track), courses.events(track, records)
    if kind == 'experience':
        return experience.ITEMS, experience.events(records)
    return practical.ITEMS, practical.events(records)


def _category_titles(track):
    kind = TRACKS[track]['kind']
    if kind == 'course':
        return {c[0]: c[1] for c in courses.COURSES[track]['categories']}
    if kind == 'experience':
        out = {c: experience.COMP_TITLE[c] for c in experience.COMP_TITLE}
        out.update({'dive:' + p['id']: 'Deep dive: ' + p['title'] for p in experience.PACKS})
        return out
    return {c[0]: c[1] for c in practical.CATEGORIES}


def capability_rows(records_by_track, now):
    """One row per track category, with the same status vocabulary as the DSA and design rows."""
    rows = []
    for track, meta in TRACKS.items():
        items, evs = _ledger(track, records_by_track.get(track, []), now)
        states = knowledge.replay(evs, now)
        by_item = {i['id']: i['category'] for i in items}
        for cat, title in _category_titles(track).items():
            ids = [i for i, c in by_item.items() if c == cat]
            if not ids:
                continue
            seen = [states[i] for i in ids if i in states]
            last = max((s['last_at'] for s in seen), default=None)
            shaky = sum(1 for s in seen if not s['last_clean'])
            held = sum(knowledge.held(states.get(i), now) for i in ids)
            if not seen:
                status = 'untested'
            elif shaky:
                status = 'needs_check'
            elif now - last > STALE_DAYS * DAY:
                status = 'stale'
            elif held >= 0.6 * len(ids):
                status = 'demonstrated'
            else:
                status = 'developing'
            rows.append({'id': f'track:{track}:{cat}', 'bucket': meta['bucket'], 'name': f'{meta["title"]}: {title}',
                         'status': status, 'last_at': last,
                         'signals': {'items': len(ids), 'practised': len(seen), 'held': round(held, 1), 'shaky': shaky},
                         'prerequisites': [], 'evidence': []})
    return rows


def material(records_by_track, now):
    """Per track, what a session could do next."""
    out = {}
    for track in ('fundamentals', 'ai'):
        o = courses.overview(track, records_by_track.get(track, []), now)
        nxt = o['next_lesson']
        out[track] = {'due': o['due'], 'mistakes': len(o['mistakes']['fix']), 'answers': o['answers'],
                      'next_lesson': nxt and {'id': nxt['id'], 'title': nxt['title'], 'minutes': nxt['minutes']}}
    recs = records_by_track.get('experience', [])
    o = experience.overview(recs, now)
    prompt = experience.BY_PROMPT[o['next_prompt']]
    out['experience'] = {'due': o['due'], 'mistakes': len(o['mistakes']['fix']), 'stories': len(o['stories']),
                         'gaps': sum(1 for c in o['coverage'] if not c['stories']), 'next_prompt': prompt['text']}
    o = practical.overview(records_by_track.get('practical', []), now)
    pending = [e for g in o['groups'] for e in g['exercises'] if e['status'] in ('shaky', 'fading', 'unseen')]
    nxt = sorted(pending, key=lambda e: (not e['open'], {'shaky': 0, 'fading': 1, 'unseen': 2}[e['status']]))[:1]
    out['practical'] = {'next': nxt[0] if nxt else None}
    return out


def done(action, records_by_track, since):
    """A track block is done once a matching record was written after the session was prepared."""
    track, view = action.get('track'), action.get('view', '')
    recent = [r for r in records_by_track.get(track, [])
              if max(r.get('at') or 0, r.get('updated_at') or 0, r.get('submitted_at') or 0, r.get('created_at') or 0) >= since]
    if view.startswith('lesson/'):
        return any(r.get('kind') == 'lesson' and r.get('lesson_id') == view[7:] and r.get('checked_at', 0) >= since for r in recent)
    if view == 'quickfire':
        return sum(1 for r in recent if r.get('kind') == 'answer' and r.get('source') == 'quickfire') >= 5
    if view == 'drill':
        return any(r.get('kind') == 'drill' for r in recent)
    if view == 'stories':
        return any(r.get('kind') == 'story' for r in recent)
    if view.startswith('exercise/'):
        return any(r.get('kind') == 'attempt' and r.get('exercise_id') == view[9:] and r.get('status') == 'submitted'
                   for r in recent)
    return False
