"""Lessons as the tutor sees them, for any course section. Pure.

The tutor gets the lesson as private notes (prose, with each interactive block marked where it
sits), the list of blocks it may bring into the conversation, and the lesson's knowledge points.
Blocks keep their positional keys, so an answer given inside the tutor is recorded against the
same ledger item as one given in the lesson.

An area overview ("map-<area>", pass one of the layered course; ids keep the old "map" name) is a
lesson made from a whole system design area. An authored overview (overviews.py) gives it its steps,
objectives, blocks and notes. Without one: one objective per lesson in the area, the area's
simulators, outages and diagrams as its blocks (renumbered, each with `from` naming its lesson and
key so answers land on the real ledger item), and the map-layer ideas of every lesson as its notes.
Either way its points are the map-layer ideas of every lesson in the area.

The AI and fundamentals courses have overviews too ("map-<category>" in their section), but only
where one is authored; there is no fallback page, and their points are every idea in the area
(those courses aren't layered).
"""
import re

import yaml

from ..knowledge_base import catalog as kcat
from ..system_design_curriculum import CATEGORIES as SD_CATEGORIES, LESSONS as SD_LESSONS
from ..tracks import courses
from . import overviews

SECTIONS = ('system-design', 'fundamentals', 'ai')
NOTES_LIMIT = 32000
MAP_PREFIX = 'map-'
DESIGN_AREAS = ('designs', 'casebook')     # whole designs: practised once their areas are mapped, not mapped themselves
MAP_BLOCKS = ('sim', 'outage', 'arch')


def map_areas():
    """[(area id, title, description)] of the system design areas pass one maps, in course order."""
    return [(c, t, d) for c, t, d in SD_CATEGORIES if c not in DESIGN_AREAS]


def area_lessons(area, section='system-design'):
    if section != 'system-design':
        return list(courses.COURSES[section]['order'].get(area, []))
    return [k for k, l in SD_LESSONS.items() if l['category'] == area]


def track_area(section, area):
    """(title, description) of a course category, or None."""
    return next(((t, d) for c, t, d in courses.COURSES[section]['categories'] if c == area), None) if section in courses.COURSES else None


def area_map(area, section='system-design'):
    """The lesson for mapping one area with the tutor, or None."""
    if section != 'system-design':
        found, ov = track_area(section, area), overviews.lesson(area, section)
        if not found or not ov:
            return None
        return {'section': section, 'id': MAP_PREFIX + area, 'title': f'Overview: {found[0]}', 'category': area,
                'summary': found[1], 'blocks': ov['blocks'], 'map': {'area': area, 'lessons': area_lessons(area, section)},
                'overview': ov, 'objectives': ov['objectives']}
    found = next(((t, d) for c, t, d in map_areas() if c == area), None)
    if not found:
        return None
    keys, blocks = area_lessons(area), []
    ov = overviews.lesson(area)
    if ov:
        return {'section': 'system-design', 'id': MAP_PREFIX + area, 'title': f'Overview: {found[0]}', 'category': area,
                'summary': found[1], 'blocks': ov['blocks'], 'map': {'area': area, 'lessons': keys}, 'overview': ov,
                'objectives': ov['objectives']}
    for k in keys:
        for b in SD_LESSONS[k]['blocks']:
            if b['type'] in MAP_BLOCKS and 'key' in b and len(blocks) < 999:
                blocks.append({**b, 'key': f'b{len(blocks) + 1}', 'from': {'lesson': k, 'key': b['key']}})
    return {'section': 'system-design', 'id': MAP_PREFIX + area, 'title': f'Overview: {found[0]}', 'category': area,
            'summary': found[1], 'blocks': blocks, 'map': {'area': area, 'lessons': keys},
            'objectives': [f"{SD_LESSONS[k]['title']}: what it is for, the standard answer and its main tradeoff" for k in keys]}


def get(section, key):
    """-> {section, id, title, category, summary, objectives, blocks} or None."""
    if section in SECTIONS and key.startswith(MAP_PREFIX):
        return area_map(key[len(MAP_PREFIX):], section)
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


def map_notes(lesson, catalog=None):
    """An area map's notes: per lesson, its principle, its map ideas (to cover) and the interview and
    depth subtopics beyond them (to name, not teach), then the blocks and where each comes from."""
    c = catalog or kcat.CATALOG
    pts = [p for p in kcat.active(c) if p['section'] == 'system-design']
    parts = []
    for k in lesson['map']['lessons']:
        l, mine = SD_LESSONS[k], [p for p in pts if p['lesson'] == k]
        later = list(dict.fromkeys(p['subtopic'] for p in mine if p['layer'] > 1))
        parts.append(f"### {l['title']} ({k})\n{l.get('principle', '')}\nMap ideas, the ones to cover:\n"
                     + '\n'.join(f"- {p['claim']}" for p in mine if p['layer'] == 1)
                     + (f"\nBeyond the map (name, don't teach): {'; '.join(later)}" if later else ''))
    parts.append('Blocks:\n' + '\n'.join(f"[BLOCK {b['key']} · {b['type']}] {_first_line(b)} (from {SD_LESSONS[b['from']['lesson']]['title']})"
                                          for b in lesson['blocks']))
    return '\n\n'.join(parts)


def notes(lesson, limit=NOTES_LIMIT):
    """The lesson as the tutor's private notes: prose in order, with blocks marked in place."""
    if lesson.get('map'):
        text = overviews.notes(lesson['map']['area'], lesson['section']) if lesson.get('overview') else map_notes(lesson)
        return text if len(text) <= limit else text[:limit] + '\n…(notes truncated)'
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
    if section == 'system-design' and key.startswith(MAP_PREFIX):
        area = set(area_lessons(key[len(MAP_PREFIX):]))
        return [p for p in kcat.active(c) if p['section'] == section and p['lesson'] in area and p['layer'] == kcat.MAP], []
    if key.startswith(MAP_PREFIX):
        area = set(area_lessons(key[len(MAP_PREFIX):], section))
        return [p for p in kcat.active(c) if p['section'] == section and p['lesson'] in area], []
    own = [p for p in kcat.active(c) if p['section'] == section and p['lesson'] == key]
    ids = {p['id'] for p in own}
    needed = [c['points'][r] for p in own for r in p['requires'] if r not in ids]
    prereqs = list({p['id']: p for p in needed}.values())
    return own, prereqs


def titles():
    """{(section, lesson id): title} for every lesson the tutor can teach."""
    out = {('system-design', k): l['title'] for k, l in SD_LESSONS.items()}
    out.update({('system-design', MAP_PREFIX + c): f'Overview: {t}' for c, t, _ in map_areas()})
    for section in SECTIONS[1:]:
        out.update({(section, k): l['title'] for k, l in courses.lessons(section).items()})
        out.update({(section, MAP_PREFIX + c): f'Overview: {track_area(section, c)[0]}' for c in overviews.areas(section)})
    return out


def catalogue(exclude=None):
    """Every lesson as 'section/lesson: title', one per line, for the tutor's moves."""
    return '\n'.join(f'{s}/{k}: {t}' for (s, k), t in titles().items() if (s, k) != exclude)
