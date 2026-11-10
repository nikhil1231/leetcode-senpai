"""Lessons as the tutor sees them, for any course section. Pure.

The tutor gets the lesson as private notes (prose, with each interactive block marked where it
sits), the list of blocks it may bring into the conversation, and the lesson's knowledge points.
Blocks keep their positional keys, so an answer given inside the tutor is recorded against the
same ledger item as one given in the lesson.
"""
import re

import yaml

from ..knowledge_base import catalog as kcat
from ..system_design_curriculum import LESSONS as SD_LESSONS
from ..tracks import courses

SECTIONS = ('system-design', 'fundamentals', 'ai')
NOTES_LIMIT = 32000


def get(section, key):
    """-> {section, id, title, category, summary, objectives, blocks} or None."""
    if section == 'system-design':
        l = SD_LESSONS.get(key)
        summary = (l or {}).get('principle', '')
    elif section in SECTIONS:
        l = courses.lessons(section).get(key)
        summary = (l or {}).get('summary', '')
    else:
        return None
    if not l:
        return None
    return {'section': section, 'id': key, 'title': l['title'], 'category': l['category'], 'summary': summary,
            'objectives': list(l.get('objectives') or []), 'blocks': l['blocks']}


def _first_line(b):
    text = b.get('title') or b.get('prompt') or b.get('say') or b.get('name') or b.get('intro') or ''
    return re.sub(r'\s+', ' ', re.sub(r'[*`_>#]', '', str(text))).strip()[:140]


def tools(lesson):
    """Blocks the tutor may show: every interactive block, with a one-line description (a simulator's
    intro or first challenge too, so the tutor knows what it does) and `words`, its own text for
    recognising a mention of it (session.implied)."""
    out = []
    for b in lesson['blocks']:
        if b['type'] == 'md' or 'key' not in b:
            continue
        about = _first_line(b)
        extra = b.get('intro') or next((c.get('text') for c in b.get('challenges') or [] if isinstance(c, dict)), '')
        if b['type'] == 'sim' and extra:
            about = f'{about}. {re.sub(r"\s+", " ", str(extra)).strip()[:160]}'
        words = ' '.join(str(x) for x in (b.get('title'), b.get('name'), b.get('intro'), b.get('prompt'), b.get('company'),
                                          *(c.get('text') for c in b.get('challenges') or [] if isinstance(c, dict))) if x)
        out.append({'key': b['key'], 'type': b['type'], 'about': about, 'words': words})
    return out


def outage_note(b):
    """An outage block for the tutor: the story and the fix, not the graph."""
    kind = {'real': 'A real outage', 'what-if': 'A what-if built on a real write-up', 'composite': 'A composite of a common pattern'}[b['kind']]
    fix = b.get('fix') or {}
    return (f'[BLOCK {b["key"]} · outage] {kind}: {b["title"]} ({b.get("company", "")} {b["when"]}).\n'
            f'He watches it break in the simulator first, then fixes it at the end of the lesson. Setup: {b["setup"]}\n'
            f'What happened: {b["happened"]}\nLesson: {b["takeaway"]}'
            + (f'\nThe fix he is asked for: {fix.get("prompt", "")} Hints: {" / ".join(fix.get("hints", []))}' if fix else ''))


def notes(lesson, limit=NOTES_LIMIT):
    """The lesson as the tutor's private notes: prose in order, with blocks marked in place."""
    parts = []
    for b in lesson['blocks']:
        if b['type'] == 'md':
            parts.append(b['text'])
        elif b['type'] == 'outage':
            parts.append(outage_note(b))
        else:
            body = {k: v for k, v in b.items() if k not in ('type', 'key')}
            parts.append(f'[BLOCK {b["key"]} · {b["type"]}]\n' + yaml.safe_dump(body, sort_keys=False, allow_unicode=True, width=1000)[:1500])
    text = '\n\n'.join(parts)
    return text if len(text) <= limit else text[:limit] + '\n…(notes truncated)'


def points(section, key, catalog=None):
    """The lesson's active knowledge points and the prerequisites they lean on, in course order."""
    c = catalog or kcat.CATALOG
    own = [p for p in kcat.active(c) if p['section'] == section and p['lesson'] == key]
    ids = {p['id'] for p in own}
    needed = [c['points'][r] for p in own for r in p['requires'] if r not in ids]
    prereqs = list({p['id']: p for p in needed}.values())
    return own, prereqs


def titles():
    """{(section, lesson id): title} for every lesson the tutor can teach."""
    out = {('system-design', k): l['title'] for k, l in SD_LESSONS.items()}
    for section in SECTIONS[1:]:
        out.update({(section, k): l['title'] for k, l in courses.lessons(section).items()})
    return out


def catalogue(exclude=None):
    """Every lesson as 'section/lesson: title', one per line, for the tutor's moves."""
    return '\n'.join(f'{s}/{k}: {t}' for (s, k), t in titles().items() if (s, k) != exclude)
