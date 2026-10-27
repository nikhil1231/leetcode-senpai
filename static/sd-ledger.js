// Knowledge ledger views: today's one button, the knowledge number, personal bests, the knowledge
// map, the mistakes book, results slips and the cross-section activity calendar. Views render into
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

  function sparkline(points, w = 260, h = 54) {
    if (points.length < 2) return '';
    const max = Math.max(1, ...points.map(p => p.value));
    const xy = points.map((p, i) => [i * w / (points.length - 1), h - 4 - (h - 8) * p.value / max]);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    return `<svg class="sd-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Knowledge over the last ${points.length} days"><path class="sd-spark-area" d="${line}L${w},${h}L0,${h}Z"/><path class="sd-spark-line" d="${line}"/></svg>`;
  }

  const STATUS = [['solid', 'Solid'], ['learning', 'Learning'], ['fading', 'Fading'], ['shaky', 'Shaky'], ['unseen', 'Unseen']];
  parts.knowledge = d => {
    const h = d.history, week = h.length > 7 ? h[h.length - 8].value : 0;
    const delta = Math.round((d.knowledge - week) * 10) / 10;
    return `<section class="sd-knowledge"><div class="sd-knowledge-main"><span class="sd-eyebrow">KNOWLEDGE YOU HOLD RIGHT NOW</span>
      <div class="sd-knowledge-number"><strong>${Math.round(d.knowledge)}</strong><span>of ${d.total} things you'd get right today</span></div>
      <p class="sd-muted">${delta >= 0 ? '+' : ''}${delta} this week · it rises when you study and slowly fades when you don't.</p>
      <div class="sd-status-chips">${STATUS.map(([k, label]) => `<span class="sd-chip is-${k}"><i></i>${label} <b>${d.counts[k] || 0}</b></span>`).join('')}</div></div>
      <div class="sd-knowledge-chart">${sparkline(h)}<div class="sd-spark-axis"><span>${h.length} days ago</span><span>now</span></div></div></section>`;
  };

  const go = (label, kind, attrs = '', primary = false) => `<button type="button" class="button ${primary ? 'is-primary' : ''}" data-ledger-go="${kind}" ${attrs}>${esc(label)}</button>`;
  const when = t => t ? new Date(t * 1000).toLocaleDateString() : '';

  parts.records = d => {
    if (!d.records.length) return `<section class="sd-panel"><h3>Personal bests</h3><p class="sd-muted">Records appear as you practise: best paper grades, longest Quickfire streak, most marks in a day, estimation sprints.</p></section>`;
    return `<section class="sd-panel"><h3>Personal bests</h3><div class="sd-records">${d.records.map(r => `<div class="sd-record"><span>${esc(r.label)}</span><strong>${esc(r.display)}</strong>${r.at ? `<small>${esc(typeof r.at === 'number' ? when(r.at) : r.at)}</small>` : ''}</div>`).join('')}</div></section>`;
  };

  const KIND = {predict: 'Predict', calc: 'Estimate', faded: 'Fill the gaps', sort: 'Sort', order: 'Order', bug: 'Spot the bug', recall: 'Explain', incident: 'On-call drill', arch: 'Diagram', timeline: 'Timeline', check: 'Lesson check', quickfire: 'Quickfire', exercise: 'Skill drill', drill: 'Estimation drill'};
  parts.heatmap = d => {
    const square = s => `<i class="sd-sq is-${s.status}" style="--r:${s.status === 'unseen' ? 1 : Math.max(.35, s.r)}" title="${esc(`${KIND[s.kind] || s.kind}: ${s.label} · ${s.status}${s.status === 'unseen' ? '' : ` · ${Math.round(s.r * 100)}% recall`}`)}"></i>`;
    return `<section class="sd-panel sd-heatmap"><div class="sd-section-title"><div><h3>Knowledge map</h3><p>Every square is one question or exercise. Colour shows how well you hold it today; squares fade as you go without reviewing.</p></div>${go('Repaint the faded squares', 'paper', 'data-scope="review"', true)}</div>
      <div class="sd-status-chips">${STATUS.map(([k, label]) => `<span class="sd-chip is-${k}"><i></i>${label}</span>`).join('')}</div>
      ${d.heatmap.map(c => `<details class="sd-heat-cat" open><summary><strong>${esc(c.title)}</strong><span>${c.topics.reduce((n, t) => n + t.items.filter(s => s.status === 'solid' || s.status === 'learning').length, 0)}/${c.topics.reduce((n, t) => n + t.items.length, 0)} held</span></summary>${c.topics.map(t => `<div class="sd-heat-row">${t.id.startsWith('skill:') ? `<span class="sd-heat-topic">${esc(t.title)}</span>` : `<a class="sd-heat-topic" href="#/system-design/lesson/${esc(t.id)}">${esc(t.title)}</a>`}<div class="sd-heat-squares">${t.items.map(square).join('')}</div>${t.id.startsWith('skill:') || t.id.startsWith('drill:') ? '' : go('Paper', 'paper', `data-scope="topic" data-value="${esc(t.id)}" aria-label="Sit a paper on ${esc(t.title)}"`)}</div>`).join('')}</details>`).join('')}</section>`;
  };

  parts.mistakes = d => {
    const {fix, confirm} = d.mistakes;
    const row = m => `<li><span class="sd-sq is-${m.status}"></span><div><b>${esc(m.label)}</b><small>${esc(KIND[m.kind] || m.kind)} · ${m.topic.startsWith('skill:') || m.topic.startsWith('drill:') ? esc(m.topic_title) : `<a href="#/system-design/lesson/${esc(m.topic)}">${esc(m.topic_title)}</a>`} · ${when(m.last_at)}</small></div></li>`;
    if (!fix.length && !confirm.length) return `<section class="sd-panel sd-mistakes-empty"><h3>Your mistakes book is empty.</h3><p class="sd-muted">Every wrong, revealed or guessed answer lands here. Clear it by answering correctly on a later day.</p></section>`;
    return `<section class="sd-mistakes-head"><div><strong>${fix.length}</strong><span>to fix</span></div><div><strong>${confirm.length}</strong><span>fixed today: confirm on a later day</span></div>${fix.length || confirm.length ? go(`Clear them: sit a mistakes paper →`, 'paper', 'data-scope="mistakes"', true) : ''}</section>
      ${fix.length ? `<section class="sd-panel"><h3>To fix</h3><ul class="sd-mistake-list">${fix.map(row).join('')}</ul></section>` : ''}
      ${confirm.length ? `<section class="sd-panel"><h3>To confirm</h3><p class="sd-muted">You got these right after missing them, but on the same day. Answer them correctly again tomorrow or later to clear them.</p><ul class="sd-mistake-list">${confirm.map(row).join('')}</ul></section>` : ''}`;
  };

  // One button: mistakes first, then fading items, then the next lesson, then a mixed paper.
  parts.today = (d, slot) => {
    const fix = d.mistakes.fix.length, due = d.due, next = slot.dataset.next, title = slot.dataset.nextTitle;
    let action;
    if (fix >= 3) action = [`Clear ${Math.min(fix, 99)} mistakes →`, 'paper', 'data-scope="mistakes"', 'Mistakes are the cheapest marks to win back. A short paper of them, marked at the end.'];
    else if (due >= 5) action = [`Top up ${due} fading items →`, 'paper', 'data-scope="review"', 'These are slipping. Reviewing them now, before they are gone, grows their memory the most.'];
    else if (next) action = [`Continue: ${title} →`, 'view', `data-view="lesson/${esc(next)}"`, 'Nothing urgent to review. Learn the next lesson in the course.'];
    else action = ['Sit a mixed paper →', 'paper', 'data-scope="mixed"', 'The course is done and nothing is due. Keep it sharp with a timed paper.'];
    const clear = !fix && !due;
    return `<section class="sd-today"><div><span class="sd-eyebrow"><span class="sd-live-dot"></span>TODAY</span><p class="sd-today-reason">${esc(action[3])}</p>${go(action[0], action[1], action[2], true)}</div>
      <div class="sd-today-stats"><div><strong>${d.today.marks}</strong><span>marks today</span></div><div><strong>${d.today.answers}</strong><span>answered</span></div><div class="${due ? '' : 'is-clear'}"><strong>${due}</strong><span>due</span></div><div class="${fix ? '' : 'is-clear'}"><strong>${fix}</strong><span>mistakes</span></div>${clear ? '<p class="sd-all-clear">✓ All clear: nothing due, no mistakes.</p>' : ''}</div>
      <div class="sd-today-more">${go('Quickfire', 'view', 'data-view="quickfire"')}${go('Estimation blitz', 'view', 'data-view="drills"')}${go('Past paper', 'view', 'data-view="papers"')}</div></section>`;
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
  window.DesignLedger = {load, mount, slot, parts, sparkline, slip, slipHtml, activityHtml, cached: () => cache, invalidate() { cache = null; }};
})();
