// Practical Coding: exercise list and a multi-file workspace. Tests run in the browser (Pyodide in
// a worker, loaded on first use); the server stores attempts and the results reported here.
(function () {
  'use strict';
  const T = window.Tracks;
  const { esc, md, btn, when, wireActions } = T;
  const toast = (m, k) => window.H.toast?.(m, k);
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const CAT = { build: 'BUILD', extend: 'EXTEND', debug: 'DEBUG', review: 'REVIEW' };
  const RUN_TIMEOUT = 20000, INIT_TIMEOUT = 120000;

  // ---------- Python runner (one worker, restarted after a timeout) ----------
  let worker = null, warm = null, seq = 0;
  const waiting = new Map();
  function spawn() {
    worker = new Worker('/practical-worker.js?v=' + (window.ASSET_VER || ''));
    warm = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Python took too long to load. Check your connection and try again.')), INIT_TIMEOUT);
      worker.onmessage = e => {
        const m = e.data;
        if (m.type === 'ready') { clearTimeout(t); resolve(); return; }
        const w = waiting.get(m.id); if (!w) return;
        waiting.delete(m.id); clearTimeout(w.timer);
        m.type === 'result' ? w.resolve(m.result) : w.reject(new Error(m.error));
      };
      worker.onerror = e => { clearTimeout(t); reject(new Error(e.message || 'The Python worker failed to start.')); };
      worker.postMessage({ type: 'init' });
    });
    warm.catch(() => { worker?.terminate(); worker = null; });
    return warm;
  }
  async function runPython(files, modules) {
    if (!worker) spawn();
    await warm;
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id); worker.terminate(); worker = null;
        reject(new Error(`Tests stopped after ${RUN_TIMEOUT / 1000} s. Is there an infinite loop?`));
      }, RUN_TIMEOUT);
      waiting.set(id, { resolve, reject, timer });
      worker.postMessage({ type: 'run', id, files, modules });
    });
  }

  // ---------- CodeMirror ----------
  let cmLoading = null;
  function loadCM() {
    if (window.CM) return Promise.resolve(window.CM);
    cmLoading ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `/vendor/codemirror.js?v=${window.ASSET_VER || ''}`;
      s.onload = () => resolve(window.CM);
      s.onerror = () => { cmLoading = null; reject(new Error('The editor failed to load.')); };
      document.head.appendChild(s);
    });
    return cmLoading;
  }
  function makeEditor(CM, parent, doc, readOnly, onChange, keys) {
    return new CM.EditorView({
      parent,
      state: CM.EditorState.create({
        doc,
        extensions: [
          CM.lineNumbers(), CM.highlightActiveLineGutter(), CM.highlightSpecialChars(), CM.history(), CM.drawSelection(),
          CM.indentOnInput(), CM.highlightActiveLine(), CM.indentUnit.of('    '), CM.python(), CM.bracketMatching(),
          CM.closeBrackets(), CM.syntaxHighlighting(CM.oneDarkHighlightStyle),
          CM.keymap.of([...keys, ...CM.closeBracketsKeymap, ...CM.defaultKeymap, ...CM.historyKeymap, CM.indentWithTab]),
          CM.EditorState.readOnly.of(readOnly), CM.EditorView.editable.of(!readOnly),
          CM.EditorView.updateListener.of(u => { if (u.docChanged) onChange(); }),
          CM.EditorView.theme({}, { dark: true }),
        ],
      }),
    });
  }

  // ---------- list ----------
  async function home(ctx) {
    const d = await ctx.call(''); if (ctx.stale()) return;
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">PRACTICAL CODING</span><h2>${esc(d.track.blurb)}</h2><p>Code runs in your browser with real Python. Tests are visible, and hidden edge-case checks run when you submit. Opening the solution before submitting means the exercise won't count as held.</p></div>
      ${T.knowledgeHtml(d, 'exercises you have done cleanly and still hold')}
      ${d.groups.map(g => `<section class="tr-cat"><div class="tr-cat-head"><h3>${esc(g.title)}</h3><p class="sd-muted">${esc(g.blurb)}</p></div><div class="sd-lesson-grid">${g.exercises.map(e => `<button type="button" class="sd-lesson-card tr-ex-card is-${e.status}" data-t="open" data-id="${e.id}"><span class="sd-eyebrow">${CAT[g.id]} · ${e.minutes} MIN${e.level === 'stretch' ? ' · STRETCH' : ''}</span><h3>${esc(e.title)}</h3><p class="tr-card-sum">${esc(e.summary)}</p><span><span>${e.open ? 'In progress' : e.best ? `${e.best.clean ? 'Clean' : 'Attempted'} · ${when(e.best.at)}${e.best.elapsed_sec ? ' · ' + fmt(e.best.elapsed_sec) : ''}` : 'Not started'}</span><span>${e.open ? 'Resume →' : 'Open →'}</span></span></button>`).join('')}</div></section>`).join('')}`;
    wireActions(ctx.root, { open: n => ctx.go('exercise/' + n.dataset.id) });
  }

  // ---------- workspace ----------
  function resultsHtml(r, label) {
    if (!r) return '';
    return `<div class="tr-results"><p class="tr-results-head ${r.passed === r.total ? 'is-pass' : 'is-fail'}"><b>${label}: ${r.passed}/${r.total} passed</b></p><ul>${r.results.map(t => `<li class="${t.ok ? 'is-pass' : 'is-fail'}"><span>${t.ok ? '✓' : '✗'}</span><div><code>${esc(t.name)}</code>${t.ms > 200 ? ` <span class="sd-muted">${t.ms} ms</span>` : ''}${t.error ? `<pre>${esc(t.error)}</pre>` : ''}${t.output ? `<pre class="tr-stdout">${esc(t.output)}</pre>` : ''}</div></li>`).join('')}</ul></div>`;
  }
  async function exercise(ctx) {
    const data = await ctx.call('/exercises/' + ctx.arg); if (ctx.stale()) return;
    const ex = data.exercise, review = ex.category === 'review';
    let attempt = data.attempt;
    const names = [...ex.files, ...ex.readonly];
    let active = names[0], hintsShown = 0, lastRun = null, saveTimer = null, clock = null, dirty = false;
    const editors = {};
    ctx.onLeave(() => { clearInterval(clock); clearTimeout(saveTimer); if (dirty) save().catch(() => {}); Object.values(editors).forEach(v => v.destroy()); });

    const intro = `<div class="sd-breadcrumb">${btn('← Exercises', 'go', 'data-view="home"')}</div>
      <div class="sd-page-intro"><span class="sd-eyebrow">${CAT[ex.category]} · ${ex.minutes} MIN${attempt ? ' · <span class="tr-elapsed">0:00</span>' : ''}</span><h2>${esc(ex.title)}</h2></div>`;
    if (!attempt) {
      ctx.root.innerHTML = intro + `<div class="tr-two"><section class="sd-panel tr-brief">${md(ex.brief)}<div class="sd-actions">${btn('Start the exercise', 'start', '', true)}<span class="sd-muted">The clock starts now. You can leave and come back; your work is saved.</span></div></section>
        <aside class="tr-aside"><section class="sd-panel"><span class="sd-eyebrow">YOU'LL BE MARKED ON</span><ul class="tr-plain">${review ? `<li>Finding the ${ex.issue_count} real issues, and explaining why each matters</li><li>Prioritising: blocking issues before nits</li>` : ex.rubric.map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>
        ${data.history.length ? `<section class="sd-panel"><span class="sd-eyebrow">PAST ATTEMPTS</span><ul class="tr-plain">${data.history.map(h => `<li>${when(h.submitted_at)} · ${h.clean ? 'clean' : 'not clean'}${h.elapsed_sec ? ' · ' + fmt(h.elapsed_sec) : ''}</li>`).join('')}</ul></section>` : ''}</aside></div>`;
      wireActions(ctx.root, { go: n => ctx.go(n.dataset.view), start: async () => { await ctx.call(`/exercises/${ex.id}/attempts`, 'POST', {}); ctx.go('exercise/' + ex.id); } });
      if (!review) loadCM().catch(() => {});
      return;
    }
    const contents = { ...ex.starter, ...attempt.files };
    ctx.root.innerHTML = intro + `<div class="tr-work">
      <section class="sd-panel tr-brief"><details open><summary><b>Brief</b></summary>${md(ex.brief)}</details>
        ${ex.hints?.length ? `<div class="tr-hints"></div>${btn('Show a hint', 'hint')}` : ''}
        ${review ? '' : `<details><summary><b>Rubric</b></summary><ul class="tr-plain">${ex.rubric.map(r => `<li>${esc(r)}</li>`).join('')}</ul></details>`}</section>
      <section class="tr-ide"><div class="tr-tabs" role="tablist">${names.map(n => `<button type="button" role="tab" class="tr-tab ${n === active ? 'is-active' : ''}" data-t="tab" data-name="${esc(n)}">${esc(n)}${ex.readonly.includes(n) ? ' <span class="sd-muted">read-only</span>' : ''}</button>`).join('')}</div>
        <div class="tr-editors">${names.map(n => `<div class="tr-editor" data-file="${esc(n)}" ${n === active ? '' : 'hidden'}></div>`).join('')}</div>
        ${review ? `<label class="tr-field"><span>Your review</span><small>One comment per issue: where, why it matters, what to do instead. Mark severity (blocking or nit).</small><textarea class="textarea tr-review" rows="12" maxlength="12000">${esc(attempt.review || '')}</textarea></label>
          <div class="sd-actions">${btn('Submit review', 'submit', '', true)}${btn('Show the answer', 'reveal')}</div>`
        : `<div class="sd-actions">${btn('Run tests', 'run', 'title="Ctrl/Cmd + Enter"', true)}${btn('Submit', 'submit')}${btn('Reset this file', 'reset')}${btn('Show solution', 'reveal')}<span class="tr-status sd-muted"></span></div>
          <div class="tr-output"></div>`}
      </section></div><div class="tr-after"></div>`;
    const elapsedEl = ctx.root.querySelector('.tr-elapsed');
    clock = setInterval(() => { elapsedEl.textContent = fmt((Date.now() / 1000) - attempt.started_at); }, 1000);
    const status = t => { const s = ctx.root.querySelector('.tr-status'); if (s) s.textContent = t; };
    const current = () => { const out = {}; ex.files.forEach(n => { out[n] = editors[n] ? editors[n].state.doc.toString() : contents[n]; }); return out; };
    async function save(run) {
      clearTimeout(saveTimer);
      if (review) return;
      attempt = await ctx.call('/attempts/' + attempt.id, 'PUT', { files: current(), revision: attempt.revision, run: run || null });
      dirty = false; status('Saved');
    }
    const schedule = () => { dirty = true; status('Editing…'); clearTimeout(saveTimer); saveTimer = setTimeout(() => save().catch(e => status('Not saved: ' + e.message)), 1500); };
    const allFiles = extra => ({ ...ex.starter, ...current(), ...(extra || {}) });
    const modules = list => list.map(n => n.replace(/\.py$/, ''));

    async function run() {
      const out = ctx.root.querySelector('.tr-output');
      out.innerHTML = `<p class="sd-muted">${worker ? 'Running…' : 'Loading Python (first run takes a few seconds)…'}</p>`;
      const r = await runPython(allFiles(), modules(ex.tests));
      if (ctx.stale()) return null;
      lastRun = r; out.innerHTML = resultsHtml(r, 'Tests');
      save({ passed: r.passed, total: r.total }).catch(() => {});
      return r;
    }
    function rubricHtml() {
      return `<section class="sd-panel tr-rubric-pick"><h3>Before you submit: rate your solution</h3><p class="sd-muted">Tick what's true. You need ${Math.ceil(ex.rubric.length * 0.75)} of ${ex.rubric.length}, plus every test and hidden check, for it to count.</p><ul class="tr-checks">${ex.rubric.map((r, i) => `<li><label><input type="checkbox" data-rub="${i}"> ${esc(r)}</label></li>`).join('')}</ul><div class="sd-actions">${btn('Run hidden checks and submit', 'final', '', true)}${btn('Cancel', 'cancel')}</div></section>`;
    }
    async function finalSubmit() {
      const after = ctx.root.querySelector('.tr-after');
      const rubric = [...after.querySelectorAll('[data-rub]')].map(n => n.checked);
      after.innerHTML = '<p class="sd-muted">Running tests and hidden checks…</p>';
      const tests = await runPython(allFiles(), modules(ex.tests));
      const { checks: checkFiles } = await ctx.call(`/attempts/${attempt.id}/checks`, 'POST', {});
      const checks = Object.keys(checkFiles).length ? await runPython(allFiles(checkFiles), modules(Object.keys(checkFiles))) : null;
      const slim = r => r && { passed: r.passed, total: r.total, results: r.results.map(x => ({ name: x.name, ok: x.ok })) };
      const res = await ctx.call(`/attempts/${attempt.id}/submit`, 'POST', { files: current(), revision: attempt.revision, tests: slim(tests), checks: slim(checks), rubric, elapsed_sec: Math.round(Date.now() / 1000 - attempt.started_at) });
      dirty = false; clearInterval(clock);
      showDone(res, tests, checks);
    }
    function showDone(res, tests, checks) {
      const a = res.attempt, after = ctx.root.querySelector('.tr-after');
      ctx.root.querySelectorAll('.tr-ide .sd-actions button').forEach(b => { b.disabled = true; });
      after.innerHTML = `<section class="sd-panel"><span class="sd-eyebrow">${a.clean ? 'CLEAN' : 'NOT CLEAN YET'} · ${fmt(a.elapsed_sec || 0)}</span><h3>${a.clean ? 'Done, and it counts.' : review && a.needs_self_mark ? 'Mark your review' : 'Submitted. It will come back for another go.'}</h3>
        ${res.message ? `<p class="sd-muted">${esc(res.message)}</p>` : ''}
        ${review ? reviewMarking(res) : `${resultsHtml(tests, 'Tests')}${checks ? resultsHtml(checks, 'Hidden checks') : ''}`}
        <h4 class="tr-sub">Discussion</h4>${md(res.discussion)}
        ${Object.keys(res.solution || {}).length ? `<h4 class="tr-sub">Reference solution</h4>${Object.entries(res.solution).map(([n, code]) => `<details><summary><code>${esc(n)}</code></summary><pre class="tr-code">${esc(code)}</pre></details>`).join('')}` : ''}
        <div class="sd-actions">${btn('Back to exercises', 'go', 'data-view="home"', true)}${btn('Try it again', 'again')}</div></section>`;
      after.scrollIntoView({ behavior: 'smooth' });
    }
    function reviewMarking(res) {
      const found = new Set(res.attempt.found || []);
      return `<p class="sd-muted">${res.attempt.needs_self_mark ? 'Tick each issue your review caught (the substance, not the exact words).' : `The coach found ${found.size} of ${res.issues.length}. Correct it if you disagree.`}</p>
        <ul class="tr-checks">${res.issues.map((it, i) => `<li><label><input type="checkbox" data-found="${i}" ${found.has(i) ? 'checked' : ''}> <b>${esc(it.title)}.</b> ${esc(it.detail)}</label></li>`).join('')}</ul>
        ${res.attempt.grade?.extra?.length ? `<p><b>Also valid, from your review:</b> ${res.attempt.grade.extra.map(esc).join('; ')}</p>` : ''}${res.attempt.grade?.feedback ? `<p>${esc(res.attempt.grade.feedback)}</p>` : ''}
        <div class="sd-actions">${btn('Save marking', 'mark', '', true)}<span class="tr-mark-status sd-muted"></span></div>`;
    }

    wireActions(ctx.root, {
      go: n => ctx.go(n.dataset.view),
      tab: n => { active = n.dataset.name; ctx.root.querySelectorAll('.tr-tab').forEach(t => t.classList.toggle('is-active', t === n)); ctx.root.querySelectorAll('.tr-editor').forEach(e => { e.hidden = e.dataset.file !== active; }); editors[active]?.focus(); },
      hint: n => { const box = ctx.root.querySelector('.tr-hints'); box.insertAdjacentHTML('beforeend', `<p class="tr-hint"><b>Hint ${hintsShown + 1}:</b> ${T.inline(ex.hints[hintsShown])}</p>`); hintsShown++; if (hintsShown >= ex.hints.length) n.remove(); },
      run: async n => { n.disabled = true; try { await run(); } catch (e) { ctx.root.querySelector('.tr-output').innerHTML = `<p class="tr-error">${esc(e.message)}</p>`; } finally { n.disabled = false; } },
      reset: () => { if (!ex.files.includes(active) || !confirm(`Reset ${active} to the starter code?`)) return; const v = editors[active]; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: ex.starter[active] } }); },
      reveal: async () => {
        if (!confirm('Show the solution now? This attempt will no longer count as held. You can still finish it.')) return;
        const r = await ctx.call(`/attempts/${attempt.id}/reveal`, 'POST', {});
        attempt = (await ctx.call('/exercises/' + ex.id)).attempt || attempt;
        const after = ctx.root.querySelector('.tr-after');
        after.innerHTML = `<section class="sd-panel"><h3>Solution</h3>${review ? `<ul class="tr-plain">${r.issues.map(i => `<li><b>${esc(i.title)}.</b> ${esc(i.detail)}</li>`).join('')}</ul>` : Object.entries(r.solution).map(([nm, code]) => `<h4 class="tr-sub"><code>${esc(nm)}</code></h4><pre class="tr-code">${esc(code)}</pre>`).join('')}${md(r.discussion)}</section>`;
      },
      submit: async () => {
        if (review) {
          const text = ctx.root.querySelector('.tr-review').value.trim();
          if (text.length < 30) { toast('Write your review first'); return; }
          const b = ctx.root.querySelector('[data-t=submit]'); b.disabled = true; b.textContent = 'Marking…';
          const res = await ctx.call(`/attempts/${attempt.id}/submit`, 'POST', { revision: attempt.revision, review: text, elapsed_sec: Math.round(Date.now() / 1000 - attempt.started_at) });
          clearInterval(clock); showDone(res);
          return;
        }
        if (!lastRun) { try { await run(); } catch (e) { toast(e.message, 'error'); return; } }
        ctx.root.querySelector('.tr-after').innerHTML = rubricHtml();
        ctx.root.querySelector('.tr-after').scrollIntoView({ behavior: 'smooth' });
      },
      cancel: () => { ctx.root.querySelector('.tr-after').innerHTML = ''; },
      final: async n => { n.disabled = true; try { await finalSubmit(); } catch (e) { n.disabled = false; toast(e.message, 'error'); } },
      mark: async n => {
        const found = [...ctx.root.querySelectorAll('[data-found]:checked')].map(x => +x.dataset.found);
        const a = await ctx.call(`/attempts/${attempt.id}/found`, 'POST', { found });
        ctx.root.querySelector('.tr-mark-status').textContent = a.clean ? 'Saved: counts as held.' : `Saved: ${found.length} found, not enough to count yet.`;
      },
      again: async () => { await ctx.call(`/exercises/${ex.id}/attempts`, 'POST', {}); ctx.go('exercise/' + ex.id); },
    });

    if (review) {
      names.forEach(n => { ctx.root.querySelector(`.tr-editor[data-file="${CSS.escape(n)}"]`).innerHTML = n.endsWith('.md') ? `<div class="tr-readme">${md(contents[n])}</div>` : `<pre class="tr-code">${esc(contents[n])}</pre>`; });
      return;
    }
    const CM = await loadCM();
    if (ctx.stale()) return;
    const keys = [{ key: 'Mod-Enter', run: () => { ctx.root.querySelector('[data-t=run]')?.click(); return true; } }];
    names.forEach(n => {
      const slot = ctx.root.querySelector(`.tr-editor[data-file="${CSS.escape(n)}"]`);
      editors[n] = makeEditor(CM, slot, contents[n], ex.readonly.includes(n), ex.files.includes(n) ? schedule : () => {}, keys);
    });
    if (!worker) spawn().catch(() => {});   // warm Python up while you read the brief
  }

  async function mistakes(ctx) {
    const d = await ctx.call(''); if (ctx.stale()) return;
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">MISTAKES BOOK</span><h2>Exercises to redo</h2><p>Submissions that didn't pass everything, or where you opened the solution first.</p></div>
      ${T.mistakesHtml(d, v => btn('Open', 'open', `data-id="${v.topic}"`))}`;
    wireActions(ctx.root, { open: n => ctx.go('exercise/' + n.dataset.id) });
  }

  T.register('practical', { home, exercise, mistakes });
})();
