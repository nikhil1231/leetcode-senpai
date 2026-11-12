// An area overview (#/system-design/map/<area>): pass one of the layered course. An authored overview
// (server/tutor/overviews.py) is a short guided tour, one step per lesson, every step the same shape: the
// problem, the usual answer, the catch, one thing to remember, then a check or something to try, and what
// the full lesson adds. The step you're on is saved; finishing a step counts its ideas as seen, finishing
// the tour counts the area as done. The tutor is an icon by the title and teaches from the same steps.
// Before the wrap-up, a check: a conversation with the tutor (mode "review") that brings up every step
// without showing a checklist. It needs the model; without it the step says so and the tour goes on.
// A step's number fills in once its check is answered correctly.
// Activities are the lessons' own blocks; answers land on the lesson they came from.
// Areas without an authored overview keep the older page: the lessons, then what puts them to work.
// The AI and fundamentals courses use the same page (#/<track>/map/<category>) for their authored overviews.
(function () {
  'use strict';
  const {api, escapeHtml: esc} = window.H;
  const B = () => window.SDBlocks;
  const LAYER = {1: 'Overview', 2: 'Interview-ready', 3: 'Depth'};
  let M = null, area = '', section = 'system-design', error = '', step = 0, answers = {}, wired = null, observer = null, review = null;
  const rid = () => 'k' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');

  const SD = () => section === 'system-design';
  const q = () => SD() ? '' : '?section=' + section;
  const home = () => SD() ? '#/system-design/curriculum' : `#/${section}/lessons`;
  const lessonHref = id => SD() ? `#/system-design/lesson/${esc(id)}` : `#/${section}/lesson/${esc(id)}`;

  async function open(id, sec = 'system-design') {
    area = id; section = sec; error = '';
    try {
      M = await api('/tutor/map/' + encodeURIComponent(id) + q());
      step = Math.min(M.step || 0, (M.lesson.overview?.steps.length || 0) + 2);
      answers = {...(M.answers || {})};
      review = {session: M.review || null, busy: false, error: ''};
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
  const back = () => `<div class="sd-breadcrumb"><a class="button" href="${home()}">← The course</a></div>`;
  const lessonTitle = id => M.lessons.find(x => x.id === id)?.title || id;

  // ---------- The guided overview ----------
  // A step's check (or activity) answered correctly on this page.
  const right = s => answers[s.check || s.use] === true;   // with both, the check decides
  function stepBar(ov) {
    const n = ov.steps.length, names = ['Start', ...ov.steps.map(s => s.title), 'Check', 'Wrap-up'];
    return `<nav class="ov-bar" aria-label="Overview steps"><ol>${names.map((name, i) => {
      const numbered = i >= 1 && i <= n, ok = numbered && right(ov.steps[i - 1]);
      const cls = [i === step ? 'is-now' : i < step ? 'is-done' : '', ok ? 'is-right' : ''].filter(Boolean).join(' ');
      const label = numbered ? `${i}` : name;
      return `<li class="${cls}"><button type="button" data-ov-go="${i}" title="${esc(name + (ok ? ': answered correctly' : ''))}" aria-label="${esc(numbered ? `Step ${i}: ${name}${ok ? ', answered correctly' : ''}` : name === 'Check' ? 'Check what you know' : name)}"${i === step ? ' aria-current="step"' : ''}>${esc(label)}</button></li>`;
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

  // A step can carry something to try (`use`), a check, or both: the activity comes first.
  function tryHtml(s) {
    const find = k => k && M.lesson.blocks.find(x => x.key === k);
    const use = find(s.use), check = find(s.check);
    return `${use ? `<section class="ov-part ov-try"><h4 class="ov-label">Try it</h4>${s.use_note ? `<p class="sd-muted ov-note">${esc(s.use_note)}</p>` : ''}${B().renderBlock(use)}</section>` : ''}
      ${check ? `<section class="ov-part ov-try"><h4 class="ov-label">Quick check</h4>${B().renderBlock(check)}</section>` : ''}`;
  }

  function stepHtml(s) {
    return `<header class="ov-step-head"><span class="sd-eyebrow">STEP ${step} OF ${M.lesson.overview.steps.length} · ABOUT ${s.minutes} MIN</span>
        <h3>${esc(s.title)}</h3></header>
      ${part('The problem', s.problem)}
      ${part('The usual answer', s.answer)}
      ${part('The catch', s.catch)}
      ${part('Worth remembering', s.remember, 'is-remember')}
      ${tryHtml(s)}
      <aside class="ov-later"><h4 class="ov-label">Covered in the full lesson</h4><ul>${s.later.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <a class="ov-later-link" href="${lessonHref(s.lesson)}">${esc(lessonTitle(s.lesson))} →</a></aside>`;
  }

  function finishHtml(ov) {
    const play = (ov.finish.play || []).map(k => M.resources.find(r => r.key === k)).filter(Boolean);
    const check = ov.finish.check && M.lesson.blocks.find(b => b.key === ov.finish.check);
    return `<header class="ov-step-head"><span class="sd-eyebrow">WRAP-UP</span><h3>The area on one page</h3></header>
      <div class="sd-scroll"><table class="sd-md-table ov-recap"><thead><tr><th>Topic</th><th>The short version</th></tr></thead><tbody>
        ${ov.steps.map((s, i) => `<tr><td><button type="button" class="ov-link" data-ov-go="${i + 1}">${esc(s.title)}</button></td><td>${esc(s.recap)}</td></tr>`).join('')}</tbody></table></div>
      ${check ? `<section class="ov-part ov-try"><h4 class="ov-label">One last check</h4>${B().renderBlock(check)}</section>` : ''}
      ${ov.finish.text ? `<div class="sd-md ov-part">${md(ov.finish.text)}</div>` : ''}
      ${play.length ? `<h4 class="ov-label">Use it in a whole system</h4><div class="sd-map-grid">${play.map(resourceRow).join('')}</div>` : ''}`;
  }

  // ---------- The check: a conversation with the tutor ----------
  // The conversation is the tutor's chat (src/features/tutor/TutorChat.tsx) in review mode; it streams the replies.
  function reviewInner() {
    const r = review ||= {session: M.review || null, busy: false, error: ''}, s = r.session;
    if (!s) return `<div class="ov-try"><button type="button" class="button is-primary" data-primary="1" data-ov-review="start">Start the check</button>
      ${r.error ? `<p class="tu-error">${esc(r.error)}</p>` : ''}</div>`;
    return `<div class="ov-chat"></div><p class="ov-review-again" hidden><button type="button" class="ov-link" data-ov-review="start">Start the check again</button></p>`;
  }
  function chatProps(root) {
    const r = review;
    return {session: r.session, cast: () => null, blocks: [], next: null, review: true, showStage() {}, onMove() {},
      onSession(s) { if (review !== r) return; r.session = s; r.chat?.update(chatProps(root)); againLink(root); },
      onAct(a) { if (a === 'again') reviewStart(root); }};
  }
  function againLink(root) {
    const n = root.querySelector('.ov-review-again'), s = review?.session;
    if (n) n.hidden = review.busy || !s?.turns.some(t => t.role === 'learner');
  }
  function reviewHtml() {
    return `<header class="ov-step-head"><span class="sd-eyebrow">CHECK WHAT YOU KNOW · ABOUT 10 MIN</span><h3>Talk it through with the tutor</h3></header>
      <p class="ov-review-lead">The tutor asks about what you've just read, one question at a time, until every step has come up. Answer in your own words. It's fine to say you don't know: you'll get the answer and carry on.</p>
      ${M.enabled ? `<section class="ov-review">${reviewInner()}</section>`
        : '<p class="sd-muted ov-review-off">The check is a conversation with the tutor, which needs the model, and it isn\'t connected right now. Go on to the wrap-up; its last check still works.</p>'}`;
  }

  function paintReview(root) {
    const box = root.querySelector('.ov-review');
    if (!box || !M?.enabled) return;
    review?.chat?.unmount();
    if (review) review.chat = null;
    box.innerHTML = reviewInner();
    box.querySelectorAll('[data-ov-review]').forEach(n => n.addEventListener('click', () => reviewStart(root)));
    const host = box.querySelector('.ov-chat'), card = root.querySelector('.ov-card');
    if (host) review.chat = window.SenpaiChat.tutor(host, chatProps(root));
    // Once the check has started, the conversation is the page: it fills the screen under the header.
    if (host && card) window.SenpaiChat.screen(card, M.lesson.overview.title, 'Check what you know');
    else if (card) window.SenpaiChat.leaveScreen(card);
    againLink(root);
  }

  async function reviewStart(root) {
    const r = review;
    r.busy = true; r.error = '';
    r.session = {id: null, status: 'active', turns: []};   // the chat shows the opening question as it streams
    paintReview(root);
    try {
      const s = await r.chat.start({section, lesson: M.lesson.id, mode: 'review', key: rid()});
      if (review !== r) return;
      r.session = s; r.busy = false;
    } catch (e) {
      if (review !== r) return;
      r.session = null; r.busy = false; r.error = e.message;
    }
    paintReview(root);
  }

  function pager(ov) {
    const n = ov.steps.length;
    const prev = step > 0 ? `<button type="button" class="button" data-ov-go="${step - 1}">← Back</button>` : '<span></span>';
    const next = step === 0 ? 'Start the tour →' : step < n ? `Next: ${ov.steps[step].title} →` : step === n ? 'Next: check what you know →'
      : step === n + 1 ? 'Next: wrap-up →' : '';
    const last = M.mapped ? `<a class="button is-primary" data-primary="1" href="${home()}">Back to the course →</a>`
      : '<button type="button" class="button is-primary" data-primary="1" data-ov-finish>Finish the overview ✓</button>';
    return `<div class="ov-pager">${prev}${step > n + 1 ? last : `<button type="button" class="button is-primary" data-primary="1" data-ov-go="${step + 1}">${esc(next)}</button>`}</div>`;
  }

  function overviewHtml() {
    const l = M.lesson, ov = l.overview, n = ov.steps.length;
    const body = step === 0 ? startHtml(ov) : step === n + 1 ? reviewHtml() : step > n ? finishHtml(ov) : stepHtml(ov.steps[step - 1]);
    return `${back()}
      <div class="sd-page-intro sd-rich-intro ov-intro-head"><span class="sd-eyebrow">${eyebrow()}</span>
        <h2 id="sd-heading" tabindex="-1">${esc(ov.title)}</h2>
        <p>${n === 1 ? 'One topic' : `${n} topics`}, about ${ov.minutes} minutes. What ${n === 1 ? 'it is' : 'each one is'} for, the usual answer and its catch.</p></div>
      <div id="sd-map-tutor"></div>
      <div class="sd-map-body ov">${stepBar(ov)}<article class="sd-panel ov-card" aria-live="polite">${body}${pager(ov)}</article></div>`;
  }

  const eyebrow = () => `${SD() ? 'PASS ONE · ' : ''}OVERVIEW${M.mapped ? ' · DONE ✓' : ''}`;

  // ---------- The older page, for areas without an authored overview ----------
  function listHtml() {
    const l = M.lesson, use = M.resources.filter(r => r.layer <= 2 && r.kind !== 'internals');
    return `${back()}
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
    const path = SD() ? `/system-design/course/lessons/${encodeURIComponent(b.from.lesson)}/activity` : `/tracks/${section}/lessons/${encodeURIComponent(b.from.lesson)}/activity`;
    return api(path, 'POST', {block: b.from.key, correct});
  }

  const save = (body) => api(`/tutor/map/${encodeURIComponent(area)}/step${q()}`, 'POST', body).catch(e => console.warn('Could not save the overview step', e));

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
    step = Math.max(0, Math.min(n + 2, to));
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
        if (eyebrow && M.mapped) eyebrow.textContent = `${SD() ? 'PASS ONE · ' : ''}OVERVIEW · DONE ✓`;
        go(step, root);
      }
    });
    const saved = Object.fromEntries(Object.keys(answers).map(k => [k, {done: true}]));
    wired = B().wire(card, M.lesson, {saved, save() {}, done(key, correct) {
      Promise.resolve(done(key, correct)).catch(() => {});
      if (typeof correct === 'boolean') {
        answers[key] = correct; save({step, answers: {[key]: correct}});
        const ov = M.lesson.overview, i = ov.steps.findIndex(s => s.check === key || s.use === key);
        if (i >= 0 && right(ov.steps[i])) root.querySelector(`.ov-bar [data-ov-go="${i + 1}"]`)?.closest('li')?.classList.add('is-right');
      }
    }});
    paintReview(root);
    oneNext(card);
    observer = new MutationObserver(() => oneNext(card));
    observer.observe(card, {subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'data-done', 'data-answered']});
  }

  function wire(root) {
    const slot = root.querySelector('#sd-map-tutor');
    if (!slot || !M) return;
    if (M.lesson.overview) wireOverview(root);
    window.Tutor?.mount(slot, {section, lesson: M.lesson, layout: root.querySelector('.sd-map-body'), done});
  }

  function stop() { wired?.destroy?.(); wired = null; observer?.disconnect(); observer = null; review?.chat?.unmount(); review = null; window.SenpaiChat?.leaveScreen(); }

  window.DesignMap = {open, render, wire, stop, route: () => 'map/' + area, rings, ladder};
})();
