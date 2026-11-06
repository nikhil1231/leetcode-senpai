// Pure logic behind the design walkthroughs: reading a design's Mermaid graph, laying it out, tracing a
// flow's path, and a queueing model for "what happens at N requests per second". No DOM, no I/O.
// The model is an approximation (M/M/c-style waiting), good for finding which component saturates first
// and how a swap changes that; it is not a benchmark.
(function (root) {
  'use strict';

  // ---------- Mermaid (the subset the designs use: graph LR, nodes, arrows) ----------
  const ARROW = /^(-->|---|-\.->|-\.-|==>)(\|[^|]*\|)?/;
  const NODE = /^([A-Za-z][\w]*(?:-[\w]+)*)(?:\(\[(.*?)\]\)|\[\((.*?)\)\]|\[\[(.*?)\]\]|\(\((.*?)\)\)|\[(.*?)\]|\{(.*?)\})?/;

  function parseMermaid(src) {
    let s = String(src || '').replace(/^\s*(?:graph|flowchart)\s+(LR|RL|TD|TB|BT)\b/, '');
    const nodes = new Map(), edges = [];
    let prev = null, pending = null;
    const touch = (id, label, shape) => {
      const n = nodes.get(id) || { id, label: id, shape: 'box' };
      if (label) n.label = label.trim();
      if (shape) n.shape = shape;
      nodes.set(id, n);
    };
    while (s.length) {
      s = s.replace(/^[\s;]+/, '');
      if (!s) break;
      let m = s.match(ARROW);
      if (m) { pending = { label: (m[2] || '').replace(/\|/g, '').trim() }; s = s.slice(m[0].length); continue; }
      m = s.match(NODE);
      if (m) {
        const label = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? m[7];
        touch(m[1], label, m[3] != null ? 'db' : m[4] != null ? 'queue' : m[7] != null ? 'decision' : '');
        if (pending && prev) edges.push({ from: prev, to: m[1], label: pending.label });
        prev = m[1]; pending = null; s = s.slice(m[0].length); continue;
      }
      s = s.slice(1);
    }
    return { nodes: [...nodes.values()], edges };
  }

  // ---------- Layout: layered, left to right ----------
  function layout(graph, o = {}) {
    const W = o.nodeW || 156, H = o.nodeH || 54, GX = o.gapX || 64, GY = o.gapY || 22, PAD = o.pad || 16;
    const ids = graph.nodes.map(n => n.id), rank = Object.fromEntries(ids.map(i => [i, 0]));
    const real = graph.edges.filter(e => e.from !== e.to);
    for (let pass = 0; pass < ids.length; pass++) {           // longest path; the pass cap breaks cycles
      let moved = false;
      for (const e of real) if (rank[e.to] < rank[e.from] + 1 && rank[e.from] + 1 < ids.length) { rank[e.to] = rank[e.from] + 1; moved = true; }
      if (!moved) break;
    }
    const cols = [];
    ids.forEach(i => (cols[rank[i]] = cols[rank[i]] || []).push(i));
    const filled = cols.filter(Boolean);
    const pos = {};
    for (let sweep = 0; sweep < 3; sweep++) {                  // barycentre ordering to reduce crossings
      filled.forEach((col, c) => {
        const key = id => {
          const nb = real.filter(e => (sweep % 2 ? e.from === id : e.to === id)).map(e => (sweep % 2 ? e.to : e.from)).filter(n => pos[n] != null);
          return nb.length ? nb.reduce((a, n) => a + pos[n], 0) / nb.length : pos[id] ?? col.indexOf(id);
        };
        col.sort((a, b) => key(a) - key(b));
        col.forEach((id, i) => { pos[id] = i; });
      });
    }
    const tall = Math.max(1, ...filled.map(c => c.length)), height = tall * H + (tall - 1) * GY + PAD * 2;
    const at = {};
    filled.forEach((col, c) => {
      const used = col.length * H + (col.length - 1) * GY, top = PAD + (height - PAD * 2 - used) / 2;
      col.forEach((id, i) => { at[id] = { x: PAD + c * (W + GX), y: top + i * (H + GY), w: W, h: H }; });
    });
    const width = PAD * 2 + filled.length * W + (filled.length - 1) * GX;
    const out = graph.edges.map(e => {
      const a = at[e.from], b = at[e.to];
      if (!a || !b) return null;
      let d;
      if (e.from === e.to) d = `M ${a.x + a.w} ${a.y + 14} C ${a.x + a.w + 36} ${a.y - 10}, ${a.x + a.w + 36} ${a.y + a.h + 10}, ${a.x + a.w} ${a.y + a.h - 14}`;
      else if (b.x > a.x) { const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2; d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`; }
      else { const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y + b.h; d = `M ${x1} ${y1} C ${x1} ${y1 + 46}, ${x2} ${y2 + 46}, ${x2} ${y2}`; }
      return { from: e.from, to: e.to, label: e.label, d };
    }).filter(Boolean);
    return { nodes: graph.nodes.map(n => ({ ...n, ...at[n.id] })), edges: out, width, height: height + 24 };
  }

  // ---------- Flows ----------
  const flowPath = steps => [...new Set((steps || []).map(s => s.componentId))];

  function diffKeys(before, after) {
    const b = before && typeof before === 'object' ? before : {}, a = after && typeof after === 'object' ? after : {};
    return [...new Set([...Object.keys(b), ...Object.keys(a)])].map(key => {
      const x = JSON.stringify(b[key]), y = JSON.stringify(a[key]);
      return { key, before: b[key], after: a[key], changed: x !== y };
    });
  }

  // ---------- Queueing model ----------
  const TIMEOUT_MS = 30000;
  const mid = r => Array.isArray(r) ? (Number(r[0]) + Number(r[1])) / 2 : Number(r) || 0;

  // One component at `lambda` requests/s. `sim`: {serviceTimeMs:[min,max], concurrency, failureRate}.
  function stage(sim, lambda) {
    const s = Math.max(mid(sim.serviceTimeMs), 0.05), sMax = Math.max(Array.isArray(sim.serviceTimeMs) ? Number(sim.serviceTimeMs[1]) : s, s);
    const fail = Math.min(Math.max(Number(sim.failureRate) || 0, 0), 1), c = sim.concurrency;
    if (c == null) return { unlimited: true, util: 0, capacity: Infinity, p50: s, p99: sMax, status: 'ok', out: lambda * (1 - fail), fail };
    const capacity = c / (s / 1000), rho = lambda / capacity;
    if (rho >= 1) return { util: rho, capacity, p50: TIMEOUT_MS, p99: TIMEOUT_MS, status: 'saturated', out: capacity * (1 - fail), fail };
    const pw = Math.min(1, Math.pow(rho, Math.sqrt(2 * (c + 1)))), drain = (c / s) * (1 - rho);      // drain: 1/ms
    const p50 = s + (pw > 0.5 ? Math.log(2 * pw) / drain : 0), p99 = sMax + (pw > 0.01 ? Math.log(100 * pw) / drain : 0);
    return { util: rho, capacity, p50: Math.min(p50, TIMEOUT_MS), p99: Math.min(p99, TIMEOUT_MS),
      status: rho < 0.6 ? 'ok' : rho < 0.85 ? 'warm' : 'hot', out: lambda * (1 - fail), fail };
  }

  // path: component ids in order; components: {id: {sim}}; overrides: {id: sim} replaces a component's parameters.
  function simulate({ path, components, qps, overrides = {} }) {
    let lambda = Math.max(Number(qps) || 0, 0);
    const stages = [];
    let p50 = 0, p99 = 0;
    for (const id of path) {
      const sim = overrides[id] || components[id]?.sim;
      if (!sim) continue;
      const r = stage(sim, lambda);
      stages.push({ id, lambda, ...r });
      p50 += r.p50; p99 += r.p99; lambda = r.out;
    }
    const worst = stages.filter(s => !s.unlimited).reduce((m, s) => (!m || s.util > m.util ? s : m), null);
    const offered = Math.max(Number(qps) || 0, 1e-9);
    return { stages, p50: Math.min(p50, TIMEOUT_MS), p99: Math.min(p99, TIMEOUT_MS), throughput: lambda, successRate: Math.min(1, lambda / offered),
      bottleneck: worst && worst.util >= 0.6 ? worst.id : null };
  }

  // The offered load (requests/s) at which the first component saturates, and which one it is.
  function saturationQps({ path, components, overrides = {} }) {
    const saturated = q => simulate({ path, components, qps: q, overrides }).stages.find(s => s.status === 'saturated');
    if (!saturated(1e12)) return { qps: Infinity, id: null };
    let lo = 0, hi = 1e12;
    for (let i = 0; i < 80; i++) { const mid = Math.sqrt(Math.max(lo, 1e-3) * hi); if (saturated(mid)) hi = mid; else lo = mid; }
    return { qps: hi, id: saturated(hi).id };
  }

  const api = { parseMermaid, layout, flowPath, diffKeys, stage, simulate, saturationQps, TIMEOUT_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SDStress = api;
})(typeof window !== 'undefined' ? window : globalThis);
