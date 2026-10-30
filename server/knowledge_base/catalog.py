"""Knowledge points: load, validate and index the reviewable point files. Pure after load.

`points/<section>/<lesson>.yaml` holds a lesson's points and its item → point map;
`points/<section>/_practice.yaml` maps items that belong to no lesson (skill drills, estimation
templates). Titles, categories and order come from the lesson catalogs, never from these files.
A lesson edited since its points were drafted is reported as stale, and a ledger item with no
points as unmapped. Neither is an error: that history just does not reach the knowledge base
until the points are regenerated. Inconsistent files (duplicate ids, links to unknown points)
fail loudly at import, like lessons do.
"""
import hashlib
import os
import re

import yaml

from .. import system_design_items as sd_items
from ..system_design_curriculum import LESSONS as SD_LESSONS, QUESTIONS as SD_QUESTIONS
from ..system_design_lessons import HERE as SD_HERE
from ..tracks import courses

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'points')
PRACTICE = '_practice'
KINDS = ('fact', 'principle', 'mechanism', 'tradeoff', 'procedure')
SECTIONS = {
    'system-design': {'prefix': 'sd', 'title': 'System design'},
    'fundamentals': {'prefix': 'fundamentals', 'title': 'Fundamentals'},
    'ai': {'prefix': 'ai', 'title': 'AI Engineering'},
}
SLUG = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')
MAX_POINTS_PER_ITEM = 3


class CatalogError(ValueError):
    pass


def lessons(section):
    """Course-ordered {lesson id: {title, category, objectives, prerequisite, path}}."""
    if section == 'system-design':
        return {k: {'title': l['title'], 'category': l['category'], 'objectives': list(l.get('objectives') or []),
                    'prerequisite': l.get('prerequisite'), 'path': os.path.join(SD_HERE, k + '.md')}
                for k, l in SD_LESSONS.items()}
    out, prev = {}, None
    for k, l in courses.lessons(section).items():
        out[k] = {'title': l['title'], 'category': l['category'], 'objectives': list(l.get('objectives') or []),
                  'prerequisite': prev, 'path': os.path.join(courses.HERE, section, k + '.md')}
        prev = k
    return out


def categories(section):
    if section == 'system-design':
        return [(c['id'], c['title']) for c in sd_items.categories()]
    return [(c[0], c[1]) for c in courses.COURSES[section]['categories']]


def items(section):
    """{item id: {kind, format, lesson}}: every countable thing the section's ledger tracks."""
    if section == 'system-design':
        src, questions = sd_items.ITEMS, SD_QUESTIONS
    else:
        src, questions = courses.items(section), courses.questions(section)
    known, out = lessons(section), {}
    for i in src:
        q = questions.get(i['id']) if i['kind'] in ('check', 'quickfire') else None
        lesson = i['topic'] if i['topic'] in known else None
        out[i['id']] = {'kind': i['kind'], 'format': (q or {}).get('format'), 'lesson': lesson}
    return out


def source_hash(path):
    try:
        with open(path, 'rb') as fh:
            return hashlib.sha256(fh.read()).hexdigest()[:16]
    except FileNotFoundError:
        return None


def point_id(section, lesson, slug):
    return f'{SECTIONS[section]["prefix"]}.{lesson}.{slug}'


def _read(path):
    with open(path, encoding='utf-8') as fh:
        doc = yaml.safe_load(fh) or {}
    if not isinstance(doc, dict):
        raise CatalogError(f'{path}: expected a mapping')
    return doc


def _check_point(p, section, lesson, objectives, where):
    for field in ('id', 'subtopic', 'kind', 'claim', 'prompt'):
        if not isinstance(p.get(field), str) or not p[field].strip():
            raise CatalogError(f'{where}: point missing {field}: {p.get("id")}')
    prefix = point_id(section, lesson, '')
    if not p['id'].startswith(prefix) or not SLUG.match(p['id'][len(prefix):]):
        raise CatalogError(f'{where}: point id {p["id"]} must be {prefix}<kebab-slug>')
    if p['kind'] not in KINDS:
        raise CatalogError(f'{where}: {p["id"]} has unknown kind {p["kind"]}')
    if any(not isinstance(o, int) or not 0 <= o < objectives for o in p.get('objectives') or []):
        raise CatalogError(f'{where}: {p["id"]} names an objective the lesson does not have')


def load(folder=HERE):
    """-> {points, aliases, items, item_info, used_by, stale, unmapped, problems}."""
    points, raw_items, item_info, stale, problems, unmapped = {}, {}, {}, [], [], {}
    for section, meta in SECTIONS.items():
        known, info = lessons(section), items(section)
        item_info.update({k: {**v, 'section': section} for k, v in info.items()})
        names = dict(categories(section))
        sdir = os.path.join(folder, section)
        files = {f[:-5] for f in os.listdir(sdir) if f.endswith('.yaml')} if os.path.isdir(sdir) else set()
        for extra in sorted(files - set(known) - {PRACTICE}):
            problems.append(f'{section}/{extra}.yaml is for no known lesson')
        for lesson_id, lesson in known.items():
            if lesson_id not in files:
                continue
            where = f'{section}/{lesson_id}.yaml'
            doc = _read(os.path.join(sdir, lesson_id + '.yaml'))
            if doc.get('section') != section or doc.get('lesson') != lesson_id:
                raise CatalogError(f'{where}: section or lesson does not match its path')
            if doc.get('source_hash') != source_hash(lesson['path']):
                stale.append(f'{section}/{lesson_id}')
            for p in doc.get('points') or []:
                _check_point(p, section, lesson_id, len(lesson['objectives']), where)
                if p['id'] in points:
                    raise CatalogError(f'{where}: duplicate point id {p["id"]}')
                points[p['id']] = {
                    'id': p['id'], 'section': section, 'section_title': meta['title'],
                    'category': lesson['category'], 'category_title': names.get(lesson['category'], lesson['category']),
                    'lesson': lesson_id, 'lesson_title': lesson['title'], 'subtopic': p['subtopic'].strip(),
                    'kind': p['kind'], 'claim': p['claim'].strip(), 'prompt': p['prompt'].strip(),
                    'objectives': list(p.get('objectives') or []), 'requires': list(p.get('requires') or []),
                    'same_as': p.get('same_as') or None, 'retired': bool(p.get('retired')), 'order': len(points)}
            for item, pids in (doc.get('items') or {}).items():
                raw_items[item] = (where, pids)
        if PRACTICE in files:
            where = f'{section}/{PRACTICE}.yaml'
            for item, pids in (_read(os.path.join(sdir, PRACTICE + '.yaml')).get('items') or {}).items():
                raw_items[item] = (where, pids)

    aliases = {}
    for pid, p in points.items():
        target = p['same_as']
        if target is None:
            continue
        if target == pid or target not in points:
            raise CatalogError(f'{pid}: same_as {target} is not another known point')
        if points[target]['same_as']:
            raise CatalogError(f'{pid}: same_as {target}, which is itself an alias')
        aliases[pid] = target

    def canonical(pid):
        return aliases.get(pid, pid)

    used_by = {}
    for pid, p in points.items():
        for r in p['requires']:
            if r not in points:
                raise CatalogError(f'{pid}: requires unknown point {r}')
        p['requires'] = sorted({canonical(r) for r in p['requires']} - {canonical(pid)},
                               key=lambda r: points[r]['order'])
        if pid not in aliases and not p['retired']:
            for r in p['requires']:
                used_by.setdefault(r, []).append(pid)

    item_map = {}
    for item, (where, pids) in raw_items.items():
        if not isinstance(pids, list) or not pids or len(pids) > MAX_POINTS_PER_ITEM:
            raise CatalogError(f'{where}: {item} must map to 1–{MAX_POINTS_PER_ITEM} points')
        for pid in pids:
            if pid not in points:
                raise CatalogError(f'{where}: {item} maps to unknown point {pid}')
        if item not in item_info:
            problems.append(f'{where}: {item} is not a current ledger item')
            continue
        item_map[item] = list(dict.fromkeys(canonical(p) for p in pids))
    for item, i in item_info.items():
        if item not in item_map:
            unmapped.setdefault(i['section'], []).append(item)
    return {'points': points, 'aliases': aliases, 'items': item_map, 'item_info': item_info,
            'used_by': used_by, 'stale': stale, 'unmapped': unmapped, 'problems': problems}


def canonical(catalog, pid):
    """A point id with aliases resolved, or None when unknown."""
    pid = catalog['aliases'].get(pid, pid)
    return pid if pid in catalog['points'] else None


def active(catalog):
    """Points that count: not retired, not an alias. In course order."""
    return [p for p in catalog['points'].values() if not p['retired'] and p['id'] not in catalog['aliases']]


CATALOG = load()
