// A complete design loop, with saved revisions and snapshot-based feedback.
(function () {
  'use strict';
  const { $, api, escapeHtml: esc, loader } = window.H;
  let catalog, session = null, assessments = [], exercise = null, lesson = null;
  let busy = false, dirty = false, edits = 0, saving = null, timer = null, poll = null, debounce = null;
  let active = false, paused = false, lastTick = 0, screen = 'home', error = '', epoch = 0;
  let conflictDraft = null, chatDraft = '';
  const root = () => $('#tab-design');
  const id = () => window.crypto.randomUUID().replaceAll('-', '');
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
        assessments = result.assessments;
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
    busy = true; error = ''; showError();
    root().querySelectorAll('button,input,textarea,select').forEach(n => { n.disabled = true; });
    try { await fn(); }
    catch (e) { error = e.message; }
    finally { busy = false; paint(); }
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
      ${button('Close lesson', 'close-lesson')}</article>`;
  }

  function assessmentHtml() {
    if (!assessments.length) return '<p class="sd-muted">Save a complete first pass, then request feedback. Each assessment retains the exact version it reviewed.</p>';
    return assessments.map((a, index) => {
      const header = `Saved version ${a.snapshot.revision} · ${date(a.created_at)}`;
      if (a.status !== 'complete') return `<article class="sd-feedback"><b>${esc(header)}</b><p>${a.status === 'pending' ? (Date.now()/1000-(a.started_at||a.created_at)<180?'Reviewing your saved design… You can keep editing.':'The review is delayed. Retry to resume the saved assessment.') : esc(a.error)}</p>${button('Retry assessment', 'retry', `data-id="${a.id}"`)}</article>`;
      const result = a.assessment.result;
      const body = `<p>${esc(result.summary)}</p>${result.findings.map(f => `<div class="sd-feedback"><b>${esc(catalog.skills[f.skill])} · ${esc(f.status.replaceAll('_',' '))}</b>
        ${f.evidence ? `<blockquote>${esc(f.evidence)}</blockquote>` : ''}<p>${esc(f.observation)}</p><p>${esc(f.consequence)}</p><p>${esc(f.repair)}</p></div>`).join('')}
        <p class="sd-muted">AI-reviewed observation · ${a.snapshot.assisted || result.assisted ? 'Supported attempt' : 'No recorded help'} · ${esc(a.assessment.model)}</p>
        <div class="sd-actions">${button('Learn: ' + catalog.skills[result.next_skill], 'lesson', `data-skill="${result.next_skill}"`)}
        ${button('Practise this skill', 'focus', `data-skill="${result.next_skill}"`)}</div>`;
      return index === 0 ? `<article><div class="sd-eyebrow">${esc(header)}</div>${body}</article>` : `<details class="sd-panel"><summary>${esc(header)}</summary>${body}</details>`;
    }).join('');
  }

  function homeHtml() {
    const r = catalog.recommendation;
    const title = r.kind === 'case' ? caseOf(r.id).title : 'A focused design decision';
    return `<div class="sd-hero"><div class="sd-eyebrow">Your next useful session</div><h2>${esc(title)}</h2><p>${esc(r.reason)}</p>
      <div class="sd-controls"><label>Available time<select class="select" id="sd-minutes">${[5,15,45].map(n => `<option value="${n}" ${catalog.profile.minutes===n?'selected':''}>${n} minutes</option>`).join('')}</select></label>
      <label>Target depth<select class="select" id="sd-level">${['foundation','mid','senior'].map(n => `<option value="${n}" ${catalog.profile.level===n?'selected':''}>${n==='mid'?'Mid-level':n[0].toUpperCase()+n.slice(1)}</option>`).join('')}</select></label>
      ${button('Update preferences', 'profile')}${button('Start recommended session', 'recommended', '', true)}</div>
      <p class="sd-muted">${catalog.coach_enabled ? 'Live tutoring and design reviews are available.' : 'Coaching is unavailable. Save designs and use authored lessons and exercises now; request a review when coaching is configured.'}</p></div>
      <h3>Build a complete design</h3><div class="sd-grid">${catalog.cases.map(c => `<article class="sd-card"><div class="sd-eyebrow">${esc(c.family)}</div><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p>
        <div class="sd-actions">${button('Learn & design', 'start', `data-case="${c.id}" data-mode="learn"`, true)}${button('Interview practice', 'start', `data-case="${c.id}" data-mode="interview"`)}</div></article>`).join('')}</div>
      ${catalog.sessions.length ? `<div class="sd-panel"><h3>Continue a saved design</h3><div class="sd-history">${catalog.sessions.map(s => button(`${caseOf(s.case_id)?.title || s.case_id} · ${date(s.updated_at)}`, 'resume', `data-id="${s.id}"`)).join('')}</div></div>` : ''}
      <div class="sd-panel"><h3>Focused practice</h3><p class="sd-muted">Short exercises build individual skills. They do not count as complete design evidence.</p><div class="sd-history">${catalog.exercises.map(q => button(q.title, 'practice', `data-id="${q.id}"`)).join('')}</div></div>
      <div class="sd-panel"><h3>Lessons</h3><div class="sd-history">${Object.entries(catalog.skills).map(([k,v]) => button(v,'lesson',`data-skill="${k}"`)).join('')}</div></div>${lessonHtml()}
      <div class="sd-panel"><h3>Evidence from your designs</h3><p class="sd-muted">These are model observations, not a hiring prediction. A later check requires an independent session at least a day later. Repeated grades of the same answer add no evidence.</p>
      <div class="sd-scroll"><table class="sd-evidence"><thead><tr><th>Skill</th><th>Demonstrations</th><th>Independent cases</th><th>Later checks</th><th>Needs work</th></tr></thead><tbody>${Object.entries(catalog.evidence).map(([k,v]) => `<tr><td>${esc(catalog.skills[k])}</td><td>${v.designs}</td><td>${v.independent_cases}</td><td>${v.later_checks}</td><td>${v.needs_work}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function workspaceHtml() {
    const c = caseOf(session.case_id);
    const hints = { requirements:'What must this system do? What does success guarantee?', interfaces:'Endpoints, identifiers, ownership, keys, and state transitions…',
      flow:'Trace one successful write and one successful read end to end…', diagram:'Client -> API\nAPI -> Database\nAPI -> Queue\nQueue -> Worker',
      tradeoffs:'I chose… because… I would reconsider if…', failures:'What fails? What remains durable? How is work recovered and the problem detected?' };
    return `<div class="sd-toolbar"><div>${button('All system design', 'home')} ${button('Download local draft', 'download')}${conflictDraft?button('Restore local draft', 'restore-local')+button('Use server version','use-server'):''}</div>
      <div><b id="sd-clock">${clock(session.elapsed_sec)}</b> <span class="sd-muted">active time · ${session.minutes} min target</span> ${button(paused?'Resume timer':'Pause timer','pause')} <span id="sd-save-status" class="sd-status">${dirty?'Unsaved edits':'Saved'}</span></div></div>
      <div class="sd-eyebrow">${session.mode==='interview'?'Interview practice · clarification and probing':'Learning mode · hints recorded'} · ${esc(session.level)} depth</div>
      <h2>${esc(c.title)}</h2><div class="sd-workspace"><div><div class="sd-panel"><p>${esc(c.prompt)}</p><details open><summary>Case requirements</summary><ul>${c.requirements.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details></div>
      <div class="sd-panel">${Object.entries(catalog.fields).map(([k,v]) => `<div class="sd-field"><label for="sd-field-${k}">${esc(v)}</label><textarea id="sd-field-${k}" class="textarea" data-field="${k}" rows="${k==='diagram'?4:3}" maxlength="${k==='diagram'?4000:8000}" placeholder="${esc(hints[k])}">${esc(session.fields[k])}</textarea></div>${k==='diagram'?`<div id="sd-diagram">${diagram(session.fields.diagram)}</div>`:''}`).join('')}
      <div class="sd-actions">${button('Save design','save')}${button('Assess saved design','assess',catalog.coach_enabled?'':'disabled',true)}</div>
      <p class="sd-muted">Autosaves while you write. Reviews preserve the submitted version. Hidden-tab and resumed timing is marked uncertain.</p></div></div>
      <aside><div class="sd-panel"><h3>${session.mode==='interview'?'Interviewer':'Tutor'}</h3><div class="sd-chat" id="sd-chat">${session.chat.map(m=>`<div class="sd-message ${m.role==='coach'?'is-coach':''}"><b>${m.role==='coach'?'Coach':'You'}${m.error?' · unavailable':''}</b>${esc(m.text)}</div>`).join('')}</div>
      <label for="sd-message" class="label-sm">Ask a question or explain a decision</label><textarea id="sd-message" class="textarea" rows="3" maxlength="2000" ${catalog.coach_enabled?'':'disabled'}>${esc(chatDraft)}</textarea>
      <div class="sd-actions">${button('Send','chat',catalog.coach_enabled?'':'disabled')}</div><p class="sd-muted">${catalog.coach_enabled?'The coach uses this case and your saved design.':'Configure an OpenRouter key to enable conversation and assessment.'}</p></div>
      ${lessonHtml()}<div class="sd-panel"><h3>Focused lessons</h3><div class="sd-history">${c.skills.map(k=>button(catalog.skills[k],'lesson',`data-skill="${k}"`)).join('')}</div></div>
      <div class="sd-panel"><h3>Feedback and next step</h3><div id="sd-assessments">${assessmentHtml()}</div></div></aside></div>`;
  }

  function exerciseHtml() {
    const q = exercise.question, result = exercise.result;
    return `<div class="sd-toolbar">${button(session?'Back to your design':'All system design',session?'back':'home')}</div>
      <div class="sd-panel"><div class="sd-eyebrow">${esc(catalog.skills[q.skill])} · ${q.choices.length?'Recognition':'Recall'}</div><h2>${esc(q.title)}</h2><p>${esc(q.prompt)}</p>
      ${q.choices.length ? q.choices.map((c,i)=>`<label class="sd-choice"><input type="radio" name="sd-answer" value="${i}" ${String(exercise.answer)===String(i)?'checked':''} ${result?'disabled':''}>${esc(c)}</label>`).join('') : `<label for="sd-answer" class="label-sm">Your answer (number only)</label><input id="sd-answer" class="input" inputmode="decimal" autocomplete="off" value="${esc(exercise.answer||'')}" ${result?'disabled':''}>`}
      ${result ? `<div class="sd-feedback"><b>${result.record.revealed?'Answer revealed':result.record.correct?'Correct':'Try the reasoning again'}</b><p>${esc(result.explanation)}</p><p>Answer: ${esc(result.answer)}</p><p class="sd-muted">${result.record.assisted || result.record.revealed?'Supported practice':'Independent exercise'} · Reviews return on a later day.</p></div>` : `<div class="sd-actions">${button('Check answer','answer','',true)}${button('Reveal answer','reveal')}</div>`}
      <div class="sd-actions">${button('Read the focused lesson','lesson',`data-skill="${q.skill}"`)}${result?button('Return and apply it',session?'back':'home','',true):''}</div></div>${lessonHtml()}`;
  }

  function paint() {
    if (!catalog || !root()) return;
    root().innerHTML = `<div id="sd-error" class="sd-error" role="alert" ${error?'':'hidden'}>${esc(error)}</div>` +
      (screen==='workspace'?workspaceHtml():screen==='exercise'?exerciseHtml():homeHtml());
    wire(root());
    if (screen==='workspace') {
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

  async function openSession(sid) {
    const result = await call('/sessions/' + sid);
    session = result.session; assessments = result.assessments; exercise = null; lesson = null;
    screen = 'workspace'; dirty = false; paused = false; conflictDraft=null; chatDraft=''; epoch++;
    session.timing_uncertain = true;
    restore(); stash();
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
      const minutes = Number($('#sd-minutes')?.value || catalog.profile.minutes);
      const level = $('#sd-level')?.value || catalog.profile.level;
      act(async () => {
        if (action==='profile') { await call('/profile','PUT',{revision:catalog.profile.revision,minutes,level}); catalog=await call(); }
        if (action==='recommended' || action==='start') {
          const rec = catalog.recommendation;
          if (action==='recommended' && rec.kind==='practice') return practice(rec.id);
          const created = await call('/sessions','POST',{request_id:id(),case_id:n.dataset.case || rec.id, mode:n.dataset.mode || 'learn',minutes});
          session=created; assessments=[]; dirty=false; screen='workspace'; lesson=null; paused=false; conflictDraft=null;chatDraft=''; epoch++; stash();
        }
        if (action==='resume') await openSession(n.dataset.id);
        if (action==='home') { if (session) await saveDraft(); stopTimers();try{sessionStorage.removeItem(activeKey());}catch(_){} session=null; screen='home'; lesson=null; epoch++; catalog=await call(); }
        if (action==='save') await saveDraft();
        if (action==='pause') { tick(); paused=!paused; stash(); }
        if (action==='assess') {
          await saveDraft();
          const result=await call(`/sessions/${session.id}/assess`,'POST',{revision:session.revision,request_id:id()});
          session={...result.session,elapsed_sec:Math.max(session.elapsed_sec,result.session.elapsed_sec)}; assessments.unshift(result.assessment); stash();
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
          lesson=result.lesson; if(result.session)session=result.session; stash();
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

  async function renderDesign() {
    active=true;
    if(catalog) { if(!root().childElementCount)paint(); startTimers(); return; }
    root().innerHTML=loader('Loading system design…');
    try { catalog=await call();let sid;try{sid=sessionStorage.getItem(activeKey());}catch(_){}if(sid)await openSession(sid);paint(); }
    catch(e) { root().innerHTML=`<div class="sd-error">${esc(e.message)}</div><button id="sd-load-retry" class="button">Try again</button>`; $('#sd-load-retry').onclick=renderDesign; }
  }

  function onTab(tab) {
    const wasActive=active;
    if(tab!=='design') {
      stopTimers(); active=false; clearTimeout(debounce);
      if(session && wasActive) { session.timing_uncertain=true; stash(); if(!busy)saveDraft().catch(()=>{}); }
    } else { active=true; startTimers(); }
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden') { stopTimers(); if(session){session.timing_uncertain=true;stash();if(!busy)saveDraft().catch(()=>{});} }
    else if(active)startTimers();
  });
  window.addEventListener('beforeunload',event=>{stash();if(dirty){event.preventDefault();event.returnValue='';}});
  window.Views.renderDesign=renderDesign;
  window.SystemDesign={onTab,diagram};
})();
