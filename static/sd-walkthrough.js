// Design walkthroughs: 27 classic system designs as an interactive diagram. Step a request through the
// architecture, read each component's trade-offs and failure modes, then push load through it and swap
// components to see what breaks first. Data lives in /walkthrough/<id>.json (from the old site); the
// diagram is laid out here from the design's Mermaid graph; the maths is in sd-stress.js (pure).
// Used two ways: the `walkthrough` lesson simulator (config: {design}), and the System Design
// "Simulators" page (sd-simulators.js). Nothing here touches the server or your practice data.
(function () {
  'use strict';
  const S = window.SDStress;
  const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const md = t => window.SDBlocks ? window.SDBlocks.md(t) : `<p>${esc(t)}</p>`;
  const fetchJson = async url => {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const designs = {}, loading = {};
  const loadDesign = id => designs[id] ? Promise.resolve(designs[id])
    : loading[id] || (loading[id] = fetchJson(`/walkthrough/${encodeURIComponent(id)}.json`).then(d => (designs[id] = d)).finally(() => { delete loading[id]; }));

  const HUE = { client: 210, lb: 195, api: 150, worker: 125, cache: 32, kv: 48, sql: 280, nosql: 305, queue: 18, stream: 350,
    'stream-processor': 330, blob: 62, search: 175, coordinator: 245 };
  const fmt = n => !isFinite(n) ? '∞' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(0) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : n >= 10 ? Math.round(n).toString() : n.toFixed(1);
  const ms = n => n >= 30000 ? 'timeout' : n >= 1000 ? (n / 1000).toFixed(1) + ' s' : n >= 10 ? Math.round(n) + ' ms' : n.toFixed(1) + ' ms';
  const pretty = v => typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  const trim = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const TABS = [['flow', 'Walk a request'], ['parts', 'Components'], ['stress', 'Stress test'], ['brief', 'The brief']];

  function mount(el, { design: id, onTouch = () => {}, back = null } = {}) {
    let d = null, dead = false, timer = null;
    const st = { tab: 'flow', flow: 0, step: 0, sel: null, qps: 1000, swaps: {} };
    el.classList.add('wt');
    el.innerHTML = '<p class="wt-note">Loading the design…</p>';

    const flow = () => d.operations[st.flow];
    const steps = () => flow().steps;
    const comps = () => d.architecture.components;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const offs = [];
    const on = (type, fn) => { el.addEventListener(type, fn); offs.push(() => el.removeEventListener(type, fn)); };
    const path = () => S.flowPath(steps());
    const overrides = () => Object.fromEntries(Object.entries(st.swaps).map(([cid, alt]) => [cid, comps()[cid].alternatives.find(a => a.id === alt)?.sim]).filter(([, v]) => v));

    function diagramSvg(L) {
      const edge = e => `<path class="wt-edge" data-from="${esc(e.from)}" data-to="${esc(e.to)}" d="${e.d}" marker-end="url(#wt-arrow)"/>`;
      const node = n => {
        const c = comps()[n.id] || {}, kind = c.kind || 'api';
        return `<g class="wt-node wt-${esc(n.shape)}" data-id="${esc(n.id)}" transform="translate(${n.x} ${n.y})" style="--h:${HUE[kind] ?? 220}" tabindex="0" role="button" aria-label="${esc(c.name || n.label)}">
          <rect width="${n.w}" height="${n.h}" rx="${n.shape === 'db' ? 24 : 10}"/>
          <text class="wt-kind" x="${n.w / 2}" y="19">${esc(kind.toUpperCase())}</text>
          <text class="wt-name" x="${n.w / 2}" y="39">${esc(trim(n.label, 24))}</text>
          <text class="wt-heat" x="${n.w - 8}" y="14" text-anchor="end"></text></g>`;
      };
      return `<svg class="wt-svg" viewBox="0 0 ${L.width} ${L.height}" role="img" aria-label="Architecture diagram">
        <defs><marker id="wt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z"/></marker></defs>
        ${L.edges.map(edge).join('')}${L.nodes.map(node).join('')}</svg>`;
    }

    // Diagram state follows the tab: the flow tab lights the current step, stress tints by load, parts marks the selection.
    function paintDiagram() {
      const inPath = new Set(path()), cur = steps()[st.step], prev = steps()[st.step - 1];
      const seen = new Set(steps().slice(0, st.step).map(s => s.componentId));
      const res = st.tab === 'stress' ? run() : null;
      const heat = res ? Object.fromEntries(res.stages.map(s => [s.id, s])) : {};
      el.querySelectorAll('.wt-node').forEach(n => {
        const id = n.dataset.id, h = heat[id];
        n.classList.toggle('is-off', st.tab !== 'parts' && !inPath.has(id));
        n.classList.toggle('is-active', st.tab === 'flow' && cur?.componentId === id);
        n.classList.toggle('is-seen', st.tab === 'flow' && seen.has(id) && cur?.componentId !== id);
        n.classList.toggle('is-sel', st.tab === 'parts' && st.sel === id);
        ['ok', 'warm', 'hot', 'saturated'].forEach(k => n.classList.toggle('heat-' + k, !!h && !h.unlimited && h.status === k));
        n.querySelector('.wt-heat').textContent = h && !h.unlimited ? Math.round(Math.min(h.util, 9.99) * 100) + '%' : '';
      });
      el.querySelectorAll('.wt-edge').forEach(e => {
        const onPath = path().some((id, i, a) => i && a[i - 1] === e.dataset.from && id === e.dataset.to);
        e.classList.toggle('is-path', st.tab !== 'parts' && onPath);
        e.classList.toggle('is-active', st.tab === 'flow' && !!prev && prev.componentId === e.dataset.from && cur?.componentId === e.dataset.to);
      });
    }

    // ---------- panes ----------
    function flowPane() {
      const s = steps()[st.step], c = comps()[s.componentId], n = steps().length;
      const diff = S.diffKeys(s.stateBefore, s.stateAfter);
      const payload = (title, p) => p ? `<div class="wt-payload"><span class="wt-label">${esc(title)}${p.label ? ' · ' + esc(p.label) : ''}</span>${p.payload != null ? `<pre>${esc(pretty(p.payload))}</pre>` : ''}</div>` : '';
      return `<div class="wt-controls">
          <select data-act="flow" aria-label="Flow">${d.operations.map((o, i) => `<option value="${i}" ${i === st.flow ? 'selected' : ''}>${esc(o.title)}</option>`).join('')}</select>
          <span class="wt-btns"><button type="button" class="button" data-act="first" aria-label="Back to the start">⏮</button><button type="button" class="button" data-act="prev" ${st.step ? '' : 'disabled'}>‹ Prev</button>
          <button type="button" class="button is-primary" data-act="play">${timer ? 'Pause' : 'Play'}</button><button type="button" class="button" data-act="next" ${st.step < n - 1 ? '' : 'disabled'}>Next ›</button></span>
          <span class="wt-count">Step ${st.step + 1} of ${n}</span></div>
        <input type="range" class="wt-scrub" data-act="seek" min="0" max="${n - 1}" value="${st.step}" aria-label="Step">
        <p class="wt-flow-desc">${esc(flow().description || '')}</p>
        <article class="wt-step"><span class="wt-chip" style="--h:${HUE[c?.kind] ?? 220}">${esc(c?.name || s.componentId)}</span>
          <h3>${esc(s.title)}</h3><p>${esc(s.action)}</p>
          ${s.codeOrCommand ? `<pre class="wt-code">${esc(s.codeOrCommand)}</pre>` : ''}
          <div class="wt-payloads">${payload('Arrives', s.incoming)}${payload('Sent on', s.outgoing)}</div>
          ${diff.length ? `<div class="wt-state"><span class="wt-label">State</span>${diff.map(r => `<div class="wt-row${r.changed ? ' is-changed' : ''}"><code>${esc(r.key)}</code>${r.changed ? `<span class="wt-was">${esc(trim(pretty(r.before ?? '—'), 80))}</span><span class="wt-arrow">→</span>` : ''}<span class="wt-now">${esc(trim(pretty(r.after ?? '—'), 120))}</span></div>`).join('')}</div>` : ''}
          ${s.note ? `<div class="wt-insight"><strong>Worth saying in an interview.</strong> ${esc(s.note)}</div>` : ''}</article>`;
    }

    function partsPane() {
      const ids = Object.keys(comps());
      if (!st.sel || !comps()[st.sel]) st.sel = path()[0] || ids[0];
      const c = comps()[st.sel], sim = c.sim || {};
      const alt = a => `<li><strong>${esc(a.name)}</strong> <span class="wt-dim">${esc(ms(S.stage(a.sim, 0).p50))} · ${a.sim.concurrency == null ? 'unlimited' : fmt(a.sim.concurrency) + ' concurrent'}</span>
        ${(a.tradeoffs?.gained || []).map(t => `<div class="wt-gain">＋ ${esc(t)}</div>`).join('')}${(a.tradeoffs?.lost || []).map(t => `<div class="wt-loss">− ${esc(t)}</div>`).join('')}</li>`;
      const bn = b => `<details class="wt-bn"><summary><span class="wt-sev wt-sev-${esc(b.severity)}">${esc(b.severity)}</span> ${esc(b.title)}</summary>
        <p><strong>What triggers it.</strong> ${esc(b.trigger)}</p><p><strong>What you see.</strong> ${esc(b.symptom)}</p>
        <p><strong>The fix.</strong> ${esc(b.mitigation)}</p><p><strong>How you'd notice.</strong> ${esc(b.detection)}</p></details>`;
      return `<div class="wt-parts"><nav class="wt-list" aria-label="Components">${ids.map(id => `<button type="button" class="wt-part${id === st.sel ? ' is-on' : ''}" data-act="part" data-id="${esc(id)}" style="--h:${HUE[comps()[id].kind] ?? 220}">${esc(comps()[id].name)}</button>`).join('')}</nav>
        <article class="wt-detail"><h3>${esc(c.name)} <span class="wt-chip" style="--h:${HUE[c.kind] ?? 220}">${esc(c.kind)}</span></h3><p>${esc(c.summary)}</p>
          <p class="wt-dim">Typical service time ${esc(sim.serviceTimeMs?.join('–'))} ms · ${sim.concurrency == null ? 'effectively unlimited' : fmt(sim.concurrency) + ' concurrent'} · ${(sim.failureRate * 100).toFixed(sim.failureRate < 0.001 ? 2 : 1)}% failures</p>
          ${(c.sections || []).map(s => `<section class="wt-sec"><h4>${esc(s.heading)}</h4>${md(s.body || '')}</section>`).join('')}
          ${c.alternatives?.length ? `<section class="wt-sec"><h4>Alternatives and what they cost</h4><ul class="wt-alts">${c.alternatives.map(alt).join('')}</ul></section>` : ''}
          ${c.prebuild?.bottlenecks?.length ? `<section class="wt-sec"><h4>Where it breaks</h4>${c.prebuild.bottlenecks.map(bn).join('')}</section>` : ''}</article></div>`;
    }

    const run = () => S.simulate({ path: path(), components: comps(), qps: st.qps, overrides: overrides() });
    function stressPane() {
      const res = run(), base = S.saturationQps({ path: path(), components: comps() }), cur = S.saturationQps({ path: path(), components: comps(), overrides: overrides() });
      const name = id => comps()[id]?.name || id, swapped = Object.keys(st.swaps).length;
      const where = id => id ? `<strong>${esc(name(id))}</strong> saturates first` : 'nothing saturates';
      const limit = r => r.id ? `${where(r.id)} at about ${fmt(r.qps)} requests/s` : 'no component has a hard ceiling here';
      const rows = res.stages.map(s => `<tr class="wt-s-${s.status}${s.id === res.bottleneck ? ' is-worst' : ''}"><td>${esc(name(s.id))}${st.swaps[s.id] ? ` <span class="wt-dim">→ ${esc(comps()[s.id].alternatives.find(a => a.id === st.swaps[s.id])?.name)}</span>` : ''}</td>
        <td>${s.unlimited ? '—' : fmt(s.capacity) + '/s'}</td><td>${fmt(s.lambda)}/s</td>
        <td>${s.unlimited ? '—' : `<span class="wt-bar"><i style="width:${Math.min(100, s.util * 100)}%"></i></span> ${Math.round(Math.min(s.util, 9.99) * 100)}%`}</td><td>${ms(s.p50)}</td><td>${ms(s.p99)}</td></tr>`).join('');
      const swappable = res.stages.filter(s => comps()[s.id].alternatives?.length);
      return `<div class="wt-controls"><select data-act="flow" aria-label="Flow">${d.operations.map((o, i) => `<option value="${i}" ${i === st.flow ? 'selected' : ''}>${esc(o.title)}</option>`).join('')}</select>
          <label class="wt-qps"><span>Load <b data-out="qps">${fmt(st.qps)}</b> requests/s</span><input type="range" data-act="qps" min="1" max="7" step="0.02" value="${Math.log10(st.qps).toFixed(2)}" aria-label="Requests per second"></label></div>
        <div class="wt-summary"><div><span class="wt-label">Typical latency</span><b>${ms(res.p50)}</b></div><div><span class="wt-label">Slow requests (p99)</span><b>${ms(res.p99)}</b></div>
          <div><span class="wt-label">Requests that succeed</span><b>${(res.successRate * 100).toFixed(res.successRate > 0.995 ? 1 : 0)}%</b></div>
          <div class="wt-verdict ${res.bottleneck ? 'is-bad' : 'is-ok'}">${res.bottleneck ? `At this load, <strong>${esc(name(res.bottleneck))}</strong> is the bottleneck.` : 'Nothing is under strain at this load.'}</div></div>
        <div class="wt-scroll"><table class="wt-table"><thead><tr><th>Component</th><th>Capacity</th><th>Load</th><th>Utilisation</th><th>Typical</th><th>p99</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="wt-ceiling">Breaking point: ${limit(cur)}${swapped ? ` <span class="wt-dim">(was ${limit(base).replace(/<[^>]+>/g, '')})</span>` : ''}.</p>
        ${swappable.length ? `<section class="wt-swaps"><h4>Swap a component</h4><p class="wt-dim">Replace one with a documented alternative and watch the ceiling move.</p>
          <div class="wt-swap-grid">${swappable.map(s => `<label><span>${esc(name(s.id))}</span><select data-act="swap" data-id="${esc(s.id)}"><option value="">Keep ${esc(name(s.id))}</option>${comps()[s.id].alternatives.map(a => `<option value="${esc(a.id)}" ${st.swaps[s.id] === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>`).join('')}</div>
          ${swapped ? '<button type="button" class="button" data-act="reset-swaps">Undo all swaps</button>' : ''}</section>` : ''}
        <p class="wt-dim wt-caveat">A queueing approximation from each component's typical service time and concurrency. It shows which part gives out first, not exact numbers.</p>`;
    }

    function briefPane() {
      const list = (t, a) => a?.length ? `<section class="wt-sec"><h4>${esc(t)}</h4><ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '';
      return `<div class="wt-brief"><section class="wt-sec"><h4>The problem</h4><p>${esc(d.problem)}</p><p>${esc(d.summary)}</p></section>
        ${list('Functional requirements', d.requirements?.functional)}${list('Non-functional requirements', d.requirements?.nonFunctional)}
        ${list('Assumptions', d.capacity?.assumptions)}${list('Back-of-envelope estimates', d.capacity?.estimates)}
        ${d.tradeoffs?.length ? `<section class="wt-sec"><h4>Decisions and trade-offs</h4>${d.tradeoffs.map(t => `<div class="wt-trade"><strong>${esc(t.decision)}</strong><span class="wt-chip">${esc(t.chosen)}</span><p>${esc(t.rationale)}</p></div>`).join('')}</section>` : ''}
        ${list('Follow-up questions to expect', (d.interviewFollowUps || []).map(f => f.question))}</div>`;
    }

    function paintPane() {
      const pane = el.querySelector('[data-pane]');
      const keep = pane.scrollTop;
      pane.innerHTML = { flow: flowPane, parts: partsPane, stress: stressPane, brief: briefPane }[st.tab]();
      pane.scrollTop = keep;
      el.querySelectorAll('[data-tab]').forEach(b => { const on = b.dataset.tab === st.tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
      paintDiagram();
    }

    // ---------- events ----------
    const go = n => { st.step = Math.max(0, Math.min(steps().length - 1, n)); paintPane(); };
    function play() {
      if (timer) { stop(); paintPane(); return; }
      if (st.step >= steps().length - 1) st.step = 0;
      timer = setInterval(() => { if (st.step >= steps().length - 1) { stop(); paintPane(); } else go(st.step + 1); }, 2200);
      paintPane();
    }
    on('click', e => {
      const t = e.target.closest('[data-tab],[data-act],.wt-node');
      if (!t || !d) return;
      onTouch();
      if (t.dataset.tab) { stop(); st.tab = t.dataset.tab; return paintPane(); }
      if (t.classList.contains('wt-node')) { stop(); st.sel = t.dataset.id; st.tab = 'parts'; return paintPane(); }
      const a = t.dataset.act;
      if (a === 'first') { stop(); go(0); } else if (a === 'prev') { stop(); go(st.step - 1); } else if (a === 'next') { stop(); go(st.step + 1); }
      else if (a === 'play') play();
      else if (a === 'part') { st.sel = t.dataset.id; paintPane(); }
      else if (a === 'reset-swaps') { st.swaps = {}; paintPane(); }
    });
    on('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('wt-node')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    on('input', e => {
      const t = e.target;
      if (!d || !t.dataset.act) return;
      onTouch();
      if (t.dataset.act === 'seek') { stop(); go(Number(t.value)); }
      else if (t.dataset.act === 'qps') { st.qps = Math.round(10 ** Number(t.value)); paintPane(); }
    });
    on('change', e => {
      const t = e.target;
      if (!d || !t.dataset.act) return;
      onTouch();
      if (t.dataset.act === 'flow') { stop(); st.flow = Number(t.value); st.step = 0; paintPane(); }
      else if (t.dataset.act === 'swap') { if (t.value) st.swaps[t.dataset.id] = t.value; else delete st.swaps[t.dataset.id]; paintPane(); }
    });

    loadDesign(id).then(data => {
      if (dead) return;
      d = data;
      // Start where it gets interesting: most of the way to the first component that gives out.
      const sat = S.saturationQps({ path: path(), components: comps() });
      if (isFinite(sat.qps)) { const q = 0.6 * sat.qps, mag = 10 ** Math.floor(Math.log10(q)); st.qps = Math.max(10, Math.round(q / mag) * mag); }
      const L = S.layout(S.parseMermaid(d.architecture.mermaid));
      el.innerHTML = `${back ? `<div class="wt-top"><button type="button" class="button wt-back" data-back>← All simulators</button></div>` : ''}
        <header class="wt-head"><h2>${esc(d.title)}</h2><span class="wt-pill wt-${esc(d.difficulty)}">${esc(d.difficulty)}</span></header>
        <div class="wt-diagram">${diagramSvg(L)}</div>
        <div class="wt-tabs" role="tablist">${TABS.map(([k, label]) => `<button type="button" role="tab" class="wt-tab" data-tab="${k}">${label}</button>`).join('')}</div>
        <div class="wt-pane" data-pane></div>`;
      if (back) el.querySelector('[data-back]').addEventListener('click', back);
      paintPane();
    }).catch(err => { if (!dead) el.innerHTML = `<p class="wt-note">Could not load this design (${esc(err.message)}).</p>`; });
    return { destroy() { dead = true; stop(); offs.forEach(f => f()); } };
  }

  // ---------- lesson simulator ----------
  if (window.SDSims) window.SDSims.register('walkthrough', (el, cfg, api) => {
    let touched = false;
    return mount(el, { design: cfg.design, onTouch: () => { if (!touched) { touched = true; api.touched(); api.metrics({ touched: 1 }); } } });
  });

  window.SDWalkthrough = { mount };
})();
