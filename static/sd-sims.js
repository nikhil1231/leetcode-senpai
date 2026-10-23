// Lesson simulators, part 1: shared helpers plus queueing, caching, latency, hashing,
// quorums, trade-off curves, load balancing, rate limiting, bottlenecks, retries,
// replication lag and an index planner. Pure client-side models with seeded randomness.
(function () {
  'use strict';
  const registry = {};
  const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const expo = (r, rate) => -Math.log(1 - r()) / rate;
  const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length))] : 0;
  const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); return (h ^ h >>> 15) >>> 0; };
  const fmt = (n, d = 0) => !isFinite(n) ? '∞' : Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e4 ? (n / 1e3).toFixed(0) + 'k' : Number(n.toFixed(d)).toLocaleString();
  const ms = n => !isFinite(n) ? '∞' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + ' s' : n.toFixed(n < 10 ? 1 : 0) + ' ms';
  const bytes = n => { const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB']; let i = 0; while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; } return (n >= 100 ? n.toFixed(0) : n.toFixed(1)) + ' ' + u[i]; };

  // ---------- Controls ----------
  // defs: {key,label,type:'range'|'select'|'toggle'|'button',min,max,step,options:[[v,label]],fmt,log}
  function controls(host, defs, state, onChange) {
    host.innerHTML = defs.map(d => {
      if (d.type === 'select') return `<label class="sim-ctl"><span>${esc(d.label)}</span><select data-k="${d.key}">${d.options.map(([v, l]) => `<option value="${esc(v)}" ${String(state[d.key]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
      if (d.type === 'toggle') return `<label class="sim-ctl sim-toggle"><input type="checkbox" data-k="${d.key}" ${state[d.key] ? 'checked' : ''}><span>${esc(d.label)}</span></label>`;
      if (d.type === 'button') return `<button type="button" class="button sim-btn" data-act="${d.key}">${esc(d.label)}</button>`;
      const v = d.log ? Math.log10(state[d.key]) : state[d.key];
      return `<label class="sim-ctl"><span>${esc(d.label)} <b data-out="${d.key}">${esc((d.fmt || fmt)(state[d.key]))}</b></span><input type="range" data-k="${d.key}" min="${d.log ? Math.log10(d.min) : d.min}" max="${d.log ? Math.log10(d.max) : d.max}" step="${d.log ? 0.01 : d.step || 1}" value="${v}"></label>`;
    }).join('');
    host.querySelectorAll('[data-k]').forEach(n => n.addEventListener('input', () => {
      const d = defs.find(x => x.key === n.dataset.k);
      let v = d.type === 'toggle' ? n.checked : d.type === 'select' ? (isNaN(Number(n.value)) ? n.value : Number(n.value)) : Number(n.value);
      if (d.log) v = Number((10 ** v).toPrecision(2));
      state[d.key] = v;
      const out = host.querySelector(`[data-out="${d.key}"]`); if (out) out.textContent = (d.fmt || fmt)(v);
      onChange(d.key);
    }));
    host.querySelectorAll('[data-act]').forEach(n => n.addEventListener('click', () => onChange(n.dataset.act, true)));
  }

  // ---------- Charts ----------
  // series: [{label, cls, values:[y], dots?}] over x = index * (xMax / (len-1)).
  function chart({ series, w = 640, h = 220, xMax, yMax, xLabel = '', yLabel = '', hlines = [], vlines = [], bands = [], yFmt = fmt, xFmt = fmt, logX = false }) {
    const L = 52, R = 14, T = 14, B = 34, iw = w - L - R, ih = h - T - B;
    const all = series.flatMap(s => s.values.filter(isFinite));
    const top = yMax ?? Math.max(1e-9, ...all, ...hlines.map(l => l.y)) * 1.1;
    const X = (i, n) => L + (n <= 1 ? 0 : i / (n - 1)) * iw;
    const Y = v => T + ih - Math.max(0, Math.min(1, v / top)) * ih;
    const xv = x => L + (logX ? Math.log10(x) / Math.log10(xMax) : x / xMax) * iw;
    const ticks = [0, .25, .5, .75, 1];
    let svg = `<svg class="sim-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(yLabel)} over ${esc(xLabel)}">`;
    bands.forEach(b => { svg += `<rect class="sim-band ${b.cls || ''}" x="${xv(b.from)}" y="${T}" width="${Math.max(0, xv(b.to) - xv(b.from))}" height="${ih}"/>${b.label ? `<text class="sim-band-label" x="${xv(b.from) + 4}" y="${T + 12}">${esc(b.label)}</text>` : ''}`; });
    ticks.forEach(t => { const y = T + ih - t * ih; svg += `<line class="sim-grid" x1="${L}" x2="${L + iw}" y1="${y}" y2="${y}"/><text class="sim-axis" x="${L - 6}" y="${y + 3}" text-anchor="end">${esc(yFmt(top * t))}</text>`; });
    if (xMax != null) ticks.forEach(t => { const x = L + t * iw; svg += `<text class="sim-axis" x="${x}" y="${h - 18}" text-anchor="middle">${esc(xFmt(logX ? xMax ** t : xMax * t))}</text>`; });
    svg += `<text class="sim-axis-label" x="${L + iw / 2}" y="${h - 3}" text-anchor="middle">${esc(xLabel)}</text><text class="sim-axis-label" transform="translate(11 ${T + ih / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`;
    hlines.forEach(l => { svg += `<line class="sim-hline ${l.cls || ''}" x1="${L}" x2="${L + iw}" y1="${Y(l.y)}" y2="${Y(l.y)}"/><text class="sim-hline-label ${l.cls || ''}" x="${L + iw - 4}" y="${Y(l.y) - 4}" text-anchor="end">${esc(l.label)}</text>`; });
    vlines.forEach(l => { svg += `<line class="sim-vline" x1="${xv(l.x)}" x2="${xv(l.x)}" y1="${T}" y2="${T + ih}"/>${l.label ? `<text class="sim-hline-label" x="${xv(l.x) + 4}" y="${T + 24}">${esc(l.label)}</text>` : ''}`; });
    series.forEach(s => {
      const n = s.values.length;
      if (s.dots) s.values.forEach((v, i) => { if (v != null) svg += `<circle class="sim-dot ${s.cls}" cx="${s.xs ? xv(s.xs[i]) : X(i, n)}" cy="${Y(v)}" r="3"/>`; });
      else svg += `<polyline class="sim-line ${s.cls}" points="${s.values.map((v, i) => `${(s.xs ? xv(s.xs[i]) : X(i, n)).toFixed(1)},${Y(isFinite(v) ? v : top).toFixed(1)}`).join(' ')}"/>`;
    });
    svg += '</svg>';
    const legend = series.filter(s => s.label).map(s => `<span class="sim-key ${s.cls}">${esc(s.label)}</span>`).join('');
    return `<div class="sim-chart-wrap">${svg}${legend ? `<div class="sim-legend">${legend}</div>` : ''}</div>`;
  }
  const bars = (items, max) => `<div class="sim-bars">${items.map(it => `<div class="sim-bar-row"><span class="sim-bar-label">${esc(it.label)}</span><span class="sim-bar"><i class="${it.cls || ''}" style="width:${Math.min(100, 100 * it.value / (max || 1))}%"></i>${it.mark != null ? `<em style="left:${Math.min(100, 100 * it.mark / (max || 1))}%"></em>` : ''}</span><span class="sim-bar-value">${esc(it.text ?? fmt(it.value))}</span></div>`).join('')}</div>`;
  const stats = items => `<div class="sim-stats">${items.map(s => `<div class="${s.tone ? 'is-' + s.tone : ''}"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>`;
  function shell(el, extra = '') {
    el.innerHTML = `<div class="sim-body"><div class="sim-controls"></div><div class="sim-view">${extra}<div class="sim-out"></div></div></div>`;
    return { ctl: el.querySelector('.sim-controls'), out: el.querySelector('.sim-out'), view: el.querySelector('.sim-view') };
  }
  // Generic mount: state + defs + compute(state) -> {html, metrics}; handles touched/metrics wiring.
  function simple(el, cfg, api, defaults, defs, compute, onAction) {
    const state = { ...defaults, ...(cfg.initial || {}) };
    const allowed = cfg.controls ? defs.filter(d => cfg.controls.includes(d.key)) : defs;
    const { ctl, out } = shell(el);
    const run = () => { const r = compute(state); out.innerHTML = r.html; api.metrics(r.metrics || {}); };
    controls(ctl, allowed, state, (key, isAction) => { if (isAction && onAction) onAction(key, state); api.touched(); run(); });
    run();
    return { destroy() {} };
  }

  // ---------- 1. Queue: discrete-event M/M/c with bursts and a bounded buffer ----------
  registry.queue = (el, cfg, api) => simple(el, cfg, api,
    { arrival: 18, workers: 10, rate: 2, burst: false, burstSize: 3, cap: 0, random: true, horizon: 300 },
    [{ key: 'arrival', label: 'Arrivals / s', min: 1, max: 60, step: 1 },
      { key: 'workers', label: 'Workers', min: 1, max: 40 },
      { key: 'rate', label: 'Jobs / s per worker', min: 0.5, max: 10, step: 0.5 },
      { key: 'burst', label: 'Burst at t=60s (×3 arrivals for 30 s)', type: 'toggle' },
      { key: 'burstSize', label: 'Burst multiplier', min: 1.5, max: 6, step: 0.5, fmt: v => v + '×' },
      { key: 'cap', label: 'Queue limit (0 = unbounded)', min: 0, max: 5000, step: 50, fmt: v => v ? fmt(v) : 'none' },
      { key: 'random', label: 'Random arrivals & job sizes', type: 'toggle' }],
    s => {
      const r = rng(7), T = s.horizon, cap = s.cap || Infinity, mu = s.rate;
      const lambda = t => s.arrival * (s.burst && t >= 60 && t < 90 ? s.burstSize : 1);
      let t = 0, queue = [], busy = 0, rejected = 0, done = 0;
      const free = [], waits = [], depth = new Array(T + 1).fill(0), ages = new Array(T + 1).fill(0);
      const events = []; // [time, type]
      const push = (time, type) => { let i = events.length; events.push([time, type]); while (i > 0 && events[i - 1][0] > time) { events[i] = events[i - 1]; i--; } events[i] = [time, type]; };
      const nextArrival = now => s.random ? now + expo(r, lambda(now)) : now + 1 / lambda(now);
      const service = () => s.random ? expo(r, mu) : 1 / mu;
      push(nextArrival(0), 'a');
      let sample = 0;
      while (events.length && events[0][0] < T) {
        const [now, type] = events.shift();
        while (sample <= now && sample <= T) { depth[sample] = queue.length; ages[sample] = queue.length ? sample - queue[0] : 0; sample++; }
        t = now;
        if (type === 'a') {
          push(nextArrival(now), 'a');
          if (busy < s.workers) { busy++; waits.push(0); push(now + service(), 'd'); }
          else if (queue.length < cap) queue.push(now);
          else rejected++;
        } else {
          done++;
          if (queue.length) { const since = queue.shift(); waits.push(now - since); push(now + service(), 'd'); }
          else busy--;
        }
        if (events.length > 200000) break;
      }
      while (sample <= T) { depth[sample] = queue.length; ages[sample] = queue.length ? sample - queue[0] : 0; sample++; }
      waits.sort((a, b) => a - b);
      const capacity = s.workers * mu, util = s.arrival / capacity;
      const after = depth.slice(90), drainAt = s.burst ? after.findIndex(v => v === 0) : -1;
      const maxDepth = Math.max(...depth);
      const metrics = { maxBacklog: maxDepth, finalBacklog: depth[T], rejected, utilization: Math.round(util * 100), p99Wait: pct(waits, 99), p50Wait: pct(waits, 50), drainSeconds: drainAt < 0 ? (s.burst ? Infinity : 0) : drainAt, burst: s.burst, random: s.random };
      const tone = util >= 1 ? 'bad' : util > 0.85 ? 'warn' : 'ok';
      return {
        metrics,
        html: stats([{ label: 'Capacity', value: fmt(capacity, 1) + '/s' }, { label: 'Utilisation (steady)', value: Math.round(util * 100) + '%', tone },
          { label: 'Median wait', value: ms(pct(waits, 50) * 1000) }, { label: 'p99 wait', value: ms(pct(waits, 99) * 1000), tone: pct(waits, 99) > 10 ? 'bad' : '' },
          { label: 'Peak backlog', value: fmt(maxDepth) }, { label: s.cap ? 'Rejected' : 'Backlog at end', value: fmt(s.cap ? rejected : depth[T]), tone: (s.cap ? rejected : depth[T]) > 0 ? 'warn' : '' },
          ...(s.burst ? [{ label: 'Drain after burst', value: drainAt < 0 ? 'never' : drainAt + ' s', tone: drainAt < 0 ? 'bad' : '' }] : [])]) +
          chart({ series: [{ label: 'Jobs waiting', cls: 's1', values: depth }, { label: 'Oldest job age (s)', cls: 's2', values: ages }], xMax: T, xLabel: 'seconds', yLabel: 'count / seconds', bands: s.burst ? [{ from: 60, to: 90, label: 'burst' }] : [], hlines: s.cap ? [{ y: s.cap, label: 'queue limit', cls: 'is-limit' }] : [] }),
      };
    });

  // ---------- 2. Cache: Zipf traffic, LRU, TTL, jitter, coalescing and outages ----------
  registry.cache = (el, cfg, api) => simple(el, cfg, api,
    { rps: 2000, keys: 20000, skew: 1.0, size: 2000, ttl: 30, jitter: false, coalesce: false, warm: true, outage: false, dbLatency: 80, dbCap: 400, hotExpire: false },
    [{ key: 'rps', label: 'Requests / s', min: 200, max: 6000, step: 100 },
      { key: 'skew', label: 'Popularity skew (Zipf s)', min: 0.4, max: 1.6, step: 0.1, fmt: v => v.toFixed(1) },
      { key: 'size', label: 'Cache size (entries)', min: 100, max: 20000, step: 100 },
      { key: 'ttl', label: 'TTL', min: 2, max: 120, step: 1, fmt: v => v + ' s' },
      { key: 'jitter', label: 'TTL jitter ±20%', type: 'toggle' },
      { key: 'coalesce', label: 'Coalesce concurrent misses (single-flight)', type: 'toggle' },
      { key: 'warm', label: 'Start with a warm cache (filled at t=0)', type: 'toggle' },
      { key: 'outage', label: 'Cache outage from t=60s to t=75s', type: 'toggle' },
      { key: 'dbCap', label: 'Database capacity', min: 100, max: 3000, step: 50, fmt: v => v + ' q/s' },
      { key: 'dbLatency', label: 'Recompute time on a miss', min: 10, max: 1000, step: 10, fmt: v => v + ' ms' }],
    s => {
      const r = rng(11), T = 180, N = s.keys;
      const cdf = new Float64Array(N); let acc = 0;
      for (let i = 0; i < N; i++) { acc += 1 / (i + 1) ** s.skew; cdf[i] = acc; }
      const pick = () => { const x = r() * acc; let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < x) lo = m + 1; else hi = m; } return lo; };
      const cache = new Map(); // key -> {readyAt, expires}
      const ttl = () => s.ttl * (s.jitter ? 0.8 + 0.4 * r() : 1);
      if (s.warm) for (let k = 0; k < Math.min(s.size, N); k++) cache.set(k, { readyAt: 0, expires: ttl() });
      const db = new Array(T).fill(0), hits = new Array(T).fill(0), total = new Array(T).fill(0);
      const lat = s.dbLatency / 1000; let coalesced = 0, dupes = 0;
      const n = s.rps * T;
      for (let i = 0; i < n; i++) {
        const now = (i + r()) / s.rps, sec = Math.min(T - 1, Math.floor(now)), k = pick();
        total[sec]++;
        if (s.outage && now >= 60 && now < 75) { db[sec]++; continue; }
        const e = cache.get(k);
        if (e && now < e.expires && now >= e.readyAt) { hits[sec]++; cache.delete(k); cache.set(k, e); continue; }
        if (e && now < e.readyAt && s.coalesce) { coalesced++; hits[sec]++; continue; }
        db[sec]++;
        if (e && now < e.readyAt) dupes++;
        if (!(e && now < e.readyAt && !s.coalesce && e.loading)) {
          cache.delete(k); cache.set(k, { readyAt: now + lat, expires: now + lat + ttl(), loading: true });
          if (cache.size > s.size) cache.delete(cache.keys().next().value);
        }
      }
      const hitRate = hits.reduce((a, b) => a + b, 0) / Math.max(1, total.reduce((a, b) => a + b, 0));
      const over = db.filter(v => v > s.dbCap).length, peak = Math.max(...db);
      const steady = db.slice(Math.min(T - 1, s.ttl * 2 + 5)).filter(v => isFinite(v));
      const metrics = { hitRate: Math.round(hitRate * 100), peakDb: peak, overloadSeconds: over, coalesce: s.coalesce ? 1 : 0, jitter: s.jitter ? 1 : 0, outage: s.outage ? 1 : 0, steadyPeak: Math.max(0, ...steady), avgDb: Math.round(db.reduce((a, b) => a + b, 0) / T), dupes, size: s.size, ttl: s.ttl, skew: s.skew, rps: s.rps, dbCap: s.dbCap };
      return {
        metrics,
        html: stats([{ label: 'Hit rate', value: Math.round(hitRate * 100) + '%', tone: hitRate > 0.9 ? 'ok' : hitRate < 0.6 ? 'warn' : '' },
          { label: 'Avg DB load', value: fmt(db.reduce((a, b) => a + b, 0) / T) + ' q/s' }, { label: 'Peak DB load', value: fmt(peak) + ' q/s', tone: peak > s.dbCap ? 'bad' : '' },
          { label: 'Seconds over DB capacity', value: String(over), tone: over ? 'bad' : 'ok' }, { label: 'Duplicate refills (same key, already loading)', value: fmt(dupes), tone: dupes > 1000 ? 'warn' : '' }, ...(s.coalesce ? [{ label: 'Misses coalesced', value: fmt(coalesced) }] : [])]) +
          chart({ series: [{ label: 'Database queries / s', cls: 's3', values: db }, { label: 'Cache hits / s', cls: 's1', values: hits }], xMax: T, xLabel: 'seconds', yLabel: 'per second', hlines: [{ y: s.dbCap, label: 'DB capacity', cls: 'is-limit' }], bands: s.outage ? [{ from: 60, to: 75, label: 'cache down' }] : [] }),
      };
    });

  // ---------- 3. Percentiles, tail latency, fan-out and hedging ----------
  registry.percentile = (el, cfg, api) => simple(el, cfg, api,
    { median: 40, spread: 0.35, tail: 1, tailMs: 900, fanout: 1, hedge: false },
    [{ key: 'median', label: 'Typical latency', min: 5, max: 200, step: 5, fmt: v => v + ' ms' },
      { key: 'spread', label: 'Natural variability', min: 0.1, max: 1, step: 0.05, fmt: v => v.toFixed(2) },
      { key: 'tail', label: 'Slow requests (GC, cold cache…)', min: 0, max: 10, step: 0.5, fmt: v => v + '%' },
      { key: 'tailMs', label: 'Slow request latency', min: 200, max: 3000, step: 50, fmt: v => v + ' ms' },
      { key: 'fanout', label: 'Backend calls per user request (fan-out)', min: 1, max: 100, step: 1 },
      { key: 'hedge', label: 'Hedge: resend after p95, take the first reply', type: 'toggle' }],
    s => {
      const r = rng(5);
      const normal = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
      const one = () => (r() * 100 < s.tail ? s.tailMs * (0.8 + 0.4 * r()) : s.median * Math.exp(s.spread * normal()));
      const base = Array.from({ length: 4000 }, one).sort((a, b) => a - b);
      const p95 = pct(base, 95);
      const call = () => { const a = one(); if (!s.hedge || a <= p95) return a; return Math.min(a, p95 + one()); };
      const users = Array.from({ length: 3000 }, () => { let m = 0; for (let i = 0; i < s.fanout; i++) m = Math.max(m, call()); return m; }).sort((a, b) => a - b);
      const mean = users.reduce((a, b) => a + b, 0) / users.length;
      const top = Math.max(pct(users, 99.9), s.tailMs) * 1.1, buckets = 40, hist = new Array(buckets).fill(0);
      users.forEach(v => { hist[Math.min(buckets - 1, Math.floor(v / top * buckets))]++; });
      const slow = 1 - (1 - s.tail / 100) ** s.fanout;
      const metrics = { ...s, p50: pct(users, 50), p99: pct(users, 99), mean, slowShare: Math.round(slow * 100) };
      return {
        metrics,
        html: stats([{ label: 'Mean', value: ms(mean) }, { label: 'p50', value: ms(pct(users, 50)) }, { label: 'p95', value: ms(pct(users, 95)) },
          { label: 'p99', value: ms(pct(users, 99)), tone: pct(users, 99) > 4 * pct(users, 50) ? 'bad' : '' }, { label: 'p99.9', value: ms(pct(users, 99.9)) },
          { label: 'User requests touching a slow call', value: (slow * 100).toFixed(slow < 0.1 ? 1 : 0) + '%', tone: slow > 0.3 ? 'bad' : '' }]) +
          chart({ series: [{ label: 'User requests per latency bucket', cls: 's1', values: hist }], xMax: top, xLabel: 'latency (ms)', yLabel: 'requests', xFmt: v => fmt(v),
            vlines: [{ x: mean, label: 'mean' }, { x: pct(users, 99), label: 'p99' }] }),
      };
    });

  // ---------- 4. Consistent hashing ring vs modulo placement ----------
  registry.hashring = (el, cfg, api) => {
    const state = { nodes: cfg.nodes || 4, vnodes: cfg.vnodes || 1, hot: false, keys: 3000 };
    const { ctl, out, view } = shell(el, '<div class="sim-ring"></div>');
    let previous = null, last = '';
    const keys = Array.from({ length: state.keys }, (_, i) => ({ k: 'user:' + i, h: fnv('user:' + i) }));
    const ringOf = (n, v) => { const pts = []; for (let i = 0; i < n; i++) for (let j = 0; j < v; j++) pts.push({ h: fnv(`node-${i}#${j}`), node: i }); return pts.sort((a, b) => a.h - b.h); };
    const owner = (ring, h) => { let lo = 0, hi = ring.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ring[m].h < h) lo = m + 1; else hi = m; } return ring[lo % ring.length].node; };
    const place = (n, v) => { const ring = ringOf(n, v); return { ring, map: keys.map(k => owner(ring, k.h)), mod: keys.map(k => k.h % n) }; };
    const draw = () => {
      const p = place(state.nodes, state.vnodes);
      const traffic = new Array(state.nodes).fill(0), counts = new Array(state.nodes).fill(0);
      p.map.forEach((o, i) => { counts[o]++; traffic[o] += state.hot && i === 0 ? state.keys * 0.3 : 1; });
      const ideal = state.keys / state.nodes, totalTraffic = traffic.reduce((a, b) => a + b, 0);
      let moved = '', modMoved = '';
      if (previous && previous.n !== state.nodes) {
        moved = Math.round(100 * p.map.filter((o, i) => o !== previous.map[i]).length / state.keys);
        modMoved = Math.round(100 * p.mod.filter((o, i) => o !== previous.mod[i]).length / state.keys);
        last = `Going from ${previous.n} to ${state.nodes} nodes moved <b>${moved}%</b> of keys on the ring, versus <b>${modMoved}%</b> with <code>hash(key) % N</code>. Ideal: ${Math.round(100 * Math.abs(state.nodes - previous.n) / Math.max(state.nodes, previous.n))}%.`;
      }
      previous = { n: state.nodes, map: p.map, mod: p.mod };
      const R = 92, cx = 110, cy = 110, ang = h => h / 4294967296 * 2 * Math.PI - Math.PI / 2;
      const dots = p.ring.slice(0, 600).map(pt => `<circle class="ring-node c${pt.node % 8}" cx="${cx + R * Math.cos(ang(pt.h))}" cy="${cy + R * Math.sin(ang(pt.h))}" r="${state.vnodes > 20 ? 2 : 5}"/>`).join('');
      const sample = keys.slice(0, 120).map((k, i) => `<circle class="ring-key c${p.map[i] % 8}" cx="${cx + (R - 14) * Math.cos(ang(k.h))}" cy="${cy + (R - 14) * Math.sin(ang(k.h))}" r="1.6"/>`).join('');
      view.querySelector('.sim-ring').innerHTML = `<svg viewBox="0 0 220 220" class="sim-ring-svg"><circle cx="${cx}" cy="${cy}" r="${R}" class="ring-line"/>${sample}${dots}</svg>`;
      const maxRatio = Math.max(...counts) / ideal;
      out.innerHTML = stats([{ label: 'Positions on ring', value: fmt(p.ring.length) }, { label: 'Busiest node vs ideal (keys)', value: maxRatio.toFixed(2) + '×', tone: maxRatio > 1.3 ? 'warn' : 'ok' },
        { label: 'Busiest node traffic share', value: Math.round(100 * Math.max(...traffic) / totalTraffic) + '%', tone: state.hot ? 'bad' : '' }]) +
        `<p class="sim-note">${last || 'Add or remove a node to see how many keys move.'}</p>` +
        bars(counts.map((c, i) => ({ label: 'node ' + i, value: c, mark: ideal, cls: 'c' + (i % 8), text: Math.round(100 * c / state.keys) + '% keys · ' + Math.round(100 * traffic[i] / totalTraffic) + '% traffic' })), Math.max(...counts, ideal) * 1.15);
      api.metrics({ nodes: state.nodes, vnodes: state.vnodes, maxRatio, moved: moved === '' ? 100 : moved, hot: state.hot });
    };
    controls(ctl, [{ key: 'vnodes', label: 'Virtual nodes per server', min: 1, max: 200 }, { key: 'add', label: '+ Add node', type: 'button' }, { key: 'remove', label: '− Remove node', type: 'button' }, { key: 'hot', label: 'One celebrity key gets 30% of traffic', type: 'toggle' }], state, (k, act) => {
      if (act && k === 'add') state.nodes = Math.min(12, state.nodes + 1);
      if (act && k === 'remove') state.nodes = Math.max(2, state.nodes - 1);
      if (k === 'vnodes') previous = null;
      api.touched(); draw();
    });
    draw();
    return { destroy() {} };
  };

  // ---------- 5. Quorums: N, R, W and partitions ----------
  registry.quorum = (el, cfg, api) => {
    const state = { n: 3, w: 2, r: 2, ...(cfg.initial || {}) }, r = rng(3);
    let down = new Set(), versions = [], log = [], latest = 1;
    const { ctl, out, view } = shell(el, '<div class="sim-quorum"></div>');
    const reset = () => { versions = new Array(state.n).fill(1); latest = 1; down = new Set([...down].filter(i => i < state.n)); log = []; };
    reset();
    const up = () => [...Array(state.n).keys()].filter(i => !down.has(i));
    const sampleN = (arr, k) => arr.map(x => [r(), x]).sort((a, b) => a[0] - b[0]).slice(0, k).map(x => x[1]);
    const trials = () => { let stale = 0; for (let t = 0; t < 2000; t++) { const w = new Set(sampleN([...Array(state.n).keys()], state.w)); const rd = sampleN([...Array(state.n).keys()], state.r); if (!rd.some(i => w.has(i))) stale++; } return stale / 2000; };
    const draw = () => {
      const overlap = state.r + state.w > state.n, avail = up().length;
      view.querySelector('.sim-quorum').innerHTML = `<div class="q-nodes">${versions.map((v, i) => `<button type="button" class="q-node ${down.has(i) ? 'is-down' : ''} ${v === latest ? 'is-latest' : 'is-stale'}" data-node="${i}"><b>node ${i + 1}</b><span>v${v}</span><small>${down.has(i) ? 'unreachable' : 'up'}</small></button>`).join('')}</div><p class="sim-note">Click a node to cut it off. Writes need W acknowledgements; reads ask R nodes and return the highest version they see.</p>`;
      view.querySelectorAll('[data-node]').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.node); down.has(i) ? down.delete(i) : down.add(i); api.touched(); draw(); }));
      const staleRate = trials();
      out.innerHTML = stats([{ label: 'R + W > N ?', value: overlap ? 'yes — quorums overlap' : 'no', tone: overlap ? 'ok' : 'bad' },
        { label: 'Stale reads (random replicas, no repair)', value: (staleRate * 100).toFixed(1) + '%', tone: staleRate ? 'warn' : 'ok' },
        { label: 'Writes possible now', value: avail >= state.w ? 'yes' : `no (${avail} up < W=${state.w})`, tone: avail >= state.w ? 'ok' : 'bad' },
        { label: 'Reads possible now', value: avail >= state.r ? 'yes' : `no (${avail} up < R=${state.r})`, tone: avail >= state.r ? 'ok' : 'bad' }]) +
        `<div class="sim-actions"><button type="button" class="button" data-q="write">Write a new version</button><button type="button" class="button" data-q="read">Read</button><button type="button" class="button" data-q="heal">Heal &amp; anti-entropy</button></div><ol class="sim-log">${log.slice(-6).map(l => `<li class="${l.cls}">${l.text}</li>`).join('')}</ol>`;
      out.querySelector('[data-q=write]').addEventListener('click', () => {
        const live = up();
        if (live.length < state.w) log.push({ cls: 'is-bad', text: `Write rejected: only ${live.length} replicas reachable, W=${state.w}.` });
        else { latest++; const acks = sampleN(live, state.w); acks.forEach(i => { versions[i] = latest; }); log.push({ cls: 'is-ok', text: `Wrote v${latest}; acknowledged by node ${acks.map(i => i + 1).join(', ')}. Other replicas are behind until repair.` }); }
        api.touched(); draw();
      });
      out.querySelector('[data-q=read]').addEventListener('click', () => {
        const live = up();
        if (live.length < state.r) log.push({ cls: 'is-bad', text: `Read failed: only ${live.length} reachable, R=${state.r}.` });
        else { const asked = sampleN(live, state.r), v = Math.max(...asked.map(i => versions[i])); const stale = v !== latest; log.push({ cls: stale ? 'is-bad' : 'is-ok', text: `Asked node ${asked.map(i => i + 1).join(', ')} → returned v${v}${stale ? ` — STALE (latest is v${latest})` : ' (latest)'}.` }); api.metrics({ staleRead: stale ? 1 : 0 }); }
        api.touched(); draw();
      });
      out.querySelector('[data-q=heal]').addEventListener('click', () => { down.clear(); versions = versions.map(() => latest); log.push({ cls: '', text: 'Partition healed; repair brought every replica to the latest version.' }); draw(); });
      api.metrics({ overlap: overlap ? 1 : 0, staleRate: Math.round(staleRate * 100), n: state.n, w: state.w, r: state.r, down: down.size });
    };
    controls(ctl, [{ key: 'n', label: 'Replicas (N)', min: 1, max: 7 }, { key: 'w', label: 'Write quorum (W)', min: 1, max: 7 }, { key: 'r', label: 'Read quorum (R)', min: 1, max: 7 }], state, k => {
      state.w = Math.min(state.w, state.n); state.r = Math.min(state.r, state.n);
      if (k === 'n') reset();
      ctl.querySelectorAll('[data-k]').forEach(i => { i.value = state[i.dataset.k]; ctl.querySelector(`[data-out="${i.dataset.k}"]`).textContent = state[i.dataset.k]; });
      api.touched(); draw();
    });
    draw();
    return { destroy() {} };
  };

  // ---------- 6. Trade-off curves ----------
  const TRADEOFFS = {
    ttl: {
      defaults: { x: 60, reads: 2, writesPerHour: 6 },
      defs: [{ key: 'x', label: 'TTL', min: 1, max: 3600, log: true, fmt: v => v >= 60 ? (v / 60).toFixed(v >= 600 ? 0 : 1) + ' min' : v + ' s' },
        { key: 'reads', label: 'Reads per key per second', min: 0.01, max: 100, log: true, fmt: v => v.toPrecision(2) },
        { key: 'writesPerHour', label: 'Updates per key per hour', min: 0.1, max: 600, log: true, fmt: v => v.toPrecision(2) }],
      model(s, x) { const r = s.reads, u = s.writesPerHour / 3600; const hit = r * x / (1 + r * x); const stale = u * x < 1e-6 ? u * x / 2 : 1 - (1 - Math.exp(-u * x)) / (u * x); return { hit: hit * 100, stale: stale * 100, db: 100 * (1 - hit) }; },
      series: [['hit', 'Hit rate %', 's1'], ['stale', 'Reads that are stale %', 's3'], ['db', 'Requests reaching DB %', 's2']],
      xLabel: 'TTL (seconds, log scale)', yLabel: '%', yMax: 100, log: true, xMax: 3600,
      read: (v, s) => [{ label: 'Hit rate', value: v.hit.toFixed(1) + '%' }, { label: 'Stale reads', value: v.stale.toFixed(1) + '%', tone: v.stale > 10 ? 'warn' : '' }, { label: 'Worst-case staleness', value: s.x >= 60 ? (s.x / 60).toFixed(1) + ' min' : s.x + ' s' }],
    },
    replicas: {
      defaults: { x: 1, n: 5, rtt: 20 },
      defs: [{ key: 'x', label: 'Replicas that must confirm a write', min: 0, max: 4 }, { key: 'rtt', label: 'Cross-zone round trip', min: 1, max: 150, fmt: v => v + ' ms' }],
      model(s, x) { const rtts = [0.6, 0.85, 1, 1.4, 3.5].map(f => f * s.rtt); const lat = 2 + (x ? rtts[x - 1] : 0); const avail = Array.from({ length: 5 }, (_, k) => k).reduce((p, k) => p, 0); const up = 0.999; let a = 0; const n = 4; for (let k = x; k <= n; k++) { let c = 1; for (let j = 0; j < k; j++) c = c * (n - j) / (j + 1); a += c * up ** k * (1 - up) ** (n - k); } return { lat, loss: x ? 0 : 100, avail: a * 100, _: avail }; },
      series: [['lat', 'Write latency (ms)', 's1']], xLabel: 'synchronous replicas', yLabel: 'ms', xMax: 4, points: 5,
      read: (v, s) => [{ label: 'Write latency', value: ms(v.lat) }, { label: 'Acknowledged writes lost if leader dies', value: s.x ? 'none (a confirmed copy exists)' : 'possible', tone: s.x ? 'ok' : 'bad' }, { label: 'Writes available (each replica 99.9% up)', value: v.avail.toFixed(4) + '%', tone: v.avail < 99.99 ? 'warn' : 'ok' }],
    },
    backup: {
      defaults: { x: 60, size: 500, throughput: 200, wal: false },
      defs: [{ key: 'x', label: 'Snapshot interval', min: 5, max: 1440, log: true, fmt: v => v >= 60 ? (v / 60).toFixed(1) + ' h' : Math.round(v) + ' min' },
        { key: 'size', label: 'Database size', min: 10, max: 10000, log: true, fmt: v => fmt(v) + ' GB' },
        { key: 'throughput', label: 'Restore throughput', min: 20, max: 2000, log: true, fmt: v => fmt(v) + ' MB/s' },
        { key: 'wal', label: 'Continuous log archiving (point-in-time recovery)', type: 'toggle' }],
      model(s, x) { const restore = s.size * 1000 / s.throughput / 60; const replay = s.wal ? x * 0.15 : 0; return { rpo: s.wal ? 0.1 : x, rto: restore + replay + 10 }; },
      series: [['rpo', 'Worst-case data loss — RPO (min)', 's3'], ['rto', 'Time to restore — RTO (min)', 's1']], xLabel: 'snapshot interval (minutes, log)', yLabel: 'minutes', log: true, xMax: 1440,
      read: (v) => [{ label: 'RPO', value: v.rpo < 1 ? '< 1 min' : Math.round(v.rpo) + ' min', tone: v.rpo > 15 ? 'warn' : 'ok' }, { label: 'RTO', value: Math.round(v.rto) + ' min', tone: v.rto > 60 ? 'warn' : '' }],
    },
    batch: {
      defaults: { x: 10, overhead: 5, per: 0.2, arrival: 200 },
      defs: [{ key: 'x', label: 'Batch size', min: 1, max: 500, log: true, fmt: v => Math.round(v) },
        { key: 'overhead', label: 'Fixed cost per batch (fsync, round trip)', min: 0.5, max: 50, step: 0.5, fmt: v => v + ' ms' },
        { key: 'arrival', label: 'Arrivals / s', min: 10, max: 5000, log: true, fmt: v => fmt(v) }],
      model(s, x) { x = Math.round(x); const service = s.overhead + x * s.per; const thr = 1000 * x / service; const fill = 1000 * (x - 1) / 2 / s.arrival; return { thr, lat: (thr < s.arrival ? Infinity : fill + service) }; },
      series: [['thr', 'Max throughput (items/s)', 's1']], series2: [['lat', 'Item latency (ms)', 's3']], xLabel: 'batch size (log)', yLabel: 'items / s', log: true, xMax: 500,
      read: (v, s) => [{ label: 'Max throughput', value: fmt(v.thr) + '/s', tone: v.thr < s.arrival ? 'bad' : 'ok' }, { label: 'Latency per item', value: ms(v.lat), tone: !isFinite(v.lat) ? 'bad' : '' }, { label: 'Keeps up with arrivals?', value: v.thr >= s.arrival ? 'yes' : 'no — queue grows', tone: v.thr >= s.arrival ? 'ok' : 'bad' }],
    },
  };
  registry.tradeoff = (el, cfg, api) => {
    const m = TRADEOFFS[cfg.model];
    return simple(el, cfg, api, m.defaults, m.defs, s => {
      const pts = m.points || 60, xs = Array.from({ length: pts }, (_, i) => m.log ? (m.xMax ** (i / (pts - 1))) || 1 : i * m.xMax / (pts - 1));
      if (m.log) xs[0] = 1;
      const vals = xs.map(x => m.model(s, x)), cur = m.model(s, s.x);
      const mk = list => list.map(([k, label, cls]) => ({ label, cls, values: vals.map(v => v[k]), xs }));
      return { metrics: { ...s, ...cur }, html: stats(m.read(cur, s)) + chart({ series: mk(m.series), xMax: m.xMax, logX: m.log, xLabel: m.xLabel, yLabel: m.yLabel, yMax: m.yMax, vlines: [{ x: s.x, label: 'you' }] }) + (m.series2 ? chart({ series: mk(m.series2).map(z => ({ ...z, values: z.values.map(v => isFinite(v) ? v : NaN) })), xMax: m.xMax, logX: m.log, xLabel: m.xLabel, yLabel: 'ms', vlines: [{ x: s.x }], yFmt: v => fmt(v) }) : '') };
    });
  };

  // ---------- 7. Load balancer: algorithms, a slow server, sticky local sessions ----------
  registry.loadbalancer = (el, cfg, api) => {
    const state = { algo: 'rr', slow: false, sticky: false, sessions: 'local', rps: 300 };
    let dead = new Set();
    const { ctl, out } = shell(el);
    const run = () => {
      const r = rng(9), S = 4, T = 30, dt = 0.01, base = 0.02, users = 400;
      const inflight = new Array(S).fill(0), queue = Array.from({ length: S }, () => []), served = new Array(S).fill(0), lat = [];
      const capacity = s => (state.slow && s === 1 ? 4 : 12); // concurrent slots
      const svc = s => base * (state.slow && s === 1 ? 4 : 1);
      const home = Array.from({ length: users }, (_, u) => u % S);
      let rr = 0, loggedOut = new Set(), errors = 0;
      const events = [];
      for (let t = 0; t < T; t += dt) {
        const n = Math.floor(state.rps * dt + r());
        for (let k = 0; k < n; k++) {
          const u = Math.floor(r() * users); const alive = [...Array(S).keys()].filter(s => !dead.has(s) || t < 10);
          let s;
          if (state.sticky) { s = home[u]; if (dead.has(s) && t >= 10) { s = alive[u % alive.length]; if (state.sessions === 'local') loggedOut.add(u); } }
          else if (state.algo === 'rr') { s = alive[rr++ % alive.length]; }
          else if (state.algo === 'random') { s = alive[Math.floor(r() * alive.length)]; }
          else { s = alive.reduce((b, x) => (inflight[x] + queue[x].length < inflight[b] + queue[b].length ? x : b), alive[0]); }
          if (!state.sticky && state.sessions === 'local' && home[u] !== s) loggedOut.add(u);
          queue[s].push(t);
        }
        for (let s = 0; s < S; s++) {
          if (dead.has(s) && t >= 10) { errors += queue[s].length; queue[s] = []; inflight[s] = 0; continue; }
          inflight[s] = Math.max(0, inflight[s] - capacity(s) * dt / svc(s));
          while (queue[s].length && inflight[s] < capacity(s)) { const at = queue[s].shift(); inflight[s] += 1; served[s]++; lat.push(t - at + svc(s)); }
          if (queue[s].length > 3000) { errors += queue[s].length - 3000; queue[s].length = 3000; }
        }
        if (Math.abs(t * 10 - Math.round(t * 10)) < 1e-6) events.push(queue.map(q => q.length));
      }
      lat.sort((a, b) => a - b);
      const p99 = pct(lat, 99) * 1000;
      out.innerHTML = stats([{ label: 'p50 latency', value: ms(pct(lat, 50) * 1000) }, { label: 'p99 latency', value: ms(p99), tone: p99 > 500 ? 'bad' : '' },
        { label: 'Users who lost their session', value: String(loggedOut.size), tone: loggedOut.size ? 'bad' : 'ok' }, { label: 'Failed requests', value: fmt(errors), tone: errors ? 'warn' : '' }]) +
        bars(served.map((v, i) => ({ label: `server ${i + 1}${state.slow && i === 1 ? ' (slow)' : ''}${dead.has(i) ? ' ✗' : ''}`, value: v, cls: dead.has(i) ? 'is-dead' : 'c' + i, text: fmt(v) + ' served' })), Math.max(...served) * 1.1) +
        chart({ series: [0, 1, 2, 3].map(i => ({ label: 'queue on server ' + (i + 1), cls: 'c' + i, values: events.map(e => e[i]) })), xMax: T, xLabel: 'seconds', yLabel: 'waiting', vlines: dead.size ? [{ x: 10, label: 'server dies' }] : [] });
      api.metrics({ loggedOut: loggedOut.size, p99, algo: state.algo, dead: dead.size, sessions: state.sessions, sticky: state.sticky });
    };
    controls(ctl, [{ key: 'algo', label: 'Algorithm', type: 'select', options: [['rr', 'Round robin'], ['random', 'Random'], ['least', 'Least outstanding requests']] },
      { key: 'rps', label: 'Requests / s', min: 50, max: 1800, step: 50 },
      { key: 'slow', label: 'Server 2 is 4× slower (noisy neighbour)', type: 'toggle' },
      { key: 'sticky', label: 'Sticky sessions (user → same server)', type: 'toggle' },
      { key: 'sessions', label: 'Session data lives', type: 'select', options: [['local', 'In server memory'], ['shared', 'In a shared store (Redis)']] },
      { key: 'kill', label: 'Kill server 3 at t=10s', type: 'button' }, { key: 'revive', label: 'Revive', type: 'button' }], state, (k, act) => {
      if (act && k === 'kill') dead = new Set([2]); if (act && k === 'revive') dead = new Set();
      api.touched(); run();
    });
    run();
    return { destroy() {} };
  };

  // ---------- 8. Rate limiting algorithms ----------
  registry.ratelimit = (el, cfg, api) => simple(el, cfg, api,
    { algo: 'fixed', limit: 10, burst: 10, pattern: 'boundary' },
    [{ key: 'algo', label: 'Algorithm', type: 'select', options: [['fixed', 'Fixed window counter'], ['log', 'Sliding window log'], ['counter', 'Sliding window counter (weighted)'], ['token', 'Token bucket'], ['leaky', 'Leaky bucket (queue, constant drain)']] },
      { key: 'limit', label: 'Limit (requests / s)', min: 2, max: 30 },
      { key: 'burst', label: 'Bucket capacity (token / leaky)', min: 1, max: 40 },
      { key: 'pattern', label: 'Traffic', type: 'select', options: [['boundary', 'Burst straddling a window edge'], ['steady', 'Steady at 80% of limit'], ['bursty', 'Quiet, then a large burst'], ['abuse', 'Sustained 3× the limit']] }],
    s => {
      const r = rng(4), T = 5, times = [];
      if (s.pattern === 'boundary') { for (let i = 0; i < s.limit; i++) times.push(0.8 + 0.19 * i / s.limit, 1.01 + 0.19 * i / s.limit); for (let t = 2.5; t < T; t += 1 / (s.limit * 0.5)) times.push(t); }
      if (s.pattern === 'steady') for (let t = 0; t < T; t += 1 / (s.limit * 0.8)) times.push(t + 0.01 * r());
      if (s.pattern === 'bursty') { for (let i = 0; i < s.limit * 3; i++) times.push(2 + 0.3 * r()); }
      if (s.pattern === 'abuse') for (let t = 0; t < T; t += 1 / (s.limit * 3)) times.push(t);
      times.sort((a, b) => a - b);
      const allowed = [], log = []; let tokens = s.burst, last = 0, water = 0, win = -1, count = 0, prevCount = 0, queueDelay = [];
      times.forEach(t => {
        let ok = false;
        if (s.algo === 'fixed') { const w = Math.floor(t); if (w !== win) { win = w; count = 0; } ok = count < s.limit; if (ok) count++; }
        if (s.algo === 'log') { while (log.length && log[0] <= t - 1) log.shift(); ok = log.length < s.limit; if (ok) log.push(t); }
        if (s.algo === 'counter') { const w = Math.floor(t); if (w !== win) { prevCount = w === win + 1 ? count : 0; win = w; count = 0; } const est = prevCount * (1 - (t - w)) + count; ok = est < s.limit; if (ok) count++; }
        if (s.algo === 'token') { tokens = Math.min(s.burst, tokens + (t - last) * s.limit); last = t; ok = tokens >= 1; if (ok) tokens -= 1; }
        if (s.algo === 'leaky') { water = Math.max(0, water - (t - last) * s.limit); last = t; ok = water < s.burst; if (ok) { queueDelay.push(water / s.limit); water += 1; } }
        allowed.push(ok);
      });
      const okTimes = times.filter((_, i) => allowed[i]);
      let maxWin = 0; for (let i = 0, j = 0; i < okTimes.length; i++) { while (okTimes[i] - okTimes[j] >= 1) j++; maxWin = Math.max(maxWin, i - j + 1); }
      const rejected = allowed.filter(a => !a).length;
      const lane = (pred, cls) => times.map((t, i) => pred(i) ? `<circle class="sim-dot ${cls}" cx="${40 + t / T * 580}" cy="${pred === okP ? 28 : 58}" r="3.2"/>` : '').join('');
      const okP = i => allowed[i], noP = i => !allowed[i];
      const ticks = Array.from({ length: T + 1 }, (_, i) => `<line class="sim-grid" x1="${40 + i / T * 580}" x2="${40 + i / T * 580}" y1="10" y2="76"/><text class="sim-axis" x="${40 + i / T * 580}" y="92" text-anchor="middle">${i}s</text>`).join('');
      const svg = `<div class="sim-chart-wrap"><svg class="sim-chart" viewBox="0 0 640 100">${ticks}<text class="sim-axis" x="34" y="31" text-anchor="end">allowed</text><text class="sim-axis" x="34" y="61" text-anchor="end">rejected</text>${lane(okP, 's1')}${lane(noP, 's3')}</svg></div>`;
      return { metrics: { maxInAnySecond: maxWin, rejected, algo: s.algo, pattern: s.pattern },
        html: stats([{ label: 'Allowed', value: String(okTimes.length) }, { label: 'Rejected', value: String(rejected) },
          { label: 'Most allowed in any 1-second span', value: String(maxWin), tone: maxWin > s.limit ? 'bad' : 'ok' },
          ...(s.algo === 'leaky' ? [{ label: 'Max added queueing delay', value: ms(1000 * Math.max(0, ...queueDelay)) }] : [])]) + svg };
    });

  // ---------- 9. Bottleneck finder ----------
  registry.bottleneck = (el, cfg, api) => simple(el, cfg, api,
    { load: 8000, api: 4, perApi: 1500, dbSize: 2, cacheHit: 0, pool: 50, queriesPerReq: 3, replicas: 0 },
    [{ key: 'load', label: 'Offered load (requests / s)', min: 1000, max: 60000, step: 500 },
      { key: 'api', label: 'API instances', min: 1, max: 40 },
      { key: 'dbSize', label: 'Primary DB size', type: 'select', options: [[1, 'small (4 vCPU) ~5k q/s'], [2, 'medium (16 vCPU) ~20k q/s'], [3, 'large (64 vCPU) ~60k q/s']] },
      { key: 'replicas', label: 'Read replicas', min: 0, max: 5 },
      { key: 'cacheHit', label: 'Cache hit rate for reads', min: 0, max: 99, step: 1, fmt: v => v + '%' },
      { key: 'pool', label: 'DB connections per API instance', min: 5, max: 200, step: 5 },
      { key: 'queriesPerReq', label: 'DB queries per request (90% reads)', min: 1, max: 10 }],
    s => {
      const dbCap = { 1: 5000, 2: 20000, 3: 60000 }[s.dbSize], maxConn = { 1: 300, 2: 1000, 3: 3000 }[s.dbSize];
      const apiCap = s.api * s.perApi;
      const readsPerReq = s.queriesPerReq * 0.9 * (1 - s.cacheHit / 100), writesPerReq = s.queriesPerReq * 0.1;
      const replicaShare = s.replicas ? s.replicas / (s.replicas + 1) : 0;
      const primaryPerReq = writesPerReq + readsPerReq * (1 - replicaShare), replicaPerReq = readsPerReq * replicaShare;
      const primaryCap = dbCap / Math.max(primaryPerReq, 1e-9), replicaCap = s.replicas ? s.replicas * dbCap / Math.max(replicaPerReq, 1e-9) : Infinity;
      const conns = s.api * s.pool, connCap = conns > maxConn ? maxConn / s.api * s.perApi / s.pool * s.api : Infinity;
      const tiers = [['Load balancer', 100000], ['API servers', apiCap], ['DB connections', connCap], ['Primary database', primaryCap], ['Read replicas', replicaCap]];
      const thr = Math.min(s.load, ...tiers.map(t => t[1])), limit = tiers.reduce((a, b) => (b[1] < a[1] ? b : a));
      const cost = s.api * 120 + { 1: 400, 2: 1600, 3: 6400 }[s.dbSize] * (1 + s.replicas) + (s.cacheHit ? 300 : 0);
      const util = tiers.map(([name, cap]) => ({ name, cap, u: Math.min(1.5, s.load / cap) }));
      const worst = Math.max(...util.map(u => u.u)), latency = worst >= 1 ? Infinity : 30 / (1 - worst);
      return { metrics: { throughput: Math.round(thr), served: thr >= s.load ? 1 : 0, bottleneck: limit[0], cost, load: s.load },
        html: stats([{ label: 'Served', value: fmt(thr) + ' / ' + fmt(s.load) + ' rps', tone: thr >= s.load ? 'ok' : 'bad' }, { label: 'Bottleneck', value: thr >= s.load ? 'none at this load' : limit[0], tone: thr >= s.load ? 'ok' : 'bad' },
          { label: 'Latency (queueing estimate)', value: ms(latency), tone: latency > 200 ? 'warn' : '' }, { label: 'Monthly cost (illustrative)', value: '$' + fmt(cost) },
          ...(conns > maxConn ? [{ label: 'Connections', value: `${fmt(conns)} > DB max ${fmt(maxConn)}`, tone: 'bad' }] : [])]) +
          bars(util.filter(u => isFinite(u.cap)).map(u => ({ label: u.name, value: u.u * 100, mark: 100, cls: u.u >= 1 ? 'is-dead' : u.u > 0.8 ? 'is-warn' : 'c0', text: `${Math.round(u.u * 100)}% of ${fmt(u.cap)} rps` })), 150) };
    });

  // ---------- 10. Retry storms and backoff ----------
  registry.backoff = (el, cfg, api) => simple(el, cfg, api,
    { strategy: 'immediate', clients: 2000, outage: 10, capacity: 400, deadline: 30 },
    [{ key: 'strategy', label: 'Retry strategy', type: 'select', options: [['immediate', 'Fixed 100 ms delay'], ['exp', 'Exponential backoff (100 ms × 2ⁿ, cap 20 s)'], ['jitter', 'Exponential + full jitter'], ['budget', 'Exponential + jitter + retry budget (10% of capacity)']] },
      { key: 'clients', label: 'Clients', min: 200, max: 10000, step: 100 },
      { key: 'outage', label: 'Dependency down for', min: 1, max: 30, fmt: v => v + ' s' },
      { key: 'capacity', label: 'Dependency capacity', min: 100, max: 2000, step: 50, fmt: v => v + '/s' },
      { key: 'deadline', label: 'Each client gives up after', min: 5, max: 60, fmt: v => v + ' s' }],
    s => {
      const r = rng(2), dt = 0.1, T = 60, steps = T / dt;
      const next = new Float64Array(s.clients), first = new Float64Array(s.clients), attempts = new Int32Array(s.clients), done = new Uint8Array(s.clients);
      for (let i = 0; i < s.clients; i++) { next[i] = r(); first[i] = next[i]; }
      const load = new Array(T).fill(0), good = new Array(T).fill(0); let gaveUp = 0, served = 0, finishedAt = Infinity, tokens = 50;
      for (let step = 0; step < steps; step++) {
        const t = step * dt, due = [];
        tokens = Math.min(100, tokens + 0.1 * s.capacity * dt);
        for (let i = 0; i < s.clients; i++) if (!done[i] && next[i] <= t) due.push(i);
        const capTick = s.capacity * dt, up = t >= s.outage;
        // Overload collapse: past capacity, goodput degrades as the server thrashes.
        const succProb = !up ? 0 : due.length <= capTick ? 1 : capTick / due.length * Math.max(0.3, 1 - 0.4 * (due.length / capTick - 1) / 4);
        let sent = 0;
        due.forEach(i => {
          if (attempts[i] > 0 && s.strategy === 'budget') { if (tokens < 1) { done[i] = 1; gaveUp++; return; } tokens--; }
          attempts[i]++; sent++;
          if (r() < succProb) { done[i] = 1; served++; good[Math.floor(t)]++; return; }
          const base = Math.min(20, 0.1 * 2 ** attempts[i]);
          const wait = s.strategy === 'immediate' ? 0.1 : s.strategy === 'exp' ? base : r() * base;
          if (t + wait - first[i] > s.deadline) { done[i] = 1; gaveUp++; return; }
          next[i] = t + wait;
        });
        load[Math.floor(t)] += sent;
        if (finishedAt === Infinity && served + gaveUp === s.clients) finishedAt = t;
      }
      const peak = Math.max(...load), afterPeak = Math.max(...load.slice(Math.ceil(s.outage)));
      return { metrics: { peakLoad: peak, afterRecoveryPeak: afterPeak, gaveUp, recovered: finishedAt, strategy: s.strategy, servedPct: Math.round(100 * served / s.clients) },
        html: stats([{ label: 'Peak attempts / s', value: fmt(peak), tone: peak > s.capacity * 2 ? 'bad' : '' }, { label: 'Clients served', value: Math.round(100 * served / s.clients) + '%', tone: served < s.clients ? 'warn' : 'ok' },
          { label: 'Gave up (deadline or budget)', value: fmt(gaveUp), tone: gaveUp ? 'warn' : '' }, { label: 'All clients resolved by', value: isFinite(finishedAt) ? finishedAt.toFixed(1) + ' s' : '> 60 s' }]) +
          chart({ series: [{ label: 'Attempts / s', cls: 's3', values: load }, { label: 'Successes / s', cls: 's1', values: good }], xMax: T, xLabel: 'seconds', yLabel: 'per second', hlines: [{ y: s.capacity, label: 'capacity', cls: 'is-limit' }], bands: [{ from: 0, to: s.outage, label: 'dependency down' }] }) };
    });

  // ---------- 11. Replication lag and read-your-writes ----------
  registry.replag = (el, cfg, api) => simple(el, cfg, api,
    { lag: 200, delay: 100, routing: 'random', replicas: 3, readRatio: 20 },
    [{ key: 'lag', label: 'Mean replica lag', min: 5, max: 5000, log: true, fmt: v => ms(v) },
      { key: 'delay', label: 'User reads this long after writing', min: 10, max: 5000, log: true, fmt: v => ms(v) },
      { key: 'routing', label: 'Read routing', type: 'select', options: [['random', 'Any replica'], ['leader', 'Always the leader'], ['ryw', 'Replica only if it has the user’s write (LSN token)'], ['window', 'Leader for 1 s after the user writes']] },
      { key: 'replicas', label: 'Replicas', min: 1, max: 8 },
      { key: 'readRatio', label: 'Reads per write (whole system)', min: 1, max: 200, log: true, fmt: v => Math.round(v) + ':1' }],
    s => {
      const r = rng(8); let stale = 0, leaderReads = 0; const N = 4000;
      for (let i = 0; i < N; i++) {
        const lags = Array.from({ length: s.replicas }, () => expo(r, 1 / s.lag));
        const pick = Math.floor(r() * s.replicas), caught = lags[pick] <= s.delay;
        if (s.routing === 'leader') { leaderReads++; continue; }
        if (s.routing === 'ryw') { const ok = lags.findIndex(l => l <= s.delay); if (ok < 0) leaderReads++; continue; }
        if (s.routing === 'window' && s.delay < 1000) { leaderReads++; continue; }
        if (!caught) stale++;
      }
      // Only reads shortly after one's own write are at risk; other reads go to replicas.
      const ownReadsShare = 1 / s.readRatio;
      const leaderShare = (leaderReads / N) * (s.routing === 'leader' ? 1 : ownReadsShare) + (s.routing === 'leader' ? 0 : 0);
      return { metrics: { staleRate: Math.round(1000 * stale / N) / 10, leaderShare: Math.round(100 * leaderShare), routing: s.routing },
        html: stats([{ label: 'Own-write reads that are stale', value: (100 * stale / N).toFixed(1) + '%', tone: stale ? 'bad' : 'ok' },
          { label: 'Share of all reads hitting the leader', value: Math.round(100 * leaderShare) + '%', tone: leaderShare > 0.5 ? 'warn' : 'ok' },
          { label: 'Chance a given replica is caught up', value: Math.round(100 * (1 - Math.exp(-s.delay / s.lag))) + '%' }]) +
          `<p class="sim-note">${s.routing === 'random' ? 'Any-replica reads are cheap but show users their own stale data whenever lag exceeds their think time.' : s.routing === 'leader' ? 'Always reading from the leader is correct but throws away the read scaling replicas were added for.' : s.routing === 'ryw' ? 'The client carries the log position of its last write; a replica serves it only once it has applied that position. Correct and cheap — the cost is plumbing the token.' : 'A time window is simple but only correct if lag stays under the window — lag spikes break it silently.'}</p>` };
    });

  // ---------- 12. Composite index planner ----------
  registry.index = (el, cfg, api) => {
    const cols = { customer_id: 10000, status: 5, created_at: 1e6, total: 1e5 }, ROWS = 2e6;
    const state = { i1: 'customer_id', i2: 'created_at', i3: '', include: false, q: cfg.query || 'history', ...(cfg.initial || {}) };
    const QUERIES = {
      history: { sql: "SELECT id, total FROM orders\nWHERE customer_id = ?\nORDER BY created_at DESC\nLIMIT 20", eq: ['customer_id'], range: null, order: 'created_at', select: ['total'], limit: 20 },
      status: { sql: "SELECT id FROM orders\nWHERE status = 'pending'\n  AND created_at > now() - interval '1 hour'", eq: ['status'], range: 'created_at', order: null, select: [], limit: null, rangeSel: 1 / 720 },
      cust_status: { sql: "SELECT id FROM orders\nWHERE customer_id = ? AND status = 'shipped'\nORDER BY created_at DESC LIMIT 20", eq: ['customer_id', 'status'], range: null, order: 'created_at', select: [], limit: 20 },
      range_first: { sql: "SELECT id FROM orders\nWHERE created_at > ? AND customer_id = ?", eq: ['customer_id'], range: 'created_at', order: null, select: [], limit: null, rangeSel: 1 / 30 },
      total: { sql: "SELECT id FROM orders\nWHERE total > 1000", eq: [], range: 'total', order: null, select: [], limit: null, rangeSel: 1 / 100 },
    };
    const { ctl, out } = shell(el);
    const opts = [['', '—'], ...Object.keys(cols).map(c => [c, c])];
    const run = () => {
      const q = QUERIES[state.q], idx = [state.i1, state.i2, state.i3].filter(Boolean);
      const notes = []; let matchRows = ROWS, seek = [], usedRange = false, i = 0;
      for (; i < idx.length; i++) {
        const c = idx[i];
        if (q.eq.includes(c)) { seek.push(`${c} =`); matchRows /= cols[c]; continue; }
        if (q.range === c) { seek.push(`${c} range`); matchRows *= q.rangeSel; usedRange = true; i++; break; }
        break;
      }
      const usable = seek.length > 0;
      const remainingEq = q.eq.filter(c => !seek.includes(`${c} =`));
      const remainingRange = q.range && !usedRange ? q.range : null;
      let rowsMatching = ROWS; q.eq.forEach(c => { rowsMatching /= cols[c]; }); if (q.range) rowsMatching *= q.rangeSel;
      const orderIdx = idx.indexOf(q.order);
      const sortAvoided = !q.order || (usable && orderIdx === seek.length && !usedRange && idx.slice(0, orderIdx).every(c => q.eq.includes(c)));
      const needed = new Set([...q.eq, ...(q.range ? [q.range] : []), ...(q.order ? [q.order] : []), ...q.select]);
      const covering = usable && [...needed].every(c => idx.includes(c) || (state.include && c === 'total'));
      let examined = usable ? matchRows : ROWS;
      if (usable && sortAvoided && q.limit && !remainingEq.length && !remainingRange) examined = Math.min(examined, q.limit);
      else if (usable && sortAvoided && q.limit) examined = Math.min(examined, q.limit * (matchRows / Math.max(rowsMatching, 1)));
      const heap = covering ? 0 : Math.min(examined, usable ? examined : 0);
      if (!usable) notes.push(idx.length ? `The index starts with <code>${idx[0]}</code>, which this query does not constrain with equality or a range, so the planner cannot seek into it (leftmost-prefix rule). Full table scan.` : 'No index: every query scans the table.');
      else notes.push(`Seek using <b>${seek.join(', then ')}</b>.`);
      if (usable && remainingEq.length) notes.push(`<code>${remainingEq.join(', ')}</code> is filtered row by row after the seek${idx.includes(remainingEq[0]) ? ' — it sits after a range or gap in the index, so it cannot narrow the seek' : ''}.`);
      if (usedRange && i < idx.length) notes.push(`Columns after the range column (<code>${idx.slice(i).join(', ')}</code>) cannot be used for seeking: a B-tree range scan visits them unordered.`);
      if (q.order) notes.push(sortAvoided ? `Rows come out of the index already ordered by <code>${q.order}</code> — no sort, and LIMIT can stop early.` : `Rows must be collected and sorted by <code>${q.order}</code> before LIMIT applies.`);
      if (usable) notes.push(covering ? 'Covering: every needed column is in the index, so the table heap is never touched (index-only scan).' : `Each matching index entry needs a lookup into the table heap to fetch ${q.select.length ? '<code>' + q.select.join(', ') + '</code>' : 'other columns'} — a random read each.`);
      const writeCost = idx.length ? 1 + 1 : 1;
      out.innerHTML = `<pre class="sd-code" data-lang="sql"><code>${esc(q.sql)}</code></pre>` +
        stats([{ label: 'Index entries / rows read', value: fmt(Math.max(1, examined)), tone: examined > 1e5 ? 'bad' : examined > 1000 ? 'warn' : 'ok' }, { label: 'Table heap lookups', value: fmt(heap) },
          { label: 'Sort needed', value: sortAvoided ? 'no' : 'yes', tone: sortAvoided ? 'ok' : 'warn' }, { label: 'Index-only', value: covering ? 'yes' : 'no', tone: covering ? 'ok' : '' },
          { label: 'Extra writes per INSERT', value: idx.length ? '+1 index (+' + idx.length * 8 + ' B/key)' : '0' }]) +
        `<ul class="sim-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul><p class="sim-note">Table: 2M orders, 10k customers, 5 statuses. Estimates assume uniform data — real planners use statistics, which is why you check with <code>EXPLAIN ANALYZE</code>.</p>`;
      api.metrics({ rowsRead: Math.round(examined), sortAvoided: sortAvoided ? 1 : 0, covering: covering ? 1 : 0, query: state.q, writeCost, indexCols: idx.length, include: state.include ? 1 : 0 });
    };
    controls(ctl, [{ key: 'q', label: 'Query', type: 'select', options: [['history', 'Customer order history'], ['cust_status', 'Customer’s shipped orders'], ['status', 'Recent pending orders'], ['range_first', 'Range then equality'], ['total', 'Large orders']] },
      { key: 'i1', label: 'Index column 1', type: 'select', options: opts }, { key: 'i2', label: 'Index column 2', type: 'select', options: opts }, { key: 'i3', label: 'Index column 3', type: 'select', options: opts },
      { key: 'include', label: 'INCLUDE (total) — store extra column in index leaves', type: 'toggle' }], state, () => { api.touched(); run(); });
    run();
    return { destroy() {} };
  };

  window.SDSims = {
    register(name, fn) { registry[name] = fn; },
    has: name => !!registry[name],
    mount(name, el, cfg, api) { el.classList.add('sim', 'sim-' + name); return registry[name](el, cfg, api); },
    H: { esc, rng, expo, pct, fnv, fmt, ms, bytes, controls, chart, bars, stats, shell, simple },
  };
})();
