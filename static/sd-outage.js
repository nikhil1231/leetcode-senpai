// Outage cases: watch a system break, then fix it. A case (static/simulators/outages.json, built by
// scripts/build_outages.py) is a starting design, a scenario and the story: real (a published
// postmortem), what-if (a company's upgrade write-up, run without the upgrade) or composite. watch()
// guesses which part gives way first, then plays the simulated day on a small diagram with captions and
// shows the record; fix() opens the design builder on the same design and incidents and checks the run.
// Lessons open with one (the ```outage block); the rest are the incident archive in Ripple Ops.
// The day is SDSim's (or AISim's), so the hours and numbers are the model's, not the incident's.
(function () {
  'use strict';
  const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const inline = t => window.SDBlocks?.inline ? window.SDBlocks.inline(t) : esc(t);
  const W = 136, H = 62, PAD = 24, SPEED = 950;
  const hh = h => String(h).padStart(2, '0') + ':00';
  const pct = (v, d = 1) => `${(v * 100).toFixed(v > 0.999 && v < 1 ? 2 : d)}%`;
  const KIND = { real: ['Real outage', 'is-real'], 'what-if': ['What if', 'is-whatif'], composite: ['Composite', 'is-composite'] };
  let cache = null;

  const lib = async () => { await window.SDBuilder.load(); return window.SDBuilder.data(); };
  async function cases() {
    if (!cache) cache = fetch('/simulators/outages.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(d => d.cases);
    return cache;
  }
  const isAi = c => !!c.scenario.ai;
  const run = (c, g, econ) => window.SDSim.run(c.scenario, g, econ);
  function windowOf(c) {
    const ats = [...c.scenario.events.flatMap(e => [e.at, e.at + Math.max(1, e.dur || 1) - 1]), ...(c.beats || []).map(b => b.at)];
    if (!ats.length) return [0, 23];
    return [Math.max(0, Math.min(...ats) - 2), Math.min(23, Math.max(...ats) + 2)];
  }
  const labelOf = (c, g, id, defs) => g.labels?.[id] || defs.find(d => d.id === g.nodes.find(n => n.id === id)?.defId)?.label || id;
  const iconOf = (g, id, defs) => defs.find(d => d.id === g.nodes.find(n => n.id === id)?.defId)?.icon || '▫️';

  // ---------- the diagram ----------
  function edgePath(a, b) {
    const ax = a.x + W / 2, ay = a.y + H / 2, bx = b.x + W / 2, by = b.y + H / 2;
    const horiz = Math.abs(bx - ax) >= Math.abs(by - ay);
    const [x1, y1] = horiz ? [ax + Math.sign(bx - ax) * W / 2, ay] : [ax, ay + Math.sign(by - ay) * H / 2];
    const [x2, y2] = horiz ? [bx - Math.sign(bx - ax) * W / 2, by] : [bx, by - Math.sign(by - ay) * H / 2];
    return horiz ? `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
  }
  function diagram(c, g, defs, tick, opts = {}) {
    const xs = g.nodes.map(n => n.x), ys = g.nodes.map(n => n.y);
    const x0 = Math.min(...xs) - PAD, y0 = Math.min(...ys) - PAD, w = Math.max(...xs) + W + PAD - x0, h = Math.max(...ys) + H + PAD - y0;
    const by = Object.fromEntries(g.nodes.map(n => [n.id, n]));
    const edges = g.edges.map(e => {
      const a = by[e.from], b = by[e.to]; if (!a || !b) return '';
      const st = tick?.nodes?.[e.to], live = st && st.load > 0.01 && tick.nodes[e.from]?.status !== 'down';
      const bad = st && (st.status === 'saturated' || st.status === 'down');
      const sw = live ? Math.min(6, 1.4 + Math.log10(1 + st.load) * 0.9) : 1.4;
      return `<path class="oc-edge${live ? ' is-live' : ''}${bad ? ' is-bad' : ''}" d="${edgePath(a, b)}" style="stroke-width:${sw.toFixed(1)}px" marker-end="url(#oc-arrow)"/>`;
    }).join('');
    const nodes = g.nodes.map(n => {
      const st = tick?.nodes?.[n.id], picked = opts.guess === n.id, culprit = opts.reveal && c.culprit === n.id;
      const status = st ? (st.status === 'ok' && (st.err || 0) >= 0.05 ? 'saturated' : st.status) : 'idle';
      const read = !st || n.defId === 'client' ? '' : st.status === 'down' ? 'DOWN' : (st.err || 0) >= 0.05 && st.util < 1 ? `${Math.round(st.err * 100)}% err` : st.util < 0.01 ? '<1%' : `${Math.round(st.util * 100)}%`;
      const pickable = opts.pick && n.defId !== 'client';
      const label = labelOf(c, g, n.id, defs);
      return `<g class="oc-node is-${esc(status)}${picked ? ' is-picked' : ''}${culprit ? ' is-culprit' : ''}${pickable ? ' is-pickable' : ''}" transform="translate(${n.x} ${n.y})"${pickable ? ` data-pick="${esc(n.id)}" role="button" tabindex="0" aria-label="${esc(label)}"` : ''}>
        <rect width="${W}" height="${H}" rx="10"/><text class="oc-icon" x="12" y="26">${esc(iconOf(g, n.id, defs))}</text>
        <text class="oc-label" x="36" y="25">${esc(label.length > 17 ? label.slice(0, 16) + '…' : label)}</text>
        ${read ? `<text class="oc-util" x="36" y="47">${esc(read)}</text>` : ''}<title>${esc(label)}</title></g>`;
    }).join('');
    return `<svg class="oc-svg" viewBox="${x0} ${y0} ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="The system: ${esc(g.nodes.map(n => labelOf(c, g, n.id, defs)).join(', '))}">
      <defs><marker id="oc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z"/></marker></defs>${edges}${nodes}</svg>`;
  }

  // ---------- the record ----------
  function story(c) {
    const src = (c.sources || []).map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join('');
    const what = c.kind === 'real' ? 'What happened' : c.kind === 'what-if' ? 'What the write-up says' : 'The pattern';
    return `<div class="oc-record"><h5>${what}</h5><p>${inline(c.happened)}</p>${src ? `<ul class="oc-sources">${src}</ul>` : ''}
      <p class="oc-fine">${c.kind === 'what-if' ? 'This outage did not happen: the company changed its design first. ' : ''}The simulated day replays the mechanism. Its hours, traffic and percentages are the simulator's, not the incident's.</p>
      <p class="oc-take"><b>The lesson:</b> ${inline(c.takeaway)}</p></div>`;
  }
  function summary(c, res) {
    const s = res.summary, ev = res.events, worst = Math.min(...res.ticks.map(t => t.ok));
    const bits = [];
    if (isAi(c)) {
      const q = s.objectives.find(o => o.id === 'quality'), harm = s.objectives.find(o => o.id === 'safety');
      bits.push(`${q.actual} of questions answered correctly (target ${q.target.replace('≥ ', '')})`);
      if (s.availability < 99.9) bits.push(`${s.availability.toFixed(1)}% answered at all`);
      if (harm && !harm.pass) bits.push(`${harm.actual} harmful actions taken`);
    } else {
      bits.push(`${worst < 0.995 ? `${pct(1 - worst, 0)} of requests failed in the worst hour` : 'no hour lost more than half a percent of requests'}`);
      bits.push(`${s.availability.toFixed(2)}% available over the day`);
      if (s.lost >= 1) bits.push(`${Math.round(s.lost).toLocaleString('en')} acknowledged writes lost`);
      const lag = s.objectives.find(o => o.id === 'lag');
      if (lag && !lag.pass) bits.push(`background work ${lag.actual === 'never finishes' ? 'stopped for good' : lag.actual + ' behind'}`);
    }
    const fail = id => s.objectives.some(o => o.id === id && !o.pass);
    const head = fail('safety') ? 'Harm done.' : fail('quality') && s.availability >= 99 ? 'Wrong answers.' : fail('loss') && s.availability >= 99 ? 'Data lost.'
      : fail('lag') && s.availability >= 99 ? 'Stuck.' : ev.some(e => e.outcome === 'outage') || s.availability < 99 ? 'Outage.' : 'Degraded.';
    return `<p class="oc-sum"><b>${head}</b> ${esc(bits.join('; '))}.</p>`;
  }

  // ---------- watch ----------
  // opts: {state, onGuess(nodeId, correct), onDone(), save(state)}
  function watch(el, c, opts = {}) {
    let st = { guess: null, played: false, ...(opts.state || {}) }, res = null, defs = [], econ = null, h = 0, timer = null, dead = false;
    const [from, to] = windowOf(c);
    const tag = KIND[c.kind] || KIND.composite;
    el.classList.add('oc');
    el.innerHTML = '<p class="sd-muted">Loading the simulator…</p>';
    const pickable = () => !!c.culprit && !st.guess && !st.played && !timer;
    function paint() {
      if (dead) return;
      const t = res && (timer || st.played) ? res.ticks[h] : null;
      const beat = t ? [...(c.beats || [])].filter(b => b.at <= h).pop() : null;
      const now = t ? c.scenario.events.filter(e => h >= e.at && h < e.at + Math.max(1, e.dur || 1)) : [];
      const reveal = st.played && !timer;
      const culpritLabel = c.culprit ? labelOf(c, c.start, c.culprit, defs) : '';
      const q = isAi(c) && t ? `<span>${pct(t.quality ?? 1, 0)} right</span>` : '';
      el.innerHTML = `<div class="oc-head"><span class="oc-tag ${tag[1]}">${tag[0]}</span><span class="oc-when">${esc([c.company, c.when].filter(Boolean).join(' · '))}</span></div>
        <p class="oc-kicker">${inline(c.kicker)}</p><p class="oc-setup">${inline(c.setup)}</p>
        <div class="oc-stage">${diagram(c, c.start, defs, t, { pick: pickable(), guess: st.guess, reveal })}</div>
        ${!st.played && !timer ? (c.culprit ? `<div class="oc-ask"><p><b>Before it runs:</b> which part gives way first? Tap it.</p>
            <div class="oc-chips">${c.start.nodes.filter(n => n.defId !== 'client').map(n => `<button type="button" class="sd-option oc-chip" data-pick="${esc(n.id)}">${esc(iconOf(c.start, n.id, defs))} ${esc(labelOf(c, c.start, n.id, defs))}</button>`).join('')}</div>
            <button type="button" class="button" data-oc="play">Skip the guess: just play it</button></div>`
          : `<div class="oc-ask"><button type="button" class="button is-primary" data-oc="play">▶ Watch it happen</button></div>`) : ''}
        ${t ? `<div class="oc-bar"><button type="button" class="button" data-oc="${timer ? 'pause' : 'play'}" aria-label="${timer ? 'Pause' : 'Play'}">${timer ? '⏸' : '▶'}</button>
            <input type="range" min="${from}" max="${to}" step="1" value="${h}" data-oc-hour aria-label="Hour of the simulated day">
            <div class="oc-read"><b>${hh(h)}</b><span class="${t.ok < 0.99 ? 'is-bad' : ''}">${pct(t.ok)} ok</span>${q}${t.retryMult > 1.05 ? `<span class="is-bad">retries ×${t.retryMult.toFixed(1)}</span>` : ''}${queueRead(t)}</div></div>
          <div class="oc-ok" aria-hidden="true">${res.ticks.slice(from, to + 1).map((x, i) => `<i class="${from + i === h ? 'is-now ' : ''}${x.ok < 0.95 || (x.quality ?? 1) < 0.7 ? 'is-bad' : x.ok < 0.999 ? 'is-warn' : ''}" style="height:${Math.max(6, (1 - x.ok) * 100, isAi(c) ? (1 - (x.quality ?? 1)) * 100 : 0)}%"></i>`).join('')}</div>
          <div class="oc-cap" aria-live="polite">${now.map(e => `<span class="bd-chip">⚡ ${esc(e.label || window.SDSim.EVENT_LABEL[e.type] || e.type)}</span>`).join('')}${beat ? `<p>${inline(beat.text)}</p>` : '<p class="sd-muted">A normal day so far.</p>'}</div>` : ''}
        ${reveal ? `${c.culprit ? `<p class="oc-verdict">${verdict(culpritLabel)}</p>` : ''}${summary(c, res)}${story(c)}
          ${opts.lesson ? `<p class="oc-next">This lesson is how you stop it. At the end you get the same system and the same day, and fix it.</p>` : ''}
          <div class="sd-actions"><button type="button" class="button" data-oc="again">Watch it again</button></div>` : ''}`;
    }
    // A wrong guess that broke too was not a bad guess: say what it did, and what went first.
    function verdict(culpritLabel) {
      const first = `${esc(culpritLabel)} gave way first`;
      if (!st.guess) return `${first}.`;
      if (st.guess === c.culprit) return `<b class="sd-ok">You called it.</b> ${first}.`;
      const e = c.scenario.events[0], hours = res.ticks.filter(t => t.h >= e.at && t.h < e.at + Math.max(1, e.dur || 1));
      const hurt = hours.some(t => ['saturated', 'down'].includes(t.nodes[st.guess]?.status));
      return hurt ? `<b class="sd-ok">Close.</b> ${esc(labelOf(c, c.start, st.guess, defs))} went under too, but ${first}; the rest followed from it.`
        : `<b class="sd-bad">Not that one.</b> ${esc(labelOf(c, c.start, st.guess, defs))} held up. ${first}.`;
    }
    function queueRead(t) {
      const q = Object.values(t.queues || {}).find(x => x.stalled || x.backlog > 1);
      return q ? `<span class="is-bad">${q.stalled ? 'queue stalled' : 'backlog'} · ${Number.isFinite(q.lagMin) ? Math.round(q.lagMin) + ' min behind' : 'not draining'}</span>` : '';
    }
    function stop() { clearInterval(timer); timer = null; }
    function play() {
      stop();
      if (h >= to || !st.played) h = from;
      timer = setInterval(() => { if (dead) return stop(); if (h >= to) { stop(); finish(); return; } h++; paint(); }, opts.speedMs || SPEED);
      paint();
    }
    function finish() {
      const first = !st.played;
      st.played = true; h = to; stop(); paint();
      opts.save?.({ ...st });
      if (first) opts.onDone?.(st);
    }
    function pick(id) {
      if (!pickable()) return;
      st.guess = id; opts.save?.({ ...st });
      opts.onGuess?.(id, id === c.culprit);
      play();
    }
    const onClick = ev => {
      const p = ev.target.closest('[data-pick]'), a = ev.target.closest('[data-oc]')?.dataset.oc;
      if (p) pick(p.dataset.pick);
      else if (a === 'play') { if (!st.played && !st.guess && c.culprit) opts.onGuess?.(null, null); play(); }
      else if (a === 'pause') { stop(); paint(); }
      else if (a === 'again') { h = from; play(); }
    };
    const onKey = ev => { const p = ev.target.closest('g[data-pick]'); if (p && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); pick(p.dataset.pick); } };
    const onInput = ev => { if (ev.target.matches('[data-oc-hour]')) { stop(); h = +ev.target.value; paint(); } };
    el.addEventListener('click', onClick); el.addEventListener('keydown', onKey); el.addEventListener('input', onInput);
    const ready = lib().then(d => {
      if (dead) return;
      defs = d.data.components; econ = d.econ; res = run(c, c.start, econ);
      if (st.played) h = to;
      paint();
    }).catch(e => { if (!dead) el.innerHTML = `<p class="sd-error">The simulator did not load (${esc(e.message)}).</p>`; });
    return {
      ready,
      restore(s) { st = { ...st, ...s }; return ready.then(() => { if (st.played || st.guess) { st.played = true; h = to; } paint(); }); },
      destroy() { dead = true; stop(); el.removeEventListener('click', onClick); el.removeEventListener('keydown', onKey); el.removeEventListener('input', onInput); },
      _state: () => ({ ...st, h, playing: !!timer }),
    };
  }

  // ---------- fix ----------
  function targets(c) {
    const s = c.scenario.slo || {}, out = [];
    if (isAi(c)) {
      if (s.quality) out.push(`${s.quality}% of questions answered correctly`);
      if (s.availability) out.push(`${s.availability}% answered without an error`);
      if (s.safety != null) out.push('no harmful actions');
    } else {
      out.push(`${s.availability ?? 99.9}% available over the day`);
      if (s.noLoss) out.push('no acknowledged writes lost');
      if (s.lagMin != null) out.push(`background work no more than ${s.lagMin} minutes behind`);
    }
    if (s.budget) out.push(`at most $${s.budget.toLocaleString('en')} a month`);
    return out;
  }
  // opts: {state, onPass(res), save(state)}
  function fix(el, c, opts = {}) {
    let st = { hints: 0, fixed: false, ...(opts.state || {}) }, builder = null, last = null, dead = false, open = false;
    const key = `outage-fix-${c.id}`;
    el.classList.add('oc-fix');
    function paint() {
      if (dead) return;
      const f = c.fix;
      el.querySelector('[data-oc-top]').innerHTML = `<p class="oc-kicker">${inline(f.prompt)}</p>
        <p class="oc-goal"><b>Pass when:</b> ${esc(targets(c).join(' · '))}. Same traffic, same incidents: ${esc(c.scenario.events.map(e => `${e.label || e.type} at ${hh(e.at)}`).join('; '))}.</p>
        ${st.fixed ? '<p class="oc-verdict"><b class="sd-ok">Fixed.</b> Your design gets through the day.</p>' : ''}
        ${st.hints ? `<ol class="oc-hints">${f.hints.slice(0, st.hints).map(x => `<li>${inline(x)}</li>`).join('')}</ol>` : ''}
        <div class="sd-actions">${open ? '' : `<button type="button" class="button is-primary" data-oc="open">${st.fixed ? 'Open your design' : 'Open the simulator'}</button>`}
          ${st.hints < f.hints.length ? `<button type="button" class="button" data-oc="hint">${st.hints ? 'Another hint' : 'A hint'}</button>` : ''}
          ${open ? '<button type="button" class="button" data-oc="solution">Show one fix</button>' : ''}</div>`;
      el.querySelector('[data-oc-result]').innerHTML = last ? result(last) : '';
    }
    function result(res) {
      const s = res.summary, pass = s.stars >= 2;
      return `<div class="oc-result ${pass ? 'is-pass' : 'is-fail'}"><p><b class="${pass ? 'sd-ok' : 'sd-bad'}">${pass ? 'It holds.' : 'Not yet.'}</b> ${pass ? esc(c.takeaway) : 'What still fails is below.'}</p>
        ${window.SDBuilder.reportHtml(res, { labelOf: id => builder?.labelOf(id) || id, maxFindings: 4, headlines: ['It went down', 'It limped through', 'Every target met', 'Every target met, with money to spare'] })}</div>`;
    }
    function readDraft() { try { const v = JSON.parse(localStorage.getItem(key)); return v && Array.isArray(v.nodes) && v.nodes.length ? v : null; } catch { return null; } }
    async function mountBuilder() {
      open = true; paint();
      const stage = el.querySelector('[data-oc-stage]');
      stage.hidden = false;
      const draft = readDraft();
      builder = window.SDBuilder.mount(stage, { mode: 'game', scenario: c.scenario, storageKey: key, initial: draft ? { nodes: draft.nodes, edges: draft.edges, settings: draft.settings } : c.start,
        onRun(res, g, info) {
          if (info?.whatif) return;
          last = res;
          if (res.summary.stars >= 2 && !st.fixed) { st.fixed = true; opts.save?.({ ...st }); opts.onPass?.(res); }
          paint();
        } });
      await builder.ready;
    }
    const onClick = ev => {
      const a = ev.target.closest('[data-oc]')?.dataset.oc;
      if (a === 'open') mountBuilder();
      else if (a === 'hint') { st.hints = Math.min(c.fix.hints.length, st.hints + 1); opts.save?.({ ...st }); paint(); }
      else if (a === 'solution' && builder) {
        if (window.confirm('Load one design that passes? Yours stays one Undo away.')) builder.setGraph({ nodes: c.fix.solution.nodes, edges: c.fix.solution.edges, settings: c.fix.solution.settings });
      }
    };
    el.addEventListener('click', onClick);
    el.innerHTML = '<div data-oc-top></div><div class="oc-builder" data-oc-stage hidden></div><div data-oc-result></div>';
    paint();
    return {
      restore(s) { st = { ...st, ...s }; paint(); },
      destroy() { dead = true; builder?.destroy(); el.removeEventListener('click', onClick); },
      _builder: () => builder,
    };
  }

  // ---------- a whole case on its own (the archive) ----------
  function page(el, c, opts = {}) {
    el.innerHTML = `<section class="sd-block sd-block-outage"><header class="sd-block-head"><span class="sd-kicker">Watch it break</span><h4>${inline(c.title)}</h4></header><div data-oc-watch></div></section>
      ${c.fix ? `<section class="sd-block sd-block-outage-fix"><header class="sd-block-head"><span class="sd-kicker">Now fix it</span><h4>${inline(c.title)}</h4></header><div data-oc-fix></div></section>` : ''}`;
    const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };
    const w = watch(el.querySelector('[data-oc-watch]'), c, { state: read(`outage-watch-${c.id}`), save: s => write(`outage-watch-${c.id}`, s), speedMs: opts.speedMs });
    const f = c.fix ? fix(el.querySelector('[data-oc-fix]'), c, { state: read(`outage-fixst-${c.id}`), save: s => write(`outage-fixst-${c.id}`, s), onPass: opts.onPass }) : null;
    return { destroy() { w.destroy(); f?.destroy(); } };
  }

  window.SDOutage = { cases, watch, fix, page, diagram, windowOf, targets, KIND };
})();
