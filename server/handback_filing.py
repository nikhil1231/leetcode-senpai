"""Filing what an outside tutor covered beyond its lesson: tangents onto ideas in any course.

A handback (handover.py) lists the topics the learner discussed that have no P-number: a tangent
into transactions, a question about retries. Each topic gets a shortlist of likely ideas from the
whole catalog by word overlap (rarer words count more), and one model call picks which of them
the topic really covered and whether the learner showed it in their own words or only heard it.
Only shortlisted ideas can be picked, so the model cannot invent one.

The topics are stored as reported first. Filing is derived from them and versioned
(FILING_VERSION): it can be re-run, and records are keyed by session and idea, so a re-run never
counts an idea twice. Pure: shortlist, payload, rows. I/O: handover.py.
"""
import math
import re
from typing import Literal

from pydantic import BaseModel, Field

FILING_VERSION = 1
SHORTLIST = 12
STOP = set("""a an and are as at be been but by can do does for from has have how if in into is it its
not of on or so than that the their them then there these they this to was were what when where which
while who why will with you your we our i me my he she his her also about more most other some such
only very just like use used using uses one two way ways make makes get gets need needs""".split())

SYSTEM = """You file what a learner discussed with an outside tutor onto the ideas of their course.

You get the topics the tutor reported (what was discussed, the learner's own words, and how they did) and, for each topic, a shortlist of candidate ideas from the course, each with a reference such as T2.C4.

For each topic, pick the candidates the conversation genuinely covered: the topic was substantially about that exact idea, not merely the same area. Pick none when nothing fits. For each pick, set shown to true only when the learner's own words (or the tutor's account of the learner's reasoning) demonstrate that idea; if the learner only heard it explained, shown is false.

Be strict: a missed idea costs little, a wrongly credited one misleads the learner's study plan. Use only references from the shortlists."""


class Match(BaseModel):
    ref: str = Field(description='A candidate reference from the shortlists, such as T2.C4.')
    shown: bool = Field(description="True when the learner's own words demonstrate the idea; false when they only heard it.")


class Filing(BaseModel):
    matches: list[Match]


def _words(text):
    out = set()
    for w in re.findall(r'[a-z0-9]+', (text or '').casefold()):
        if len(w) < 3 or w in STOP:
            continue
        out.add(w[:-1] if len(w) > 4 and w.endswith('s') and not w.endswith('ss') else w)
    return out


def index(points):
    """-> (words per point id, inverse document frequency per word) for `points`."""
    words = {p['id']: _words(' '.join(str(p.get(k) or '') for k in ('claim', 'subtopic', 'lesson_title', 'prompt')))
             for p in points}
    df = {}
    for ws in words.values():
        for w in ws:
            df[w] = df.get(w, 0) + 1
    n = len(words) or 1
    return words, {w: math.log(n / c) for w, c in df.items()}


def topic_text(t):
    return ' '.join(str(t.get(k) or '') for k in ('topic', 'detail', 'said', 'missing'))


def shortlist(text, idx, exclude=(), n=SHORTLIST):
    """-> up to n point ids sharing the most informative words with `text`, best first."""
    words, idf = idx
    mine = _words(text)
    scored = []
    for pid, ws in words.items():
        if pid in exclude:
            continue
        shared = mine & ws
        if len(shared) >= 2:
            scored.append((sum(idf[w] for w in shared), pid))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [pid for _, pid in scored[:n]]


def payload(topics, shortlists, points):
    """-> the model's input: each topic with its candidates, numbered T1.C1…"""
    out = []
    for i, (t, ids) in enumerate(zip(topics, shortlists), 1):
        out.append({'topic': f'T{i}', 'title': t['topic'], 'discussed': t.get('detail', ''), 'learner_said': t.get('said', ''),
                    'how_they_did': t['verdict'], 'missing': t.get('missing', ''),
                    'candidates': [{'ref': f'T{i}.C{j}', 'idea': points[pid]['claim'], 'lesson': points[pid]['lesson_title']}
                                   for j, pid in enumerate(ids, 1)]})
    return {'topics': out}


WORST = {'wrong': 0, 'partial': 1, 'right': 2}


def rows(topics, shortlists, matches):
    """The model's picks -> (debrief rows for ideas the learner showed, point ids they only heard).

    A row's ref is 'x.<point id>', so a session records each idea once however often it is
    filed. An idea picked by several topics keeps its strictest verdict; showing beats hearing."""
    refs, shown, heard = {}, {}, []
    for m in matches:
        hit = re.fullmatch(r'T(\d+)\.C(\d+)', m['ref'].strip())
        if not hit:
            continue
        ti, ci = int(hit[1]) - 1, int(hit[2]) - 1
        if not (0 <= ti < len(topics) and 0 <= ci < len(shortlists[ti])):
            continue
        t, pid = topics[ti], shortlists[ti][ci]
        if m['shown'] and t['verdict'] in WORST:
            row = {'ref': f'x.{pid}', 'verdict': t['verdict'], 'depth': t.get('depth') or 'recall',
                   'note': ((t.get('missing') or '').strip() if t['verdict'] != 'right' else '') or (t.get('said') or t['topic']).strip()[:300],
                   'quote': (t.get('said') or '').strip(), 'topic': t['topic']}
            old = shown.get(pid)
            if not old or WORST[row['verdict']] < WORST[old['verdict']]:
                shown[pid] = row
            refs[row['ref']] = pid
        elif pid not in heard:
            heard.append(pid)
    return list(shown.values()), [pid for pid in heard if pid not in shown], refs


SITTING = 12 * 3600   # handbacks on one lesson this close together are one sitting (a chat that handed over twice)


def _at(s):
    return s.get('last_handback_at') or s['imported_at']


def sitting(sessions, section, lesson):
    """-> the handover sessions on this lesson from its latest sitting, oldest first."""
    here = sorted((s for s in sessions if s.get('origin') == 'handover' and s.get('imported_at')
                   and s['scope'] == {'section': section, 'lesson': lesson}), key=_at)
    return [s for s in here if _at(here[-1]) - _at(s) < SITTING] if here else []


def lesson_report(sessions, section, lesson):
    """-> what a lesson page shows of outside tutoring: its latest sitting's handbacks combined (or
    None), and the other lessons' handbacks that filed ideas here, newest first."""
    group, report = sitting(sessions, section, lesson), None
    if group:
        counts, away, filed, statuses, retry = {}, {}, [], [], None
        for s in group:
            for k, n in (s.get('counts') or {}).items():
                counts[k] = counts.get(k, 0) + n
            f = s.get('filing') or {}
            status = f.get('status') or ('pending' if s.get('topics') else None)
            if status:
                statuses.append(status)
            if status in ('failed', 'waiting'):
                retry = retry or {'session': s['_key'], 'error': f.get('error', '')}
            filed += f.get('filed') or []
        for x in filed:
            if (x['section'], x['lesson']) != (section, lesson):
                a = away.setdefault((x['section'], x['lesson']), {'section': x['section'], 'lesson': x['lesson'],
                                                                  'lesson_title': x['lesson_title'], 'ideas': 0})
                a['ideas'] += 1
        last = group[-1]
        report = {'session': last['_key'], 'sessions': [s['_key'] for s in group], 'at': _at(last), 'counts': counts,
                  'explained': sum(len(s.get('explained_refs') or []) for s in group),
                  'summary': '\n\n'.join(s['summary'] for s in group if s.get('summary')),
                  'next_steps': next((s['next_steps'] for s in reversed(group) if s.get('next_steps')), ''),
                  'suggestions': list(dict.fromkeys(x for s in group for x in s.get('lesson_suggestions') or [])),
                  'topics': sum(len(s.get('topics') or []) for s in group),
                  'filing': {'status': 'failed' if retry else 'pending' if 'pending' in statuses else 'done' if statuses else None,
                             'retry': retry, 'here': sum((x['section'], x['lesson']) == (section, lesson) for x in filed),
                             'elsewhere': sorted(away.values(), key=lambda a: -a['ideas'])}}
    elsewhere = []
    for s in sessions:
        if s.get('origin') != 'handover' or not s.get('imported_at') or s['scope'] == {'section': section, 'lesson': lesson}:
            continue
        n = sum((x['section'], x['lesson']) == (section, lesson) for x in (s.get('filing') or {}).get('filed') or [])
        if n:
            elsewhere.append({'session': s['_key'], **s['scope'], 'at': _at(s), 'ideas': n})
    return report, sorted(elsewhere, key=lambda e: -e['at'])
