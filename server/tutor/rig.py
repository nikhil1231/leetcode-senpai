"""Designs the tutor hands over to run in the simulator, and their results coming back. Pure.

The tutor writes a fenced ```design block (YAML): components from the design builder's palette
with their sizes, the arrows between them, the traffic (a Ripple Ops level's, or users and
requests per user) and up to three incidents. `extract` cleans it into a builder graph and a
scenario; the chat shows it folded behind an Open card, where he can change it and run the day.
A run comes back as a short text the tutor reads (`result_text`), so it can argue from the numbers.
"""
import json
import os
import re

import yaml

from . import board

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, '..', '..', 'web', 'public', 'simulators')
FENCE = re.compile(r'```[ \t]*design[ \t]*\n(.*?)(?:```|$)', re.S | re.I)


def _json(name):
    with open(os.path.join(STATIC, name), encoding='utf-8') as fh:
        return json.load(fh)


ECON = _json('economics.json')['components']
LEVELS = {l['id']: l for l in _json('ripple.json')['levels']}
COMPONENTS = list(ECON)
EVENTS = ('surge', 'hot-key', 'cache-flush', 'cache-node', 'az-outage', 'region-outage', 'db-failover', 'bad-deploy',
          'slow-dependency', 'poison-message', 'ddos', 'partner-burst',
          'model-update', 'rate-limit', 'provider-outage', 'injection-campaign', 'doc-change', 'node-down')
TRAFFIC = ('read', 'write', 'media', 'upload', 'search', 'realtime', 'geo', 'locate', 'payment')
ALIASES = {'lb': 'load-balancer', 'app': 'app-server', 'service': 'app-server', 'server': 'app-server', 'api': 'app-server',
           'db': 'db-sql', 'sql': 'db-sql', 'postgres': 'db-sql', 'database': 'db-sql', 'nosql': 'db-nosql', 'redis': 'cache',
           'queue': 'message-queue', 'kafka': 'message-queue', 'dlq': 'dead-letter-queue', 's3': 'object-store',
           'gateway': 'api-gateway', 'websocket': 'websocket-server', 'search': 'search-engine', 'external': 'external-service',
           'workers': 'worker', 'users': 'client', 'user': 'client'}
SETTINGS = {'tier': str, 'count': int, 'azs': int, 'replicas': int, 'shards': int, 'autoscale': int, 'sync': str,
            'timeouts': bool, 'canary': bool, 'hotKey': bool, 'coalesce': bool,
            'grounded': bool, 'cachePrefix': bool, 'fresh': bool, 'confirm': bool, 'scoped': bool}
SYNONYMS = {'size': 'tier', 'instances': 'count', 'zones': 'azs', 'hot_key': 'hotKey', 'hot-key': 'hotKey', 'gpus': 'count', 'agents': 'count',
            'cache_prefix': 'cachePrefix', 'prompt_caching': 'cachePrefix', 'prompt-caching': 'cachePrefix'}
AI_KINDS = ('faq', 'exact', 'account', 'action', 'hard', 'unanswerable', 'injection')
ALIASES.update({'llm': 'llm-large', 'large-llm': 'llm-large', 'small-llm': 'llm-small', 'gpt': 'llm-large', 'model': 'llm-large', 'router': 'model-router',
                'vectors': 'vector-db', 'vector-store': 'vector-db', 'pgvector': 'vector-db', 'bm25': 'search-engine', 'keyword-search': 'search-engine',
                'rerank': 'reranker', 'guard': 'guardrail', 'guardrails': 'guardrail', 'tools': 'tool-gateway', 'human': 'human-handoff', 'evals': 'eval-harness'})
MAX_NODES, MAX_EVENTS, PER_MESSAGE = 16, 3, 1
GRID_X, GRID_Y, LEFT, TOP = 190, 120, 40, 60


def _num(v, lo, hi, default=None):
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return default


SCALE = {'k': 1e3, 'thousand': 1e3, 'm': 1e6, 'mn': 1e6, 'million': 1e6, 'b': 1e9, 'bn': 1e9, 'billion': 1e9}


def _count(v):
    """A count as a model writes it: 2000000, "2,000,000", "2M", "2 million", "1.5bn", "200k"."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.fullmatch(r'\s*([\d.,]+)\s*([a-z]*)\s*(?:users|people|daily users|dau)?\s*', str(v).lower())
    if not m:
        return None
    try:
        n = float(m.group(1).replace(',', ''))
    except ValueError:
        return None
    return n * SCALE.get(m.group(2), 1 if not m.group(2) else 0) or None


def _truthy(v):
    return v if isinstance(v, bool) else str(v).strip().lower() in ('true', 'yes', 'on', '1', 'y') if isinstance(v, (str, int)) else None


def _settings(raw, defid):
    cfg = {}
    for k, v in (raw or {}).items():
        k = SYNONYMS.get(k, k)
        kind = SETTINGS.get(k)
        if kind is int and _num(_count(v), 0, 500) is not None:
            cfg[k] = int(_num(_count(v), 0, 500))
        elif kind is bool and _truthy(v) is not None:
            cfg[k] = _truthy(v)
        elif kind is str and isinstance(v, (str, int)):
            cfg[k] = str(v).strip().lower()[:12]
    tiers = {t['id'] for t in ECON.get(defid, {}).get('tiers', [])}
    if 'tier' in cfg and cfg['tier'] not in tiers:
        cfg.pop('tier')
    return cfg


def _scenario(raw):
    level = LEVELS.get(str(raw.get('level') or '').strip())
    scn = {k: level[k] for k in ('dau', 'traffic', 'data', 'slo', 'far') if k in level} if level else {}
    if raw.get('users') or raw.get('dau'):
        scn['dau'] = int(_num(_count(raw.get('users') or raw.get('dau')), 10, 5e9, 10000))
    t = raw.get('traffic')
    if isinstance(t, dict):
        traffic = {}
        for k, v in t.items():
            if k in TRAFFIC and isinstance(v, (dict, int, float)):
                v = v if isinstance(v, dict) else {'perUser': v}
                traffic[k] = {kk: _num(vv, 0, 1e6) for kk, vv in v.items()
                              if kk in ('perUser', 'cacheable', 'workingSetGb', 'kb') and _num(vv, 0, 1e6) is not None}
            elif k == 'peak':
                traffic['peak'] = _num(v, 1, 20, 2)
        if traffic:
            scn['traffic'] = traffic
    slo = dict(scn.get('slo') or {})
    for k, lo, hi in (('availability', 90, 99.999), ('budget', 10, 1e8)):
        if raw.get(k) is not None and _num(raw[k], lo, hi) is not None:
            slo[k] = _num(raw[k], lo, hi)
    if slo:
        scn['slo'] = slo
    scn.setdefault('dau', 10000)
    events = []
    found = raw.get('incidents') or raw.get('incident') or []
    for e in ([found] if isinstance(found, (dict, str)) else found if isinstance(found, list) else [])[:MAX_EVENTS]:
        if isinstance(e, str):
            e = {'type': e.strip().lower()}
        if not isinstance(e, dict) or e.get('type') not in EVENTS:
            continue
        ev = {'id': f'tutor-{len(events)}', 'type': e['type'], 'at': int(_num(e.get('at'), 0, 23, 19)), 'dur': int(_num(e.get('dur'), 1, 6, 1)), 'params': {}}
        for k, lo, hi in (('mult', 0.01, 50), ('share', 0.05, 0.9), ('ms', 500, 30000), ('err', 0, 1), ('drop', 0, 0.5)):
            if e.get(k) is not None and _num(e[k], lo, hi) is not None:
                ev['params'][k] = _num(e[k], lo, hi)
        if ev['type'] == 'node-down':
            kind = ALIASES.get(str(e.get('component') or e.get('defId') or '').strip().lower(), str(e.get('component') or e.get('defId') or '').strip().lower())
            if kind not in ECON:
                continue
            ev['params']['defId'] = kind
        events.append(ev)
    scn['events'] = events
    scn['title'] = level['title'] if level and not raw.get('title') else str(raw.get('title') or 'The tutor\'s design')[:80]
    return scn


def _ai_scenario(raw, scn):
    """An LLM system: questions a day per user, the mix of kinds, and quality, latency and safety targets."""
    ai = {}
    mix = raw.get('mix')
    if isinstance(mix, dict):
        ai['mix'] = {k: _num(v, 0, 1) for k, v in mix.items() if k in AI_KINDS and _num(v, 0, 1) is not None} or None
        if not ai['mix']:
            del ai['mix']
    for k, lo, hi in (('promptTokens', 50, 50000), ('topK', 1, 30), ('chunkTokens', 50, 4000), ('outTokens', 10, 4000), ('repeat', 0, 0.9)):
        if raw.get(k) is not None and _num(raw[k], lo, hi) is not None:
            ai[k] = _num(raw[k], lo, hi)
    per = _num(_count(raw.get('questions')) if raw.get('questions') is not None else (scn.get('traffic') or {}).get('ask', {}).get('perUser'), 0.001, 100, 0.05)
    slo = {'availability': 99, 'quality': 80, 'p95': 8000, **{k: v for k, v in (scn.get('slo') or {}).items() if k in ('availability', 'budget')}}
    for k, lo, hi in (('quality', 10, 100), ('p95', 500, 60000)):
        if raw.get(k) is not None and _num(raw[k], lo, hi) is not None:
            slo[k] = _num(raw[k], lo, hi)
    if raw.get('safety') is not None or 'injection' in (ai.get('mix') or {}):
        slo['safety'] = 0
    return {**scn, 'ai': ai, 'traffic': {'ask': {'perUser': per}, 'peak': 1.8}, 'slo': slo}


def clean(raw):
    """A design as the tutor wrote it -> {title, note, graph, scenario, level} or None."""
    if not isinstance(raw, dict):
        return None
    nodes, by = [], {}
    for n in (raw.get('nodes') or raw.get('components') or [])[:MAX_NODES]:
        if isinstance(n, str):
            n = {'id': n, 'kind': n}
        if not isinstance(n, dict) or not (n.get('kind') or n.get('id')):
            continue
        defid = str(n.get('kind') or n.get('type') or n['id']).strip().lower()
        defid = ALIASES.get(defid, defid)
        nid = board._slug(n.get('id') or defid)
        if defid not in ECON or not nid:
            continue
        if nid in by:                       # two boxes of one kind, unnamed: keep both
            nid = next(f'{nid}-{k}' for k in range(2, 99) if f'{nid}-{k}' not in by)
        cfg = _settings({k: v for k, v in n.items() if k not in ('id', 'kind', 'type', 'at')} | (n.get('settings') or {}), defid)
        node = {'id': nid, 'defId': defid, 'x': None, 'y': None}
        if cfg:
            node['cfg'] = cfg
        nodes.append(node)
        by[nid] = node
    if not any(n['defId'] == 'client' for n in nodes):
        nodes.insert(0, {'id': 'client', 'defId': 'client', 'x': None, 'y': None})
        by['client'] = nodes[0]
    edges, have = [], set()
    for e in raw.get('edges') or []:
        p = board._pair(e)
        if p and board._slug(p[0]) in by and board._slug(p[1]) in by and board._slug(p[0]) != board._slug(p[1]):
            a, b = board._slug(p[0]), board._slug(p[1])
            if (a, b) not in have:
                have.add((a, b))
                edges.append({'id': f'e{len(edges) + 1}', 'from': a, 'to': b})
    if len(nodes) < 2 or not edges:
        return None
    board.layout(nodes, [[e['from'], e['to'], ''] for e in edges])
    for n in nodes:
        n['x'], n['y'] = LEFT + n['x'] * GRID_X, TOP + n['y'] * GRID_Y
    settings = {'regions': int(_num(raw.get('regions'), 1, 3, 1)), 'crossRegion': 'sync' if raw.get('crossRegion') == 'sync' else 'async'}
    scn = _scenario(raw)
    if any(ECON[n['defId']].get('ai') for n in nodes) or raw.get('questions') or raw.get('mix'):
        scn = _ai_scenario(raw, scn)
    return {'title': scn['title'], 'note': board._text(raw.get('note') or raw.get('caption') or '', 240),
            'graph': {'nodes': nodes, 'edges': edges, 'settings': settings}, 'scenario': scn,
            'level': str(raw.get('level')) if str(raw.get('level') or '') in LEVELS else ''}


def extract(text):
    """-> (text without design blocks, [clean designs]); at most PER_MESSAGE kept."""
    designs = []
    for m in FENCE.finditer(text or ''):
        try:
            d = clean(yaml.safe_load(m.group(1)))
        except yaml.YAMLError:
            d = None
        if d and len(designs) < PER_MESSAGE:
            designs.append(d)
    return FENCE.sub('', text or ''), designs


def source(d):
    """A design back as YAML for the tutor's own history (positions dropped: they are automatic)."""
    g, scn = d['graph'], d['scenario']
    body = {'title': d['title']}
    if d.get('level'):
        body['level'] = d['level']
    else:
        body['users'] = scn.get('dau')
        if scn.get('ai') is not None:
            body['questions'] = scn['traffic']['ask']['perUser']
            body.update({k: v for k, v in scn['ai'].items()})
            body.update({k: scn['slo'][k] for k in ('quality', 'p95') if k in scn['slo']})
        elif scn.get('traffic'):
            body['traffic'] = scn['traffic']
    body['nodes'] = [{'id': n['id'], 'kind': n['defId'], **(n.get('cfg') or {})} for n in g['nodes']]
    body['edges'] = [[e['from'], e['to']] for e in g['edges']]
    if scn.get('events'):
        body['incidents'] = [{'type': e['type'], 'at': e['at'], 'dur': e['dur'], **e['params']} for e in scn['events']]
    return '```design\n' + yaml.safe_dump(body, sort_keys=False, allow_unicode=True, default_flow_style=None, width=1000) + '```'


def result_text(r):
    """A run he did, as the line the tutor reads. `r` is the browser's summary (validated in the API)."""
    objectives = '; '.join(f"{o['label']}: {o['actual']} (target {o['target']}, {'met' if o['pass'] else 'missed'})" for o in r.get('objectives', [])[:6])
    events = '; '.join(f"{e['label']} at {e['at']:02d}:00: {e['outcome']}" for e in r.get('events', [])[:4])
    finds = ' '.join(f"- {f}" for f in r.get('findings', [])[:4])
    changed = f" I changed the design first: {r['changes']}." if r.get('changes') else ' I ran it as you drew it.'
    return (f"(I ran \"{r.get('title') or 'the design'}\" in the simulator.{changed} Availability {r['availability']:.2f}%, "
            f"monthly bill ${round(r['cost']):,}. {objectives}.{' Incidents: ' + events + '.' if events else ''}"
            f"{' What the simulator flagged: ' + finds if finds else ''})")


def changes(before, after):
    """What he changed between the tutor's design and the one he ran, in a few words."""
    def count(g):
        out = {}
        for n in g.get('nodes', []):
            out[n['defId']] = out.get(n['defId'], 0) + 1
        return out
    a, b = count(before), count(after)
    added = [f'+{b[k] - a.get(k, 0)} {k}' for k in b if b[k] > a.get(k, 0)]
    removed = [f'-{a[k] - b.get(k, 0)} {k}' for k in a if a[k] > b.get(k, 0)]
    cfg_before = {n['id']: n.get('cfg') or {} for n in before.get('nodes', [])}
    resized = [f"{n['defId']} settings {json.dumps(n.get('cfg') or {}, separators=(',', ':'))}" for n in after.get('nodes', [])
               if n['id'] in cfg_before and (n.get('cfg') or {}) != cfg_before[n['id']]]
    edges = len({(e['from'], e['to']) for e in after.get('edges', [])} ^ {(e['from'], e['to']) for e in before.get('edges', [])})
    parts = added + removed + resized[:4] + ([f'{edges} connections changed'] if edges else [])
    return ', '.join(parts)[:400]


GUIDE = """## Simulator
You can also hand him a design to run in the design simulator: a fenced block tagged design, holding YAML. He opens it, can change it, and presses Run the day: 24 simulated hours of traffic through it, with incidents, a monthly bill and what broke. You'll get his result as his next message. Use it for claims about load, capacity, failure and cost ("what happens to the database when the cache is flushed at peak?"), where the run settles it better than talk. It models traffic, capacity, failures and cost, not correctness or ordering (it can't show a lost update or a duplicate message), so don't use it for those. At most one per message, rarely: it's a five-minute detour for him.
```design
title: Redirects behind a cache
users: 2000000
traffic: {{read: {{perUser: 150, cacheable: 0.9}}, write: {{perUser: 3}}}}
nodes:
  - {{id: lb, kind: load-balancer}}
  - {{id: app, kind: app-server, size: m, instances: 4}}
  - {{id: cache, kind: cache}}
  - {{id: db, kind: db-sql, size: m, replicas: 1}}
edges: [[client, lb], [lb, app], [app, cache], [app, db]]
incidents:
  - {{type: cache-flush, at: 19, dur: 1}}
```
- kind: one of {components}. A client is added if you leave it out.
- Settings per component where it has them: size (tier), instances, zones (1-3), replicas, shards, autoscale (max instances), timeouts, canary, hotKey, coalesce (true/false).
- Traffic: users and per-user daily requests by type ({traffic}), or level: a Ripple Ops level id to borrow its traffic and targets ({levels}).
- incidents (up to {events_max}): type is one of {events}; at (hour 0-23), dur (hours), and mult (surge, ddos, partner-burst), share (hot-key 0.05-0.6), ms (slow-dependency), err (bad-deploy 0-1) or component (node-down: the kind of component that stops answering, e.g. dns or service-discovery) where they apply.
- An LLM system (a RAG bot, an agent with tools): use the AI parts ({ai_parts}), options grounded, cachePrefix (models), fresh (vector-db), confirm and scoped (tool-gateway). Give users, questions (per user a day), optionally mix (shares of {ai_kinds}), quality (target %) and p95 (ms). The run then scores answers right, errors, latency, harmful actions and the token bill. AI incidents: model-update, rate-limit, provider-outage, injection-campaign, doc-change."""


def guide():
    return GUIDE.format(components=', '.join(c for c in COMPONENTS if not ECON[c].get('ai')), traffic=', '.join(TRAFFIC), levels=', '.join(LEVELS),
                        events=', '.join(EVENTS[:12] + ('node-down',)), events_max=MAX_EVENTS, ai_parts=', '.join(c for c in COMPONENTS if ECON[c].get('ai')), ai_kinds=', '.join(AI_KINDS))
