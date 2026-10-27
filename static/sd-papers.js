// Past papers: sit a timed, mixed paper exam-style, then see marks, a grade and the examiner's notes.
(function () {
  'use strict';
  const {$, api, escapeHtml: esc} = window.H;
  const B = () => window.SDBlocks;
  const md = t => B() ? B().md(t) : `<p>${esc(t)}</p>`;
  const inline = t => B() ? B().inline(t) : esc(t);
  const call = (path, method = 'GET', body) => api('/system-design' + path, method, body);
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const btn = (text, action, attrs = '', primary = false) => `<button type="button" class="button ${primary ? 'is-primary' : ''}" data-paper="${action}" ${attrs}>${esc(text)}</button>`;
  const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let list = null, paper = null, answers = {}, busy = false, error = '', elapsed = 0, tickAt = 0, timer = null, poll = null;
  let setup = {scope: 'mixed', value: '', length: 'short'}, catalog = null, saveTimers = {}, startRequest = null;

  // ---------- Setup and history ----------
  function gradeTable(grades) {
    return `<table class="sd-grade-table"><tbody>${grades.map(g => `<tr><th><span class="sd-grade-pill is-${g.grade === 'A*' ? 'astar' : g.grade.toLowerCase()}">${esc(g.grade)}</span></th><td>${g.floor ? g.floor + '%+' : 'below 35%'}</td><td>${esc(g.meaning)}</td></tr>`).join('')}</tbody></table>`;
  }
  const gradeClass = g => g ? 'is-' + (g === 'A*' ? 'astar' : g.toLowerCase()) : '';
  function setupHtml() {
    const cats = catalog.course.categories, lessons = catalog.course.lessons;
    const valueField = setup.scope === 'category' ? `<label>Category<select class="select" id="sd-paper-value">${cats.map(c => `<option value="${c.id}" ${setup.value === c.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label>`
      : setup.scope === 'topic' ? `<label>Topic<select class="select" id="sd-paper-value">${lessons.map(l => `<option value="${l.id}" ${setup.value === l.id ? 'selected' : ''}>${esc(l.title)}</option>`).join('')}</select></label>` : '';
    const lens = Object.entries(list.lengths).map(([k, marks]) => [k, `${k[0].toUpperCase() + k.slice(1)} · ${marks} marks · ~${Math.round(marks * list.sec_per_mark / 60)} min`]);
    const history = list.papers;
    return `<div class="sd-page-intro"><span class="sd-eyebrow">PAST PAPERS</span><h2 id="sd-heading" tabindex="-1">Sit a paper. Get a grade.</h2><p>Timed, mixed questions from across the course, marked out of a total like an exam. Nothing is revealed until you finish. Written answers are marked by the coach against a mark scheme, with notes on every lost mark.</p></div>
      ${list.sitting ? `<div class="sd-panel sd-resume"><h3>You have a paper in progress.</h3><p>Your saved answers are waiting.</p><div class="sd-actions">${btn('Resume paper →', 'open', `data-id="${list.sitting}"`, true)}</div></div>` : ''}
      <div class="sd-paper-setup"><section class="sd-panel"><h3>New paper</h3><div class="sd-fire-controls"><label>Paper<select class="select" id="sd-paper-scope">${[['mixed', 'Mixed: everything you have studied'], ['category', 'One category'], ['topic', 'One topic'], ['review', 'Review: fading and shaky items'], ['mistakes', 'Mistakes book']].map(([k, v]) => `<option value="${k}" ${setup.scope === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>${valueField}<label>Length<select class="select" id="sd-paper-length">${lens.map(([k, v]) => `<option value="${k}" ${setup.length === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label></div>
      <div class="sd-actions">${btn('Start paper →', 'start', '', true)}</div><p class="sd-muted">Allow about a minute per mark. The clock is a guide: going over is recorded, not penalised. ${list.coach_enabled ? 'Written answers are marked by the coach.' : 'The coach is off, so you will mark written answers yourself.'} Review and mistakes papers are not ranked.</p></section>
      <section class="sd-panel"><h3>Grade boundaries</h3><p class="sd-muted">What each grade means for an interview, on the material the paper covers. A full design round also tests driving the conversation.</p>${gradeTable(list.grades)}</section></div>
      <section class="sd-panel"><h3>Your papers</h3>${history.length ? `<div class="sd-scroll"><table class="sd-evidence sd-paper-history"><thead><tr><th>Date</th><th>Paper</th><th>Marks</th><th>Grade</th><th>Time</th><th></th></tr></thead><tbody>${history.map(p => `<tr><td>${new Date(p.finished_at * 1000).toLocaleDateString()}</td><td>${esc(p.scope_label)}${p.ranked ? '' : ' <small class="sd-muted">unranked</small>'}</td><td>${p.marks}/${p.max}${p.pct === null ? '' : ` · ${p.pct}%`}</td><td>${p.grade ? `<span class="sd-grade-pill ${gradeClass(p.grade)}">${esc(p.grade)}</span>` : '<span class="sd-muted">marking</span>'}</td><td>${clock(p.elapsed_sec)}${p.elapsed_sec > p.time_limit_sec ? ' <small class="sd-over">over</small>' : ''}</td><td>${btn('Review', 'open', `data-id="${p.id}"`)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sd-muted">No papers yet. A short paper takes about fifteen minutes.</p>'}</section>`;
  }

  // ---------- Sitting ----------
  function choiceList(p, type) {
    const v = answers[p.n];
    const picked = type === 'checkbox' ? (Array.isArray(v) ? v.map(String) : []) : [String(v ?? '')];
    return `<fieldset class="sd-answer-options"><legend class="sr-only">Answer</legend>${p.choices.map((c, i) => `<label class="sd-choice"><input type="${type}" name="sd-paper-${p.n}" data-n="${p.n}" data-input="${type}" value="${esc(c.id)}" ${picked.includes(String(c.id)) ? 'checked' : ''}><span class="sd-choice-letter">${String.fromCharCode(65 + i)}</span><span>${inline(c.text)}</span></label>`).join('')}</fieldset>`;
  }
  function orderList(p, items) {
    const v = answers[p.n], by = Object.fromEntries(items.map(i => [String(i.id), i]));
    const ids = Array.isArray(v) && v.length === items.length && v.every(k => by[String(k)]) ? v.map(String) : items.map(i => String(i.id));
    return `<ol class="sd-order sd-answer-order" data-n="${p.n}" data-input="order">${ids.map(k => `<li data-id="${esc(k)}"><span class="sd-order-text">${inline(by[k].text)}</span><span class="sd-order-moves"><button type="button" data-move="up" aria-label="Move up">↑</button><button type="button" data-move="down" aria-label="Move down">↓</button></span></li>`).join('')}</ol>`;
  }
  function numberInput(p, unit) {
    return `<div class="sd-numeric"><input class="input" data-n="${p.n}" data-input="text" inputmode="decimal" autocomplete="off" placeholder="Your answer" value="${esc(answers[p.n] ?? '')}"><span>${esc(unit || '')}</span></div>`;
  }
  function inputHtml(p) {
    if (p.type === 'question') {
      if (p.format === 'numeric') return numberInput(p, p.unit);
      if (p.format === 'order') return orderList(p, p.choices);
      return choiceList(p, p.format === 'multi' ? 'checkbox' : 'radio');
    }
    if (p.type === 'predict') return choiceList(p, 'radio');
    if (p.type === 'calc') return `${p.given ? `<div class="sd-given">${md(p.given)}</div>` : ''}${numberInput(p, p.unit)}`;
    if (p.type === 'faded') {
      const v = Array.isArray(answers[p.n]) ? answers[p.n] : [];
      let html = md(p.text);
      p.blanks.forEach((b, i) => {
        const field = b.kind === 'num' ? `<input class="sd-blank sd-blank-num" data-n="${p.n}" data-input="blank" data-i="${i}" inputmode="decimal" size="7" aria-label="Blank ${i + 1}" value="${esc(v[i] ?? '')}">`
          : `<select class="sd-blank" data-n="${p.n}" data-input="blank" data-i="${i}" aria-label="Blank ${i + 1}"><option value="">…</option>${b.options.map(o => `<option value="${esc(o)}" ${v[i] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        html = html.replace(`@@BLANK${i}@@`, field);
      });
      return `<div class="sd-faded">${html}</div>`;
    }
    if (p.type === 'sort') {
      const v = answers[p.n] && typeof answers[p.n] === 'object' ? answers[p.n] : {};
      return `<div class="sd-sort">${p.items.map(it => `<div class="sd-sort-item"><span class="sd-sort-text">${inline(it.text)}</span><select class="select sd-sort-select" data-n="${p.n}" data-input="sort" data-id="${esc(it.id)}" aria-label="Category"><option value="">Choose…</option>${p.buckets.map((name, k) => `<option value="${k}" ${v[it.id] === k ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></div>`).join('')}</div>`;
    }
    if (p.type === 'order') return orderList(p, p.items);
    if (p.type === 'bug') {
      const picked = (Array.isArray(answers[p.n]) ? answers[p.n] : []).map(Number);
      return `<pre class="sd-code sd-bug-code" data-lang="${esc(p.lang)}">${p.code.split('\n').map((l, i) => `<button type="button" class="sd-bug-line ${picked.includes(i + 1) ? 'is-picked' : ''}" data-n="${p.n}" data-input="bug" data-line="${i + 1}"><span class="sd-ln">${i + 1}</span><code>${B() ? B().highlight(l, p.lang || 'text') || ' ' : esc(l)}</code></button>`).join('')}</pre><p class="sd-muted">Click every wrong line (${p.count === 1 ? 'one line' : p.count + ' lines'}).</p>`;
    }
    return `<textarea class="textarea" data-n="${p.n}" data-input="text" rows="6" maxlength="3000" placeholder="Write it as you would say it in an interview.">${esc(answers[p.n] ?? '')}</textarea><p class="sd-muted">Marked against ${p.points} points.</p>`;
  }
  const answered = n => { const v = answers[n]; return !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.some(x => x !== '' && x != null)) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)); };
  function topicTitle(id) { return catalog.course.lessons.find(l => l.id === id)?.title || ''; }
  function sittingHtml() {
    const total = paper.items.reduce((s, p) => s + p.max, 0), done = paper.items.filter(p => answered(p.n)).length;
    return `<div class="sd-paper-bar"><div><span class="sd-eyebrow">${esc(paper.scope_label.toUpperCase())}</span><strong>${paper.items.length} questions · ${total} marks</strong></div><span id="sd-paper-answered">${done}/${paper.items.length} answered</span><span class="sd-paper-clock" id="sd-paper-clock">${clock(elapsed)} / ${clock(paper.time_limit_sec)}</span>${btn('Finish paper', 'finish', '', true)}</div>
      <div class="sd-paper">${paper.items.map((p, i) => `<article class="sd-paper-q" id="sd-paper-q${p.n}"><header><span class="sd-paper-num">${i + 1}</span><span class="sd-muted">${esc(topicTitle(p.topic))}</span><span class="sd-paper-marks">[${p.max} mark${p.max === 1 ? '' : 's'}]</span></header>${p.title ? `<h4>${inline(p.title)}</h4>` : ''}<div class="sd-q-prompt">${md(p.prompt)}</div>${inputHtml(p)}</article>`).join('')}</div>
      <div class="sd-actions sd-paper-end">${btn('Finish and mark →', 'finish', '', true)}${btn('Save and leave', 'leave')}</div>`;
  }

  // ---------- Results ----------
  const STATUS = {covered: ['✓', 'is-right'], partial: ['◐', 'is-partial'], missing: ['○', 'is-missing'], incorrect: ['✗', 'is-wrong']};
  function resultItem(p, i) {
    const r = paper.results[String(p.n)], note = paper.report?.notes?.find(x => x.n === p.n);
    const cls = r.marks === null ? 'is-pending' : r.marks >= p.max ? 'is-full' : r.marks > 0 ? 'is-part' : 'is-zero';
    const self = r.marks === null && paper.status === 'self_mark' && p.type === 'recall';
    const rubric = r.points ? `<ul class="sd-rubric">${r.points.map(pt => `<li class="${STATUS[pt.status][1]}"><span>${STATUS[pt.status][0]}</span><div><b>${inline(pt.point)}</b>${pt.note ? `<p>${inline(pt.note)}</p>` : ''}</div></li>`).join('')}</ul>${r.feedback ? `<p>${inline(r.feedback)}</p>` : ''}` : '';
    const selfHtml = self ? `<div class="sd-self-mark" data-n="${p.n}"><p><b>Mark it yourself:</b> compare with the model answer and tick each point you made.</p><ul class="sd-rubric is-self">${(p.scheme || []).map((pt, k) => `<li><label><input type="checkbox" data-point="${k}"> ${inline(pt)}</label></li>`).join('')}</ul>${btn('Record my marks', 'self-mark', `data-n="${p.n}"`, true)}</div>` : '';
    return `<details class="sd-paper-result ${cls}" ${r.marks !== null && r.marks >= p.max ? '' : 'open'}><summary><span class="sd-paper-num">${i + 1}</span><span class="sd-paper-label">${inline(p.label || p.title || '')}</span><span class="sd-paper-score">${r.marks === null ? '…' : r.marks}/${p.max}</span></summary>
      <div class="sd-q-prompt">${md(p.prompt)}</div><p><b>Your answer:</b> ${inline(r.answer_text)}</p>${p.type === 'recall' ? `<details class="sd-model"><summary>Model answer</summary>${md(r.right)}</details>` : `<p><b>Mark scheme:</b> ${inline(r.right)}</p>`}
      ${note ? `<p class="sd-examiner-note"><b>Examiner:</b> ${inline(note.note)}</p>` : ''}${(r.why_wrong || []).map(w => `<p class="sd-why-wrong">${inline(w)}</p>`).join('')}${rubric}${selfHtml}${r.explanation ? `<details><summary>Explanation</summary>${md(r.explanation)}</details>` : ''}</details>`;
  }
  function resultsHtml() {
    const t = paper.totals, g = t.grade, over = paper.elapsed_sec > paper.time_limit_sec;
    const head = g ? `<div class="sd-paper-grade ${gradeClass(g.grade)}"><span class="sd-grade-letter">${esc(g.grade)}</span><div><strong>${t.marks}/${t.max} · ${t.pct}%</strong><p>${esc(g.meaning)}</p><p class="sd-muted">${clock(paper.elapsed_sec)} of ${clock(paper.time_limit_sec)}${over ? ' · over time' : ''}${paper.scope.kind === 'review' || paper.scope.kind === 'mistakes' ? ' · unranked: it targets your weak items' : ''}</p></div></div>`
      : `<div class="sd-paper-grade is-pending"><span class="sd-grade-letter">…</span><div><strong>${t.marks}/${t.max} so far</strong><p>${paper.status === 'marking' ? 'The coach is marking your written answers and writing the examiner’s report.' : `${t.pending} written answer${t.pending === 1 ? '' : 's'} still to mark.`}</p>${paper.status === 'self_mark' && list?.coach_enabled ? btn('Retry coach marking', 'retry') : ''}</div></div>`;
    const report = paper.report ? `<section class="sd-panel sd-examiner"><span class="sd-eyebrow">EXAMINER’S REPORT</span><p>${inline(paper.report.summary)}</p>${paper.report.focus?.length ? `<b>Study next</b><ul>${paper.report.focus.map(f => `<li>${inline(f)}</li>`).join('')}</ul>` : ''}</section>` : '';
    return `<div class="sd-breadcrumb">${btn('← Papers', 'home')}</div>${head}<div data-paper-slip></div>${report}<div class="sd-paper-results">${paper.items.map(resultItem).join('')}</div><div class="sd-actions">${btn('Sit another paper', 'home', '', true)}${btn('Mistakes book', 'mistakes')}</div>`;
  }

  // ---------- Lifecycle ----------
  function tick() { const now = performance.now(); if (tickAt && document.visibilityState !== 'hidden') elapsed += (now - tickAt) / 1000; tickAt = now; }
  function stop() { if (timer) tick(); clearInterval(timer); timer = null; tickAt = 0; clearTimeout(poll); poll = null; if (paper?.status === 'sitting') store(); }
  function store() { try { sessionStorage.setItem('sd-paper-elapsed:' + paper.id, String(Math.floor(elapsed))); } catch (_) { /* optional */ } }
  function startClock() {
    stop();
    if (!paper || paper.status !== 'sitting' || !document.body.classList.contains('section-design')) return;
    tickAt = performance.now();
    timer = setInterval(() => {
      tick(); store();
      const node = $('#sd-paper-clock');
      if (node) { node.textContent = `${clock(elapsed)} / ${clock(paper.time_limit_sec)}`; node.classList.toggle('is-over', elapsed > paper.time_limit_sec); }
    }, 1000);
  }
  function schedulePoll() {
    clearTimeout(poll);
    if (paper?.status !== 'marking') return;
    const id = paper.id;
    poll = setTimeout(async () => {
      try { const fresh = await call('/papers/' + id); if (paper?.id === id) { paper = fresh; if (paper.status !== 'marking') window.DesignLedger?.invalidate(); window.SystemDesign.repaint(); } }
      catch (e) { error = e.message; }
      schedulePoll();
    }, 2500);
  }
  function adopt(doc) {
    paper = doc; answers = {};
    Object.entries(doc.answers || {}).forEach(([n, a]) => { answers[n] = a.value; });
    let saved = 0; try { saved = Number(sessionStorage.getItem('sd-paper-elapsed:' + doc.id)) || 0; } catch (_) { /* optional */ }
    elapsed = doc.status === 'sitting' ? saved : doc.elapsed_sec || 0;
  }
  async function flush() { await Promise.all(Object.keys(saveTimers).map(n => { clearTimeout(saveTimers[n]); delete saveTimers[n]; return send(n); })); }
  function send(n) { return call('/papers/' + paper.id + '/answer', 'POST', {n: Number(n), value: answers[n] ?? null}); }
  function queueSave(n, delay = 500) {
    clearTimeout(saveTimers[n]);
    saveTimers[n] = setTimeout(() => { delete saveTimers[n]; send(n).catch(e => { error = e.message; const el = $('#sd-papers-error'); if (el) { el.textContent = error; el.hidden = false; } }); }, delay);
    const count = $('#sd-paper-answered'); if (count) count.textContent = `${paper.items.filter(p => answered(p.n)).length}/${paper.items.length} answered`;
  }

  async function act(action, node) {
    if (busy) return;
    busy = true; error = '';
    try {
      if (action === 'start') {
        startRequest = startRequest || rid();
        const doc = await call('/papers', 'POST', {request_id: startRequest, ...setup});
        startRequest = null; adopt(doc);
      }
      if (action === 'open') adopt(await call('/papers/' + node.dataset.id));
      if (action === 'leave') { await flush(); stop(); paper = null; list = await call('/papers'); }
      if (action === 'home') { stop(); paper = null; list = await call('/papers'); }
      if (action === 'mistakes') { stop(); paper = null; busy = false; await window.SystemDesign.openView('mistakes'); return; }
      if (action === 'finish') {
        await flush();
        const missing = paper.items.filter(p => !answered(p.n)).length;
        if (missing && !window.confirm(`${missing} question${missing === 1 ? ' is' : 's are'} unanswered and will score zero. Finish anyway?`)) return;
        tick(); const doc = await call('/papers/' + paper.id + '/finish', 'POST', {elapsed_sec: Math.floor(elapsed)});
        stop(); adopt(doc); list = await call('/papers'); window.DesignLedger?.invalidate();
      }
      if (action === 'retry') adopt(await call('/papers/' + paper.id + '/mark', 'POST', {}));
      if (action === 'self-mark') {
        const box = node.closest('.sd-self-mark');
        const covered = [...box.querySelectorAll('[data-point]:checked')].map(c => Number(c.dataset.point));
        adopt(await call('/papers/' + paper.id + '/self-mark', 'POST', {n: Number(node.dataset.n), covered}));
        window.DesignLedger?.invalidate();
      }
    } catch (e) { error = e.message; }
    finally { busy = false; window.SystemDesign.repaint(); }
  }

  function render(cat) {
    catalog = cat;
    const body = !list ? '<div class="sd-panel">Loading papers…</div>' : paper ? (paper.status === 'sitting' ? sittingHtml() : resultsHtml()) : setupHtml();
    return `<div id="sd-papers-error" class="sd-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</div>${body}`;
  }
  let autostart = null;
  async function open() {
    list = await call('/papers');
    if (!autostart) return;
    const wanted = autostart; autostart = null;
    if (list.sitting) { adopt(await call('/papers/' + list.sitting)); return; }
    setup = wanted; startRequest = rid();
    try { adopt(await call('/papers', 'POST', {request_id: startRequest, ...setup})); startRequest = null; }
    catch (e) { paper = null; error = e.message; }
  }
  // Start a paper straight from elsewhere (map, mistakes book, Start button); resumes one in progress instead.
  function begin(wanted) { autostart = {scope: 'mixed', value: '', length: 'short', ...wanted}; paper = null; return window.SystemDesign.openView('papers'); }
  function wire(root) {
    root.querySelectorAll('[data-paper]').forEach(n => n.addEventListener('click', () => act(n.dataset.paper, n)));
    const sel = id => root.querySelector(id);
    sel('#sd-paper-scope')?.addEventListener('change', e => { setup.scope = e.target.value; setup.value = setup.scope === 'category' ? catalog.course.categories[0].id : setup.scope === 'topic' ? catalog.course.lessons[0].id : ''; window.SystemDesign.repaint(); });
    sel('#sd-paper-value')?.addEventListener('change', e => { setup.value = e.target.value; });
    sel('#sd-paper-length')?.addEventListener('change', e => { setup.length = e.target.value; });
    if (sel('#sd-paper-value') && !setup.value) setup.value = sel('#sd-paper-value').value;
    if (paper?.status === 'sitting') {
      root.querySelectorAll('[data-input]').forEach(el => {
        const n = el.dataset.n, kind = el.dataset.input;
        if (kind === 'radio') el.addEventListener('change', () => { answers[n] = el.value; queueSave(n, 0); });
        if (kind === 'checkbox') el.addEventListener('change', () => { answers[n] = [...root.querySelectorAll(`input[name="sd-paper-${n}"]:checked`)].map(c => c.value); queueSave(n, 0); });
        if (kind === 'text') el.addEventListener('input', () => { answers[n] = el.value; queueSave(n, 800); });
        if (kind === 'blank') el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
          const v = Array.isArray(answers[n]) ? answers[n].slice() : []; v[Number(el.dataset.i)] = el.value; for (let i = 0; i < v.length; i++) if (v[i] === undefined) v[i] = '';
          answers[n] = v; queueSave(n, 600);
        });
        if (kind === 'sort') el.addEventListener('change', () => { const v = {...(answers[n] || {})}; if (el.value === '') delete v[el.dataset.id]; else v[el.dataset.id] = Number(el.value); answers[n] = v; queueSave(n, 0); });
        if (kind === 'bug') el.addEventListener('click', () => { el.classList.toggle('is-picked'); answers[n] = [...root.querySelectorAll(`[data-input="bug"][data-n="${n}"].is-picked`)].map(b => Number(b.dataset.line)); queueSave(n, 300); });
        if (kind === 'order') el.addEventListener('click', e => {
          const b = e.target.closest('[data-move]'); if (!b) return; const li = b.closest('li');
          if (b.dataset.move === 'up' && li.previousElementSibling) el.insertBefore(li, li.previousElementSibling);
          if (b.dataset.move === 'down' && li.nextElementSibling) el.insertBefore(li.nextElementSibling, li);
          answers[n] = [...el.querySelectorAll('li')].map(x => x.dataset.id); queueSave(n, 300);
        });
      });
    }
    if (paper && paper.status !== 'sitting') window.DesignLedger?.slip(root.querySelector('[data-paper-slip]'), paper.created_at);
    startClock(); schedulePoll();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { if (timer) tick(); if (paper?.status === 'sitting') store(); } });
  window.DesignPapers = {render, wire, open, begin, stop, isBusy: () => busy, current: () => paper};
})();
