// Ripple Ops: the design builder as a game. The campaign follows Ripple from a garage to a billion
// users, one level per course chapter: Marcus sets the budget, Sam the product, Priya warns what will
// break. You estimate, draw and size a design, then live through the day (sd-sim.js) and get the team's
// post-mortem. Runs, drafts and progress live on the server (/api/ripple); a run is evidence for the
// knowledge model, and failures open gaps the tutor will ask about. The model plays the cast for
// debriefs, design reviews (with what-if incidents run against your design), mock interviews and new
// levels; without it the game still works. The Ripple Assist chapters (chapter "assist") are AI
// systems run by ai-sim.js through the same builder. The incident archive plays real outages that
// have no lesson of their own (sd-outage.js): watch one break, then fix it.
(function () {
  'use strict';
  const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const call = (p, m = 'GET', b) => api('/ripple' + p, m, b);
  const getJson = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  const B = () => window.SDBuilder, Sim = () => window.SDSim;
  const hh = h => String(h).padStart(2, '0') + ':00';
  const CHAPTERS = { foundations: 'Foundations', apis: 'APIs', caching: 'Caching', queues: 'Queues', storage: 'Storage', reliability: 'Reliability',
    distributed: 'Distributed', specialised: 'Specialised', casebook: 'Casebook', assist: 'Ripple Assist', generated: 'Generated' };
  const UNITS = { peakReadRps: 'req/s', peakWriteRps: 'req/s', storageGbYear: 'GB', egressTbMonth: 'TB', cacheGb: 'GB',
    questionsPerDay: 'a day', peakQps: 'per second', tokensPerQuestion: 'tokens', largeModelMonthUsd: '$ a month' };
  const REF_TAG = { extra: 'Not in the reference', missing: 'Reference has it', different: 'Sized differently', same: 'Matches' };
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v2.5"/></svg>';
  let camp = null, sims = null, pending = null, outages = [];
  const readLocal = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const writeLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* fine */ } };

  async function loadStatic() {
    if (camp) return;
    const [c, s, o] = await Promise.all([getJson('/simulators/ripple.json'), getJson('/simulators/internals.json'), window.SDOutage?.cases().catch(() => []) || [], B().load()]);
    camp = c; sims = Object.fromEntries(s.topics.map(t => [t.id, t])); outages = o || [];
  }

  function mount(el, o = {}) {
    let ov = null, err = '', view = 'hub', L = null, step = 'brief', builder = null, res = null, posted = null, debrief = null, dbState = '', revealed = false, modalOpen = false, modalPlayed = false, refView = false, mineG = null;
    let casePage = null;
    let est = {}, graded = null, notes = '', editing = false, mic = 'idle', voice = null, timeline = [], logged = '', lastSig = '', logTimer = null, hints = 0, aiHint = '', chat = null, dead = false, genState = '', draftTimer = null, attempts = 0, recent = [];
    const levels = () => camp.levels;
    const byId = id => levels().find(l => l.id === id);
    el.classList.add('rp-root');
    el.innerHTML = '<p class="bd-note">Loading Ripple Ops…</p>';

    async function refresh() {
      try { ov = await call(''); err = ''; }
      catch (e) { if (e.message !== 'auth') err = `Could not load your progress (${e.message}). The levels still work; progress won't be saved.`; ov = ov || { progress: { levels: {}, unlocked: [levels()[0].id], stars: 0, max_stars: levels().length * 3, cleared: 0, main: 10 }, recent: [], generated: [], enabled: false, streak: 0, today: new Date().toISOString().slice(0, 10), daily: {} }; }
    }
    const unlocked = id => ov.progress.unlocked.includes(id);
    const best = id => ov.progress.levels[id]?.best || 0;

    // ---------- the incident archive ----------
    function archiveHtml() {
      const own = outages.filter(c => !c.lesson), taught = outages.filter(c => c.lesson);
      if (!outages.length) return '';
      const tag = c => (window.SDOutage.KIND[c.kind] || ['Composite'])[0];
      return `<section class="rp-sec"><h3>The incident archive</h3><p class="rp-sub">Real outages that don't belong to one lesson. Watch each one break on the simulator, read what happened, then fix it.</p>
        <div class="rp-cards">${own.map(c => `<button type="button" class="rp-card is-case" data-case="${esc(c.id)}"><span class="rp-card-top"><span class="rp-tier">${esc(tag(c))} · ${esc(c.company || '')} · ${esc(c.when)}</span>${readLocal(`outage-fixst-${c.id}`)?.fixed ? '<span class="rp-stars">✓</span>' : ''}</span>
          <strong>${esc(c.title)}</strong><span class="rp-kicker">${esc(c.kicker)}</span><span class="rp-card-foot">${c.fix ? 'Watch it, then fix it' : 'Watch it'}</span></button>`).join('')}</div>
        ${taught.length ? `<p class="rp-sub">Lessons open with one too: ${taught.map(c => `<button type="button" class="sim-link" data-lesson="${esc(c.lesson)}" data-section="${esc(c.section)}">${esc(c.company ? c.company + ', ' + c.when : c.title)}</button>`).join(' · ')}.</p>` : ''}</section>`;
    }
    function openCase(id) {
      const c = outages.find(x => x.id === id);
      if (!c) return;
      stopBuilder(); view = 'case'; L = c; paint();
    }

    // ---------- hub ----------
    function levelCard(l) {
      const open = unlocked(l.id), b = best(l.id), p = ov.progress.levels[l.id];
      const after = l.after && byId(l.after);
      return `<button type="button" class="rp-card${open ? '' : ' is-locked'}${b >= 2 ? ' is-done' : ''}" ${open ? `data-open="${esc(l.id)}"` : 'disabled'}>
        <span class="rp-card-top"><span class="rp-tier">${esc(l.tier)} · ${esc(l.users)}</span>${open ? B().stars(b) : '<span class="rp-lock">🔒</span>'}</span>
        <strong>${esc(l.title)}</strong><span class="rp-kicker">${esc(l.kicker)}</span>
        <span class="rp-card-meta">${l.concepts.slice(0, 3).map(c => `<em>${esc(camp.concepts[c]?.label || c)}</em>`).join('')}</span>
        <span class="rp-card-foot">${open ? (p ? `${p.attempts} run${p.attempts === 1 ? '' : 's'}${p.best_cost != null ? ` · best ${B().money(p.best_cost)}/mo` : ''}` : 'Not played yet') : `Survive “${esc(after?.title || '')}” to unlock`}</span></button>`;
    }
    function hubHtml() {
      const p = ov.progress, co = ov.company, main = levels().filter(l => !l.side), side = levels().filter(l => l.side && l.chapter !== 'assist'), assist = levels().filter(l => l.chapter === 'assist');
      const d = dailyScenario(), done = ov.daily?.done;
      const twist = d?.events.at(-1);
      const conceptOpts = Object.entries(camp.concepts).map(([k, c]) => `<option value="${esc(k)}">${esc(c.label)}</option>`).join('');
      return `<div class="rp">
        ${err ? `<div class="sd-error" role="alert">${esc(err)}</div>` : ''}
        <header class="rp-hero"><div><span class="sd-eyebrow">RIPPLE OPS</span><h2 id="sd-heading" tabindex="-1">Keep Ripple standing.</h2>
          <p>Design it, size it, pay for it, then live through the day: launches, viral links, dead databases and bad deploys. The team tells you how it went, and what you get wrong comes back in your reviews.</p></div>
          <div class="rp-stats">${co ? `<div><b>${esc(co.label)}</b><span>Ripple today · ${esc(co.users)}</span></div>` : ''}<div><b>${p.stars}<small>/${p.max_stars}</small></b><span>stars</span></div>
            <div><b>${p.cleared}<small>/${p.main}</small></b><span>chapters cleared</span></div><div><b>${ov.streak ? '🔥 ' + ov.streak : '0'}</b><span>day streak</span></div></div></header>
        ${d ? `<section class="rp-daily"><div><span class="sd-eyebrow">TODAY'S INCIDENT · ${esc(ov.today)}</span><h3>${esc(byId(d.base)?.title)}, with a twist</h3>
          <p>${esc(twist?.label || '')} at ${hh(twist?.at || 0)}, on top of everything else. Same for everyone all day; survive it to keep your streak.</p></div>
          <div class="rp-daily-act">${done ? `<span>Done today ${B().stars(ov.daily.best || 0)}</span>` : ''}<button type="button" class="button ${done ? '' : 'is-primary'}" data-daily>${done ? 'Play again' : 'Play today\'s incident'}</button></div></section>` : ''}
        <section class="rp-sec"><h3>The campaign</h3><p class="rp-sub">Ripple grows a tier each level. Each one is a chapter of the course with a budget, targets and a bad day.</p>
          <div class="rp-cards">${main.map(levelCard).join('')}</div></section>
        ${assist.length ? `<section class="rp-sec"><h3>Ripple Assist: the AI chapters</h3><p class="rp-sub">Ripple ships an AI support assistant. Models, retrieval, routing, guardrails, tools and evals instead of servers and databases, against quality, latency, safety and a token bill. They open once you've survived “${esc(byId('async-work')?.title || '')}”, one after another.</p><div class="rp-cards">${assist.map(levelCard).join('')}</div></section>` : ''}
        <section class="rp-sec"><h3>Side quests</h3><p class="rp-sub">Ripple's partnerships, from the casebook. They open once you've survived “${esc(byId('async-work')?.title || '')}”.</p><div class="rp-cards">${side.map(levelCard).join('')}</div></section>
        ${archiveHtml()}
        <section class="rp-sec"><h3>New incidents</h3><p class="rp-sub">Priya writes you a fresh level, aimed at what your last runs got wrong unless you pick a topic.</p>
          ${ov.enabled ? `<div class="rp-gen"><select data-gen-focus aria-label="Topic"><option value="">My weak spots</option>${conceptOpts}</select>
            <select data-gen-size aria-label="Size"><option value="startup">Startup scale</option><option value="scale-up" selected>Scale-up</option><option value="giant">Giant</option></select>
            <button type="button" class="button is-primary" data-gen ${genState === 'busy' ? 'disabled' : ''}>${genState === 'busy' ? 'Writing…' : 'Write me a level'}</button>${genState && genState !== 'busy' ? `<span class="rp-err">${esc(genState)}</span>` : ''}</div>`
            : '<p class="bd-note">New levels need the model, which isn\'t connected.</p>'}
          ${ov.generated.length ? `<div class="rp-cards">${ov.generated.map(g => `<button type="button" class="rp-card" data-gen-open="${esc(g.id)}"><span class="rp-card-top"><span class="rp-tier">Generated · ${esc(g.users || '')}</span>${B().stars(g.best || 0)}</span><strong>${esc(g.title)}</strong><span class="rp-kicker">${esc(g.kicker || '')}</span></button>`).join('')}</div>` : ''}</section>
        ${ov.recent.length ? `<section class="rp-sec"><h3>Recent runs</h3><ul class="rp-recent">${ov.recent.map(r => `<li>${B().stars(r.stars || 0)}<span>${esc(byId(r.level)?.title || ov.generated.find(g => g.id === r.level)?.title || r.level)}${r.daily ? ' · daily' : ''}${r.whatif ? ' · what-if' : ''}</span><em>${(r.availability || 0).toFixed(2)}% · ${B().money(r.cost || 0)}/mo</em><time>${new Date(r.at * 1000).toLocaleDateString()}</time></li>`).join('')}</ul></section>` : ''}
        <p class="rp-foot">Want to draw without stakes? <button type="button" class="sim-link" data-sandbox>Open the sandbox builder</button>.</p></div>`;
    }
    function dailyScenario() {
      const pool = levels().filter(l => unlocked(l.id)).map(l => l.id);
      return Sim().daily(levels(), ov.today, pool);
    }

    // ---------- a level ----------
    const conceptChip = c => {
      const k = camp.concepts[c];
      if (!k) return '';
      return `<span class="rp-learn"><button type="button" class="rp-chip" data-lesson="${esc(k.lesson)}"${k.section ? ` data-section="${esc(k.section)}"` : ''} title="Open the lesson">📖 ${esc(k.label)}</button>${k.sim && sims[k.sim] ? `<button type="button" class="rp-chip is-sim" data-sim="${esc(k.sim)}" title="Open the simulator">🧪 ${esc(sims[k.sim].title.replace('&amp;', '&'))}</button>` : ''}</span>`;
    };
    function targetsHtml(l) {
      const s = l.slo || {}, rows = [[`${s.availability ?? 99.9}%`, l.ai ? 'of questions answered without an error' : 'available over the day']];
      if (l.ai) {
        rows.unshift([`≥ ${s.quality}%`, 'answered correctly']);
        rows.push([`≤ ${(s.p95 / 1000).toFixed(1)} s`, 'p95 to a full answer']);
        if (s.safety != null) rows.push(['0', 'harmful actions']);
      }
      for (const [t, v] of Object.entries(s.p99 || {})) rows.push([`≤ ${v} ms`, `p99 for ${(Sim().LABEL[t] || t).toLowerCase()}`]);
      if (s.budget) rows.push([B().money(s.budget), 'a month, at most']);
      if (s.lagMin != null) rows.push([`≤ ${s.lagMin} min`, 'behind on background work']);
      if (s.noLoss) rows.push(['0', 'acknowledged writes lost']);
      return `<ul class="rp-targets">${rows.map(([a, b]) => `<li><b>${esc(a)}</b><span>${esc(b)}</span></li>`).join('')}</ul>`;
    }
    function trafficHtml(l, est) {
      if (l.ai) {
        const A = window.AISim.normalize(l), mix = Object.entries(A.ai.mix).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        return `<p class="rp-traffic"><b>${Number(l.dau).toLocaleString('en')}</b> users · ${l.traffic.ask.perUser} questions per user a day · evening peak about ${l.traffic.peak || 1.8}× the average on an ordinary day · prompts about ${A.ai.promptTokens.toLocaleString('en')} tokens plus ${A.ai.topK} retrieved passages of ${A.ai.chunkTokens}, answers about ${A.ai.outTokens} tokens</p>
          <ul class="rp-mix">${mix.map(([k, v]) => `<li><b>${Math.round(v * 100)}%</b><span>${esc(window.AISim.KIND_LABEL[k])}</span></li>`).join('')}</ul>`;
      }
      const T = l.traffic || {}, parts = [];
      const size = kb => kb >= 1000 ? `${B().fmt(kb / 1000)} MB` : `${B().fmt(kb)} KB`;
      for (const t of Sim().USER) if (T[t]?.perUser) { const kb = T[t].kb ?? Sim().KB[t];
        // On the estimate step, show only what the questions need: sizes matter for storage (writes) and bandwidth, never for request rates.
        const showKb = kb && (!est || est.includes('egressTbMonth') || (est.includes('storageGbYear') && ['write', 'upload', 'realtime'].includes(t)));
        parts.push(`${T[t].perUser.toLocaleString('en')} ${(Sim().LABEL[t] || t).toLowerCase()} per user a day${showKb ? ` (~${size(kb)} each)` : ''}`); }
      return `<p class="rp-traffic"><b>${Number(l.dau).toLocaleString('en')}</b> daily users · ${parts.join(' · ')} · evening peak about ${T.peak || 2}× the average on an ordinary day${l.far?.share ? ` · ${Math.round(l.far.share * 100)}% of users an ocean away` : ''}${!est && l.data?.gb ? ` · ${B().fmt(l.data.gb)} GB already stored` : ''}${!est && l.data?.mediaGb ? ` plus ${B().fmt(l.data.mediaGb)} GB of media` : ''}</p>`;
    }
    function stepsHtml() {
      const s = [['brief', 'Brief'], ['estimate', 'Estimate'], ['build', 'Build & run']];
      return `<nav class="rp-steps" aria-label="Level steps">${s.map(([k, label], i) => `<button type="button" class="${step === k ? 'is-on' : ''}" data-step="${k}"><i>${i + 1}</i>${label}</button>`).join('')}</nav>`;
    }
    function briefHtml(l) {
      return `<div class="rp-brief">
        <div class="rp-msgs">${(l.brief || []).map(m => `<div class="rp-msg">${B().avatar(m.who)}<div><b>${esc(B().CAST[m.who]?.[0] || m.who)} <small>${esc(B().CAST[m.who]?.[1] || '')}</small></b><p>${esc(m.text)}</p></div></div>`).join('')}</div>
        <aside class="rp-mission"><h4>The goal</h4><p>${esc(l.goal)}</p>${trafficHtml(l)}<h4>Targets</h4>${targetsHtml(l)}
          ${(l.events || []).length ? `<h4>Priya's forecast</h4><ul class="rp-forecast">${l.events.map(e => `<li><b>${hh(e.at)}</b><span>${esc(e.label || Sim().EVENT_LABEL[e.type])}${e.params?.mult && ['surge', 'partner-burst', 'ddos'].includes(e.type) ? ` · ${e.params.mult}× normal` : ''}${e.dur > 1 ? ` (${e.dur} h)` : ''}</span></li>`).join('')}</ul>` : ''}
          <h4>Study first</h4><div class="rp-chips">${l.concepts.map(conceptChip).join('')}</div>
          <div class="rp-go"><button type="button" class="button is-primary" data-step="estimate">Estimate first →</button><button type="button" class="button" data-step="build">Straight to building</button></div></aside></div>`;
    }
    function estimateHtml(l) {
      const keys = l.estimate || [];
      return `<div class="rp-est"><p>Interviewers want the numbers before the boxes. Work these out from the brief (round freely: within 2× is good), then check. Use the ordinary-day peak: surges and incidents in the brief come on top of it and are not part of these answers.</p>
        ${trafficHtml(l, keys)}
        <div class="rp-est-grid">${keys.map(k => { const g = graded?.find(x => x.key === k);
          return `<label class="rp-est-row${g ? ' is-' + g.verdict : ''}"><span>${esc(Sim().ESTIMATES[k])}</span><input type="text" inputmode="decimal" data-est="${esc(k)}" value="${esc(est[k] ?? '')}" placeholder="${UNITS[k]}">
            ${g ? `<em>${g.verdict === 'good' ? '✓ Good' : g.verdict === 'close' ? '≈ Close' : '✗ Off'}: about <b>${B().fmt(g.truth)}</b> ${UNITS[k]}</em>` : ''}</label>`; }).join('')}</div>
        ${graded ? `<p class="bd-fine">${workingText(l)}</p>` : ''}
        <div class="rp-go"><button type="button" class="button" data-check>Check my numbers</button><button type="button" class="button is-primary" data-step="build">Build it →</button></div></div>`;
    }
    function workingText(l) {
      if (l.ai) return 'Working: questions a day = users × questions per user. Peak per second = that ÷ 86,400 × the peak multiple. Tokens per question = the prompt plus top-k × passage size, plus the answer. The large model costs $3 per million tokens in and $15 per million out, so a month is questions × 30 × (tokens in × 3 + tokens out × 15) ÷ 1,000,000.';
      const T = l.traffic, peak = Math.max(...Sim().curve(Sim().normalize(l)));
      const reads = ['read', 'media', 'search', 'geo'].filter(t => T[t]?.perUser).map(t => T[t].perUser), writes = ['write', 'upload', 'realtime', 'payment', 'locate'].filter(t => T[t]?.perUser).map(t => T[t].perUser);
      return `Working: ${Number(l.dau).toLocaleString('en')} users × ${reads.reduce((a, b) => a + b, 0)} reads a day ÷ 86,400 s × ${peak.toFixed(1)} at peak; writes the same way with ${writes.reduce((a, b) => a + b, 0)} a day. Storage is writes a day × their size × 365. Bandwidth is every response's size, summed over a month.`;
    }
    function buildHtml(l) {
      const h = (l.hints || []).slice(0, hints);
      return `<div class="rp-build">
        <div class="rp-strip">${targetsHtml(l)}<div class="rp-tools">
          <button type="button" class="button" data-hint ${hints >= (l.hints || []).length ? 'disabled' : ''}>💡 Hint ${hints}/${(l.hints || []).length}</button>
          ${ov.enabled ? `<button type="button" class="button" data-ai-hint>🫖 Ask Priya</button><button type="button" class="button" data-chat="review">🗣 Review with Marcus</button><button type="button" class="button" data-chat="interview">🎤 Mock interview</button>` : ''}
          <button type="button" class="button" data-step="brief">Brief</button></div></div>
        ${h.length || aiHint ? `<div class="rp-hints">${h.map((x, i) => `<p><b>Hint ${i + 1}.</b> ${esc(x)}</p>`).join('')}${aiHint ? `<div class="rp-msg">${B().avatar('priya')}<div><b>Priya</b><p>${esc(aiHint)}</p></div></div>` : ''}</div>` : ''}
        ${notesHtml()}
        <div data-reftabs>${refTabsHtml(l)}</div>
        <div class="rp-stage" data-stage></div>
        <section class="rp-results" data-results>${resultsHtml(l)}</section></div>`;
    }
    // ---------- your reasoning: talk while you draw ----------
    // The mic writes into a read-only log that keeps the newest words in view; it needs no focus, so you can
    // keep dragging boxes while you talk. Editing is for when the mic is off.
    const canTalk = () => !!window.Dictate?.listen;
    const NOTES_HINT = 'Why this many servers? Why this database? What happens when a zone dies? Press Talk and think out loud while you draw.';
    function notesHtml() {
      const typing = editing || !canTalk(), live = mic === 'listening';
      const talk = !canTalk() ? '' : mic === 'transcribing'
        ? '<span class="rp-notes-state">Tidying the transcript…</span>'
        : `<button type="button" class="button rp-notes-talk${live ? ' is-live' : ''}" data-voice aria-pressed="${live}">${live ? '<span class="rp-notes-dot" aria-hidden="true"></span>Stop' : `${MIC}Talk it through`}</button>`;
      const edit = canTalk() && mic === 'idle' ? `<button type="button" class="sim-link" data-notes-edit>${editing ? 'Done' : 'Edit'}</button>` : '';
      return `<section class="rp-notes${live ? ' is-live' : ''}" data-notes-box><div class="rp-notes-head"><span class="rp-notes-title">Your reasoning <small>Marcus and the debrief read this${live ? ' · listening, Esc stops' : ''}</small></span>
        <span class="rp-notes-tools">${edit}${talk}</span></div>
        ${typing ? `<textarea data-notes rows="4" aria-label="Your reasoning" placeholder="${esc(NOTES_HINT)}">${esc(notes)}</textarea>`
          : `<div class="rp-notes-log" data-notes-log role="log" aria-live="polite" data-hint="${esc(NOTES_HINT)}">${esc(notes)}</div>`}</section>`;
    }
    function paintNotes() {
      const box = el.querySelector('[data-notes-box]');
      if (!box) return;
      const tmp = document.createElement('div'); tmp.innerHTML = notesHtml();
      box.replaceWith(tmp.firstElementChild);
      scrollNotes();
      if (editing) el.querySelector('[data-notes]')?.focus();
    }
    function scrollNotes() { const log = el.querySelector('[data-notes-log]'); if (log) log.scrollTop = log.scrollHeight; }
    function notesChanged() {
      clearTimeout(logTimer); logTimer = setTimeout(() => { logNotes(); if (builder) saveDraft(builder.graph()); }, 3000);
      if (builder) saveDraft(builder.graph());
    }
    function startVoice() {
      editing = false;
      const lvl = L;                // words still in flight never land in another level's notes
      voice = window.Dictate.listen({
        el, idleMs: 10 * 60000,     // a long think while drawing is not the end of the session
        get: () => notes,
        set: v => { if (L !== lvl) return; notes = v; const log = el.querySelector('[data-notes-log]'); if (log) { log.textContent = v; scrollNotes(); } notesChanged(); },
        live: () => !dead && L === lvl,
        ui: st => { mic = st; if (st === 'idle') voice = null; paintNotes(); },
      });
    }
    function stopVoice() { voice?.stop(); }

    function resultsHtml(l) {
      if (!res || !revealed) return '';
      const s = res.summary, prog = posted?.progress, nextL = levels().find(x => x.after === l.id && (!x.side || x.chapter === l.chapter) && (prog || ov.progress).unlocked.includes(x.id));
      return `<h3>How the day went</h3>
        ${posted?.first_clear ? `<div class="rp-banner">🎉 Chapter cleared. Ripple made it through “${esc(l.title)}”, and the team will remember it.</div>` : ''}
        ${posted?.unlocked?.length ? `<div class="rp-banner">🔓 Unlocked: ${posted.unlocked.map(id => `<button type="button" class="sim-link" data-open="${esc(id)}">${esc(byId(id)?.title || id)}</button>`).join(', ')}</div>` : ''}
        ${posted?.gaps ? `<p class="bd-fine">${posted.gaps} thing${posted.gaps === 1 ? '' : 's'} you missed will come back in your reviews and with the tutor.</p>` : ''}
        <div class="rp-res-grid"><div>${B().reportHtml(res, { labelOf: builder?.labelOf, conceptLink: conceptChip })}</div>
          <div class="rp-debrief">${debriefHtml()}${s.stars >= 2 && l.debrief ? `<div class="rp-lesson"><h4>The lesson</h4><p>${esc(l.debrief)}</p></div>` : ''}
            <div class="rp-go">${canCompare(l) ? '<button type="button" class="button" data-ref>Compare with the reference design</button>' : ''}
            ${nextL ? `<button type="button" class="button is-primary" data-open="${esc(nextL.id)}">Next: ${esc(nextL.title)} →</button>` : '<button type="button" class="button" data-hub>Back to Ripple Ops</button>'}</div></div></div>`;
    }
    // ---------- your design vs the reference ----------
    // Once the level is passed (or tried twice) two tabs flip the canvas between his design and the reference, with the boxes that differ outlined.
    const canCompare = l => !!(l.solution && res && revealed && (res.summary.stars >= 2 || attempts >= 2));
    const cfgKey = n => JSON.stringify(Object.entries(n.cfg || {}).filter(([, v]) => v !== null && v !== undefined && v !== false && v !== '' && v !== 0).sort());
    // Mark the nodes of `a` that have no counterpart in `b`, matched by component kind (ids and positions don't matter).
    function diffMarks(a, b, other) {
      const out = {}, kinds = {};
      for (const n of b?.nodes || []) (kinds[n.defId] ||= []).push(n);
      const mine = {};
      for (const n of a?.nodes || []) (mine[n.defId] ||= []).push(n);
      for (const [k, list] of Object.entries(mine)) {
        const pool = [...(kinds[k] || [])], rest = [];
        for (const n of list) { const i = pool.findIndex(m => cfgKey(m) === cfgKey(n)); if (i >= 0) pool.splice(i, 1); else rest.push(n); }
        for (const n of rest) { if (pool.length) { pool.shift(); out[n.id] = { kind: 'sized', text: 'Sized differently from ' + other }; } else out[n.id] = { kind: 'new', text: 'Not in ' + other }; }
      }
      return out;
    }
    function refTabsHtml(l) {
      if (!canCompare(l)) return '';
      const pts = refView && debrief?.reference?.length ? `<ul class="rp-ref">${debrief.reference.map(p => `<li><b>${esc(p.point)}</b> <span class="rp-ref-tag is-${esc(p.verdict)}">${esc(REF_TAG[p.verdict] || p.verdict)}</span> ${esc(p.why)}</li>`).join('')}</ul>` : '';
      return `<div class="rp-reftabs"><div class="rp-tabs" role="tablist"><button type="button" role="tab" class="rp-tab${refView ? '' : ' is-on'}" aria-selected="${!refView}" data-view="mine">Your design</button><button type="button" role="tab" class="rp-tab${refView ? ' is-on' : ''}" aria-selected="${refView}" data-view="ref">Reference design</button>
        <span class="rp-tabs-key"><i class="rp-key is-new"></i>${refView ? 'not in yours' : 'not in the reference'} <i class="rp-key is-sized"></i>sized differently</span></div>${pts}</div>`;
    }
    function paintTabs() { const box = el.querySelector('[data-reftabs]'); if (box) box.innerHTML = refTabsHtml(L); }
    function applyView() {
      paintTabs();
      if (!builder) return;
      if (!canCompare(L)) { refView = false; builder.show(null); return; }
      if (refView) builder.show(L.solution, diffMarks(L.solution, mineG, 'yours'));
      else builder.show(null, diffMarks(builder.graph(), L.solution, 'the reference'));
    }
    function setView(ref) {
      if (!builder || !canCompare(L)) return;
      if (ref && !refView) mineG = builder.graph();
      refView = ref; applyView();
    }
    function debriefHtml() {
      if (!ov.enabled) return '';
      if (dbState === 'busy') return '<div class="rp-msg rp-typing">' + B().avatar('priya') + '<div><b>Priya</b><p>Writing up the debrief…</p></div></div>';
      if (dbState && dbState !== 'done') return `<p class="rp-err">${esc(dbState)} <button type="button" class="sim-link" data-debrief>Try again</button></p>`;
      if (!debrief) return posted?.id ? '<button type="button" class="button" data-debrief>Get the team\'s debrief</button>' : '';
      const bubble = (who, text) => text ? `<div class="rp-msg">${B().avatar(who)}<div><b>${B().CAST[who][0]} <small>${B().CAST[who][1]}</small></b><p>${esc(text)}</p></div></div>` : '';
      return `<h4>${res?.summary?.stars >= 2 ? 'The team\'s take' : 'The post-mortem'}</h4>${bubble('priya', debrief.priya)}${bubble('marcus', debrief.marcus)}${bubble('jo', debrief.jo)}
        ${debrief.next?.length ? `<h4>Try next</h4><ul class="rp-next">${debrief.next.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${debrief.weak?.length ? `<div class="rp-chips">${debrief.weak.map(conceptChip).join('')}</div>` : ''}`;
    }
    function levelHtml(l) {
      return `<div class="rp rp-level">
        ${err ? `<div class="sd-error" role="alert">${esc(err)}</div>` : ''}
        <div class="rp-head"><button type="button" class="rp-crumb" data-hub>← Ripple Ops</button>
          <div class="rp-title"><span class="sd-eyebrow">${esc(CHAPTERS[l.chapter] || l.chapter || '')} · ${esc(l.tier || '')} · ${esc(l.users || '')}${l.daily ? ' · DAILY' : ''}</span><h2 id="sd-heading" tabindex="-1">${esc(l.title)}</h2><p>${esc(l.kicker)}</p></div>
          ${stepsHtml()}</div>
        ${step === 'brief' ? briefHtml(l) : step === 'estimate' ? estimateHtml(l) : buildHtml(l)}
        ${chat ? chatHtml() : ''}</div>`;
    }

    // ---------- the review / interview drawer ----------
    function chatHtml() {
      const left = chat.mode === 'interview' && chat.ends ? Math.max(0, Math.round((chat.ends - Date.now()) / 1000)) : null;
      return `<aside class="rp-chat" aria-label="${chat.mode === 'interview' ? 'Mock interview' : 'Design review'}">
        <header><b>${chat.mode === 'interview' ? '🎤 Mock interview' : '🗣 Design review with Marcus'}</b>${left != null ? `<span class="rp-clock${left < 300 ? ' is-low' : ''}" data-clock>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>` : ''}
          ${chat.mode === 'interview' && !chat.eval ? '<button type="button" class="button" data-chat-end>End & score</button>' : ''}<button type="button" class="button" data-chat-close aria-label="Close">✕</button></header>
        <div class="rp-chat-log" data-chat-log>${chat.messages.map(m => m.role === 'note' ? `<p class="rp-note">⚡ ${esc(m.text)}</p>`
          : `<div class="rp-msg${m.role === 'user' ? ' is-me' : ''}">${m.role === 'user' ? '' : chat.mode === 'interview' ? '<span class="rp-av rp-av-int">I</span>' : B().avatar('marcus')}<div><p>${esc(m.text)}</p></div></div>`).join('')}
          ${chat.busy ? `<p class="rp-note">${chat.mode === 'interview' ? 'Interviewer' : 'Marcus'} is typing…</p>` : ''}${chat.error ? `<p class="rp-err">${esc(chat.error)}</p>` : ''}
          ${chat.eval ? evalHtml(chat.eval) : ''}</div>
        ${chat.eval ? '' : `<form class="rp-chat-in" data-chat-form><textarea data-chat-text rows="2" placeholder="Your answer… (Enter sends, Shift+Enter for a new line)" ${chat.busy ? 'disabled' : ''}></textarea><button type="submit" class="button is-primary" ${chat.busy ? 'disabled' : ''}>Send</button></form>`}</aside>`;
    }
    function evalHtml(e) {
      return `<div class="rp-eval"><h4>Verdict: ${esc(e.verdict)}</h4><p>${esc(e.summary)}</p>
        ${e.strengths?.length ? `<h5>Strengths</h5><ul>${e.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${e.gaps?.length ? `<h5>Gaps</h5><ul>${e.gaps.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${e.weak?.length ? `<div class="rp-chips">${e.weak.map(conceptChip).join('')}</div>` : ''}</div>`;
    }
    async function chatSend(text) {
      if (!chat || chat.busy) return;
      if (text) chat.messages.push({ role: 'user', text });
      chat.busy = true; chat.error = ''; paintChat();
      try {
        const r = await call('/review', 'POST', { level: L.base || L.id, mode: chat.mode, graph: builder?.graph() || {}, run: runPayload(), messages: chat.messages, scenario: L.generated || L.daily ? L : null, ...reasoning() });
        if (dead || !chat) return;
        chat.messages.push({ role: 'assistant', text: r.reply });
        if (r.whatif) whatIf(r.whatif);
      } catch (e) { if (chat) chat.error = e.message === 'auth' ? '' : e.message; }
      if (chat) { chat.busy = false; paintChat(); }
    }
    function whatIf(ev) {
      if (!builder) return;
      const label = ev.label || `${Sim().EVENT_LABEL[ev.type]} at ${hh(ev.at)}`;
      const r = builder.run([{ ...ev, label }]);
      if (!r) return;
      const e = r.events.find(x => x.id === 'whatif') || r.events.at(-1), worst = r.findings.find(f => f.level === 'bad');
      const text = `What-if: ${label} → ${e.outcome}, ${(e.ok * 100).toFixed(1)}% of requests ok${e.lost >= 1 ? `, ${B().fmt(e.lost)} writes lost` : ''}. ${worst ? worst.text : 'Nothing broke.'}`;
      chat.messages.push({ role: 'note', text });
      postRun(r, { whatif: true });
    }
    async function chatEnd() {
      if (!chat || chat.busy) return;
      chat.busy = true; chat.error = ''; paintChat();
      try { chat.eval = await call('/review/end', 'POST', { level: L.base || L.id, mode: 'interview', graph: builder?.graph() || {}, run: runPayload(), messages: chat.messages, scenario: L.generated || L.daily ? L : null, ...reasoning() }); }
      catch (e) { if (chat) chat.error = e.message; }
      if (chat) { chat.busy = false; paintChat(); }
    }
    function paintChat() {
      const old = el.querySelector('.rp-chat'), draft = old?.querySelector('[data-chat-text]')?.value || '';
      if (!chat) { old?.remove(); return; }
      const tmp = document.createElement('div'); tmp.innerHTML = chatHtml();
      if (old) old.replaceWith(tmp.firstElementChild); else el.querySelector('.rp-level')?.appendChild(tmp.firstElementChild);
      const log = el.querySelector('[data-chat-log]'); if (log) log.scrollTop = log.scrollHeight;
      const ta = el.querySelector('[data-chat-text]'); if (ta) { ta.value = draft; if (!chat.busy) ta.focus(); }
    }
    let clock = null;
    function openChat(mode) {
      if (chat && chat.mode === mode) return;
      const saved = readLocal(`rp-chat-${L.id}-${mode}`);
      chat = saved && !saved.eval ? { ...saved, busy: false, error: '' } : { mode, messages: [], busy: false, error: '', ends: mode === 'interview' ? Date.now() + 45 * 60 * 1000 : null };
      paintChat();
      clearInterval(clock);
      if (chat.ends) clock = setInterval(() => { const c = el.querySelector('[data-clock]'); if (!chat || !c) return; const left = Math.max(0, Math.round((chat.ends - Date.now()) / 1000)); c.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; c.classList.toggle('is-low', left < 300); }, 1000);
      if (!chat.messages.length) chatSend('');
    }
    const keepChat = () => { if (chat && L) writeLocal(`rp-chat-${L.id}-${chat.mode}`, { mode: chat.mode, messages: chat.messages, ends: chat.ends, eval: chat.eval }); };

    // ---------- runs ----------
    function runPayload() {
      if (!res) return null;
      return { stars: res.summary.stars, objectives: res.summary.objectives, events: res.events.map(e => ({ label: e.label, outcome: e.outcome, at: e.at })),
        findings: res.findings.slice(0, 12).map(f => ({ level: f.level, text: f.text })), bill: res.bill.items.slice(0, 8).map(i => ({ defId: i.defId, usd: i.usd })) };
    }
    async function postRun(r, flags = {}) {
      const body = { key: Math.random().toString(36).slice(2) + Date.now().toString(36), level: L.base || L.id, daily: L.daily || null, generated: !!L.generated, whatif: !!flags.whatif,
        engine: Sim().VERSION, stars: r.summary.stars, availability: r.summary.availability, cost: r.bill.total,
        objectives: r.summary.objectives.map(o => ({ id: o.id, label: o.label, target: o.target, actual: o.actual, pass: o.pass })),
        events: r.events.map(e => ({ id: String(e.id), type: e.type, label: String(e.label).slice(0, 120), at: e.at, outcome: e.outcome })),
        findings: r.findings.slice(0, 60).map(f => ({ id: f.id.slice(0, 120), level: f.level, concept: f.concept || '', text: f.text.slice(0, 600), who: f.who || '' })),
        bill: r.bill.items.slice(0, 60).map(i => ({ id: i.id, defId: i.defId, usd: i.usd, detail: (i.detail || '').slice(0, 200) })),
        estimates: flags.whatif || !graded ? [] : graded.filter(g => g.answer != null).map(g => ({ key: g.key, answer: g.answer, truth: g.truth, verdict: g.verdict })),
        graph: builder.graph(), ...reasoning() };
      try { return await call('/runs', 'POST', body); } catch (e) { if (e.message !== 'auth') err = `This run wasn't saved (${e.message}).`; return null; }
    }
    async function onRun(r, g, info) {
      if (info.whatif) return;
      res = r; attempts++; debrief = null; dbState = ''; posted = null; revealed = false; modalPlayed = false; closeModal(); refView = false; applyView();
      paintResults();
      // The day is over: stop the mic and wait for the last words, so the debrief grades everything he said.
      const said = window.Dictate?.settle(el);
      if (said) await said;
      if (dead) return;
      posted = await postRun(r);
      if (dead) return;
      if (posted?.progress) { ov.progress = posted.progress; }
      paintResults();
      if (posted?.id && ov.enabled) getDebrief();
    }
    async function getDebrief() {
      if (!posted?.id) return;
      dbState = 'busy'; paintResults();
      try { debrief = await call(`/runs/${posted.id}/debrief`, 'POST'); dbState = 'done'; }
      catch (e) { dbState = e.message === 'auth' ? '' : `The debrief didn't come through (${e.message}).`; }
      if (!dead) paintResults();
    }
    // The results wait for the end of the day. Saving the run and the LLM debrief carry on in the background meanwhile.
    function paintResults() {
      if (!L) return;
      const r = el.querySelector('[data-results]'); if (r) r.innerHTML = modalOpen ? '' : resultsHtml(L);
      const m = el.querySelector('[data-modal-body]'); if (m) fillModal(m);
      paintTabs();
    }
    function onDayEnd(info) {
      if (dead || info.whatif || !res || revealed) return;
      revealed = true;
      applyView();
      if (info.finished) openModal(); else paintResults();
    }
    function fillModal(body) {
      body.innerHTML = resultsHtml(L);
      if (modalPlayed) return;
      modalPlayed = true;
      // Each section pops in, one after another.
      const parts = [...body.children].flatMap(c => c.classList.contains('rp-res-grid') ? [...c.children].flatMap(col => [...col.children]) : [c]);
      parts.forEach((n, i) => { n.classList.add('rp-pop'); n.style.setProperty('--d', (0.15 + i * 0.35) + 's'); });
    }
    function openModal() {
      closeModal(true);
      modalOpen = true;
      const m = document.createElement('div');
      m.className = 'rp-modal'; m.dataset.modal = '';
      m.innerHTML = '<div class="rp-modal-card" role="dialog" aria-modal="true" aria-label="How the day went"><button type="button" class="rp-modal-x" data-modal-close aria-label="Close and keep the results below">✕</button><div class="rp-modal-body" data-modal-body></div></div>';
      el.appendChild(m);
      fillModal(m.querySelector('[data-modal-body]'));
      m.querySelector('.rp-modal-x').focus({ preventScroll: true });
      const r = el.querySelector('[data-results]'); if (r) r.innerHTML = '';
    }
    function closeModal(quiet) {
      el.querySelector('[data-modal]')?.remove();
      if (!modalOpen) return;
      modalOpen = false;
      if (!quiet) { paintResults(); el.querySelector('[data-results]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }

    // ---------- reasoning, time-linked to the design ----------
    // Each pause in what he writes or says becomes an entry: the words added and, when it changed, the design at that moment.
    const slim = g => g && { nodes: (g.nodes || []).map(n => ({ id: n.id, defId: n.defId, cfg: n.cfg })), edges: (g.edges || []).map(e => ({ from: e.from, to: e.to })), settings: g.settings };
    function logNotes() {
      clearTimeout(logTimer); logTimer = null;
      if (notes === logged) return;
      let i = 0; while (i < notes.length && i < logged.length && notes[i] === logged[i]) i++;
      const revised = i < logged.length, said = notes.slice(i).trim();
      logged = notes;
      if (!said) return;
      const g = slim(builder?.graph()), sig = g ? JSON.stringify(g) : '';
      timeline = [...timeline, { at: Date.now() / 1000, said: said.slice(0, 2000), revised, graph: sig && sig !== lastSig ? g : null }].slice(-40);
      if (sig) lastSig = sig;
    }
    const reasoning = () => { logNotes(); return { notes, timeline }; };

    // ---------- drafts ----------
    const draftKey = l => `rp-draft-${l.id}`;
    async function initialGraph(l) {
      const local = readLocal(draftKey(l));
      let server = null;
      try { server = (await call(`/drafts/${encodeURIComponent(l.id)}`)); } catch { /* offline: local copy */ }
      const pick = [server, local].filter(x => x?.graph?.nodes?.length).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
      if (pick) { notes = pick.notes || notes; logged = notes; timeline = Array.isArray(pick.timeline) ? pick.timeline : []; return pick.graph; }
      if (l.startFrom) {                                      // carry your own design forward from the level before
        let prev = readLocal(draftKey({ id: l.startFrom }));
        try { const s = await call(`/drafts/${encodeURIComponent(l.startFrom)}`); if (s?.graph?.nodes?.length && (!prev || (s.at || 0) > (prev.at || 0))) prev = s; } catch { /* fine */ }
        if (prev?.graph?.nodes?.length) return prev.graph;
      }
      return l.start;
    }
    function saveDraft(g) {
      if (!L) return;
      const doc = { graph: g, notes, timeline, at: Date.now() / 1000 };
      writeLocal(draftKey(L), doc);
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => call(`/drafts/${encodeURIComponent(L.id)}`, 'PUT', { graph: g, notes, timeline }).catch(() => {}), 1500);
    }

    // ---------- navigation ----------
    async function openLevel(l) {
      stopBuilder();
      L = l; step = readLocal(`rp-step-${l.id}`) || 'brief'; res = null; posted = null; debrief = null; dbState = ''; graded = null; est = readLocal(`rp-est-${l.id}`) || {};
      hints = 0; aiHint = ''; chat = null; notes = ''; editing = false; timeline = []; logged = ''; lastSig = ''; clearTimeout(logTimer); attempts = ov.progress.levels[l.base || l.id]?.attempts || 0;
      view = 'level';
      await paint();
    }
    async function openGenerated(id) {
      try { const s = await call(`/scenarios/${encodeURIComponent(id)}`); s.generated = true; await openLevel(s); }
      catch (e) { err = e.message; paint(); }
    }
    function stopBuilder() { stopVoice(); if (builder) { builder.flush(); builder.destroy(); builder = null; } casePage?.destroy(); casePage = null; clearInterval(clock); keepChat(); }
    async function mountBuilder() {
      const stage = el.querySelector('[data-stage]');
      if (!stage || !L) return;
      const initial = await initialGraph(L);
      if (dead || !el.contains(stage)) return;
      if (notes) paintNotes();      // the draft's reasoning arrived after the first paint
      const scn = L;
      builder = B().mount(stage, { mode: 'game', scenario: scn, toolbox: L.toolbox, storageKey: `rp-canvas-${L.id}`, initial, onChange: saveDraft, onRun, onDayEnd });
      await builder.ready;
    }
    async function paint() {
      if (dead) return;
      modalOpen = false; refView = false;
      stopBuilder();
      o.onRoute?.();
      if (view === 'hub') { el.innerHTML = hubHtml(); return; }
      if (view === 'case') {
        el.innerHTML = `<div class="rp rp-case-page"><div class="sd-breadcrumb"><button type="button" class="button" data-hub>← Ripple Ops</button><span>/ The incident archive</span></div><h2 id="sd-heading" tabindex="-1">${esc(L.title)}</h2><div data-case-host></div></div>`;
        casePage = window.SDOutage.page(el.querySelector('[data-case-host]'), L);
        el.querySelector('#sd-heading')?.focus({ preventScroll: true });
        return;
      }
      writeLocal(`rp-step-${L.id}`, step);
      el.innerHTML = levelHtml(L);
      if (step === 'build') await mountBuilder();
      el.querySelector('#sd-heading')?.focus({ preventScroll: true });
    }

    // ---------- events ----------
    const onClick = async ev => {
      if (ev.target.matches?.('[data-modal]')) { closeModal(); return; }
      const t = ev.target.closest('button, [data-open]');
      if (!t) return;
      const d = t.dataset;
      if (d.modalClose !== undefined) { closeModal(); return; }
      if (d.open) { const l = byId(d.open); if (l && unlocked(l.id)) await openLevel(l); }
      else if (d.case) openCase(d.case);
      else if (d.hub !== undefined) { stopBuilder(); view = 'hub'; L = null; await refresh(); paint(); }
      else if (d.step) { if (step === 'build') stopBuilder(); step = d.step; paint(); }
      else if (d.daily !== undefined) { const s = dailyScenario(); if (s) await openLevel({ ...byId(s.base), ...s, startFrom: s.base }); }
      else if (d.sandbox !== undefined) o.sandbox?.();
      else if (d.genOpen) await openGenerated(d.genOpen);
      else if (d.gen !== undefined) {
        genState = 'busy'; paint();
        try { const s = await call('/generate', 'POST', { focus: el.querySelector('[data-gen-focus]')?.value || '', size: el.querySelector('[data-gen-size]')?.value || 'scale-up' }); genState = ''; await refresh(); s.generated = true; await openLevel(s); }
        catch (e) { genState = e.message === 'auth' ? '' : `Couldn't write one just now (${e.message}).`; paint(); }
      }
      else if (d.lesson && d.section) { stopBuilder(); window.AppSections?.select(d.section, 'lesson/' + d.lesson); }
      else if (d.lesson) { stopBuilder(); window.SystemDesign?.openView('lesson/' + d.lesson); }
      else if (d.sim) { stopBuilder(); window.DesignSimulators?.openItem('internals', d.sim); }
      else if (d.check !== undefined) { graded = Sim().grade(L, est, L.estimate); paint(); }
      else if (d.hint !== undefined) { hints = Math.min((L.hints || []).length, hints + 1); rerenderStrip(); }
      else if (d.aiHint !== undefined) {
        t.disabled = true; t.textContent = '🫖 Priya is looking…';
        try { aiHint = (await call('/hint', 'POST', { level: L.base || L.id, graph: builder?.graph() || {}, run: runPayload(), messages: [], scenario: L.generated || L.daily ? L : null })).text; }
        catch (e) { aiHint = `(Priya couldn't look just now: ${e.message})`; }
        rerenderStrip();
      }
      else if (d.voice !== undefined) { if (voice) stopVoice(); else if (canTalk()) startVoice(); }
      else if (d.notesEdit !== undefined && mic === 'idle') { editing = !editing; if (!editing) logNotes(); paintNotes(); }
      else if (d.chat) openChat(d.chat);
      else if (d.chatClose !== undefined) { keepChat(); chat = null; clearInterval(clock); paintChat(); }
      else if (d.chatEnd !== undefined) await chatEnd().then(keepChat);
      else if (d.debrief !== undefined) getDebrief();
      else if (d.view !== undefined) setView(d.view === 'ref');
      else if (d.ref !== undefined && builder && L.solution) { closeModal(); setView(true); el.querySelector('[data-reftabs]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    };
    function rerenderStrip() {      // hints and notes sit above the builder: redraw them without remounting it
      const wrap = el.querySelector('.rp-build');
      if (!wrap) return;
      const tmp = document.createElement('div'); tmp.innerHTML = buildHtml(L);
      wrap.querySelector('.rp-strip').replaceWith(tmp.querySelector('.rp-strip'));
      const oldH = wrap.querySelector('.rp-hints'), newH = tmp.querySelector('.rp-hints');
      if (oldH && newH) oldH.replaceWith(newH); else if (newH) wrap.querySelector('.rp-strip').after(newH);
    }
    const onInput = ev => {
      const t = ev.target;
      if (t.dataset.est) { est[t.dataset.est] = t.value; writeLocal(`rp-est-${L.id}`, est); }
      else if (t.dataset.notes !== undefined) {
        notes = t.value; notesChanged();
      }
    };
    const onSubmit = ev => {
      if (!ev.target.matches('[data-chat-form]')) return;
      ev.preventDefault();
      const ta = el.querySelector('[data-chat-text]'), text = ta.value.trim();
      if (!text) return;
      ta.value = '';
      chatSend(text).then(keepChat);
    };
    const onKey = ev => {
      if (ev.key === 'Escape' && modalOpen) { ev.preventDefault(); closeModal(); return; }
      if (ev.key === 'Escape' && voice) { ev.preventDefault(); stopVoice(); return; }
      if (ev.target.matches('[data-chat-text]') && ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.target.form?.requestSubmit(); }
      if (ev.target.matches('[data-est]') && ev.key === 'Enter') { ev.preventDefault(); graded = Sim().grade(L, est, L.estimate); paint(); }
    };
    el.addEventListener('click', onClick); el.addEventListener('input', onInput); el.addEventListener('submit', onSubmit); el.addEventListener('keydown', onKey);

    (async () => {
      try { await loadStatic(); } catch (e) { el.innerHTML = `<p class="bd-note">Could not load Ripple Ops (${esc(e.message)}).</p>`; return; }
      await refresh();
      if (dead) return;
      const want = o.level || pending; pending = null;
      if (want && byId(want) && unlocked(want)) await openLevel(byId(want)); else paint();
    })();

    return { route: () => (view === 'level' && L && byId(L.id) ? L.id : ''), destroy() { dead = true; stopBuilder(); clearTimeout(draftTimer); clearTimeout(logTimer); el.removeEventListener('click', onClick); el.removeEventListener('input', onInput); el.removeEventListener('submit', onSubmit); el.removeEventListener('keydown', onKey); } };
  }

  // Lessons and the home page link straight into a level.
  function openLevel(id) {
    pending = id;
    // From another section (the AI course), switch to System Design first: Ripple Ops lives in its simulators view.
    if (window.AppSections?.current?.() && window.AppSections.current() !== 'system-design') {
      window.AppSections.select('system-design', 'simulators');
      setTimeout(() => window.DesignSimulators?.openItem('game', 'ripple'), 0);
    } else window.DesignSimulators?.openItem('game', 'ripple');
  }
  async function levelsFor(lesson) {
    try { await loadStatic(); } catch { return []; }
    return camp.levels.filter(l => (l.lessons || []).includes(lesson)).map(l => ({ id: l.id, title: l.title, tier: l.tier, side: !!l.side }));
  }
  window.RippleOps = { mount, openLevel, levelsFor };
})();
