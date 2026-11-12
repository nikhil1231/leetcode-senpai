// Estimation drills: rapid back-of-envelope questions, answered by typing a number and pressing Enter.
(function () {
  'use strict';
  const {$, api, escapeHtml: esc} = window.H;
  const md = t => window.SDBlocks ? window.SDBlocks.md(t) : `<p>${esc(t)}</p>`;
  const call = (path, method = 'GET', body) => api('/system-design' + path, method, body);
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const btn = (text, action, attrs = '', primary = false) => `<button type="button" class="button ${primary ? 'is-primary' : ''}" data-drill="${action}" ${attrs}>${esc(text)}</button>`;
  let info = null, sprint = null, last = null, busy = false, error = '', countdown = null, startedAt = 0, draft = '';

  const answeredCount = () => Object.keys(sprint.answers).length;
  const score = () => Object.values(sprint.answers).filter(a => a.correct).length;
  const current = () => sprint.questions.find(q => !sprint.answers[String(q.n)]);
  const left = () => sprint.seconds ? Math.max(0, Math.ceil(sprint.seconds - (Date.now() / 1000 - startedAt))) : null;
  function streak() { let n = 0; for (let i = answeredCount() - 1; i >= 0; i--) { if (sprint.answers[String(i)]?.correct) n++; else break; } return n; }

  function setupHtml() {
    const best = info.best || {};
    return `<div class="sd-page-intro"><span class="sd-eyebrow">ESTIMATION DRILLS</span><h2 id="sd-heading" tabindex="-1">Back-of-envelope, at speed.</h2><p>Numbers come up in every design interview: requests per second, storage, cache size, partitions, downtime. Type an estimate and press Enter. Within 25% counts. The questions never run out.</p></div>
      <div class="sd-drill-modes"><article class="sd-panel"><span class="sd-eyebrow">BLITZ</span><h3>Three minutes</h3><p class="sd-muted">As many as you can before the clock runs out.</p><p class="sd-drill-best">Best: <b>${best.blitz ?? '—'}</b></p>${btn('Start blitz →', 'start', 'data-mode="blitz"', true)}</article>
      <article class="sd-panel"><span class="sd-eyebrow">TEN</span><h3>Ten estimates</h3><p class="sd-muted">No clock. Get all ten right.</p><p class="sd-drill-best">Best: <b>${best.ten ?? '—'}</b>/10</p>${btn('Start ten →', 'start', 'data-mode="ten"', true)}</article></div>
      ${info.recent.length ? `<section class="sd-panel"><h3>Recent sprints</h3><table class="sd-evidence"><tbody>${info.recent.map(r => `<tr><td>${new Date(r.finished_at * 1000).toLocaleDateString()}</td><td>${r.drill === 'blitz' ? 'Blitz' : 'Ten'}</td><td><b>${r.score}</b> correct of ${r.answered}</td><td>${Math.floor(r.elapsed_sec / 60)}:${String(r.elapsed_sec % 60).padStart(2, '0')}</td></tr>`).join('')}</tbody></table></section>` : ''}
      <details class="sd-panel"><summary>What comes up (${Object.keys(info.templates).length} kinds)</summary><ul>${Object.values(info.templates).map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
  }
  function lastHtml() {
    if (!last) return '<div class="sd-drill-last"></div>';
    return `<div class="sd-drill-last ${last.correct ? 'is-right' : 'is-wrong'}"><b>${last.correct ? '✓' : '✗'} ${esc(last.value)} ${esc(last.q.unit)}</b> · answer ${Number(last.q.answer).toLocaleString(undefined, {maximumSignificantDigits: 4})} ${esc(last.q.unit)}<div class="sd-drill-working">${md(last.q.working)}</div></div>`;
  }
  function sprintHtml() {
    const q = current(), t = left();
    return `<div class="sd-drill-bar"><span>${sprint.drill === 'blitz' ? 'BLITZ' : 'TEN'}</span><span>Score <b id="sd-drill-score">${score()}</b></span><span class="sd-combo ${streak() >= 3 ? 'is-hot' : ''}">Streak <b>${streak()}</b></span>${t === null ? `<span>${answeredCount()}/${sprint.questions.length}</span>` : `<span class="sd-drill-clock" id="sd-drill-clock">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span>`}${btn('Stop', 'finish')}</div>
      <article class="sd-panel sd-drill-card"><p class="sd-drill-prompt">${esc(q.prompt)}</p><form id="sd-drill-form" class="sd-drill-input"><input class="input" id="sd-drill-answer" inputmode="decimal" autocomplete="off" placeholder="e.g. 2.5k" aria-label="Your estimate" value="${esc(draft)}"><span>${esc(q.unit)}</span><button type="submit" class="button is-primary">Enter ↵</button></form><p class="sd-muted">Suffixes k, M and B work. Within 25% counts.</p></article>${lastHtml()}`;
  }
  function doneHtml() {
    const wrong = sprint.questions.filter(q => sprint.answers[String(q.n)] && !sprint.answers[String(q.n)].correct);
    return `<div class="sd-page-intro"><span class="sd-eyebrow">SPRINT COMPLETE</span><h2 id="sd-heading" tabindex="-1">${score()} correct${sprint.drill === 'ten' ? ' of 10' : ` in ${Math.round((sprint.elapsed_sec || 0) / 60 * 10) / 10} minutes`}.</h2><p>${answeredCount()} answered.</p></div><div data-drill-slip></div>
      ${wrong.length ? `<section class="sd-panel"><h3>Worth another look</h3>${wrong.map(q => `<details><summary>${esc(q.prompt)} <span class="sd-muted">you said ${esc(sprint.answers[String(q.n)].value)}</span></summary>${md(q.working)}</details>`).join('')}</section>` : ''}
      <div class="sd-actions">${btn('Go again →', 'start', `data-mode="${sprint.drill}"`, true)}${btn('Drills home', 'home')}</div>`;
  }
  function render() {
    const body = !info ? '<div class="sd-panel">Loading drills…</div>' : !sprint ? setupHtml() : sprint.finished_at ? doneHtml() : sprintHtml();
    return `<div class="sd-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</div>${body}`;
  }

  function stopClock() { clearInterval(countdown); countdown = null; }
  function startClock() {
    stopClock();
    if (!sprint || sprint.finished_at || !sprint.seconds) return;
    countdown = setInterval(() => {
      const t = left(), node = $('#sd-drill-clock');
      if (node) { node.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; node.classList.toggle('is-low', t <= 15); }
      if (t <= 0) { stopClock(); act('finish'); }
    }, 250);
  }
  async function act(action, node) {
    if (busy) return;
    busy = true; error = '';
    try {
      if (action === 'start') { sprint = await call('/drills', 'POST', {request_id: rid(), mode: node.dataset.mode}); startedAt = Date.now() / 1000; last = null; draft = ''; }
      if (action === 'answer') {
        const q = current(), value = draft.trim();
        if (!value) return;
        sprint = await call(`/drills/${sprint.id}/answer`, 'POST', {n: q.n, value});
        const a = sprint.answers[String(q.n)];
        draft = '';
        if (a) last = {...a, q: sprint.questions[q.n]};
      }
      if (action === 'finish') sprint = await call(`/drills/${sprint.id}/finish`, 'POST', {});
      if (action === 'home') { sprint = null; info = await call('/drills'); }
      if (sprint?.finished_at) { stopClock(); info = await call('/drills'); window.DesignLedger?.invalidate(); }
    } catch (e) { error = e.message; }
    finally { busy = false; window.SystemDesign.repaint(); }
  }
  async function open() { info = await call('/drills'); }
  function wire(root) {
    root.querySelectorAll('[data-drill]').forEach(n => n.addEventListener('click', () => act(n.dataset.drill, n)));
    const form = root.querySelector('#sd-drill-form'), input = root.querySelector('#sd-drill-answer');
    if (form) {
      form.addEventListener('submit', e => { e.preventDefault(); draft = input.value; act('answer'); });
      input.addEventListener('input', () => { draft = input.value; });
      input.focus();
      startClock();
    }
    if (sprint?.finished_at) window.DesignLedger?.slip(root.querySelector('[data-drill-slip]'), sprint.created_at);
  }
  window.DesignDrills = {render, wire, open, stop: stopClock, isBusy: () => busy};
})();
