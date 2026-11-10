// An area map (#/system-design/map/<area>): pass one of the layered course. One page per area: what
// you hold of each lesson in three layers (map, interview-ready, depth), the things that put the
// area to work (Ripple Ops levels, worked designs) and the simulators that open it up, and the tutor,
// which covers the whole area at map depth in one sitting (server/tutor/lessons.py area_map).
// Activities the tutor brings in are the lessons' own blocks; answers land on the lesson they came from.
(function () {
  'use strict';
  const {api, escapeHtml: esc} = window.H;
  const LAYER = {1: 'Map', 2: 'Interview-ready', 3: 'Depth'};
  let M = null, area = '', error = '';

  async function open(id) {
    area = id; error = '';
    try { M = await api('/tutor/map/' + encodeURIComponent(id)); }
    catch (e) { M = null; error = e.message; }
  }

  // One ring per layer (map, interview-ready, depth): the dim arc is covered (tested or taught), the solid arc
  // is what you'd recall today. `rings` sits in a lesson row; `ladder` heads an area, one labelled step per layer.
  const pct = (t, x) => t.total ? Math.min(100, Math.round(100 * (x || 0) / t.total)) : 0;
  const said = (n, t) => `${LAYER[n]}: ${t.seen || 0} of ${t.total} ideas covered, ${t.held || 0} you'd recall today`;
  const ring = (t, label, cls = '') => `<i class="sd-ring ${cls}" role="img" title="${esc(label)}" aria-label="${esc(label)}" style="--seen:${pct(t, t.seen)}%;--held:${pct(t, t.held)}%"></i>`;
  function rings(l) {
    return `<span class="sd-rings">${l ? [1, 2, 3].map(n => {
      const t = l[n] || {total: 0};
      return t.total ? `<span>${ring(t, said(n, t))}</span>` : '<span></span>';
    }).join('') : ''}</span>`;
  }
  // The pass you're on is the first layer with ideas still to cover. `action` (an HTML link) goes in the map step.
  function ladder(l, action = '') {
    const now = [1, 2, 3].find(n => (l[n]?.total || 0) > (l[n]?.seen || 0));
    return `<div class="sd-ladder">${[1, 2, 3].map(n => {
      const t = l[n] || {total: 0}, done = t.total && t.seen >= t.total;
      return `<div class="sd-step${n === now ? ' is-now' : ''}${done ? ' is-done' : ''}">${ring(t, said(n, t), 'is-lg')}
        <span class="sd-step-text"><span class="sd-step-name">${n} · ${LAYER[n]}${n === now ? ' <b>now</b>' : done ? ' ✓' : ''}</span>
        <span class="sd-step-num">${t.seen || 0}<small> / ${t.total} covered</small></span><span class="sd-step-sub">${t.held || 0} you'd recall today</span>
        ${n === 1 ? action : ''}</span></div>`;
    }).join('')}</div>`;
  }

  function resourceRow(r) {
    const tag = r.kind === 'game' ? 'Ripple Ops' : r.kind === 'design' ? 'Worked design' : 'Simulator';
    return `<a class="sd-map-res${r.locked ? ' is-locked' : ''}" href="${esc(r.href)}"><span class="sd-eyebrow">${tag}${r.locked ? ' · locked' : ''}</span><b>${esc(r.title)}</b><small>${esc(r.about.replace(/^(Ripple Ops level|Worked design|Simulator): /, ''))}</small></a>`;
  }

  function render() {
    if (error) return `<div class="sd-error">${esc(error)}</div>`;
    if (!M) return '<p class="sd-muted">Loading the map…</p>';
    const l = M.lesson, use = M.resources.filter(r => r.layer <= 2 && r.kind !== 'internals'), sims = M.resources.filter(r => r.kind === 'internals');
    const t = M.layers[1];
    return `<div class="sd-breadcrumb"><a class="button" href="#/system-design/curriculum">← The course</a></div>
      <div class="sd-page-intro"><span class="sd-eyebrow">PASS ONE · THE MAP${M.mapped ? ' · MAPPED ✓' : ''}</span><h2 id="sd-heading" tabindex="-1">${esc(l.title.replace(/^The map: /, ''))}</h2>
        <p>${esc(l.summary)} One sitting with the tutor covers every piece at map depth: what it is for, the standard answer and its main tradeoff, and how the pieces fit. The rest waits for the interview pass.</p></div>
      <div id="sd-map-tutor"></div>
      <div class="sd-map-body">
        <section class="sd-panel"><h3>The lessons in this area</h3><p class="sd-muted">${t.seen} of ${t.total} map ideas covered. Rings: map, interview-ready, depth.</p>
          <ol class="sd-map-lessons">${M.lessons.map(x => `<li><a href="#/system-design/lesson/${esc(x.id)}">${esc(x.title)}</a>${rings(x.layers)}</li>`).join('')}</ol></section>
        ${use.length ? `<section class="sd-panel"><h3>Put it to work</h3><p class="sd-muted">Use the pieces in a whole system. No internals needed.</p><div class="sd-map-grid">${use.map(resourceRow).join('')}</div></section>` : ''}
        ${sims.length ? `<section class="sd-panel"><h3>Look inside</h3><p class="sd-muted">Simulators of how the pieces work. Mostly depth: for later, or when you're curious.</p><div class="sd-map-grid">${sims.map(resourceRow).join('')}</div></section>` : ''}
      </div>`;
  }

  // Answers to a block borrowed from a lesson are recorded on that lesson, like answering it there.
  function done(key, correct) {
    const b = (M?.lesson.blocks || []).find(x => x.key === key);
    if (!b?.from || typeof correct !== 'boolean') return Promise.resolve();
    return api(`/system-design/course/lessons/${encodeURIComponent(b.from.lesson)}/activity`, 'POST', {block: b.from.key, correct});
  }

  function wire(root) {
    const slot = root.querySelector('#sd-map-tutor');
    if (!slot || !M) return;
    const s = document.createElement('div');
    slot.appendChild(s);
    window.Tutor?.mount(s, {section: 'system-design', lesson: M.lesson, layout: root.querySelector('.sd-map-body'), done});
  }

  window.DesignMap = {open, render, wire, stop() {}, route: () => 'map/' + area, rings, ladder};
})();
