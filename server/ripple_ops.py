"""Ripple Ops: the design builder as a game. /api/ripple/...

The simulation runs in the browser (web/src/legacy/sd-sim.js) and is pure; this module keeps what must
outlive a tab and connects a run to the rest of the course:
- Runs are raw data (the graph you drew, what the engine said, your estimates and notes), stored
  once each with the engine version. Progress, unlocks and the daily streak are derived from them.
- A run is evidence for the knowledge model (source "ripple", soft, depth "apply"): each concept the
  level tests is clean when the level was beaten without a failure on it; a failure on a concept is
  a miss on its points and opens a gap the tutor and the drip will ask about.
- Clearing a campaign level for the first time becomes a story event, so the tutor knows Ripple
  survived its viral evening because of a design you drew.
- The model plays the cast: Priya's post-mortem, Marcus's design review (which can call a what-if
  incident for the browser to run), an interviewer with a scored write-up, and generated levels.
  All of it needs the model; without one the game itself still works, minus those voices.
"""
import asyncio
import datetime as dt
import json
import logging
import os
import re
import time
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth, config, llm, voice
from .knowledge_base import api as kb_api, catalog as kcat, model as kmodel
from .store import get_store
from .tutor import story

log = logging.getLogger(__name__)
router = APIRouter(prefix='/api/ripple', tags=['ripple'])
HERE = os.path.dirname(os.path.abspath(__file__))
CAMPAIGN_PATH = os.path.join(HERE, '..', 'web', 'public', 'simulators', 'ripple.json')
ECON_PATH = os.path.join(HERE, '..', 'web', 'public', 'simulators', 'economics.json')
SOURCE = 'ripple'
RUNS, DRAFTS, GENERATED, REVIEWS = 'ripple_runs', 'ripple_drafts', 'ripple_scenarios', 'ripple_reviews'
PROMPT_VERSION = 4
KEY = r'^[A-Za-z0-9_-]{1,80}$'
UNAVAILABLE = 'This needs the model, which is not connected. The simulator itself still works.'
FAILED = 'The model could not answer just now. Try again in a moment.'
EVENT_TYPES = ['surge', 'hot-key', 'cache-flush', 'cache-node', 'az-outage', 'region-outage', 'db-failover', 'bad-deploy',
               'slow-dependency', 'poison-message', 'ddos', 'partner-burst']
COMPONENTS_LATE = ['client', 'app-server', 'db-sql', 'dns', 'load-balancer', 'cache', 'monitoring', 'cdn', 'consistent-hash',
                   'api-gateway', 'rate-limiter', 'auth-service', 'message-queue', 'worker', 'dead-letter-queue', 'object-store',
                   'external-service', 'notification-service', 'email-server', 'db-timeseries', 'olap', 'db-nosql', 'block-storage',
                   'id-generator', 'service-discovery', 'search-engine', 'geospatial', 'recommendation', 'stream-processor',
                   'websocket-server', 'db-graph', 'payment', 'reconciliation', 'spam-filter', 'matching-engine']


def _load(path=CAMPAIGN_PATH):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


CAMPAIGN = _load()
ECON = _load(ECON_PATH)['components']
LEVELS = {l['id']: l for l in CAMPAIGN['levels']}
CONCEPTS = CAMPAIGN['concepts']


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


# ---------- pure: progress, unlocks, streak, evidence ----------

def progress(levels, runs):
    """Best stars per level and what is unlocked. A level opens when the one before it was survived (1★)."""
    by = {}
    for r in runs:
        lid = r.get('level')
        if not lid or r.get('daily') or r.get('whatif'):
            continue
        p = by.setdefault(lid, {'best': 0, 'attempts': 0, 'last_at': 0, 'best_cost': None})
        p['attempts'] += 1
        p['last_at'] = max(p['last_at'], r.get('at') or 0)
        if (r.get('stars') or 0) > p['best'] or (r.get('stars') == p['best'] and p['best_cost'] is not None and (r.get('cost') or 0) < p['best_cost']):
            p['best'], p['best_cost'] = r.get('stars') or 0, r.get('cost')
        if p['best_cost'] is None:
            p['best_cost'] = r.get('cost')
    unlocked = [l['id'] for l in levels if not l.get('after') or by.get(l['after'], {}).get('best', 0) >= 1]
    stars = sum(p['best'] for p in by.values() if p['best'])
    main = [l for l in levels if not l.get('side')]
    cleared = sum(1 for l in main if by.get(l['id'], {}).get('best', 0) >= 2)
    return {'levels': by, 'unlocked': unlocked, 'stars': stars, 'max_stars': 3 * len(levels), 'cleared': cleared, 'main': len(main)}


def streak(runs, today):
    """Consecutive days, ending today or yesterday, with a daily incident survived."""
    days = {r['daily'] for r in runs if r.get('daily') and (r.get('stars') or 0) >= 1}
    d = dt.date.fromisoformat(today)
    if d.isoformat() not in days:
        d -= dt.timedelta(days=1)
    n = 0
    while d.isoformat() in days:
        n += 1
        d -= dt.timedelta(days=1)
    return n


def evidence(level, run, concepts, now, catalog=None):
    """Knowledge events and gaps from one run. -> (events, gaps). Unknown points are dropped."""
    canon = (lambda p: kcat.canonical(catalog, p)) if catalog else (lambda p: p)
    bad = {}
    for f in run.get('findings') or []:
        if f.get('level') == 'bad' and f.get('concept') in concepts:
            bad.setdefault(f['concept'], f)
    beaten = (run.get('stars') or 0) >= 2
    tested = list(dict.fromkeys(list(level.get('concepts') or []) + list(bad)))
    events, gaps = [], []
    for c in tested:
        pts = [p for p in (canon(p) for p in concepts[c]['points']) if p]
        if not pts:
            continue
        clean = beaten and c not in bad
        ev = {'key': f"{run['id']}-{c}"[:64], 'kind': 'answer', 'points': pts, 'clean': clean, 'depth': 'apply', 'strength': 'soft',
              'at': now, 'note': f"Ripple Ops: {level.get('title', level.get('id'))}", 'ref': f"ripple:{level.get('id')}"}
        if not clean:
            ev['failed'] = pts if c in bad else []
            ev['partial'] = c not in bad      # tested but not the cause: weaker than a miss
        events.append(ev)
        if c in bad:
            gaps.append({'key': f"{run['id']}-gap-{c}"[:64], 'point': pts[0], 'text': f"In Ripple Ops ({level.get('title')}): {bad[c]['text']}"[:500],
                         'ask': concepts[c].get('ask', '')})
    est = run.get('estimates') or []
    if est:
        pts = [p for p in (canon(p) for p in concepts['estimates']['points']) if p]
        ok = all(e.get('verdict') == 'good' for e in est)
        if pts:
            events.append({'key': f"{run['id']}-est"[:64], 'kind': 'answer', 'points': pts, 'clean': ok, 'depth': 'apply',
                           'strength': 'soft', 'at': now, 'partial': not ok and any(e.get('verdict') != 'off' for e in est),
                           'failed': [] if ok else pts, 'note': 'Ripple Ops estimates', 'ref': f"ripple:{level.get('id')}"})
    return events, gaps


def story_line(level, run):
    """What the tutor remembers when a campaign level is first beaten."""
    cost = run.get('cost') or 0
    money = f"${cost / 1000:.1f}k" if cost >= 1000 else f"${cost:.0f}"
    return (f"Ripple Ops: Nikhil got Ripple through \"{level['title']}\" ({level.get('tier', '')}, {level.get('users', '')}) "
            f"with {run.get('stars')}★, {run.get('availability', 0):.2f}% availability for {money} a month.")


def graph_text(graph, limit=60):
    """A drawn design as short lines a model can read."""
    nodes = {n['id']: n for n in (graph or {}).get('nodes', [])[:limit]}
    out = []
    for n in nodes.values():
        cfg = {k: v for k, v in (n.get('cfg') or {}).items() if v not in (None, False, '', 0)}
        out.append(f"- {n['id']}: {n['defId']}" + (f" {json.dumps(cfg, separators=(',', ':'))}" if cfg else ''))
    edges = [f"{e['from']}->{e['to']}" for e in (graph or {}).get('edges', []) if e.get('from') in nodes and e.get('to') in nodes]
    st = (graph or {}).get('settings') or {}
    tail = f"\nRegions: {st.get('regions', 1)}, cross-region replication: {st.get('crossRegion', 'async')}" if st.get('regions', 1) > 1 else ''
    return '\n'.join(out) + ('\nConnections: ' + ', '.join(edges) if edges else '\nNo connections.') + tail


def _tier(spec, cfg):
    """The tier a node runs on, as sd-sim.js picks it: its chosen one, else the default, else the second."""
    tiers = spec.get('tiers') or []
    pick = next((t for t in tiers if t['id'] == (cfg or {}).get('tier')), None)
    return pick or next((t for t in tiers if t['id'] == spec.get('default')), None) or (tiers[min(1, len(tiers) - 1)] if tiers else None)


def sizing_text(graph, econ):
    """Each node's size, price and capacity, and whether anything cheaper exists, so feedback never asks him to shrink the floor."""
    out = []
    for n in (graph or {}).get('nodes', [])[:60]:
        spec = econ.get(n.get('defId')) or {}
        t = _tier(spec, n.get('cfg'))
        if not t:
            continue
        count = int((n.get('cfg') or {}).get('count') or 1)
        cap = ', '.join(f"{t[k]:,} {u}" for k, u in (('rps', 'requests/s'), ('reads', 'reads/s'), ('writes', 'writes/s')) if t.get(k))
        cheaper = [x for x in spec.get('tiers') or [] if (x.get('usd') or 0) < (t.get('usd') or 0)]
        floor = ('the only option' if len(spec.get('tiers') or []) == 1 else 'the smallest size there is') if not cheaper and count == 1 else \
            (f"{count} of them" if not cheaper else f"smaller sizes exist: {', '.join(x['id'] for x in cheaper)}")
        out.append(f"- {n['id']} {n['defId']}: {t.get('label') or t['id']} at ${t.get('usd', 0):,} a month each"
                   + (f" × {count}" if count > 1 else '') + (f", about {cap} each" if cap else '') + f"; {floor}")
    return '\n'.join(out) or 'Nothing sized.'


def reference_diff(graph, solution):
    """His design against the level's reference, by component kind (ids and positions don't matter).
    -> {'extra': [defId], 'missing': [defId], 'sized': [(defId, his cfg, reference cfg)], 'links_extra': [...], 'links_missing': [...]}"""
    def kinds(g):
        by = {}
        for n in (g or {}).get('nodes', []):
            by.setdefault(n.get('defId'), []).append({k: v for k, v in (n.get('cfg') or {}).items() if v not in (None, False, '', 0)})
        return by

    def links(g):
        ids = {n['id']: n.get('defId') for n in (g or {}).get('nodes', [])}
        return {(ids[e['from']], ids[e['to']]) for e in (g or {}).get('edges', []) if e.get('from') in ids and e.get('to') in ids}

    mine, ref = kinds(graph), kinds(solution)
    extra = [k for k in mine for _ in range(len(mine[k]) - len(ref.get(k, [])))]
    missing = [k for k in ref for _ in range(len(ref[k]) - len(mine.get(k, [])))]
    sized = [(k, a, b) for k in mine if k in ref for a, b in zip(mine[k], ref[k]) if a != b]
    lm, lr = links(graph), links(solution)
    return {'extra': extra, 'missing': missing, 'sized': sized,
            'links_extra': sorted(f"{a}->{b}" for a, b in lm - lr), 'links_missing': sorted(f"{a}->{b}" for a, b in lr - lm)}


def reference_text(diff):
    d, cfg = diff, lambda c: json.dumps(c, separators=(',', ':')) if c else 'defaults'
    lines = [f"- He added {k}; the reference has no {k}." for k in d['extra']] + \
            [f"- The reference has {k}; his design doesn't." for k in d['missing']] + \
            [f"- {k}: his {cfg(a)}, the reference {cfg(b)}." for k, a, b in d['sized']] + \
            [f"- Connection {x} is his only." for x in d['links_extra']] + [f"- Connection {x} is only in the reference." for x in d['links_missing']]
    return '\n'.join(lines) or 'Same components, sizes and connections as the reference.'


def level_text(l):
    slo = l.get('slo') or {}
    lines = [f"Level: {l.get('title')} ({l.get('tier', '')}, {l.get('users', '')}). {l.get('kicker', '')}",
             f"Goal: {l.get('goal', '')}",
             f"Targets: availability {slo.get('availability', 99.9)}%" + ''.join(f", {k} p99 ≤ {v} ms" for k, v in (slo.get('p99') or {}).items())
             + (f", budget ${slo['budget']:,}/month" if slo.get('budget') else '') + (', no lost writes' if slo.get('noLoss') else '')
             + (f", background work within {slo['lagMin']} min" if slo.get('lagMin') is not None else '')
             + (f", {slo.get('quality')}% of questions answered correctly, p95 ≤ {slo.get('p95', 8000) / 1000:.1f} s" if l.get('ai') else '')
             + (', no harmful actions' if l.get('ai') and slo.get('safety') is not None else ''),
             'Incidents: ' + ('; '.join(f"{e.get('label', e['type'])} at {e.get('at', 0):02d}:00" for e in l.get('events') or []) or 'none')]
    if l.get('ai'):
        mix = (l['ai'].get('mix') or {})
        lines.insert(2, 'An AI support assistant (Ripple Assist), simulated by ai-sim.js: ' + ', '.join(f'{round(v * 100)}% {k}' for k, v in mix.items() if v)
                     + '. Components are models, retrieval, routing, guardrails, tools and evals; cost is mostly tokens.')
    return '\n'.join(lines)


def reasoning_text(notes, timeline, limit=40):
    """His reasoning, and when he said each part: what he added, and the design at that moment when it had changed."""
    entries = [e for e in (timeline or []) if (e.get('said') or '').strip()][-limit:]
    if not entries:
        return (notes or '').strip() or 'None written.'
    t0, out = entries[0].get('at') or 0, []
    for e in entries:
        m, s = divmod(max(0, int((e.get('at') or 0) - t0)), 60)
        out.append(f"[+{m}:{s:02d}]{' (reworded)' if e.get('revised') else ''} \"{e['said'].strip()}\"")
        if e.get('graph'):
            out.append('  Design then:\n' + '\n'.join('  ' + l for l in graph_text(e['graph']).split('\n')))
    return f"Final notes:\n{(notes or '').strip() or '(empty)'}\n\nAs he said it, with the design at that moment:\n" + '\n'.join(out)


def run_text(run):
    if not run:
        return 'No simulation run yet.'
    obj = '; '.join(f"{o['label']}: {o['actual']} (target {o['target']}) {'PASS' if o['pass'] else 'FAIL'}" for o in run.get('objectives') or [])
    ev = '; '.join(f"{e['label']}: {e['outcome']}" for e in run.get('events') or [])
    fx = '\n'.join(f"- [{f['level']}] {f['text']}" for f in (run.get('findings') or [])[:10])
    bill = ', '.join(f"{i['defId']} ${round(i['usd']):,}" for i in (run.get('bill') or [])[:6])
    return f"Stars: {run.get('stars')}/3. {obj}\nIncidents: {ev or 'none'}\nBill: {bill}\nFindings:\n{fx or '- none'}"


def parse_whatif(text):
    """[[whatif az-outage at=14 dur=2 mult=4 share=0.3 ms=5000]] -> (visible text, event or None)."""
    m = re.search(r'\[\[\s*whatif\s+([a-z-]+)([^\]]*)\]\]', text or '')
    clean = re.sub(r'\[\[[^\]]*\]\]', '', text or '').strip()
    if not m or m.group(1) not in EVENT_TYPES:
        return clean, None
    args = dict(re.findall(r'(\w+)=([\d.]+)', m.group(2)))
    num = lambda k, d, lo, hi: max(lo, min(hi, float(args.get(k, d))))
    ev = {'id': 'whatif', 'type': m.group(1), 'at': int(num('at', 19, 0, 23)), 'dur': int(num('dur', 1, 1, 6)), 'params': {}}
    for k, lo, hi in (('mult', 1.5, 50), ('share', 0.05, 0.9), ('ms', 500, 30000), ('err', 0, 1)):
        if k in args:
            ev['params'][k] = num(k, 0, lo, hi)
    return clean, ev


# ---------- models ----------

class Finding(BaseModel):
    id: str = Field(max_length=120)
    level: Literal['bad', 'warn', 'tip', 'good']
    concept: str = Field(default='', max_length=40)
    text: str = Field(max_length=600)
    who: str = Field(default='', max_length=20)


class Objective(BaseModel):
    id: str = Field(max_length=40)
    label: str = Field(max_length=120)
    target: str = Field(max_length=40)
    actual: str = Field(max_length=40)
    passed: bool = Field(alias='pass')


class EventOutcome(BaseModel):
    id: str = Field(max_length=60)
    type: str = Field(max_length=30)
    label: str = Field(max_length=120)
    at: int = 0
    outcome: Literal['handled', 'degraded', 'outage']


class Estimate(BaseModel):
    key: str = Field(max_length=40)
    answer: Optional[float] = None
    truth: float
    verdict: Literal['good', 'close', 'off']


class BillItem(BaseModel):
    id: str = Field(max_length=40)
    defId: str = Field(max_length=40)
    usd: float
    detail: str = Field(default='', max_length=200)


class Said(BaseModel):
    at: float
    said: str = Field(max_length=2000)
    revised: bool = False
    graph: Optional[dict] = None


class RunIn(BaseModel):
    key: str = Field(pattern=KEY, description='Idempotency key from the browser: a retried post stores once.')
    level: str = Field(max_length=80)
    daily: Optional[str] = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    generated: bool = False
    whatif: bool = False
    engine: int = 1
    stars: int = Field(ge=0, le=3)
    availability: float
    cost: float
    objectives: list[Objective] = Field(default_factory=list, max_length=20)
    events: list[EventOutcome] = Field(default_factory=list, max_length=20)
    findings: list[Finding] = Field(default_factory=list, max_length=60)
    bill: list[BillItem] = Field(default_factory=list, max_length=60)
    estimates: list[Estimate] = Field(default_factory=list, max_length=8)
    graph: dict
    notes: str = Field(default='', max_length=20000)
    timeline: list[Said] = Field(default_factory=list, max_length=40)


class DraftIn(BaseModel):
    graph: dict
    notes: str = Field(default='', max_length=20000)
    timeline: list[Said] = Field(default_factory=list, max_length=40)


class RefPoint(BaseModel):
    point: str = Field(max_length=60, description='The component or choice, e.g. "DNS" or "Database size".')
    verdict: Literal['extra', 'missing', 'different', 'same']
    why: str = Field(max_length=600, description='Why the reference does it that way. Where his reasoning covers this choice, name his reason and say exactly where it holds or breaks. 1-3 sentences.')


class Debrief(BaseModel):
    priya: str = Field(description="Priya's incident review: what failed first, why, and what it cost users. 2-4 sentences.")
    marcus: str = Field(description="Marcus on the money: what the bill says about the design, what is oversized or missing. 1-3 sentences.")
    jo: str = Field(description="Jo's honest 'wait, why?' question that checks Nikhil understands the key concept of this run, for him to think over (he can't reply here). One question.")
    reference: list[RefPoint] = Field(default_factory=list, max_length=6, description='Only when a reference comparison is given: one entry per difference, biggest first; one "same" entry if there are none. Otherwise empty.')
    next: list[str] = Field(default_factory=list, max_length=3, description='Up to three concrete things to try next, without handing over a full design.')
    weak: list[str] = Field(default_factory=list, max_length=4, description='Concept ids from the list given that this run shows are weak.')


class Msg(BaseModel):
    role: Literal['user', 'assistant', 'note']
    text: str = Field(max_length=4000)


class ReviewIn(BaseModel):
    level: str = Field(max_length=80)
    mode: Literal['review', 'interview'] = 'review'
    graph: dict
    run: Optional[dict] = None
    messages: list[Msg] = Field(default_factory=list, max_length=80)
    scenario: Optional[dict] = None
    notes: str = Field(default='', max_length=20000)
    timeline: list[Said] = Field(default_factory=list, max_length=40)


class Evaluation(BaseModel):
    verdict: Literal['strong hire', 'hire', 'lean hire', 'lean no hire', 'no hire']
    summary: str = Field(description='Two or three sentences, to Nikhil, on how the interview went.')
    strengths: list[str] = Field(default_factory=list, max_length=4)
    gaps: list[str] = Field(default_factory=list, max_length=4)
    weak: list[str] = Field(default_factory=list, max_length=4, description='Concept ids from the list given.')
    strong: list[str] = Field(default_factory=list, max_length=6, description='Concept ids from the list given that he clearly handled.')


class GenEvent(BaseModel):
    type: Literal['surge', 'hot-key', 'cache-flush', 'cache-node', 'az-outage', 'region-outage', 'db-failover', 'bad-deploy',
                  'slow-dependency', 'poison-message', 'ddos', 'partner-burst']
    at: int = Field(ge=0, le=23)
    dur: int = Field(default=1, ge=1, le=4)
    mult: float = Field(default=0, ge=0, le=30, description='surge, ddos, partner-burst: traffic multiple')
    share: float = Field(default=0, ge=0, le=0.6, description='hot-key: share of reads on one key')
    ms: float = Field(default=0, ge=0, le=15000, description='slow-dependency: provider latency in ms')
    label: str = Field(max_length=80)
    who: Literal['marcus', 'priya', 'jo', 'sam']
    line: str = Field(max_length=200, description='What that cast member says when it happens.')


class GenType(BaseModel):
    perUser: float = Field(ge=0, le=5000)
    kb: float = Field(default=1, ge=0.05, le=200000)


class GenRead(GenType):
    cacheable: float = Field(default=0.9, ge=0, le=0.99)
    workingSetGb: float = Field(default=5, ge=0.01, le=2000)


class GenJob(BaseModel):
    kind: Literal['process', 'notify', 'analytics', 'fanout', 'index']
    per: float = Field(default=1, ge=0.01, le=10)
    ms: float = Field(default=200, ge=1, le=120000)
    fanout: float = Field(default=1, ge=1, le=1000)


class GenWrite(GenType):
    jobs: list[GenJob] = Field(default_factory=list, max_length=3)


class GenTraffic(BaseModel):
    read: Optional[GenRead] = None
    write: Optional[GenWrite] = None
    media: Optional[GenType] = None
    search: Optional[GenType] = None
    realtime: Optional[GenType] = None
    geo: Optional[GenType] = None
    payment: Optional[GenType] = None
    peak: float = Field(default=2.2, ge=1.3, le=4)


class GenLine(BaseModel):
    who: Literal['marcus', 'priya', 'jo', 'sam']
    text: str = Field(max_length=400)


class GenScenario(BaseModel):
    title: str = Field(max_length=60)
    kicker: str = Field(max_length=160)
    goal: str = Field(max_length=200)
    users: str = Field(max_length=30, description='e.g. "3M users"')
    brief: list[GenLine] = Field(min_length=2, max_length=4)
    dau: int = Field(ge=1000, le=300_000_000)
    traffic: GenTraffic
    data_gb: float = Field(ge=1, le=100000)
    media_gb: float = Field(default=0, ge=0, le=5_000_000)
    far_share: float = Field(default=0, ge=0, le=0.7)
    availability: float = Field(ge=99, le=99.99)
    p99: dict[str, int] = Field(description='request type -> target ms, for types in traffic')
    budget: int = Field(ge=100, le=2_000_000)
    lag_min: Optional[int] = Field(default=None, ge=1, le=120)
    no_loss: bool = False
    events: list[GenEvent] = Field(min_length=1, max_length=4)
    concepts: list[str] = Field(min_length=1, max_length=4)
    hints: list[str] = Field(min_length=3, max_length=3)
    debrief: str = Field(max_length=300)


class GenerateIn(BaseModel):
    focus: str = Field(default='', max_length=300, description='A concept id or free text: what the level should exercise.')
    size: Literal['startup', 'scale-up', 'giant'] = 'scale-up'


# ---------- helpers ----------

def _runs(store):
    return sorted(store.list_knowledge(RUNS), key=lambda r: r.get('at') or 0)


def _today(store):
    tz = (store.get_settings() or {}).get('timezone') or 'Europe/London'
    try:
        from zoneinfo import ZoneInfo
        return dt.datetime.now(ZoneInfo(tz)).date().isoformat()
    except Exception:
        return dt.date.today().isoformat()


def _company(store, now):
    c, _, states, seen, mis = kb_api.evidence(store, now)
    sc = story.scale(kmodel.summary(c, states, seen, mis, now))
    return {'name': story.BIBLE['company'], 'label': sc['label'], 'users': sc['users'], 'next': sc['next']}


def _remember(store, text, now):
    st = {k: v for k, v in (store.get_knowledge('tutor_memory', 'story') or {}).items() if k != '_key'}
    st['events'] = story.remember(st.get('events'), text, now)
    store.put_knowledge('tutor_memory', 'story', st)


def _level(store, lid, scenario=None):
    if lid in LEVELS:
        return LEVELS[lid]
    if lid.startswith('daily-') and scenario:
        return scenario
    found = store.get_knowledge(GENERATED, lid)
    if found:
        return found
    if scenario:
        return scenario
    raise HTTPException(404, 'Unknown level')


def _summary_row(r):
    return {k: r.get(k) for k in ('id', 'level', 'daily', 'generated', 'whatif', 'at', 'stars', 'availability', 'cost', 'events', 'objectives')} | {
        'debrief': bool(r.get('debrief')), 'bad': sum(1 for f in r.get('findings') or [] if f.get('level') == 'bad')}


def _cast():
    return '\n'.join(f"- {voice.persona(c)}" for c in ('marcus', 'priya', 'jo', 'sam'))


# ---------- endpoints ----------

@router.get('')
def overview(store=Depends(store_for)):
    """Campaign progress, today's incident, the streak and the company's size."""
    now, runs = time.time(), _runs(store)
    today = _today(store)
    p = progress(CAMPAIGN['levels'], runs)
    done_today = [r for r in runs if r.get('daily') == today]
    gens = sorted(store.list_knowledge(GENERATED), key=lambda g: -(g.get('created_at') or 0))
    gen_best = {}
    for r in runs:
        if r.get('generated'):
            gen_best[r['level']] = max(gen_best.get(r['level'], 0), r.get('stars') or 0)
    return {'enabled': llm.enabled(store.get_settings()), 'progress': p, 'today': today,
            'daily': {'date': today, 'done': bool(done_today), 'best': max((r.get('stars') or 0 for r in done_today), default=None)},
            'streak': streak(runs, today), 'company': _company(store, now),
            'recent': [_summary_row(r) for r in runs[-8:]][::-1],
            'generated': [{'id': g['_key'], 'title': g.get('title'), 'kicker': g.get('kicker'), 'users': g.get('users'), 'created_at': g.get('created_at'),
                           'best': gen_best.get(g['_key'])} for g in gens[:12]]}


@router.post('/runs')
def record_run(body: RunIn, store=Depends(store_for)):
    """Store a run once, count it as evidence, and remember a first clear in the story."""
    now = time.time()
    rid = f'run-{body.key}'
    if store.get_knowledge(RUNS, rid):
        return {'id': rid, 'duplicate': True, 'progress': progress(CAMPAIGN['levels'], _runs(store))}
    level = _level(store, body.level, None if body.level in LEVELS else {'id': body.level, 'title': body.level, 'concepts': []})
    before = progress(CAMPAIGN['levels'], _runs(store))
    doc = body.model_dump(by_alias=True)
    doc.update(id=rid, at=now, title=level.get('title'))
    store.create_knowledge(RUNS, rid, doc)
    recorded, gaps = 0, []
    if not body.whatif:
        events, gaps = evidence(level, doc, CONCEPTS, now, kcat.CATALOG)
        if events:
            recorded, _ = kb_api.write_events(store, SOURCE, events, now)
        for gp in gaps:
            kb_api.open_gap(store, SOURCE, gp['key'], gp['point'], gp['text'], gp['ask'], '', now)
    after = progress(CAMPAIGN['levels'], _runs(store))
    first = body.level in LEVELS and not body.daily and not body.whatif and body.stars >= 2 and before['levels'].get(body.level, {}).get('best', 0) < 2
    if first:
        _remember(store, story_line(level, doc), now)
    newly = [l for l in after['unlocked'] if l not in before['unlocked']]
    return {'id': rid, 'duplicate': False, 'evidence': recorded, 'gaps': len(gaps), 'first_clear': first, 'unlocked': newly, 'progress': after}


@router.get('/runs')
def list_runs(level: str = '', limit: int = 20, store=Depends(store_for)):
    runs = [r for r in _runs(store) if not level or r.get('level') == level][-max(1, min(limit, 100)):]
    return {'runs': [_summary_row(r) for r in runs][::-1]}


@router.get('/runs/{rid}')
def get_run(rid: str, store=Depends(store_for)):
    r = store.get_knowledge(RUNS, rid)
    if not r:
        raise HTTPException(404, 'Unknown run')
    return r


@router.get('/drafts/{level}')
def get_draft(level: str, store=Depends(store_for)):
    d = store.get_knowledge(DRAFTS, level[:80])
    return d or {'graph': None, 'notes': ''}


@router.put('/drafts/{level}')
def put_draft(level: str, body: DraftIn, store=Depends(store_for)):
    if len(json.dumps(body.graph)) > 200_000 or len(json.dumps([t.model_dump() for t in body.timeline])) > 400_000:
        raise HTTPException(413, 'That design is too big to save')
    return store.put_knowledge(DRAFTS, level[:80], {'graph': body.graph, 'notes': body.notes,
                                                    'timeline': [t.model_dump() for t in body.timeline], 'at': time.time()})


@router.post('/runs/{rid}/debrief')
async def debrief(rid: str, store=Depends(store_for)):
    """The cast's take on one run, written once and kept with it."""
    r = store.get_knowledge(RUNS, rid)
    if not r:
        raise HTTPException(404, 'Unknown run')
    if r.get('debrief', {}).get('prompt_version') == PROMPT_VERSION:
        return r['debrief']
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    level = _level(store, r['level'], {'id': r['level'], 'title': r.get('title'), 'concepts': []})
    history = [x for x in _runs(store) if x.get('level') == r['level'] and x['_key'] != rid][-5:]
    solution = None if r.get('daily') or r.get('generated') else level.get('solution')
    earlier = any(not x.get('whatif') and not x.get('daily') and (x.get('at') or 0) <= (r.get('at') or 0) for x in history)
    reveal = bool(solution) and ((r.get('stars') or 0) >= 2 or earlier)   # as the browser shows the reference button
    system = (f"{voice.FEEDBACK}\n\nYou write the post-run debrief in Ripple Ops, a system design game set at Ripple, the startup where "
              f"Nikhil is lead engineer. Three of the cast speak, each in character and always on his side:\n{_cast()}\n\n"
              "Ground every claim in the simulation results given; never invent numbers. Explain the mechanism (why that component broke, "
              "why that line of the bill is big) so he learns the concept, not just the fix. If he beat the level, say what was good and "
              "push on cost or a trade-off. Don't hand him a complete design.\n\n"
              "Sizing: 'sizes' says what each component costs, what it can carry and whether anything cheaper exists. Never suggest "
              "shrinking a component that is already the smallest size there is: if it is still the biggest line on the bill, say that is "
              "the floor price of having one at all. A capacity he mentions (\"handles 500 a second\") is not a traffic estimate: compare "
              "capacity with the peak load, don't confuse the two.\n\n"
              "His reasoning is what he said or typed while designing; it may be dictated and rough. Use it: when a choice rests on a "
              "reason he gave, address that reason directly.\n\n"
              + ("Reference: 'reference_diff' compares his design with the level's reference design, which he can now see. The cast "
                 "don't know the reference exists: priya, marcus and jo must never mention or allude to a reference design, only judge his design on "
                 "its own merits. Fill 'reference' (a separate, neutral comparison shown elsewhere) with one entry per difference that matters: why the reference does it that way, and where his stated "
                 "reasoning was right, partly right or off. Be precise and fair (for example, DNS round-robin does spread load, but "
                 "it can't health-check, drain or react in seconds, and caches hide changes). Extras that cost little are still worth "
                 "explaining: every box is something to run, monitor and pay for, and the habit is to add only what a requirement needs."
                 if reveal else "No reference comparison this time: leave 'reference' empty and don't describe the reference design."))
    prompt = json.dumps({'level': level_text(level), 'design': graph_text(r.get('graph')), 'sizes': sizing_text(r.get('graph'), ECON),
                         'result': run_text(r), **({'reference_design': graph_text(solution), 'reference_diff': reference_text(reference_diff(r.get('graph'), solution))} if reveal else {}),
                         'his_reasoning': reasoning_text(r.get('notes'), r.get('timeline')), 'estimates': r.get('estimates') or [],
                         'earlier_attempts': [{'stars': h.get('stars'), 'cost': round(h.get('cost') or 0)} for h in history],
                         'concepts': {k: v['label'] for k, v in CONCEPTS.items()}}, ensure_ascii=False)
    try:
        raw = await asyncio.to_thread(llm._raw_generate, 'openrouter', config.TUTOR_NOTES_MODEL, system, prompt, Debrief,
                                      options={'effort': 'low', 'max_tokens': 3500, 'timeout': 60})
        d = Debrief.model_validate_json(raw).model_dump()
    except Exception as exc:
        log.warning('Ripple debrief failed: %s', type(exc).__name__)
        raise HTTPException(502, FAILED)
    d = {**{k: voice.plain(v) if isinstance(v, str) else v for k, v in d.items()}, 'weak': [c for c in d['weak'] if c in CONCEPTS],
         'reference': [{**p, 'point': voice.plain(p['point']), 'why': voice.plain(p['why'])} for p in d['reference']] if reveal else [],
         'prompt_version': PROMPT_VERSION, 'at': time.time()}
    store.put_knowledge(RUNS, rid, {**{k: v for k, v in r.items() if k != '_key'}, 'debrief': d})
    return d


REVIEW = """You are {who}, in a design review of the architecture Nikhil drew for Ripple. {persona}

The level he is playing:
{level}

His design right now:
{design}

The last simulation of it:
{run}

How you run the review:
- One probing question or challenge at a time, about a specific choice in his design (a component, a size, a missing piece, a trade-off). Push like a demanding but fair reviewer: "what happens when...", "why that and not...", "what does that cost at 10x?".
- Judge his answers on the idea. When he's right, say so briefly and move to the next weakness. When he's wrong or vague, ask the follow-up that exposes it; don't lecture.
- You can make the simulator run an incident against his design to settle an argument. To do that, end your message with one tag on its own line: [[whatif TYPE at=HOUR dur=HOURS ...]] where TYPE is one of {events}. Optional numbers: mult= (surge, ddos, partner-burst), share= (hot-key, 0.05-0.6), ms= (slow-dependency), err= (0-1). Use it when he claims the design survives something. The app runs it and the next message starts with a note of what happened.
- Keep messages short: two to five sentences. No headings, no lists unless he asks. No em dashes.
- Stay in character the whole time."""

INTERVIEW = """You are a senior engineer at a large tech company running a 45-minute system design interview with Nikhil, a candidate for a senior backend role. You are friendly, neutral and rigorous. You never give away answers.

The problem is the Ripple scenario below, presented as an interview question: open by stating the problem in a sentence or two and asking him to clarify requirements and estimate scale before designing. He draws his design in a tool you can see.

The scenario:
{level}

His design right now (it updates as he draws):
{design}

The last time he simulated it:
{run}

How you interview:
- One question at a time. Follow the usual arc: requirements, estimates, high-level design, deep dives on two or three components, failure modes, trade-offs. Let him lead; steer if he stalls or skips something important.
- Probe choices in his drawn design specifically ("you've put a cache here: what's your invalidation strategy?", "how many app servers, and how did you get that number?").
- You may run an incident against his design to test a claim: end your message with [[whatif TYPE at=HOUR dur=HOURS ...]] where TYPE is one of {events}. The app runs it and the next message starts with a note of the result.
- Short messages, like a real interviewer speaking. No em dashes. Never evaluate him during the interview; that comes at the end."""


@router.post('/review')
async def review(body: ReviewIn, store=Depends(store_for)):
    """One turn of the design review (Marcus) or the mock interview. Stateless: the browser sends the conversation."""
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    level = _level(store, body.level, body.scenario)
    tmpl = REVIEW if body.mode == 'review' else INTERVIEW
    system = tmpl.format(who='Marcus, Ripple\'s CTO' if body.mode == 'review' else '', persona=voice.persona('marcus') if body.mode == 'review' else '',
                         level=level_text(level), design=graph_text(body.graph), run=run_text(body.run), events=', '.join(EVENT_TYPES))
    if body.notes.strip():
        system += '\n\nHis own reasoning, written or spoken while he designed (use it: probe what he claims, notice what he skipped):\n' + reasoning_text(body.notes, [t.model_dump() for t in body.timeline])
    msgs = [{'role': 'system', 'content': system}]
    for m in body.messages[-40:]:
        if m.role == 'note':
            msgs.append({'role': 'user', 'content': f'(Note from the app: {m.text})'})
        else:
            msgs.append({'role': m.role, 'content': m.text})
    if len(msgs) == 1:
        msgs.append({'role': 'user', 'content': '(Nikhil has opened the review. Start.)' if body.mode == 'review' else '(The candidate has joined. Start the interview.)'})
    try:
        raw = await asyncio.to_thread(llm._raw_chat, config.TUTOR_MODEL, msgs, options={'max_tokens': 900, 'timeout': 60, 'think': False})
    except Exception as exc:
        log.warning('Ripple review failed: %s', type(exc).__name__)
        raise HTTPException(502, FAILED)
    text, ev = parse_whatif(raw['content'])
    return {'reply': voice.plain(text), 'whatif': ev}


@router.post('/review/end')
async def end_interview(body: ReviewIn, store=Depends(store_for)):
    """Score a finished mock interview and count it as soft evidence."""
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    if sum(1 for m in body.messages if m.role == 'user') < 3:
        raise HTTPException(400, 'Answer a few questions before ending the interview.')
    level = _level(store, body.level, body.scenario)
    transcript = '\n'.join(f"{'Interviewer' if m.role == 'assistant' else 'Nikhil' if m.role == 'user' else 'App'}: {m.text}" for m in body.messages[-80:])
    system = (f"{voice.FEEDBACK}\n\nYou were the interviewer in a system design mock interview. Write the evaluation a hiring committee would read, "
              "addressed to Nikhil. Judge requirements, estimation, design, depth, failure handling and trade-offs from the transcript and his final design. "
              "Be specific and honest; quote what he said where it helps.")
    prompt = json.dumps({'scenario': level_text(level), 'final_design': graph_text(body.graph), 'last_run': run_text(body.run), 'transcript': transcript,
                         'his_reasoning': reasoning_text(body.notes, [t.model_dump() for t in body.timeline]),
                         'concepts': {k: v['label'] for k, v in CONCEPTS.items()}}, ensure_ascii=False)
    try:
        raw = await asyncio.to_thread(llm._raw_generate, 'openrouter', config.TUTOR_NOTES_MODEL, system, prompt, Evaluation,
                                      options={'effort': 'medium', 'max_tokens': 3000, 'timeout': 90})
        ev = Evaluation.model_validate_json(raw).model_dump()
    except Exception as exc:
        log.warning('Ripple interview evaluation failed: %s', type(exc).__name__)
        raise HTTPException(502, FAILED)
    now = time.time()
    key = f'interview-{int(now)}'
    weak, strong = [c for c in ev['weak'] if c in CONCEPTS], [c for c in ev['strong'] if c in CONCEPTS and c not in ev['weak']]
    events = []
    for c, clean in [(c, False) for c in weak] + [(c, True) for c in strong]:
        pts = [p for p in (kcat.canonical(kcat.CATALOG, p) for p in CONCEPTS[c]['points']) if p]
        if pts:
            events.append({'key': f'{key}-{c}'[:64], 'kind': 'answer', 'points': pts, 'clean': clean, 'failed': [] if clean else pts,
                           'depth': 'explain', 'strength': 'soft', 'at': now, 'note': 'Ripple Ops mock interview', 'ref': f'ripple:{body.level}'})
    if events:
        kb_api.write_events(store, SOURCE, events, now)
    store.put_knowledge(REVIEWS, key, {'level': body.level, 'at': now, 'evaluation': ev, 'messages': [m.model_dump() for m in body.messages], 'graph': body.graph})
    return {**{k: voice.plain(v) if isinstance(v, str) else v for k, v in ev.items()}, 'weak': weak, 'strong': strong}


@router.post('/hint')
async def hint(body: ReviewIn, store=Depends(store_for)):
    """A nudge from Priya about the current design, pointing at the next problem without solving it."""
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    level = _level(store, body.level, body.scenario)
    system = (f"You are {voice.persona('priya')}\n\nNikhil is stuck on a Ripple Ops level. Look at his design and the last simulation and give ONE nudge: "
              "name the symptom to look at and the question to ask himself, in two or three sentences. Don't name the fix outright and never give a full design. No em dashes.")
    prompt = f"{level_text(level)}\n\nHis design:\n{graph_text(body.graph)}\n\nLast run:\n{run_text(body.run)}"
    try:
        raw = await asyncio.to_thread(llm._raw_chat, config.TUTOR_MODEL, [{'role': 'system', 'content': system}, {'role': 'user', 'content': prompt}],
                                      options={'max_tokens': 400, 'timeout': 45, 'think': False})
    except Exception as exc:
        log.warning('Ripple hint failed: %s', type(exc).__name__)
        raise HTTPException(502, FAILED)
    return {'text': voice.plain(re.sub(r'\[\[[^\]]*\]\]', '', raw['content']).strip())}


def scenario_from(gen: dict, gid: str, now: float):
    """A generated scenario in the shape the engine and the UI read."""
    t = gen['traffic']
    traffic = {k: v for k, v in t.items() if v is not None and k != 'peak'}
    traffic['peak'] = t.get('peak', 2.2)
    if traffic.get('write'):
        traffic['write']['jobs'] = [{k: v for k, v in j.items() if k in ('kind', 'per', 'ms', 'fanout')} for j in traffic['write'].get('jobs') or []]
    events = []
    for i, e in enumerate(gen['events']):
        p = {}
        if e['type'] in ('surge', 'ddos', 'partner-burst') and e.get('mult'):
            p['mult'] = e['mult']
        if e['type'] == 'hot-key' and e.get('share'):
            p['share'] = e['share']
        if e['type'] == 'slow-dependency':
            p.update(ms=e.get('ms') or 5000, err=0.3)
        events.append({'id': f'g{i}', 'type': e['type'], 'at': e['at'], 'dur': e['dur'], 'params': p, 'label': e['label'], 'who': e['who'], 'line': e['line']})
    concepts = [c for c in gen['concepts'] if c in CONCEPTS] or ['scaling']
    slo = {'availability': gen['availability'], 'p99': {k: v for k, v in gen['p99'].items() if k in traffic}, 'budget': gen['budget']}
    if gen.get('lag_min'):
        slo['lagMin'] = gen['lag_min']
    if gen.get('no_loss'):
        slo['noLoss'] = True
    return {'id': gid, 'generated': True, 'chapter': 'generated', 'tier': 'Generated', 'users': gen['users'], 'title': gen['title'],
            'kicker': gen['kicker'], 'goal': gen['goal'], 'brief': gen['brief'], 'dau': gen['dau'], 'traffic': traffic,
            'data': {'gb': gen['data_gb'], 'mediaGb': gen.get('media_gb', 0)}, 'far': {'share': gen['far_share'], 'rttMs': 90} if gen.get('far_share') else None,
            'slo': slo, 'events': events, 'estimate': ['peakReadRps', 'peakWriteRps'], 'concepts': concepts,
            'lessons': list(dict.fromkeys(CONCEPTS[c]['lesson'] for c in concepts)), 'sims': list(dict.fromkeys(CONCEPTS[c]['sim'] for c in concepts if CONCEPTS[c].get('sim'))),
            'toolbox': COMPONENTS_LATE, 'hints': gen['hints'], 'debrief': gen['debrief'], 'start': {'nodes': [{'id': 'n1', 'defId': 'client', 'x': 40, 'y': 232}], 'edges': []},
            'created_at': now, 'prompt_version': PROMPT_VERSION}


@router.post('/generate')
async def generate(body: GenerateIn, store=Depends(store_for)):
    """A new Ripple incident written by the model, aimed at what you're weak on unless you say otherwise."""
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    now = time.time()
    weak = {}
    for r in _runs(store)[-30:]:
        for f in r.get('findings') or []:
            if f.get('level') == 'bad' and f.get('concept') in CONCEPTS:
                weak[f['concept']] = weak.get(f['concept'], 0) + 1
    size = {'startup': '10k-2M daily users, budgets of a few hundred to a few thousand dollars a month',
            'scale-up': '2M-50M daily users, budgets of five figures a month',
            'giant': '50M-300M daily users, budgets of six figures a month'}[body.size]
    system = (f"You design levels for Ripple Ops, a system design game. Ripple is the startup from the course: {story.BIBLE['pitch']}\n"
              f"The cast:\n{_cast()}\n\nWrite one new level: a realistic product moment at Ripple with traffic, targets, a budget and one to four incidents "
              "that test specific concepts. Numbers must be self-consistent and realistic; the budget should be tight but achievable for a sensible design "
              "(roughly: an app server handles ~1,000 req/s for ~$120/month, a mid SQL database ~6,000 reads/s and ~1,500 writes/s for ~$280, a 13 GB cache "
              "~$180, bandwidth $0.09/GB from origin or $0.05/GB from a CDN). Spread incidents across the day and put the nastiest near the evening peak (18-21h). "
              "The brief lines are in character and tell him what matters without naming the solution. Hints get progressively more specific. No em dashes.")
    prompt = json.dumps({'scale': size, 'focus': body.focus or 'his weakest concepts', 'weak_concepts_from_recent_runs': weak,
                         'concept_ids': {k: v['label'] for k, v in CONCEPTS.items()}, 'existing_levels': [l['title'] for l in CAMPAIGN['levels']],
                         'request_types': 'read (cacheable reads with workingSetGb), write (with optional background jobs), media (bytes for a CDN), search, realtime (live messages), geo (nearby lookups), payment'},
                        ensure_ascii=False)
    try:
        raw = await asyncio.to_thread(llm._raw_generate, 'openrouter', config.TUTOR_NOTES_MODEL, system, prompt, GenScenario,
                                      options={'effort': 'medium', 'max_tokens': 5000, 'timeout': 90})
        gen = GenScenario.model_validate_json(raw).model_dump()
    except Exception as exc:
        log.warning('Ripple generator failed: %s', type(exc).__name__)
        raise HTTPException(502, FAILED)
    gid = f'gen-{int(now)}'
    scn = scenario_from(gen, gid, now)
    store.put_knowledge(GENERATED, gid, scn)
    return scn


@router.get('/scenarios/{gid}')
def get_scenario(gid: str, store=Depends(store_for)):
    s = store.get_knowledge(GENERATED, gid)
    if not s:
        raise HTTPException(404, 'Unknown scenario')
    return {**s, 'id': gid}
