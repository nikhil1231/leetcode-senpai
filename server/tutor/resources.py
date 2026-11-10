"""The interactive things outside a lesson that teach it: Ripple Ops levels, worked designs and the
internals simulators, per system design lesson, as links the tutor can hand over. Pure after load.

Ripple Ops levels name their lessons (simulators/ripple.json). Worked designs and internals
simulators don't, so INTERNALS and DESIGNS map them here, with the layer each serves: the game
and the worked designs are for using the pieces (interview-ready), most internals are depth.
A link is `#/system-design/simulators/<kind>~<id>[~<level>]`, the Simulators page's own route.
"""
import json
import os

STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'static')

# internals simulator -> (lessons, layer)
INTERNALS = {
    'btree': (['indexes', 'storage-engines'], 3), 'cowbtree': (['storage-engines'], 3), 'lsm': (['storage-engines'], 3),
    'rowcol': (['storage-engines'], 3), 'slottedpage': (['storage-engines'], 3), 'wal': (['storage-engines', 'recovery'], 3),
    'bully': (['consensus'], 3), 'merkle': (['design-kv'], 3), 'phiaccrual': (['design-kv'], 3),
    'quorum': (['consistency', 'design-kv'], 2), 'raft': (['consensus'], 3), 'twopc': (['consensus', 'outbox'], 3),
    'crdt': (['replication', 'design-kv'], 3), 'datamodels': (['data-models'], 2), 'encoding': (['event-streams'], 3),
    'isolation': (['transactions'], 2), 'partitioning': (['partitioning'], 2), 'replanomalies': (['replication'], 2),
    'streamwindow': (['event-streams'], 3), 'boe': (['estimates', 'numbers'], 1), 'cap': (['consistency'], 1),
    'cachestrategies': (['cache-aside'], 1), 'oauth': (['stateless-balancing'], 3), 'pubsub': (['queue-basics'], 1),
    'sqlsharding': (['partitioning'], 2), 'dns': (['request-flow'], 3), 'http': (['request-flow'], 2),
    'tcp': (['request-flow'], 3), 'tls': (['request-flow'], 3), 'csrf': (['api-contracts'], 3),
}
# worked design (static/walkthrough) -> lessons it practises
DESIGNS = {
    'url-shortener': ['design-links', 'id-generation'], 'rate-limiter': ['design-ratelimiter', 'rate-limiting'],
    'news-feed': ['design-feed', 'feed-fanout'], 'whatsapp': ['design-chat', 'realtime-push'],
    'notification-system': ['design-notifications'], 'search-autocomplete': ['design-typeahead'],
    'video-streaming': ['design-video'], 'kv-store': ['design-kv'], 'web-crawler': ['design-crawler'],
    'payment-system': ['design-payments'], 'digital-wallet': ['design-payments', 'transactions'],
    'hotel-reservation': ['design-seats', 'concurrent-holds'], 'consistent-hashing': ['consistent-hashing'],
    'id-generator': ['id-generation'], 'scale-from-zero': ['scaling', 'request-flow'], 'google-drive': ['object-storage'],
    'nearby-friends': ['geo-index', 'realtime-push'], 'proximity-service': ['geo-index'], 'google-maps': ['geo-index'],
    'distributed-message-queue': ['event-streams', 'queue-basics'], 'ad-click-aggregation': ['event-streams'],
    'metrics-monitoring': ['observability'], 'gaming-leaderboard': ['hot-keys'], 'object-storage': ['object-storage'],
    'distributed-email': ['search-index'], 'stock-exchange': ['concurrent-holds'], 'twitter-trending': ['event-streams'],
}


def _json(*parts):
    with open(os.path.join(STATIC, *parts), encoding='utf-8') as fh:
        return json.load(fh)


def _load():
    ripple = _json('simulators', 'ripple.json')['levels']
    internals = {t['id']: t for t in _json('simulators', 'internals.json')['topics']}
    designs = {d['id']: d for d in _json('walkthrough', 'index.json')['designs']}
    out = []
    for l in ripple:
        if l.get('lessons'):
            out.append({'kind': 'game', 'id': l['id'], 'title': l['title'], 'lessons': list(l['lessons']), 'layer': 2,
                        'about': f"Ripple Ops level: {l.get('goal') or l.get('kicker') or ''}".strip(),
                        'href': f"#/system-design/simulators/game~ripple~{l['id']}", 'after': l.get('after')})
    for i, (ls, layer) in INTERNALS.items():
        t = internals.get(i)
        if t:
            out.append({'kind': 'internals', 'id': i, 'title': t['title'], 'lessons': ls, 'layer': layer,
                        'about': f"Simulator: {t['blurb']}", 'href': f'#/system-design/simulators/internals~{i}'})
    for d, ls in DESIGNS.items():
        x = designs.get(d)
        if x:
            out.append({'kind': 'design', 'id': d, 'title': x['title'], 'lessons': ls, 'layer': 2,
                        'about': f"Worked design: step through each request flow, then stress it. {x.get('problem', '')}".strip(),
                        'href': f'#/system-design/simulators/design~{d}'})
    return out


ALL = _load()


def for_lessons(lesson_ids, max_layer=3):
    """Resources for any of these lessons, game levels first, each with a stable key r1, r2, …"""
    ids = set(lesson_ids)
    found = [r for r in ALL if ids & set(r['lessons']) and r['layer'] <= max_layer]
    order = {'game': 0, 'design': 1, 'internals': 2}
    found.sort(key=lambda r: order[r['kind']])
    return [{**r, 'key': f'r{i + 1}'} for i, r in enumerate(found)]


def text(resources, unlocked=None):
    """One line per resource for the tutor's prompt. A game level he can't open yet is marked."""
    lines = []
    for r in resources:
        locked = r['kind'] == 'game' and unlocked is not None and r['id'] not in unlocked
        lines.append(f"- {r['key']} · {r['title']} ({'Ripple Ops level, locked until he clears the one before' if locked else r['kind']}, "
                     f"{['', 'map', 'interview', 'depth'][r['layer']]}): {r['about'][:160]}")
    return '\n'.join(lines)
