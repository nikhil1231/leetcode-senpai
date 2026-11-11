// Numbers drill: the default way into the Numbers to know lesson. An endless queue of questions
// (server/system_design_numbers.py): type a number, pick a unit (or type it, "1000 MB" and "1 GB" are
// the same), and the server bands the answer by how far out it was. Further out comes back sooner.
// The side shows a sliding-window score over the last answers. A switch hands the page back to the
// tutor and the notes; the choice is remembered. A toggle on the card switches between the base
// numbers and derived questions (server/numbers_derived.py), sums built from them on the fly. While the drill is on, CSS hides the tutor and the
// notes (:has on .nd-host.is-on); a tutor session opened from elsewhere hides the drill instead.
(function () {
  'use strict';
  const {api, escapeHtml: esc} = window.H;
  const OFF = 'numbers-drill:off';
  const off = () => { try { return localStorage.getItem(OFF) === '1'; } catch (_) { return false; } };
  const setOff = on => { try { if (on) localStorage.setItem(OFF, '1'); else localStorage.removeItem(OFF); } catch (_) {} };
  const MODE = 'numbers-drill:mode';
  const savedMode = () => { try { return localStorage.getItem(MODE) === 'derived' ? 'derived' : 'base'; } catch (_) { return 'base'; } };
  const TONE = {exact: 'good', close: 'good', off: 'warn', far: 'bad', wild: 'bad', skip: 'none'};
  let D = null;

  function mount(slot, ctx) {
    if (!slot) return;
    if (!D) {
      D = {host: document.createElement('div'), state: null, result: null, next: null, units: {}, busy: false, error: '', draft: '', mode: savedMode()};
      D.host.className = 'nd-host';
      D.host.addEventListener('submit', submit);
      D.host.addEventListener('click', click);
      D.host.addEventListener('keydown', e => { if (e.key === 'Enter' && D.result && e.target.tagName !== 'INPUT') { e.preventDefault(); advance(); } });
      load();
    }
    D.ctx = ctx;
    slot.replaceWith(D.host);
    D.host.classList.toggle('is-on', !off());
    paint();
  }

  // Leaving for the tutor or the notes from their own buttons turns the drill off, so they stay in view.
  document.addEventListener('click', e => {
    if (!D?.host.isConnected || !D.host.classList.contains('is-on')) return;
    const b = e.target.closest?.('[data-tu]');
    if (b && ['start', 'resume', 'start-now', 'notes', 'close'].includes(b.dataset.tu)) { setOff(true); D.host.classList.remove('is-on'); paint(); }
  }, true);

  async function load() {
    const mode = D.mode;
    try {
      const state = await api(`/system-design/numbers?mode=${mode}`);
      if (mode !== D.mode) return;
      D.state = state; D.error = '';
    }
    catch (e) { D.error = e.message || 'Could not load the drill.'; }
    paint(true);
  }

  function scoreHtml(s) {
    const log = s.log || [], right = log.filter(a => a.band === 'exact' || a.band === 'close').length;
    const dots = log.map(a => `<i class="nd-dot is-${TONE[a.band] || 'none'}" title="${esc(a.band)}"></i>`).join('');
    const pct = log.length ? Math.round(100 * right / log.length) : 0;
    return `<aside class="nd-score" aria-label="Score over your last answers"><span class="sd-eyebrow">LAST ${s.window} ANSWERS</span>
      <div class="nd-big">${log.length ? `<b>${right}</b>/${log.length}` : '<b>–</b>'}<small>${log.length ? pct + '% correct' : 'No answers yet'}</small></div>
      <div class="nd-dots">${dots}</div>
      ${s.mode === 'derived'
        ? `<p class="sd-muted">${s.answered} answered in all · ${s.pending} missed, waiting to come back.</p>
      <p class="sd-muted">Each question is built from the base numbers. A miss comes back once, and the base numbers it rests on come back a little sooner too.</p>`
        : `<p class="sd-muted">${s.answered} answered in all · ${s.seen} of ${s.total} questions seen · ${s.secure} right twice running.</p>
      <p class="sd-muted">Within 2× (or inside the range) counts as correct. The further out a miss is, the sooner it comes back. Every other question is a new one until you've seen them all.</p>`}</aside>`;
  }

  function cardHtml() {
    const s = D.state, r = D.result;
    const q = r ? r.q : s.question;
    const unit = D.units[q.kind] || q.unit;
    const opts = q.units.map(u => `<option value="${esc(u)}" ${u === unit ? 'selected' : ''}>${esc(u)}</option>`).join('');
    const form = `<form class="nd-form" autocomplete="off"><input class="input nd-value" name="value" inputmode="decimal" aria-label="Your answer" placeholder="Your answer, e.g. 250 or 1.5k" ${r ? 'disabled' : ''} value="${esc(r ? r.typed : D.draft)}">
        <span class="select nd-unit"><select name="unit" aria-label="Unit" ${r ? 'disabled' : ''}>${opts}</select></span>
        ${r ? '' : '<button type="submit" class="button is-primary">Check</button>'}</form>`;
    const res = r ? `<div class="nd-result is-${TONE[r.band]}" role="status"><b>${esc(r.label)}</b>
        <p>${r.given ? `You said ${esc(r.given)}. ` : ''}The answer is <b>${esc(r.answer)}</b>.${r.factor && r.factor > 1 ? ` You were ${r.factor}× out.` : ''}</p>
        <p>${esc(r.why)}</p>${backHtml(r)}</div>
        <div class="sd-actions"><button type="button" class="button is-primary" data-nd="next">Next question →</button></div>`
      : `<div class="sd-actions"><button type="button" class="button" data-nd="skip">I don't know</button><span class="sd-muted">Enter checks. Typing a unit (“40 min”, “1000 MB”) overrides the list.</span></div>`;
    const modes = `<div class="nd-modes" role="group" aria-label="Which questions">${[['base', 'Base'], ['derived', 'Derived']].map(([m, l]) =>
      `<button type="button" class="nd-mode ${D.mode === m ? 'is-on' : ''}" data-nd-mode="${m}" aria-pressed="${D.mode === m}" title="${m === 'base' ? 'The numbers from the lesson, to learn by heart' : 'Sums built from those numbers, made up on the fly'}">${l}</button>`).join('')}</div>`;
    return `<article class="nd-card"><div class="nd-card-head"><span class="sd-eyebrow">${esc(q.topic.toUpperCase())}${q.derived ? ' · DERIVED' : ''}</span>${modes}</div><p class="nd-q">${esc(q.prompt)}</p>${form}
      ${D.error ? `<p class="tu-error">${esc(D.error)}</p>` : ''}${res}</article>`;
  }

  function backHtml(r) {
    if (r.back_in == null) return '';
    const base = r.nudged ? ` The ${r.nudged === 1 ? 'base number' : r.nudged + ' base numbers'} it rests on will come back sooner too.` : '';
    return `<p class="sd-muted">This comes back after ${r.back_in} other question${r.back_in === 1 ? '' : 's'}.${base}</p>`;
  }

  function paint(focus) {
    if (!D) return;
    const on = D.host.classList.contains('is-on');
    const sw = `<div class="nd-switch" role="group" aria-label="How to learn this lesson">
      <button type="button" class="nd-tab ${on ? 'is-on' : ''}" data-nd="on" aria-pressed="${on}">Numbers drill</button>
      <button type="button" class="nd-tab ${on ? '' : 'is-on'}" data-nd="off" aria-pressed="${!on}">Tutor and notes</button></div>`;
    if (!on) { D.host.innerHTML = sw; return; }
    if (!D.state) { D.host.innerHTML = sw + (D.error ? `<p class="tu-error">${esc(D.error)} <button type="button" class="button" data-nd="reload">Try again</button></p>` : '<p class="sd-muted">Loading the drill…</p>'); return; }
    D.host.innerHTML = sw + `<section class="nd-body">${cardHtml()}${scoreHtml(D.state)}</section>`;
    if (focus) setTimeout(() => (D.result ? D.host.querySelector('[data-nd="next"]') : D.host.querySelector('.nd-value'))?.focus({preventScroll: true}), 0);
  }

  async function answer(body) {
    if (D.busy) return;
    D.busy = true;
    const q = D.state.question;
    try {
      const res = await api('/system-design/numbers/answer', 'POST', {question_id: q.id, ...body});
      D.result = {...res.result, q, typed: body.value || ''};
      D.state = res;
      D.error = ''; D.draft = '';
    } catch (e) { D.error = checkError(e); D.draft = body.value || ''; }
    D.busy = false;
    paint(true);
  }

  // Answers the server read and refused (an unknown unit, an unreadable number) come back with their
  // reason; anything else means the server never got to the answer, usually a restart mid-deploy.
  function checkError(e) {
    if (e.status && e.status < 500 && e.message) return e.message;
    if (!e.status) return 'Could not reach the server, so your answer was not checked. Check your connection and press Check again.';
    return `The server did not answer (error ${e.status}), so your answer was not checked. It may be restarting after an update: press Check again in a few seconds.`;
  }

  function submit(e) {
    if (!e.target.matches('.nd-form')) return;
    e.preventDefault();
    const f = e.target, value = f.value.value.trim(), unit = f.unit.value;
    if (!value) { f.value.focus(); return; }
    D.units[D.state.question.kind] = unit;
    answer({value, unit});
  }

  function advance() { D.result = null; D.error = ''; paint(true); }

  function click(e) {
    const m = e.target.closest('[data-nd-mode]');
    if (m && m.dataset.ndMode !== D.mode && !D.busy) {
      D.mode = m.dataset.ndMode;
      try { localStorage.setItem(MODE, D.mode); } catch (_) {}
      D.state = null; D.result = null; D.error = ''; D.draft = '';
      paint(); load();
      return;
    }
    const b = e.target.closest('[data-nd]');
    if (!b) return;
    const a = b.dataset.nd;
    if (a === 'next') advance();
    else if (a === 'skip') answer({skip: true});
    else if (a === 'reload') load();
    else if (a === 'on' || a === 'off') {
      setOff(a === 'off'); D.host.classList.toggle('is-on', a === 'on'); paint(a === 'on');
      if (a === 'off') D.ctx?.layout?.scrollIntoView?.({block: 'nearest'});
    }
  }

  window.NumbersDrill = {mount, lessons: ['numbers']};
})();
