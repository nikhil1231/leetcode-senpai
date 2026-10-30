// Redesign from memory: a blank page, the original brief, ten minutes, then the walkthrough's
// rubric. Scheduled by the knowledge ledger like any other item; self-marked without the tutor.
(function () {
  'use strict';
  const {api, escapeHtml: esc} = window.H;
  const md = t => window.SDBlocks ? window.SDBlocks.md(t) : `<p>${esc(t)}</p>`;
  const inline = t => window.SDBlocks ? window.SDBlocks.inline(t) : esc(t);
  const call = (path, method = 'GET', body) => api('/system-design' + path, method, body);
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const btn = (text, act, attrs = '', primary = false) => `<button type="button" class="button ${primary ? 'is-primary' : ''}" data-rd="${act}" ${attrs}>${esc(text)}</button>`;
  const LIMIT = 600;
  let brief = null, result = null, draft = '', startedAt = 0, request = null, busy = false, error = '', ticker = null;

  const elapsed = () => Math.floor((Date.now() - startedAt) / 1000);
  const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  async function open(key) {
    brief = await call('/redesign/' + encodeURIComponent(key));
    result = null; draft = ''; startedAt = Date.now(); request = rid(); error = '';
  }
  function resultHtml() {
    const status = {covered: ['✓', 'is-right'], partial: ['◐', 'is-partial'], missing: ['○', 'is-missing'], incorrect: ['✗', 'is-wrong']};
    const g = result.grade;
    const marks = g ? `<ul class="sd-rubric">${g.points.map(p => `<li class="${status[p.status][1]}"><span>${status[p.status][0]}</span><div><b>${inline(p.point)}</b><p>${inline(p.note)}</p></div></li>`).join('')}</ul><p>${inline(g.feedback)}</p>`
      : result.score === null ? `<p>${result.message ? esc(result.message) + ' ' : ''}Tick the points your design covered:</p><ul class="sd-rubric is-self">${result.points.map((p, i) => `<li><label><input type="checkbox" data-point="${i}"> ${inline(p)}</label></li>`).join('')}</ul><div class="sd-actions">${btn('Record self-check', 'self', '', true)}</div>` : '';
    return `<section class="sd-panel"><span class="sd-eyebrow">RESULT</span>${result.score !== null ? `<h3>${Math.round(result.score * 100)}% of the key points</h3><p class="sd-muted">${result.score >= 0.75 ? 'Held. It comes back later at a longer interval.' : 'Not yet held. It comes back sooner.'}</p>` : ''}${marks}
      <details class="sd-model"><summary>The model pitch</summary>${md(result.model)}</details><details><summary>Your redesign</summary><div class="sd-attempt-text">${esc(draft)}</div></details>
      <div class="sd-actions">${btn('Reread the walkthrough', 'lesson', '', true)}${btn('Back to today', 'home')}</div></section>`;
  }
  function render() {
    if (!brief) return '<p class="sd-muted">Loading…</p>';
    const left = Math.max(0, LIMIT - elapsed());
    return `<div class="sd-breadcrumb">${btn('← Today', 'home')}<span>/ Redesign from memory</span></div><div class="sd-page-intro"><span class="sd-eyebrow">REDESIGN FROM MEMORY · ${clock(LIMIT)}</span><h2 id="sd-heading" tabindex="-1">${esc(brief.title)}</h2><p>A blank page and the original brief. Write the design end to end as you would talk through it: requirements, numbers, API, data, components and the hard parts. No peeking: retrieving it is the exercise.</p></div>
      ${error ? `<div class="sd-error" role="alert">${esc(error)}</div>` : ''}
      <section class="sd-panel"><h3>The brief</h3>${md(brief.prompt)}${brief.requirements.length ? `<ul>${brief.requirements.map(r => `<li>${inline(r)}</li>`).join('')}</ul>` : ''}<p class="sd-muted">Stages to cover: ${brief.stages.map(esc).join(' · ')}</p></section>
      ${result ? resultHtml() : `<section class="sd-panel"><div class="sd-section-title"><h3>Your design</h3><span class="sd-timer"><b id="sd-rd-clock">${clock(left)}</b> left</span></div><textarea class="textarea sd-redesign-text" rows="18" maxlength="12000" placeholder="1. Requirements…">${esc(draft)}</textarea><div class="sd-actions">${btn(busy ? 'Marking…' : 'Mark my redesign →', 'submit', busy ? 'disabled' : '', true)}<span class="sd-muted">${brief.tutor ? 'The tutor marks it against the walkthrough’s key points.' : 'You will tick off the key points yourself.'}</span></div></section>`}
      ${brief.history.length ? `<p class="sd-muted">Earlier attempts: ${brief.history.map(h => `${new Date(h.at * 1000).toLocaleDateString()} · ${h.score === null ? 'unmarked' : Math.round(h.score * 100) + '%'}`).join(' — ')}</p>` : ''}`;
  }
  function stop() { clearInterval(ticker); ticker = null; }
  function wire(root) {
    stop();
    root.querySelector('.sd-redesign-text')?.addEventListener('input', e => { draft = e.target.value; });
    if (!result) ticker = setInterval(() => { const c = document.getElementById('sd-rd-clock'); if (!c) return stop(); c.textContent = clock(Math.max(0, LIMIT - elapsed())); }, 1000);
    root.querySelectorAll('[data-rd]').forEach(n => n.addEventListener('click', async () => {
      const a = n.dataset.rd;
      if (a === 'home') return window.SystemDesign.openView('home');
      if (a === 'lesson') return window.SystemDesign.openView('lesson/' + brief.lesson_id);
      if (busy) return;
      try {
        if (a === 'submit') {
          if (draft.trim().length < 20) { root.querySelector('.sd-redesign-text')?.focus(); return; }
          busy = true; window.SystemDesign.repaint();
          result = await call('/redesign/' + brief.lesson_id, 'POST', {request_id: request, text: draft, elapsed_sec: elapsed()});
        }
        if (a === 'self') {
          result = {...result, ...await call(`/redesign/${result.id}/self`, 'POST', {covered: root.querySelectorAll('[data-point]:checked').length})};
        }
        error = ''; window.DesignLedger?.invalidate();
      } catch (e) { error = e.message; }
      busy = false; window.SystemDesign.repaint();
    }));
  }
  window.DesignRedesign = {open, render, wire, stop, route: () => brief ? 'redesign/' + brief.lesson_id : 'home'};
})();
