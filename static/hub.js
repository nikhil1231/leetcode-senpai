// Home, Practise, Progress and placement for the knowledge-base sections (System Design,
// Fundamentals, AI Engineering). Home shows the one next step the tutor chose (/api/tutor/next);
// Progress shows what you know (/api/knowledge/report): per area, how much is tested and how well
// you hold what is. Untested is unknown, never zero. Each section shell renders a slot and calls
// Hub.mount; the views fetch their own data.
(function () {
  'use strict';
  const {api, escapeHtml: esc, toast} = window.H;
  const SD = 'system-design';
  const NAMES = {[SD]: 'System design', fundamentals: 'Fundamentals', ai: 'AI engineering'};
  const LEVEL = {untested: 'Not tested', early: 'Too early to say', weak: 'Weak', patchy: 'Patchy', good: 'Good', strong: 'Strong'};
  const DEPTH = {recognise: 'recognise', recall: 'recall', explain: 'explain', apply: 'apply'};
  const btn = (label, act, attrs = '', primary = false) => `<button type="button" class="button ${primary ? 'is-primary' : ''}" data-hub="${act}" ${attrs}>${esc(label)}</button>`;
  const pill = l => `<span class="hub-level is-${l}">${LEVEL[l] || l}</span>`;
  const ago = t => { if (!t) return ''; const d = Math.floor((Date.now() / 1000 - t) / 86400); return d < 1 ? 'today' : d < 2 ? 'yesterday' : `${d} days ago`; };
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  let seq = 0;

  function go(section, view) { window.AppSections.select(section, view); }

  // Every action a step or button can take, in one place.
  async function run(section, a) {
    if (['resume', 'fix', 'learn'].includes(a.kind) && a.tutor) window.Tutor?.queue({section, lesson: a.lesson, resume: a.kind === 'resume'});
    if (a.lesson && ['resume', 'fix', 'learn', 'lesson'].includes(a.kind)) return go(section, 'lesson/' + a.lesson);
    if (a.kind === 'placement') {
      if (section === SD) return window.DesignLearning.startRound({mode: 'placement', category: a.area, length: a.count || 10});
      return go(section, 'placement/' + a.area);
    }
    if (a.kind === 'review' || a.kind === 'mixed') {
      if (section === SD) return window.DesignLearning.startRound({mode: 'adaptive', length: 10});
      return go(section, 'quickfire');
    }
    if (a.kind === 'view') return go(section, a.view);
  }
  function wire(root, section, actions) {
    root.addEventListener('click', e => {
      const n = e.target.closest('[data-hub]');
      if (!n || !root.contains(n) || n.disabled) return;
      const a = actions[n.dataset.hub]?.(n);
      if (!a) return;
      e.preventDefault();
      Promise.resolve(run(section, a)).catch(err => toast?.(err.message || 'Something went wrong', 'error'));
    });
  }

  // ---------- Home: one next step ----------
  function standingHtml(s) {
    if (!s.tested) return `<p class="hub-standing">Nothing tested here yet, so there is no score: <a href="#" data-hub="progress">see the map</a>.</p>`;
    const bits = [`you get <b>${s.score}%</b> right of what's been tested (${(LEVEL[s.level] || '').toLowerCase()})`, `<b>${s.coverage}%</b> of the course tested`];
    if (s.week.gained) bits.push(`+${s.week.gained} learned this week`);
    if (s.slipping) bits.push(`${s.slipping} slipping`);
    if (s.misconceptions) bits.push(plural(s.misconceptions, 'misconception'));
    return `<p class="hub-standing">${bits.join(' · ')} · <a href="#" data-hub="progress">What you know →</a></p>`;
  }
  async function home(root, section) {
    const d = await api('/tutor/next?section=' + section);
    const p = d.primary;
    const prev = d.previously ? `<p class="hub-prev"><span>Last time · ${esc(d.previously.lesson_title)} · ${ago(d.previously.at)}</span>${window.SDBlocks ? window.SDBlocks.inline(d.previously.summary) : esc(d.previously.summary)}</p>` : '';
    root.innerHTML = `<div class="hub">
      <div class="sd-page-intro hub-intro"><span class="sd-eyebrow">${esc(NAMES[section].toUpperCase())}${d.tutor ? ` · ${esc(d.company.name)} · ${esc(d.company.label)}, ${esc(d.company.users)}` : ''}</span><h2 id="sd-heading" tabindex="-1">${d.tutor ? 'Your tutor suggests' : 'Next up'}</h2></div>
      ${prev}
      <section class="hub-next"><h3>${esc(p.title)}</h3><p>${esc(p.why)}</p><div class="sd-actions">${btn(p.label, 'primary', '', true)}</div></section>
      ${d.alternatives.length ? `<div class="hub-alts"><span>Or</span>${d.alternatives.map((a, i) => `<button type="button" class="hub-alt" data-hub="alt" data-i="${i}"><b>${esc(a.title)}</b><small>${esc(a.why)}</small></button>`).join('')}</div>` : ''}
      ${standingHtml(d.standing)}</div>`;
    wire(root, section, {primary: () => p, alt: n => d.alternatives[+n.dataset.i], progress: () => ({kind: 'view', view: 'progress'})});
  }

  // ---------- Progress: what you know ----------
  function spark(trend) {
    if (trend.length < 2 || !trend.some(t => t.tested)) return '';
    const w = 240, h = 56, max = Math.max(1, ...trend.map(t => t.knowledge));
    const xy = trend.map((t, i) => [i * w / (trend.length - 1), h - 4 - (h - 8) * t.knowledge / max]);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    return `<div class="hub-spark"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Ideas held, weekly over ${trend.length} weeks"><path class="sd-spark-area" d="${line}L${w},${h}L0,${h}Z"/><path class="sd-spark-line" d="${line}"/></svg><div class="sd-spark-axis"><span>${trend.length} weeks ago</span><span>now</span></div></div>`;
  }
  function bar(x) {
    // Width: share tested. Fill inside it: how well the tested part is held.
    return `<div class="hub-bar" title="${x.tested} of ${x.total} ideas tested${x.score === null ? '' : ` · ${x.score}% held`}"><span class="hub-bar-tested" style="width:${Math.max(x.tested ? 2 : 0, x.coverage)}%"><span class="hub-bar-held" style="width:${x.score || 0}%"></span></span></div>`;
  }
  function headline(r, section) {
    if (!r.tested) {
      const first = r.areas[0];
      return `<section class="hub-head"><div><span class="sd-eyebrow">WHAT YOU KNOW</span><h3>Nothing tested yet.</h3><p class="sd-muted">There is no score until you have answered something. A placement check on one area takes about five minutes: one question per lesson, and it tells you where you stand.</p><div class="sd-actions">${btn(`Find my level in ${first.title}`, 'place', `data-area="${first.id}" data-count="${first.lessons.length}"`, true)}</div></div></section>`;
    }
    const d = r.depths, depth = d.explain + d.apply ? ` You can explain ${d.explain + d.apply} and apply ${d.apply} of them.` : '';
    return `<section class="hub-head"><div><span class="sd-eyebrow">WHAT YOU KNOW · ${esc(NAMES[section].toUpperCase())}</span>
      <div class="hub-score"><strong>${r.score}%</strong><span>right today, of the ${r.tested} ideas tested so far</span></div>
      <p>${pill(r.level)} You have been tested on <b>${r.coverage}%</b> of the course (${r.tested} of ${r.total} ideas).${depth}</p>
      <p class="sd-muted">This week: ${r.week.gained ? `<b>+${r.week.gained}</b> learned` : 'nothing new learned'}${r.week.slipped ? `, <b>${r.week.slipped}</b> slipped` : ''}${r.slipping ? ` · ${r.slipping} need a review now` : ''}.</p></div>
      ${spark(r.trend)}</section>`;
  }
  function fixHtml(r, tutor) {
    if (!r.misconceptions.length) return '';
    return `<section class="sd-panel hub-fix"><h3>To clear up <span class="tr-count">${r.misconceptions.length}</span></h3><p class="sd-muted">Things you said or missed that show a wrong idea or a missing piece. They close when you show the right one.</p><ul>${r.misconceptions.map((m, i) => `<li><div><span class="sd-eyebrow">${esc(m.lesson_title)} · ${m.kind === 'gap' ? 'missing piece' : 'wrong idea'}</span><p>${esc(m.text)}</p>${m.quote ? `<p class="hub-quote">You said: “${esc(m.quote)}”</p>` : ''}</div>${btn(tutor ? 'Fix with the tutor' : 'Open the lesson', 'fix', `data-i="${i}"`)}</li>`).join('')}</ul></section>`;
  }
  function areasHtml(r) {
    return `<section class="hub-areas"><div class="sd-section-title"><div><h3>By area</h3><p>Bar length is how much of an area has been tested; the bright part is how much of that you hold. Open an area for its lessons, and a lesson for each idea.</p></div></div>
      ${r.areas.map(a => `<details class="hub-area"><summary><span class="hub-area-title">${esc(a.title)}</span>${pill(a.level)}${bar(a)}<span class="hub-area-num">${a.score === null ? '—' : a.score + '%'}<small>${a.tested}/${a.total} tested</small></span></summary>
        ${!a.tested ? `<div class="hub-area-place">${btn(`Find my level (${a.lessons.length} questions)`, 'place', `data-area="${a.id}" data-count="${a.lessons.length}"`, true)}</div>` : ''}
        <ul class="hub-lessons">${a.lessons.map(l => `<li><details class="hub-lesson" data-lesson="${l.id}"><summary><span>${esc(l.title)}</span>${pill(l.level)}${bar(l)}<span class="hub-area-num">${l.score === null ? '—' : l.score + '%'}<small>${l.tested}/${l.total}</small></span></summary><div class="hub-points"><p class="sd-muted">Loading…</p></div></details></li>`).join('')}</ul></details>`).join('')}</section>`;
  }
  const STATUS = {solid: 'Solid', learning: 'Learning', fading: 'Fading', shaky: 'Wrong last time', unseen: 'Not tested'};
  async function points(node, section) {
    const box = node.querySelector('.hub-points');
    if (box.dataset.loaded) return;
    box.dataset.loaded = '1';
    try {
      const d = await api(`/knowledge/points?section=${section}&lesson=${encodeURIComponent(node.dataset.lesson)}`);
      box.innerHTML = `<ul>${d.points.map(p => `<li class="hub-point"><i class="sd-sq is-${p.status}" title="${STATUS[p.status]}"></i><div><p>${esc(p.claim)}</p><small>${STATUS[p.status]}${p.depth ? ` · can ${DEPTH[p.depth]}` : ''}${p.unconfirmed ? ' · not yet confirmed by a graded check' : ''}${p.misconceptions ? ' · open misconception' : ''}</small></div></li>`).join('')}</ul><div class="sd-actions">${btn('Open the lesson', 'lesson', `data-lesson="${node.dataset.lesson}"`)}</div>`;
    } catch (e) { box.innerHTML = `<p class="tr-error">${esc(e.message)}</p>`; box.dataset.loaded = ''; }
  }
  async function progress(root, section) {
    const [r, t] = await Promise.all([api('/knowledge/report?section=' + section), api('/tutor').catch(() => ({enabled: false}))]);
    root.innerHTML = `<div class="hub">${headline(r, section)}${fixHtml(r, t.enabled)}${areasHtml(r)}
      ${section === SD && window.DesignLedger ? `<details class="sd-panel hub-calendar"><summary><h3>Practice calendar</h3></summary>${window.DesignLedger.slot('activity')}</details>` : ''}</div>`;
    root.querySelectorAll('.hub-lesson').forEach(n => n.addEventListener('toggle', () => { if (n.open) points(n, section); }));
    wire(root, section, {
      place: n => ({kind: 'placement', area: n.dataset.area, count: +n.dataset.count}),
      fix: n => { const m = r.misconceptions[+n.dataset.i]; return {kind: 'fix', lesson: m.lesson, tutor: t.enabled}; },
      lesson: n => ({kind: 'lesson', lesson: n.dataset.lesson}),
    });
  }

  // ---------- Practise: every kind of practice, one list ----------
  async function practise(root, section) {
    const sd = section === SD;
    const [r, extra] = await Promise.all([api('/knowledge/report?section=' + section),
      sd ? window.DesignLedger.load().catch(() => null) : api('/tracks/' + section).catch(() => null)]);
    const fix = extra?.mistakes?.fix?.length || 0;
    const untested = r.areas.filter(a => !a.tested);
    const row = (title, sub, act, attrs = '', primary = false) => `<button type="button" class="hub-row ${primary ? 'is-lead' : ''}" data-hub="${act}" ${attrs}><span><b>${esc(title)}</b><small>${esc(sub)}</small></span><span aria-hidden="true">→</span></button>`;
    const rows = [
      row(r.slipping ? `Review ${plural(r.slipping, 'slipping idea')}` : 'Quickfire', r.slipping ? 'Ten questions, the ones you are losing first. About five minutes.' : 'Ten quick questions, weakest first. About five minutes.', 'review', '', !!r.slipping),
      row(`Mistakes book${fix ? ` · ${fix} to fix` : ''}`, 'Every wrong answer waits here until you get it right on a later day.', 'view', 'data-view="mistakes"'),
    ];
    if (sd) rows.push(
      row('Design a whole system', 'Write a design for a realistic brief, then get it reviewed. Saved designs are here too.', 'view', 'data-view="cases"'),
      row('Past paper', 'A timed paper, marked at the end. The honest benchmark: no help, no tutor.', 'view', 'data-view="papers"'),
      row('Estimation drills', 'Back-of-envelope numbers against the clock.', 'view', 'data-view="drills"'),
      row('Skill drills', 'One focused design decision, two to five minutes.', 'view', 'data-view="skills"'),
      row('Custom Quickfire', 'Choose the area, topic, difficulty and length yourself.', 'view', 'data-view="quickfire"'));
    if (section === 'ai') rows.push(row('The AI-assisted coding round', 'Practise the round where you pair with an AI on real code.', 'view', 'data-view="round"'));
    root.innerHTML = `<div class="hub"><div class="sd-page-intro hub-intro"><span class="sd-eyebrow">PRACTISE</span><h2 id="sd-heading" tabindex="-1">Practise</h2><p>Home already picks the most useful thing. This is everything, when you want to choose.</p></div>
      <div class="hub-rows">${rows.join('')}</div>
      ${untested.length ? `<section class="hub-place"><h3>Find your level</h3><p class="sd-muted">Areas with nothing tested yet. One question per lesson, about five minutes each.</p><div class="hub-chips">${untested.map(a => btn(`${a.title} · ${a.lessons.length}`, 'place', `data-area="${a.id}" data-count="${a.lessons.length}"`)).join('')}</div></section>` : ''}</div>`;
    wire(root, section, {
      review: () => ({kind: 'review'}), view: n => ({kind: 'view', view: n.dataset.view}),
      place: n => ({kind: 'placement', area: n.dataset.area, count: +n.dataset.count}),
    });
  }

  // ---------- Placement for the course tracks (System Design uses its own Quickfire) ----------
  async function placement(root, section, area, T) {
    const r = await api('/knowledge/report?section=' + section);
    const a = r.areas.find(x => x.id === area);
    if (!a) throw new Error('Unknown area');
    const asked = [];
    let right = 0;
    root.innerHTML = `<div class="hub"><div class="sd-page-intro hub-intro"><span class="sd-eyebrow">FIND YOUR LEVEL · ${esc(a.title.toUpperCase())}</span><h2 id="sd-heading" tabindex="-1">What do you already know?</h2><p>One question per lesson you have not been tested on. Answer from what you know; "I don't know" is a fine answer and tells us just as much.</p></div><section class="sd-panel tr-fire"><div class="hub-q"></div></section></div>`;
    const slot = root.querySelector('.hub-q');
    async function next() {
      const res = await api(`/tracks/${section}/quickfire/next`, 'POST', {placement: true, category: area, exclude: asked});
      if (!res.question) {
        const after = await api('/knowledge/report?section=' + section), b = after.areas.find(x => x.id === area);
        slot.innerHTML = asked.length ? `<h3>${right} of ${asked.length} right</h3><p>${esc(a.title)}: ${pill(b.level)} ${['early', 'untested'].includes(b.level) ? 'more answers will firm this up.' : `${b.score}% of what was tested.`} ${right === asked.length ? 'Home will skip ahead where you got it right.' : 'Home will start you on the lessons you missed.'}</p><div class="sd-actions">${btn('Back to Home', 'view', 'data-view="home"', true)}${btn('What you know', 'view', 'data-view="progress"')}</div>`
          : `<p>Every lesson in this area has been tested already.</p>${btn('What you know', 'view', 'data-view="progress"', true)}`;
        return;
      }
      asked.push(res.question.id);
      slot.innerHTML = T.questionHtml(res.question, asked.length);
      T.wireQuestion(slot, res.question, out => {
        if (out.correct) right++;
        slot.querySelector('.tr-q-result').insertAdjacentHTML('beforeend', `<div class="sd-actions">${btn('Next →', 'next', '', true)}</div>`);
        slot.querySelector('[data-hub=next]')?.focus();
      }, 'quickfire');
    }
    root.addEventListener('click', e => { if (e.target.closest('[data-hub=next]')) next().catch(err => toast?.(err.message, 'error')); });
    wire(root, section, {view: n => ({kind: 'view', view: n.dataset.view})});
    await next();
  }

  const VIEWS = {home, progress, practise};
  // Render a view into a slot. Returns when it has painted; a newer mount wins.
  async function mount(slot, section, view) {
    if (!slot) return;
    const mine = ++seq;
    slot.innerHTML = '<div class="tr-loading">Loading…</div>';
    const host = document.createElement('div');
    try {
      await VIEWS[view](host, section);
      if (mine === seq && slot.isConnected) {
        slot.replaceChildren(host);
        if (section === SD) window.DesignLedger?.mount(slot);
      }
    } catch (e) {
      if (mine === seq) slot.innerHTML = `<div class="sd-panel"><p class="tr-error">${esc(e.message || 'Something went wrong')}</p></div>`;
    }
  }
  window.Hub = {mount, placement, run};
})();
