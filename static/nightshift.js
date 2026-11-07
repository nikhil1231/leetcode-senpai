// Night Shift: the on-call game for the Fundamentals course (a course view: fundamentals/nightshift).
// You're paged at Ripple; you read the channel, run commands on the box, act, and once it's stable you
// say what happened and what fixes it for good. The incident runs in nightshift-engine.js (pure); the
// levels are simulators/nightshift.json; runs, evidence and the story live on the server
// (/api/nightshift). With the model on, the shell answers any command and Priya answers questions;
// without it, the scripted commands, Priya's hints and a templated post-mortem make the whole game.
(function () {
  'use strict';
  const T = window.Tracks;
  if (!T) return;
  const { esc, md, btn, wireActions } = T;
  const E = () => window.NightShiftEngine;
  const call = (path, method = 'GET', body) => window.H.api('/nightshift' + path, method, body);
  const toast = (m, k) => window.H.toast?.(m, k);
  const CAST = { priya: ['Priya', 'SRE'], sam: ['Sam', 'Product'], marcus: ['Marcus', 'CTO'], jo: ['Jo', 'Junior engineer'], you: ['You', ''] };
  let data = null;
  const levels = async () => data || (data = await (await fetch('/simulators/nightshift.json', { cache: 'no-cache' })).json());
  const stars = n => `<span class="ns-stars" aria-label="${n} of 3 stars">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>`;
  const clock = (start, m) => { const [h, mm] = start.split(':').map(Number), t = h * 60 + mm + m; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  async function nightshift(ctx) {
    const [d, ov] = await Promise.all([levels(), call('').catch(() => ({ enabled: false, progress: { levels: {}, cleared: 0, total: 0 }, recent: [] }))]);
    const titles = await ctx.call('').then(o => Object.fromEntries(o.course.flatMap(c => c.lessons.map(l => [l.id, l.title.split(' - ')[0]])))).catch(() => ({}));
    if (ctx.stale()) return;
    if (ctx.arg) { const L = d.levels.find(l => l.id === ctx.arg); if (L) return shift(ctx, L, ov, titles); }
    const best = id => ov.progress.levels[id]?.best || 0;
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">NIGHT SHIFT · ${ov.progress.cleared} OF ${d.levels.length} CLEARED</span><h2 tabindex="-1">You're on call at Ripple.</h2>
        <p>Each page is a real kind of production incident from this course. Read the channel, run commands on the box, act, and once it's stable, say what happened and what fixes it for good. Every command costs a minute, and users are hurting while you look.${ov.enabled ? ' The shell answers any command you type, and Priya is on the channel.' : ''}</p></div>
      <div class="ns-levels">${d.levels.map(l => `<button type="button" class="sd-lesson-card ns-card ${best(l.id) >= 2 ? 'is-done' : ''}" data-t="open" data-id="${esc(l.id)}">
          <span class="sd-eyebrow">${esc(l.clock)} · PAR ${l.par} MIN</span><h3>${esc(l.title)}</h3><p class="tr-card-sum">${esc(l.kicker)}</p>
          <span><span>${l.lessons.map(x => esc(titles[x] || x)).join(' · ')}</span><span>${best(l.id) ? stars(best(l.id)) : 'Take the page →'}</span></span></button>`).join('')}</div>`;
    wireActions(ctx.root, { open: n => ctx.go('nightshift/' + n.dataset.id) });
  }

  function shift(ctx, L, ov, titles) {
    let s = E().start(L), busy = false, chat = [], posted = null;
    ctx.root.innerHTML = `<div class="sd-breadcrumb">${btn('← Night Shift', 'back')}<span>/ ${esc(L.title)}</span></div>
      <div class="ns-grid">
        <section class="ns-channel" aria-label="Incident channel"><header><b>#incident</b><span class="ns-clock" data-clock></span></header><div class="ns-msgs" data-msgs aria-live="polite"></div>
          <div class="ns-ask">${ov.enabled ? `<form data-ask><input class="input" maxlength="300" placeholder="Ask Priya…" aria-label="Ask Priya"><button class="button" type="submit">Ask</button></form>` : ''}${btn('Ask Priya for a hint', 'hint')}</div></section>
        <section class="ns-term" aria-label="Terminal"><div class="ns-screen" data-screen></div>
          <div class="ns-cmds" data-cmds></div>
          <form class="ns-prompt" data-free><span>$</span><input maxlength="300" placeholder="${ov.enabled ? 'Type any command…' : 'Type a command from the list…'}" aria-label="Command" autocomplete="off" spellcheck="false"></form></section>
        <aside class="ns-side"><div class="ns-status" data-status></div><h4>Actions</h4><div class="ns-actions" data-actions></div><div data-resolve></div></aside>
      </div><div data-review></div>`;
    const $ = sel => ctx.root.querySelector(sel);
    const paint = () => {
      $('[data-clock]').textContent = clock(L.clock, s.minute);
      $('[data-msgs]').innerHTML = s.log.filter(r => r.kind === 'page' || r.kind === 'chat' || r.kind === 'sys').map(r => r.kind === 'page' ? `<div class="ns-page"><b>PAGE ${esc(clock(L.clock, r.at))}</b><pre>${esc(r.text)}</pre></div>`
        : r.kind === 'sys' ? `<div class="ns-sys">${esc(r.text)}</div>`
        : `<div class="ns-msg${r.hint ? ' is-hint' : ''}"><b>${esc(CAST[r.who]?.[0] || r.who)}</b><small>${esc(clock(L.clock, r.at))}</small><p>${esc(r.text)}</p></div>`).join('');
      $('[data-screen]').innerHTML = s.log.filter(r => r.kind === 'cmd' || r.kind === 'act').map(r => r.kind === 'cmd' ? `<div class="ns-line"><span class="ns-ps">[${esc(clock(L.clock, r.at))}] $</span> ${esc(r.cmd)}${r.free ? ' <em>(typed)</em>' : ''}</div><pre>${esc(r.out)}</pre>`
        : `<div class="ns-act is-${esc(r.effect)}"><b>▶ ${esc(r.label)}</b><p>${esc(r.text)}</p></div>`).join('') || '<p class="ns-hint">Pick a command below, or type one. Nothing has been run yet.</p>';
      const groups = {};
      L.commands.forEach(c => (groups[c.group] ||= []).push(c));
      $('[data-cmds]').innerHTML = Object.entries(groups).map(([g, cs]) => `<div class="ns-group"><span>${esc(g)}</span>${cs.map(c => `<button type="button" class="ns-cmd${s.ran.includes(c.id) ? ' is-ran' : ''}" data-t="cmd" data-id="${esc(c.id)}" title="${esc(c.cmd)}" ${s.closed || busy ? 'disabled' : ''}>${esc(c.cmd.length > 46 ? c.cmd.slice(0, 44) + '…' : c.cmd)}</button>`).join('')}</div>`).join('');
      const live = s.stable === 'fix' ? ['ok', 'MITIGATED'] : s.stable === 'temp' ? ['warn', 'HOLDING'] : ['bad', 'FIRING'];
      $('[data-status]').innerHTML = `<div class="ns-light is-${live[0]}">${live[1]}</div><div class="ns-figs"><div><b>${s.minute}</b><span>minutes in (par ${L.par})</span></div><div><b>${Math.round(s.impact).toLocaleString('en')}</b><span>${esc(L.impact.unit)}</span></div></div>`;
      $('[data-actions]').innerHTML = L.actions.map(a => `<button type="button" class="ns-action${s.acted.includes(a.id) ? ' is-done' : ''}" data-t="act" data-id="${esc(a.id)}" ${s.closed || busy ? 'disabled' : ''}>${esc(a.label)}<small>about ${a.minutes} min</small></button>`).join('');
      $('[data-resolve]').innerHTML = s.stable && !s.closed && !$('[data-review]').innerHTML ? `<p class="sim-note">${s.stable === 'temp' ? "It's holding for now. You can resolve it, or keep going until it's fixed for good." : "It's stable."}</p>${btn('Resolve and write it up', 'resolve', '', true)}` : '';
      const scr = $('[data-screen]'); scr.scrollTop = scr.scrollHeight;
      const msgs = $('[data-msgs]'); msgs.scrollTop = msgs.scrollHeight;
    };
    // Handed over (too long without it stable): straight to the result, no review questions.
    const after = () => { paint(); if (s.handedOver && !$('.ns-result')) finish(); };
    const review = () => {
      const q = (kind, Q) => `<section class="sd-panel ns-q" data-q="${kind}"><span class="sd-eyebrow">${kind === 'diagnosis' ? 'ROOT CAUSE' : 'LASTING FIX'}</span><h3>${esc(Q.prompt)}</h3>
        <div class="sd-predict-choices">${Q.choices.map((c, i) => `<button type="button" class="sd-option" data-t="answer" data-kind="${kind}" data-i="${i}"><span class="sd-option-key">${String.fromCharCode(65 + i)}</span><span>${esc(c)}</span></button>`).join('')}</div><div class="ns-explain" hidden></div></section>`;
      $('[data-review]').innerHTML = q('diagnosis', L.diagnosis) + q('fix', L.fix);
      $('[data-review]').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      paint();
    };
    const finish = async () => {
      if (!s.result) s = E().close(s, L);
      paint();
      const r = s.result;
      const slot = document.createElement('section'); slot.className = 'sd-panel ns-result';
      slot.innerHTML = `<span class="sd-eyebrow">SHIFT OVER</span><h3>${stars(r.stars)} ${r.handedOver ? 'Handed over.' : r.stars === 3 ? 'Textbook.' : r.stars === 2 ? 'Fixed, and you know why.' : r.stars === 1 ? 'Stable, for now.' : ''}</h3>
        <div class="sim-stats"><div><b>${r.minutes} min</b><span>to stable (par ${L.par})</span></div><div><b>${r.impact.toLocaleString('en')}</b><span>${esc(L.impact.unit)}</span></div><div><b>${r.commands}</b><span>commands run</span></div><div class="${r.risky ? 'is-bad' : ''}"><b>${r.risky}</b><span>risky moves</span></div></div>
        ${r.notes.length ? `<ul class="sim-notes">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}<p>${esc(L.debrief)}</p>
        <div class="ns-pm" data-pm><p class="sd-muted">Writing the post-mortem…</p></div>
        <div class="sd-actions">${btn('Take this page again', 'again', '', true)}${btn('All incidents', 'back')}${L.lessons.map(x => btn('Lesson: ' + (titles[x] || x), 'lesson', `data-id="${esc(x)}"`)).join('')}</div>`;
      $('[data-review]').appendChild(slot);
      try {
        posted = await call('/runs', 'POST', { key: rid(), level: L.id, stars: r.stars, minutes: r.minutes, impact: r.impact, risky: r.risky, hints: r.hints,
          diagnosis: r.diagnosis, fix: r.fix, lasting: r.lasting,
          log: s.log.slice(-150).map(x => ({ kind: x.kind, at: x.at || 0, who: x.who || '', cmd: x.cmd || '', out: String(x.out || '').slice(0, 3900), label: x.label || '', text: String(x.text || '').slice(0, 1100) })) });
        if (posted.first_clear) toast('First clear: Ripple will remember this one.');
        const pm = await call(`/runs/${posted.id}/postmortem`, 'POST');
        if (!ctx.stale()) slot.querySelector('[data-pm]').innerHTML = `<details open><summary>${pm.model ? "Priya's post-mortem" : 'Post-mortem'}</summary><div class="sd-md">${md(pm.text)}</div></details>`;
      } catch (e) { if (!ctx.stale()) slot.querySelector('[data-pm]').innerHTML = `<p class="tr-error">${esc(e.message)}</p>`; }
    };
    wireActions(ctx.root, {
      back: () => ctx.go('nightshift'), again: () => { s = E().start(L); chat = []; $('[data-review]').innerHTML = ''; paint(); window.scrollTo?.(0, 0); },
      lesson: n => ctx.go('lesson/' + n.dataset.id),
      cmd: n => { s = E().run(s, L, n.dataset.id); after(); },
      act: n => { s = E().act(s, L, n.dataset.id); after(); },
      hint: () => { const before = s.hints; s = E().hint(s, L); if (s.hints === before) toast("Priya's out of hints. Look at what you've run so far."); paint(); },
      resolve: () => review(),
      answer: n => {
        const kind = n.dataset.kind, i = Number(n.dataset.i), Q = L[kind], box = n.closest('[data-q]');
        if (s.answers[kind] != null) return;
        s = E().answer(s, kind, i);
        box.querySelectorAll('[data-t=answer]').forEach(b => { b.disabled = true; b.classList.toggle('is-right', Number(b.dataset.i) === Q.answer); b.classList.toggle('is-wrong', Number(b.dataset.i) === i && i !== Q.answer); });
        const ex = box.querySelector('.ns-explain'); ex.hidden = false; ex.innerHTML = `<p>${i === Q.answer ? '<b class="sd-ok">Right.</b> ' : '<b class="sd-bad">Not quite.</b> '}${esc(Q.explain)}</p>`;
        if (s.answers.diagnosis != null && s.answers.fix != null) finish();
      },
    });
    $('[data-free]').addEventListener('submit', async e => {
      e.preventDefault();
      const input = e.target.querySelector('input'), line = input.value.trim();
      if (!line || s.closed || busy) return;
      input.value = '';
      const known = L.commands.find(c => c.cmd.split(/\s+/).slice(0, 3).join(' ') === line.split(/\s+/).slice(0, 3).join(' ') || c.cmd === line);
      if (known) { s = E().run(s, L, known.id); after(); return; }
      if (!ov.enabled) { s = E().freeform(s, L, line, `${line.split(/\s+/)[0]}: not available in this drill. Try one of the commands listed below.`); after(); return; }
      busy = true; paint();
      try {
        const r = await call('/shell', 'POST', { level: L.id, command: line, stable: !!s.stable, log: s.log.slice(-40).map(x => ({ kind: x.kind, at: x.at || 0, who: x.who || '', cmd: x.cmd || '', out: String(x.out || '').slice(0, 3900), label: x.label || '', text: String(x.text || '').slice(0, 1100) })) });
        s = E().freeform(s, L, line, r.out);
      } catch (err) { toast(err.message, 'error'); }
      busy = false; after();
    });
    $('[data-ask]')?.addEventListener('submit', async e => {
      e.preventDefault();
      const input = e.target.querySelector('input'), q = input.value.trim();
      if (!q || busy) return;
      input.value = '';
      chat.push({ role: 'user', text: q });
      s = { ...s, log: [...s.log, { kind: 'chat', at: s.minute, who: 'you', text: q }] };
      busy = true; paint();
      try {
        const r = await call('/priya', 'POST', { level: L.id, stable: !!s.stable, messages: chat.slice(-20), log: s.log.slice(-40).map(x => ({ kind: x.kind, at: x.at || 0, who: x.who || '', cmd: x.cmd || '', out: String(x.out || '').slice(0, 3900), label: x.label || '', text: String(x.text || '').slice(0, 1100) })) });
        chat.push({ role: 'assistant', text: r.reply });
        s = { ...s, log: [...s.log, { kind: 'chat', at: s.minute, who: 'priya', text: r.reply }] };
      } catch (err) { toast(err.message, 'error'); }
      busy = false; paint();
    });
    paint();
  }

  // Lessons offer the incidents that use them.
  async function chips(slot, track, lesson) {
    if (!slot || track !== 'fundamentals') return;
    const d = await levels().catch(() => null), ls = (d?.levels || []).filter(l => l.lessons.includes(lesson));
    if (!ls.length || !slot.isConnected) return;
    slot.innerHTML = `<div class="rp-practice"><b>Take the page in Night Shift:</b>${ls.map(l => `<button type="button" class="rp-chip" data-ns="${esc(l.id)}">${esc(l.title)}</button>`).join('')}</div>`;
    slot.onclick = e => { const b = e.target.closest('[data-ns]'); if (b) window.AppSections?.select('fundamentals', 'nightshift/' + b.dataset.ns); };
  }

  T.register('course', { nightshift });
  window.NightShift = { chips, levels };
})();
