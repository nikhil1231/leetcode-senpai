// Senpai: today's session, the plan and its limits, approvals, follow-through, teaching and history.
(function () {
  const { $, api, escapeHtml: esc, beginRender, toast } = window.H;
  const App = window.App;
  const STATUS = {
    needs_check: ['Needs a check', 'is-warn'], overdue: ['Reviews overdue', 'is-warn'], stale: ['Not seen recently', 'is-muted'],
    untested: ['No evidence yet', 'is-muted'], practised: ['Practised · technique unconfirmed', ''], developing: ['Developing', ''], demonstrated: ['Demonstrated', 'is-good'],
  };
  const ACTIVITY = { check: 'Check', retrieval: 'Retrieval', implementation: 'Implementation', explanation: 'Explanation', design: 'Design' };
  const DECISION = { auto: 'Applied', approval: 'Needs approval', approved: 'Approved', rejected: 'Rejected', defer: 'Deferred',
    reject: 'Refused', user: 'You changed', duplicate: 'Duplicate' };
  const pct = (x) => `${Math.round((x || 0) * 100)}%`;
  const day = (ts) => ts ? new Date(ts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—';
  const when = (ts) => ts ? new Date(ts * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';
  let data = null;
  let rendering = false;
  let teachState = null;   // {capability, mode, history: [{role, text}], busy}
  let sessionOpts = { budget: null, mode: null, objective: '' };

  // ---- starting a block reuses the app's own flows ----------------------------------------------
  function startBlock(a) {
    if (a.type === 'problem') {
      App.startFlow(a.slug, a.kind, a.mode, a.title, a.category);
      if (a.interview) setTimeout(() => {
        const iv = $('#predict-interview'); const lc = $('#predict-on-leetcode');
        if (lc) lc.checked = false;
        if (iv) { iv.checked = true; iv.dispatchEvent(new Event('change')); }
      }, 0);
    } else if (a.type === 'application') window.openLearningApplication(a.id);
    else if (a.type === 'sequence') window.openLearningSequence(a.sequence);
    else if (a.type === 'quickfire') { window.PracticePreset?.({ topic: a.topic }); App.goTab('practice'); }
    else if (a.type === 'sd_lesson') window.AppSections?.select('system-design', 'lesson/' + a.id);
    else if (a.type === 'sd_quickfire') window.AppSections?.select('system-design', 'quickfire');
    else if (a.type === 'sd_cases') window.AppSections?.select('system-design', 'cases');
    else if (a.type === 'teach') { App.goTab('senpai'); setTimeout(() => openTeach(a.capability_id), 50); }
  }

  const blockHtml = (b) => `<li class="sp-block${b.done ? ' is-done' : ''}">
      <div class="sp-block-main"><span class="sp-chip">${esc(ACTIVITY[b.activity] || b.activity)}</span>
        <b>${esc(b.title)}</b><span class="sp-min">${b.minutes} min</span>${b.done ? '<span class="sp-chip is-good">Done</span>' : ''}</div>
      <p>${esc(b.why)}</p>
      ${b.done ? '' : `<button type="button" class="button is-small" data-block="${esc(b.id)}">Start</button>`}</li>`;

  function bindBlocks(root, session) {
    root.querySelectorAll('[data-block]').forEach((btn) => btn.addEventListener('click', () => {
      const b = session.blocks.find((x) => x.id === btn.dataset.block);
      if (b) startBlock(b.action);
    }));
  }

  // ---- Today card ---------------------------------------------------------------------------------
  async function mountToday() {
    const box = $('#daily-coach-summary');
    if (!box) return;
    try {
      const s = await api('/senpai/today');
      if (!box.isConnected) return;
      const open = s.blocks.filter((b) => !b.done);
      box.innerHTML = `<section class="sp-today"><div class="sp-today-head"><div><span class="dc-eyebrow">Senpai · today</span>
          <h2>${open.length ? `${open.reduce((n, b) => n + b.minutes, 0)} minutes planned` : (s.blocks.length ? 'Session complete' : 'Nothing prepared')}</h2></div>
          <button class="button is-small is-ghost" type="button" data-open-senpai>Open Senpai</button></div>
        ${open.length ? `<ol class="sp-blocks">${open.slice(0, 3).map(blockHtml).join('')}</ol>${open.length > 3 ? `<p class="help">+${open.length - 3} more in Senpai.</p>` : ''}`
          : `<p class="help">${esc(s.note || 'Everything in today\'s session is done. Prepare another in Senpai if you want more.')}</p>`}</section>`;
      bindBlocks(box, s);
      box.querySelector('[data-open-senpai]').addEventListener('click', () => App.goTab('senpai'));
    } catch (e) {
      window.DailyCoach?.mountSummary();
    }
  }

  // ---- Senpai tab ---------------------------------------------------------------------------------
  function header(d) {
    const js = d.job_scout;
    const synced = d.settings.target_job_source === 'job_scout';
    const target = d.settings.target_job;
    const fresh = js.configured ? (js.error ? `Job Scout unreachable (${esc(js.error)}); using the copy from ${when(js.fetched_at)}.`
      : `Synced from Job Scout ${when(js.fetched_at)}.`) : 'Job Scout is not connected on this server; using the target saved here.';
    return `<header class="dc-hero sp-hero"><span class="dc-eyebrow">Senpai</span><h2>Learn with direction</h2>
      <p class="dc-goal-copy">${target ? esc(target) : 'No career target yet.'}</p>
      <p class="help">${fresh} ${js.configured ? `<a href="${esc(js.links.settings)}" target="_blank" rel="noopener">Edit target in Job Scout</a>` : ''}
        ${!synced && !js.configured ? '<button type="button" class="button is-ghost is-small" data-settings>Edit in Settings</button>' : ''}</p>
      <div class="dc-actions">${js.configured ? '<button type="button" class="button is-small" data-sync>Sync now</button>' : ''}
        <button type="button" class="button is-small is-ghost" data-weekly>Run weekly review</button>
        <button type="button" class="button is-small is-ghost" data-settings>Preferences &amp; charter</button></div></header>`;
  }

  function proposalsHtml(d) {
    if (!d.proposals.length) return '';
    return `<section class="dc-panel sp-approvals"><h3>Waiting for your approval</h3><ul class="sp-list">${d.proposals.map((p) => `
      <li><b>${esc(describe(p.change, d))}</b><p>${esc(p.rationale || '')}</p><p class="help">${esc((p.reasons || []).join(' '))} · ${esc(p.source)} · ${day(p.created_at)}</p>
        <div class="dc-actions"><button type="button" class="button is-small is-primary" data-approve="${esc(p.id)}">Approve</button>
        <button type="button" class="button is-small is-ghost" data-reject="${esc(p.id)}">Reject</button></div></li>`).join('')}</ul></section>`;
  }

  function describe(c, d) {
    if (!c) return 'Plan created';
    const name = (id) => (d.capabilities.find((x) => x.id === id) || {}).name || id;
    switch (c.kind) {
      case 'rebalance': return 'Rebalance time: ' + Object.entries(c.target || {}).map(([b, v]) => `${d.buckets[b] || b} ${pct(v)}`).join(', ');
      case 'focus_add': return 'Focus on ' + name(c.capability_id);
      case 'focus_remove': return 'Stop focusing on ' + name(c.capability_id);
      case 'overlay_add': return 'Temporary priority: ' + (c.label || '');
      case 'overlay_remove': return 'Remove temporary priority';
      case 'objective_add': return 'New objective: ' + (c.title || '');
      case 'objective_complete': return 'Mark objective done';
      case 'objective_remove': return 'Retire objective';
      case 'set_protected': return `Protect ${pct(c.share)} for ${d.buckets[c.bucket] || c.bucket}`;
      case 'weekly_minutes': return `Weekly time: ${c.minutes} min`;
      case 'checkpoint': return 'Later check: ' + name(c.capability_id);
      case 'intervention_outcome': return `Advice outcome: ${c.outcome}`;
      default: return c.kind || 'Change';
    }
  }

  function sessionHtml(d, s) {
    const objectives = d.plan_summary.objectives;
    const opt = (v, cur, label) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
    return `<section class="dc-panel sp-session"><div class="sp-row"><h3>Today's session</h3><span class="help">${s.planned_minutes} of ${s.budget_minutes} min · ${esc(s.mode)} · plan r${s.plan_revision}</span></div>
      ${s.blocks.length ? `<ol class="sp-blocks">${s.blocks.map(blockHtml).join('')}</ol>` : `<p>${esc(s.note)}</p>`}
      ${s.outside?.length ? `<p class="help">Outside the app this week: ${s.outside.map((o) => `${esc(o.label)} ~${o.minutes_per_week} min`).join(' · ')}.</p>` : ''}
      <div class="dc-toolbar sp-controls">
        <label>Time<select class="input" id="sp-budget">${[20, 30, 45, 60, 90, 120].map((m) => opt(m, sessionOpts.budget || d.settings.senpai_session_minutes, m + ' min')).join('')}</select></label>
        <label>Mode<select class="input" id="sp-mode">${[['mixed', 'Mixed'], ['retrieval', 'Retrieval'], ['learn', 'Learn'], ['interview', 'Interview conditions']].map(([v, l]) => opt(v, sessionOpts.mode || d.settings.senpai_mode, l)).join('')}</select></label>
        <label>Objective<select class="input" id="sp-objective">${opt('', sessionOpts.objective, 'Follow the plan')}${objectives.map((o) => opt(o.id, sessionOpts.objective, o.title)).join('')}${d.plan_summary.focus.map((f) => opt(f.capability_id, sessionOpts.objective, 'Focus: ' + ((d.capabilities.find((c) => c.id === f.capability_id) || {}).name || f.capability_id))).join('')}</select></label>
        <button type="button" class="button" id="sp-prepare">Prepare session</button></div></section>`;
  }

  function planHtml(d) {
    const p = d.plan_summary;
    const bars = Object.keys(d.buckets).map((b) => {
      const eff = p.effective_allocation[b] || 0; const base = p.allocation[b] || 0; const prot = p.protected[b];
      return `<div class="sp-bar-row"><span>${esc(d.buckets[b])}</span><div class="sp-bar"><i style="width:${pct(eff)}"></i>${prot ? `<em style="left:${pct(prot)}" title="Protected minimum ${pct(prot)}"></em>` : ''}</div>
        <b>${pct(eff)}</b><span class="help">${Math.abs(eff - base) > 0.005 ? `plan ${pct(base)}` : ''}</span></div>`;
    }).join('');
    const capName = (id) => (d.capabilities.find((c) => c.id === id) || {}).name || id;
    return `<section class="dc-panel"><div class="sp-row"><h3>Plan</h3><span class="help">Revision ${p.revision} · ${p.weekly_minutes} min/week</span></div>
      <div class="sp-bars">${bars}</div>
      <p class="help">Senpai moves at most ${pct(d.limits.max_weekly_shift)} of your time per week on its own (learning rate ${d.limits.learning_rate}); larger moves wait for you.</p>
      <h4>Focus <span class="help">(at most ${d.limits.max_focus})</span></h4>
      <div class="sp-chips">${p.focus.length ? p.focus.map((f) => `<span class="sp-chip is-focus" title="${esc(f.reason || '')}">${esc(capName(f.capability_id))}<button type="button" aria-label="Remove focus" data-unfocus="${esc(f.capability_id)}">×</button></span>`).join('') : '<span class="help">No focus yet. Pick one from Capabilities, or let Senpai propose one.</span>'}</div>
      ${p.overlays.length ? `<h4>Temporary priorities</h4><ul class="sp-list">${p.overlays.map((o) => `<li>${esc(o.label)} · until ${day(o.expires_at)} <button type="button" class="button is-ghost is-small" data-overlay="${esc(o.id)}">Remove</button></li>`).join('')}</ul>` : ''}
      <h4>Objectives</h4><ul class="sp-list">${p.objectives.map((o) => `<li><b>${esc(o.title)}</b> <span class="help">${esc(d.buckets[o.bucket] || o.bucket)}${o.protected ? ' · protected' : ''}</span>
        <button type="button" class="button is-ghost is-small" data-complete="${esc(o.id)}">Done</button><button type="button" class="button is-ghost is-small" data-retire="${esc(o.id)}">Retire</button></li>`).join('')}</ul>
      <details><summary>Add an objective</summary><div class="dc-toolbar"><input class="input" id="sp-obj-title" maxlength="200" placeholder="e.g. Explain consistency trade-offs from memory">
        <select class="input" id="sp-obj-bucket">${Object.entries(d.buckets).map(([b, l]) => `<option value="${b}">${esc(l)}</option>`).join('')}</select>
        <button type="button" class="button is-small" id="sp-obj-add">Add</button></div></details></section>`;
  }

  function questionsHtml(d) {
    const qs = d.state.questions || [];
    if (!qs.length) return '';
    return `<section class="dc-panel"><h3>Senpai's questions</h3><p class="help">Things the logs can't tell. Your answers inform the next weekly review.</p>${qs.map((q) => `
      <div class="sp-question"><p>${esc(q.text)}</p><textarea class="input" rows="2" maxlength="1000" data-answer-for="${esc(q.id)}"></textarea>
      <button type="button" class="button is-small" data-answer="${esc(q.id)}">Answer</button></div>`).join('')}</section>`;
  }

  function followHtml(d) {
    if (!d.interventions.length) return '';
    const outcome = { pending: 'Waiting for the check date', helped: 'Helped', not_helped: 'Did not help yet', not_tried: 'Not tried', unclear: 'Unclear' };
    return `<section class="dc-panel"><h3>Advice follow-through</h3><p class="help">Whether advice was tried comes from your recorded practice; whether it helped, from a later independent check. Ineffective advice is revised, not repeated.</p>
      <ul class="sp-list">${d.interventions.map((i) => `<li><b>${esc(i.action)}</b>
        <p class="help">${i.intended_outcome ? 'Aim: ' + esc(i.intended_outcome) + ' · ' : ''}${i.tried_at ? 'tried ' + day(i.tried_at) : 'not tried yet'} · check ${day(i.check_at)} · <span class="sp-chip ${i.outcome === 'helped' ? 'is-good' : i.outcome === 'not_helped' ? 'is-warn' : ''}">${esc(outcome[i.outcome] || i.outcome)}</span></p>
        <div class="dc-actions"><button type="button" class="button is-small${i.response === 'accepted' ? ' is-primary' : ''}" data-respond="accepted" data-id="${esc(i.id)}">I'll try this</button>
        <button type="button" class="button is-small${i.response === 'dismissed' ? ' is-primary' : ''}" data-respond="dismissed" data-id="${esc(i.id)}">Not useful</button></div></li>`).join('')}</ul></section>`;
  }

  function capsHtml(d) {
    const focus = new Set(d.plan_summary.focus.map((f) => f.capability_id));
    const groups = { dsa: 'Coding (DSA)', system_design: 'System design' };
    return `<section class="dc-panel"><h3>Capabilities</h3><p class="help">Status describes recorded evidence, not you. "Practised" means problems were solved but the technique was never confirmed. "No evidence yet" and "Not seen recently" are unknowns: Senpai checks before prescribing work. Your CV and job fit never count as evidence here.</p>
      ${Object.entries(groups).map(([b, label]) => `<h4>${label}</h4><div class="sp-caps">${d.capabilities.filter((c) => c.bucket === b).map((c) => {
        const [text, cls] = STATUS[c.status] || [c.status, ''];
        return `<div class="sp-cap" data-cap="${esc(c.id)}"><div><b>${esc(c.name)}</b> <span class="sp-chip ${cls}">${esc(text)}</span>${focus.has(c.id) ? ' <span class="sp-chip is-focus">Focus</span>' : ''}
          <span class="help">last ${day(c.last_at)}</span></div>
          <div class="sp-cap-actions">${focus.has(c.id) ? '' : `<button type="button" class="button is-ghost is-small" data-focus="${esc(c.id)}">Focus</button>`}
          <button type="button" class="button is-ghost is-small" data-evidence="${esc(c.id)}">Evidence</button>
          <button type="button" class="button is-ghost is-small" data-teach="${esc(c.id)}"${d.model_enabled ? '' : ' disabled title="Teaching needs the model"'}>Teach me</button></div>
          <div class="sp-cap-detail hidden"></div></div>`;
      }).join('')}</div>`).join('')}</section>`;
  }

  function jobHtml(d) {
    const js = d.job_scout;
    const w = d.weekly[0];
    const iv = js.interviews || [];
    return `<section class="dc-panel"><div class="sp-row"><h3>Career context</h3>${js.configured ? `<a class="help" href="${esc(js.links.insights)}" target="_blank" rel="noopener">Job Scout insights</a>` : ''}</div>
      ${w ? `<div class="sp-weekly"><span class="dc-eyebrow">Weekly review · ${esc(w.iso_week)}</span><p>${esc(w.summary || '')}</p>${(w.explanation || []).length ? `<ul>${w.explanation.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>` : '<p class="help">No weekly review yet. It runs on your chosen day, or now with "Run weekly review".</p>'}
      ${iv.length ? `<h4>Upcoming interviews</h4><ul class="sp-list">${iv.map((i) => `<li><b>${esc(i.round_label)}</b> · ${esc(i.company)} · ${esc(new Date(i.starts_at).toLocaleString())}
        ${i.expectations.documented.length ? `<p>Documented: ${i.expectations.documented.map((x) => esc(x.statement)).join('; ')}</p>` : ''}
        ${i.expectations.predicted.length ? `<p class="help">Predicted (AI prep, not documented): ${i.expectations.predicted.flatMap((x) => x.topics).map(esc).join(', ')}</p>` : ''}</li>`).join('')}</ul>` : ''}
      ${js.demand?.tags?.length ? `<h4>What relevant roles ask for</h4><p class="help">${esc(js.demand.cohort?.roles ?? 0)} roles at ${esc(js.demand.cohort?.companies ?? 0)} companies since ${esc(js.demand.cohort?.since || '')}; reposts count once. Demand, not your ability.</p>
        <div class="sp-chips">${js.demand.tags.map((t) => `<span class="sp-chip" title="${t.roles} roles, ${t.companies} companies">${esc(t.tag)} · ${t.companies}</span>`).join('')}</div>` : ''}</section>`;
  }

  function historyHtml(d) {
    return `<section class="dc-panel"><h3>Decision history</h3><ul class="sp-list sp-history">${d.decisions.map((x) => `<li><span class="sp-chip">${esc(DECISION[x.decision] || x.decision)}</span>
      <b>${esc(describe(x.change, d))}</b> <span class="help">${when(x.at)} · ${esc(x.source)}${x.plan_revision_after ? ` · r${x.plan_revision_before}→r${x.plan_revision_after}` : ''}</span>
      ${x.rationale ? `<p>${esc(x.rationale)}</p>` : ''}${(x.reasons || []).length ? `<p class="help">${esc(x.reasons.join(' '))}</p>` : ''}</li>`).join('') || '<li class="help">Nothing yet.</li>'}</ul>
      <details><summary>Snapshot (Markdown)</summary><pre class="sp-snapshot">${esc(d.snapshot_md)}</pre></details></section>`;
  }

  function teachHtml() {
    if (!teachState) return '';
    const t = teachState;
    return `<div class="sp-teach" role="dialog" aria-label="Teach me"><div class="sp-row"><h3>Senpai · ${esc(t.name)}</h3><button type="button" class="button is-ghost is-small" data-teach-close>Close</button></div>
      <label>Mode <select class="input" id="sp-teach-mode">${[['learn', 'Learn (explanations welcome)'], ['independent', 'Independent (conceptual hints only)'], ['interview', 'Interview (clarifications only)']].map(([v, l]) => `<option value="${v}"${t.mode === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="help">Help is recorded as assistance${t.mode !== 'learn' ? ', and on any run in progress' : ''}. Exercises Senpai writes are practice material, not assessments.</p>
      <div class="sp-chat">${t.history.map((m) => `<div class="sp-msg ${m.role === 'senpai' ? 'is-senpai' : ''}"><b>${m.role === 'senpai' ? 'Senpai' : 'You'}</b>${m.assistance && m.assistance !== 'none' ? ` <span class="sp-chip">${esc(m.assistance.replace('_', ' '))}</span>` : ''}<p>${esc(m.text)}</p>
        ${m.exercise ? `<details class="sp-exercise"><summary>Practice exercise · supplemental, not validated</summary><p>${esc(m.exercise.prompt)}</p><details><summary>Outline</summary><p>${esc(m.exercise.answer_outline)}</p></details></details>` : ''}
        ${(m.actions || []).length ? `<p class="help">${m.actions.map((a) => a.tool === 'request_checkpoint' ? `Later check scheduled ${day(a.check_at)}` : `Focus proposal: ${DECISION[a.decision] || a.decision}`).join(' · ')}</p>` : ''}</div>`).join('') || '<p class="help">Ask a question, or say what you think you know. Senpai usually starts by checking.</p>'}
        ${t.busy ? '<p class="help">Senpai is thinking…</p>' : ''}</div>
      <textarea class="input" id="sp-teach-input" rows="3" maxlength="4000" placeholder="What I think the invariant is…"${t.busy ? ' disabled' : ''}></textarea>
      <div class="dc-actions"><button type="button" class="button is-primary" id="sp-teach-send"${t.busy ? ' disabled' : ''}>Send</button></div></div>`;
  }

  function openTeach(cid) {
    const c = data?.capabilities.find((x) => x.id === cid);
    teachState = { capability: cid, name: c ? c.name : cid, mode: 'learn', history: [], busy: false };
    drawTeach();
  }

  function drawTeach() {
    let host = $('#sp-teach-host');
    if (!host) return;
    host.innerHTML = teachHtml();
    if (!teachState) return;
    host.querySelector('[data-teach-close]').addEventListener('click', () => { teachState = null; drawTeach(); });
    $('#sp-teach-mode').addEventListener('change', (e) => { teachState.mode = e.target.value; drawTeach(); });
    const send = async () => {
      const text = $('#sp-teach-input').value.trim();
      if (!text || teachState.busy) return;
      const t = teachState;
      t.history.push({ role: 'you', text });
      t.busy = true; drawTeach();
      try {
        const r = await api('/senpai/teach', 'POST', { capability_id: t.capability, message: text, mode: t.mode,
          history: t.history.slice(0, -1).map((m) => ({ role: m.role, text: m.text })) });
        t.history.push({ role: 'senpai', text: r.reply, assistance: r.assistance, exercise: r.exercise, actions: r.actions });
      } catch (e) {
        t.history.push({ role: 'senpai', text: e.message });
      } finally {
        t.busy = false; if (teachState === t) drawTeach();
      }
    };
    $('#sp-teach-send').addEventListener('click', send);
    $('#sp-teach-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
    $('#sp-teach-input').focus();
  }

  async function act(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); await renderSenpai(true); } catch (e) { toast(e.message); }
  }
  const change = (body, msg) => act(() => api('/senpai/changes', 'POST', body), msg);

  async function renderSenpai(force) {
    if (rendering && !force) return;
    rendering = true;
    const el = $('#tab-senpai');
    try {
      if (!el.childElementCount) beginRender(el, 'Loading Senpai…');
      const [d, s] = await Promise.all([api('/senpai'), api('/senpai/today')]);
      data = d;
      el.innerHTML = `${header(d)}${proposalsHtml(d)}<div id="sp-session">${sessionHtml(d, s)}</div>
        <div id="sp-teach-host"></div>${questionsHtml(d)}${planHtml(d)}${followHtml(d)}${capsHtml(d)}${jobHtml(d)}${historyHtml(d)}
        <h2 class="sp-section">Daily reviews</h2><div id="senpai-reviews"></div>`;
      drawTeach();
      bindBlocks(el.querySelector('#sp-session'), s);
      el.querySelectorAll('[data-settings]').forEach((b) => b.addEventListener('click', () => App.goTab('settings')));
      el.querySelector('[data-sync]')?.addEventListener('click', () => act(() => api('/senpai/sync', 'POST'), 'Synced with Job Scout'));
      el.querySelector('[data-weekly]').addEventListener('click', (e) => { e.target.disabled = true; e.target.textContent = 'Reviewing…'; act(() => api('/senpai/weekly', 'POST'), 'Weekly review done'); });
      el.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => act(() => api(`/senpai/proposals/${encodeURIComponent(b.dataset.approve)}/approve`, 'POST', {}), 'Approved')));
      el.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', () => act(() => api(`/senpai/proposals/${encodeURIComponent(b.dataset.reject)}/reject`, 'POST', {}), 'Rejected')));
      $('#sp-prepare').addEventListener('click', () => {
        sessionOpts = { budget: +$('#sp-budget').value, mode: $('#sp-mode').value, objective: $('#sp-objective').value };
        act(() => api('/senpai/session', 'POST', { budget: sessionOpts.budget, mode: sessionOpts.mode, objective: sessionOpts.objective || null }), 'Session prepared');
      });
      el.querySelectorAll('[data-unfocus]').forEach((b) => b.addEventListener('click', () => change({ kind: 'focus_remove', capability_id: b.dataset.unfocus }, 'Focus removed')));
      el.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => change({ kind: 'focus_add', capability_id: b.dataset.focus }, 'Added to focus')));
      el.querySelectorAll('[data-overlay]').forEach((b) => b.addEventListener('click', () => change({ kind: 'overlay_remove', overlay_id: b.dataset.overlay }, 'Removed')));
      el.querySelectorAll('[data-complete]').forEach((b) => b.addEventListener('click', () => change({ kind: 'objective_complete', objective_id: b.dataset.complete }, 'Objective done')));
      el.querySelectorAll('[data-retire]').forEach((b) => b.addEventListener('click', () => { if (confirm('Retire this objective?')) change({ kind: 'objective_remove', objective_id: b.dataset.retire }, 'Objective retired'); }));
      $('#sp-obj-add').addEventListener('click', () => change({ kind: 'objective_add', title: $('#sp-obj-title').value, bucket: $('#sp-obj-bucket').value }, 'Objective added'));
      el.querySelectorAll('[data-answer]').forEach((b) => b.addEventListener('click', () => {
        const text = el.querySelector(`[data-answer-for="${b.dataset.answer}"]`).value;
        act(() => api(`/senpai/questions/${encodeURIComponent(b.dataset.answer)}`, 'POST', { answer: text }), 'Thanks — noted');
      }));
      el.querySelectorAll('[data-respond]').forEach((b) => b.addEventListener('click', () =>
        act(() => api(`/senpai/interventions/${encodeURIComponent(b.dataset.id)}`, 'POST', { response: b.dataset.respond }))));
      el.querySelectorAll('[data-teach]').forEach((b) => b.addEventListener('click', () => { openTeach(b.dataset.teach); $('#sp-teach-host').scrollIntoView({ behavior: 'smooth' }); }));
      el.querySelectorAll('[data-evidence]').forEach((b) => b.addEventListener('click', async () => {
        const box = b.closest('.sp-cap').querySelector('.sp-cap-detail');
        if (!box.classList.toggle('hidden')) {
          box.innerHTML = '<p class="help">Loading…</p>';
          try {
            const r = await api('/senpai/capabilities/' + encodeURIComponent(b.dataset.evidence));
            box.innerHTML = `<p class="help">${r.observations.length ? 'Recent observations:' : 'No observations recorded.'}</p>
              <ul>${r.observations.map((o) => `<li>${day(o.at)} · ${esc(o.format || '')} · ${esc(o.outcome)}${o.help && o.help !== 'none' ? ' · with ' + esc(o.help.replace('_', ' ')) : ''} <span class="help">${esc(o.id)}</span></li>`).join('')}</ul>
              ${r.resources.length ? `<p class="help">Material:</p><ul>${r.resources.map((x, i) => `<li><button type="button" class="button is-ghost is-small" data-res="${i}">${esc(x.title)}</button> <span class="help">${x.minutes} min${x.attempted ? ' · attempted' : ''}</span></li>`).join('')}</ul>` : ''}
              <div class="dc-actions"><button type="button" class="button is-small is-ghost" data-checkpoint>Schedule a later check (7 days)</button></div>`;
            box.querySelectorAll('[data-res]').forEach((x) => x.addEventListener('click', () => {
              const res = r.resources[+x.dataset.res];
              startBlock(res.type === 'problem' ? { ...res, kind: 'adhoc', mode: '' } : res);
            }));
            box.querySelector('[data-checkpoint]').addEventListener('click', () =>
              act(() => api('/senpai/checkpoints', 'POST', { capability_id: b.dataset.evidence, days: 7 }), 'Check scheduled'));
          } catch (e) { box.innerHTML = `<p class="help">${esc(e.message)}</p>`; }
        }
      }));
      window.Views.renderCoach?.($('#senpai-reviews'));
    } catch (e) {
      el.innerHTML = `<div class="dc-panel"><h2>Senpai could not load</h2><p>${esc(e.message)}</p><button class="button" id="sp-retry" type="button">Retry</button></div>`;
      $('#sp-retry').addEventListener('click', () => renderSenpai(true));
    } finally {
      rendering = false;
    }
  }

  // The periodic refresh must not wipe a teaching conversation mid-draft.
  window.Views.renderSenpai = () => (teachState ? Promise.resolve() : renderSenpai(true));
  window.Senpai = { mountToday, openTeach };
})();
