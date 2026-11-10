// Design builder: drag components onto a canvas, connect them, size each one, and run a simulated day
// against it. Two modes: the sandbox (scale inputs, sample architectures, the old estimates and checks)
// and Ripple Ops (sd-game.js), which hands in a scenario, a toolbox and somewhere to save. Components and
// presets come from /simulators/builder.json, prices from /simulators/economics.json; the maths is pure
// (sd-builder-calc.js for estimates and checks, sd-sim.js for the day). The sandbox drawing is kept in
// this browser's localStorage; Ripple Ops saves its own.
(function () {
  'use strict';
  const Calc = window.SDBuilderCalc, Sim = window.SDSim;
  const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const KEY = 'sd-builder-v1', W = 136, H = 62, CANVAS_W = 1600, CANVAS_H = 860;
  let data = null, econ = null;
  const getJson = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  const loadData = async () => {
    if (data && econ) return;
    [data, econ] = await Promise.all([data || getJson('/simulators/builder.json'), econ || getJson('/simulators/economics.json')]);
  };
  const fresh = () => ({ nodes: [], edges: [], settings: { regions: 1, crossRegion: 'async' }, scale: { dau: '', readQps: '', writeQps: '', storageGb: '' },
    nfr: { latencyMs: '100', availability: '99.9%', consistency: 'Eventual' }, req: '' });
  const readLocal = key => { try { const v = JSON.parse(localStorage.getItem(key)); return v && Array.isArray(v.nodes) ? { ...fresh(), ...v } : null; } catch { return null; } };
  const writeLocal = (key, s) => { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* private window: fine */ } };
  const num = v => Calc.num(v);
  const fmt = n => !isFinite(n) ? '∞' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 100 ? Math.round(n).toLocaleString('en') : n >= 1 ? n.toFixed(n < 10 ? 1 : 0) : n.toFixed(2);
  const money = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? '$' + Math.round(n / 1e3) + 'k' : '$' + Math.round(n).toLocaleString('en');
  const ms = v => v >= 30000 ? 'timing out' : v >= 1000 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms';
  const hh = h => String(h).padStart(2, '0') + ':00';
  const OPT_LABEL = { timeouts: ['Timeouts + circuit breaker', 'Calls to slow dependencies give up after a second and fail fast, so threads stay free.'],
    canary: ['Canary releases', 'New builds go to a few servers first. Needs monitoring to notice a bad one.'],
    hotKey: ['Local hot-key cache', 'Callers keep the hottest keys in their own memory, so one key can\'t melt one shard.'],
    coalesce: ['Coalesce misses', 'Concurrent misses for the same key wait for one refill instead of all hitting the database.'],
    grounded: ['Grounded answers', 'Answer only from the retrieved passages, and say "I don\'t know" when they don\'t contain the answer.'],
    cachePrefix: ['Prompt caching', 'The fixed system prompt and tool definitions are cached by the provider: about 90% off those tokens, and a faster first token.'],
    fresh: ['Keep it fresh', 'Re-ingest pages when they change and delete removed ones, instead of a nightly rebuild.'],
    confirm: ['Confirm actions', 'Refunds, cancellations and anything irreversible need the user (or an agent) to confirm first.'],
    scoped: ['Scope to the user', 'Tools only act on the signed-in user\'s own records, whatever the model asks for.'] };

  const NORMAL = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
  const anchors = n => ({ top: [n.x + W / 2, n.y], right: [n.x + W, n.y + H / 2], bottom: [n.x + W / 2, n.y + H], left: [n.x, n.y + H / 2] });
  // Arrows leave and enter a box square to its edge. Of the 16 side pairs, take the shortest that doesn't have to turn
  // back on itself; if every pair would, the body loops round (the control points still push straight out of each edge).
  function edgePath(a, b) {
    const A = anchors(a), B = anchors(b);
    let best = null;
    for (const sa of Object.keys(A)) for (const sb of Object.keys(B)) {
      const [x1, y1] = A[sa], [x2, y2] = B[sb], na = NORMAL[sa], nb = NORMAL[sb], dx = x2 - x1, dy = y2 - y1;
      const back = (na[0] * dx + na[1] * dy < 0 ? 1 : 0) + (nb[0] * -dx + nb[1] * -dy < 0 ? 1 : 0);
      const cost = Math.hypot(dx, dy) + back * 400;
      if (!best || cost < best.cost) best = { cost, sa, sb, d: Math.hypot(dx, dy) };
    }
    const [x1, y1] = A[best.sa], [x2, y2] = B[best.sb], na = NORMAL[best.sa], nb = NORMAL[best.sb], k = Math.max(50, Math.min(180, best.d * 0.5));
    return `M ${x1} ${y1} C ${x1 + na[0] * k} ${y1 + na[1] * k}, ${x2 + nb[0] * k} ${y2 + nb[1] * k}, ${x2} ${y2}`;
  }

  // ---------- the day report (shared with Ripple Ops) ----------
  const CAST = { marcus: ['Marcus', 'CTO'], priya: ['Priya', 'SRE'], jo: ['Jo', 'Junior engineer'], sam: ['Sam', 'Product'] };
  const avatar = who => `<span class="rp-av rp-av-${esc(who)}" aria-hidden="true">${esc((CAST[who] || ['?'])[0][0])}</span>`;
  function stars(n, of = 3) { return `<span class="rp-stars" aria-label="${n} of ${of} stars">${'★'.repeat(n)}<span>${'★'.repeat(of - n)}</span></span>`; }
  function reportHtml(res, o = {}) {
    const s = res.summary, total = res.bill.total || 1;
    const outcome = { handled: ['Handled', 'ok'], degraded: ['Degraded', 'warn'], outage: ['Outage', 'bad'] };
    const top = res.bill.items.filter(i => i.usd >= 0.5).slice(0, 8);
    const label = i => i.id === '_egress' ? 'Bandwidth to users' : i.id === '_xregion' ? 'Cross-region replication' : (o.labelOf?.(i.defId) || i.defId);
    return `<div class="rp-report">
      <div class="rp-score">${stars(s.stars)}<div><strong>${(o.headlines || ['Ripple went down', 'Survived, barely', 'Every target met', 'Every target met, with money to spare'])[s.stars]}</strong>
        <span>${s.availability.toFixed(s.availability >= 99.99 ? 3 : 2)}% available · ${money(res.bill.total)}/month${s.lost >= 1 ? ` · ${fmt(s.lost)} writes lost` : ''}</span></div></div>
      <ul class="rp-objs">${s.objectives.map(x => `<li class="${x.pass ? 'is-pass' : 'is-fail'}"><span>${x.pass ? '✓' : '✗'}</span><em>${esc(x.label)}</em><b>${esc(x.actual)}</b><small>target ${esc(x.target)}</small></li>`).join('')}</ul>
      ${res.events.length ? `<h5>Incidents</h5><ul class="rp-evs">${res.events.map(e => `<li class="rp-${outcome[e.outcome][1]}"><b>${hh(e.at)}</b><span>${esc(e.label)}</span><em>${outcome[e.outcome][0]}${e.type !== 'poison-message' ? ` · ${(e.ok * 100).toFixed(1)}% ok` : ''}${e.lost >= 1 ? ` · ${fmt(e.lost)} lost` : ''}</em></li>`).join('')}</ul>` : ''}
      <h5>The bill</h5><div class="rp-bill">${top.map(i => `<div class="rp-bill-row" title="${esc(i.detail)}"><span>${esc(label(i))}</span><i style="--w:${Math.max(2, Math.round(i.usd / total * 100))}%"></i><b>${money(i.usd)}</b></div>`).join('')}</div>
      ${res.findings.length ? `<h5>What the team saw</h5><ul class="rp-finds">${res.findings.slice(0, o.maxFindings || 12).map(f => `<li class="rp-f-${esc(f.level)}">${avatar(f.who)}<div><p>${esc(f.text)}</p>${f.concept && o.conceptLink ? o.conceptLink(f.concept) : ''}</div></li>`).join('')}</ul>` : ''}
    </div>`;
  }

  function mount(el, opts = {}) {
    const game = opts.mode === 'game', key = opts.storageKey || KEY;
    let defs = null, S = null, sel = null, group = new Set(), box = null, undo = [], drag = null, link = null, dead = false, saveTimer = null;
    let play = null;           // {res, h, timer} while a simulated day is on screen
    let held = null, marks = null;   // held: his design, set aside while a reference is on show (view-only, never saved); marks: node id -> diff tag
    const def = id => defs.find(d => d.id === id) || { label: id, icon: '▫️', border: '#444c56' };
    const labelOf = id => def(id).label;
    const save = () => { if (held) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => { writeLocal(key, S); opts.onChange?.(graph()); }, 250); };
    const snapshot = () => { undo.push(JSON.stringify({ nodes: S.nodes, edges: S.edges, settings: S.settings })); if (undo.length > 60) undo.shift(); };
    const touch = () => { stopPlay(false); save(); paintCanvas(); paintPanel(); paintBar(); };
    const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const nodeById = id => S.nodes.find(n => n.id === id);
    const graph = () => ({ nodes: S.nodes.map(n => ({ id: n.id, defId: n.defId, x: n.x, y: n.y, ...(n.cfg && Object.keys(n.cfg).length ? { cfg: { ...n.cfg } } : {}) })),
      edges: S.edges.map(e => ({ id: e.id, from: e.from, to: e.to })), settings: { ...S.settings } });
    const scenario = () => game ? opts.scenario : Sim.fromScale(S.scale, S.nfr);
    const allowed = d => (!opts.toolbox || opts.toolbox.includes(d.id)) && (!d.ai || !!scenario()?.ai);   // AI parts belong to Ripple Assist levels

    el.classList.add('bd');
    el.innerHTML = '<p class="bd-note">Loading the builder…</p>';

    function shell() {
      el.innerHTML = `<div class="bd-bar">
          ${game ? '' : `<select data-preset aria-label="Load a sample architecture"><option value="">Load a sample…</option>${data.presets.map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('')}</select>`}
          <button type="button" class="button" data-act="undo">Undo</button><button type="button" class="button" data-act="clear">Clear</button>
          <button type="button" class="button" data-act="mermaid">Copy as Mermaid</button>
          <span class="bd-cost" data-cost title="Fixed monthly prices of what you've drawn. Usage (requests, bandwidth) is added when you run the day."></span>
          <button type="button" class="button is-primary bd-run" data-act="run">▶ Run the day</button>
          <span class="bd-status" data-status aria-live="polite"></span></div>
        <div class="bd-play" data-play hidden></div>
        <div class="bd-grid">
          <aside class="bd-palette" aria-label="Components"><input type="search" class="input" placeholder="Filter components" data-filter aria-label="Filter components"><div class="bd-items" data-items></div></aside>
          <div class="bd-stage" data-stage tabindex="0" aria-label="Design canvas. Select a component and press Delete to remove it."><div class="bd-sizer" data-sizer><div class="bd-canvas" data-canvas style="width:${CANVAS_W}px;height:${CANVAS_H}px">
            <svg class="bd-edges" width="${CANVAS_W}" height="${CANVAS_H}"><defs><marker id="bd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z"/></marker></defs><g data-edges></g><path class="bd-preview" data-preview d="" marker-end="url(#bd-arrow)"/></svg>
            <div data-nodes></div><div class="bd-empty" data-empty><span>🏗️</span><strong>Build your design</strong><p>Drag a component in${game ? '' : ', or load a sample'}. Hover a node and drag from a dot to connect it. Click a node to size it.</p></div></div></div></div>
          <aside class="bd-panel" data-panel></aside></div>`;
      paintItems('');
    }
    function paintItems(q) {
      const t = q.trim().toLowerCase(), list = defs.filter(d => allowed(d) && (!t || `${d.label} ${d.description}`.toLowerCase().includes(t)));
      const locked = opts.toolbox ? defs.filter(d => !d.ai === !scenario()?.ai).length - defs.filter(allowed).length : 0;
      el.querySelector('[data-items]').innerHTML = (list.map(d =>
        `<button type="button" class="bd-item" draggable="true" data-def="${esc(d.id)}" title="${esc(d.whenToUse)}" style="--b:${esc(d.border)}"><span>${d.icon}</span>${esc(d.label)}</button>`).join('') || '<p class="bd-note">No match.</p>')
        + (locked && !t ? `<p class="bd-locked">🔒 ${locked} more components unlock as Ripple grows.</p>` : '');
    }

    // ---------- canvas ----------
    function nodeBadge(n) {
      const c = Sim.config(n, econ), d = econ.components[n.defId] || {};
      if (!d.tiers || d.role === 'source') return '';
      const bits = [];
      if (d.tiers.length > 1) bits.push(c.tier.label.split(' · ')[0].replace(' node', ''));
      if (c.count > 1) bits.unshift(c.count + '×');
      if (c.autoscale) bits.push('↗' + c.autoscale);
      if (c.shards > 1) bits.push(c.shards + ' shards');
      if (c.replicas) bits.push('+' + c.replicas + ' rep');
      if (c.azs > 1 && !d.multiAz) bits.push(c.azs + ' AZ');
      for (const [k, short] of [['grounded', 'grounded'], ['cachePrefix', 'cached prefix'], ['fresh', 'fresh'], ['confirm', 'confirms'], ['scoped', 'scoped']]) if (n.cfg?.[k]) bits.push(short);
      return bits.join(' · ');
    }
    function paintCanvas() {
      const nodes = el.querySelector('[data-nodes]'), tick = play ? play.res.ticks[play.h] : null;
      nodes.innerHTML = S.nodes.map(n => {
        const d = def(n.defId), on = (sel?.kind === 'node' && sel.id === n.id) || group.has(n.id), st = tick?.nodes[n.id];
        const heat = st ? ` is-${st.status}` : '';
        const mk = marks?.[n.id];
        return `<div class="bd-node${on ? ' is-sel' : ''}${heat}${mk ? ' is-diff is-diff-' + mk.kind : ''}" ${mk ? `title="${esc(mk.text)}" ` : ''}data-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px;width:${W}px;height:${H}px;--b:${esc(d.border)}${st ? `;--u:${Math.min(1, st.util)}` : ''}">
          ${['top', 'right', 'bottom', 'left'].map(s => `<i class="bd-h bd-h-${s}" data-handle="${s}"></i>`).join('')}<span class="bd-icon">${d.icon}</span><span class="bd-label">${esc(d.label)}</span>
          ${st && n.defId !== 'client' ? `<span class="bd-util">${st.status === 'down' ? 'DOWN' : st.util < 0.01 ? '<1%' : Math.round(st.util * 100) + '%'}</span>` : `<span class="bd-badge">${esc(nodeBadge(n))}</span>`}</div>`;
      }).join('');
      el.querySelector('[data-edges]').innerHTML = S.edges.map(e => { const a = nodeById(e.from), b = nodeById(e.to); if (!a || !b) return '';
        const on = sel?.kind === 'edge' && sel.id === e.id, d = edgePath(a, b), st = tick?.nodes[e.to], live = st && st.load > 0.01 && tick.nodes[e.from]?.status !== 'down';
        const w = live ? Math.min(6, 1.4 + Math.log10(1 + st.load) * 0.9) : 0;
        return `<g class="bd-edge${on ? ' is-sel' : ''}${live ? ' is-live' : ''}${st && (st.status === 'saturated' || st.status === 'down') ? ' is-bad' : ''}" data-edge="${esc(e.id)}"><path class="bd-hit" d="${d}"/><path class="bd-line" d="${d}" marker-end="url(#bd-arrow)"${live ? ` style="stroke-width:${w.toFixed(1)}px"` : ''}/></g>`; }).join('');
      el.querySelector('[data-empty]').hidden = S.nodes.length > 0;
      applyView();
    }

    // ---------- the bar: live cost, and the playback strip ----------
    function paintBar() {
      const c = el.querySelector('[data-cost]');
      if (!c) return;
      const q = Sim.quickCost(graph(), econ, scenario());
      c.innerHTML = `<b>${money(q.total)}</b>/month fixed${game && opts.scenario?.slo?.budget ? ` · budget ${money(opts.scenario.slo.budget)}` : ''}`;
      c.classList.toggle('is-over', !!(game && opts.scenario?.slo?.budget && q.total > opts.scenario.slo.budget));
    }
    function paintPlay() {
      const p = el.querySelector('[data-play]');
      if (!play) { p.hidden = true; p.innerHTML = ''; return; }
      const { res, h } = play, t = res.ticks[h], scn = scenario();
      const user = Object.entries(t.types).filter(([k]) => k !== 'attack');
      const rps = user.reduce((a, [, v]) => a + v.rps, 0), worst = Math.max(0, ...user.map(([, v]) => v.p99));
      const evs = (scn.events || []).map(e => ({ ...e, dur: Math.max(1, e.dur || 1) }));
      const now = evs.filter(e => h >= e.at && h < e.at + e.dur);
      const say = now.find(e => e.line && e.at === h);
      p.hidden = false;
      p.innerHTML = `<div class="bd-play-row"><button type="button" class="button" data-act="play" aria-label="${play.timer ? 'Pause' : h >= 23 ? 'Replay' : 'Play'}">${play.timer ? '⏸ Pause' : h >= 23 ? '↺ Replay' : '▶ Play'}</button>
          <div class="bd-time"><input type="range" min="0" max="23" step="1" value="${h}" data-hour aria-label="Hour of the simulated day">
            <div class="bd-marks">${evs.map(e => `<i class="bd-mark" style="left:${e.at / 23 * 100}%;width:${Math.max(1.5, Math.min(e.dur, 24 - e.at) / 23 * 100)}%" title="${esc(e.label || Sim.EVENT_LABEL[e.type])} at ${hh(e.at)}"></i>`).join('')}</div>
            <div class="bd-ok">${res.ticks.map(x => `<i style="height:${Math.max(2, (1 - x.ok) * 100)}%" class="${x.ok < 0.95 ? 'is-bad' : x.ok < 0.999 ? 'is-warn' : ''}"></i>`).join('')}</div></div>
          <div class="bd-read"><b>${hh(h)}</b><span>${fmt(rps)} req/s</span><span class="${t.ok < 0.99 ? 'is-bad' : ''}">${(t.ok * 100).toFixed(t.ok > 0.999 ? 2 : 1)}% ok</span><span>p99 ${ms(worst)}</span>${t.retryMult > 1.05 ? `<span class="is-bad">retries ×${t.retryMult.toFixed(1)}</span>` : ''}</div>
          <button type="button" class="button" data-act="endplay">Back to editing</button></div>
        <div class="bd-play-row bd-play-ctl"><button type="button" class="button" data-act="stepback" aria-label="Previous hour" ${h <= 0 ? 'disabled' : ''}>⏮ Step back</button><button type="button" class="button" data-act="stepfwd" aria-label="Next hour" ${h >= 23 ? 'disabled' : ''}>Step ⏭</button>
          <label class="bd-speed">Speed <select data-speed aria-label="Playback speed">${[[0.5, '0.5×'], [1, '1×'], [2, '2×'], [4, '4×']].map(([v, l]) => `<option value="${v}"${play.speed === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <button type="button" class="button" data-act="skip" ${h >= 23 ? 'disabled' : ''}>Skip to the end ⏩</button></div>
        ${now.length ? `<div class="bd-now">${now.map(e => `<span class="bd-chip">⚡ ${esc(e.label || Sim.EVENT_LABEL[e.type])}</span>`).join('')}${say ? `<span class="bd-say">${avatar(say.who)}<em>${esc(say.line)}</em></span>` : ''}</div>` : ''}`;
      if (h >= 23 && !play.done) {            // the last hour is on screen: the day is over, now the results may show
        const mine = play; mine.done = true;
        mine.endTimer = setTimeout(() => { if (play === mine) { paintPanel(); opts.onDayEnd?.({ finished: true, whatif: mine.whatif }); } }, 900);
      }
    }
    function startPlay(res) {
      stopPlay(false);
      play = { res, h: 0, timer: null, speed: 1, done: false, whatif: false };
      sel = null;
      paintCanvas(); paintPanel(); paintPlay();
      togglePlay();
    }
    function togglePlay() {
      if (!play) return;
      if (play.timer) { clearInterval(play.timer); play.timer = null; paintPlay(); return; }
      if (play.h >= 23) play.h = 0;
      play.timer = setInterval(() => { if (!play) return; if (play.h >= 23) { clearInterval(play.timer); play.timer = null; paintPlay(); return; } play.h++; paintCanvas(); paintPlay(); paintPanel(); }, (opts.speedMs || 450) / play.speed);
      paintPlay();
    }
    function pausePlay() { if (play?.timer) { clearInterval(play.timer); play.timer = null; } }
    function gotoHour(h) { if (!play) return; pausePlay(); play.h = Math.max(0, Math.min(23, h)); paintCanvas(); paintPlay(); paintPanel(); }
    function stopPlay(repaint = true) {
      if (!play) return;
      clearInterval(play.timer); clearTimeout(play.endTimer);
      const old = play; play = null;
      if (!old.done) opts.onDayEnd?.({ finished: false, whatif: old.whatif });
      if (repaint) { paintCanvas(); paintPlay(); paintPanel(); } else paintPlay();
    }
    function runDay(extra) {
      if (held) return status('Switch back to your design to run the day');
      if (!S.nodes.length) return status('Draw something first');
      const scn = extra ? { ...scenario(), events: [...(scenario().events || []), ...extra] } : scenario();
      const res = Sim.run(scn, graph(), econ);
      if (!extra) last = res;
      startPlay(res); play.whatif = !!extra;
      opts.onRun?.(res, graph(), { whatif: !!extra, scenario: scn });
      return res;
    }
    let last = null;

    // ---------- the panel ----------
    function configHtml(n) {
      const d = econ.components[n.defId] || {}, c = Sim.config(n, econ), o = new Set(d.opts || []), cfg = n.cfg || {};
      if (!d.tiers || d.role === 'source') return '';
      const q = Sim.quickCost({ nodes: [{ id: n.id, defId: n.defId, cfg }], edges: [], settings: S.settings }, econ, scenario());
      const usd = q.items.find(i => i.id === n.id)?.usd || 0, t = c.tier;
      const capacity = t.rps && d.role === 'compute' ? `~${fmt(t.rps)} req/s each` : d.role === 'cache' ? `${t.gb} GB · ~${fmt(t.rps)} ops/s per node` : t.reads ? `~${fmt(t.reads)} reads/s · ${fmt(t.writes)} writes/s${t.diskGb ? ` · ${fmt(t.diskGb)} GB disk` : ''}` : t.cores ? `${t.cores} cores each` : t.rps ? `~${fmt(t.rps)}/s` : '';
      const usage = [t.perMReq && `$${t.perMReq} per million requests`, t.perGb && `$${t.perGb}/GB served`, t.perMRead && `$${t.perMRead}/M reads, $${t.perMWrite}/M writes`, d.perGbMonth && `$${d.perGbMonth}/GB-month stored`].filter(Boolean).join(' · ');
      const numIn = (k, label, min, max, val, hint) => `<label title="${esc(hint || '')}"><span>${label}</span><input type="number" min="${min}" max="${max}" step="1" data-cfg="${k}" value="${esc(val)}"></label>`;
      return `<div class="bd-cfg">
        ${d.tiers.length > 1 ? `<label class="bd-wide"><span>Size</span><select data-cfg="tier">${d.tiers.map(x => `<option value="${esc(x.id)}" ${x.id === t.id ? 'selected' : ''}>${esc(x.label)}${x.usd ? ` · $${x.usd}/mo` : x.perMReq ? ` · $${x.perMReq}/M req` : ''}</option>`).join('')}</select></label>` : ''}
        <div class="bd-fields">
          ${o.has('count') ? numIn('count', d.role === 'cache' ? 'Shards' : 'Instances', 1, 500, c.count) : ''}
          ${o.has('autoscale') ? numIn('autoscale', 'Autoscale up to', 0, 500, cfg.autoscale || '', 'Adds instances when busy, an hour behind the load. Blank: fixed size.') : ''}
          ${o.has('azs') ? `<label><span>Zones</span><select data-cfg="azs">${[1, 2, 3].map(z => `<option value="${z}" ${z === c.azs ? 'selected' : ''}>${z === 1 ? 'One zone' : z + ' zones'}</option>`).join('')}</select></label>` : ''}
          ${o.has('replicas') ? numIn('replicas', 'Read replicas', 0, 5, c.replicas) : ''}
          ${o.has('shards') ? numIn('shards', 'Shards', 1, 64, c.shards) : ''}
          ${o.has('sync') ? `<label><span>Replica writes</span><select data-cfg="sync"><option value="async" ${c.sync === 'async' ? 'selected' : ''}>Asynchronous</option><option value="sync" ${c.sync === 'sync' ? 'selected' : ''}>Synchronous</option></select></label>` : ''}
        </div>
        ${['timeouts', 'canary', 'hotKey', 'coalesce', 'grounded', 'cachePrefix', 'fresh', 'confirm', 'scoped'].filter(k => o.has(k)).map(k => `<label class="bd-toggle" title="${esc(OPT_LABEL[k][1])}"><input type="checkbox" data-cfg="${k}" ${cfg[k] ? 'checked' : ''}><span>${OPT_LABEL[k][0]}</span></label>`).join('')}
        ${n.defId === 'db-sql' ? '<p class="bd-fine">Zones: 2 or more adds a synchronous standby in another zone (doubles the primary\'s price) for failover without losing writes.</p>' : ''}
        <div class="bd-row"><span>This component</span><b>${money(usd)}/month${usage ? ' + usage' : ''}</b></div>
        ${capacity ? `<div class="bd-row"><span>Capacity</span><b>${esc(capacity)}</b></div>` : ''}
        ${usage ? `<p class="bd-fine">${esc(usage)}</p>` : ''}${d.note ? `<p class="bd-fine">${esc(d.note)}</p>` : ''}</div>`;
    }
    function deploymentHtml() {
      return `<section class="bd-box"><h4>Deployment</h4><div class="bd-fields">
        <label><span>Regions</span><select data-set="regions">${[1, 2, 3].map(r => `<option value="${r}" ${r === S.settings.regions ? 'selected' : ''}>${r === 1 ? 'One region' : r + ' regions'}</option>`).join('')}</select></label>
        <label><span>Between regions</span><select data-set="crossRegion" ${S.settings.regions > 1 ? '' : 'disabled'}><option value="async" ${S.settings.crossRegion !== 'sync' ? 'selected' : ''}>Async replication</option><option value="sync" ${S.settings.crossRegion === 'sync' ? 'selected' : ''}>Sync replication</option></select></label></div>
        <p class="bd-fine">Every region runs a full copy of what you've drawn, and costs that much. Users reach the nearest one only if there's a DNS node with geo routing.</p></section>`;
    }
    const jit = str => { let x = 2166136261; for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619); x ^= x >>> 15; x = Math.imul(x, 2246822519); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };
    function paintPanel() {
      const panel = el.querySelector('[data-panel]');
      if (!panel) return;
      const d = sel?.kind === 'node' && nodeById(sel.id) ? def(nodeById(sel.id).defId) : null, n = d ? nodeById(sel.id) : null;
      if (play) {
        const t = play.res.ticks[play.h];
        const wob = (id, k, amp) => 1 + amp * (jit(`${play.h}|${id}|${k}`) * 2 - 1);   // display-only wobble: the graded numbers are untouched
        const rows = S.nodes.map(x => ({ x, st: t.nodes[x.id] })).filter(r => r.st && (r.st.util > 0.005 || r.st.status === 'down')).map(r => ({ ...r, u: r.st.util < 1 ? Math.min(r.st.util * wob(r.x.id, 'u', 0.08), 0.99) : r.st.util })).sort((a, b) => b.u - a.u).slice(0, 10);
        panel.innerHTML = `<section class="bd-box"><h4>${hh(play.h)} · busiest components</h4>${rows.map(r => `<div class="bd-row bd-u-${esc(r.st.status)}"><span>${def(r.x.defId).icon} ${esc(def(r.x.defId).label)}</span><b>${r.st.status === 'down' ? 'down' : `${fmt(Math.round((r.st.load || 0) * wob(r.x.id, 'r', 0.06)))}/s · ${Math.round(r.u * 100)}%`}</b></div>`).join('') || '<p class="bd-note">Quiet.</p>'}
          <h4 style="margin-top:12px">Requests this hour</h4>${Object.entries(t.types).map(([k, v]) => `<div class="bd-row"><span>${esc(Sim.LABEL[k] || k)}</span><b>${fmt(Math.round(v.rps * wob(k, 'q', 0.04)))}/s · ${(v.ok * 100).toFixed(v.ok > 0.999 ? 2 : 1)}% · ${ms(v.p99 * wob(k, 'p', 0.07))}</b></div>`).join('')}
          ${Object.values(t.queues).some(q => q.backlog > 1) ? `<h4 style="margin-top:12px">Queues</h4>${Object.entries(t.queues).map(([id, q]) => `<div class="bd-row"><span>${esc(def(nodeById(id)?.defId).label)}${q.stalled ? ' (stalled)' : ''}</span><b>${fmt(q.backlog)} waiting · ${Number.isFinite(q.lagMin) ? Math.round(q.lagMin) + ' min' : '∞'}</b></div>`).join('')}` : ''}</section>
          ${game || !play.done ? '' : `<section class="bd-box"><h4>The day</h4>${reportHtml(play.res, { labelOf, maxFindings: 6 })}</section>`}`;
        return;
      }
      const field = (k, label, ph) => `<label><span>${label}</span><input type="text" inputmode="decimal" data-scale="${k}" value="${esc(S.scale[k])}" placeholder="${ph}"></label>`;
      const row = (a, b) => `<div class="bd-row"><span>${a}</span><b>${b}</b></div>`;
      const nodeBox = d ? `<section class="bd-box"><h4>${d.icon} ${esc(d.label)}</h4>${configHtml(n)}<p>${esc(d.description)}</p><p class="bd-when"><strong>Add it when</strong> ${esc(d.whenToUse)}</p><p class="bd-scale"><strong>At scale</strong> ${esc(d.scaleNote)}</p>
          <button type="button" class="button" data-act="delete">Remove from diagram</button></section>`
        : sel?.kind === 'edge' ? '<section class="bd-box"><h4>Connection</h4><p>Select it and press Delete, or:</p><button type="button" class="button" data-act="delete">Remove connection</button></section>' : '';
      if (game) {
        const s = opts.scenario, sc = { dau: String(s.dau) }, checks = s.ai ? [] : Calc.checks({ nodes: S.nodes, edges: S.edges }, sc, { availability: `${s.slo?.availability}%` });
        const q = Sim.quickCost(graph(), econ, s);
        panel.innerHTML = `${nodeBox || `<section class="bd-box"><h4>How to build</h4><ol class="bd-how"><li>Drag components in and connect them, client first.</li><li>Click a component to size it: instances, zones, replicas, options.</li><li>Press <b>Run the day</b> to play the scenario against it.</li></ol></section>`}
          ${deploymentHtml()}
          <section class="bd-box"><h4>Fixed costs</h4>${q.items.filter(i => i.usd >= 0.5).slice(0, 8).map(i => row(esc(labelOf(i.defId)), money(i.usd))).join('') || '<p class="bd-note">Nothing priced yet.</p>'}${row('<strong>Total</strong>', `<strong>${money(q.total)}</strong>`)}<p class="bd-fine">Plus usage: requests, bandwidth and storage, billed when you run the day.</p></section>
          ${checks.length ? `<section class="bd-box"><h4>Quick checks</h4><ul class="bd-checks">${checks.map(c => `<li class="bd-${c.level}"><span>${c.level === 'warn' ? '⚠' : c.level === 'good' ? '✓' : '💡'}</span>${esc(c.text)}</li>`).join('')}</ul></section>` : ''}`;
        return;
      }
      const e = Calc.estimate(S.scale), found = Calc.checks({ nodes: S.nodes, edges: S.edges }, S.scale, S.nfr);
      panel.innerHTML = `
        ${nodeBox || `<section class="bd-box"><h4>How to use</h4><ol class="bd-how"><li>Load a sample, or drag components onto the canvas.</li><li>Hover a node and drag from a dot to another node to connect them.</li><li>Click a node to size it and see what it costs.</li><li>Set the scale below, then <b>Run the day</b> to watch it cope (or not).</li></ol><p class="bd-fine">Want stakes? Play <b>Ripple Ops</b> from the simulators page: budgets, incidents and the team.</p></section>`}
        ${last ? `<section class="bd-box"><h4>Last run</h4>${reportHtml(last, { labelOf, maxFindings: 5 })}</section>` : ''}
        <section class="bd-box"><h4>Requirements</h4><textarea rows="3" data-req placeholder="e.g. Users can post, follow, view a feed…">${esc(S.req)}</textarea></section>
        <section class="bd-box"><h4>Scale</h4><div class="bd-fields">${field('dau', 'Daily users', 'e.g. 1000000')}${field('readQps', 'Read QPS', 'auto')}${field('writeQps', 'Write QPS', 'auto')}${field('storageGb', 'Storage (GB)', 'e.g. 500')}</div>
          <div class="bd-fields"><label><span>Latency (ms)</span><input type="text" inputmode="numeric" data-nfr="latencyMs" value="${esc(S.nfr.latencyMs)}"></label>
          <label><span>Availability</span><select data-nfr="availability">${['99%', '99.9%', '99.99%', '99.999%'].map(o => `<option ${o === S.nfr.availability ? 'selected' : ''}>${o}</option>`).join('')}</select></label></div>
          <label class="bd-wide"><span>Consistency</span><select data-nfr="consistency">${['Eventual', 'Strong', 'Read-your-writes', 'Monotonic reads'].map(o => `<option ${o === S.nfr.consistency ? 'selected' : ''}>${o}</option>`).join('')}</select></label></section>
        ${deploymentHtml()}
        <section class="bd-box bd-est"><h4>Estimates</h4>
          ${row('Reads', `${fmt(e.readQps)}/s avg · ${fmt(e.peakRead)}/s peak`)}${row('Writes', `${fmt(e.writeQps)}/s avg · ${fmt(e.peakWrite)}/s peak`)}
          ${row('Hot cache', `~${fmt(e.hotCacheGb)} GB`)}${row('New data', `~${fmt(e.storageGbPerYear)} GB / year`)}${row('App servers', `~${e.appServers}`)}${row('Read replicas', `~${e.readReplicas}`)}${row('CDN offload', e.cdnOffload)}
          <p class="bd-fine">Rules of thumb: 10 reads and 1 write per user per day when blank, peak 5× average, a fifth of users hot at ~10 KB, ~1 KB per write, ~1k requests/s per app server, ~10k reads/s per replica.${num(S.scale.storageGb) ? ` You stated ${fmt(num(S.scale.storageGb))} GB stored.` : ''}</p></section>
        <section class="bd-box"><h4>Checks</h4>${found.length ? `<ul class="bd-checks">${found.map(c => `<li class="bd-${c.level}"><span>${c.level === 'warn' ? '⚠' : c.level === 'good' ? '✓' : '💡'}</span>${esc(c.text)}</li>`).join('')}</ul>` : '<p class="bd-note">Add some components and checks will appear here.</p>'}</section>`;
    }
    function status(t) { const s = el.querySelector('[data-status]'); if (s) { s.textContent = t; clearTimeout(status.t); status.t = setTimeout(() => { s.textContent = ''; }, 2500); } }

    // ---------- actions ----------
    function addNode(defId, x, y) {
      snapshot();
      if (x == null) { const i = S.nodes.length; x = 40 + (i % 6) * (W + 40); y = 40 + Math.floor(i / 6) * (H + 50); }
      const n = { id: uid('n'), defId, x: Math.max(0, Math.min(CANVAS_W - W, Math.round(x))), y: Math.max(0, Math.min(CANVAS_H - H, Math.round(y))) };
      S.nodes.push(n); sel = { kind: 'node', id: n.id }; touch();
    }
    function remove() {
      if (group.size) { snapshot(); S.nodes = S.nodes.filter(n => !group.has(n.id)); S.edges = S.edges.filter(e => !group.has(e.from) && !group.has(e.to)); group.clear(); sel = null; touch(); return; }
      if (!sel) return;
      snapshot();
      if (sel.kind === 'node') { S.nodes = S.nodes.filter(n => n.id !== sel.id); S.edges = S.edges.filter(e => e.from !== sel.id && e.to !== sel.id); }
      else S.edges = S.edges.filter(e => e.id !== sel.id);
      sel = null; touch();
    }
    function setGraph(g, quiet) {
      if (!g) return;
      if (!quiet) snapshot();
      S.nodes = (g.nodes || []).map(n => ({ ...n, cfg: n.cfg ? { ...n.cfg } : undefined })); S.edges = (g.edges || []).map(e => ({ ...e }));
      S.settings = { regions: 1, crossRegion: 'async', ...(g.settings || {}) }; sel = null; touch();
    }
    function loadPreset(id) {
      const p = data.presets.find(x => x.id === id);
      if (!p) return;
      setGraph({ nodes: p.nodes, edges: p.edges });
      const dau = { '1k': '1000', '10k': '10000', '100k': '100000', '1m': '1000000' }[id];
      if (dau && !S.scale.dau) { S.scale.dau = dau; touch(); }
    }
    function doUndo() {
      const prev = undo.pop();
      if (!prev) return status('Nothing to undo');
      const v = JSON.parse(prev); S.nodes = v.nodes; S.edges = v.edges; S.settings = v.settings || S.settings; sel = null; touch();
    }
    async function copyMermaid() {
      const labels = Object.fromEntries(defs.map(d => [d.id, d.label])), text = Calc.toMermaid({ nodes: S.nodes, edges: S.edges }, labels);
      try { await navigator.clipboard.writeText(text); status('Mermaid copied'); } catch { window.prompt('Copy this Mermaid diagram:', text); }
    }
    function setCfg(k, raw, t) {
      const n = sel?.kind === 'node' && nodeById(sel.id);
      if (!n) return;
      snapshot();
      const cfg = { ...(n.cfg || {}) };
      if (t.type === 'checkbox') cfg[k] = t.checked;
      else if (k === 'tier' || k === 'sync') cfg[k] = raw;
      else { const v = parseInt(raw, 10); if (Number.isFinite(v) && v > 0) cfg[k] = v; else delete cfg[k]; if (k === 'replicas' && raw === '0') cfg[k] = 0; }
      if (cfg.autoscale && cfg.autoscale <= (cfg.count || 1)) delete cfg.autoscale;
      n.cfg = cfg;
      save(); paintCanvas(); paintBar();
      const keep = t.matches('input[type=number]') ? `[data-cfg="${k}"]` : null, at = keep ? t.value : null;
      paintPanel();
      if (keep) { const again = el.querySelector(keep); if (again) { again.focus(); again.value = at; } }
    }

    // ---------- pointer handling ----------
    const stage = () => el.querySelector('[data-stage]'), canvas = () => el.querySelector('[data-canvas]');
    let zoom = 1, pan = null, vx = 0, vy = 0;
    const local = ev => { const r = canvas().getBoundingClientRect(); return [(ev.clientX - r.left) / zoom, (ev.clientY - r.top) / zoom]; };
    // The view is a pan offset plus zoom. It may drift past the canvas edge, but never so far that no component
    // (or, on an empty canvas, none of the canvas) is left on screen.
    function clampView(x, y) {
      const st = stage(), vw = st.clientWidth, vh = st.clientHeight;
      const rects = S && S.nodes.length ? S.nodes.map(n => [n.x, n.y, W, H]) : [[0, 0, CANVAS_W, CANVAS_H]];
      let best = null, bd = Infinity;
      for (const [rx, ry, rw, rh] of rects) {
        const mx = Math.min(60, rw * zoom), my = Math.min(60, rh * zoom);
        const lim = (o, r0, rs, m, v) => { const lo = m - (r0 + rs) * zoom, hi = v - m - r0 * zoom; return lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, o)); };
        const cx = lim(x, rx, rw, mx, vw), cy = lim(y, ry, rh, my, vh), d = Math.hypot(cx - x, cy - y);
        if (d < bd) { bd = d; best = [cx, cy]; if (!d) break; }
      }
      return best;
    }
    const applyView = () => { [vx, vy] = clampView(vx, vy); canvas().style.transform = `translate(${vx}px,${vy}px) scale(${zoom})`; };
    const setZoom = (z, cx, cy) => {
      const nz = Math.max(0.4, Math.min(2, z));
      if (nz === zoom) return;
      const r = canvas().getBoundingClientRect(), ax = (cx - r.left) / zoom, ay = (cy - r.top) / zoom;
      zoom = nz; vx += cx - ax * nz - r.left; vy += cy - ay * nz - r.top; applyView();
    };
    const onWheel = ev => {
      if (!ev.target.closest('[data-stage]')) return;
      ev.preventDefault(); setZoom(zoom * Math.exp(-ev.deltaY * 0.0015), ev.clientX, ev.clientY);
    };
    const onDown = ev => {
      if (!ev.target.closest('[data-canvas]')) return;
      const handle = ev.target.closest('[data-handle]'), node = ev.target.closest('.bd-node'), edge = ev.target.closest('[data-edge]');
      if (play && (handle || node || edge)) stopPlay();
      if (handle && node) {
        ev.preventDefault();
        const n = nodeById(node.dataset.id); link = { from: n.id, side: handle.dataset.handle }; canvas().classList.add('is-linking');
        stage().setPointerCapture?.(ev.pointerId);
      } else if (node) {
        const n = nodeById(node.dataset.id), [px, py] = local(ev);
        if (ev.ctrlKey || ev.metaKey) {   // Ctrl/Cmd-click toggles one component in or out of the selection
          ev.preventDefault();
          if (!group.size && sel?.kind === 'node') group.add(sel.id);
          group.has(n.id) ? group.delete(n.id) : group.add(n.id);
          sel = group.size === 1 ? { kind: 'node', id: [...group][0] } : null; if (group.size < 2) group.clear();
          paintCanvas(); paintPanel(); return;
        }
        const together = group.has(n.id) && group.size > 1;
        if (!together) { group.clear(); sel = { kind: 'node', id: n.id }; } else sel = null;
        drag = { id: n.id, dx: px - n.x, dy: py - n.y, moved: false, from: together ? S.nodes.filter(m => group.has(m.id)).map(m => [m.id, m.x, m.y]) : null, px, py };
        paintCanvas(); paintPanel(); stage().focus({ preventScroll: true });
        stage().setPointerCapture?.(ev.pointerId);
      } else if (edge) { sel = { kind: 'edge', id: edge.dataset.edge }; paintCanvas(); paintPanel(); stage().focus({ preventScroll: true }); }
      else if (ev.shiftKey) {   // Shift-drag on empty space: rubber-band select (Ctrl+Shift adds to the selection)
        const [px, py] = local(ev); box = { x: px, y: py, w: 0, h: 0 };
        if (ev.ctrlKey || ev.metaKey) { if (!group.size && sel?.kind === 'node') group.add(sel.id); } else group.clear();
        sel = null; paintPanel();
        const m = document.createElement('div'); m.className = 'bd-marquee'; canvas().appendChild(m); box.el = m;
        stage().setPointerCapture?.(ev.pointerId); ev.preventDefault();
      } else {
        if (!ev.ctrlKey && !ev.metaKey) { group.clear(); paintCanvas(); }
        if (!play && sel && !ev.ctrlKey && !ev.metaKey) { sel = null; paintCanvas(); paintPanel(); }
        const st = stage(); pan = { x: ev.clientX, y: ev.clientY, l: vx, t: vy };
        st.classList.add('is-panning'); st.setPointerCapture?.(ev.pointerId);
      }
    };
    const onMove = ev => {
      if (box) {
        const [px, py] = local(ev), x = Math.min(box.x, px), y = Math.min(box.y, py), w = Math.abs(px - box.x), h = Math.abs(py - box.y);
        Object.assign(box.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
        box.r = [x, y, x + w, y + h];
      } else if (pan) { vx = pan.l + ev.clientX - pan.x; vy = pan.t + ev.clientY - pan.y; applyView(); }
      else if (drag && drag.from) {
        const [px, py] = local(ev);
        if (!drag.moved) { snapshot(); drag.moved = true; }
        let dx = Math.round(px - drag.px), dy = Math.round(py - drag.py);
        for (const [, x, y] of drag.from) { dx = Math.max(dx, -x); dy = Math.max(dy, -y); dx = Math.min(dx, CANVAS_W - W - x); dy = Math.min(dy, CANVAS_H - H - y); }
        for (const [id, x, y] of drag.from) { const m = nodeById(id); m.x = x + dx; m.y = y + dy; const div = el.querySelector(`.bd-node[data-id="${CSS.escape(id)}"]`); if (div) { div.style.left = m.x + 'px'; div.style.top = m.y + 'px'; } }
        el.querySelectorAll('[data-edge]').forEach(g => { const e = S.edges.find(x => x.id === g.dataset.edge); if (!e) return; const a = nodeById(e.from), b = nodeById(e.to); g.querySelectorAll('path').forEach(p => p.setAttribute('d', edgePath(a, b))); });
      } else if (drag) {
        const n = nodeById(drag.id), [px, py] = local(ev);
        if (!drag.moved) { snapshot(); drag.moved = true; }
        n.x = Math.max(0, Math.min(CANVAS_W - W, Math.round(px - drag.dx))); n.y = Math.max(0, Math.min(CANVAS_H - H, Math.round(py - drag.dy)));
        const div = el.querySelector(`.bd-node[data-id="${CSS.escape(n.id)}"]`); if (div) { div.style.left = n.x + 'px'; div.style.top = n.y + 'px'; }
        el.querySelectorAll('[data-edge]').forEach(g => { const e = S.edges.find(x => x.id === g.dataset.edge); if (!e) return; const a = nodeById(e.from), b = nodeById(e.to); g.querySelectorAll('path').forEach(p => p.setAttribute('d', edgePath(a, b))); });
      } else if (link) {
        const a = nodeById(link.from), [px, py] = local(ev), [x1, y1] = anchors(a)[link.side];
        const nn = NORMAL[link.side], k = Math.min(80, Math.hypot(px - x1, py - y1) / 2);
        el.querySelector('[data-preview]').setAttribute('d', `M ${x1} ${y1} C ${x1 + nn[0] * k} ${y1 + nn[1] * k}, ${px} ${py}, ${px} ${py}`);
      }
    };
    const onUp = ev => {
      if (box) {
        const r = box.r; box.el.remove();
        if (r) { for (const n of S.nodes) if (n.x < r[2] && n.x + W > r[0] && n.y < r[3] && n.y + H > r[1]) group.add(n.id); }
        box = null; if (group.size === 1) { sel = { kind: 'node', id: [...group][0] }; group.clear(); } paintCanvas(); paintPanel();
      }
      if (pan) { pan = null; stage().classList.remove('is-panning'); }
      if (drag) { if (drag.moved) { save(); applyView(); } drag = null; }
      if (link) {
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.bd-node'), to = over && over.dataset.id;
        if (to && to !== link.from && !S.edges.some(e => e.from === link.from && e.to === to)) {
          snapshot(); const e = { id: uid('e'), from: link.from, to }; S.edges.push(e); sel = { kind: 'edge', id: e.id }; touch();
        }
        link = null; canvas().classList.remove('is-linking'); el.querySelector('[data-preview]').setAttribute('d', '');
      }
    };
    const onKey = ev => {
      if (ev.target.closest('input,textarea,select')) return;
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel) { ev.preventDefault(); remove(); }
      else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); doUndo(); }
      else if (play && ev.key === ' ') { ev.preventDefault(); togglePlay(); }
      else if (play && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) { ev.preventDefault(); play.h = Math.max(0, Math.min(23, play.h + (ev.key === 'ArrowRight' ? 1 : -1))); paintCanvas(); paintPlay(); paintPanel(); }
    };
    const onClick = ev => {
      const item = ev.target.closest('.bd-item'), act = ev.target.closest('[data-act]')?.dataset.act;
      if (item) addNode(item.dataset.def);
      else if (act === 'undo') doUndo(); else if (act === 'delete') remove();
      else if (act === 'mermaid') copyMermaid();
      else if (act === 'run') runDay();
      else if (act === 'play') togglePlay();
      else if (act === 'stepback') gotoHour(play.h - 1); else if (act === 'stepfwd') gotoHour(play.h + 1); else if (act === 'skip') gotoHour(23);
      else if (act === 'endplay') stopPlay();
      else if (act === 'clear') { if (!S.nodes.length) return; snapshot(); S.nodes = []; S.edges = []; sel = null; touch(); }
    };
    const onInput = ev => {
      const t = ev.target;
      if (t.dataset.filter !== undefined) paintItems(t.value);
      else if (t.dataset.hour !== undefined && play) gotoHour(+t.value);
      else if (t.dataset.speed !== undefined && play) { play.speed = +t.value; if (play.timer) { pausePlay(); togglePlay(); } }
      else if (t.dataset.cfg && t.type === 'number') setCfg(t.dataset.cfg, t.value, t);
      else if (t.dataset.scale) { S.scale[t.dataset.scale] = t.value; save(); paintPanelKeepFocus(t); paintBar(); }
      else if (t.dataset.nfr && t.tagName === 'INPUT') { S.nfr[t.dataset.nfr] = t.value; save(); paintPanelKeepFocus(t); }
      else if (t.dataset.req !== undefined) { S.req = t.value; save(); }
    };
    function paintPanelKeepFocus(t) {                         // redraw the estimates without losing the caret
      const k = t.dataset.scale ? `[data-scale="${t.dataset.scale}"]` : `[data-nfr="${t.dataset.nfr}"]`, at = t.selectionStart;
      paintPanel(); const again = el.querySelector(k); if (again) { again.focus(); try { again.setSelectionRange(at, at); } catch { /* selects have no caret */ } }
    }
    const onChange = ev => {
      const t = ev.target;
      if (t.dataset.preset !== undefined && t.value) { loadPreset(t.value); t.value = ''; }
      else if (t.dataset.cfg && t.type !== 'number') setCfg(t.dataset.cfg, t.value, t);
      else if (t.dataset.set) { snapshot(); S.settings[t.dataset.set] = t.dataset.set === 'regions' ? +t.value : t.value; touch(); }
      else if (t.dataset.nfr && t.tagName === 'SELECT') { S.nfr[t.dataset.nfr] = t.value; save(); paintPanel(); }
    };
    const onDragStart = ev => { const it = ev.target.closest('.bd-item'); if (it) { ev.dataTransfer.setData('text/plain', 'bd:' + it.dataset.def); ev.dataTransfer.effectAllowed = 'copy'; } };
    const onDragOver = ev => { if (ev.target.closest('[data-canvas]')) ev.preventDefault(); };
    const onDrop = ev => {
      const t = ev.dataTransfer.getData('text/plain');
      if (!t.startsWith('bd:') || !ev.target.closest('[data-canvas]')) return;
      ev.preventDefault(); const [x, y] = local(ev); addNode(t.slice(3), x - W / 2, y - H / 2);
    };

    const ready = loadData().then(() => {
      if (dead) return;
      defs = data.components;
      S = (opts.initial ? { ...fresh(), ...opts.initial, settings: { regions: 1, crossRegion: 'async', ...(opts.initial.settings || {}) } } : null) || readLocal(key) || fresh();
      if (opts.initial) S.nodes = S.nodes.map(n => ({ ...n }));
      shell(); paintCanvas(); paintPanel(); paintBar();
      const on = (t, ev, f) => { t.addEventListener(ev, f); offs.push(() => t.removeEventListener(ev, f)); }, offs = [];
      on(el, 'pointerdown', onDown); on(el, 'pointermove', onMove); on(el, 'pointerup', onUp); on(el, 'pointercancel', onUp);
      on(el, 'wheel', onWheel); on(el, 'keydown', onKey); on(el, 'click', onClick); on(el, 'input', onInput); on(el, 'change', onChange);
      on(el, 'dragstart', onDragStart); on(el, 'dragover', onDragOver); on(el, 'drop', onDrop);
      el._bdOffs = offs;
    }).catch(err => { if (!dead) el.innerHTML = `<p class="bd-note">Could not load the builder (${esc(err.message)}).</p>`; });
    return {
      ready,
      // View another graph (the reference) without touching his: show(g, marks) swaps it in, show(null) restores his.
      show(g, m) {
        if (!S) return;
        if (g && !held) held = { nodes: S.nodes, edges: S.edges, settings: S.settings };
        if (!g && !held) { marks = m || null; paintCanvas(); return; }
        if (g) { S.nodes = (g.nodes || []).map(n => ({ ...n, cfg: n.cfg ? { ...n.cfg } : undefined })); S.edges = (g.edges || []).map(e => ({ ...e })); S.settings = { regions: 1, crossRegion: 'async', ...(g.settings || {}) }; }
        else { S.nodes = held.nodes; S.edges = held.edges; S.settings = held.settings; held = null; }
        marks = m || null; sel = null; group.clear(); stopPlay(false); paintCanvas(); paintPanel(); paintBar();
        el.classList.toggle('is-viewing', !!held);
      },
      destroy() { dead = true; clearTimeout(saveTimer); stopPlay(false); if (S && !held) writeLocal(key, S); (el._bdOffs || []).forEach(f => f()); },
      state: () => S, graph, setGraph, run: runDay, labelOf, econ: () => econ,
      flush() { clearTimeout(saveTimer); if (S && !held) { writeLocal(key, S); opts.onChange?.(graph()); } },
    };
  }

  window.SDBuilder = { mount, reportHtml, avatar, stars, money, fmt, CAST, load: loadData, data: () => ({ data, econ }) };
})();
