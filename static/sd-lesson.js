// Adaptive lesson player. A short warm-up finds what you already know; the lesson then folds
// known sections away, trims prose to its key point and puts activities first. Walkthroughs are
// attempt-first. The tutor explains mistakes, answers questions and throws curveballs when it is
// connected; without it every section, activity and check still works.
(function () {
  'use strict';
  const {api, escapeHtml: esc} = window.H;
  const B = () => window.SDBlocks;
  const call = (path, method = 'GET', body) => api('/system-design' + path, method, body);
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const btn = (text, act, attrs = '', primary = false) => `<button type="button" class="button ${primary ? 'is-primary' : ''}" data-lp="${act}" ${attrs}>${esc(text)}</button>`;
  const MODE = {known: ['✓', 'You know this'], skim: ['◐', 'Skim'], learn: ['●', 'Learn']};
  const STAGE_HINT = [
    [/requirement|scope|case/i, 'List the functional requirements, the non-functional targets (with numbers) and what you would leave out.'],
    [/estimate|capacity|numbers/i, 'Estimate the rates and sizes that decide the design: requests/s at peak, storage, bandwidth, memory.'],
    [/api|interface|contract/i, 'Write the main endpoints with inputs, outputs and the ids or keys involved.'],
    [/data|schema|model|storage/i, 'Sketch the tables or keys, what each is keyed or sharded by, and why.'],
    [/architecture|high-level|components/i, 'Name the components and walk one write and one read through them.'],
    [/deep|dive|hot|counter|fan/i, 'Pick the hardest part of this design and explain how you would make it work.'],
    [/failure|recovery|outage/i, 'For each component: what happens when it fails, and how the system recovers?'],
    [/evolution|scale|grow/i, 'How would this design change at 10× the load, and what would you build first?'],
  ];
  let S = null;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* per-viewer convenience only */ } },
  };
  const fullText = () => store.get('sd-lesson-full') === '1';
  const words = t => String(t || '').split(/\s+/).filter(Boolean).length;
  const minutes = n => `${Math.max(1, Math.round(n / 220))} min`;
  const inline = t => B().inline(t || '');
  const md = t => B().md(t || '');

  // ---------- Prose: key point first, depth on request ----------
  function chunks(text) {
    const out = []; let cur = [], fence = false;
    for (const line of String(text).split('\n')) {
      if (/^```/.test(line)) fence = !fence;
      if (!fence && !line.trim()) { if (cur.length) out.push(cur.join('\n')); cur = []; continue; }
      cur.push(line);
    }
    if (cur.length) out.push(cur.join('\n'));
    return out;
  }
  const isPlain = c => !/^(>|\||#|```|\s*([-*]|\d+\.)\s)/.test(c);
  const keepCallout = c => /^>\s*\[!(story|incident|mistake)\]/.test(c);
  function prose(text, key) {
    if (fullText() || words(text) < 90) return `<div class="sd-md">${md(text)}</div>`;
    const parts = chunks(text); let shownPlain = false;
    const shown = [], rest = [];
    parts.forEach(c => {
      if ((!shownPlain && isPlain(c)) || keepCallout(c)) { shown.push(c); if (isPlain(c)) shownPlain = true; } else rest.push(c);
    });
    if (!rest.length) return `<div class="sd-md">${md(text)}</div>`;
    const more = rest.join('\n\n');
    return `${shown.length ? `<div class="sd-md">${md(shown.join('\n\n'))}</div>` : ''}<details class="sd-more" data-more="${esc(key)}" ${S.more[key] ? 'open' : ''}><summary>Read more · ${minutes(words(more))}</summary><div class="sd-md">${md(more)}</div></details>`;
  }

  // ---------- Pieces ----------
  const slot = key => `<div data-slot="${esc(key)}"></div>${wrongHtml(key)}`;
  function wrongHtml(key) {
    if (!(key in S.wrong) || !S.session?.tutor) return '';
    const t = S.explain[key] || {loading: true};
    return `<div class="sd-tutor-reply" aria-live="polite">${t.loading ? '<p class="sd-muted">The tutor is looking at your answer…</p>' : t.reply ? `<span class="sd-say-label">Why that was wrong</span>${md(t.reply)}` : `<p class="sd-muted">${esc(t.message)}</p>${btn('Try again', 'explain', `data-key="${esc(key)}"`)}`}</div>`;
  }
  function threadHtml(s) {
    if (!S.session.tutor) return '';
    const thread = S.threads[s.id] || [];
    if (!thread.length && !S.askOpen[s.id]) return `<div class="sd-ask"><button type="button" class="sd-ask-open" data-lp="ask-open" data-sec="${s.id}">Ask the tutor about this section</button></div>`;
    return `<div class="sd-ask">${thread.map(m => `<div class="sd-ask-q"><b>You:</b> ${esc(m.q)}</div><div class="sd-tutor-reply">${m.loading ? '<p class="sd-muted">Thinking…</p>' : m.reply ? md(m.reply) : `<p class="sd-muted">${esc(m.message)}</p>`}</div>`).join('')}
      <form class="sd-ask-form" data-ask="${s.id}"><input class="input" data-draft="ask:${s.id}" maxlength="1500" placeholder="Ask the tutor about this section…" aria-label="Ask the tutor about ${esc(s.title || 'this section')}"><button type="submit" class="button">Ask</button></form></div>`;
  }
  function stageHint(s) { return (STAGE_HINT.find(([re]) => re.test(s.title || '')) || [null, 'Write what you would say or draw for this stage.'])[1]; }
  function attemptHtml(s) {
    return `<div class="sd-attempt"><span class="sd-say-label">Your turn first</span><p>${esc(stageHint(s))} Then compare with the walkthrough.</p><textarea class="textarea" rows="6" maxlength="6000" data-draft="attempt:${s.id}" placeholder="Write it as you would on the whiteboard…"></textarea>
      <div class="sd-actions">${btn(S.busy['attempt:' + s.id] ? 'Comparing…' : S.session.tutor ? 'Compare with the walkthrough →' : 'Show the walkthrough →', 'attempt', `data-sec="${s.id}" ${S.busy['attempt:' + s.id] ? 'disabled' : ''}`, true)}${btn('Skip: just show me', 'attempt-skip', `data-sec="${s.id}"`)}</div></div>`;
  }
  function attemptResultHtml(s) {
    const a = S.session.attempts[s.id];
    if (!a || a.skipped) return '';
    const f = a.feedback;
    return `<details class="sd-attempt-done" open><summary>Your attempt${f ? ' · tutor comparison' : ''}</summary><div class="sd-attempt-text">${esc(a.text)}</div>${f ? `${f.got.length ? `<p><b class="sd-ok">You got:</b> ${f.got.map(inline).join(' · ')}</p>` : ''}${f.missed.length ? `<p><b class="sd-bad">Missing:</b> ${f.missed.map(inline).join(' · ')}</p>` : ''}<p>${inline(f.note)}</p>` : `<p class="sd-muted">${a.message ? esc(a.message) + ' ' : ''}Compare it with the walkthrough below.</p>`}</details>`;
  }
  function body(s) {
    const open = S.open[s.id], full = fullText();
    const blocks = s.parts.filter(p => p.type === 'block');
    const allProse = s.parts.filter(p => p.type === 'md').map(p => p.text).join('\n\n');
    if (s.mode === 'known' && !open) {
      return `<div class="sd-md sd-sec-lead">${md(s.lead)}</div><div class="sd-actions">${btn('Open it anyway', 'open', `data-sec="${s.id}"`)}${blocks.length ? `<span class="sd-muted">${blocks.length} activit${blocks.length === 1 ? 'y' : 'ies'} folded away</span>` : ''}</div>`;
    }
    if (s.mode === 'skim' && !open && !full) {
      return `<div class="sd-md sd-sec-lead">${md(s.lead)}</div>${blocks.map(p => slot(p.key)).join('')}${allProse.trim() ? `<details class="sd-more" data-more="${s.id}:all" ${S.more[s.id + ':all'] ? 'open' : ''}><summary>Read the explanation · ${minutes(words(allProse))}</summary><div class="sd-md">${md(allProse)}</div></details>` : ''}`;
    }
    return s.parts.map((p, i) => p.type === 'md' ? prose(p.text, `${s.id}:${i}`) : slot(p.key)).join('') +
      (s.mode !== 'learn' ? `<div class="sd-actions">${btn('Fold it away again', 'close', `data-sec="${s.id}"`)}</div>` : '');
  }
  function sectionHtml(s) {
    const chip = `<span class="sd-sec-chip is-${s.mode}">${MODE[s.mode][0]} ${MODE[s.mode][1]}</span>`;
    const head = `<header class="sd-sec-head">${chip}<h3 id="sd-sec-${s.id}" tabindex="-1">${s.title ? inline(s.title) : 'The setup'}</h3></header>${s.note ? `<p class="sd-sec-note">${inline(s.note)}</p>` : ''}`;
    const locked = s.attempt && !S.session.attempts[s.id];
    return `<section class="sd-sec is-${s.mode}${locked ? ' is-locked' : ''}" data-sec="${s.id}">${head}${locked ? attemptHtml(s) : attemptResultHtml(s) + body(s) + threadHtml(s)}</section>`;
  }
  function callbackHtml() {
    const items = S.session.callbacks;
    if (!items.length) return '';
    return `<section class="sd-callback"><span class="sd-eyebrow">CALLBACK · FROM EARLIER LESSONS</span><p class="sd-muted">Pulling an older idea back now, mid-lesson, is what makes it stick. These are the ones you are closest to forgetting.</p>${items.map(c => {
      const d = S.fire[c.id];
      if (!d) return `<div class="sd-callback-q"><p class="sd-muted">Loading a question from ${esc(c.lesson_title)}…</p></div>`;
      if (d.error) return `<div class="sd-callback-q"><p class="sd-muted">${esc(d.error)}</p></div>`;
      const q = d.question, r = d.result, fmt = q.format || 'choice';
      const picked = String(r?.answer || d.pick || '').split(',').filter(Boolean);
      const right = r ? (r.correct_answer.ids || [r.correct_answer.id]) : [];
      const input = fmt === 'numeric'
        ? `<div class="sd-numeric"><input class="input" data-cbnum="${c.id}" inputmode="decimal" value="${esc(r?.answer || d.pick || '')}" ${r ? 'disabled' : ''}><span>${esc(q.unit || '')}</span></div>`
        : `<div class="sd-predict-choices">${q.choices.map((ch, i) => `<button type="button" class="sd-option ${picked.includes(ch.id) ? 'is-on' : ''} ${r && right.includes(ch.id) ? 'is-right' : ''} ${r && picked.includes(ch.id) && !right.includes(ch.id) ? 'is-wrong' : ''}" data-lp="cb-pick" data-q="${c.id}" data-c="${ch.id}" ${r ? 'disabled' : ''}><span class="sd-option-key">${String.fromCharCode(65 + i)}</span><span>${inline(ch.text)}</span></button>`).join('')}</div>`;
      return `<div class="sd-callback-q"><span class="sd-say-label">${esc(c.lesson_title)}${fmt === 'multi' ? ' · select all that apply' : ''}</span><div class="sd-prompt">${md(q.prompt)}</div>${input}${r ? `<div class="sd-reveal"><p>${r.correct && !r.revealed ? '<b class="sd-ok">Still got it.</b>' : `<b class="sd-bad">Slipped.</b> It comes back sooner now.`} ${inline(r.explanation)}</p><p class="sd-muted">Answer: ${inline(r.correct_answer.text)}</p></div>` : `<div class="sd-actions">${btn('Check', 'cb-answer', `data-q="${c.id}"`, true)}</div>`}</div>`;
    }).join('')}</section>`;
  }
  function twistHtml() {
    if (!S.session.tutor) return '';
    const t = S.twist;
    if (!t) return `<section class="sd-twist"><span class="sd-say-label">Curveball</span><p>Interviewers change a requirement halfway through to see whether you can adapt. Ask for one written for this lesson.</p>${btn('Throw me a curveball', 'twist', '', true)}</section>`;
    if (t.loading) return `<section class="sd-twist"><span class="sd-say-label">Curveball</span><p class="sd-muted">Writing one for you…</p></section>`;
    if (t.error) return `<section class="sd-twist"><span class="sd-say-label">Curveball</span><p class="sd-muted">${esc(t.error)}</p>${btn('Try again', 'twist')}</section>`;
    const status = {covered: ['✓', 'is-right'], partial: ['◐', 'is-partial'], missing: ['○', 'is-missing'], incorrect: ['✗', 'is-wrong']};
    const done = t.answer ? `<div class="sd-twist-answer">${esc(t.answer)}</div>${t.grade ? `<ul class="sd-rubric">${t.grade.points.map(p => `<li class="${status[p.status][1]}"><span>${status[p.status][0]}</span><div><b>${inline(p.point)}</b><p>${inline(p.note)}</p></div></li>`).join('')}</ul><p>${inline(t.grade.feedback)}</p>` : `<ul>${(t.points || []).map(p => `<li>${inline(p)}</li>`).join('')}</ul>`}<details class="sd-model"><summary>A strong answer</summary>${md(t.model)}</details>${btn('Another curveball', 'twist')}` : '';
    return `<section class="sd-twist"><span class="sd-say-label">Curveball</span><div class="sd-prompt">${md(t.scenario)}</div><p><b>${inline(t.question)}</b></p>${t.answer ? done : `<textarea class="textarea" rows="5" maxlength="6000" data-draft="twist" placeholder="What changes in your design, and why?"></textarea><div class="sd-actions">${btn(S.busy.twist ? 'Grading…' : 'Answer', 'twist-answer', S.busy.twist ? 'disabled' : '', true)}</div>`}</section>`;
  }
  function planBanner() {
    const ss = S.session.sections, n = m => ss.filter(s => s.mode === m).length;
    const computed = S.session.walkthrough
      ? `This is a full design walkthrough. Try the first ${ss.filter(s => s.attempt).length} stages yourself before you see them; ${S.session.tutor ? 'the tutor compares your answer with the walkthrough' : 'then compare your answer with it'}. Later walkthroughs ask you to attempt more.`
      : S.session.fresh ? `Starting from the beginning: ${ss.length} parts, activities first, with the explanation trimmed to its key point.`
      : `${n('known') ? `You have shown ${n('known')} of ${ss.length} parts, so they are folded away. ` : ''}${n('learn')} to learn${n('skim') ? `, ${n('skim')} to skim` : ''}. Each part leads with its key point; open “Read more” when you want depth.`;
    return `<div class="sd-plan"><div><span class="sd-eyebrow">${S.session.intro ? 'TAILORED FOR YOU' : 'YOUR LESSON'}</span><p>${S.session.intro ? inline(S.session.intro) : esc(computed)}</p>${S.notesLoading ? '<p class="sd-muted">The tutor is tailoring the notes…</p>' : ''}</div>
      <div class="sd-plan-actions">${S.session.walkthrough ? '' : btn('Redo the warm-up', 'replan')}<label class="sd-toggle"><input type="checkbox" data-lp-full ${fullText() ? 'checked' : ''}> Full text everywhere</label></div></div>`;
  }
  function warmupHtml() {
    const probes = S.session.probes, answered = probes.filter(k => k in S.answered).length;
    return `<section class="sd-warmup"><span class="sd-eyebrow">WARM-UP · ${probes.length} QUESTION${probes.length === 1 ? '' : 'S'}</span><h3>First, show me what you already know</h3><p>Each question stands for one part of the lesson. Get it right and that part folds away to a summary; miss it and we work through it. Skip any you would only be guessing at.</p>
      ${probes.map((k, i) => `<div class="sd-probe"><span class="sd-probe-n">${i + 1}</span>${slot(k)}</div>`).join('')}
      <label class="sd-warmup-note"><span>Anything you already know, or want from this lesson? <small>Optional. The tutor uses it.</small></span><textarea class="textarea" rows="2" maxlength="1000" data-draft="note" placeholder="e.g. I use Redis daily but never thought about eviction"></textarea></label>
      <div class="sd-actions">${btn(S.busy.plan ? 'Building…' : `Build my lesson →`, 'plan', S.busy.plan ? 'disabled' : '', answered === probes.length)}${btn('I’m new to this: teach me everything', 'fresh')}<span class="sd-muted">${answered} of ${probes.length} answered</span></div></section>`;
  }
  function finaleHtml() {
    const fin = S.session.finale;
    return `<section class="sd-finale"><span class="sd-eyebrow">PUT IT TOGETHER</span><h3 id="sd-sec-finale" tabindex="-1">Use it as you would in an interview</h3>${twistHtml()}${fin.map(slot).join('')}
      ${S.session.redesign ? `<div class="sd-redesign-note"><b>Coming back later:</b> in a few days this design returns as a blank-page redesign from memory, scheduled with the rest of your reviews. ${btn('Try it now', 'redesign')}</div>` : ''}</section>`;
  }
  function html() {
    if (S.error && !S.session) return `<div class="sd-error">${esc(S.error)}</div>${btn('Try again', 'reload')}`;
    if (!S.session) return '<p class="sd-muted">Getting your lesson ready…</p>';
    if (!S.session.planned) return warmupHtml();
    const ss = S.session.sections, mid = Math.floor(ss.length / 2);
    return `${S.error ? `<div class="sd-error" role="alert">${esc(S.error)}</div>` : ''}${planBanner()}${ss.map((s, i) => sectionHtml(s) + (i === mid - 1 ? callbackHtml() : '')).join('')}${ss.length < 2 ? callbackHtml() : ''}${finaleHtml()}`;
  }
  function railHtml() {
    if (!S.session?.planned) return '<span class="sd-eyebrow">IN THIS LESSON</span><p class="sd-muted">Warm-up first.</p>';
    return `<span class="sd-eyebrow">YOUR PATH</span>${S.session.sections.map(s => `<a href="#sd-sec-${s.id}" data-jump="sd-sec-${s.id}" class="is-${s.mode}"><i>${MODE[s.mode][0]}</i>${inline(s.title || 'The setup')}</a>`).join('')}<a href="#sd-sec-finale" data-jump="sd-sec-finale"><i>★</i>Put it together</a><a href="#sd-check" data-jump="sd-check"><i>?</i>Lesson check</a>`;
  }

  // ---------- Paint and wire ----------
  function paint() {
    if (!S) return;
    const keep = {};
    S.host.querySelectorAll('[data-draft]').forEach(n => { keep[n.dataset.draft] = n.value; });
    Object.assign(S.drafts, keep);
    Object.values(S.nodes).forEach(n => n.remove());
    S.host.innerHTML = html();
    S.rail.innerHTML = railHtml();
    S.host.querySelectorAll('[data-slot]').forEach(n => { const node = S.nodes[n.dataset.slot]; if (node) n.replaceWith(node); else n.remove(); });
    S.host.querySelectorAll('[data-draft]').forEach(n => {
      n.value = S.drafts[n.dataset.draft] || '';
      n.addEventListener('input', () => { S.drafts[n.dataset.draft] = n.value; });
    });
    S.host.querySelectorAll('details[data-more]').forEach(d => d.addEventListener('toggle', () => { S.more[d.dataset.more] = d.open; }));
    S.host.querySelectorAll('[data-lp]').forEach(n => n.addEventListener('click', () => act(n.dataset.lp, n)));
    S.host.querySelectorAll('[data-ask]').forEach(f => f.addEventListener('submit', e => { e.preventDefault(); act('ask', f); }));
    S.host.querySelector('[data-lp-full]')?.addEventListener('change', e => { store.set('sd-lesson-full', e.target.checked ? '1' : null); paint(); });
    S.host.querySelectorAll('[data-cbnum]').forEach(n => n.addEventListener('input', () => { S.fire[n.dataset.cbnum].pick = n.value.trim(); }));
    [S.host, S.rail].forEach(root => root.querySelectorAll('[data-jump]').forEach(n => n.addEventListener('click', e => {
      e.preventDefault(); const t = document.getElementById(n.dataset.jump); t?.scrollIntoView({behavior: 'smooth', block: 'start'}); t?.focus?.({preventScroll: true});
    })));
    if (S.session?.planned) loadCallbacks();
  }
  async function guarded(key, fn) {
    if (S.busy[key]) return;
    S.busy[key] = true; S.error = ''; paint();
    try { await fn(); } catch (e) { S.error = e.message; } finally { if (S) { S.busy[key] = false; paint(); } }
  }
  async function act(action, node) {
    const id = S.id, sec = node.dataset?.sec;
    if (action === 'reload') return load();
    if (action === 'open' || action === 'close') { S.open[sec] = action === 'open'; return paint(); }
    if (action === 'ask-open') { S.askOpen[sec] = true; paint(); return S.host.querySelector(`[data-draft="ask:${sec}"]`)?.focus(); }
    if (action === 'plan' || action === 'fresh') return guarded('plan', async () => {
      await Promise.all(S.pending);
      S.session = await call(`/course/lessons/${id}/plan`, 'POST', {probes: S.session.probes.filter(k => k in S.answered), note: S.drafts.note || '', fresh: action === 'fresh'});
      window.scrollTo({top: S.host.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth'});
      notes();
    });
    if (action === 'replan') return guarded('plan', async () => { S.session = await call(`/course/lessons/${id}/plan/reset`, 'POST', {}); S.answered = {}; });
    if (action === 'attempt' || action === 'attempt-skip') {
      const text = (S.drafts['attempt:' + sec] || '').trim();
      if (action === 'attempt' && text.length < 10) { S.host.querySelector(`[data-draft="attempt:${sec}"]`)?.focus(); return; }
      return guarded('attempt:' + sec, async () => {
        const res = await call(`/course/lessons/${id}/attempt`, 'POST', {section: sec, text, skip: action === 'attempt-skip'});
        S.session.attempts[sec] = res;
      });
    }
    if (action === 'explain') return explain(node.dataset.key);
    if (action === 'ask') {
      const sid = node.dataset.ask, q = (S.drafts['ask:' + sid] || '').trim();
      if (!q) return;
      const thread = S.threads[sid] = S.threads[sid] || [], msg = {q, loading: true};
      thread.push(msg); S.drafts['ask:' + sid] = ''; paint();
      try { Object.assign(msg, await call(`/course/lessons/${id}/tutor`, 'POST', {section: sid, question: q}), {loading: false}); }
      catch (e) { Object.assign(msg, {loading: false, message: e.message}); }
      return paint();
    }
    if (action === 'twist') {
      S.twist = {loading: true}; paint();
      try { S.twist = await call(`/course/lessons/${id}/twist`, 'POST', {request_id: rid()}); }
      catch (e) { S.twist = {error: e.message}; }
      return paint();
    }
    if (action === 'twist-answer') {
      const text = (S.drafts.twist || '').trim();
      if (text.length < 10) { S.host.querySelector('[data-draft="twist"]')?.focus(); return; }
      return guarded('twist', async () => { S.twist = await call(`/course/twists/${S.twist.id}/answer`, 'POST', {text}); S.drafts.twist = ''; });
    }
    if (action === 'cb-pick') {
      const d = S.fire[node.dataset.q], fmt = d.question.format || 'choice', c = node.dataset.c;
      if (fmt === 'multi') { const set = new Set(String(d.pick || '').split(',').filter(Boolean)); set.has(c) ? set.delete(c) : set.add(c); d.pick = [...set].join(','); }
      else d.pick = c;
      return paint();
    }
    if (action === 'cb-answer') {
      const qid = node.dataset.q, d = S.fire[qid];
      if (!d.pick) return;
      return guarded('cb:' + qid, async () => {
        const res = await call(`/quickfire/${d.id}/answer`, 'POST', {question_id: qid, answer: d.pick, elapsed_sec: 0});
        S.fire[qid] = {...res, pick: d.pick};
        window.DesignLedger?.invalidate();
      });
    }
    if (action === 'redesign') return window.SystemDesign.openView('redesign/' + id);
  }
  // A wrong answer gets the tutor's diagnosis straight away; the revealed answer is already on screen.
  async function explain(key) {
    const lesson = S.id, s = S.session?.sections.find(x => x.blocks.includes(key)) || {id: 's0'};
    S.explain[key] = {loading: true}; paint();
    let res;
    try { res = await call(`/course/lessons/${lesson}/tutor`, 'POST', {section: s.id, block: key, answer: S.wrong[key] || '', question: 'I got this activity wrong. Explain what I misunderstood and the reasoning to the right answer.'}); }
    catch (e) { res = {message: e.message}; }
    if (S?.id !== lesson) return;
    S.explain[key] = res.reply || res.message ? res : {message: 'The tutor had nothing to add. The explanation above covers it.'};
    paint();
  }
  function loadCallbacks() {
    for (const c of S.session.callbacks) {
      if (S.fire[c.id]) continue;
      S.fire[c.id] = null;
      const key = `sd-callback:${S.id}:${c.id}`;
      let request = null;
      try { request = sessionStorage.getItem(key); } catch { /* best effort */ }
      if (!request) { request = rid(); try { sessionStorage.setItem(key, request); } catch { /* best effort */ } }
      const lesson = S.id;
      call('/quickfire/next', 'POST', {request_id: request, question_id: c.id})
        .then(d => { if (S?.id === lesson) { S.fire[c.id] = d; paint(); } })
        .catch(e => { if (S?.id === lesson) { S.fire[c.id] = {error: e.message}; paint(); } });
    }
  }
  async function notes() {
    if (!S.session.notes_pending) return;
    const lesson = S.id;
    S.notesLoading = true; paint();
    try { const next = await call(`/course/lessons/${lesson}/plan/notes`, 'POST', {}); if (S?.id === lesson) S.session = next; }
    catch { /* the computed plan stands */ }
    finally { if (S?.id === lesson) { S.notesLoading = false; paint(); } }
  }
  async function load() {
    const lesson = S.id;
    S.error = ''; paint();
    try {
      let s = await call(`/course/lessons/${lesson}/session`);
      if (!s.planned && (s.walkthrough || !s.probes.length)) s = await call(`/course/lessons/${lesson}/plan`, 'POST', {probes: []});
      if (S?.id !== lesson) return;
      S.session = s; paint(); notes();
    } catch (e) { if (S?.id === lesson) { S.error = e.message; paint(); } }
  }

  // ctx: {saved, done(key, correct) → Promise, recall(block, text), pitch(block, text, followup)}
  function mount(slotNode, railNode, lesson, ctx) {
    if (S?.id !== lesson.id) {
      S?.handle?.destroy();
      S = {id: lesson.id, lesson, session: null, host: document.createElement('div'), rail: document.createElement('nav'), nodes: {},
        open: {}, more: {}, threads: {}, askOpen: {}, explain: {}, wrong: {}, answered: {}, drafts: {}, busy: {}, fire: {}, twist: null, pending: [], error: ''};
      S.host.className = 'sd-player'; S.rail.className = 'sd-rail-card sd-outline sd-path-rail';
      const tmp = document.createElement('div');
      tmp.innerHTML = lesson.blocks.filter(b => b.type !== 'md').map(B().renderBlock).join('');
      S.handle = B().wire(tmp, lesson, {
        saved: ctx.saved, recall: ctx.recall, pitch: ctx.pitch,
        done(key, correct) {
          const node = S.nodes[key];
          S.answered[key] = correct;
          if (correct === false) S.wrong[key] = node?.dataset.answer || '';
          const p = Promise.resolve(ctx.done(key, correct)).catch(() => {});
          S.pending.push(p);
          if (correct === false && S.session?.tutor) setTimeout(() => explain(key), 0);
          else if (!S.session?.planned) setTimeout(paint, 0);
        },
      });
      tmp.querySelectorAll(':scope > [data-block]').forEach(n => { S.nodes[n.dataset.block] = n; });
      load();
    }
    slotNode?.replaceWith(S.host);
    railNode?.replaceWith(S.rail);
  }
  function reset() { S?.handle?.destroy(); S = null; }
  window.DesignLesson = {mount, reset, _test: {chunks, prose: (t, k) => { S = S || {more: {}}; return prose(t, k); }}};
})();
