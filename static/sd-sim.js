// Ripple Ops engine: a drawn architecture, a scenario and the price list in; one simulated day out.
// Pure: no DOM, no I/O. Each hour the scenario's traffic is routed through the graph by component role
// (CDN and cache hits, misses to the database, jobs onto queues, calls to third parties), every node's
// load becomes utilisation, latency and errors (the M/M/c stage in sd-stress.js), and events (a viral
// spike, a hot key, a zone outage, a poison message...) change capacity or traffic while they last.
// Clients retry failures, so overload feeds itself unless something sheds load. The output is the
// hour-by-hour trace, a monthly bill, scored objectives and findings tied to course concepts.
// It is a teaching model: right about which part breaks first and roughly when, not a benchmark.
(function (root) {
  'use strict';
  const Stress = typeof module !== 'undefined' && module.exports ? require('./sd-stress.js') : root.SDStress;
  // Ripple Assist levels (scenario.ai) run on their own engine (ai-sim.js), which returns the same shape.
  const AI = () => (typeof module !== 'undefined' && module.exports ? require('./ai-sim.js') : root.AISim);
  const VERSION = 1, HOURS = 24, TIMEOUT = 30000, DAY = 86400;
  const USER = ['read', 'write', 'media', 'upload', 'search', 'realtime', 'geo', 'locate', 'payment'];
  const LABEL = { ask: 'Questions', read: 'Reads', write: 'Writes', media: 'Media views', upload: 'Uploads', search: 'Searches', realtime: 'Live messages',
    geo: 'Nearby lookups', locate: 'Location updates', payment: 'Payments', attack: 'Attack traffic' };
  const DBS = new Set(['db-sql', 'db-nosql', 'db-graph', 'db-timeseries']);
  const EDGE = new Set(['dns', 'cdn']);
  const READISH = new Set(['read', 'attack', 'search', 'geo', 'media']);
  const KB = { read: 2, write: 1, media: 300, upload: 2000, search: 4, realtime: 1, geo: 2, locate: 0.1, payment: 2, attack: 1 };
  // A normal day: quiet at night, busy in the evening. Scaled so the mean is 1 and the peak is the scenario's.
  const SHAPE = [0.32, 0.25, 0.2, 0.18, 0.2, 0.28, 0.45, 0.7, 0.92, 1.02, 1.08, 1.12, 1.18, 1.15, 1.1, 1.1, 1.15, 1.25, 1.4, 1.55, 1.6, 1.45, 1.05, 0.62];
  const EVENT_LABEL = { surge: 'Traffic surge', 'hot-key': 'Hot key', 'cache-flush': 'Cache flushed', 'cache-node': 'Cache node lost', 'az-outage': 'Zone outage',
    'region-outage': 'Region outage', 'db-failover': 'Database primary dies', 'bad-deploy': 'Bad deploy', 'slow-dependency': 'Slow third party',
    'poison-message': 'Poison message', ddos: 'DDoS attack', 'partner-burst': 'Partner bulk import',
    'model-update': 'Provider silently updates the model', 'rate-limit': 'Provider throttles the model', 'provider-outage': 'Model provider outage',
    'injection-campaign': 'Injection campaign', 'doc-change': 'Refund policy changed', 'node-down': 'A component fails' };

  const clamp = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const mean = a => (Number(a[0]) + Number(a[1])) / 2;
  const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);
  const OK = Object.freeze({ ok: 1, ms: 0 }), FAIL = Object.freeze({ ok: 0, ms: TIMEOUT });
  const seq = (a, b) => ({ ok: a.ok * b.ok, ms: Math.min(TIMEOUT, a.ms + b.ms) });
  // p99 of a hit/miss mixture: once 1% or more of requests miss, the misses set the tail.
  const tail = (hit, a, b) => { const miss = 1 - hit; return miss >= 0.01 ? b : a + (b - a) * miss / 0.01; };
  const mixr = (hit, a, b) => ({ ok: hit * a.ok + (1 - hit) * b.ok, ms: tail(hit, a.ms, b.ms) });

  // ---------- configuration ----------
  function spec(econ, defId) { return econ.components[defId] || { role: 'aux', kind: 'none', ms: [0, 0], tiers: [{ id: 'x', label: '', usd: 0 }] }; }
  function defaultTier(d) { const t = d.tiers || []; return t.find(x => x.id === d.default) || t[Math.min(1, t.length - 1)] || { id: 'x', usd: 0 }; }
  // A node's settings with defaults filled and anything the component doesn't support ignored.
  function config(node, econ) {
    const d = spec(econ, node.defId), c = node.cfg || {}, o = new Set(d.opts || []);
    const tier = (d.tiers || []).find(t => t.id === c.tier) || defaultTier(d);
    const count = o.has('count') ? clamp(c.count, 1, 500, 1) : 1;
    return { tier, count, azs: o.has('azs') ? clamp(c.azs, 1, 3, 1) : (d.multiAz ? 3 : 1), replicas: o.has('replicas') ? clamp(c.replicas, 0, 5, 0) : 0,
      shards: o.has('shards') ? clamp(c.shards, 1, 64, 1) : 1, sync: o.has('sync') && c.sync === 'sync' ? 'sync' : 'async',
      autoscale: o.has('autoscale') && c.autoscale ? clamp(c.autoscale, count, 500, count) : 0,
      timeouts: o.has('timeouts') && !!c.timeouts, canary: o.has('canary') && !!c.canary, hotKey: o.has('hotKey') && !!c.hotKey, coalesce: o.has('coalesce') && !!c.coalesce };
  }

  function prepare(graph, econ) {
    const nodes = {}, kids = {}, parents = {};
    for (const n of graph.nodes || []) {
      const d = spec(econ, n.defId);
      nodes[n.id] = { id: n.id, defId: n.defId, def: d, role: d.role, ...config(n, econ) };
      kids[n.id] = []; parents[n.id] = [];
    }
    for (const e of graph.edges || []) {
      if (!nodes[e.from] || !nodes[e.to] || e.from === e.to || kids[e.from].includes(e.to)) continue;
      kids[e.from].push(e.to); parents[e.to].push(e.from);
    }
    const st = graph.settings || {};
    const m = { nodes, kids, parents, ids: Object.keys(nodes), econ, regions: clamp(st.regions, 1, 3, 1), crossRegion: st.crossRegion === 'sync' ? 'sync' : 'async', memo: {} };
    m.has = defId => m.ids.some(id => nodes[id].defId === defId);
    m.of = role => m.ids.filter(id => nodes[id].role === role);
    m.shedder = m.ids.some(id => nodes[id].def.shed);
    return m;
  }

  // ---------- who can serve what ----------
  // Fallbacks are allowed but cost more: a database can answer searches with a full scan, an app server can
  // fake live updates by polling. rank() prefers the specialist.
  function handles(n, type) {
    const k = type.startsWith('job:') ? 'job' : type;
    switch (k) {
      case 'read': case 'attack': return DBS.has(n.defId);
      case 'write': case 'analytics': return DBS.has(n.defId) || (k === 'analytics' && n.defId === 'olap');
      case 'fanout-write': return DBS.has(n.defId) || n.role === 'cache';
      case 'media': case 'upload': return n.defId === 'object-store';
      case 'search': return n.defId === 'search-engine' || DBS.has(n.defId);
      case 'index': return n.defId === 'search-engine';
      case 'geo': return n.defId === 'geospatial' || DBS.has(n.defId);
      case 'locate': return n.defId === 'geospatial' || DBS.has(n.defId);
      case 'realtime': return n.defId === 'websocket-server' || n.defId === 'app-server';
      case 'payment': return n.defId === 'payment' || n.role === 'external';
      case 'ext': return n.role === 'external';
      case 'notify': return n.defId === 'notification-service' || n.defId === 'email-server' || n.role === 'external';
      case 'auth': return n.defId === 'auth-service';
      case 'id': return n.defId === 'id-generator';
      case 'spam': return n.defId === 'spam-filter';
      case 'job': return n.role === 'queue';
      default: return false;
    }
  }
  function reach(m, id, type, seen = new Set()) {
    const key = id + '|' + type;
    if (key in m.memo) return m.memo[key];
    if (seen.has(id)) return false;
    seen.add(id);
    const n = m.nodes[id];
    let r = handles(n, type);
    if (!r && n.role !== 'store' && n.role !== 'external' && n.role !== 'queue' && n.role !== 'ops' && n.role !== 'dlq') {
      r = m.kids[id].some(k => reach(m, k, type, seen));
    }
    seen.delete(id);
    return (m.memo[key] = r);
  }
  // How good a handler is for a type: 0 is the specialist, higher is a costly fallback.
  function handlerRank(n, type) {
    if (type === 'search' || type === 'geo') return DBS.has(n.defId) ? 8 : 0;
    if (type === 'locate') return n.defId === 'geospatial' ? 0 : n.defId === 'db-timeseries' ? 2 : 5;
    if (type === 'analytics') return n.defId === 'olap' || n.defId === 'db-timeseries' ? 0 : 6;
    if (type === 'fanout-write') return n.role === 'cache' ? 0 : 5;
    if (type === 'write' || type === 'read') return n.defId === 'db-sql' || n.defId === 'db-nosql' ? 0 : 4;
    if (type === 'realtime') return n.defId === 'app-server' ? 6 : 0;
    if (type === 'payment') return n.role === 'external' ? 2 : 0;
    return 0;
  }
  function best(m, id, type, seen = new Set()) {
    const key = 'b|' + id + '|' + type;
    if (key in m.memo) return m.memo[key];
    if (seen.has(id)) return 99;
    seen.add(id);
    const n = m.nodes[id];
    let r = handles(n, type) ? handlerRank(n, type) : 99;
    if (n.role !== 'store' && n.role !== 'external' && n.role !== 'queue') for (const k of m.kids[id]) if (reach(m, k, type)) r = Math.min(r, best(m, k, type, seen));
    seen.delete(id);
    return (m.memo[key] = r);
  }
  function rank(m, id, type, scn) {
    return best(m, id, type) * 10 + roleRank(m, id, type, scn);
  }
  function roleRank(m, id, type, scn) {
    const n = m.nodes[id];
    if (type === 'media') return n.defId === 'cdn' ? 0 : n.defId === 'object-store' ? 1 : 5;
    if (type === 'upload') return n.defId === 'object-store' ? 0 : 5;
    if (type === 'read' && n.defId === 'cdn') return (scn.traffic.read?.cdn || 0) > 0 ? 0 : 7;
    if (type === 'realtime') return n.defId === 'websocket-server' ? 0 : n.defId === 'app-server' ? 6 : 4;
    if (type === 'search') return n.defId === 'search-engine' ? 0 : DBS.has(n.defId) ? 8 : 4;
    if (type === 'geo' || type === 'locate') return n.defId === 'geospatial' ? 0 : DBS.has(n.defId) ? 8 : 4;
    if (type === 'payment') return n.defId === 'payment' ? 0 : n.role === 'external' ? 2 : 4;
    if (n.defId === 'cdn') return 6;
    return n.role === 'pass' ? 3 : n.role === 'compute' ? 4 : 5;
  }
  // The children that get this traffic: reachable ones of the best rank, split evenly. Load balancers and
  // gateways health-check, so they skip a dead child; a client wired straight to servers does not.
  function pick(ctx, from, type, filter) {
    const m = ctx.m, scn = ctx.scn;
    let c = m.kids[from].filter(k => (!filter || filter(m.nodes[k])) && reach(m, k, type));
    if (!c.length) return c;
    const best = Math.min(...c.map(k => rank(m, k, type, scn)));
    c = c.filter(k => rank(m, k, type, scn) === best);
    const checks = m.nodes[from].role === 'pass' || m.nodes[from].defId === 'dns';
    if (checks) { const up = c.filter(k => !ctx.down.has(k)); if (up.length) c = up; }
    // Clients fail over at the DNS layer: a dead name server or CDN is skipped for the next-best way in.
    if (m.nodes[from].role === 'source' && c.some(k => ctx.down.has(k) && EDGE.has(m.nodes[k].defId))) {
      const up = c.filter(k => !(ctx.down.has(k) && EDGE.has(m.nodes[k].defId)));
      const alive = up.length ? up : m.kids[from].filter(k => !ctx.down.has(k) && (!filter || filter(m.nodes[k])) && reach(m, k, type));
      if (alive.length) { const b = Math.min(...alive.map(k => rank(m, k, type, scn))); c = alive.filter(k => rank(m, k, type, scn) === b); }
    }
    return c;
  }
  function send(ctx, from, type, rps, depth, filter) {
    if (rps <= 0) return OK;
    const group = pick(ctx, from, type, filter);
    if (!group.length) { if (ctx.mode === 'load') ctx.unserved[type] = (ctx.unserved[type] || 0) + rps; return FAIL; }
    const each = rps / group.length, rs = group.map(k => flow(ctx, k, type, each, depth + 1));
    return { ok: sum(rs, r => r.ok) / rs.length, ms: Math.max(...rs.map(r => r.ms)) };
  }

  // ---------- one request type through one node ----------
  function flow(ctx, id, type, rps, depth = 0) {
    if (rps <= 0) return OK;
    if (depth > 16) return FAIL;
    const m = ctx.m, n = m.nodes[id], scn = ctx.scn;
    const add = (t, r, w = 1) => { if (ctx.mode === 'load') { const L = ctx.load[id] || (ctx.load[id] = {}); L[t] = (L[t] || 0) + r * w; } };
    const self = () => ctx.mode === 'eval' && ctx.st[id] ? { ok: ctx.st[id].ok, ms: ctx.st[id].p99 } : OK;
    const flag = (k, v = rps) => { if (ctx.mode === 'load') ctx.flags[k] = (ctx.flags[k] || 0) + v; };
    switch (n.role) {
      case 'pass': {
        add(type, rps);
        const r = type === 'attack' && n.def.shed ? rps * (1 - n.def.shed) : rps;
        return seq(self(), send(ctx, id, type, r, depth));
      }
      case 'cdn': {
        add(type, rps);
        const hit = type === 'media' ? 0.95 : type === 'read' ? Math.min(1, scn.traffic.read?.cdn || 0) : type === 'attack' ? 0.5 : 0;
        if (hit >= 1) return self();
        return mixr(hit, self(), seq(self(), send(ctx, id, type, rps * (1 - hit), depth)));
      }
      case 'cache': {
        const write = type === 'fanout-write' || type === 'write';
        add(write ? 'cache-write' : type, rps);
        if (write) return self();
        const hit = hitRate(ctx, n, type);
        if (m.kids[id].some(k => reach(m, k, type))) return mixr(hit, self(), seq(self(), send(ctx, id, type, rps * (1 - hit), depth)));
        return { ...self(), hit };
      }
      case 'store': {
        add(type, rps, storeWeight(n, type));
        if (n.defId === 'search-engine' && type === 'search') flag('searchEngine');
        if (DBS.has(n.defId) && type === 'search') flag('searchScan');
        if (DBS.has(n.defId) && type === 'geo') flag('geoScan');
        let r = self();
        if (type === 'upload' && n.defId === 'object-store' && m.kids[id].some(k => m.nodes[k].role === 'queue')) r = seq(r, emitJobs(ctx, id, scn.traffic.upload?.jobs, rps, depth, true));
        return r;
      }
      case 'queue': {
        add(type, rps);
        if (ctx.mode === 'load' && type.startsWith('job:')) { const q = ctx.qIn[id] || (ctx.qIn[id] = {}); q[type.slice(4)] = (q[type.slice(4)] || 0) + rps; }
        return self();
      }
      case 'external': { add(type, rps); return self(); }
      case 'compute': return compute(ctx, id, type, rps, depth, add, self, flag);
      case 'worker': return OK;     // workers are fed by queues, in drain()
      default: return FAIL;
    }
  }

  function storeWeight(n, type) {
    if (DBS.has(n.defId) && type === 'search') return 25;      // LIKE '%term%' scans
    if (DBS.has(n.defId) && type === 'geo') return 15;         // two range indexes and a filter
    return 1;
  }

  function compute(ctx, id, type, rps, depth, add, self, flag) {
    const m = ctx.m, n = m.nodes[id], scn = ctx.scn, T = scn.traffic;
    const poll = type === 'realtime' && n.defId !== 'websocket-server';
    const w = poll ? 4 : type === 'media' ? 3 : type === 'upload' ? 6 : 1;
    add(type, rps, w);
    if (type === 'media' || type === 'upload') flag('proxyBytes');
    let r = self();
    if (poll) { flag('polling'); r = { ...r, ms: r.ms + 1000 }; }
    const user = USER.includes(type) || type === 'attack';
    if (user && n.defId !== 'auth-service' && m.kids[id].some(k => handles(m.nodes[k], 'auth'))) r = seq(r, send(ctx, id, 'auth', rps, depth, k => k.defId === 'auth-service'));
    if ((n.defId === 'geospatial' && (type === 'geo' || type === 'locate')) || ['auth', 'id', 'spam'].includes(type)) return r;
    const k = type.startsWith('job:') ? 'job' : type;
    switch (k) {
      case 'locate': return seq(r, send(ctx, id, 'locate', rps, depth));
      case 'read': case 'attack': r = seq(r, readPath(ctx, id, type, rps, depth)); return type === 'read' ? seq(r, emitJobs(ctx, id, T.read?.jobs, rps, depth)) : r;
      case 'write': return seq(r, writePath(ctx, id, rps, depth));
      case 'media': return seq(r, send(ctx, id, 'media', rps, depth));
      case 'upload': {
        r = seq(r, send(ctx, id, 'upload', rps, depth));
        const stores = pick(ctx, id, 'upload');
        if (!stores.every(s => m.kids[s].some(q => m.nodes[q].role === 'queue'))) r = seq(r, emitJobs(ctx, id, T.upload?.jobs, rps, depth));
        return seq(r, writePath(ctx, id, rps * 0.2, depth, true));
      }
      case 'search': return seq(r, send(ctx, id, 'search', rps, depth));
      case 'geo': return seq(r, send(ctx, id, 'geo', rps, depth));
      case 'realtime': {
        const persist = writePath(ctx, id, rps * (T.realtime?.persist ?? 1), depth, true);
        const servers = sum(m.ids.filter(x => m.nodes[x].defId === n.defId), x => m.nodes[x].count);
        const backplane = m.kids[id].some(x => m.nodes[x].role === 'queue' || m.nodes[x].role === 'cache');
        if (servers > 1 && !backplane) { flag('noBackplane'); return seq(seq(r, persist), { ok: 1 / servers, ms: 0 }); }
        return seq(r, persist);
      }
      case 'payment': {
        if (n.defId === 'payment') {
          // With a queue: record the payment as pending, answer, and charge the provider from a worker.
          if (m.kids[id].some(k => m.nodes[k].role === 'queue')) return seq(seq(r, writePath(ctx, id, rps * 2, depth, true)), send(ctx, id, 'job:charge', rps, depth, k => k.role === 'queue'));
          return seq(seq(r, guard(n, send(ctx, id, 'ext', rps, depth))), writePath(ctx, id, rps * 2, depth, true));
        }
        return seq(r, guard(n, send(ctx, id, 'payment', rps, depth)));
      }
      case 'notify': return m.kids[id].some(x => reach(m, x, 'ext')) ? seq(r, guard(n, send(ctx, id, 'ext', rps, depth))) : r;
      default: return r;
    }
  }

  // A timeout turns a slow call into a fast failure: that call is lost, the caller's threads are not.
  const guard = (n, r) => n.timeouts && r.ms > 1000 ? { ok: 0, ms: 1000 } : r;
  // How long a node's threads wait on a slow third party: directly, or through a service that does.
  function blockedMs(m, id, extMs, seen = new Set()) {
    const n = m.nodes[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    let w = 0;
    for (const k of m.kids[id]) {
      const c = m.nodes[k];
      if (c.role === 'external') w = Math.max(w, extMs);
      else if (c.role === 'compute' && reach(m, k, 'ext')) w = Math.max(w, mean(c.def.ms) + blockedMs(m, k, extMs, seen));
    }
    return n.timeouts ? Math.min(w, extMs > 1000 ? 50 : 1000) : w;
  }

  function readPath(ctx, id, type, rps, depth) {
    const m = ctx.m, caches = m.kids[id].filter(k => m.nodes[k].role === 'cache');
    if (!caches.length) return send(ctx, id, type, rps, depth, k => k.role !== 'cache');
    const each = rps / caches.length, rs = caches.map(c => flow(ctx, c, type, each, depth + 1));
    const own = rs.filter(r => r.hit !== undefined);
    const via = { ok: sum(rs, r => r.ok) / rs.length, ms: Math.max(...rs.map(r => r.ms)) };
    if (!own.length) return via;
    const hit = sum(own, r => r.hit) / own.length * (own.length / rs.length);
    const cold = (ctx.mods.cacheCold < 1 || caches.some(c => ctx.down.has(c))) && caches.some(c => m.nodes[c].coalesce);
    const miss = rps * (1 - hit) * (cold ? 0.3 : 1);
    if (cold) { if (ctx.mode === 'load') ctx.flags.coalesced = 1; }
    return mixr(hit, via, seq(via, send(ctx, id, type, miss, depth, k => k.role !== 'cache')));
  }

  function writePath(ctx, id, rps, depth, quiet) {
    const m = ctx.m, T = ctx.scn.traffic;
    let r = OK;
    if (m.kids[id].some(k => handles(m.nodes[k], 'id'))) r = seq(r, send(ctx, id, 'id', rps, depth));
    if (!quiet && m.kids[id].some(k => handles(m.nodes[k], 'spam'))) r = seq(r, send(ctx, id, 'spam', rps, depth));
    r = seq(r, send(ctx, id, 'write', rps, depth, k => k.role !== 'cache'));
    if (!quiet) r = seq(r, emitJobs(ctx, id, T.write?.jobs, rps, depth));
    return r;
  }

  // Background work a request creates. With a queue in reach it costs an enqueue; without, it runs inline.
  function emitJobs(ctx, id, jobs, rps, depth, fromStore) {
    if (!jobs || !jobs.length) return OK;
    const m = ctx.m, n = m.nodes[id];
    let r = OK;
    for (const j of jobs) {
      const jr = rps * (j.per ?? 1);
      if (jr <= 0) continue;
      if (m.kids[id].some(k => m.nodes[k].role === 'queue')) { r = seq(r, send(ctx, id, 'job:' + j.kind, jr, depth, k => k.role === 'queue')); continue; }
      if (fromStore) continue;
      if (ctx.mode === 'load') ctx.flags['inline:' + j.kind] = (ctx.flags['inline:' + j.kind] || 0) + jr;
      if (j.kind === 'process') {
        if (ctx.mode === 'load') { const L = ctx.load[id] || (ctx.load[id] = {}); L.inline = (L.inline || 0) + jr * (j.ms || 200) / Math.max(1, mean(n.def.ms)); }
        r = { ok: r.ok, ms: r.ms + (j.ms || 200) };
      } else if (j.kind === 'notify') r = seq(r, send(ctx, id, 'notify', jr, depth));
      else if (j.kind === 'fanout') r = seq(r, send(ctx, id, 'fanout-write', jr * (j.fanout || 1), depth));
      else if (j.kind === 'analytics') r = seq(r, send(ctx, id, 'analytics', jr, depth));
      else if (j.kind === 'index') r = seq(r, send(ctx, id, 'index', jr, depth));
    }
    return r;
  }

  function hitRate(ctx, n, type) {
    if (type === 'attack' || ctx.down.has(n.id)) return 0;
    const R = ctx.scn.traffic.read || {}, base = R.cacheable ?? 0.9, ws = Math.max(0.01, R.workingSetGb ?? 5);
    const mem = (n.tier.gb || 6) * n.count;
    return base * Math.pow(Math.min(1, mem / ws), 0.35) * ctx.mods.cacheCold;
  }

  // ---------- queues and workers ----------
  const JOB_MS = { notify: 2, charge: 2, fanout: 0.05, analytics: 0.5, index: 5 };   // CPU per job; fan-out is per follower
  const IO_CONCURRENCY = 50;    // calls a worker core keeps in flight with async I/O
  function jobMs(scn, kind, wait = 0) {
    const all = [...(scn.traffic.write?.jobs || []), ...(scn.traffic.upload?.jobs || []), ...(scn.traffic.read?.jobs || [])];
    const j = all.find(x => x.kind === kind);
    return (kind === 'process' ? (j?.ms || 200) : kind === 'fanout' ? JOB_MS.fanout * (j?.fanout || 1) : JOB_MS[kind] || 2) + (kind === 'notify' || kind === 'charge' ? wait / IO_CONCURRENCY : 0);
  }
  function drain(ctx, backlog, counts) {
    const m = ctx.m, out = {};
    for (const q of m.of('queue')) {
      const inflow = ctx.qIn[q] || {}, kinds = Object.keys({ ...inflow, ...(backlog[q] || {}) });
      const workers = m.kids[q].filter(k => m.nodes[k].role === 'worker');
      const dlq = m.kids[q].some(k => m.nodes[k].role === 'dlq') || workers.some(w => m.kids[w].some(k => m.nodes[k].role === 'dlq'));
      const stalled = ctx.mods.poison && !dlq;
      const res = { inflow: sum(Object.values(inflow)), backlog: 0, processed: 0, cap: 0, stalled, dlq, kinds: {} };
      const cores = sum(workers, w => (m.nodes[w].tier.cores || 2) * (counts[w] || m.nodes[w].count) * m.regions);
      // A worker sending through a slow provider holds its slot for the whole call.
      const wait = workers.length ? sum(workers, w => blockedMs(m, w, ctx.mods.extMs || mean(m.econ.components['external-service'].ms))) / workers.length : 0;
      const msOf = k => jobMs(ctx.scn, k, wait);
      const demand = sum(kinds, k => ((inflow[k] || 0) + ((backlog[q] || {})[k] || 0) / 3600) * msOf(k));
      const served = stalled ? 0 : Math.min(1, cores * 1000 * 0.8 / Math.max(demand, 1e-9));
      for (const kind of kinds) {
        const inR = inflow[kind] || 0, prev = (backlog[q] || {})[kind] || 0;
        const ms = msOf(kind);
        const cap = stalled ? 0 : (inR + prev / 3600) * served + (served >= 1 ? cores * 1000 * 0.8 / ms - demand / ms : 0);
        const done = Math.min(cap, inR + prev / 3600);
        const left = Math.max(0, prev + (inR - done) * 3600);
        res.kinds[kind] = { inflow: inR, cap, processed: done, backlog: left, lagMin: done > 0 || left === 0 ? left / Math.max(cap, 1e-9) / 60 : Infinity };
        res.backlog += left; res.processed += done; res.cap += cap;
        if (!workers.length && inR > 0 && ctx.mode === 'load') ctx.unserved['job:' + kind] = (ctx.unserved['job:' + kind] || 0) + inR;
        for (const w of workers) {
          const share = done / workers.length;
          const L = ctx.load[w] || (ctx.load[w] = {});
          L.cpuMs = (L.cpuMs || 0) + share * ms;
          L.wantMs = (L.wantMs || 0) + (inR + prev / 3600) / workers.length * ms;
          workerOut(ctx, w, kind, share);
        }
      }
      res.lagMin = Math.max(0, ...Object.values(res.kinds).map(k => k.lagMin));
      out[q] = res;
    }
    return out;
  }
  function workerOut(ctx, w, kind, rps) {
    const j = [...(ctx.scn.traffic.write?.jobs || []), ...(ctx.scn.traffic.upload?.jobs || []), ...(ctx.scn.traffic.read?.jobs || [])].find(x => x.kind === kind) || {};
    if (kind === 'notify') send(ctx, w, 'notify', rps, 1);
    else if (kind === 'charge') { send(ctx, w, 'ext', rps, 1); send(ctx, w, 'write', rps, 1); }
    else if (kind === 'fanout') send(ctx, w, 'fanout-write', rps * (j.fanout || 1), 1);
    else if (kind === 'analytics') send(ctx, w, 'analytics', rps, 1);
    else if (kind === 'index') send(ctx, w, 'index', rps, 1);
    else if (kind === 'process' && pick(ctx, w, 'write').length) send(ctx, w, 'write', rps * 0.5, 1);
  }

  // ---------- events ----------
  function modsAt(scn, h, m) {
    const o = { start: false, mult: {}, hotShare: 0, cacheCold: 1, az: false, region: false, dbFail: false, deployErr: 0, extMs: 0, extErr: 0, poison: false, ddos: 0, cacheNode: false, dead: new Set(), active: [] };
    for (const e of scn.events || []) {
      const at = Number(e.at) || 0, dur = Math.max(1, Number(e.dur) || 1);
      if (e.type === 'poison-message' && h >= at) o.poison = true;
      if (h < at || h >= at + dur) continue;
      o.active.push(e.id || e.type);
      if (h === at && ['az-outage', 'region-outage', 'db-failover'].includes(e.type)) o.start = true;
      const p = e.params || {};
      if (e.type === 'surge') for (const t of p.types || USER) o.mult[t] = (o.mult[t] || 1) * (p.mult || 5);
      else if (e.type === 'partner-burst') o.mult.write = (o.mult.write || 1) * (m.shedder ? Math.min(p.mult || 6, p.quota || 2) : p.mult || 6);  // quotas turn the excess into 429s
      else if (e.type === 'hot-key') o.hotShare = Math.max(o.hotShare, p.share || 0.3);
      else if (e.type === 'cache-flush') o.cacheCold = Math.min(o.cacheCold, h === at ? 0 : 0.7);
      else if (e.type === 'cache-node') o.cacheNode = h === at;
      else if (e.type === 'az-outage') o.az = true;
      else if (e.type === 'region-outage') o.region = true;
      else if (e.type === 'db-failover') o.dbFail = h === at;
      else if (e.type === 'bad-deploy') o.deployErr = Math.max(o.deployErr, h === at ? (p.err || 0.3) : (m.has('monitoring') ? 0 : p.err || 0.3));
      else if (e.type === 'slow-dependency') { o.extMs = Math.max(o.extMs, p.ms || 4000); o.extErr = Math.max(o.extErr, p.err || 0.2); }
      else if (e.type === 'ddos') o.ddos = Math.max(o.ddos, p.mult || 20);
      else if (e.type === 'node-down') {   // one named component (or every one of a kind) stops answering: software, not hardware
        const ids = [].concat(p.node || []), kinds = [].concat(p.defId || []);
        for (const id of m.ids) if (ids.includes(id) || kinds.includes(m.nodes[id].defId)) o.dead.add(id);
      }
    }
    if (o.cacheNode) {
      const caches = m.of('cache'), ring = m.has('consistent-hash'), shards = sum(caches, c => m.nodes[c].count) || 1;
      const replicated = caches.length && caches.every(c => m.nodes[c].azs > 1);
      o.cacheCold = Math.min(o.cacheCold, replicated ? 1 : ring || shards === 1 ? 1 - 1 / shards : 0.05);
    }
    return o;
  }
  // Which nodes are down this hour, before any traffic moves.
  function downSet(m, mods) {
    const down = new Set();
    for (const id of m.ids) {
      const n = m.nodes[id];
      if (n.role !== 'source' && mods.dead.has(id)) down.add(id);
      if (n.role === 'source' || n.role === 'external' || n.role === 'ops' || n.role === 'dlq') continue;
      if (mods.region && m.regions === 1 && n.defId !== 'cdn' && n.defId !== 'dns') down.add(id);
      if (mods.az && n.azs === 1 && !n.def.multiAz && n.role !== 'pass' && n.role !== 'cdn') down.add(id);
    }
    return down;
  }

  // ---------- node state from load ----------
  function nodeState(ctx, id, counts) {
    const m = ctx.m, n = m.nodes[id], L = ctx.load[id] || {}, mods = ctx.mods, R = m.regions;
    const regionKeep = mods.region && R > 1 ? (R - 1) / R : 1, azKeep = mods.az && n.azs > 1 ? (n.azs - 1) / n.azs : 1;
    const keep = regionKeep * azKeep, down = ctx.down.has(id);
    const total = sum(Object.values(L));
    let cap = Infinity, util = 0, err = 0, ms = n.def.ms || [0, 0], extra = 0, lost = 0, note = '';
    const count = counts[id] || n.count;
    if (n.role === 'compute' || (n.role === 'pass' && n.tier.rps)) {
      const balanced = count === 1 || m.parents[id].some(p => m.nodes[p].role !== 'source');   // callers inside the system balance client-side
      const used = balanced ? count : 1;
      if (!balanced) note = 'unbalanced';
      const cpu = (n.tier.rps || 1000) * used * R * keep;
      // Threads block on slow downstream calls. Timeouts with a breaker cap the wait and fail fast instead.
      const extShare = total ? ((L.payment || 0) + (L.notify || 0)) / total : 0;
      const wait = extShare > 0 ? extShare * blockedMs(m, id, mods.extMs || mean(m.econ.components['external-service'].ms)) : 0;
      const threads = (n.def.threads || 256) * used * R * keep * 1000 / Math.max(1, mean(ms) + wait);
      cap = Math.min(cpu, threads);
      util = total / cap;
      if (n.defId === 'app-server' && mods.deployErr) err = mods.deployErr * (n.canary && m.has('monitoring') ? 0.05 : 1) * (m.has('monitoring') ? 0.25 : 1);
      if (wait > 200) note = note || 'blocked';
    } else if (n.role === 'worker') {
      const cores = (n.tier.cores || 2) * count * R * keep * 1000 * 0.8;
      util = (L.wantMs || 0) / cores;      // above 1: work arrives faster than it can be done, so the backlog grows
    } else if (n.role === 'cache') {
      // A node is limited by its NIC as well as its CPU: ~1.2 GB/s, so big values cap reads per node.
      const ops = (n.tier.rps || 100000) * keep, per = Math.min(ops, 1.2e6 / Math.max(0.1, ctx.scn.traffic.read?.kb || 2) * keep), shards = n.count * R;
      const writes = L['cache-write'] || 0, reads = total - writes;
      const hottest = mods.hotShare && !n.hotKey ? Math.max(reads / shards, reads * mods.hotShare / (n.azs > 1 ? 2 : 1)) : reads / shards;
      util = hottest / per + writes / shards / ops;
      cap = total / Math.max(util, 1e-12);
      if (mods.hotShare && !n.hotKey && hottest > per * 0.85) note = 'hot-key';
    } else if (n.role === 'store') {
      const rU = sum(Object.entries(L).filter(([t]) => READISH.has(t)), ([, v]) => v), wU = total - rU;
      const t = n.tier;
      if (n.defId === 'db-nosql') {
        const p = n.def.partition, hotR = mods.hotShare && !m.of('cache').length ? rU * mods.hotShare : 0;   // behind a cache, the hot key is the first thing cached
        util = Math.max(rU / 4e6, wU / 1e6, hotR / p.reads);
        cap = Infinity;
        if (hotR > p.reads) { note = 'hot-partition'; err = mods.hotShare * (1 - p.reads / hotR); util = Math.min(util, 0.95); }
      } else {
        const shards = n.shards * (n.defId === 'db-sql' ? 1 : n.count);
        let capR = (t.reads || 1e5) * (1 + n.replicas) * shards * R * keep, capW = (t.writes || 1e5) * shards * keep;
        if (n.defId === 'db-sql' && m.regions > 1) capR = (t.reads || 1e5) * (1 + n.replicas) * shards * R * keep;
        util = rU / capR + wU / capW;
        cap = (rU + wU) / Math.max(util, 1e-12);
        const data = ctx.scn.data?.gb || 0;
        if (t.diskGb && DBS.has(n.defId) && data > t.diskGb * shards) { note = 'disk-full'; err = total ? wU / total : 0; }
        if (n.defId === 'db-sql' && n.replicas && n.sync === 'sync') extra = 3;
        if (n.defId === 'db-sql' && m.regions > 1 && m.crossRegion === 'sync') extra += m.econ.network.crossRegionRttMs;
        // Losing the primary: a standby fails over cleanly; promoting an async replica drops the last seconds
        // of writes; with neither, writes wait for a restore from backup.
        const primaryGone = n.defId === 'db-sql' && (mods.dbFail || (mods.az && n.azs === 1) || (mods.region && R === 1));
        if (primaryGone) {
          const wr = mods.start ? L.write || 0 : 0;
          if (mods.region && R === 1) { lost += wr * 300; note = 'restore'; }
          else if (n.azs > 1) { err = Math.max(err, 0.01); }
          else if (n.replicas > 0) { err = Math.max(err, total ? wU / total * 0.1 + 0.02 : 0); lost += wr * 5; note = 'promoted'; }
          else { lost += wr * 300; note = 'restore'; err = 1; }
        }
        if (mods.region && mods.start && R > 1 && m.crossRegion === 'async' && n.defId === 'db-sql') lost += (L.write || 0) * 2;
      }
    } else if (n.role === 'queue') {
      cap = (n.tier.rps || 1e5) * n.count * R * keep;
      util = total / cap;
    } else if (n.role === 'external') {
      ms = mods.extMs ? [mods.extMs * 0.6, mods.extMs] : ms;
      err = mods.extErr;
    }
    let p99 = Number(ms[1]) || 0, status = 'ok';
    if (Number.isFinite(cap) && total > 0) {
      const sim = { serviceTimeMs: [Number(ms[0]) || 0.1, Number(ms[1]) || 0.2], concurrency: Math.max(1, cap * Math.max(mean(ms), 0.1) / 1000), failureRate: 0 };
      const s = Stress.stage(sim, Math.min(total, cap * 0.999));
      p99 = s.p99; status = util >= 1 ? 'saturated' : s.status;
    } else if (util >= 1) status = 'saturated';
    else if (util >= 0.85) status = 'hot'; else if (util >= 0.6) status = 'warm';
    if (util >= 1) p99 = TIMEOUT;
    const okFrac = down ? 0 : (util > 1 ? 1 / util : 1) * (1 - err);
    if (down) status = 'down';
    return { util: down ? 0 : util, ok: okFrac, p99: down ? TIMEOUT : p99 + extra, status, err, load: total, lost, note, count };
  }

  // ---------- traffic ----------
  // SHAPE raised to a power, renormalised to mean 1: stays positive at night for any peak.
  function curve(scn) {
    const peak = Math.max(1.05, Math.min(6, scn.traffic.peak || 2));
    const at = k => { const v = SHAPE.map(s => Math.pow(s, k)), a = sum(v) / HOURS; return v.map(x => x / a); };
    let lo = 0.01, hi = 8;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (Math.max(...at(mid)) < peak) lo = mid; else hi = mid; }
    return at((lo + hi) / 2);
  }
  function baseRps(scn) {
    const T = scn.traffic, out = {};
    for (const t of USER) if (T[t]?.perUser) out[t] = scn.dau * T[t].perUser / DAY;
    return out;
  }

  // ---------- one day ----------
  function run(scn0, graph, econ, opts = {}) {
    if (scn0 && scn0.ai) return AI().run(scn0, graph, econ);
    const scn = normalize(scn0), m = prepare(graph, econ), base = baseRps(scn), shape = curve(scn);
    const clients = m.ids.filter(id => m.nodes[id].role === 'source');
    const ticks = [], usage = {}, counts = {}, countSum = {}, backlog = {};
    const lastLoad = {};
    let worstLag = 0, lost = 0;
    for (const id of m.ids) countSum[id] = 0;
    for (let h = 0; h < HOURS; h++) {
      const mods = modsAt(scn, h, m), down = downSet(m, mods);
      for (const id of m.ids) {
        const n = m.nodes[id];
        if (n.autoscale && lastLoad[id] != null) {
          const per = n.role === 'worker' ? (n.tier.cores || 2) * 1000 : (n.tier.rps || 1000);
          counts[id] = Math.min(n.autoscale, Math.max(n.count, Math.ceil(lastLoad[id] / (per * m.regions * 0.7))));
        } else counts[id] = n.count;
      }
      let e = 0, ctx = null, q = null, legit = 0, good = 0;
      const amp = m.shedder ? 0.3 : 2;
      for (let it = 0; it < 4; it++) {
        const mult = 1 + Math.min(3, amp * e);
        const traffic = {};
        for (const t of Object.keys(base)) traffic[t] = base[t] * shape[h] * (mods.mult[t] || 1) * mult;
        if (mods.ddos) traffic.attack = (base.read || sum(Object.values(base))) * shape[h] * mods.ddos;
        ctx = { m, scn, mods, down, mode: 'load', load: {}, qIn: {}, unserved: {}, flags: {}, st: {} };
        for (const [t, r] of Object.entries(traffic)) entry(ctx, clients, t, r);
        q = drain(ctx, backlog, counts);
        for (const id of m.ids) ctx.st[id] = nodeState(ctx, id, counts);
        ctx.mode = 'eval';
        const types = {};
        legit = 0; good = 0;
        for (const [t, r] of Object.entries(traffic)) {
          const res = entry(ctx, clients, t, r);
          const far = farPenalty(m, scn, t, clients);
          types[t] = { rps: r, ok: res.ok, p99: Math.min(TIMEOUT, res.ms + far) };
          if (t !== 'attack') { legit += r; good += r * res.ok; }
        }
        ctx.types = types; ctx.traffic = traffic;
        const ne = legit ? 1 - good / legit : 0;
        if (Math.abs(ne - e) < 0.003 || it === 3) { e = ne; break; }
        e = ne;
      }
      for (const qid of Object.keys(q)) { backlog[qid] = Object.fromEntries(Object.entries(q[qid].kinds).map(([k, v]) => [k, v.backlog])); worstLag = Math.max(worstLag, q[qid].lagMin); }
      for (const id of m.ids) { lastLoad[id] = ctx.st[id].load + (ctx.load[id]?.cpuMs ? ctx.load[id].cpuMs / 1000 : 0); countSum[id] += counts[id]; lost += ctx.st[id].lost; }
      meter(usage, ctx, clients);
      ticks.push({ h, mods: { active: mods.active, hot: mods.hotShare, cold: mods.cacheCold < 1 }, retryMult: 1 + Math.min(3, amp * e),
        types: ctx.types, ok: legit ? good / legit : 1, legit, nodes: Object.fromEntries(m.ids.map(id => [id, { ...ctx.st[id], load: ctx.st[id].load }])),
        queues: q, unserved: ctx.unserved, flags: ctx.flags, lost: sum(m.ids, id => ctx.st[id].lost) });
    }
    const avgCount = Object.fromEntries(m.ids.map(id => [id, countSum[id] / HOURS]));
    const bill = cost(m, scn, usage, avgCount);
    const summary = summarize(m, scn, ticks, bill, lost, worstLag);
    return { version: VERSION, ticks, bill, summary, findings: findings(m, scn, ticks, bill, summary), events: eventOutcomes(scn, ticks) };
  }

  function entry(ctx, clients, type, rps) {
    if (!clients.length) { if (ctx.mode === 'load') ctx.unserved[type] = (ctx.unserved[type] || 0) + rps; return FAIL; }
    const each = rps / clients.length, rs = clients.map(c => {
      const group = pick(ctx, c, type);
      if (ctx.mode === 'load') {
        const via = group.some(g => ctx.m.nodes[g].defId === 'cdn') ? 'cdnGb' : 'egressGb';
        ctx.bytes = ctx.bytes || {}; ctx.bytes[via] = (ctx.bytes[via] || 0) + each * (type === 'upload' ? 0.05 : ctx.scn.traffic[type]?.kb ?? KB[type] ?? 1) * 3600 / 1e6;
        ctx.bytes.entry = ctx.bytes.entry || {}; ctx.bytes.entry[type] = via;
      }
      return send(ctx, c, type, each, 0);
    });
    return { ok: sum(rs, r => r.ok) / rs.length, ms: Math.max(...rs.map(r => r.ms)) };
  }

  function farPenalty(m, scn, type, clients) {
    const far = scn.far;
    if (!far || !(far.share >= 0.01)) return 0;
    if (m.regions > 1 && m.has('dns')) return type === 'write' && m.crossRegion === 'sync' ? 0 : 0;
    if (type === 'media' && clients.some(c => m.kids[c].some(k => m.nodes[k].defId === 'cdn'))) return 0;
    return 2 * (far.rttMs || m.econ.network.farRttMs);
  }

  // Per-hour usage, metered once (from the settled load pass) and scaled to a month later.
  function meter(u, ctx, clients) {
    const m = ctx.m;
    u.cdnGb = (u.cdnGb || 0) + (ctx.bytes?.cdnGb || 0);
    u.egressGb = (u.egressGb || 0) + (ctx.bytes?.egressGb || 0);
    u.req = u.req || {}; u.reads = u.reads || {}; u.writes = u.writes || {};
    for (const id of m.ids) {
      const L = ctx.load[id] || {}, n = m.nodes[id];
      let raw = 0, r = 0, w = 0;
      for (const [t, v] of Object.entries(L)) {
        if (t === 'cpuMs' || t === 'inline') continue;
        const real = v / (n.role === 'store' ? storeWeight(n, t) : (t === 'realtime' && n.defId !== 'websocket-server') ? 4 : t === 'media' && n.role === 'compute' ? 3 : t === 'upload' && n.role === 'compute' ? 6 : 1);
        raw += real; if (READISH.has(t)) r += real; else w += real;
      }
      u.req[id] = (u.req[id] || 0) + raw * 3600; u.reads[id] = (u.reads[id] || 0) + r * 3600; u.writes[id] = (u.writes[id] || 0) + w * 3600;
    }
    const wr = sum(m.ids.filter(id => m.nodes[id].defId === 'db-sql' || m.nodes[id].defId === 'db-nosql'), id => ctx.load[id]?.write || 0);
    if (m.regions > 1) u.xRegionGb = (u.xRegionGb || 0) + wr * (ctx.scn.traffic.write?.kb || 1) * 3600 / 1e6 * (m.regions - 1);
    void clients;
  }

  // ---------- the bill ----------
  function cost(m, scn, usage, avgCount) {
    const items = [], month = 30, net = m.econ.network, R = m.regions;
    for (const id of m.ids) {
      const n = m.nodes[id], t = n.tier, d = n.def;
      if (n.role === 'source') continue;
      const count = avgCount[id] ?? n.count;
      let usd = 0, why = [];
      if (n.defId === 'db-sql') {
        const copies = n.shards * (1 + n.replicas + (n.azs > 1 ? 1 : 0));
        usd += (t.usd || 0) * copies * R;
        usd += (scn.data?.gb || 0) * (d.perGbMonth || 0) * (1 + n.replicas + (n.azs > 1 ? 1 : 0)) * R;
        why.push(`${n.shards > 1 ? n.shards + ' shards × ' : ''}${1 + n.replicas + (n.azs > 1 ? 1 : 0)} copies of ${t.label}`);
      } else if (n.role === 'cache') {
        usd += (t.usd || 0) * n.count * (n.azs > 1 ? 2 : 1) * R;
        why.push(`${n.count} × ${t.label}${n.azs > 1 ? ' with replicas' : ''}`);
      } else {
        const fixed = (t.usd || 0) * (d.opts?.includes('count') ? count : 1) * (n.role === 'external' || n.role === 'cdn' || n.defId === 'dns' ? 1 : R);
        usd += fixed;
        if (fixed) why.push(`${d.opts?.includes('count') ? `${count === Math.round(count) ? count : count.toFixed(1)} × ` : ''}${t.label}`);
      }
      const reqM = (usage.req?.[id] || 0) * month / 1e6;
      if (t.perMReq) { usd += reqM * t.perMReq; why.push(`${fmtN(reqM)}M requests`); }
      if (t.perMRead) { const r = (usage.reads?.[id] || 0) * month / 1e6, w = (usage.writes?.[id] || 0) * month / 1e6; usd += r * t.perMRead + w * (t.perMWrite || 0); why.push(`${fmtN(r)}M reads, ${fmtN(w)}M writes`); }
      if (n.defId === 'db-nosql') usd += (scn.data?.gb || 0) * d.perGbMonth * R;
      if (n.defId === 'object-store') { usd += (scn.data?.mediaGb || 0) * d.perGbMonth; why.push(`${fmtN(scn.data?.mediaGb || 0)} GB stored`); }
      if (n.defId === 'search-engine') usd += (scn.data?.gb || 0) * 0.3 * (d.perGbMonth || 0);
      if (n.defId === 'cdn') { const gb = (usage.cdnGb || 0) * month; usd += gb * t.perGb; why.push(`${fmtN(gb)} GB served`); }
      if (usd > 0 || n.role !== 'pass') items.push({ id, defId: n.defId, kind: d.kind, usd, detail: why.join(' · ') });
    }
    const egress = (usage.egressGb || 0) * month * net.egressPerGb;
    if (egress > 0.5) items.push({ id: '_egress', defId: '_egress', kind: 'network', usd: egress, detail: `${fmtN((usage.egressGb || 0) * month)} GB to users from origin` });
    const x = (usage.xRegionGb || 0) * month * net.crossRegionPerGb;
    if (x > 0.5) items.push({ id: '_xregion', defId: '_xregion', kind: 'network', usd: x, detail: 'Replication between regions' });
    const total = sum(items, i => i.usd), byKind = {};
    for (const i of items) byKind[i.kind] = (byKind[i.kind] || 0) + i.usd;
    items.sort((a, b) => b.usd - a.usd);
    return { total, items, byKind };
  }
  // The bill without running a day: fixed prices only, for the live readout while drawing.
  function quickCost(graph, econ, scn) {
    if (scn && scn.ai) return AI().quickCost(graph, econ);
    const m = prepare(graph, econ);
    return cost(m, normalize(scn || {}), {}, {});
  }
  const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 10 ? Math.round(n).toLocaleString('en') : n >= 1 ? n.toFixed(1) : n.toFixed(2);

  // ---------- scoring ----------
  function summarize(m, scn, ticks, bill, lost, worstLag) {
    const slo = scn.slo || {}, quiet = ticks.filter(t => !t.mods.active.length);
    const legit = sum(ticks, t => t.legit), good = sum(ticks, t => t.legit * t.ok);
    const availability = legit ? 100 * good / legit : 100;
    const p99 = {}, p99Incident = {};
    for (const t of Object.keys(ticks[0]?.types || {})) {
      if (t === 'attack') continue;
      p99[t] = Math.max(0, ...(quiet.length ? quiet : ticks).map(x => x.types[t]?.p99 || 0));
      p99Incident[t] = Math.max(0, ...ticks.map(x => x.types[t]?.p99 || 0));
    }
    const objectives = [];
    const target = slo.availability ?? 99.9;
    objectives.push({ id: 'availability', label: 'Availability over the day', target: `${target}%`, actual: `${availability >= 99.99 ? availability.toFixed(3) : availability.toFixed(2)}%`, pass: availability >= target - 1e-9 });
    for (const [t, ms] of Object.entries(slo.p99 || {})) {
      if (p99[t] == null) continue;
      objectives.push({ id: 'p99-' + t, label: `${LABEL[t] || t}: p99 on a normal hour`, target: `≤ ${ms} ms`, actual: `${p99[t] >= TIMEOUT ? 'timing out' : Math.round(p99[t]) + ' ms'}`, pass: p99[t] <= ms });
    }
    if (slo.budget) objectives.push({ id: 'budget', label: 'Monthly bill', target: `≤ $${slo.budget.toLocaleString('en')}`, actual: `$${Math.round(bill.total).toLocaleString('en')}`, pass: bill.total <= slo.budget });
    if (slo.lagMin != null && m.of('queue').length + Object.keys(ticks[0]?.unserved || {}).filter(k => k.startsWith('job:')).length) {
      objectives.push({ id: 'lag', label: 'Background work delay', target: `≤ ${slo.lagMin} min`, actual: Number.isFinite(worstLag) ? `${Math.round(worstLag)} min` : 'never finishes', pass: worstLag <= slo.lagMin });
    }
    if (slo.noLoss) objectives.push({ id: 'loss', label: 'Acknowledged writes lost', target: '0', actual: Math.round(lost).toLocaleString('en'), pass: lost < 1 });
    const unserved = {};
    for (const t of ticks) for (const [k, v] of Object.entries(t.unserved)) unserved[k] = (unserved[k] || 0) + v;
    const jobsDropped = Object.keys(unserved).some(k => k.startsWith('job:'));
    if (jobsDropped && slo.lagMin != null && !objectives.some(o => o.id === 'lag')) objectives.push({ id: 'lag', label: 'Background work delay', target: `≤ ${slo.lagMin} min`, actual: 'never runs', pass: false });
    const all = objectives.every(o => o.pass);
    const budgetOk = !slo.budget || bill.total <= slo.budget * 1.5;
    const stars = all && slo.budget && bill.total <= slo.budget * 0.8 ? 3 : all ? 2 : availability >= Math.min(99, target) && budgetOk ? 1 : 0;
    const peakTick = ticks.reduce((a, t) => (t.legit > (a?.legit || 0) && !t.mods.active.length ? t : a), null) || ticks[0];
    return { availability, p99, p99Incident, lost, worstLag, objectives, stars, cost: bill.total, peakHour: peakTick?.h, unserved };
  }

  function eventOutcomes(scn, ticks) {
    return (scn.events || []).map(e => {
      const at = Number(e.at) || 0, dur = Math.max(1, Number(e.dur) || 1);
      const win = ticks.filter(t => t.h >= at && t.h < (e.type === 'poison-message' ? HOURS : at + dur));
      const legit = sum(win, t => t.legit), ok = legit ? sum(win, t => t.legit * t.ok) / legit : 1;
      const lost = sum(win, t => t.lost), lag = Math.max(0, ...win.map(t => Math.max(0, ...Object.values(t.queues).map(q => q.lagMin))));
      const jobs = e.type === 'poison-message';
      const stalled = win.some(t => Object.values(t.queues).some(q => q.stalled));
      const outcome = jobs ? (stalled ? 'outage' : 'handled') : ok >= 0.995 && lost < 1 ? 'handled' : ok >= 0.95 ? 'degraded' : 'outage';
      return { id: e.id || e.type, type: e.type, label: e.label || EVENT_LABEL[e.type] || e.type, at, dur, ok, lost, lag, outcome };
    });
  }

  // ---------- findings: what broke, in the cast's words, tied to a concept ----------
  function findings(m, scn, ticks, bill, s) {
    const out = [], seen = new Set(), add = (id, level, who, concept, text, node) => { if (!seen.has(id)) { seen.add(id); out.push({ id, level, who, concept, text, node }); } };
    const quiet = ticks.filter(t => !t.mods.active.length), peak = ticks.find(t => t.h === s.peakHour) || ticks[0];
    for (const [t, v] of Object.entries(s.unserved)) {
      if (t.startsWith('job:')) add('unserved-' + t, 'bad', 'priya', t === 'job:notify' ? 'async' : 'queues', `Background ${t.slice(4)} jobs have nowhere to run: ${fmtN(v * 3600)} piled up. Connect workers to the queue that receives them.`);
      else if (USER.includes(t)) add('unserved-' + t, 'bad', 'sam', CONCEPT_FOR_TYPE[t] || 'request-flow', `${LABEL[t]} had nowhere to go. Nothing reachable from the client can serve them, so every one failed.`);
    }
    for (const id of m.ids) {
      const st = peak.nodes[id];
      if (!st) continue;
      if (st.status === 'saturated' && !peak.mods.active.length) add('sat-' + id, 'bad', 'priya', CONCEPT_FOR_NODE(m.nodes[id]), `${pretty(m.nodes[id])} is past capacity at the evening peak (${Math.round(st.util * 100)}% of what it can do). Requests queue, time out and get retried.`, id);
      else if (st.util >= 0.85 && !peak.mods.active.length) add('hot-' + id, 'warn', 'priya', CONCEPT_FOR_NODE(m.nodes[id]), `${pretty(m.nodes[id])} runs at ${Math.round(st.util * 100)}% at the evening peak. No headroom for a bad day.`, id);
      if (st.note === 'unbalanced') add('nolb-' + id, 'warn', 'jo', 'balancing', `${pretty(m.nodes[id])} has ${m.nodes[id].count} instances but nothing spreads traffic across them, so one does all the work. Put a load balancer in front.`, id);
    }
    for (const t of ticks) for (const id of m.ids) {
      const st = t.nodes[id];
      if (st.note === 'hot-key') add('hotkey-' + id, 'bad', 'priya', 'hot-keys', `One key took ${Math.round(t.mods.hot * 100)}% of reads and melted a single cache shard. More shards don't help a single key: cache it in the app (local L1) or split it.`, id);
      if (st.note === 'hot-partition') add('hotpart-' + id, 'bad', 'priya', 'hot-keys', `One partition key took more than ~3,000 reads/s and the key-value store throttled it. Put a cache in front of hot keys.`, id);
      if (st.note === 'disk-full') add('disk-' + id, 'bad', 'priya', 'partitioning', `${pretty(m.nodes[id])} is out of disk: ${fmtN(scn.data.gb)} GB of data on ${m.nodes[id].shards} × ${m.nodes[id].tier.diskGb} GB. Writes fail. Shard it, or move the data to a store that grows.`, id);
      if (st.note === 'blocked') add('blocked-' + id, 'bad', 'priya', 'overload', `${pretty(m.nodes[id])} threads sat waiting on a slow third party, so it stopped serving everything else. Timeouts plus a circuit breaker fail those calls fast and keep the rest alive.`, id);
      if (st.note === 'restore' && t.lost) add('restore-' + id, 'bad', 'priya', 'recovery', `The database primary died with no standby or replica. Writes waited for a restore from backup and about ${fmtN(t.lost)} acknowledged writes were lost.`, id);
      if (st.note === 'promoted' && t.lost) add('promoted-' + id, 'warn', 'priya', 'replication', `A replica was promoted after the primary died. Asynchronous replication lost about ${fmtN(t.lost)} writes that had already been acknowledged. A synchronous standby (multi-AZ) avoids that.`, id);
      if (st.status === 'down' && t.mods.active.length && USER.some(x => t.types[x] && t.types[x].ok < 0.9)) add('spof-' + id, 'bad', 'priya', t.mods.active.includes('region-outage') || ticks.some(x => x.mods.active.includes('region-outage') && x.h === t.h) ? 'regions' : 'redundancy', `${pretty(m.nodes[id])} went down with its zone or region, and it was the only copy on the request path.`, id);
    }
    for (const e of scn.events || []) {          // the first thing that broke during each incident
      const win = ticks.filter(t => t.h >= e.at && t.h < e.at + Math.max(1, e.dur || 1) && t.ok < 0.99);
      for (const t of win) {
        const worst = m.ids.filter(id => t.nodes[id].status === 'saturated' || t.nodes[id].status === 'down').sort((x, y) => t.nodes[y].util - t.nodes[x].util)[0];
        if (!worst) continue;
        const st = t.nodes[worst];
        add('broke-' + (e.id || e.type), 'bad', 'priya', e.type === 'surge' ? 'scaling' : CONCEPT_FOR_NODE(m.nodes[worst]),
          `${e.label || EVENT_LABEL[e.type]} at ${String(e.at).padStart(2, '0')}:00: ${pretty(m.nodes[worst]).replace(/^The /, 'the ')} ${st.status === 'down' ? 'went down' : `hit ${Math.round(st.util * 100)}% of capacity`} and ${Math.round((1 - t.ok) * 100)}% of requests failed.`, worst);
        break;
      }
    }
    const ev = new Set((scn.events || []).map(e => e.type));
    const during = type => ticks.filter(t => (scn.events || []).some(e => e.type === type && t.h >= e.at && t.h < e.at + Math.max(1, e.dur || 1)));
    if (ev.has('cache-flush') && during('cache-flush').some(t => t.ok < 0.98)) add('stampede', 'bad', 'priya', 'hot-keys', 'The cache emptied and every miss hit the database at once. Request coalescing (one refill per key) or a warm replica keeps the database standing.');
    if (ev.has('cache-node') && during('cache-node').some(t => t.ok < 0.98)) add('remap', 'bad', 'jo', 'consistent-hashing', 'Losing one cache node emptied most of the cache, because hash-mod-N remaps almost every key when N changes. A consistent-hash ring only moves that node\'s share.');
    if (ev.has('bad-deploy') && during('bad-deploy').some(t => t.ok < 0.97)) add('deploy', 'bad', 'priya', 'observability', m.has('monitoring') ? 'The bad deploy reached every server before anyone noticed. A canary release sends it to a few first, so the alert fires while most users are fine.' : 'A bad deploy broke a third of requests for hours, because nothing was watching error rates. Add monitoring, then canary releases.');
    if (ev.has('poison-message') && ticks.some(t => Object.values(t.queues).some(q => q.stalled))) add('poison', 'bad', 'priya', 'dead-letters', 'One message that always fails jammed the queue, and everything behind it waited. A dead-letter queue parks it after a few attempts.');
    if (ev.has('ddos') && during('ddos').some(t => t.ok < 0.98)) add('ddos', 'bad', 'marcus', 'rate-limiting', 'Attack traffic reached the origin and took real users down with it. Shed it at the edge: a rate limiter or gateway in front, and a CDN to soak up volume.');
    if (ticks.some(t => t.retryMult > 1.5)) add('retry', 'warn', 'priya', 'retries', `Failures made clients retry, which multiplied load ${Math.max(...ticks.map(t => t.retryMult)).toFixed(1)}× and kept the system down after the trigger passed. Shedding early with 429s and Retry-After breaks the loop.`);
    if (ev.has('surge') && during('surge').some(t => t.ok < 0.98) && m.ids.some(id => m.nodes[id].autoscale)) add('lag-scale', 'warn', 'marcus', 'scaling', 'Autoscaling reacted an hour late: the surge hit before new servers were up. For a spike you know about, scale up beforehand.');
    const flags = {}; for (const t of ticks) for (const [k, v] of Object.entries(t.flags)) flags[k] = (flags[k] || 0) + v;
    for (const k of Object.keys(flags)) if (k.startsWith('inline:')) add(k, 'warn', 'jo', 'async', `Every request waits for its ${k.slice(7)} work to finish. Put that work on a queue and answer straight away.`);
    if (flags.proxyBytes) add('proxy', 'warn', 'marcus', 'object-storage', 'Media bytes go through the app servers, which burns their CPU and bandwidth. Let clients upload and download straight from object storage (signed URLs) and a CDN.');
    if (flags.searchScan) add('scan', 'warn', 'jo', 'search', 'Searches run as LIKE scans on the main database, each costing about 25 normal queries. A search index answers them cheaply.');
    if (flags.geoScan) add('geoscan', 'warn', 'jo', 'geo', 'Nearby lookups scan latitude and longitude ranges in the database. A geospatial index (geohash or quadtree) is built for this.');
    if (flags.polling) add('poll', 'warn', 'sam', 'realtime', 'Live messages arrive by polling: a second late on average and four times the load. Hold WebSocket connections instead.');
    if (flags.noBackplane) add('backplane', 'bad', 'sam', 'realtime', 'Several WebSocket servers, but nothing passes messages between them, so a message only reaches people on the same server. Add a pub/sub backplane.');
    if (scn.far?.share >= 0.01 && !(m.regions > 1 && m.has('dns'))) add('far', s.p99.read > (scn.slo?.p99?.read || 1e9) ? 'bad' : 'tip', 'sam', 'regions', `${Math.round(scn.far.share * 100)}% of users are far from the only region, so every request crosses an ocean twice (~${2 * (scn.far.rttMs || m.econ.network.farRttMs)} ms). A second region with geo DNS fixes it; a CDN fixes it for cacheable content.`);
    if (m.regions > 1 && !m.has('dns')) add('nodns', 'warn', 'priya', 'regions', 'Two regions but no geo DNS: nothing sends users to the nearest one or away from a dead one.');
    if (scn.slo?.lagMin != null && Number.isFinite(s.worstLag) && s.worstLag > scn.slo.lagMin && !ticks.some(t => Object.values(t.queues).some(q => q.stalled))) {
      const q = ticks.map(t => Object.values(t.queues)).flat().reduce((a, x) => (x.inflow > (a?.inflow || 0) ? x : a), null);
      add('lag', 'bad', 'priya', 'queues', `Background work fell ${Math.round(s.worstLag)} minutes behind. At peak ${fmtN(q?.inflow || 0)} jobs/s arrive and the workers can't keep up. Add workers (or autoscale them on queue depth).`);
    }
    if (m.of('queue').length && !m.ids.some(id => m.nodes[id].role === 'dlq')) add('no-dlq', 'tip', 'priya', 'dead-letters', 'No dead-letter queue. One malformed message can stall a consumer for good.');
    // Money.
    const total = bill.total || 1;
    for (const i of bill.items) {
      if (i.id.startsWith('_')) continue;
      const util = Math.max(...ticks.map(t => t.nodes[i.id]?.util || 0));
      const n = m.nodes[i.id], smaller = n.count > 1 || (n.def.tiers || []).some(t => (t.usd || 0) < (n.tier.usd || 0));
      if (smaller && i.usd / total > 0.15 && util < 0.15 && i.usd > 50) add('idle-' + i.id, 'tip', 'marcus', 'estimates', `${pretty(m.nodes[i.id])} costs $${Math.round(i.usd).toLocaleString('en')} a month and never passes ${Math.round(util * 100)}% busy. We're paying for air.`, i.id);
    }
    const egress = bill.items.find(i => i.id === '_egress');
    const cacheable = (scn.traffic.media?.perUser && !ticks.some(t => t.types.media) ? false : !!scn.traffic.media?.perUser) || (scn.traffic.read?.cdn || 0) > 0;
    const edge = m.ids.some(id => m.nodes[id].role === 'source' && m.kids[id].some(k => m.nodes[k].defId === 'cdn'));
    if (egress && egress.usd / total > 0.35) {
      if (cacheable && !edge) add('egress', 'warn', 'marcus', 'cdn', `Bandwidth from origin is ${Math.round(egress.usd / total * 100)}% of the bill. A CDN serves cacheable bytes for about half the price per GB.`);
      else add('egress', 'tip', 'marcus', 'estimates', `Bandwidth is ${Math.round(egress.usd / total * 100)}% of the bill. These responses are personal, so a CDN can't cache them: smaller payloads (compression, fewer fields) are the lever.`);
    }
    const gw = bill.items.find(i => i.defId === 'api-gateway');
    if (gw && gw.usd / total > 0.3) add('gateway', 'tip', 'marcus', 'estimates', `The per-request gateway is ${Math.round(gw.usd / total * 100)}% of the bill. At this volume a self-hosted gateway fleet is cheaper.`);
    if (scn.slo?.budget && total > scn.slo.budget) add('budget', 'bad', 'marcus', 'estimates', `$${Math.round(total).toLocaleString('en')} a month against a budget of $${scn.slo.budget.toLocaleString('en')}. Find what's oversized before adding anything.`);
    for (const c of m.of('cache')) {
      const R = scn.traffic.read || {}, mem = (m.nodes[c].tier.gb || 6) * m.nodes[c].count;
      if ((R.workingSetGb || 0) > mem * 4) add('small-cache-' + c, 'tip', 'jo', 'caching', `The hot data is about ${fmtN(R.workingSetGb)} GB but the cache holds ${fmtN(mem)} GB, so the hit rate is well below what it could be.`, c);
    }
    if (!out.some(f => f.level === 'bad') && s.stars >= 2) add('ok', 'good', 'marcus', '', s.stars === 3 ? 'Every target met with money to spare. That\'s the design I want to defend in the board meeting.' : 'Every target met. Now trim it: what could you remove and still pass?');
    const order = { bad: 0, warn: 1, tip: 2, good: 3 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }
  const CONCEPT_FOR_TYPE = { read: 'caching', write: 'storage', media: 'object-storage', upload: 'object-storage', search: 'search', realtime: 'realtime', geo: 'geo', payment: 'payments' };
  function CONCEPT_FOR_NODE(n) {
    if (n.defId === 'db-sql') return 'storage';
    if (n.role === 'cache') return 'caching';
    if (n.role === 'queue' || n.role === 'worker') return 'queues';
    if (n.role === 'compute') return 'scaling';
    return 'scaling';
  }
  const NAMES = { 'db-sql': 'The SQL database', 'db-nosql': 'The key-value store', cache: 'The cache', 'app-server': 'The app tier', 'websocket-server': 'The WebSocket tier',
    worker: 'The workers', 'message-queue': 'The queue', 'search-engine': 'The search cluster', 'api-gateway': 'The gateway', 'rate-limiter': 'The rate limiter',
    'object-store': 'Object storage', cdn: 'The CDN', 'load-balancer': 'The load balancer', payment: 'The payment service', 'auth-service': 'The auth service' };
  const pretty = n => NAMES[n.defId] || ('The ' + n.defId.replace(/-/g, ' '));

  // ---------- scenarios ----------
  function normalize(s) {
    const T = { ...(s.traffic || {}) };
    if (!Object.keys(T).some(k => USER.includes(k))) { T.read = { perUser: 10 }; T.write = { perUser: 1 }; }
    for (const t of USER) if (T[t]) T[t] = { kb: KB[t], ...T[t] };
    T.peak = T.peak || 2;
    return { id: s.id || 'sandbox', title: s.title || 'Sandbox', dau: Math.max(0, Number(s.dau) || 1000), traffic: T, data: { gb: 10, mediaGb: 0, ...(s.data || {}) },
      far: s.far || null, slo: { availability: 99.9, ...(s.slo || {}) }, events: (s.events || []).map((e, i) => ({ id: e.id || `${e.type}-${i}`, dur: 1, ...e })) };
  }
  // The sandbox's scale inputs as a scenario: same rules of thumb as before, no events, no budget.
  function fromScale(scale = {}, nfr = {}) {
    const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) && n >= 0 ? n : 0; };
    const dau = num(scale.dau) || 10000, r = num(scale.readQps), w = num(scale.writeQps);
    const slo = { availability: parseFloat(nfr.availability) || 99.9, p99: { read: num(nfr.latencyMs) || 200, write: (num(nfr.latencyMs) || 200) * 2 } };
    return normalize({ id: 'sandbox', title: 'Sandbox', dau, traffic: { read: { perUser: r ? r * DAY / dau : 10, cacheable: 0.85, workingSetGb: dau * 0.2 * 10 / 1e6 }, write: { perUser: w ? w * DAY / dau : 1 }, peak: 2.5 },
      data: { gb: num(scale.storageGb) || dau * 0.0005 }, slo });
  }
  // The numbers an interviewer expects you to work out first, computed from the scenario itself.
  function truth(s0) {
    if (s0 && s0.ai) {
      const a = AI().normalize(s0), q = a.dau * a.traffic.ask.perUser, peak = Math.max(...AI().curve(a)), ctx = a.ai.topK * a.ai.chunkTokens;
      const tin = a.ai.promptTokens + ctx, tout = a.ai.outTokens;
      return { questionsPerDay: q, peakQps: q / DAY * peak, tokensPerQuestion: tin + tout, largeModelMonthUsd: q * 30 * (tin * 3 + tout * 15) / 1e6 };
    }
    const s = normalize(s0), T = s.traffic, peak = Math.max(...curve(s));
    const avg = t => s.dau * (T[t]?.perUser || 0) / DAY;
    const out = { peakReadRps: (avg('read') + avg('media') + avg('search') + avg('geo')) * peak, peakWriteRps: (avg('write') + avg('upload') + avg('realtime') + avg('payment') + avg('locate')) * peak,
      storageGbYear: s.dau * 365 * ((T.write?.perUser || 0) * (T.write?.kb || 1) + (T.upload?.perUser || 0) * (T.upload?.kb || 2000) + (T.realtime?.perUser || 0) * (T.realtime?.kb || 1)) / 1e6,
      egressTbMonth: s.dau * 30 * sum(USER, t => (T[t]?.perUser || 0) * (t === 'upload' ? 0 : T[t]?.kb || 0)) / 1e9,
      cacheGb: T.read?.workingSetGb || 0 };
    return out;
  }
  const ESTIMATES = { questionsPerDay: 'Questions per day', peakQps: 'Questions per second at peak', tokensPerQuestion: 'Tokens per question (in + out)',
    largeModelMonthUsd: 'Monthly bill if the large model answers everything ($)', peakReadRps: 'Peak reads per second', peakWriteRps: 'Peak writes per second', storageGbYear: 'New data per year (GB)', egressTbMonth: 'Bandwidth to users per month (TB)', cacheGb: 'Cache size for the hot set (GB)' };
  function grade(s, answers = {}, keys = Object.keys(ESTIMATES)) {
    const t = truth(s);
    return keys.filter(k => t[k] > 0).map(k => {
      const a = parseFloat(String(answers[k] ?? '').replace(/,/g, '')), truthV = t[k];
      const ratio = a > 0 ? Math.max(a / truthV, truthV / a) : Infinity;
      return { key: k, label: ESTIMATES[k], answer: a > 0 ? a : null, truth: truthV, ratio, verdict: ratio <= 2 ? 'good' : ratio <= 4 ? 'close' : 'off' };
    });
  }

  // ---------- the daily incident ----------
  const hash = str => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const DAILY_EVENTS = [
    { type: 'surge', params: { mult: 4 }, dur: 2 }, { type: 'hot-key', params: { share: 0.3 }, dur: 2 }, { type: 'cache-flush', dur: 1 },
    { type: 'az-outage', dur: 2 }, { type: 'db-failover', dur: 1 }, { type: 'bad-deploy', params: { err: 0.3 }, dur: 2 },
    { type: 'slow-dependency', params: { ms: 5000, err: 0.3 }, dur: 2 }, { type: 'poison-message', dur: 1 }, { type: 'ddos', params: { mult: 15 }, dur: 1 }, { type: 'cache-node', dur: 1 }];
  // One unlocked scenario a day with a twist: an extra incident at a random hour, the same for the whole day.
  function daily(scenarios, date, unlocked) {
    const pool = scenarios.filter(s => !s.ai && (!unlocked || unlocked.includes(s.id)));
    if (!pool.length) return null;
    const h = hash('ripple-' + date), base = pool[h % pool.length];
    const fit = DAILY_EVENTS.filter(e => (e.type !== 'poison-message' || hasJobs(base)) && (e.type !== 'slow-dependency' || base.traffic?.payment || base.traffic?.write?.jobs?.some(j => j.kind === 'notify')));
    const twist = fit[(h >>> 8) % fit.length], at = 9 + ((h >>> 16) % 11);
    return { ...base, id: `daily-${date}`, base: base.id, daily: date, title: `Daily incident: ${base.title}`,
      events: [...(base.events || []), { id: 'twist', ...twist, at, label: `Twist: ${EVENT_LABEL[twist.type]}` }] };
  }
  const hasJobs = s => ['read', 'write', 'upload'].some(t => (s.traffic?.[t]?.jobs || []).length);

  const api = { VERSION, HOURS, USER, LABEL, KB, EVENT_LABEL, ESTIMATES, config, prepare, run, cost, quickCost, normalize, fromScale, truth, grade, daily, curve, modsAt, fmtN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SDSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
