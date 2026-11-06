// Design builder: the old System Design Simulator's main sandbox. Drag components onto a canvas, connect
// them, set a scale, and get capacity estimates plus a few sanity checks on what you drew. Components and
// presets come from /simulators/builder.json; the maths is in sd-builder-calc.js (pure). The drawing is
// kept in this browser's localStorage so it survives a reload; nothing goes to the server.
(function () {
  'use strict';
  const Calc = window.SDBuilderCalc;
  const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const KEY = 'sd-builder-v1', W = 136, H = 62, CANVAS_W = 1500, CANVAS_H = 800;
  let data = null;
  const loadData = async () => {
    if (data) return data;
    const r = await fetch('/simulators/builder.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (data = await r.json());
  };
  const fresh = () => ({ nodes: [], edges: [], scale: { dau: '', readQps: '', writeQps: '', storageGb: '' },
    nfr: { latencyMs: '100', availability: '99.9%', consistency: 'Eventual' }, req: '' });
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && Array.isArray(v.nodes) ? { ...fresh(), ...v } : fresh(); } catch { return fresh(); } };
  const write = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window: fine */ } };
  const num = v => Calc.num(v);
  const fmt = n => !isFinite(n) ? '0' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 100 ? Math.round(n).toLocaleString('en') : n >= 1 ? n.toFixed(n < 10 ? 1 : 0) : n.toFixed(2);

  const anchors = n => ({ top: [n.x + W / 2, n.y], right: [n.x + W, n.y + H / 2], bottom: [n.x + W / 2, n.y + H], left: [n.x, n.y + H / 2] });
  function edgePath(a, b) {                                   // nearest pair of sides, joined by a gentle curve
    let best = null;
    for (const [sa, pa] of Object.entries(anchors(a))) for (const [sb, pb] of Object.entries(anchors(b))) {
      const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
      if (!best || d < best.d) best = { d, pa, pb, sa };
    }
    const [x1, y1] = best.pa, [x2, y2] = best.pb;
    return Math.abs(x2 - x1) >= Math.abs(y2 - y1)
      ? `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
  }

  function mount(el) {
    let defs = null, S = read(), sel = null, undo = [], drag = null, link = null, dead = false, saveTimer = null;
    const def = id => defs.find(d => d.id === id) || { label: id, icon: '▫️', border: '#444c56' };
    const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => write(S), 150); };
    const snapshot = () => { undo.push(JSON.stringify({ nodes: S.nodes, edges: S.edges })); if (undo.length > 40) undo.shift(); };
    const touch = () => { save(); paintCanvas(); paintPanel(); };
    const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const nodeById = id => S.nodes.find(n => n.id === id);

    el.classList.add('bd');
    el.innerHTML = '<p class="bd-note">Loading the builder…</p>';

    function shell() {
      el.innerHTML = `<div class="bd-bar">
          <select data-preset aria-label="Load a sample architecture"><option value="">Load a sample…</option>${data.presets.map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('')}</select>
          <button type="button" class="button" data-act="undo">Undo</button><button type="button" class="button" data-act="clear">Clear</button>
          <button type="button" class="button" data-act="mermaid">Copy as Mermaid</button><span class="bd-status" data-status aria-live="polite"></span></div>
        <div class="bd-grid">
          <aside class="bd-palette" aria-label="Components"><input type="search" class="input" placeholder="Filter components" data-filter aria-label="Filter components"><div class="bd-items" data-items></div></aside>
          <div class="bd-stage" data-stage tabindex="0" aria-label="Design canvas. Select a component and press Delete to remove it."><div class="bd-canvas" data-canvas style="width:${CANVAS_W}px;height:${CANVAS_H}px">
            <svg class="bd-edges" width="${CANVAS_W}" height="${CANVAS_H}"><defs><marker id="bd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z"/></marker></defs><g data-edges></g><path class="bd-preview" data-preview d="" marker-end="url(#bd-arrow)"/></svg>
            <div data-nodes></div><div class="bd-empty" data-empty><span>🏗️</span><strong>Build your design</strong><p>Drag a component in, or load a sample. Hover a node and drag from a dot to connect it.</p></div></div></div>
          <aside class="bd-panel" data-panel></aside></div>`;
      paintItems('');
    }
    function paintItems(q) {
      const t = q.trim().toLowerCase();
      el.querySelector('[data-items]').innerHTML = defs.filter(d => !t || `${d.label} ${d.description}`.toLowerCase().includes(t)).map(d =>
        `<button type="button" class="bd-item" draggable="true" data-def="${esc(d.id)}" title="${esc(d.whenToUse)}" style="--b:${esc(d.border)}"><span>${d.icon}</span>${esc(d.label)}</button>`).join('') || '<p class="bd-note">No match.</p>';
    }

    function paintCanvas() {
      const nodes = el.querySelector('[data-nodes]');
      nodes.innerHTML = S.nodes.map(n => { const d = def(n.defId), on = sel?.kind === 'node' && sel.id === n.id;
        return `<div class="bd-node${on ? ' is-sel' : ''}" data-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px;width:${W}px;height:${H}px;--b:${esc(d.border)}">
          ${['top', 'right', 'bottom', 'left'].map(s => `<i class="bd-h bd-h-${s}" data-handle="${s}"></i>`).join('')}<span class="bd-icon">${d.icon}</span><span class="bd-label">${esc(d.label)}</span></div>`; }).join('');
      el.querySelector('[data-edges]').innerHTML = S.edges.map(e => { const a = nodeById(e.from), b = nodeById(e.to); if (!a || !b) return '';
        const on = sel?.kind === 'edge' && sel.id === e.id, d = edgePath(a, b);
        return `<g class="bd-edge${on ? ' is-sel' : ''}" data-edge="${esc(e.id)}"><path class="bd-hit" d="${d}"/><path class="bd-line" d="${d}" marker-end="url(#bd-arrow)"/></g>`; }).join('');
      el.querySelector('[data-empty]').hidden = S.nodes.length > 0;
    }

    function paintPanel() {
      const e = Calc.estimate(S.scale), found = Calc.checks({ nodes: S.nodes, edges: S.edges }, S.scale, S.nfr);
      const d = sel?.kind === 'node' && nodeById(sel.id) ? def(nodeById(sel.id).defId) : null;
      const field = (k, label, ph) => `<label><span>${label}</span><input type="text" inputmode="decimal" data-scale="${k}" value="${esc(S.scale[k])}" placeholder="${ph}"></label>`;
      const row = (a, b) => `<div class="bd-row"><span>${a}</span><b>${b}</b></div>`;
      el.querySelector('[data-panel]').innerHTML = `
        ${d ? `<section class="bd-box"><h4>${d.icon} ${esc(d.label)}</h4><p>${esc(d.description)}</p><p class="bd-when"><strong>Add it when</strong> ${esc(d.whenToUse)}</p><p class="bd-scale"><strong>At scale</strong> ${esc(d.scaleNote)}</p>
          <button type="button" class="button" data-act="delete">Remove from diagram</button></section>`
        : sel?.kind === 'edge' ? '<section class="bd-box"><h4>Connection</h4><p>Select it and press Delete, or:</p><button type="button" class="button" data-act="delete">Remove connection</button></section>'
        : `<section class="bd-box"><h4>How to use</h4><ol class="bd-how"><li>Load a sample, or drag components onto the canvas.</li><li>Hover a node and drag from a dot to another node to connect them.</li><li>Click a node to see what it does and when to add it.</li><li>Set the scale below and read the estimates and checks.</li></ol></section>`}
        <section class="bd-box"><h4>Requirements</h4><textarea rows="3" data-req placeholder="e.g. Users can post, follow, view a feed…">${esc(S.req)}</textarea></section>
        <section class="bd-box"><h4>Scale</h4><div class="bd-fields">${field('dau', 'Daily users', 'e.g. 1000000')}${field('readQps', 'Read QPS', 'auto')}${field('writeQps', 'Write QPS', 'auto')}${field('storageGb', 'Storage (GB)', 'e.g. 500')}</div>
          <div class="bd-fields"><label><span>Latency (ms)</span><input type="text" inputmode="numeric" data-nfr="latencyMs" value="${esc(S.nfr.latencyMs)}"></label>
          <label><span>Availability</span><select data-nfr="availability">${['99%', '99.9%', '99.99%', '99.999%'].map(o => `<option ${o === S.nfr.availability ? 'selected' : ''}>${o}</option>`).join('')}</select></label></div>
          <label class="bd-wide"><span>Consistency</span><select data-nfr="consistency">${['Eventual', 'Strong', 'Read-your-writes', 'Monotonic reads'].map(o => `<option ${o === S.nfr.consistency ? 'selected' : ''}>${o}</option>`).join('')}</select></label></section>
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
      if (x == null) { const i = S.nodes.length; x = 40 + (i % 5) * (W + 40); y = 40 + Math.floor(i / 5) * (H + 50); }
      const n = { id: uid('n'), defId, x: Math.max(0, Math.min(CANVAS_W - W, Math.round(x))), y: Math.max(0, Math.min(CANVAS_H - H, Math.round(y))) };
      S.nodes.push(n); sel = { kind: 'node', id: n.id }; touch();
    }
    function remove() {
      if (!sel) return;
      snapshot();
      if (sel.kind === 'node') { S.nodes = S.nodes.filter(n => n.id !== sel.id); S.edges = S.edges.filter(e => e.from !== sel.id && e.to !== sel.id); }
      else S.edges = S.edges.filter(e => e.id !== sel.id);
      sel = null; touch();
    }
    function loadPreset(id) {
      const p = data.presets.find(x => x.id === id);
      if (!p) return;
      snapshot();
      S.nodes = p.nodes.map(n => ({ ...n })); S.edges = p.edges.map(e => ({ ...e })); sel = null;
      const dau = { '1k': '1000', '10k': '10000', '100k': '100000', '1m': '1000000' }[id];
      if (dau && !S.scale.dau) S.scale.dau = dau;
      touch();
    }
    function doUndo() {
      const prev = undo.pop();
      if (!prev) return status('Nothing to undo');
      const v = JSON.parse(prev); S.nodes = v.nodes; S.edges = v.edges; sel = null; touch();
    }
    async function copyMermaid() {
      const labels = Object.fromEntries(defs.map(d => [d.id, d.label])), text = Calc.toMermaid({ nodes: S.nodes, edges: S.edges }, labels);
      try { await navigator.clipboard.writeText(text); status('Mermaid copied'); } catch { window.prompt('Copy this Mermaid diagram:', text); }
    }

    // ---------- pointer handling ----------
    const stage = () => el.querySelector('[data-stage]'), canvas = () => el.querySelector('[data-canvas]');
    const local = ev => { const r = canvas().getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    const onDown = ev => {
      const handle = ev.target.closest('[data-handle]'), node = ev.target.closest('.bd-node'), edge = ev.target.closest('[data-edge]');
      if (handle && node) {
        ev.preventDefault();
        const n = nodeById(node.dataset.id); link = { from: n.id, side: handle.dataset.handle }; canvas().classList.add('is-linking');
        stage().setPointerCapture?.(ev.pointerId);
      } else if (node) {
        const n = nodeById(node.dataset.id), [px, py] = local(ev);
        sel = { kind: 'node', id: n.id }; drag = { id: n.id, dx: px - n.x, dy: py - n.y, moved: false };
        paintCanvas(); paintPanel(); stage().focus({ preventScroll: true });
        stage().setPointerCapture?.(ev.pointerId);
      } else if (edge) { sel = { kind: 'edge', id: edge.dataset.edge }; paintCanvas(); paintPanel(); stage().focus({ preventScroll: true }); }
      else if (ev.target.closest('[data-canvas]')) { sel = null; paintCanvas(); paintPanel(); }
    };
    const onMove = ev => {
      if (drag) {
        const n = nodeById(drag.id), [px, py] = local(ev);
        if (!drag.moved) { snapshot(); drag.moved = true; }
        n.x = Math.max(0, Math.min(CANVAS_W - W, Math.round(px - drag.dx))); n.y = Math.max(0, Math.min(CANVAS_H - H, Math.round(py - drag.dy)));
        const div = el.querySelector(`.bd-node[data-id="${CSS.escape(n.id)}"]`); if (div) { div.style.left = n.x + 'px'; div.style.top = n.y + 'px'; }
        el.querySelectorAll('[data-edge]').forEach(g => { const e = S.edges.find(x => x.id === g.dataset.edge); if (!e) return; const a = nodeById(e.from), b = nodeById(e.to); g.querySelectorAll('path').forEach(p => p.setAttribute('d', edgePath(a, b))); });
      } else if (link) {
        const a = nodeById(link.from), [px, py] = local(ev), [x1, y1] = anchors(a)[link.side];
        el.querySelector('[data-preview]').setAttribute('d', `M ${x1} ${y1} L ${px} ${py}`);
      }
    };
    const onUp = ev => {
      if (drag) { if (drag.moved) save(); drag = null; }
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
    };
    const onClick = ev => {
      const item = ev.target.closest('.bd-item'), act = ev.target.closest('[data-act]')?.dataset.act;
      if (item) addNode(item.dataset.def);
      else if (act === 'undo') doUndo(); else if (act === 'delete') remove();
      else if (act === 'mermaid') copyMermaid();
      else if (act === 'clear') { if (!S.nodes.length) return; snapshot(); S.nodes = []; S.edges = []; sel = null; touch(); }
    };
    const onInput = ev => {
      const t = ev.target;
      if (t.dataset.filter !== undefined) paintItems(t.value);
      else if (t.dataset.scale) { S.scale[t.dataset.scale] = t.value; save(); paintPanelKeepFocus(t); }
      else if (t.dataset.nfr) { S.nfr[t.dataset.nfr] = t.value; save(); paintPanelKeepFocus(t); }
      else if (t.dataset.req !== undefined) { S.req = t.value; save(); }
    };
    function paintPanelKeepFocus(t) {                         // redraw the estimates without losing the caret
      const key = t.dataset.scale ? `[data-scale="${t.dataset.scale}"]` : `[data-nfr="${t.dataset.nfr}"]`, at = t.selectionStart;
      paintPanel(); const again = el.querySelector(key); if (again) { again.focus(); try { again.setSelectionRange(at, at); } catch { /* selects have no caret */ } }
    }
    const onChange = ev => { if (ev.target.dataset.preset !== undefined && ev.target.value) { loadPreset(ev.target.value); ev.target.value = ''; } };
    const onDragStart = ev => { const it = ev.target.closest('.bd-item'); if (it) { ev.dataTransfer.setData('text/plain', 'bd:' + it.dataset.def); ev.dataTransfer.effectAllowed = 'copy'; } };
    const onDragOver = ev => { if (ev.target.closest('[data-canvas]')) ev.preventDefault(); };
    const onDrop = ev => {
      const t = ev.dataTransfer.getData('text/plain');
      if (!t.startsWith('bd:') || !ev.target.closest('[data-canvas]')) return;
      ev.preventDefault(); const [x, y] = local(ev); addNode(t.slice(3), x - W / 2, y - H / 2);
    };

    loadData().then(d => {
      if (dead) return;
      defs = d.components; shell(); paintCanvas(); paintPanel();
      const on = (t, ev, f) => { t.addEventListener(ev, f); offs.push(() => t.removeEventListener(ev, f)); }, offs = [];
      on(el, 'pointerdown', onDown); on(el, 'pointermove', onMove); on(el, 'pointerup', onUp); on(el, 'pointercancel', onUp);
      on(el, 'keydown', onKey); on(el, 'click', onClick); on(el, 'input', onInput); on(el, 'change', onChange);
      on(el, 'dragstart', onDragStart); on(el, 'dragover', onDragOver); on(el, 'drop', onDrop);
      el._bdOffs = offs;
    }).catch(err => { if (!dead) el.innerHTML = `<p class="bd-note">Could not load the builder (${esc(err.message)}).</p>`; });
    return { destroy() { dead = true; clearTimeout(saveTimer); write(S); (el._bdOffs || []).forEach(f => f()); }, state: () => S };
  }

  window.SDBuilder = { mount };
})();
