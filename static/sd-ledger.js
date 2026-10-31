// Knowledge ledger views: the mistakes book, results slips and the cross-section activity calendar. Views render into
// `[data-ledger="part"]` slots after the page paints, from one cached /ledger fetch.
(function () {
  'use strict';
  const {api, escapeHtml: esc} = window.H;
  const parts = {};
  let cache = null, pending = null;

  function load(fresh) {
    if (fresh) cache = null;
    if (cache) return Promise.resolve(cache);
    if (!pending) pending = api('/system-design/ledger').then(d => { cache = d; return d; }).finally(() => { pending = null; });
    return pending;
  }

  const go = (label, kind, attrs = '', primary = false) => `<button type="button" class="button ${primary ? 'is-primary' : ''}" data-ledger-go="${kind}" ${attrs}>${esc(label)}</button>`;
  const when = t => t ? new Date(t * 1000).toLocaleDateString() : '';

  const KIND = {predict: 'Predict', calc: 'Estimate', faded: 'Fill the gaps', sort: 'Sort', order: 'Order', bug: 'Spot the bug', recall: 'Explain', incident: 'On-call drill', arch: 'Diagram', timeline: 'Timeline', check: 'Lesson check', quickfire: 'Quickfire', exercise: 'Skill drill', drill: 'Estimation drill'};
  parts.mistakes = d => {
    const {fix, confirm} = d.mistakes;
    const row = m => `<li><span class="sd-sq is-${m.status}"></span><div><b>${esc(m.label)}</b><small>${esc(KIND[m.kind] || m.kind)} · ${m.topic.startsWith('skill:') || m.topic.startsWith('drill:') ? esc(m.topic_title) : `<a href="#/system-design/lesson/${esc(m.topic)}">${esc(m.topic_title)}</a>`} · ${when(m.last_at)}</small></div></li>`;
    if (!fix.length && !confirm.length) return `<section class="sd-panel sd-mistakes-empty"><h3>Your mistakes book is empty.</h3><p class="sd-muted">Every wrong, revealed or guessed answer lands here. Clear it by answering correctly on a later day.</p></section>`;
    return `<section class="sd-mistakes-head"><div><strong>${fix.length}</strong><span>to fix</span></div><div><strong>${confirm.length}</strong><span>fixed today: confirm on a later day</span></div>${fix.length || confirm.length ? go(`Clear them: sit a mistakes paper →`, 'paper', 'data-scope="mistakes"', true) : ''}</section>
      ${fix.length ? `<section class="sd-panel"><h3>To fix</h3><ul class="sd-mistake-list">${fix.map(row).join('')}</ul></section>` : ''}
      ${confirm.length ? `<section class="sd-panel"><h3>To confirm</h3><p class="sd-muted">You got these right after missing them, but on the same day. Answer them correctly again tomorrow or later to clear them.</p><ul class="sd-mistake-list">${confirm.map(row).join('')}</ul></section>` : ''}`;
  };

  // Activity calendar across LeetCode and System Design, from /api/activity.
  function activityHtml(a) {
    const first = new Date(a.days[0].day + 'T00:00:00'), pad = (first.getDay() + 6) % 7;
    const max = Math.max(1, ...a.days.map(r => r.leetcode * 5 + r.design));
    const cell = r => {
      const v = r.leetcode * 5 + r.design, level = v ? Math.min(4, Math.ceil(4 * v / max)) : 0;
      const kind = r.leetcode && r.design_answers ? 'both' : r.leetcode ? 'lc' : r.design_answers ? 'sd' : 'none';
      const tip = `${r.day}: ${r.leetcode} LeetCode · ${r.design} system design marks`;
      return `<i class="sd-cal-cell is-${kind} l${level}" title="${esc(tip)}" aria-label="${esc(tip)}"></i>`;
    };
    return `<section class="sd-panel sd-activity"><div class="sd-section-title"><div><h3>Practice calendar</h3><p>Both sections, last ${a.days.length} days. Purple is LeetCode, teal is system design.</p></div><div class="sd-activity-stats"><span><b>${a.streak}</b> day streak</span><span><b>${a.active_days}</b> active days</span><span><b>${a.totals.leetcode}</b> LeetCode</span><span><b>${a.totals.design}</b> SD marks</span></div></div>
      <div class="sd-cal">${'<i class="sd-cal-cell is-pad"></i>'.repeat(pad)}${a.days.map(cell).join('')}</div></section>`;
  }

  function onClick(e) {
    const b = e.target.closest('[data-ledger-go]');
    if (!b || window.SystemDesign.isBusy()) return;
    const kind = b.dataset.ledgerGo;
    if (kind === 'paper') window.DesignPapers.begin({scope: b.dataset.scope, value: b.dataset.value || '', length: b.dataset.length || 'short'});
    if (kind === 'view') window.SystemDesign.openView(b.dataset.view);
  }

  async function mount(root) {
    const slots = [...root.querySelectorAll('[data-ledger]')];
    if (!slots.length) return;
    slots.forEach(slot => { if (!slot.dataset.wired) { slot.dataset.wired = '1'; slot.addEventListener('click', onClick); } });
    const calendar = slots.filter(s => s.dataset.ledger === 'activity');
    if (calendar.length) api('/activity').then(a => calendar.forEach(s => { if (s.isConnected) s.innerHTML = activityHtml(a); })).catch(() => {});
    try {
      const d = await load();
      slots.forEach(slot => { if (slot.isConnected && parts[slot.dataset.ledger]) slot.innerHTML = parts[slot.dataset.ledger](d, slot); });
    } catch (e) {
      slots.filter(s => s.dataset.ledger !== 'activity').forEach(slot => { slot.innerHTML = `<p class="sd-muted">Progress is unavailable right now: ${esc(e.message)}</p>`; });
    }
  }

  function slipHtml(s) {
    const sign = v => (v >= 0 ? '+' : '') + v;
    const cells = [[`${s.marks}<small>/${s.max}</small>`, 'Marks'], [s.answers, 'Answered'], [s.new_items, 'New items'],
      [s.became_solid, 'Now solid'], [`${Math.round(s.knowledge_after)} <small>${sign(s.knowledge_delta)}</small>`, 'Knowledge']];
    return `<section class="sd-slip"><span class="sd-eyebrow">RESULTS SLIP</span><div class="sd-slip-cells">${cells.map(([v, l]) => `<div><strong>${v}</strong><span>${l}</span></div>`).join('')}</div>
      ${s.records.length ? `<ul class="sd-slip-records">${s.records.map(r => `<li><span aria-hidden="true">★</span> New personal best · ${esc(r.label)}: <b>${esc(r.display)}</b></li>`).join('')}</ul>` : ''}</section>`;
  }
  // Fills a node with the slip for everything answered since `since` (unix seconds).
  async function slip(node, since) {
    if (!node) return;
    try { const s = await api('/system-design/slip?since=' + Math.floor(since)); if (node.isConnected) node.innerHTML = slipHtml(s); }
    catch (e) { node.innerHTML = ''; }
  }

  const slot = (part, extra = '') => `<div data-ledger="${part}" ${extra}></div>`;
  window.DesignLedger = {load, mount, slot, parts, slip, slipHtml, activityHtml, cached: () => cache, invalidate() { cache = null; }};
})();
