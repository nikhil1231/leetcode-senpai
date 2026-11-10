// An area overview (#/system-design/map/<area>): pass one of the layered course. An authored overview
// (server/tutor/overviews.py) is a short guided tour, one step per lesson, every step the same shape: the
// problem, the usual answer, the catch, one thing to remember, then a check or something to try, and what
// the full lesson adds. The step you're on is saved; finishing a step counts its ideas as seen, finishing
// the tour counts the area as done. The tutor is an icon by the title and teaches from the same steps.
// Activities are the lessons' own blocks; answers land on the lesson they came from.
// Areas without an authored overview keep the older page: the lessons, then what puts them to work.
(function () {
  'use strict';
  const {api, escapeHtml: esc} = window.H;
  const B = () => window.SDBlocks;
  const LAYER = {1: 'Overview', 2: 'Interview-ready', 3: 'Depth'};
  let M = null, area = '', error = '', step = 0, answers = {}, wired = null, observer = null;

  async function open(id) {
    area = id; error = '';
    try {
      M = await api('/tutor/map/' + encodeURIComponent(id));
      step = Math.min(M.step || 0, (M.lesson.overview?.steps.length || 0) + 1);
      answers = {...(M.answers || {})};
    } catch (e) { M = null; error = e.message; }
  }

  // One ring per layer (overview, interview-ready, depth): the dim arc is covered (tested or taught), the solid arc
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
  // The pass you're on is the first layer with ideas still to cover. `action` (an HTML link) goes in the first step.
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

  const md = t => B().md(String(t || '').trim());
  const back = '<div class="sd-breadcrumb"><a class="button" href="#/system-design/curriculum">← The course</a></div>';
  const lessonTitle = id => M.lessons.find(x => x.id === id)?.title || id;

  // ---------- The guided overview ----------
  function stepBar(ov) {
    const n = ov.steps.length, names = ['Start', ...ov.steps.map(s => s.title), 'Wrap-up'];
    return `<nav class="ov-bar" aria-label="Overview steps"><ol>${names.map((name, i) => {
      const cls = i === step ? 'is-now' : i < step ? 'is-done' : '';
      const label = i === 0 || i === n + 1 ? name : `${i}`;
      return `<li class="${cls}"><button type="button" data-ov-go="${i}" title="${esc(name)}" aria-label="${esc(i === 0 || i === n + 1 ? name : `Step ${i}: ${name}`)}"${i === step ? ' aria-current="step"' : ''}>${esc(label)}</button></li>`;
    }).join('')}</ol>${step >= 1 && step <= n ? `<span class="ov-bar-label">Step ${step} of ${n}</span>` : ''}</nav>`;
  }

  function part(label, text, cls = '') {
    return `<section class="ov-part ${cls}"><h4 class="ov-label">${esc(label)}</h4><div class="sd-md">${md(text)}</div></section>`;
  }

  function startHtml(ov) {
    const pic = ov.picture && M.lesson.blocks.find(b => b.key === ov.picture);
    return `<div class="sd-md ov-intro">${md(ov.intro)}</div>
      <ol class="ov-agenda">${ov.steps.map((s, i) => `<li><button type="button" class="ov-agenda-item" data-ov-go="${i + 1}"><b>${esc(s.title)}</b><small>${esc(lessonTitle(s.lesson))} · ${s.minutes} min</small></button></li>`).join('')}</ol>
      ${pic ? `<h3 class="ov-h">The big picture</h3>${B().renderBlock(pic)}<div class="sd-md ov-picture-note">${md(ov.picture_note)}</div>` : ''}`;
  }

  function stepHtml(s) {
    const act = s.use || s.check, b = act && M.lesson.blocks.find(x => x.key === act);
    return `<header class="ov-step-head"><span class="sd-eyebrow">STEP ${step} OF ${M.lesson.overview.steps.length} · ABOUT ${s.minutes} MIN</span>
        <h3>${esc(s.title)}</h3></header>
      ${part('The problem', s.problem)}
      ${part('The usual answer', s.answer)}
      ${part('The catch', s.catch)}
      ${part('Worth remembering', s.remember, 'is-remember')}
      ${b ? `<section class="ov-part ov-try"><h4 class="ov-label">${s.use ? 'Try it' : 'Quick check'}</h4>${s.use_note ? `<p class="sd-muted ov-note">${esc(s.use_note)}</p>` : ''}${B().renderBlock(b)}</section>` : ''}
      <details class="ov-later"><summary>Saved for the full lesson</summary><ul>${s.later.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <a href="#/system-design/lesson/${esc(s.lesson)}">${esc(lessonTitle(s.lesson))} →</a></details>`;
  }

  function finishHtml(ov) {
    const play = (ov.finish.play || []).map(k => M.resources.find(r => r.key === k)).filter(Boolean);
    return `<header class="ov-step-head"><span class="sd-eyebrow">WRAP-UP</span><h3>The area on one page</h3></header>
      <div class="sd-scroll"><table class="sd-md-table ov-recap"><thead><tr><th>Topic</th><th>The short version</th></tr></thead><tbody>
        ${ov.steps.map((s, i) => `<tr><td><button type="button" class="ov-link" data-ov-go="${i + 1}">${esc(s.title)}</button></td><td>${esc(s.recap)}</td></tr>`).join('')}</tbody></table></div>
      ${ov.finish.text ? `<div class="sd-md">${md(ov.finish.text)}</div>` : ''}
      ${play.length ? `<h4 class="ov-label">Use it in a whole system</h4><div class="sd-map-grid">${play.map(resourceRow).join('')}</div>` : ''}`;
  }

  function pager(ov) {
    const n = ov.steps.length;
    const prev = step > 0 ? `<button type="button" class="button" data-ov-go="${step - 1}">← Back</button>` : '<span></span>';
    const next = step === 0 ? 'Start the tour →' : step < n ? `Next: ${ov.steps[step].title} →` : step === n ? 'Next: wrap-up →' : '';
    const last = M.mapped ? '<a class="button is-primary" data-primary="1" href="#/system-design/curriculum">Back to the course →</a>'
      : '<button type="button" class="button is-primary" data-primary="1" data-ov-finish>Finish the overview ✓</button>';
    return `<div class="ov-pager">${prev}${step > n ? last : `<button type="button" class="button is-primary" data-primary="1" data-ov-go="${step + 1}">${esc(next)}</button>`}</div>`;
  }

  function overviewHtml() {
    const l = M.lesson, ov = l.overview, n = ov.steps.length;
    const body = step === 0 ? startHtml(ov) : step > n ? finishHtml(ov) : stepHtml(ov.steps[step - 1]);
    return `${back}
      <div class="sd-page-intro sd-rich-intro ov-intro-head"><span class="sd-eyebrow">PASS ONE · OVERVIEW${M.mapped ? ' · DONE ✓' : ''}</span>
        <h2 id="sd-heading" tabindex="-1">${esc(ov.title)}</h2>
        <p>${n} topics, about ${ov.minutes} minutes. What each one is for, the usual answer and its catch.</p></div>
      <div id="sd-map-tutor"></div>
      <div class="sd-map-body ov">${stepBar(ov)}<article class="sd-panel ov-card" aria-live="polite">${body}${pager(ov)}</article></div>`;
  }

  // ---------- The older page, for areas without an authored overview ----------
  function listHtml() {
    const l = M.lesson, use = M.resources.filter(r => r.layer <= 2 && r.kind !== 'internals');
    return `${back}
      <div class="sd-page-intro"><span class="sd-eyebrow">PASS ONE · OVERVIEW${M.mapped ? ' · DONE ✓' : ''}</span><h2 id="sd-heading" tabindex="-1">${esc(l.title.replace(/^Overview: /, ''))}</h2>
        <p>${esc(l.summary)} One sitting with the tutor covers every piece at overview depth: what it is for, the usual answer and its catch. The rest waits for the full lessons.</p></div>
      <div id="sd-map-tutor"></div>
      <div class="sd-map-body">
        <section class="sd-panel"><h3>The lessons in this area</h3>
          <ol class="sd-map-lessons">${M.lessons.map(x => `<li><a href="#/system-design/lesson/${esc(x.id)}">${esc(x.title)}</a></li>`).join('')}</ol></section>
        ${use.length ? `<section class="sd-panel"><h3>Put it to work</h3><p class="sd-muted">Use the pieces in a whole system. No internals needed.</p><div class="sd-map-grid">${use.map(resourceRow).join('')}</div></section>` : ''}
      </div>`;
  }

  function render() {
    if (error) return `<div class="sd-error">${esc(error)}</div>`;
    if (!M) return '<p class="sd-muted">Loading the overview…</p>';
    return M.lesson.overview ? overviewHtml() : listHtml();
  }

  // Answers to a block borrowed from a lesson are recorded on that lesson, like answering it there.
  function done(key, correct) {
    const b = (M?.lesson.blocks || []).find(x => x.key === key);
    if (!b?.from || typeof correct !== 'boolean') return Promise.resolve();
    return api(`/system-design/course/lessons/${encodeURIComponent(b.from.lesson)}/activity`, 'POST', {block: b.from.key, correct});
  }

  const save = (body) => api(`/tutor/map/${encodeURIComponent(area)}/step`, 'POST', body).catch(e => console.warn('Could not save the overview step', e));

  // One filled button: the step's unanswered activity first, then the pager's next step.
  function oneNext(card) {
    if (!card) return;
    card.querySelectorAll('.button.is-primary').forEach(b => { b.dataset.primary = '1'; });
    const live = b => !b.disabled && !b.closest('[hidden]') && !b.closest('[data-block][data-answered]') && !b.closest('[data-block][data-done]');
    const pick = [...card.querySelectorAll('.ov-try .button[data-primary]')].find(live) || card.querySelector('.ov-pager .button[data-primary]');
    card.querySelectorAll('.button[data-primary]').forEach(b => { if (b.classList.contains('is-primary') !== (b === pick)) b.classList.toggle('is-primary', b === pick); });
  }

  function go(to, root) {
    const n = M.lesson.overview.steps.length, from = step;
    step = Math.max(0, Math.min(n + 1, to));
    save({step, finished: to === from + 1 && from >= 1 && from <= n ? from - 1 : -1});
    const host = root.querySelector('.sd-map-body.ov');
    if (!host) return;
    const t = document.createElement('div');
    t.innerHTML = overviewHtml();
    host.replaceWith(t.querySelector('.sd-map-body.ov'));
    wireOverview(root);
    root.querySelector('.ov-bar')?.scrollIntoView?.({block: 'start', behavior: 'smooth'});
  }

  function wireOverview(root) {
    wired?.destroy?.(); observer?.disconnect();
    const card = root.querySelector('.ov-card');
    if (!card) return;
    root.querySelectorAll('.sd-map-body.ov [data-ov-go]').forEach(n => n.addEventListener('click', () => go(+n.dataset.ovGo, root)));
    card.querySelector('[data-ov-finish]')?.addEventListener('click', async e => {
      e.target.disabled = true;
      const r = await save({step, done: true});
      if (r) {
        M.mapped = !!r.mapped;
        const eyebrow = root.querySelector('.ov-intro-head .sd-eyebrow');
        if (eyebrow && M.mapped) eyebrow.textContent = 'PASS ONE · OVERVIEW · DONE ✓';
        go(step, root);
      }
    });
    const saved = Object.fromEntries(Object.keys(answers).map(k => [k, {done: true}]));
    wired = B().wire(card, M.lesson, {saved, save() {}, done(key, correct) {
      Promise.resolve(done(key, correct)).catch(() => {});
      if (typeof correct === 'boolean') { answers[key] = correct; save({step, answers: {[key]: correct}}); }
    }});
    oneNext(card);
    observer = new MutationObserver(() => oneNext(card));
    observer.observe(card, {subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'data-done', 'data-answered']});
  }

  function wire(root) {
    const slot = root.querySelector('#sd-map-tutor');
    if (!slot || !M) return;
    if (M.lesson.overview) wireOverview(root);
    window.Tutor?.mount(slot, {section: 'system-design', lesson: M.lesson, layout: root.querySelector('.sd-map-body'), done});
  }

  function stop() { wired?.destroy?.(); wired = null; observer?.disconnect(); observer = null; }

  window.DesignMap = {open, render, wire, stop, route: () => 'map/' + area, rings, ladder};
})();
