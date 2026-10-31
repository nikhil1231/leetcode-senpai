"""Study debriefs: what an external chatbot says you got right and wrong, back into the knowledge base.

A study prompt (study_prompt.py) numbers the ideas it lists (P1, P2…) and saves which point each
number is, as a session. After the chat, the bot writes a debrief block naming that session and
grading each idea it tested; you paste it into the app. Pure: parse, plan. The router applies a
plan after you have seen it.

Trust: the bot grades itself from a conversation, so a clean answer is soft evidence (held, but
unconfirmed until a Quickfire check), while a miss counts in full. A wrong answer opens a
misconception, a partial one a gap; a clean answer closes what was open on that idea.
"""
import re

SOURCE = 'voice-chat'
VERDICTS = ('right', 'partial', 'wrong')
DEPTHS = ('recognise', 'recall', 'explain', 'apply')
HEADER = re.compile(r'SENPAI-DEBRIEF\W+session\s*[=:]\s*([A-Za-z0-9]+)', re.I)
ROW = re.compile(r'^P(\d+)\b\W*(right|correct|partial|partly|wrong|incorrect)\b\W*'
                 r'(recogni[sz]e|recall|explain|apply)?\b\W*(.*)$', re.I)
NOTE = re.compile(r'^NOTE\b\W*(.*)$', re.I)
ALIASES = {'correct': 'right', 'partly': 'partial', 'incorrect': 'wrong', 'recognize': 'recognise'}


def _clean(text):
    return text.strip().strip('"“”\'`').strip()


def parse(text):
    """-> {session, rows: [{ref, verdict, depth, note}], notes, skipped}. Tolerant of markdown and chatter."""
    m = HEADER.search(text or '')
    rows, notes, skipped, after = {}, [], [], False
    for raw in (text or '').splitlines():
        line = re.sub(r'^[\s>*\-•`|]+', '', raw).replace('**', '').replace('|', ' ').strip()
        if not line or line.startswith('```'):
            continue
        if HEADER.search(line):
            after = True
            continue
        if not after:
            continue
        r = ROW.match(line)
        if r:
            verdict = ALIASES.get(r[2].lower(), r[2].lower())
            depth = ALIASES.get((r[3] or '').lower(), (r[3] or '').lower()) or 'recall'
            rows[f'P{int(r[1])}'] = {'ref': f'P{int(r[1])}', 'verdict': verdict, 'depth': depth, 'note': _clean(r[4])}
        elif NOTE.match(line):
            if _clean(NOTE.match(line)[1]):
                notes.append(_clean(NOTE.match(line)[1]))
        else:
            skipped.append(line[:200])
    return {'session': m[1] if m else None, 'rows': list(rows.values()), 'notes': notes, 'skipped': skipped}


def plan(parsed, refs, points, misconceptions):
    """-> what an import would record. `refs`: the session's {ref: point id}; `points`: {id: point};
    `misconceptions`: all of them (only open ones on the session's points matter)."""
    open_on = {}
    for m in misconceptions:
        if m.get('status') == 'open':
            open_on.setdefault(m['point'], []).append(m)
    changes, skipped = [], list(parsed['skipped'])
    for row in parsed['rows']:
        pid = refs.get(row['ref'])
        p = points.get(pid) if pid else None
        if not p:
            skipped.append(f"{row['ref']}: not an idea from this session")
            continue
        right = row['verdict'] == 'right'
        change = {**row, 'point': pid, 'claim': p['claim'], 'lesson_title': p['lesson_title'],
                  'event': {'key': row['ref'], 'points': [pid], 'clean': right, 'partial': row['verdict'] == 'partial',
                            'depth': row['depth'], 'strength': 'soft', 'note': row['note'][:300]},
                  'opens': None, 'resolves': len(open_on.get(pid, [])) if right else 0}
        if not right:
            change['opens'] = {'kind': 'belief' if row['verdict'] == 'wrong' else 'gap',
                               'text': row['note'] or p['claim'], 'ask': p.get('prompt', '')}
        changes.append(change)
    counts = {v: sum(c['verdict'] == v for c in changes) for v in VERDICTS}
    return {'changes': changes, 'notes': parsed['notes'], 'skipped': skipped, 'counts': counts,
            'resolves': sum(c['resolves'] for c in changes)}
