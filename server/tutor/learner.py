"""Who the tutor is teaching: one profile, built fresh for every session. Pure; no I/O.

A lesson's own memory is a paragraph; this is the rest of him. How he likes to learn (notes the
tutor keeps with [[note …]], and style notes the outside tutor left), what he worked on lately in
other lessons and with the outside tutor (their whole report, not a one-line nod), where he is
strong or thin across the course, and which of this lesson's ideas were covered elsewhere, so they
are not taught again. Stored state is small: tutor_memory "learner" holds the notes and the
tutor's suggestion for next time; everything else is derived from source records each time.
"""
import re

RECENT_DAYS = 21
DAY = 86400
MAX_NOTES = 10
STYLE = re.compile(r'\b(prefer|prefers|style|wants|likes|dislikes|explain(?:ed)? .*first|socratic|patient|repetit)', re.I)


def add_note(learner, text, now, source='tutor'):
    """A note about how he learns, newest last; a repeat refreshes rather than duplicates."""
    text = ' '.join((text or '').split())[:240]
    if not text:
        return learner
    notes = [n for n in (learner or {}).get('notes', []) if n['text'].lower() != text.lower()]
    return {**(learner or {}), 'notes': (notes + [{'text': text, 'at': now, 'source': source}])[-MAX_NOTES:]}


def set_next(learner, section, lesson, why, now):
    return {**(learner or {}), 'next': {'section': section, 'lesson': lesson, 'why': (why or '')[:240], 'at': now}}


def fresh_next(learner, now, days=7):
    n = (learner or {}).get('next')
    return n if n and now - (n.get('at') or 0) < days * DAY else None


def _list(v):
    if isinstance(v, list):
        return v
    return []


def style_notes(study_sessions, learner):
    """How he likes to be taught: the tutor's own notes, then style remarks the outside tutor left."""
    out = [n['text'] for n in (learner or {}).get('notes', [])]
    for s in sorted(study_sessions, key=lambda s: -(float(s.get('last_handback_at') or 0))):
        for n in _list(s.get('notes')):
            if isinstance(n, str) and STYLE.search(n) and not n.lower().startswith(('revisit', 'exact')):
                out.append(n.strip())
    seen, uniq = set(), []
    for n in out:
        if n.lower() not in seen:
            seen.add(n.lower())
            uniq.append(n)
    return uniq[:6]


def outside_reports(study_sessions, titles, now, limit=2):
    """The latest outside-tutor handbacks, in full: summary, what it suggested next and its notes."""
    done = [s for s in study_sessions if s.get('last_handback_at') and (s.get('summary') or _list(s.get('notes')))
            and now - float(s['last_handback_at']) < RECENT_DAYS * DAY]
    out = []
    for s in sorted(done, key=lambda s: -float(s['last_handback_at']))[:limit]:
        scope = s.get('scope') or {}
        days = int((now - float(s['last_handback_at'])) // DAY)
        out.append({'lesson': titles.get((scope.get('section'), scope.get('lesson')), scope.get('lesson') or 'a lesson'),
                    'section': scope.get('section'), 'lesson_id': scope.get('lesson'),
                    'when': 'today' if days < 1 else 'yesterday' if days < 2 else f'{days} days ago',
                    'summary': (s.get('summary') or '')[:1500], 'next_steps': (s.get('next_steps') or '')[:300],
                    'notes': [n for n in _list(s.get('notes')) if isinstance(n, str)][:10]})
    return out


def other_lessons(memories, titles, current_key, now, limit=4):
    """What he did lately with this tutor in other lessons."""
    rows = [m for m in memories if str(m.get('_key', '')).startswith('lesson:') and m['_key'] != current_key
            and m.get('summary') and now - (m.get('last_at') or 0) < RECENT_DAYS * DAY]
    out = []
    for m in sorted(rows, key=lambda m: -(m.get('last_at') or 0))[:limit]:
        _, section, lesson = m['_key'].split(':', 2)
        out.append(f"{titles.get((section, lesson), lesson)}: {m['summary'][:400]}")
    return out


def standing(summary):
    """Strong and thin areas across the course, by category, from the knowledge model."""
    cats = [(c['title'], c['pct'], c['total'] - c['counts'].get('unseen', 0), c['total'])
            for s in (summary or {}).get('sections', []) for c in s.get('categories', [])]
    tested = [c for c in cats if c[2] >= 3]
    strong = [c[0] for c in sorted(tested, key=lambda c: -c[1]) if c[1] >= 60][:4]
    thin = [c[0] for c in sorted(tested, key=lambda c: c[1]) if c[1] < 40][:4]
    untouched = [c[0] for c in cats if c[2] == 0][:5]
    return {'strong': strong, 'thin': thin, 'untouched': untouched}


def covered_elsewhere(events, lesson_points, now, own_source='tutor'):
    """This lesson's ideas he went through with someone else recently (outside tutor, Telegram, a lesson)."""
    ids = {p['id'] for p in lesson_points}
    by = {}
    for e in events:
        if e.get('source') in (own_source, 'lesson') or now - (e.get('at') or 0) > RECENT_DAYS * DAY:
            continue
        for pid in e.get('points') or []:
            if pid in ids:
                by.setdefault(pid, set()).add(e.get('source'))
    return [p for p in lesson_points if p['id'] in by]


def text(profile):
    """The profile as a section of the tutor's system prompt."""
    lines = []
    if profile.get('style'):
        lines.append('How he likes to learn (from him and his other tutor; follow it):\n'
                     + '\n'.join(f'- {n}' for n in profile['style']))
    st = profile.get('standing') or {}
    bits = [f"strong in {', '.join(st['strong'])}" if st.get('strong') else '',
            f"thin in {', '.join(st['thin'])}" if st.get('thin') else '',
            f"not started on {', '.join(st['untouched'])}" if st.get('untouched') else '']
    if any(bits):
        lines.append('Across the course he is ' + '; '.join(b for b in bits if b) + '.')
    if profile.get('lately'):
        lines.append('Lately with you, in other lessons:\n' + '\n'.join(f'- {x}' for x in profile['lately']))
    for r in profile.get('outside') or []:
        notes = ''.join(f'\n  - {n}' for n in r['notes'])
        lines.append(f"With his other tutor ({r['when']}, on {r['lesson']}): {r['summary']}"
                     + (f"\n  It suggested next: {r['next_steps']}" if r['next_steps'] else '')
                     + (f'\n  Its notes:{notes}' if notes else ''))
    if profile.get('career'):
        lines.append(profile['career'])
    return '\n\n'.join(lines)
