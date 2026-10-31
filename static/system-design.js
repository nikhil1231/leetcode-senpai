// A complete design loop, with saved revisions and snapshot-based feedback.
(function () {
  'use strict';
  const { $, api, escapeHtml: esc, loader } = window.H;
  let catalog, session = null, assessments = [], exercise = null, lesson = null;
  let busy = false, dirty = false, edits = 0, saving = null, timer = null, poll = null, debounce = null;
  let active = false, paused = false, lastTick = 0, screen = 'home', error = '', epoch = 0;
  let conflictDraft = null, chatDraft = '', viewEpoch=0;
  const root = () => $('#tab-design');
  // getRandomValues also works on plain HTTP LAN origins.
  const id = () => Array.from(window.crypto.getRandomValues(new Uint8Array(16)),
    byte => byte.toString(16).padStart(2, '0')).join('');
  const call = (path = '', method = 'GET', body) => api('/system-design' + path, method, body);
  const date = t => new Date(t * 1000).toLocaleDateString();
  const clock = n => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  const caseOf = key => catalog.cases.find(c => c.id === key);
  const keyOf = () => `system-design:v1:${catalog.storage_scope}:${session.id}`;
  const activeKey = () => `system-design:active:${catalog.storage_scope}`;
  const button = (text, action, attrs = '', primary = false) => `<button type="button" class="button ${primary ? 'is-primary' : ''}" data-sd="${action}" ${attrs}>${esc(text)}</button>`;

  function stash() {
    if (!session || !catalog || conflictDraft) return;
    try {
      sessionStorage.setItem(keyOf(), JSON.stringify({ fields: session.fields, revision: session.revision,
        elapsed_sec: session.elapsed_sec, timing_uncertain: session.timing_uncertain, dirty, chatDraft }));
      sessionStorage.setItem(activeKey(), session.id);
    } catch (_) { /* Server saves remain available if browser storage is disabled. */ }
  }

  function restore() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(keyOf()));
      chatDraft = typeof draft?.chatDraft === 'string' ? draft.chatDraft.slice(0,2000) : '';
      if (!draft?.dirty) return;
      if (draft.revision !== session.revision) {
        conflictDraft = draft;
        error = 'A newer version was saved elsewhere. Your local draft is retained; download it before replacing it.';
        return;
      }
      if (Object.keys(catalog.fields).every(k => typeof draft.fields?.[k] === 'string' && draft.fields[k].length <= (k==='diagram'?4000:8000))) {
        session.fields = draft.fields;
        session.elapsed_sec = Math.max(session.elapsed_sec, draft.elapsed_sec || 0);
        session.timing_uncertain = true;
        dirty = true; edits++;
      }
    } catch (_) {}
  }

  function tick() {
    const now = performance.now();
    if (lastTick && active && screen === 'workspace' && !paused && document.visibilityState !== 'hidden') {
      session.elapsed_sec += (now - lastTick) / 1000;
      if ($('#sd-clock')) $('#sd-clock').textContent = clock(session.elapsed_sec);
    }
    lastTick = now;
  }

  function stopTimers() {
    tick();
    clearInterval(timer); timer = null; lastTick = 0;
    clearTimeout(poll); poll = null;
  }

  function startTimers() {
    stopTimers();
    if (!active || !session || screen !== 'workspace') return;
    lastTick = performance.now();
    timer = setInterval(tick, 1000);
    schedulePoll();
  }

  function schedulePoll() {
    clearTimeout(poll); poll = null;
    if (!active || screen !== 'workspace' || document.visibilityState === 'hidden' || !assessments.some(a => a.status === 'pending' && Date.now()/1000-(a.started_at||a.created_at)<180)) return;
    const sid = session.id, ticket = epoch;
    poll = setTimeout(async () => {
      try {
        const result = await call('/sessions/' + sid);
        if (ticket !== epoch || session?.id !== sid || !active) return;
        assessments = result.assessments;renderModelChip();
        // Refresh feedback only: a late result must not replace unsaved text.
        const node = $('#sd-assessments');
        if (node) { node.innerHTML = assessmentHtml(); wire(node); }
      } catch (e) {
        if (ticket === epoch) { error = e.message; showError(); }
      }
      if (ticket === epoch) schedulePoll();
    }, 2500);
  }

  function showError() {
    const node = $('#sd-error');
    if (node) { node.textContent = error; node.hidden = !error; }
  }

  function saveStatus(text) {
    if ($('#sd-save-status')) $('#sd-save-status').textContent = text;
  }

  async function saveDraft() {
    if (!session) return;
    if (conflictDraft) throw new Error('Choose which recovered draft to use before saving. Both versions are still available.');
    if (saving) { await saving; if (dirty) return saveDraft(); return; }
    if (timer) tick();
    const ticket = edits, sid = session.id;
    const body = { revision: session.revision, fields: { ...session.fields },
      elapsed_sec: Math.floor(session.elapsed_sec), timing_uncertain: session.timing_uncertain };
    saveStatus('Saving…');
    saving = (async () => {
      try {
        const result = await call('/sessions/' + sid, 'PUT', body);
        if (session?.id !== sid) return;
        const fields = session.fields, elapsed = session.elapsed_sec;
        session = { ...result, fields, elapsed_sec: Math.max(elapsed, result.elapsed_sec) };
        dirty = edits !== ticket;
        stash(); saveStatus(dirty ? 'Unsaved edits' : 'Saved');
      } catch (e) {
        dirty = true; error = e.message; stash(); showError(); saveStatus('Not saved — local draft retained');
        throw e;
      }
    })();
    try { await saving; } finally { saving = null; }
  }

  async function act(fn) {
    if (busy) return;
    const previousScreen=screen, previousStage=stage, previousLesson=lesson, previousSide=side;
    busy = true; error = ''; showError();
    root().querySelectorAll('button,input,textarea,select').forEach(n => { n.disabled = true; });
    try { await fn(); }
    catch (e) { error = e.message; }
    finally {
      busy = false; paint();
      if (screen!==previousScreen || stage!==previousStage) {
        root().scrollIntoView({block:'start'});
        $('#sd-heading')?.focus({preventScroll:true});
      } else if (side!==previousSide) {
        $('#sd-side-'+side)?.focus({preventScroll:true});
      } else if (lesson && lesson!==previousLesson) {
        root().querySelector('.sd-lesson')?.scrollIntoView({block:'nearest',behavior:'smooth'});
      }
    }
  }

  function diagram(text) {
    const paths = text.split('\n').map(l => l.split(/\s*(?:->|→)\s*/).map(n => n.trim()).filter(Boolean)).filter(p => p.length > 1);
    const nodes = [...new Set(paths.flat())].slice(0, 12);
    if (!nodes.length) return '<p class="sd-muted">Write connections such as Client → API → Database. Your diagram will appear here.</p>';
    const xy = n => { const i = nodes.indexOf(n); return { x: 120 + (i % 3) * 240, y: 50 + Math.floor(i / 3) * 110 }; };
    const edges = paths.flatMap(p => p.slice(1).map((n, i) => [p[i], n])).filter(([a,b]) => nodes.includes(a) && nodes.includes(b));
    return `<svg class="sd-diagram" viewBox="0 0 720 ${Math.ceil(nodes.length / 3) * 110}" role="img" aria-label="Architecture connections">
      <defs><marker id="sd-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"/></marker></defs>
      ${edges.map(([a,b]) => { const p = xy(a), q = xy(b); const dx = q.x-p.x, dy = q.y-p.y, len = Math.hypot(dx,dy) || 1;
        return `<line x1="${p.x}" y1="${p.y}" x2="${q.x-dx/len*48}" y2="${q.y-dy/len*30}" marker-end="url(#sd-arrow)"/>`; }).join('')}
      ${nodes.map(n => { const p = xy(n); return `<g><rect x="${p.x-95}" y="${p.y-24}" width="190" height="48" rx="8"/><text x="${p.x}" y="${p.y+4}" text-anchor="middle">${esc(n.slice(0,26))}</text></g>`; }).join('')}</svg>`;
  }

  function lessonHtml() {
    if (!lesson) return '';
    return `<article class="sd-panel sd-lesson"><div class="sd-eyebrow">Focused lesson · supported practice</div><h3>${esc(lesson.title)}</h3>
      <p><strong>${esc(lesson.principle)}</strong></p><p>${esc(lesson.worked)}</p>
      <p><b>Explain:</b> ${esc(lesson.question)}</p><p><b>Repair your design:</b> ${esc(lesson.repair)}</p>
      ${lesson.source ? `<p><a href="${esc(lesson.source[1])}" target="_blank" rel="noopener noreferrer">${esc(lesson.source[0])}</a></p>` : ''}
      <p><a href="#/system-design/lesson/${lesson.id}">Open the full lesson and knowledge check →</a></p>${button('Close lesson', 'close-lesson')}</article>`;
  }

  function assessmentHtml() {
    if (!assessments.length) return '<p class="sd-muted">Save a complete first pass, then request feedback. Each assessment retains the exact version it reviewed.</p>';
    return assessments.map((a, index) => {
      const header = `Saved version ${a.snapshot.revision} · ${date(a.created_at)}`;
      if (a.status !== 'complete') {
        const running=a.status==='pending' && Date.now()/1000-(a.started_at||a.created_at)<180;
        return `<article class="sd-feedback"><b>${esc(header)}</b><p>${running?'Reviewing your saved design. You can keep editing.':a.status==='pending'?'The review is delayed. Retry this saved assessment.':esc(a.error)}</p>${running?'<span class="sd-review-pending" role="status">Review in progress…</span>':button('Retry assessment','retry',`data-id="${a.id}"`)}</article>`;
      }
      const result = a.assessment.result;
      const body = `<p>${esc(result.summary)}</p>${result.findings.map(f => `<div class="sd-feedback"><b>${esc(catalog.skills[f.skill])} · ${esc(f.status.replaceAll('_',' '))}</b>
        ${f.evidence ? `<blockquote>${esc(f.evidence)}</blockquote>` : ''}<p>${esc(f.observation)}</p><p>${esc(f.consequence)}</p><p>${esc(f.repair)}</p></div>`).join('')}
        <p class="sd-muted">AI-reviewed observation · ${a.snapshot.assisted || result.assisted ? 'Supported attempt' : 'No recorded help'} · ${esc(a.assessment.model)}</p>
        <div class="sd-actions">${button('Learn: ' + catalog.skills[result.next_skill], 'lesson', `data-skill="${result.next_skill}"`)}
        ${button('Practise this skill', 'focus', `data-skill="${result.next_skill}"`)}</div>`;
      return index === 0 ? `<article><div class="sd-eyebrow">${esc(header)}</div>${body}</article>` : `<details class="sd-panel"><summary>${esc(header)}</summary>${body}</details>`;
    }).join('');
  }

  const baseCaseNames = {links:'Link service', jobs:'Document processing', seats:'Seat reservations'};
  const caseNames = new Proxy(baseCaseNames, {get: (t, k) => t[k] || catalog?.cases?.find(c => c.id === k)?.name || String(k)});
  const caseDetails = {links:['01', '20k reads / sec', 'Freshness · caching · durability'], jobs:['02', '30 jobs / sec', 'Queues · retries · recovery'], seats:['03', '5-minute holds', 'Concurrency · consistency · ownership']};
  const steps = [
    {title:'Define the system', short:'Scope', fields:['requirements','interfaces'], note:'Make the guarantees explicit. Then describe the interface and the state it changes.'},
    {title:'Connect the pieces', short:'Architecture', fields:['flow','diagram'], note:'Trace a request end to end. Add a component only when you can explain its job.'},
    {title:'Test your decisions', short:'Trade-offs', fields:['tradeoffs','failures'], note:'Explain what you chose, what can fail, and how the system recovers.'},
  ];
  let stage = 0, side = 'brief', selectedCase = 'links', selectedMode = 'learn', mobileBriefOpen=false;
  function pageIntro(kicker, title, description) {
    return `<div class="sd-page-intro"><span class="sd-eyebrow">${kicker}</span><h2 tabindex="-1" id="sd-heading">${title}</h2><p>${description}</p></div>`;
  }
  function caseCards(limit) {
    const tried = new Set(catalog.sessions.map(s=>s.case_id));
    const cases = limit ? [...catalog.cases].sort((x,y)=>tried.has(x.id)-tried.has(y.id)).slice(0,limit) : catalog.cases;
    return `<div class="sd-case-grid">${cases.map((c,i) => {
      const [n,metric,tags] = caseDetails[c.id] || [String(i+1).padStart(2,'0'), c.metric||'', c.tags||''];
      return `<article class="sd-case-card"><div class="sd-case-top"><span class="sd-case-number">${n}</span><span>${esc(c.family)}</span></div>
        <div class="sd-case-symbol" aria-hidden="true">${caseGlyph(c.id)}</div><h3>${esc(caseNames[c.id])}</h3><p>${esc(c.summary)}</p>
        <div class="sd-case-tags">${esc(tags)}</div><div class="sd-case-bottom"><span>${metric}</span>${button('Explore case →','case',`data-case="${c.id}"`)}</div></article>`;
    }).join('')}</div>`;
  }
  function caseGlyph(key) {
    if (!['links','jobs','seats'].includes(key)) return '<svg viewBox="0 0 104 65" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="6" y="20" width="22" height="22" rx="5"/><rect x="41" y="8" width="22" height="22" rx="5"/><rect x="41" y="36" width="22" height="22" rx="5"/><rect x="76" y="20" width="22" height="22" rx="5"/><path d="M28 31h13m22-12 13 10M63 47l13-10"/></svg>';
    const shapes = key === 'links' ? '<rect x="5" y="18" width="35" height="25" rx="6"/><rect x="60" y="18" width="35" height="25" rx="6"/><path d="M40 30h20m-6-5 6 5-6 5"/>' : key === 'jobs' ? '<rect x="4" y="18" width="23" height="25" rx="5"/><rect x="39" y="12" width="23" height="37" rx="5"/><rect x="75" y="18" width="23" height="25" rx="5"/><path d="M27 30h12m23 0h13M46 24h9m-9 7h9m-9 7h9"/>' : '<rect x="37" y="20" width="27" height="27" rx="6"/><path d="M12 12h18v7m-6-5 6 5 5-6M88 12H71v7m-5-6 5 6 6-5M50 47v11"/><circle cx="12" cy="12" r="3"/><circle cx="88" cy="12" r="3"/>';
    return `<svg viewBox="0 0 104 65" fill="none" stroke="currentColor" stroke-width="1.6">${shapes}</svg>`;
  }
  function savedHtml(limit = 5) {
    if (!catalog.sessions.length) return '';
    return `<section class="sd-saved"><div class="sd-section-title"><h3>Pick up where you left off</h3><span>${catalog.sessions.length} saved ${catalog.sessions.length===1?'design':'designs'}</span></div>
      ${catalog.sessions.slice(0,limit).map(s => `<button type="button" class="sd-saved-row" data-sd="resume" data-id="${s.id}"><span class="sd-saved-icon">${caseGlyph(s.case_id)}</span><span><strong>${esc(caseNames[s.case_id])}</strong><small>${s.mode==='interview'?'Interview practice':'Guided practice'} · ${date(s.updated_at)}</small></span><span class="sd-saved-time">${Math.round(s.elapsed_sec/60)} min</span><span aria-hidden="true">→</span></button>`).join('')}</section>`;
  }
  function homeHtml() {
    if (screen === 'cases') return pageIntro('DESIGN PRACTICE','One brief. Many defensible designs.','Work through a realistic case, explain your choices, and revisit the weak spots.') + caseCards() + savedHtml(20);
    if (screen === 'skills') return skillsHtml();
    if (['lessons','curriculum','lesson','quickfire'].includes(screen)) return window.DesignLearning.render(screen,catalog);
    if (screen === 'papers') return window.DesignPapers.render(catalog);
    if (screen === 'drills') return window.DesignDrills.render();
    if (screen === 'redesign') return window.DesignRedesign.render();
    if (screen === 'mistakes') return pageIntro('MISTAKES BOOK','Every miss, in one place.','Wrong, revealed and guessed answers land here. An item clears when you answer it correctly on a later day, so a same-day fix waits for confirmation.') + window.DesignLedger.slot('mistakes');
    return `<div class="hub-slot" data-hub-view="${['practise','progress'].includes(screen)?screen:'home'}"></div>`;
  }
  function skillsHtml() {
    return pageIntro('FOCUSED PRACTICE','Small decisions. Stronger instincts.','A short exercise isolates one skill. Make your choice before opening the explanation.') + `<div class="sd-drill-list">${catalog.exercises.map((q,i)=>`<button type="button" class="sd-drill-row" data-sd="practice" data-id="${q.id}"><span class="sd-row-number">0${i+1}</span><span><small>${esc(catalog.skills[q.skill])}</small><strong>${esc(q.title)}</strong></span><span class="sd-duration">2–5 min</span><span class="sd-row-arrow">→</span></button>`).join('')}</div>`;
  }
  function setupHtml() {
    const c = caseOf(selectedCase);
    return `<div class="sd-breadcrumb">${button('← Design cases','view','data-view="cases"')}<span>/ ${esc(caseNames[c.id])}</span></div><div class="sd-setup"><div>${pageIntro(esc(c.family),esc(c.title),esc(c.prompt))}<section class="sd-brief"><h3>The brief</h3><ul>${c.requirements.map((r,i)=>`<li><span>0${i+1}</span><p>${esc(r)}</p></li>`).join('')}</ul></section></div>
      <aside class="sd-session-setup"><span class="sd-eyebrow">SET UP YOUR SESSION</span><h3>How do you want to practise?</h3><fieldset class="sd-mode-options"><legend class="sr-only">Practice mode</legend><label><input type="radio" name="sd-mode" value="learn" ${selectedMode==='learn'?'checked':''}><span><strong>Guided practice</strong><small>Ask questions and learn as you design.</small></span></label><label><input type="radio" name="sd-mode" value="interview" ${selectedMode==='interview'?'checked':''}><span><strong>Interview practice</strong><small>Work independently. Explain your reasoning.</small></span></label></fieldset>
      <div class="sd-setup-selects"><label for="sd-minutes">Time target<select class="select" id="sd-minutes">${[5,15,45].map(n=>`<option value="${n}" ${catalog.profile.minutes===n?'selected':''}>${n} minutes</option>`).join('')}</select></label><label for="sd-level">Target depth<select class="select" id="sd-level">${['foundation','mid','senior'].map(n=>`<option value="${n}" ${catalog.profile.level===n?'selected':''}>${n==='mid'?'Mid-level':n[0].toUpperCase()+n.slice(1)}</option>`).join('')}</select></label></div>
      ${button('Start designing →','start',`data-case="${c.id}"`,true)}<p class="sd-muted">${catalog.coach_enabled?'Your coach is ready. Feedback is available when you finish a first pass.':'Drafts, lessons and drills are ready. AI coaching is not connected on this preview.'}</p></aside></div>`;
  }
  function workspaceHtml() {
    const c = caseOf(session.case_id), step = steps[stage];
    const canReview=catalog.coach_enabled && !assessments.some(a=>a.status==='pending' && Date.now()/1000-(a.started_at||a.created_at)<180);
    const hints = { requirements:'What must remain true? Which assumptions are you making?', interfaces:'Describe the API, identifiers, stored state, and ownership checks.', flow:'Walk through a successful write and a successful read, one step at a time.', diagram:'Client -> API\nAPI -> Database\nAPI -> Queue\nQueue -> Worker', tradeoffs:'I chose… because…\nI would reconsider if…', failures:'If this component fails…\nThe durable state is…\nRecovery happens by…' };
    return `<div class="sd-workspace-heading"><div><div class="sd-breadcrumb">${button('← All cases','home')}<span>/ ${session.mode==='interview'?'Interview practice':'Guided practice'}</span></div><h2 id="sd-heading" tabindex="-1">${esc(caseNames[c.id])}</h2></div><div class="sd-workspace-meta"><span class="sd-save-wrap"><i></i><span id="sd-save-status" role="status">${dirty?'Unsaved edits':'Saved'}</span></span><span class="sd-timer"><b id="sd-clock">${clock(session.elapsed_sec)}</b><span>/ ${session.minutes}m</span>${button(paused?'Resume':'Pause','pause')}</span></div></div>
      ${conflictDraft?`<div class="sd-conflict"><strong>Two versions of this design are available.</strong><p>Download your local draft or choose which version to continue.</p><div class="sd-actions">${button('Download local draft','download')}${button('Restore local draft','restore-local')}${button('Use server version','use-server')}</div></div>`:''}
      <div class="sd-workspace"><section class="sd-design-sheet"><nav class="sd-stepper" aria-label="Design steps">${steps.map((s,i)=>`<button type="button" data-sd="stage" data-stage="${i}" ${stage===i?'aria-current="step"':''}><span>${i+1}</span>${s.short}</button>`).join('')}</nav>
      <div class="sd-step-content"><span class="sd-eyebrow">STEP ${stage+1} OF 3</span><h3>${step.title}</h3><p class="sd-step-note">${step.note}</p>${step.fields.map(k=>`<div class="sd-field"><label for="sd-field-${k}">${esc(catalog.fields[k])}</label><textarea id="sd-field-${k}" class="textarea" data-field="${k}" rows="${k==='diagram'?5:7}" maxlength="${k==='diagram'?4000:8000}" placeholder="${esc(hints[k])}">${esc(session.fields[k])}</textarea>${k==='diagram'?`<div class="sd-diagram-preview"><span class="sd-eyebrow">LIVE PREVIEW</span><div id="sd-diagram">${diagram(session.fields.diagram)}</div></div>`:''}</div>`).join('')}
      <div class="sd-step-footer"><span>${stage?button('← Previous','stage',`data-stage="${stage-1}"`):button('Export draft','download')}</span>${stage<2?button('Next: '+steps[stage+1].short+' →','stage',`data-stage="${stage+1}"`,true):button('Review my design','assess',canReview?'':'disabled',true)}</div>${stage===2&&!catalog.coach_enabled?'<p class="sd-muted">AI review is unavailable on this preview. Your design is saved; use the brief to check its guarantees.</p>':''}</div></section>
      <aside class="sd-companion ${side==='brief'&&!mobileBriefOpen&&!lesson?'is-brief-collapsed':''}"><div class="sd-companion-tabs" role="tablist" aria-label="Design companion">${['brief','coach','feedback'].map(k=>`<button type="button" role="tab" id="sd-side-${k}" aria-controls="sd-companion-content" aria-selected="${side===k}" tabindex="${side===k?0:-1}" data-sd="side" data-side="${k}">${k==='brief'?'Brief':k==='coach'?'Coach':'Feedback'}${k==='feedback'&&assessments.length?`<span>${assessments.length}</span>`:''}</button>`).join('')}</div>${side==='brief'?`<div class="sd-mobile-brief-toggle">${button(mobileBriefOpen?'Hide case brief ↑':'Show case brief ↓','toggle-brief','aria-expanded="'+mobileBriefOpen+'" aria-controls="sd-companion-content"')}</div>`:''}
      <div class="sd-companion-body" id="sd-companion-content" role="tabpanel" aria-labelledby="sd-side-${side}">${side==='brief'?`<span class="sd-eyebrow">${esc(c.family)}</span><h3>The system you’re designing</h3><p>${esc(c.prompt)}</p><h4>Requirements</h4><ul class="sd-requirements">${c.requirements.map(r=>`<li>${esc(r)}</li>`).join('')}</ul><details class="sd-resources"><summary>Need a concept refresher?</summary><div>${c.skills.map(k=>button(catalog.skills[k],'lesson',`data-skill="${k}"`)).join('')}</div></details>`:side==='coach'?coachHtml():`<h3>Feedback on your design</h3><div id="sd-assessments">${assessmentHtml()}</div>${catalog.coach_enabled?button('Review saved design','assess',canReview?'':'disabled',true):'<p class="sd-connection-note">AI review is not connected on this preview.</p>'}`}${lessonHtml()}</div></aside></div>`;
  }
  function coachHtml() {
    if (!catalog.coach_enabled) return `<div class="sd-companion-empty"><span class="sd-mini-icon">◌</span><h3>Your thinking comes first.</h3><p>Live coaching is not connected on this preview. Use the brief to guide your design, or open a short lesson when you need a hand.</p>${caseOf(session.case_id).skills.map(k=>button(catalog.skills[k],'lesson',`data-skill="${k}"`)).join('')}</div>`;
    return `<h3>${session.mode==='interview'?'Your interviewer':'Think it through together'}</h3><p class="sd-muted">${session.mode==='interview'?'Clarifications and questions, without solution hints.':'Ask about one decision. Hints are recorded as support.'}</p><div class="sd-chat" id="sd-chat">${session.chat.length?session.chat.map(m=>`<div class="sd-message ${m.role==='coach'?'is-coach':''}"><b>${m.role==='coach'?'Coach':'You'}${m.error?' · unavailable':''}</b>${esc(m.text)}</div>`).join(''):'<p class="sd-muted">Start with a question, or explain a choice you’re considering.</p>'}</div><label for="sd-message" class="label-sm">Your question or decision</label><textarea id="sd-message" class="textarea" rows="4" maxlength="2000" placeholder="What happens if…">${esc(chatDraft)}</textarea><div class="sd-actions">${button('Send message ↑','chat','',true)}</div>`;
  }
  function exerciseHtml() {
    const q = exercise.question, result = exercise.result;
    return `<div class="sd-breadcrumb">${button(session?'← Back to design':'← Skill drills',session?'back':'view',session?'':'data-view="skills"')}</div><div class="sd-exercise"><span class="sd-eyebrow">${esc(catalog.skills[q.skill])} · ${q.choices.length?'DECISION DRILL':'RECALL DRILL'}</span><h2 id="sd-heading" tabindex="-1">${esc(q.title)}</h2><p class="sd-exercise-prompt">${esc(q.prompt)}</p>
      <fieldset class="sd-answer-options"><legend class="sr-only">Your answer</legend>${q.choices.length?q.choices.map((c,i)=>`<label class="sd-choice"><input type="radio" name="sd-answer" value="${i}" ${String(exercise.answer)===String(i)?'checked':''} ${result?'disabled':''}><span class="sd-choice-letter">${String.fromCharCode(65+i)}</span><span>${esc(c)}</span></label>`).join(''):`<label for="sd-answer" class="label-sm">Your answer (number only)</label><input id="sd-answer" class="input" inputmode="decimal" autocomplete="off" value="${esc(exercise.answer||'')}" ${result?'disabled':''}>`}</fieldset>
      ${result?`<div class="sd-answer-feedback ${result.record.correct&&!result.record.revealed?'is-correct':''}" role="status"><span class="sd-eyebrow">${result.record.revealed?'ANSWER REVEALED':result.record.correct?'WELL REASONED':'A USEFUL DISTINCTION'}</span><p>${esc(result.explanation)}</p><p class="sd-muted">Answer: ${esc(result.answer)} · ${result.record.assisted||result.record.revealed?'Supported practice':'Independent exercise'}</p></div>`:''}
      <div class="sd-exercise-actions">${!result?`${button('Check answer →','answer','',true)}${button('Reveal answer','reveal')}`:button(session?'Apply it to your design →':'Back to drills →',session?'back':'view',session?'':'data-view="skills"',true)}${button('Read the lesson','lesson',`data-skill="${q.skill}"`)}</div><p class="sd-muted">${result?'This skill will return for a later check.':'Commit to an answer first. The explanation is where the learning happens.'}</p>${lessonHtml()}</div>`;
  }

  function paint() {
    if (!catalog || !root()) return;
    window.DesignLearning.setCatalog(catalog,screen);
    root().innerHTML = `<div id="sd-error" class="sd-error" role="alert" ${error?'':'hidden'}>${esc(error)}</div>` +
      (screen==='workspace'?workspaceHtml():screen==='exercise'?exerciseHtml():screen==='setup'?setupHtml():homeHtml());
    wire(root());
    window.DesignLearning.wire(root());
    if (screen==='papers') window.DesignPapers.wire(root()); else window.DesignPapers.stop();
    if (screen==='drills') window.DesignDrills.wire(root()); else window.DesignDrills.stop();
    if (screen==='redesign') window.DesignRedesign.wire(root()); else window.DesignRedesign.stop();
    window.DesignLedger.mount(root());
    const hub=root().querySelector('.hub-slot');
    if(hub)window.Hub.mount(hub,'system-design',hub.dataset.hubView);
    renderModelChip();
    if (document.body.classList.contains('section-design')) {
      window.AppSections?.setView(screen);
      history.replaceState(null, '', '#/system-design' + (screen==='home'?'':'/'+(screen==='lesson'?window.DesignLearning.route():screen==='redesign'?window.DesignRedesign.route():screen)));
    }
    if (screen==='workspace') {
      root().querySelectorAll('[role="tab"]').forEach(n=>n.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        const tabs=[...root().querySelectorAll('[role="tab"]')],index=tabs.indexOf(n);
        tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length].click();
      }));
      root().querySelectorAll('[data-field]').forEach(n => n.addEventListener('input', () => {
        session.fields[n.dataset.field] = n.value; dirty = true; edits++; stash(); saveStatus('Unsaved edits');
        if (n.dataset.field==='diagram') $('#sd-diagram').innerHTML = diagram(n.value);
        clearTimeout(debounce); debounce = setTimeout(() => { if (!busy) saveDraft().catch(()=>{}); }, 850);
      }));
      const chatNode = $('#sd-chat'); if (chatNode) chatNode.scrollTop = chatNode.scrollHeight;
      $('#sd-message')?.addEventListener('input',e=>{chatDraft=e.target.value;stash();});
      if(conflictDraft)root().querySelectorAll('[data-field]').forEach(n=>{n.disabled=true;});
    }
    startTimers();
  }

  async function openSession(sid, navigation=null) {
    const result = await call('/sessions/' + sid);
    if(navigation!==null && navigation!==viewEpoch)return false;
    session = result.session; assessments = result.assessments; exercise = null; lesson = null;
    stage=0;side='brief';mobileBriefOpen=false;screen = 'workspace'; dirty = false; paused = false; conflictDraft=null; chatDraft=''; epoch++;
    session.timing_uncertain = true;
    restore(); stash();
    return true;
  }

  async function practice(qid) {
    if (session && screen==='workspace') await saveDraft();
    exercise = await call('/practice','POST',{request_id:id(),exercise_id:qid});
    exercise.startedAt = performance.now();
    screen = 'exercise'; lesson = null; epoch++;
  }

  function wire(container) {
    container.querySelectorAll('[data-sd]').forEach(n => n.addEventListener('click', () => {
      if (busy) return;
      const action = n.dataset.sd;
      const message = $('#sd-message')?.value?.trim();
      const answer = $('#sd-answer')?.value ?? root().querySelector('input[name="sd-answer"]:checked')?.value;
      selectedMode = root().querySelector('input[name="sd-mode"]:checked')?.value || selectedMode;
      const minutes = Number($('#sd-minutes')?.value || catalog.profile.minutes);
      const level = $('#sd-level')?.value || catalog.profile.level;
      act(async () => {
        if (action==='profile') { await call('/profile','PUT',{revision:catalog.profile.revision,minutes,level}); catalog=await call(); }
        if (action==='view') { await openView(n.dataset.view,false,true); return; }
        if (action==='case') { selectedCase=n.dataset.case; selectedMode='learn';screen='setup';return; }
        if (action==='stage') { await saveDraft();stage=Number(n.dataset.stage);return; }
        if (action==='side') { side=n.dataset.side;return; }
        if (action==='toggle-brief') {mobileBriefOpen=!mobileBriefOpen;return;}
        if (action==='recommended') {
          const rec=catalog.recommendation;
          if(rec.kind==='practice')return practice(rec.id);
          selectedCase=rec.id;selectedMode='learn';screen='setup';return;
        }
        if (action==='start') {
          const rec = catalog.recommendation;
          if (minutes!==catalog.profile.minutes || level!==catalog.profile.level) { await call('/profile','PUT',{revision:catalog.profile.revision,minutes,level});catalog=await call(); }
          const created = await call('/sessions','POST',{request_id:id(),case_id:n.dataset.case || rec.id, mode:selectedMode,minutes});
          stage=0;side='brief';mobileBriefOpen=false;session=created; assessments=[]; dirty=false; screen='workspace'; lesson=null; paused=false; conflictDraft=null;chatDraft=''; epoch++; stash();
        }
        if (action==='resume') await openSession(n.dataset.id);
        if (action==='home') { if (session) await saveDraft(); stopTimers();try{sessionStorage.removeItem(activeKey());}catch(_){} session=null; screen='cases'; lesson=null; epoch++; catalog=await call(); }
        if (action==='save') await saveDraft();
        if (action==='pause') { tick(); paused=!paused; stash(); }
        if (action==='assess') {
          await saveDraft();
          const result=await call(`/sessions/${session.id}/assess`,'POST',{revision:session.revision,request_id:id()});
          session={...result.session,elapsed_sec:Math.max(session.elapsed_sec,result.session.elapsed_sec)}; assessments.unshift(result.assessment); side='feedback';stash();
        }
        if (action==='retry') {
          const result=await call(`/assessments/${n.dataset.id}/retry`,'POST',{});
          assessments=assessments.map(a=>a.id===result.id?result:a);
        }
        if (action==='chat') {
          if (!message) throw new Error('Write a question or explanation first.');
          chatDraft=message;stash();
          await saveDraft();
          const result=await call(`/sessions/${session.id}/chat`,'POST',{revision:session.revision,request_id:id(),message});
          session={...result,elapsed_sec:Math.max(session.elapsed_sec,result.elapsed_sec)};chatDraft='';stash();
        }
        if (action==='lesson') {
          if (session) await saveDraft();
          const result=await call('/lessons/'+n.dataset.skill,'POST',{session_id:session?.id});
          lesson={...result.lesson,skill:n.dataset.skill}; if(result.session)session=result.session; stash();
        }
        if (action==='close-lesson') lesson=null;
        if (action==='practice') await practice(n.dataset.id);
        if (action==='focus') await practice(catalog.exercises.find(q=>q.skill===n.dataset.skill).id);
        if (action==='back') { screen='workspace'; exercise=null; lesson=null; epoch++; }
        if (action==='answer' || action==='reveal') {
          exercise.answer=answer;
          if(action==='answer' && (answer==null || !String(answer).trim()))throw new Error('Enter an answer first.');
          exercise.result=await call(`/practice/${exercise.record.id}/answer`,'POST',{answer:String(answer??''),reveal:action==='reveal',elapsed_sec:Math.floor((performance.now()-exercise.startedAt)/1000)});
        }
        if (action==='download') {
          let local; try { local=JSON.parse(sessionStorage.getItem(keyOf())); } catch(_){}
          const blob=new Blob([JSON.stringify(local?.dirty?local:session,null,2)],{type:'application/json'});
          const url=URL.createObjectURL(blob), link=document.createElement('a');
          link.href=url; link.download='system-design-draft.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
        }
        if(action==='restore-local') {
          if(!conflictDraft || !Object.keys(catalog.fields).every(k=>typeof conflictDraft.fields?.[k]==='string'))throw new Error('The local draft cannot be restored. Download it to recover its text.');
          session.fields={...conflictDraft.fields};conflictDraft=null;dirty=true;edits++;stash();await saveDraft();
        }
        if(action==='use-server') {conflictDraft=null;dirty=false;stash();}
      });
    }));
  }

  const VIEWS = ['home','practise','cases','skills','lessons','progress','curriculum','quickfire','papers','mistakes','drills'];
  let loading = null;
  async function renderDesign() {
    active=true;
    if(catalog) { if(!root().childElementCount)paint(); startTimers(); return; }
    if(loading)return loading;
    root().innerHTML=loader('Opening your design workspace…');
    loading=(async()=>{
      try { catalog=await call();paint(); }
      catch(e) { root().innerHTML=`<div class="sd-error">${esc(e.message)}</div><button id="sd-load-retry" class="button">Try again</button>`; $('#sd-load-retry').onclick=renderDesign; }
      finally {loading=null;}
    })();
    return loading;
  }
  async function openView(view, entering=false, fromAction=false) {
    if(busy && !fromAction)return;
    const navigation=++viewEpoch;
    await renderDesign();
    if(!catalog || navigation!==viewEpoch)return;
    if(session && screen==='workspace') {
      try {await saveDraft();} catch(e){error=e.message;paint();return;}
    }
    if(navigation!==viewEpoch)return;
    stopTimers();
    window.DesignLearning.stop();
    if(view==='workspace') {
      let sid;try{sid=sessionStorage.getItem(activeKey());}catch(_){}
      if(sid){
        try {if(await openSession(sid,navigation))paint();return;}
        catch(e){error=e.message;paint();return;}
      }
      view='cases';
    }
    try {
      const fresh=await call();
      window.DesignLedger.invalidate();
      if(navigation!==viewEpoch)return;
      if(view.startsWith('lesson/')) {
        window.DesignLearning.setCatalog(fresh,'lesson');
        await window.DesignLearning.openLesson(view.slice(7));
        if(navigation!==viewEpoch)return;
        screen='lesson';
      } else if(view.startsWith('redesign/')) {
        await window.DesignRedesign.open(view.slice(9));
        if(navigation!==viewEpoch)return;
        screen='redesign';
      } else {
        screen=VIEWS.includes(view)?view:'home';
        if(screen==='papers')await window.DesignPapers.open();
        if(screen==='drills')await window.DesignDrills.open();
        if(navigation!==viewEpoch)return;
      }
      lesson=null;error='';catalog=fresh;paint();
      root().scrollIntoView({block:'start'});
      $('#sd-heading')?.focus({preventScroll:true});
    } catch(e) {error=e.message;paint();}
  }

  function onTab(tab) {
    const wasActive=active;
    if(tab!=='design') {
      viewEpoch++;stopTimers(); window.DesignLearning.stop(); window.DesignPapers.stop(); window.DesignDrills.stop(); active=false; clearTimeout(debounce);
      if(session && wasActive) { session.timing_uncertain=true; stash(); if(!busy)saveDraft().catch(()=>{}); }
    } else { active=true; startTimers(); window.DesignLearning.startClock(); }
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden') { stopTimers(); if(session){session.timing_uncertain=true;stash();if(!busy)saveDraft().catch(()=>{});} }
    else if(active)startTimers();
  });
  window.addEventListener('beforeunload',event=>{stash();if(dirty){event.preventDefault();event.returnValue='';}});
  function renderModelChip() {
    const node=$('#design-coach-chip');
    if(!node||!catalog)return;
    const reviewing=assessments.some(a=>a.status==='pending' && Date.now()/1000-(a.started_at||a.created_at)<180);
    const current=reviewing?'Review · '+catalog.profiles.assessor.model:'Tutor · '+catalog.profiles.tutor.model;
    node.innerHTML=`<details class="sd-model-chip"><summary><span class="coach-dot ${catalog.coach_enabled?'is-on':''}"></span><span>${catalog.coach_enabled?esc(current):'Coach off'}</span></summary><div><p><b>Tutor:</b> ${esc(catalog.profiles.tutor.model)}</p><p><b>Assessor:</b> ${esc(catalog.profiles.assessor.model)}</p><p>${catalog.coach_enabled?'AI coaching is connected.':'Lessons, checks, and Quickfire work without AI coaching.'}</p></div></details>`;
  }
  window.Views.renderDesign=renderDesign;
  // Ctrl/Cmd+Enter submits the answer box that has focus: its form, or the primary button beside it.
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'||!(event.ctrlKey||event.metaKey)||event.isComposing)return;
    const box=event.target;
    if(!root()?.contains(box)||!/^(TEXTAREA|INPUT)$/.test(box.tagName)||box.dataset.field)return;
    const form=box.closest('form');
    if(form){event.preventDefault();form.requestSubmit();return;}
    const scope=box.closest('.sd-pitch-step,.sd-attempt,.sd-twist,.sd-gap-q,.sd-callback-q,.sd-block,.sd-panel,.sd-warmup,.sd-chat-form,section');
    const target=scope?.querySelector('.button.is-primary:not(:disabled), [data-b="check"]:not(:disabled)');
    if(target){event.preventDefault();target.click();}
  });
  window.SystemDesign={onTab,diagram,openView,isBusy:()=>busy||window.DesignLearning.isBusy()||window.DesignPapers.isBusy()||window.DesignDrills.isBusy(),
    repaint:paint,setCatalog(value){catalog=value;},
    async openCase(key){
      await openView('cases');selectedCase=key;selectedMode='learn';screen='setup';paint();
    }};
})();
