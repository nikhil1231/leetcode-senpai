"""The tutor's whiteboard: diagrams it draws mid-conversation. Pure; no I/O.

The tutor writes a fenced ```diagram block (YAML: title, nodes, edges, optional paths to step
through, a node left as "?" and node states). `extract` lifts the blocks out of a reply and
`clean` turns each into the same shape as a lesson's `arch` block, so the lesson renderer draws
it. Anything malformed is dropped rather than shown broken; a node without a position is laid
out in columns by how far it sits from the start of the graph.
"""
import re

import yaml

FENCE = re.compile(r'```[ \t]*diagram[ \t]*\n(.*?)(?:```|$)', re.S | re.I)
KINDS = ('client', 'service', 'db', 'cache', 'queue', 'lb', 'cdn', 'storage', 'worker', 'external', 'stream',
         'model', 'tool', 'vector', 'process', 'user')
ALIASES = {'database': 'db', 'sql': 'db', 'postgres': 'db', 'redis': 'cache', 'load-balancer': 'lb', 'loadbalancer': 'lb',
           'api': 'service', 'server': 'service', 'app': 'service', 'gateway': 'service', 'llm': 'model', 'agent': 'model',
           'topic': 'stream', 'kafka': 'stream', 'bucket': 'storage', 's3': 'storage', 'browser': 'client', 'third-party': 'external',
           'thread': 'process', 'pod': 'process', 'container': 'process', 'human': 'user', 'person': 'user', 'index': 'vector'}
STATES = ('ok', 'hot', 'down', 'new')
MAX_NODES, MAX_EDGES, MAX_PATHS, MAX_STEPS, MAX_COLS, MAX_ROWS, PER_MESSAGE = 14, 24, 4, 12, 6, 5, 2


def _text(v, n):
    return re.sub(r'\s+', ' ', str(v if v is not None else '')).strip()[:n]


def _slug(v):
    return re.sub(r'[^a-z0-9_-]+', '-', str(v).strip().lower()).strip('-')[:32]


def _pair(v):
    if isinstance(v, dict) and len(v) == 1 and 'from' not in v:   # YAML reads "a -> b: label" as {"a -> b": label}
        (k, label), = v.items()
        v = f'{k}: {label or ""}'
    if isinstance(v, dict):
        v = [v.get('from'), v.get('to'), v.get('label') or v.get('note') or '']
    if isinstance(v, str):
        m = re.match(r'\s*([\w-]+)\s*(?:->|→|>)\s*([\w-]+)\s*(?::\s*(.*))?$', v)
        v = [m.group(1), m.group(2), m.group(3) or ''] if m else []
    return list(v) if isinstance(v, (list, tuple)) and len(v) >= 2 else None


def layout(nodes, edges):
    """Columns by longest distance from a node nothing points at; rows in order within a column."""
    ids = [n['id'] for n in nodes]
    into = {i: [a for a, b, _ in edges if b == i and a != i] for i in ids}
    depth, seen = {}, set()

    def d(i):
        if i in depth:
            return depth[i]
        if i in seen:                       # a cycle: break it here
            return 0
        seen.add(i)
        depth[i] = 0 if not into[i] else min(MAX_COLS - 1, 1 + max(d(a) for a in into[i]))
        return depth[i]

    rows = {}
    for n in nodes:
        if n.get('x') is None or n.get('y') is None:
            n['x'] = d(n['id'])
            n['y'] = rows.get(n['x'], 0)
        rows[n['x']] = max(rows.get(n['x'], 0), n['y'] + 1)
    taken = {}
    for n in nodes:                          # two nodes in one cell: push the later one down
        while (n['x'], n['y']) in taken:
            n['y'] += 1
        taken[(n['x'], n['y'])] = n['id']
    return nodes


def clean(raw):
    """A diagram as the tutor wrote it (parsed YAML) -> an `arch`-shaped dict, or None."""
    if not isinstance(raw, dict):
        return None
    nodes, by = [], {}
    for n in (raw.get('nodes') or [])[:MAX_NODES]:
        if isinstance(n, (list, tuple)):    # [id, label, kind?]
            n = dict(zip(('id', 'label', 'kind'), n))
        if isinstance(n, str):
            n = {'id': n, 'label': n}
        if not isinstance(n, dict) or not n.get('id'):
            continue
        nid = _slug(n['id'])
        if not nid or nid in by:
            continue
        kind = _slug(n.get('kind') or 'service')
        kind = ALIASES.get(kind, kind)
        at = n.get('at') if isinstance(n.get('at'), (list, tuple)) and len(n['at']) == 2 else (n.get('x'), n.get('y'))
        try:
            x, y = (max(0, min(MAX_COLS - 1, int(at[0]))), max(0, min(MAX_ROWS + 3, int(at[1])))) if at[0] is not None and at[1] is not None else (None, None)
        except (TypeError, ValueError):
            x = y = None
        node = {'id': nid, 'label': _text(n.get('label') or n['id'], 28), 'kind': kind if kind in KINDS else 'service', 'x': x, 'y': y}
        if n.get('note'):
            node['note'] = _text(n['note'], 34)
        if _slug(n.get('state') or '') in STATES:
            node['state'] = _slug(n['state'])
        nodes.append(node)
        by[nid] = node
    if not nodes:
        return None
    edges, have = [], set()
    for e in (raw.get('edges') or [])[:MAX_EDGES * 2]:
        p = _pair(e)
        if not p:
            continue
        a, b = _slug(p[0]), _slug(p[1])
        if a in by and b in by and a != b and (a, b) not in have:
            have.add((a, b))
            edges.append([a, b, _text(p[2] if len(p) > 2 else '', 24)])
        if len(edges) >= MAX_EDGES:
            break
    paths = []
    for p in (raw.get('paths') or [])[:MAX_PATHS]:
        if not isinstance(p, dict):
            continue
        steps = []
        for s in (p.get('steps') or [])[:MAX_STEPS]:
            q = _pair(s)
            if q and (_slug(q[0]), _slug(q[1])) in have | {(b, a) for a, b in have}:
                steps.append([_slug(q[0]), _slug(q[1]), _text(q[2] if len(q) > 2 else '', 220)])
        if steps:
            paths.append({'label': _text(p.get('label') or f'Path {len(paths) + 1}', 40), 'steps': steps})
    out = {'type': 'arch', 'board': True, 'title': _text(raw.get('title') or 'Whiteboard', 80),
           'nodes': layout(nodes, edges), 'edges': [[a, b, l] for a, b, l in edges]}
    if paths:
        out['paths'] = paths
    ask = _slug(raw.get('missing') or raw.get('ask') or '')
    if ask in by:
        out['ask'] = ask
    if raw.get('caption'):
        out['caption'] = _text(raw['caption'], 240)
    return out


def extract(text):
    """-> (text with the diagram blocks removed, [clean diagrams]). At most PER_MESSAGE are kept."""
    boards = []
    for m in FENCE.finditer(text or ''):
        try:
            d = clean(yaml.safe_load(m.group(1)))
        except yaml.YAMLError:
            d = None
        if d and len(boards) < PER_MESSAGE:
            boards.append(d)
    return FENCE.sub('', text or ''), boards


def source(board):
    """A diagram back as the YAML the tutor wrote, so it sees (and can redraw) what is on the board."""
    body = {k: board[k] for k in ('title', 'caption') if board.get(k)}
    body['nodes'] = [{k: n[k] for k in ('id', 'label', 'kind', 'note', 'state') if n.get(k)} | {'at': [n['x'], n['y']]} for n in board['nodes']]
    body['edges'] = [[a, b, l] if l else [a, b] for a, b, l in board['edges']]
    if board.get('paths'):
        body['paths'] = board['paths']
    if board.get('ask'):
        body['missing'] = board['ask']
    return '```diagram\n' + yaml.safe_dump(body, sort_keys=False, allow_unicode=True, default_flow_style=None, width=1000) + '```'


GUIDE = """## Whiteboard
You can draw on a whiteboard he sees in the chat: a fenced block tagged diagram, holding YAML. Draw when a picture beats words: a request path, what talks to what, where something breaks, two designs side by side. Most messages need none; one per message at most, small (up to {nodes} boxes), then talk about it.
```diagram
title: Read path with a cache
nodes:
  - {{id: app, label: App server, kind: service}}
  - {{id: cache, label: Redis, kind: cache, note: 1 GB, state: hot}}
  - {{id: db, label: Postgres, kind: db}}
edges:
  - [app, cache, GET]
  - [app, db, on a miss]
paths:
  - label: A cache miss
    steps: [[app, cache, "miss: not in Redis"], [app, db, "read the row, then write it back"]]
```
- kind: one of {kinds}. state (optional): hot (struggling), down (failed), new (just added), ok.
- Positions are automatic (left to right along the arrows); add at: [column, row] only to place a box yourself.
- paths are optional: steps he can play through, each [from, to, what happens].
- missing: an id drawn as "?" for him to name in words, as a question.
- To change a diagram, draw it again with the change; the old one stays above."""


def guide():
    return GUIDE.format(nodes=MAX_NODES, kinds=', '.join(KINDS))
