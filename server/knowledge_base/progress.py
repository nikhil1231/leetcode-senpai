"""What you know in a section, and the one thing to do next. Pure; no I/O.

`report` reads the memory model per point and answers "how good am I": per area and lesson,
how much has been tested, and of what has been tested, how much you would get right today
(mean recall). Untested is shown as unknown, never as zero. `next_step` picks one action
for the section's home page, with the reason, and two alternatives.

Levels need a few tested points to mean anything: below MIN_TESTED an area is "early".
"""
import re

from .. import knowledge
from . import catalog as cat, model

MIN_TESTED = 3
DUE_REVIEW = 5           # slipping points before a review beats new learning
STARTED = 4             # tested points for a lesson to count as started (a placement probe tests 1–3)
COVERED = 0.5            # share of a lesson's points tested for the lesson to count as covered
STRONG = 85
LEVELS = ((40, 'weak'), (70, 'patchy'), (STRONG, 'good'), (101, 'strong'))
HELD = ('solid', 'learning')
SLIPPING = ('fading', 'shaky')
WEEK = 7 * 86400


def general(text):
    """A gap's idea without its worked example: the part before "such as" or "e.g.", as a sentence."""
    head = re.split(r',?\s+(?:such as|e\.g\.|for example)\b', text or '', maxsplit=1)[0].strip().rstrip('.,;:')
    return head + '.' if head else ''


def level(score, tested):
    if not tested:
        return 'untested'
    if tested < MIN_TESTED:
        return 'early'
    return next(name for cap, name in LEVELS if score < cap)


def _tally(views):
    tested = [v for v in views if v['status'] != 'unseen']
    score = round(100 * sum(v['r'] for v in tested) / len(tested)) if tested else None
    depths = {d: 0 for d in model.DEPTHS}
    for v in views:
        if v['depth']:
            depths[v['depth']] += 1
    return {'total': len(views), 'tested': len(tested), 'held': sum(v['status'] in HELD for v in views),
            'slipping': sum(v['status'] in SLIPPING for v in views), 'score': score,
            'coverage': round(100 * len(tested) / len(views)) if views else 0,
            'level': level(score, len(tested)), 'depths': depths,
            'misconceptions': sum(v['misconceptions'] for v in views)}


def section_points(catalog, section):
    return [p for p in cat.active(catalog) if p['section'] == section]


def report(catalog, states, week_ago, seen, misconceptions, now, section, trend=()):
    """Totals, areas (with lessons) in course order, this week's changes and open misconceptions."""
    points = section_points(catalog, section)
    vs = model.views(catalog, states, seen, misconceptions, now, points)
    by_id = {v['id']: v for v in vs}
    areas = {}
    for p in points:
        a = areas.setdefault(p['category'], {'id': p['category'], 'title': p['category_title'], 'lessons': {}})
        a['lessons'].setdefault(p['lesson'], {'id': p['lesson'], 'title': p['lesson_title'], 'views': []})['views'].append(by_id[p['id']])
    out = []
    for a in areas.values():
        lessons = [{'id': l['id'], 'title': l['title'], **_tally(l['views'])} for l in a['lessons'].values()]
        out.append({'id': a['id'], 'title': a['title'], **_tally([v for l in a['lessons'].values() for v in l['views']]),
                    'lessons': lessons})
    then = {p['id']: knowledge.status(week_ago.get(p['id']), now - WEEK) for p in points}
    gained = [v for v in vs if v['status'] in HELD and then[v['id']] not in HELD]
    slipped = [v for v in vs if v['status'] in SLIPPING and then[v['id']] in HELD]
    ids = {p['id'] for p in points}
    lesson_of = {p['id']: (p['lesson'], p['lesson_title'], p['claim']) for p in points}
    open_mis = sorted((m for m in misconceptions if m.get('status') == 'open' and m['point'] in ids),
                      key=lambda m: -m.get('updated_at', m['created_at']))
    claim = lambda v: {'id': v['id'], 'claim': v['claim'], 'lesson': v['lesson'], 'lesson_title': v['lesson_title']}
    return {'section': section, **_tally(vs), 'knowledge': round(sum(v['r'] for v in vs), 1),
            'areas': out,
            'week': {'gained': len(gained), 'slipped': len(slipped),
                     'gained_points': [claim(v) for v in gained[:5]], 'slipped_points': [claim(v) for v in slipped[:5]]},
            'misconceptions': [{'key': m['_key'], 'kind': m.get('kind', 'belief'), 'text': m['text'], 'quote': m.get('quote', ''),
                                'ask': m.get('ask', ''), 'point': m['point'], 'lesson': lesson_of[m['point']][0],
                                'lesson_title': lesson_of[m['point']][1], 'claim': lesson_of[m['point']][2],
                                'source': m.get('source'), 'at': m.get('updated_at', m['created_at'])} for m in open_mis],
            'trend': list(trend)}


def trend(catalog, events, now, section, weeks=8):
    """Knowledge and tested points at the end of each of the last `weeks` weeks, oldest first."""
    ids = {p['id'] for p in section_points(catalog, section)}
    out = []
    for w in range(weeks - 1, -1, -1):
        at = now - w * WEEK
        states, _ = model.replay(events, at)
        mine = [s for k, s in states.items() if k in ids]
        out.append({'at': at, 'knowledge': round(sum(knowledge.held(s, at) for s in mine), 1), 'tested': len(mine)})
    return out


def _strong(area):
    """Strong across the area: a high score with most of its lessons tested, not one lesson's worth."""
    probed = sum(bool(l['tested']) for l in area['lessons'])
    return area['level'] == 'strong' and probed >= 0.6 * len(area['lessons'])


def _lesson_state(l):
    """new (at most probed by a placement question), started, or covered."""
    if l['tested'] < STARTED:
        return 'new'
    return 'covered' if l['tested'] >= COVERED * l['total'] else 'started'


def next_step(rep, tutor=False, active=None, last_lesson=None):
    """-> {'primary': action, 'alternatives': [action, ...]}. Actions, in priority order:

    resume a tutor session; clear an open misconception; review slipping points; a placement
    check before the first lesson of an untested area; the next lesson (continue a started one
    first, skip areas you are strong in); a mixed review. `active` is the lesson of an active
    tutor session ({lesson, lesson_title}); `last_lesson` the lesson worked on most recently.
    """
    lessons = [(a, l) for a in rep['areas'] for l in a['lessons']]
    titles = {l['id']: l['title'] for _, l in lessons}
    via = 'with the tutor' if tutor else ''
    found = []
    if tutor and active and active.get('lesson') in titles:
        found.append({'kind': 'resume', 'lesson': active['lesson'], 'title': f'Pick up your session on {titles[active["lesson"]]}',
                      'why': 'You left a tutor session open. It remembers where you got to.', 'label': 'Continue the session', 'tutor': True})
    for m in rep['misconceptions'][:1]:
        found.append({'kind': 'fix', 'lesson': m['lesson'], 'point': m['point'], 'key': m['key'],
                      'title': f'Clear up {m["lesson_title"]}',
                      'why': (f'Something that has been slippery: {general(m["text"])} Ten minutes with the tutor should settle it.' if m['kind'] == 'gap'
                              else f'Last time you seemed to think: "{m["quote"] or m["text"]}". Worth ten minutes to fix.'),
                      'label': 'Fix it with the tutor' if tutor else 'Open the lesson', 'tutor': tutor})
    due = rep['slipping']
    if due >= DUE_REVIEW:
        found.append({'kind': 'review', 'count': due, 'title': f'{due} ideas are slipping',
                      'why': 'Recalling them now, before they are gone, makes them stick far longer than relearning later.',
                      'label': 'Review them (about 5 minutes)', 'tutor': False})
    open_lessons = [(a, l) for a, l in lessons if not _strong(a)]
    started = [(a, l) for a, l in open_lessons if _lesson_state(l) == 'started']
    if last_lesson:
        started.sort(key=lambda al: al[1]['id'] != last_lesson)
    # A new lesson whose placement probe went well waits until the others are done.
    fresh = sorted((al for al in open_lessons if _lesson_state(al[1]) == 'new'),
                   key=lambda al: bool(al[1]['tested']) and (al[1]['score'] or 0) >= STRONG)
    pick = (started or fresh or [None])[0]
    if pick:
        a, l = pick
        untested = [x for x in a['lessons'] if not x['tested']]
        if not a['tested'] and len(untested) > 1:
            found.append({'kind': 'placement', 'area': a['id'], 'count': len(untested),
                          'title': f'Find your level in {a["title"]}',
                          'why': f'{len(untested)} quick questions, one per lesson, show what you already know, so you skip the parts you have down.',
                          'label': f'Start ({len(untested)} questions)', 'tutor': False})
        cont = _lesson_state(l) == 'started'
        found.append({'kind': 'learn', 'lesson': l['id'], 'area': a['id'],
                      'title': ('Go deeper on ' if cont else 'Learn ') + l['title'],
                      'why': (f'You have been tested on {l["tested"]} of its {l["total"]} ideas so far. '
                              + ('The tutor will work through the rest with you.' if tutor else 'The lesson covers the rest.') if cont
                              else 'Next in the course.' + (' The tutor will ask you questions as you go; talk or type.' if tutor else '')),
                      'label': ('Continue' if cont else 'Start') + (f' {via}' if via else ''), 'tutor': tutor})
    if not found or (len(found) < 3 and rep['tested']):
        found.append({'kind': 'mixed', 'title': 'A mixed review', 'why': 'Ten questions across everything you have tested, weakest first.',
                      'label': 'Start Quickfire', 'tutor': False})
    alternatives, kinds = [], {found[0]['kind']}
    for f in found[1:]:
        if f['kind'] not in kinds:
            alternatives.append(f)
            kinds.add(f['kind'])
    return {'primary': found[0], 'alternatives': alternatives[:2]}
