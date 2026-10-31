"""Evidence for the knowledge base, from every source. Pure: records in, point events out.

Ledger sources (lessons, Quickfire, checks, papers, drills, redesigns) already report item
events; each item's points come from the catalog's item map. A clean answer is clean for all of
an item's points. A miss counts fully against the point the item mostly tests (listed first)
and as a shared miss against the rest. Depth follows the item's format, and items graded by a
model's reading of free text are soft evidence.

Direct sources (the tutor, Telegram, the Threads card, …) store their own events, which name
their points. A miss counts against `failed` when the source names which points failed (the
rest are left untouched), else against every point named. A `partial` miss (the gist was right,
a piece was missing) weakens memory like a shared miss instead of resetting it.
"""
from .. import system_design_items as sd_items
from ..tracks import courses
from . import catalog as cat

ITEM_DEPTH = {
    'check': 'recognise', 'sort': 'recognise', 'order': 'recall', 'faded': 'recall', 'recall': 'explain',
    'predict': 'apply', 'calc': 'apply', 'bug': 'apply', 'incident': 'apply', 'arch': 'apply',
    'timeline': 'apply', 'redesign': 'apply', 'exercise': 'apply', 'drill': 'apply',
}
SOFT_ITEMS = {'recall', 'redesign'}


def item_depth(info):
    if info['kind'] == 'quickfire':
        return 'recognise' if info.get('format') in ('choice', 'multi') else 'recall'
    return ITEM_DEPTH.get(info['kind'], 'recall')


def item_events(section, records):
    if section == 'system-design':
        return sd_items.events(records)
    return courses.events(section, records)


def derived(catalog, records_by_section):
    """Point events from ledger records: {section: [records]}."""
    out = []
    for section, records in records_by_section.items():
        for e in item_events(section, records):
            pids, info = catalog['items'].get(e['item']), catalog['item_info'].get(e['item'])
            if not pids or not info:
                continue
            base = {'at': e['at'], 'kind': 'answer', 'clean': bool(e['clean']), 'depth': item_depth(info),
                    'strength': 'soft' if info['kind'] in SOFT_ITEMS else 'hard', 'source': e.get('source'),
                    'ref': e['item']}
            for n, pid in enumerate(pids):
                out.append({**base, 'point': pid, 'blame': 'full' if e['clean'] or n == 0 else 'shared'})
    return out


def direct(catalog, docs):
    """Point events from stored knowledge-base events. Unknown points are skipped, aliases resolved."""
    out = []
    for d in docs:
        points = [p for p in (cat.canonical(catalog, x) for x in d.get('points') or []) if p]
        if d.get('kind') == 'exposure':
            out += [{'point': p, 'at': d['at'], 'kind': 'exposure', 'source': d.get('source'), 'ref': d.get('_key')}
                    for p in dict.fromkeys(points)]
            continue
        failed = {cat.canonical(catalog, x) for x in d.get('failed') or []} - {None}
        for p in dict.fromkeys(points):
            if not d['clean'] and failed and p not in failed:
                continue
            partial = bool(d.get('partial')) and not d['clean']
            out.append({'point': p, 'at': d['at'], 'kind': 'answer', 'clean': bool(d['clean']),
                        'depth': d.get('depth'), 'strength': d.get('strength', 'hard'),
                        'blame': 'shared' if partial else 'full',
                        'source': d.get('source'), 'ref': d.get('_key')})
    return out
