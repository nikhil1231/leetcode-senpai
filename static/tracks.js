// Learning tracks (Fundamentals, AI Engineering, Experience, Practical Coding): one shell, shared
// knowledge and mistakes views, a question widget, and the course views. experience.js and
// practical.js register their own views. Lessons reuse the system-design block renderer.
(function () {
  'use strict';
  const { $, api, escapeHtml: esc, toast } = window.H;
  const B = () => window.SDBlocks;
  const md = t => (B() ? B().md(t) : `<p>${esc(t)}</p>`);
  const inline = t => (B() ? B().inline(t) : esc(t));
  const KIND = { fundamentals: 'course', ai: 'course', experience: 'experience', practical: 'practical' };
  const TITLES = { fundamentals: 'Fundamentals', ai: 'AI Engineering', experience: 'Experience', practical: 'Practical Coding' };
  const NAV = {
    course: [['home', 'Overview', 'i-today'], ['lessons', 'Lessons', 'i-topics'], ['quickfire', 'Quickfire', 'i-drill'], ['mistakes', 'Mistakes book', 'i-insights']],
    experience: [['home', 'Overview', 'i-today'], ['stories', 'Story bank', 'i-playbook'], ['drill', 'Timed answers', 'i-drill'], ['dives', 'Deep dives', 'i-topics'], ['mistakes', 'Mistakes book', 'i-insights']],
    practical: [['home', 'Exercises', 'i-today'], ['mistakes', 'Mistakes book', 'i-insights']],
  };
  const TRACK_NAV = { ai: [NAV.course[0], ['round', 'AI round', 'i-playbook'], ...NAV.course.slice(1)] };
  // Extra prep for an interview round that lives in another section.
  const ROUND_LINKS = { workflow: [['experience', 'dives', 'Deep dives on your CV']] };
  const NOTES = { course: 'Read it once.<br>Recall it often.<br>Explain it simply.', experience: 'Specific.<br>Measured.<br>In the first person.', practical: 'Run the tests.<br>Change one thing.<br>Say what you see.' };
  const VIEW_TITLES = { home: 'Overview', lessons: 'Lessons', lesson: 'Lesson', quickfire: 'Quickfire', mistakes: 'Mistakes book', stories: 'Story bank', story: 'Story', drill: 'Timed answers', dives: 'Deep dives', dive: 'Deep dive', claim: 'CV deep dive', exercise: 'Exercise', round: 'AI-assisted round' };
  const ACTIVE = { lesson: 'lessons', story: 'stories', dive: 'dives', claim: 'dives', exercise: 'home' };
  const registry = { course: {} };
  let current = { track: null, view: 'home', arg: null, seq: 0 };
  const cleanups = [];

  const btn = (label, action, attrs = '', primary = false) => `<button type="button" class="button ${primary ? 'is-primary' : ''}" data-t="${action}" ${attrs}>${label}</button>`;
  const when = t => (t ? new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
  const call = (path, method = 'GET', body) => api('/tracks/' + current.track + path, method, body);

  function go(view) { window.AppSections.select(current.track, view); }

  function nav(track) {
    const el = $('#track-nav'); if (!el) return;
    const kind = KIND[track];
    el.innerHTML = `<span class="design-nav-label">${esc(TITLES[track].toUpperCase())}</span>` +
      (TRACK_NAV[track] || NAV[kind]).map(([v, label, icon]) => `<button type="button" data-track-view="${v}"><svg class="nav-icon" viewBox="0 0 24 24"><use href="#${icon}"/></svg>${label}</button>`).join('') +
      `<div class="design-nav-note">${NOTES[kind]}</div>`;
    el.querySelectorAll('[data-track-view]').forEach(n => n.addEventListener('click', () => window.AppSections.select(track, n.dataset.trackView)));
  }
  function markNav(view) {
    document.querySelectorAll('#track-nav [data-track-view]').forEach(n => {
      const on = n.dataset.trackView === (current.track === 'ai' && view === 'exercise' ? 'round' : ACTIVE[view] || view);
      n.classList.toggle('is-active', on);
      if (on) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
  }

  async function open(track, route = 'home') {
    const [view, ...rest] = String(route || 'home').split('/');
    const seq = ++current.seq;
    while (cleanups.length) { try { cleanups.pop()(); } catch (e) { /* ignore */ } }
    if (current.track !== track || !document.querySelector('#track-nav [data-track-view]')) nav(track);
    current = { track, view, arg: rest.join('/') || null, seq };
    markNav(view);
    $('#page-title').textContent = VIEW_TITLES[view] || TITLES[track];
    $('#page-sub').textContent = TITLES[track];
    // A fresh container per view, so listeners from the previous view can't fire.
    const host = $('#tab-track'), root = document.createElement('div');
    root.className = 'tr-view'; root.innerHTML = '<div class="tr-loading">Loading…</div>';
    host.replaceChildren(root);
    const views = registry[KIND[track]] || {};
    const render = views[view] || views.home;
    try {
      const bound = (path, method = 'GET', body) => api('/tracks/' + track + path, method, body);
      await render({ track, view, arg: current.arg, root, call: bound, go: v => window.AppSections.select(track, v), stale: () => seq !== current.seq, onLeave: fn => cleanups.push(fn) });
    } catch (e) {
      if (seq === current.seq) root.innerHTML = `<div class="sd-panel"><p class="tr-error">${esc(e.message || 'Something went wrong')}</p>${btn('Back to the overview', 'home')}</div>`;
      root.querySelector('[data-t=home]')?.addEventListener('click', () => go('home'));
    }
    window.scrollTo?.(0, 0);
  }

  // ---------- shared pieces ----------
  function sparkline(points, w = 260, h = 54) {
    if (!points || points.length < 2) return '';
    const max = Math.max(1, ...points.map(p => p.value));
    const xy = points.map((p, i) => [i * w / (points.length - 1), h - 4 - (h - 8) * p.value / max]);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    return `<svg class="sd-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Knowledge over the last ${points.length} days"><path class="sd-spark-area" d="${line}L${w},${h}L0,${h}Z"/><path class="sd-spark-line" d="${line}"/></svg>`;
  }
  const STATUS = [['solid', 'Solid'], ['learning', 'Learning'], ['fading', 'Fading'], ['shaky', 'Shaky'], ['unseen', 'Unseen']];
  function knowledgeHtml(d, noun = "things you'd get right today") {
    const h = d.history || [], week = h.length > 7 ? h[h.length - 8].value : 0;
    const delta = Math.round((d.knowledge - week) * 10) / 10;
    return `<section class="sd-knowledge"><div class="sd-knowledge-main"><span class="sd-eyebrow">WHAT YOU HOLD RIGHT NOW</span>
      <div class="sd-knowledge-number"><strong>${Math.round(d.knowledge)}</strong><span>of ${d.total} ${esc(noun)}</span></div>
      <p class="sd-muted">${delta >= 0 ? '+' : ''}${delta} this week · it rises as you practise and slowly fades when you don't.</p>
      <div class="sd-status-chips">${STATUS.map(([k, label]) => `<span class="sd-chip is-${k}"><i></i>${label} <b>${(d.counts || {})[k] || 0}</b></span>`).join('')}</div></div>
      <div class="sd-knowledge-chart">${sparkline(h)}<div class="sd-spark-axis"><span>${h.length} days ago</span><span>now</span></div></div></section>`;
  }
  function mistakesHtml(d, action) {
    const row = v => `<li class="tr-mistake"><div><span class="sd-eyebrow">${esc(v.topic_title || '')} · ${esc(v.kind)}</span><p>${inline(v.label)}</p></div>${action(v)}</li>`;
    const fix = d.mistakes.fix, confirm = d.mistakes.confirm;
    if (!fix.length && !confirm.length) return `<section class="sd-panel"><h3>Nothing to fix</h3><p class="sd-muted">Anything you get wrong lands here, and stays until you get it right on a later day.</p></section>`;
    return `${fix.length ? `<section class="sd-panel"><h3>To fix <span class="tr-count">${fix.length}</span></h3><p class="sd-muted">Your latest answer was wrong.</p><ul class="tr-list">${fix.map(row).join('')}</ul></section>` : ''}
      ${confirm.length ? `<section class="sd-panel"><h3>To confirm <span class="tr-count">${confirm.length}</span></h3><p class="sd-muted">Fixed on the day you missed it. Get it right again on a later day to clear it.</p><ul class="tr-list">${confirm.map(row).join('')}</ul></section>` : ''}`;
  }
  function wireActions(root, handlers) {
    root.addEventListener('click', async e => {
      const node = e.target.closest('[data-t]');
      if (!node || !root.contains(node) || node.disabled) return;
      const fn = handlers[node.dataset.t];
      if (!fn) return;
      e.preventDefault();
      try { await fn(node, e); } catch (err) { toast?.(err.message || 'Something went wrong', 'error'); }
    });
  }

  // ---------- question widget ----------
  // render(q) -> html; collect(root) -> answer string; feedback(res, q) -> html
  function questionHtml(q, n, total) {
    const head = `<div class="tr-q-head"><span class="sd-eyebrow">${n ? `QUESTION ${n}${total ? ' OF ' + total : ''}` : 'QUESTION'}</span></div><div class="sd-prompt">${md(q.prompt)}</div>`;
    let body;
    if (q.format === 'numeric') body = `<label class="tr-numeric"><input class="input" type="text" inputmode="decimal" data-q-num placeholder="Your answer"> <span>${esc(q.unit || '')}</span></label>`;
    else if (q.format === 'order') body = `<p class="sd-muted">Click the items in the right order.</p><ol class="tr-order-picked" data-q-picked></ol><div data-q-pool>${q.choices.map(c => `<button type="button" class="sd-option" data-q-order="${c.id}"><span>${inline(c.text)}</span></button>`).join('')}</div><button type="button" class="button is-sm" data-q-reset>Reset order</button>`;
    else body = `${q.format === 'multi' ? '<p class="sd-muted">Select all that apply.</p>' : ''}${q.choices.map((c, i) => `<button type="button" class="sd-option" data-q-choice="${c.id}" aria-pressed="false"><span class="sd-option-key">${i + 1}</span><span>${inline(c.text)}</span></button>`).join('')}`;
    return `<div class="tr-question" data-qid="${esc(q.id)}">${head}${body}<div class="sd-actions">${btn('Check', 'q-check', '', true)}${btn("I don't know", 'q-reveal')}<label class="tr-guess"><input type="checkbox" data-q-guess> I'm guessing</label></div><div class="tr-q-result" hidden></div></div>`;
  }
  function wireQuestion(root, q, onAnswered, source) {
    const el = root.querySelector('.tr-question'); if (!el) return;
    const picked = [];
    const started = Date.now();
    el.querySelectorAll('[data-q-choice]').forEach(n => n.addEventListener('click', () => {
      if (el.dataset.done) return;
      if (q.format === 'multi') { const on = n.getAttribute('aria-pressed') !== 'true'; n.setAttribute('aria-pressed', String(on)); n.classList.toggle('is-picked', on); }
      else { el.querySelectorAll('[data-q-choice]').forEach(m => { m.setAttribute('aria-pressed', 'false'); m.classList.remove('is-picked'); }); n.setAttribute('aria-pressed', 'true'); n.classList.add('is-picked'); }
    }));
    const pickedList = el.querySelector('[data-q-picked]');
    el.querySelectorAll('[data-q-order]').forEach(n => n.addEventListener('click', () => {
      if (el.dataset.done || picked.includes(n.dataset.qOrder)) return;
      picked.push(n.dataset.qOrder); n.disabled = true; n.classList.add('is-picked');
      pickedList.insertAdjacentHTML('beforeend', `<li>${n.querySelector('span').innerHTML}</li>`);
    }));
    el.querySelector('[data-q-reset]')?.addEventListener('click', () => { if (el.dataset.done) return; picked.length = 0; pickedList.innerHTML = ''; el.querySelectorAll('[data-q-order]').forEach(n => { n.disabled = false; n.classList.remove('is-picked'); }); });
    const collect = () => {
      if (q.format === 'numeric') return el.querySelector('[data-q-num]').value.trim();
      if (q.format === 'order') return picked.join(',');
      return [...el.querySelectorAll('[data-q-choice][aria-pressed=true]')].map(n => n.dataset.qChoice).join(',');
    };
    async function submit(reveal) {
      const answer = reveal ? '' : collect();
      if (!reveal && !answer) { toast?.('Choose an answer first'); return; }
      el.querySelectorAll('.sd-actions button').forEach(b => { b.disabled = true; });
      let res;
      try {
        res = await call('/answer', 'POST', { question_id: q.id, answer, reveal, guessed: el.querySelector('[data-q-guess]').checked, source, elapsed_sec: Math.round((Date.now() - started) / 1000) });
      } catch (e) { el.querySelectorAll('.sd-actions button').forEach(b => { b.disabled = false; }); throw e; }
      el.dataset.done = '1';
      const rightIds = new Set(res.correct_answer.ids || (res.correct_answer.id ? [res.correct_answer.id] : []));
      el.querySelectorAll('[data-q-choice]').forEach(n => { n.disabled = true; if (rightIds.has(n.dataset.qChoice)) n.classList.add('is-right'); else if (n.getAttribute('aria-pressed') === 'true') n.classList.add('is-wrong'); });
      const whys = answer.split(',').filter(id => res.whys?.[id] && !rightIds.has(id)).map(id => `<p class="tr-why"><b>Why not:</b> ${inline(res.whys[id])}</p>`).join('');
      const box = el.querySelector('.tr-q-result'); box.hidden = false;
      box.innerHTML = `<p>${res.correct ? '<b class="sd-ok">Correct.</b>' : `<b class="sd-bad">${reveal ? 'Here is the answer.' : 'Not quite.'}</b> The answer: <b>${inline(res.correct_answer.text)}</b>`}</p>${whys}<div class="tr-explain">${md(res.explanation)}</div>`;
      onAnswered?.(res);
    }
    el.querySelector('[data-t=q-check]').addEventListener('click', e => { e.stopPropagation(); submit(false).catch(err => toast?.(err.message, 'error')); });
    el.querySelector('[data-t=q-reveal]').addEventListener('click', e => { e.stopPropagation(); submit(true).catch(err => toast?.(err.message, 'error')); });
    el.querySelector('[data-q-num]')?.addEventListener('keydown', e => { if (e.key === 'Enter') submit(false).catch(err => toast?.(err.message, 'error')); });
  }

  // ---------- course views ----------
  const C = registry.course;
  const studyCat = (track, c) => (window.StudyPrompt?.button({ section: track, category: c.id }, c.title) || '');
  function lessonCard(l) {
    const state = l.checked ? 'Checked ✓' : l.opened ? `${l.activities_done}/${l.interactive} activities` : 'Not started';
    return `<button type="button" class="sd-lesson-card tr-lesson-card ${l.checked ? 'is-done' : ''}" data-t="lesson" data-id="${l.id}"><span class="sd-eyebrow">${l.minutes} MIN · ${l.held}/${l.items} HELD</span><h3>${esc(l.title)}</h3><p class="tr-card-sum">${esc(l.summary.split('. ')[0])}.</p><span><span>${state}</span><span>Open →</span></span></button>`;
  }
  const shortTitle = t => { const s = t.replace(/^AI pair round: /, ''); return s[0].toUpperCase() + s.slice(1); };
  const ROUND_STATUS = { solid: 'is-held', learning: 'is-held', shaky: 'is-shaky', fading: 'is-fading' };
  function loopHtml(rounds) {
    if (!rounds?.length) return '';
    return `<section class="tr-cat tr-loop"><div class="tr-cat-head"><h3>Your interview loop</h3><p class="sd-muted">The rounds of a typical AI engineering loop, and how much of each you hold right now.</p></div>
      <ol class="tr-rounds">${rounds.map(r => `<li class="tr-round"><div class="tr-round-main"><b>${esc(r.title)}</b><p class="sd-muted">${esc(r.blurb)}</p>
        <div class="tr-round-links">${r.id === 'assisted' ? `<button type="button" class="tr-chip is-lead" data-t="go" data-view="round">Playbook →</button>` : ''}${r.lessons.map(l => `<button type="button" class="tr-chip ${l.checked ? 'is-held' : ''}" data-t="lesson" data-id="${l.id}" title="${l.held}/${l.items} held">${l.checked ? '✓ ' : ''}${esc(l.title.split(' - ')[0].replace(/^AI system design: /, 'Design: '))}</button>`).join('')}${r.exercises.map(e => `<button type="button" class="tr-chip is-ex ${ROUND_STATUS[e.status] || ''}" data-t="exercise" data-id="${e.id}">▶ ${esc(shortTitle(e.title))}</button>`).join('')}${(ROUND_LINKS[r.id] || []).map(([s, v, label]) => `<button type="button" class="tr-chip is-ex" data-t="section" data-section="${s}" data-view="${v}">↗ ${esc(label)}</button>`).join('')}</div></div>
        <div class="tr-round-meter"><span class="tr-round-pct">${r.pct}%</span><div class="sd-course-bar"><span style="width:${r.pct}%"></span></div><small>${r.held} of ${r.items} held</small></div></li>`).join('')}</ol></section>`;
  }
  C.home = async ctx => {
    const d = await ctx.call('');
    if (ctx.stale()) return;
    const next = d.next_lesson;
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">${esc(d.track.title.toUpperCase())}</span><h2>${esc(d.track.blurb)}</h2></div>
      ${knowledgeHtml(d)}
      <div class="tr-next-grid">
        <section class="sd-panel tr-next"><span class="sd-eyebrow">KEEP IT</span><h3>${d.due ? `${d.due} fading item${d.due === 1 ? '' : 's'} due` : d.answers ? 'Nothing due' : 'Quickfire'}</h3><p class="sd-muted">${d.due ? 'Answer them before they slip. Mistakes come first, then fading items, then new questions from lessons you have opened.' : 'Short questions, mistakes first. A good five-minute warm-up.'}</p>${btn('Start Quickfire', 'go', 'data-view="quickfire"', !!d.due)}</section>
        <section class="sd-panel tr-next"><span class="sd-eyebrow">LEARN</span><h3>${next ? esc(next.title) : 'Every lesson checked'}</h3><p class="sd-muted">${next ? `${next.minutes} minutes · ${next.interactive} activities, then a short check.` : 'Keep the knowledge alive with Quickfire and the mistakes book.'}</p>${next ? btn(next.opened ? 'Continue lesson' : 'Start lesson', 'lesson', `data-id="${next.id}"`, !d.due) : ''}</section>
        <section class="sd-panel tr-next"><span class="sd-eyebrow">FIX</span><h3>${d.mistakes.fix.length} to fix · ${d.mistakes.confirm.length} to confirm</h3><p class="sd-muted">Wrong answers wait here until you get them right on a later day.</p>${btn('Open the mistakes book', 'go', 'data-view="mistakes"')}</section>
      </div>
      ${loopHtml(d.rounds)}
      ${d.course.map(c => `<section class="tr-cat"><div class="tr-cat-head"><h3>${esc(c.title)}${studyCat(ctx.track, c)}</h3><p class="sd-muted">${esc(c.blurb)}</p></div><div class="sd-lesson-grid">${c.lessons.map(lessonCard).join('')}</div></section>`).join('')}`;
    wireActions(ctx.root, { go: n => ctx.go(n.dataset.view), lesson: n => ctx.go('lesson/' + n.dataset.id), exercise: n => ctx.go('exercise/' + n.dataset.id),
      section: n => window.AppSections.select(n.dataset.section, n.dataset.view) });
  };
  C.lessons = async ctx => {
    const d = await ctx.call('');
    if (ctx.stale()) return;
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">${d.course.reduce((n, c) => n + c.lessons.length, 0)} LESSONS</span><h2>${esc(d.track.title)} lessons</h2><p>Each lesson mixes reading with interactive activities, then a short check. Your first try on each activity counts toward what you hold.</p></div>
      ${d.course.map(c => `<section class="tr-cat"><div class="tr-cat-head"><h3>${esc(c.title)}${studyCat(ctx.track, c)}</h3><p class="sd-muted">${esc(c.blurb)}</p></div><div class="sd-lesson-grid">${c.lessons.map(lessonCard).join('')}</div></section>`).join('')}`;
    wireActions(ctx.root, { lesson: n => ctx.go('lesson/' + n.dataset.id) });
  };
  C.lesson = async ctx => {
    const [lesson, overview] = await Promise.all([ctx.call('/lessons/' + ctx.arg), ctx.call('')]);
    if (ctx.stale()) return;
    const flat = overview.course.flatMap(c => c.lessons.map(l => ({ ...l, cat: c.title })));
    const idx = flat.findIndex(l => l.id === lesson.id), next = flat[idx + 1];
    let done = Object.values(lesson.state.activities || {}).filter(a => a.done).length;
    const checks = lesson.checks;
    ctx.root.innerHTML = `<div class="sd-breadcrumb">${btn('← Lessons', 'go', 'data-view="lessons"')}<span>/ ${esc(flat[idx]?.cat || '')}</span></div>
      <div class="sd-page-intro sd-rich-intro"><span class="sd-eyebrow">LESSON ${idx + 1} OF ${flat.length} · ${lesson.minutes} MIN · ${lesson.interactive} ACTIVITIES</span><h2 tabindex="-1">${esc(lesson.title)}</h2><p>${inline(lesson.summary)}</p></div><div class="tr-tutor-slot"></div>
      <div class="sd-rich-layout"><article class="sd-rich"><div class="sd-goals"><b>By the end you can</b><ul>${lesson.objectives.map(o => `<li>${inline(o)}</li>`).join('')}</ul></div>
        <div class="tr-blocks"></div>
        <section class="sd-panel tr-check"><span class="sd-eyebrow">LESSON CHECK · ${checks.length} QUESTIONS</span><h3>Check what stuck</h3><p class="sd-muted">Answer without scrolling back. These come back in Quickfire as they fade.</p><div class="tr-check-slot">${btn('Start the check', 'check-start', '', true)}</div></section>
        <footer class="sd-lesson-foot"><details><summary>Further reading</summary><ul>${lesson.sources.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join('')}</ul></details>
        <div class="sd-actions">${next ? btn('Next lesson: ' + esc(next.title) + ' →', 'lesson', `data-id="${next.id}"`) : btn('Back to the overview', 'go', 'data-view="home"')}</div></footer></article>
      <aside class="sd-rich-rail"><div class="sd-rail-card"><span class="sd-eyebrow">PROGRESS</span><div class="sd-rail-progress"><b class="tr-done">${done}</b>/<span>${lesson.interactive}</span> activities</div><div class="sd-course-bar"><span class="tr-bar" style="width:${lesson.interactive ? 100 * done / lesson.interactive : 0}%"></span></div><p class="sd-muted">Your first try on each activity is what counts.</p>
        <ul class="tr-outline">${(B()?.outline(lesson) || []).map(h => `<li>${esc(h)}</li>`).join('')}</ul></div></aside></div>`;
    const slot = ctx.root.querySelector('.tr-blocks');
    if (B()) {
      slot.innerHTML = B().render(lesson);
      const handle = B().wire(slot, lesson, {
        saved: lesson.state.activities || {},
        recall: (block, text) => ctx.call(`/lessons/${lesson.id}/recall`, 'POST', { block: block.key, text }),
        done(key, correct) {
          ctx.call(`/lessons/${lesson.id}/activity`, 'POST', { block: key, correct }).then(s => {
            if (ctx.stale()) return;
            done = Object.values(s.activities || {}).filter(a => a.done).length;
            ctx.root.querySelector('.tr-done').textContent = done;
            ctx.root.querySelector('.tr-bar').style.width = (100 * done / (lesson.interactive || 1)) + '%';
          }).catch(e => toast?.(e.message, 'error'));
        },
      });
      ctx.onLeave(() => handle.destroy());
      window.Tutor?.mount(ctx.root.querySelector('.tr-tutor-slot'), {
        section: ctx.track, lesson, layout: ctx.root.querySelector('.sd-rich-layout'),
        recall: (block, text) => ctx.call(`/lessons/${lesson.id}/recall`, 'POST', { block: block.key, text }),
        done: (key, correct) => ctx.call(`/lessons/${lesson.id}/activity`, 'POST', { block: key, correct }).catch(() => {}),
      });
    } else slot.innerHTML = '<p class="tr-error">The lesson renderer did not load. Reload the page.</p>';
    let n = 0, right = 0;
    const checkSlot = ctx.root.querySelector('.tr-check-slot');
    function showCheck() {
      if (n >= checks.length) {
        checkSlot.innerHTML = `<p><b>${right} of ${checks.length}</b> right first time.</p><p class="sd-muted">${right === checks.length ? 'Solid. Quickfire will bring these back as they fade.' : 'The misses are in your mistakes book. Quickfire asks them first.'}</p>`;
        ctx.call(`/lessons/${lesson.id}/checked`, 'POST', {}).catch(() => {});
        return;
      }
      checkSlot.innerHTML = questionHtml(checks[n], n + 1, checks.length);
      wireQuestion(checkSlot, checks[n], res => {
        if (res.correct) right++;
        checkSlot.querySelector('.tr-q-result').insertAdjacentHTML('beforeend', `<div class="sd-actions">${btn(n + 1 < checks.length ? 'Next question' : 'Finish', 'check-next', '', true)}</div>`);
      }, 'check');
    }
    wireActions(ctx.root, {
      go: node => ctx.go(node.dataset.view), lesson: node => ctx.go('lesson/' + node.dataset.id),
      'check-start': () => showCheck(), 'check-next': () => { n++; showCheck(); },
    });
  };
  C.quickfire = async ctx => {
    const ROUND = 10;
    const seen = [];
    let right = 0;
    const d = await ctx.call('');
    if (ctx.stale()) return;
    const titles = Object.fromEntries(d.course.flatMap(c => c.lessons.map(l => [l.id, l.title.split(' - ')[0]])));
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">QUICKFIRE · ${ROUND} QUESTIONS</span><h2>Retrieval practice</h2><p>Mistakes first, then fading items, then new questions from lessons you have opened. ${d.due ? `<b>${d.due}</b> due now.` : ''}</p></div><section class="sd-panel tr-fire"><div class="tr-fire-slot"></div></section>`;
    const slot = ctx.root.querySelector('.tr-fire-slot');
    async function next() {
      if (seen.length >= ROUND) {
        slot.innerHTML = `<h3>${right} of ${seen.length} right</h3><p class="sd-muted">Answers you missed are in the mistakes book and come back first next time.</p><div class="sd-actions">${btn('Another round', 'again', '', true)}${btn('Mistakes book', 'go', 'data-view="mistakes"')}${btn('Overview', 'go', 'data-view="home"')}</div>`;
        return;
      }
      const res = await ctx.call('/quickfire/next', 'POST', { exclude: seen });
      if (ctx.stale()) return;
      if (!res.question) { slot.innerHTML = `<p>No more questions this round.</p>${btn('Overview', 'go', 'data-view="home"')}`; return; }
      seen.push(res.question.id);
      slot.innerHTML = `<p class="sd-muted tr-fire-meta">${esc(titles[res.question.lesson_id] || res.question.lesson_id.replace(/-/g, ' '))}</p>` + questionHtml(res.question, seen.length, ROUND);
      wireQuestion(slot, res.question, r => {
        if (r.correct) right++;
        slot.querySelector('.tr-q-result').insertAdjacentHTML('beforeend', `<div class="sd-actions">${btn('Next →', 'next', '', true)}</div>`);
        slot.querySelector('[data-t=next]')?.focus();
      }, 'quickfire');
    }
    wireActions(ctx.root, { next, again: () => { seen.length = 0; right = 0; return next(); }, go: n => ctx.go(n.dataset.view) });
    await next();
  };
  C.mistakes = async ctx => {
    const d = await ctx.call('');
    if (ctx.stale()) return;
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">MISTAKES BOOK</span><h2>What to fix</h2><p>Quickfire asks these first. To clear an item, get it right on a later day than you missed it.</p></div>
      ${mistakesHtml(d, v => btn('Open lesson', 'lesson', `data-id="${v.topic}"`))}<div class="sd-actions">${btn('Practise them in Quickfire', 'go', 'data-view="quickfire"', true)}</div>`;
    wireActions(ctx.root, { lesson: n => ctx.go('lesson/' + n.dataset.id), go: n => ctx.go(n.dataset.view) });
  };

  window.Tracks = {
    open, register(kind, views) { registry[kind] = { ...(registry[kind] || {}), ...views }; },
    md, inline, esc, btn, when, knowledgeHtml, mistakesHtml, wireActions, call: (path, method, body) => call(path, method, body),
    current: () => ({ ...current }), shortTitle,
  };
})();
