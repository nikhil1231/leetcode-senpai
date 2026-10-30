"""Adaptive lessons: sections, warm-up probes and a per-learner plan. Pure functions.

A lesson splits into sections at its `##` headings. Each section's mode comes from evidence
on its gradeable blocks, read from the knowledge ledger: `known` (collapsed: you have shown
this), `skim` (key points and the remaining activities) or `learn` (the full do-first path).
Interview and recall blocks form the lesson's finale. Walkthrough lessons (designs and the
casebook) are attempt-first instead of probed: you try a stage before seeing it, and the
number of attempted stages grows through the course, fading the worked support.
"""
import re

from .system_design_items import block_id, gradeable, is_walkthrough

HEADING = re.compile(r'^##\s+(.+?)\s*$', re.M)
FINALE = ('interview', 'recall')
# Fill-the-gaps leans on the lesson's own numbers, so it is never a warm-up question.
PROBE_KINDS = ('predict', 'calc', 'order', 'sort', 'bug')
MAX_PROBES = 5
HELD = ('solid', 'learning')
MODES = ('known', 'skim', 'learn')
KNOWN_SHARE = 0.75


def lead(text):
    """The first plain paragraph of some Markdown: the section's key point."""
    paragraphs = re.split(r'\n\s*\n', text.strip())
    in_fence = False
    for p in paragraphs:
        if p.count('```') % 2:
            in_fence = not in_fence
            continue
        if in_fence or p.lstrip()[:1] in ('>', '|', '#', '`') or re.match(r'\s*([-*]|\d+\.)\s', p):
            continue
        return ' '.join(p.split())
    return ''


def sections(lesson):
    """{'sections': [{id, title, parts, blocks, lead, words}], 'finale': [block keys]}."""
    out, finale = [{'id': 's0', 'title': None, 'parts': []}], []
    for b in lesson.get('blocks', []):
        if b['type'] == 'md':
            text, pos = b['text'], 0
            for m in HEADING.finditer(text):
                before = text[pos:m.start()].strip()
                if before:
                    out[-1]['parts'].append({'type': 'md', 'text': before})
                out.append({'id': f's{len(out)}', 'title': m[1], 'parts': []})
                pos = m.end()
            rest = text[pos:].strip()
            if rest:
                out[-1]['parts'].append({'type': 'md', 'text': rest})
        elif b['type'] in FINALE:
            finale.append(b['key'])
        else:
            out[-1]['parts'].append({'type': 'block', 'key': b['key'], 'kind': b['type']})
    result = []
    for s in out:
        if not s['parts']:
            continue
        prose = [p['text'] for p in s['parts'] if p['type'] == 'md']
        result.append({**s, 'blocks': [p['key'] for p in s['parts'] if p['type'] == 'block'],
                       'lead': next((x for x in map(lead, prose) if x), ''),
                       'words': sum(len(t.split()) for t in prose)})
    return {'sections': result, 'finale': finale}


def evidence(lesson, section, statuses):
    """Counts of held, fading and shaky gradeable blocks in a section, from ledger statuses."""
    by_key = {b['key']: b for b in lesson.get('blocks', []) if b['type'] != 'md'}
    ev = {'held': 0, 'fading': 0, 'wrong': 0, 'unseen': 0}
    for key in section['blocks']:
        if not gradeable(by_key[key]):
            continue
        status = statuses.get(block_id(lesson['id'], key), 'unseen')
        ev['held' if status in HELD else 'wrong' if status == 'shaky' else status] += 1
    return ev


def mode_of(ev):
    """learn if anything is wrong, known if everything seen is held, skim if fading; None if unseen."""
    if ev['wrong']:
        return 'learn'
    if ev['fading']:
        return 'skim'
    if ev['held']:
        return 'known'
    return None


def attempt_stages(position, total_sections):
    """Stages attempted before reading, for the n-th walkthrough (0-based): 2, then one more each."""
    return min(total_sections, 2 + position)


def probes(lesson, statuses, limit=MAX_PROBES):
    """One quick gradeable block per undecided section, in course order. None for walkthroughs."""
    if is_walkthrough(lesson):
        return []
    split = sections(lesson)
    by_key = {b['key']: b for b in lesson.get('blocks', []) if b['type'] != 'md'}
    out = []
    for s in split['sections']:
        if mode_of(evidence(lesson, s, statuses)):
            continue
        key = next((k for k in s['blocks'] if by_key[k]['type'] in PROBE_KINDS and gradeable(by_key[k])), None)
        if key:
            out.append(key)
        if len(out) >= limit:
            break
    return out


def plan(lesson, statuses, *, fresh=False, overrides=None, position=None):
    """Per-section mode, evidence, attempt flag and note. `position` is the walkthrough index."""
    split = sections(lesson)
    evs = {s['id']: evidence(lesson, s, statuses) for s in split['sections']}
    decided = {sid: mode_of(ev) for sid, ev in evs.items()}
    seen = [m for m in decided.values() if m]
    share = sum(m == 'known' for m in seen) / len(seen) if seen else 0
    fallback = 'learn' if fresh or share < KNOWN_SHARE else 'skim'
    walk = is_walkthrough(lesson)
    stages = [s for s in split['sections'] if s['title']]
    attempts = {s['id'] for s in stages[:attempt_stages(position or 0, len(stages))]} if walk else set()
    out = []
    for s in split['sections']:
        mode = 'learn' if walk else decided[s['id']] or fallback
        o = (overrides or {}).get(s['id']) or {}
        note = o.get('note', '')
        if not walk and o.get('mode') in MODES and not (o['mode'] == 'known' and evs[s['id']]['wrong']):
            mode = o['mode']
        out.append({**s, 'mode': mode, 'evidence': evs[s['id']], 'attempt': s['id'] in attempts, 'note': note})
    return {'sections': out, 'finale': split['finale'], 'known_share': round(share, 2), 'walkthrough': walk}


def callbacks(lesson_id, order, views, limit=2):
    """Earlier-lesson questions worth retrieving now: shaky first, then fading, then weakest held."""
    if lesson_id not in order:
        return []
    earlier = set(order[:order.index(lesson_id)])
    pool = [v for v in views if v['topic'] in earlier and v['kind'] in ('check', 'quickfire')]
    rank = {'shaky': 0, 'fading': 1, 'learning': 2, 'solid': 3}
    pool = sorted((v for v in pool if v['status'] in rank), key=lambda v: (rank[v['status']], v['r'], v['id']))
    picked, topics = [], set()
    for v in pool:
        if v['topic'] in topics:
            continue
        picked.append(v['id'])
        topics.add(v['topic'])
        if len(picked) >= limit:
            break
    return picked
