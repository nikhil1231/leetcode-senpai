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
    """Blocks the tutor may show: every interactive block, with a one-line description."""
    return [{'key': b['key'], 'type': b['type'], 'about': _first_line(b)} for b in lesson['blocks'] if b['type'] != 'md']


def notes(lesson, limit=NOTES_LIMIT):
    """The lesson as the tutor's private notes: prose in order, with blocks marked in place."""
    parts = []
    for b in lesson['blocks']:
        if b['type'] == 'md':
            parts.append(b['text'])
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
