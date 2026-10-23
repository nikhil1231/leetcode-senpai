// Lesson simulators, part 2: Bloom filters, feed fan-out, capacity estimates, pagination,
// Snowflake IDs, geohash cells, LSM trees, circuit breakers, availability maths,
// Raft leader election and partitioned event streams.
(function () {
  'use strict';
  const { esc, rng, fnv, fmt, ms, bytes, controls, chart, bars, stats, shell, simple } = window.SDSims.H;
  const reg = window.SDSims.register;

  // ---------- Bloom filter ----------
  reg('bloom', (el, cfg, api) => {
    const state = { m: 64, k: 3 };
    let items = [], log = [];
    const { ctl, out, view } = shell(el, '<div class="bloom-input"><input class="input" type="text" placeholder="a word, e.g. alice" maxlength="24"><button type="button" class="button" data-a="add">Add</button><button type="button" class="button" data-a="query">Query</button><button type="button" class="button" data-a="fill">Add 10 random</button><button type="button" class="button" data-a="clear">Clear</button></div><div class="bloom-bits"></div>');
    const positions = w => Array.from({ length: state.k }, (_, i) => fnv(w + '#' + i) % state.m);
    let lit = [];
    const draw = () => {
      const bits = new Array(state.m).fill(0); items.forEach(w => positions(w).forEach(p => { bits[p] = 1; }));
      view.querySelector('.bloom-bits').innerHTML = bits.map((b, i) => `<span class="${b ? 'is-set' : ''} ${lit.includes(i) ? 'is-lit' : ''}" title="bit ${i}">${b}</span>`).join('');
      const n = items.length, fpr = (1 - Math.exp(-state.k * n / state.m)) ** state.k, best = Math.max(1, Math.round(state.m / Math.max(1, n) * Math.LN2));
      out.innerHTML = stats([{ label: 'Items stored', value: String(n) }, { label: 'Bits set', value: Math.round(100 * bits.filter(Boolean).length / state.m) + '%' },
        { label: 'False-positive rate', value: (fpr * 100).toFixed(fpr < 0.01 ? 2 : 1) + '%', tone: fpr > 0.1 ? 'bad' : fpr > 0.02 ? 'warn' : 'ok' }, { label: 'Optimal k for this load', value: String(best) }]) +
        `<ol class="sim-log">${log.slice(-5).map(l => `<li class="${l.cls}">${l.text}</li>`).join('')}</ol><p class="sim-note">At real scale: 1% false positives needs about 9.6 bits per item (k = 7) — 10M keys ≈ 12 MB, regardless of key size.</p>`;
      api.metrics({ n, fpr: Math.round(fpr * 1000) / 10, falsePositives: log.filter(l => l.fp).length });
    };
    const input = view.querySelector('input');
    view.querySelector('[data-a=add]').addEventListener('click', () => { const w = input.value.trim().toLowerCase(); if (!w) return; if (!items.includes(w)) items.push(w); lit = positions(w); log.push({ cls: '', text: `Added “${esc(w)}” → set bits ${lit.join(', ')}` }); input.value = ''; api.touched(); draw(); });
    view.querySelector('[data-a=query]').addEventListener('click', () => {
      const w = input.value.trim().toLowerCase(); if (!w) return; lit = positions(w);
      const bits = new Set(items.flatMap(positions)), maybe = lit.every(p => bits.has(p)), real = items.includes(w);
      log.push({ fp: maybe && !real, cls: maybe ? (real ? 'is-ok' : 'is-bad') : 'is-ok', text: `“${esc(w)}”: bits ${lit.join(', ')} → ${maybe ? (real ? 'probably present (it is)' : '<b>probably present — FALSE POSITIVE</b>') : 'definitely not present'}` });
      api.touched(); draw();
    });
    view.querySelector('[data-a=fill]').addEventListener('click', () => { const r = rng(items.length + 1); for (let i = 0; i < 10; i++) items.push('user' + Math.floor(r() * 1e6)); lit = []; api.touched(); draw(); });
    view.querySelector('[data-a=clear]').addEventListener('click', () => { items = []; log = []; lit = []; draw(); });
    controls(ctl, [{ key: 'm', label: 'Bits (m)', min: 16, max: 256, step: 8 }, { key: 'k', label: 'Hash functions (k)', min: 1, max: 8 }], state, () => { lit = []; api.touched(); draw(); });
    draw();
    return { destroy() {} };
  });

  // ---------- Feed fan-out ----------
  reg('fanout', (el, cfg, api) => simple(el, cfg, api,
    { strategy: 'push', posts: 5000, avgFollowers: 200, celebShare: 0.1, celebFollowers: 20000000, threshold: 100000, reads: 200000, follows: 300 },
    [{ key: 'strategy', label: 'Strategy', type: 'select', options: [['push', 'Fan-out on write (push to timelines)'], ['pull', 'Fan-out on read (merge at read time)'], ['hybrid', 'Hybrid: push, except accounts above threshold']] },
      { key: 'posts', label: 'Posts / s (peak)', min: 500, max: 50000, step: 500 },
      { key: 'avgFollowers', label: 'Median followers', min: 10, max: 2000, step: 10 },
      { key: 'celebShare', label: 'Posts by celebrity accounts', min: 0, max: 2, step: 0.05, fmt: v => v + '%' },
      { key: 'celebFollowers', label: 'Celebrity followers', min: 100000, max: 100000000, log: true, fmt: v => fmt(v) },
      { key: 'threshold', label: 'Hybrid threshold (followers)', min: 1000, max: 10000000, log: true, fmt: v => fmt(v) },
      { key: 'reads', label: 'Timeline reads / s', min: 10000, max: 2000000, log: true, fmt: v => fmt(v) },
      { key: 'follows', label: 'Accounts each user follows', min: 20, max: 2000, step: 10 }],
    s => {
      const celebPosts = s.posts * s.celebShare / 100, normalPosts = s.posts - celebPosts;
      const celebPushed = s.strategy === 'push' || (s.strategy === 'hybrid' && s.celebFollowers < s.threshold);
      const normalPushed = s.strategy !== 'pull';
      const writes = (normalPushed ? normalPosts * s.avgFollowers : 0) + (celebPushed ? celebPosts * s.celebFollowers : 0);
      // Share of followed accounts with at least T followers falls off as a power law in T.
      const celebFollowed = s.follows * Math.min(1, (1e4 / s.threshold) ** 0.8);
      const perRead = s.strategy === 'push' ? 1 : s.strategy === 'pull' ? s.follows : 1 + (celebPushed ? 0 : celebFollowed);
      const readQueries = s.reads * perRead;
      const worstDelivery = celebPushed && s.celebFollowers > 1e6 ? s.celebFollowers / 1e6 : 0.05; // seconds at 1M inserts/s per post
      return { metrics: { writes, readQueries, strategy: s.strategy, perRead },
        html: stats([{ label: 'Timeline inserts / s', value: fmt(writes), tone: writes > 5e7 ? 'bad' : writes > 5e6 ? 'warn' : 'ok' },
          { label: 'Queries per timeline read', value: fmt(perRead, 1), tone: perRead > 50 ? 'bad' : perRead > 5 ? 'warn' : 'ok' },
          { label: 'Read-side fetches / s', value: fmt(readQueries), tone: readQueries > 5e7 ? 'bad' : '' },
          { label: 'Celebrity post fully delivered in', value: celebPushed ? `≈${fmt(worstDelivery, 1)} s of fan-out work` : 'read-time merge', tone: celebPushed && worstDelivery > 10 ? 'bad' : '' }]) +
          bars([{ label: 'Write work', value: Math.log10(writes + 1), text: fmt(writes) + '/s', cls: 's3' }, { label: 'Read work', value: Math.log10(readQueries + 1), text: fmt(readQueries) + '/s', cls: 's1' }], 9) +
          `<p class="sim-note">Bars are log-scaled. Push makes reads a single precomputed lookup but multiplies every post by its audience; pull keeps writes cheap and pays on every read. The hybrid pushes ordinary posts and merges a handful of celebrity timelines at read time.</p>` };
    }));

  // ---------- Capacity estimator ----------
  reg('estimator', (el, cfg, api) => simple(el, cfg, api,
    { dau: 50000000, writes: 2, ratio: 100, size: 1000, media: 0, years: 5, peak: 3, rf: 3 },
    [{ key: 'dau', label: 'Daily active users', min: 100000, max: 1000000000, log: true, fmt: v => fmt(v) },
      { key: 'writes', label: 'Writes per user per day', min: 0.1, max: 100, log: true, fmt: v => v.toPrecision(2) },
      { key: 'ratio', label: 'Reads per write', min: 1, max: 1000, log: true, fmt: v => Math.round(v) + ':1' },
      { key: 'size', label: 'Bytes per record (metadata)', min: 100, max: 100000, log: true, fmt: v => bytes(v) },
      { key: 'media', label: 'Share of writes with a 1 MB attachment', min: 0, max: 50, step: 1, fmt: v => v + '%' },
      { key: 'years', label: 'Retention (years)', min: 1, max: 10 },
      { key: 'peak', label: 'Peak-to-average factor', min: 1, max: 10, step: 0.5, fmt: v => v + '×' },
      { key: 'rf', label: 'Replication factor', min: 1, max: 5 }],
    s => {
      const perDay = s.dau * s.writes, wqps = perDay / 86400, rqps = wqps * s.ratio;
      const dayBytes = perDay * s.size + perDay * s.media / 100 * 1e6, total = dayBytes * 365 * s.years * s.rf;
      const egress = rqps * s.peak * (s.size + s.media / 100 * 1e6);
      const rows = [
        ['Writes per day', `${fmt(s.dau)} × ${s.writes.toPrecision(2)}`, fmt(perDay)],
        ['Average write QPS', `${fmt(perDay)} ÷ 86,400 s (≈ 10⁵)`, fmt(wqps)],
        ['Peak write QPS', `× ${s.peak}`, fmt(wqps * s.peak)],
        ['Peak read QPS', `× ${Math.round(s.ratio)} reads per write`, fmt(rqps * s.peak)],
        ['Storage per day', `${fmt(perDay)} × ${bytes(s.size)}${s.media ? ` + ${s.media}% × 1 MB` : ''}`, bytes(dayBytes)],
        ['Total stored', `× 365 × ${s.years} years × RF ${s.rf}`, bytes(total)],
        ['Peak read egress', 'peak read QPS × response size', bytes(egress) + '/s'],
      ];
      return { metrics: { wqps, rqps, total },
        html: `<div class="sd-scroll"><table class="sd-md-table sim-est"><thead><tr><th>Quantity</th><th>Working</th><th>Result</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td><code>${esc(r[1])}</code></td><td><b>${r[2]}</b></td></tr>`).join('')}</tbody></table></div><p class="sim-note">Rules of thumb: one commodity database node handles ~10k simple writes/s; one app server ~1–5k req/s; ${bytes(egress)}/s egress ${egress > 1e10 ? 'needs a CDN' : 'is modest'}. ${total > 1e15 ? 'Petabytes means object storage and sharding by necessity.' : total > 1e13 ? 'Tens of terabytes: shard or use a distributed store.' : 'This fits on a handful of database nodes.'}</p>` };
    }));

  // ---------- Offset vs cursor pagination ----------
  reg('pagination', (el, cfg, api) => {
    let items = Array.from({ length: 24 }, (_, i) => ({ id: 100 + i, t: 1000 + i })), next = 200;
    const size = 5; let offsetPage = 1, cursor = null, offsetSeen = [], cursorSeen = [], dupes = 0, skips = 0;
    const { ctl, out } = shell(el);
    const sorted = () => items.slice().sort((a, b) => b.t - a.t || b.id - a.id);
    const draw = () => {
      const list = sorted();
      const offset = list.slice((offsetPage - 1) * size, offsetPage * size);
      const curIdx = cursor ? list.findIndex(x => x.t < cursor.t || (x.t === cursor.t && x.id < cursor.id)) : 0;
      const curPage = list.slice(curIdx < 0 ? list.length : curIdx, (curIdx < 0 ? list.length : curIdx) + size);
      const col = (title, rows, seen, sql) => `<div class="pg-col"><b>${title}</b><code>${esc(sql)}</code><ol>${rows.map(x => `<li class="${seen.filter(s => s === x.id).length ? 'is-dupe' : ''}">post #${x.id}</li>`).join('')}</ol></div>`;
      out.innerHTML = `<div class="pg-cols">${col(`Offset — page ${offsetPage}`, offset, offsetSeen, `ORDER BY created_at DESC LIMIT ${size} OFFSET ${(offsetPage - 1) * size}`)}${col('Cursor', curPage, cursorSeen, cursor ? `WHERE (created_at, id) < (${cursor.t}, ${cursor.id}) ORDER BY created_at DESC, id DESC LIMIT ${size}` : `ORDER BY created_at DESC, id DESC LIMIT ${size}`)}</div>` +
        stats([{ label: 'Duplicates seen with offset', value: String(dupes), tone: dupes ? 'bad' : '' }, { label: 'Posts skipped with offset', value: String(skips), tone: skips ? 'bad' : '' }]) +
        `<p class="sim-note">Read page 1, publish new posts, then read the next page with both methods. Highlighted rows were already shown on an earlier page.</p>`;
      api.metrics({ dupes, skips });
      draw.offset = offset; draw.cursorPage = curPage;
    };
    controls(ctl, [{ key: 'next', label: 'Load next page (both)', type: 'button' }, { key: 'post', label: '+ 2 new posts arrive at the top', type: 'button' }, { key: 'delete', label: '− Delete a post already shown', type: 'button' }, { key: 'reset', label: 'Reset', type: 'button' }], {}, k => {
      if (k === 'next') {
        offsetSeen.push(...draw.offset.map(x => x.id)); cursorSeen.push(...draw.cursorPage.map(x => x.id));
        if (draw.cursorPage.length) { const last = draw.cursorPage[draw.cursorPage.length - 1]; cursor = { t: last.t, id: last.id }; }
        offsetPage++;
        draw();
        dupes += draw.offset.filter(x => offsetSeen.includes(x.id)).length;
        const shown = new Set(offsetSeen), list = sorted(), lastShownIdx = Math.max(...offsetSeen.map(id => list.findIndex(x => x.id === id)));
        skips = list.slice(0, Math.max(0, lastShownIdx)).filter(x => !shown.has(x.id) && x.t <= Math.max(...items.filter(i => offsetSeen.includes(i.id)).map(i => i.t))).length;
      }
      if (k === 'post') { items.push({ id: next++, t: 5000 + next }, { id: next++, t: 5000 + next }); }
      if (k === 'delete' && offsetSeen.length) { const id = offsetSeen[0]; items = items.filter(x => x.id !== id); }
      if (k === 'reset') { items = Array.from({ length: 24 }, (_, i) => ({ id: 100 + i, t: 1000 + i })); offsetPage = 1; cursor = null; offsetSeen = []; cursorSeen = []; dupes = skips = 0; }
      api.touched(); draw();
    });
    draw();
    return { destroy() {} };
  });

  // ---------- Snowflake ID layout ----------
  reg('snowflake', (el, cfg, api) => simple(el, cfg, api,
    { ts: 41, machine: 10 },
    [{ key: 'ts', label: 'Timestamp bits (ms since custom epoch)', min: 30, max: 50 }, { key: 'machine', label: 'Machine / worker bits', min: 0, max: 20 }],
    s => {
      const seq = 63 - s.ts - s.machine;
      if (seq < 0) return { html: '<p class="sd-error">Bits exceed 63 (one sign bit is reserved). Reduce timestamp or machine bits.</p>', metrics: {} };
      const years = 2 ** s.ts / 1000 / 86400 / 365.25, machines = 2 ** s.machine, perMs = 2 ** seq;
      const now = BigInt(Date.now() - Date.UTC(2020, 0, 1)), id = (now << BigInt(s.machine + seq)) | (37n << BigInt(seq)) | 5n;
      const bin = id.toString(2).padStart(63, '0');
      const seg = (from, len, cls, label) => len ? `<span class="sf-seg ${cls}" style="flex:${len}"><b>${label}</b><code>${bin.slice(from, from + len)}</code><small>${len} bits</small></span>` : '';
      return { metrics: { years, perMs, machines },
        html: `<div class="sf-layout"><span class="sf-seg is-sign" style="flex:1"><b>0</b><small>sign</small></span>${seg(0, s.ts, 's1', 'timestamp')}${seg(s.ts, s.machine, 's2', 'machine')}${seg(s.ts + s.machine, seq, 's4', 'sequence')}</div>` +
          stats([{ label: 'Lifetime from epoch', value: years >= 1 ? fmt(years, 1) + ' years' : fmt(years * 365, 0) + ' days', tone: years < 20 ? 'bad' : 'ok' }, { label: 'Workers', value: fmt(machines) },
            { label: 'IDs per ms per worker', value: fmt(perMs), tone: perMs < 64 ? 'warn' : '' }, { label: 'Fleet capacity', value: fmt(perMs * machines * 1000) + ' IDs/s' }]) +
          `<p class="sim-note">Example ID: <code>${id.toString()}</code> (worker 37, sequence 5). IDs sort by creation time because the timestamp occupies the high bits — handy for <code>ORDER BY id</code> and range-partitioned storage.</p>` };
    }));

  // ---------- Geohash grid ----------
  reg('geohash', (el, cfg, api) => {
    const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    const state = { precision: 3 };
    let point = { lat: 51.505, lng: -0.09 };
    const { ctl, out, view } = shell(el, '<div class="geo-map"></div>');
    const encode = (lat, lng, p) => { let latR = [-90, 90], lngR = [-180, 180], bit = 0, ch = 0, even = true, h = ''; while (h.length < p) { const r = even ? lngR : latR, v = even ? lng : lat, mid = (r[0] + r[1]) / 2; if (v >= mid) { ch = ch * 2 + 1; r[0] = mid; } else { ch *= 2; r[1] = mid; } even = !even; if (++bit === 5) { h += base32[ch]; bit = 0; ch = 0; } } return { h, latR, lngR }; };
    // View window: a box around London scaled so precision 1-6 cells are visible.
    const draw = () => {
      const g = encode(point.lat, point.lng, state.precision), dLat = g.latR[1] - g.latR[0], dLng = g.lngR[1] - g.lngR[0];
      const spanLat = dLat * 5, spanLng = dLng * 5, lat0 = (g.latR[0] + g.latR[1]) / 2 - spanLat / 2, lng0 = (g.lngR[0] + g.lngR[1]) / 2 - spanLng / 2;
      const W = 360, H = 260, X = lng => (lng - lng0) / spanLng * W, Y = lat => H - (lat - lat0) / spanLat * H;
      let cells = '';
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const la = g.latR[0] + i * dLat, ln = g.lngR[0] + j * dLng, c = encode(la + dLat / 2, ln + dLng / 2, state.precision);
        const neighbour = Math.abs(i) <= 1 && Math.abs(j) <= 1;
        cells += `<g class="geo-cell ${i === 0 && j === 0 ? 'is-home' : neighbour ? 'is-near' : ''}"><rect x="${X(ln)}" y="${Y(la + dLat)}" width="${X(ln + dLng) - X(ln)}" height="${Y(la) - Y(la + dLat)}"/><text x="${X(ln + dLng / 2)}" y="${Y(la + dLat / 2) + 4}" text-anchor="middle">${c.h}</text></g>`;
      }
      view.querySelector('.geo-map').innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="geo-svg">${cells}<circle class="geo-point" cx="${X(point.lng)}" cy="${Y(point.lat)}" r="5"/></svg><p class="sim-note">Click anywhere to move the point. A “nearby” query scans the home cell plus its 8 neighbours — a single cell misses places just across an edge.</p>`;
      view.querySelector('svg').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H; point = { lng: lng0 + x / W * spanLng, lat: lat0 + (H - y) / H * spanLat }; api.touched(); draw(); });
      const km = dLat * 111, kmW = dLng * 111 * Math.cos(point.lat * Math.PI / 180);
      out.innerHTML = stats([{ label: 'Geohash', value: g.h }, { label: 'Cell size', value: km >= 1 ? `${fmt(kmW, 1)} × ${fmt(km, 1)} km` : `${fmt(kmW * 1000)} × ${fmt(km * 1000)} m` },
        { label: 'Prefix query', value: `WHERE geohash LIKE '${g.h}%'` }]);
      api.metrics({ precision: state.precision });
    };
    controls(ctl, [{ key: 'precision', label: 'Precision (characters)', min: 1, max: 7 }], state, () => { api.touched(); draw(); });
    draw();
    return { destroy() {} };
  });

  // ---------- LSM tree ----------
  reg('lsm', (el, cfg, api) => {
    const r = rng(21); let mem = new Map(), l0 = [], l1 = [], log = [], written = 0, flushed = 0, compactions = 0, bloom = true;
    const MEM = 4;
    const { ctl, out, view } = shell(el, '<div class="lsm-levels"></div>');
    const keyName = () => 'k' + String(Math.floor(r() * 12)).padStart(2, '0');
    const flush = () => { if (!mem.size) return; l0.unshift(new Map([...mem].sort())); mem = new Map(); flushed++; written += [...l0[0]].length; log.push('Flushed memtable to a new immutable SSTable in L0 (sequential write).'); if (l0.length >= 3) compact(); };
    const compact = () => { const merged = new Map(l1.length ? [...l1[0]] : []); [...l0].reverse().forEach(t => t.forEach((v, k) => merged.set(k, v))); [...merged].forEach(([k, v]) => { if (v === '⌫') merged.delete(k); }); l1 = [new Map([...merged].sort())]; written += merged.size; l0 = []; compactions++; log.push(`Compacted L0 into L1: merged, dropped overwritten values and tombstones, rewrote ${merged.size} entries.`); };
    const put = (k, v) => { mem.set(k, v); written++; if (mem.size >= MEM) flush(); };
    const draw = (path = []) => {
      const table = (t, label, i) => `<div class="lsm-table ${path.includes(label + i) ? 'is-read' : ''} ${path.includes('skip:' + label + i) ? 'is-skipped' : ''}"><small>${label}${l0.length > 1 && label === 'L0 #' ? i + 1 : ''}</small>${[...t].map(([k, v]) => `<span>${k}=${v}</span>`).join('') || '<em>empty</em>'}</div>`;
      view.querySelector('.lsm-levels').innerHTML = `<div class="lsm-level"><b>Memtable (RAM)</b>${table(mem, 'mem', 0)}</div><div class="lsm-level"><b>L0 (newest first)</b>${l0.map((t, i) => table(t, 'L0 #', i)).join('') || '<em>no files</em>'}</div><div class="lsm-level"><b>L1</b>${l1.map((t, i) => table(t, 'L1 ', i)).join('') || '<em>no files</em>'}</div>`;
      out.innerHTML = stats([{ label: 'Logical writes', value: String(mem.size + flushed) }, { label: 'Bytes rewritten (write amplification)', value: String(written) }, { label: 'Flushes / compactions', value: `${flushed} / ${compactions}` }]) + `<ol class="sim-log">${log.slice(-4).map(l => `<li>${l}</li>`).join('')}</ol>`;
      api.metrics({ flushes: flushed, compactions });
    };
    controls(ctl, [{ key: 'put', label: 'Put random key', type: 'button' }, { key: 'put5', label: 'Put 5 keys', type: 'button' }, { key: 'del', label: 'Delete a key (tombstone)', type: 'button' }, { key: 'get', label: 'Read a key', type: 'button' }, { key: 'flush', label: 'Flush now', type: 'button' }, { key: 'compact', label: 'Compact', type: 'button' }, { key: 'bloom', label: 'Bloom filters per SSTable', type: 'toggle' }], { bloom }, (k, act) => {
      let path = [];
      if (k === 'bloom') bloom = !bloom;
      if (k === 'put') put(keyName(), Math.floor(r() * 90 + 10));
      if (k === 'put5') for (let i = 0; i < 5; i++) put(keyName(), Math.floor(r() * 90 + 10));
      if (k === 'del') { const key = [...mem.keys(), ...l0.flatMap(t => [...t.keys()]), ...l1.flatMap(t => [...t.keys()])][0] || keyName(); put(key, '⌫'); log.push(`Deleted ${key}: wrote a tombstone; old values disappear only at compaction.`); }
      if (k === 'flush') flush();
      if (k === 'compact') compact();
      if (k === 'get') {
        const key = keyName(); let found = null, checked = 0;
        const tables = [['mem', 0, mem], ...l0.map((t, i) => ['L0 #', i, t]), ...l1.map((t, i) => ['L1 ', i, t])];
        for (const [label, i, t] of tables) {
          if (label !== 'mem' && bloom && !t.has(key)) { path.push('skip:' + label + i); continue; }
          checked++; path.push(label + i);
          if (t.has(key)) { found = t.get(key); break; }
        }
        log.push(`get(${key}) → ${found == null || found === '⌫' ? 'not found' : found}; searched ${checked} structure${checked === 1 ? '' : 's'}${bloom ? ' (bloom filters skipped the rest)' : ''}.`);
      }
      api.touched(); draw(path);
    });
    draw();
    return { destroy() {} };
  });

  // ---------- Circuit breaker ----------
  reg('circuit', (el, cfg, api) => simple(el, cfg, api,
    { breaker: true, threshold: 50, open: 5, outageStart: 10, outageEnd: 25, timeout: 2000 },
    [{ key: 'breaker', label: 'Circuit breaker enabled', type: 'toggle' },
      { key: 'threshold', label: 'Trip when error rate exceeds', min: 10, max: 90, step: 5, fmt: v => v + '%' },
      { key: 'open', label: 'Stay open before probing', min: 1, max: 20, fmt: v => v + ' s' },
      { key: 'timeout', label: 'Client timeout on dependency', min: 100, max: 5000, step: 100, fmt: v => ms(v) },
      { key: 'outageEnd', label: 'Dependency recovers at', min: 12, max: 50, fmt: v => v + ' s' }],
    s => {
      const T = 60, rate = 100, threads = 200, r = rng(6);
      let state = 'closed', openedAt = 0, window = [], busyThreads = [];
      const sent = [], failed = [], fast = [], stateLine = [], threadUse = [];
      for (let t = 0; t < T; t++) {
        const down = t >= s.outageStart && t < s.outageEnd; let snt = 0, fl = 0, fs = 0;
        if (state === 'open' && t - openedAt >= s.open) state = 'half';
        busyThreads = busyThreads.filter(x => x > t);
        for (let i = 0; i < rate; i++) {
          if (s.breaker && state === 'open') { fs++; continue; }
          if (s.breaker && state === 'half' && i > 0) { fs++; continue; }
          if (busyThreads.length >= threads) { fl++; continue; }
          snt++; const ok = !down && r() > 0.01;
          if (!ok) { fl++; if (down) busyThreads.push(t + s.timeout / 1000); }
          window.push(ok); if (window.length > 50) window.shift();
          if (s.breaker && state === 'half') { state = ok ? 'closed' : 'open'; openedAt = t; window = []; }
        }
        if (s.breaker && state === 'closed' && window.length >= 20 && window.filter(x => !x).length / window.length * 100 > s.threshold) { state = 'open'; openedAt = t; }
        sent.push(snt); failed.push(fl); fast.push(fs); stateLine.push(state === 'open' ? rate * 1.05 : state === 'half' ? rate * 0.5 : 0); threadUse.push(busyThreads.length);
      }
      const wasted = failed.reduce((a, b) => a + b, 0), exhausted = threadUse.filter(u => u >= threads).length;
      return { metrics: { breaker: s.breaker, wasted, exhausted, opened: stateLine.some(v => v > 0) ? 1 : 0, recoveredAt: T - [...stateLine].reverse().findIndex(v => v > 0) },
        html: stats([{ label: 'Calls sent to a failing dependency', value: fmt(wasted), tone: wasted > 500 ? 'bad' : 'ok' }, { label: 'Seconds with all worker threads stuck', value: String(exhausted), tone: exhausted ? 'bad' : 'ok' },
          { label: 'Fast failures (breaker open)', value: fmt(fast.reduce((a, b) => a + b, 0)) }]) +
          chart({ series: [{ label: 'Sent to dependency', cls: 's1', values: sent }, { label: 'Failed / timed out', cls: 's3', values: failed }, { label: 'Failed fast by breaker', cls: 's2', values: fast }, { label: 'Threads blocked waiting', cls: 's5', values: threadUse.map(u => u / threads * rate) }], xMax: T, xLabel: 'seconds', yLabel: 'requests / s', yMax: rate * 1.15, bands: [{ from: s.outageStart, to: s.outageEnd, label: 'dependency down' }] }) };
    }));

  // ---------- Availability composition ----------
  reg('nines', (el, cfg, api) => simple(el, cfg, api,
    { a: 99.9, serial: 3, redundancy: 1, budgetDays: 30 },
    [{ key: 'a', label: 'Each component’s availability', type: 'select', options: [[99, '99% (two nines)'], [99.5, '99.5%'], [99.9, '99.9% (three nines)'], [99.95, '99.95%'], [99.99, '99.99% (four nines)']] },
      { key: 'serial', label: 'Components every request depends on (in series)', min: 1, max: 10 },
      { key: 'redundancy', label: 'Independent replicas of each component', min: 1, max: 3 }],
    s => {
      const p = s.a / 100, one = 1 - (1 - p) ** s.redundancy, total = one ** s.serial;
      const down = (1 - total) * 365.25 * 24 * 60, month = (1 - total) * 30 * 24 * 60;
      const t = m => m >= 1440 ? (m / 1440).toFixed(1) + ' days' : m >= 60 ? (m / 60).toFixed(1) + ' h' : m.toFixed(m < 10 ? 1 : 0) + ' min';
      return { metrics: { total: total * 100, serial: s.serial, redundancy: s.redundancy },
        html: stats([{ label: 'End-to-end availability', value: (total * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + '%', tone: total < 0.999 ? 'bad' : total < 0.9999 ? 'warn' : 'ok' },
          { label: 'Downtime per year', value: t(down) }, { label: 'Error budget per 30 days', value: t(month) }, { label: 'Each tier with redundancy', value: (one * 100).toFixed(5).replace(/0+$/, '') + '%' }]) +
          `<p class="sim-note">Series multiplies: ${s.serial} × ${s.a}% components give ${(p ** s.serial * 100).toFixed(3)}% before redundancy. Parallel replicas only multiply failure probabilities if failures are <b>independent</b> — a shared deploy, config push or region outage takes them all down together.</p>` };
    }));

  // ---------- Raft leader election ----------
  reg('raft', (el, cfg, api) => {
    const N = 5, r = rng(13);
    let nodes, t, log, timer = null, partitioned = false, elections = 0, leaders = new Set();
    const reset = () => { nodes = Array.from({ length: N }, (_, i) => ({ id: i, role: 'follower', term: 1, votedFor: null, alive: true, timeout: 1.5 + r() * 1.5, elapsed: 0 })); nodes[0].role = 'leader'; t = 0; log = ['Node 1 is leader for term 1, sending heartbeats.']; elections = 0; };
    reset();
    const { ctl, out, view } = shell(el, '<div class="raft-nodes"></div>');
    const side = i => (partitioned ? (i < 2 ? 'A' : 'B') : 'A');
    const reach = (a, b) => nodes[a].alive && nodes[b].alive && side(a) === side(b);
    const step = () => {
      t += 0.1;
      nodes.forEach(n => {
        if (!n.alive) return;
        if (n.role === 'leader') { nodes.forEach(m => { if (m !== n && reach(n.id, m.id) && m.term <= n.term) { m.elapsed = 0; m.term = n.term; if (m.role !== 'follower') m.role = 'follower'; } }); return; }
        n.elapsed += 0.1;
        if (n.elapsed >= n.timeout) {
          n.term++; n.role = 'candidate'; n.votedFor = n.id; n.elapsed = 0; n.timeout = 1.5 + r() * 1.5; elections++;
          let votes = 1;
          nodes.forEach(m => { if (m !== n && reach(n.id, m.id) && (m.term < n.term || (m.term === n.term && m.votedFor == null))) { m.term = n.term; m.votedFor = n.id; m.role = 'follower'; m.elapsed = 0; votes++; } });
          if (votes > N / 2) { n.role = 'leader'; leaders.add(n.term); log.push(`t=${t.toFixed(1)}s: node ${n.id + 1} won term ${n.term} with ${votes}/${N} votes.`); nodes.forEach(m => { if (m.term === n.term) m.votedFor = null; }); }
          else log.push(`t=${t.toFixed(1)}s: node ${n.id + 1} ran for term ${n.term}, got ${votes}/${N} votes — no majority${partitioned && side(n.id) === 'A' ? ' (minority side of partition)' : ''}.`);
        }
      });
      // Step down: an old leader that sees a higher term in its partition.
      nodes.forEach(n => { if (n.role === 'leader' && nodes.some(m => reach(n.id, m.id) && m.term > n.term)) { n.role = 'follower'; log.push(`Node ${n.id + 1} saw a higher term and stepped down.`); } });
      draw();
    };
    const draw = () => {
      const leaderNow = nodes.filter(n => n.alive && n.role === 'leader');
      view.querySelector('.raft-nodes').innerHTML = nodes.map(n => `<button type="button" class="raft-node is-${n.alive ? n.role : 'dead'} side-${side(n.id)}" data-n="${n.id}"><b>node ${n.id + 1}</b><span>${n.alive ? n.role : 'crashed'}</span><small>term ${n.term}</small>${n.alive && n.role !== 'leader' ? `<i style="width:${Math.min(100, 100 * n.elapsed / n.timeout)}%"></i>` : ''}</button>`).join('');
      view.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => { const n = nodes[b.dataset.n]; n.alive = !n.alive; n.elapsed = 0; if (!n.alive && n.role === 'leader') log.push(`Leader node ${n.id + 1} crashed. Followers will time out.`); api.touched(); draw(); }));
      out.innerHTML = stats([{ label: 'Time', value: t.toFixed(1) + ' s' }, { label: 'Leaders right now', value: leaderNow.map(n => `node ${n.id + 1} (term ${n.term})`).join(', ') || 'none', tone: leaderNow.length === 1 ? 'ok' : leaderNow.length ? 'warn' : 'bad' }, { label: 'Elections held', value: String(elections) }]) +
        `<p class="sim-note">Click a node to crash or restart it. Bars show each follower’s randomised election timeout filling up; a heartbeat resets it.${partitioned ? ' Partition: nodes 1–2 | nodes 3–5. Two “leaders” can exist, but only the majority side can commit writes — the stale one cannot reach a quorum.' : ''}</p><ol class="sim-log">${log.slice(-5).map(l => `<li>${l}</li>`).join('')}</ol>`;
      api.metrics({ elections, partitioned: partitioned ? 1 : 0, leaderCount: leaderNow.length, newLeader: leaders.size });
    };
    controls(ctl, [{ key: 'run', label: '▶ Run / pause', type: 'button' }, { key: 'kill', label: 'Crash the leader', type: 'button' }, { key: 'split', label: 'Toggle partition (2 | 3)', type: 'button' }, { key: 'reset', label: 'Reset', type: 'button' }], {}, k => {
      if (k === 'run') { if (timer) { clearInterval(timer); timer = null; } else timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); timer = null; return; } step(); }, 100); }
      if (k === 'kill') { const l = nodes.find(n => n.alive && n.role === 'leader'); if (l) { l.alive = false; log.push(`Leader node ${l.id + 1} crashed. Followers will time out.`); } if (!timer) timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); timer = null; return; } step(); }, 100); }
      if (k === 'split') { partitioned = !partitioned; log.push(partitioned ? 'Network partition: {1,2} cannot reach {3,4,5}.' : 'Partition healed.'); }
      if (k === 'reset') { clearInterval(timer); timer = null; partitioned = false; leaders = new Set(); reset(); }
      api.touched(); draw();
    });
    draw();
    return { destroy() { clearInterval(timer); } };
  });

  // ---------- Partitioned event stream (Kafka-style) ----------
  reg('partitions', (el, cfg, api) => simple(el, cfg, api,
    { partitions: 6, consumers: 3, rate: 3000, perConsumer: 1200, hot: 0, keying: 'user' },
    [{ key: 'partitions', label: 'Partitions', min: 1, max: 24 },
      { key: 'consumers', label: 'Consumers in the group', min: 1, max: 24 },
      { key: 'rate', label: 'Events / s', min: 500, max: 20000, step: 500 },
      { key: 'perConsumer', label: 'Each consumer handles', min: 200, max: 5000, step: 100, fmt: v => fmt(v) + '/s' },
      { key: 'keying', label: 'Partition key', type: 'select', options: [['user', 'user_id (many keys)'], ['none', 'No key (round robin)'], ['tenant', 'tenant_id (one tenant is 40% of traffic)']] }],
    s => {
      const P = s.partitions, C = s.consumers, load = new Array(P).fill(s.rate / P);
      if (s.keying === 'tenant') { load.fill(s.rate * 0.6 / P); load[0] += s.rate * 0.4; }
      const owner = Array.from({ length: P }, (_, p) => p % Math.min(P, C));
      const perC = new Array(C).fill(0); load.forEach((l, p) => { perC[owner[p]] += l; });
      const idle = Math.max(0, C - P), lagging = perC.map(v => Math.max(0, v - s.perConsumer));
      const lagRate = lagging.reduce((a, b) => a + b, 0);
      return { metrics: { idle, lagRate, partitions: P, consumers: C, keying: s.keying },
        html: stats([{ label: 'Idle consumers', value: String(idle), tone: idle ? 'warn' : 'ok' }, { label: 'Lag growing by', value: fmt(lagRate) + ' events/s', tone: lagRate ? 'bad' : 'ok' },
          { label: 'Ordering guarantee', value: s.keying === 'none' ? 'none across events' : 'per key (within a partition)' }]) +
          bars(perC.map((v, i) => ({ label: `consumer ${i + 1}`, value: v, mark: s.perConsumer, cls: v > s.perConsumer ? 'is-dead' : v === 0 ? 'is-idle' : 'c' + (i % 8), text: `${owner.map((o, p) => o === i ? 'P' + p : null).filter(Boolean).join(', ') || 'idle'} · ${fmt(v)}/s` })), Math.max(s.perConsumer, ...perC) * 1.15) +
          `<p class="sim-note">Each partition is consumed by exactly one member of a group, so parallelism is capped at the partition count. A hot key pins its whole load on one partition — and one consumer — no matter how many you add.</p>` };
    }));
})();
