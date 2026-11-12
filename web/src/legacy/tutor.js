// The tutor: a conversation that leads you through a lesson. With the model on, a lesson opens as
// a choice: learn it with the tutor, or read the notes (the choice of notes is remembered). A
// session replaces the lesson body with a chat, the lesson's objectives as a checklist and, in
// "Teach me", the lesson's own activities brought in by the tutor. Activity answers are recorded
// exactly as in the lesson. In teach, critique and the war room the tutor can also draw on a
// whiteboard (diagrams under its message, server/tutor/board.py) and hand over a design to run in
// the design simulator, whose result goes back to it (server/tutor/rig.py). Ending a session brings a
// debrief from the tutor: the only teaching in the role-play modes. Home can queue a session,
// which starts as soon as the lesson opens. Without the model there is no card and the lesson
// works as usual. A "Teach me" session on a design lesson starts with the lesson's warm-up check
// (DesignLesson.warmup) unless skipped; full marks there marks the lesson done instead.
// The session panel is side by side: the chat on the left, and on the right a stage holding what the
// tutor brought in (whiteboards, activities, designs), one at a time with tabs, so the text and the
// board are both in view. The objectives are a side panel, folded by default. On narrow screens the
// stage sits above the chat.
(function () {
  'use strict';
  const {api, escapeHtml: esc} = window.H;
  const B = () => window.SDBlocks;
  const rid = () => 'k' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
  const md = t => (B() ? B().md(String(t || '')) : esc(t || ''));
  const inline = t => (B() ? B().inline(String(t || '')) : esc(t || ''));
  const btn = (text, act, attrs = '', primary = false) =>
    `<button type="button" class="button ${primary ? 'is-primary' : ''}" data-tu="${act}" ${attrs}>${esc(text)}</button>`;
  const MARK = {open: ['○', 'Not yet'], working: ['◐', 'In progress'], demonstrated: ['●', 'Shown']};
  const PREFER_NOTES = 'tutor:prefer-notes';
  const GOALS_OPEN = 'tutor:goals-open';
  const STAGE_OFF = 'tutor:stage-off';
  const stageOff = () => { try { return localStorage.getItem(STAGE_OFF) === '1'; } catch (_) { return false; } };
  const setStageOff = off => { try { if (off) localStorage.setItem(STAGE_OFF, '1'); else localStorage.removeItem(STAGE_OFF); } catch (_) {} };
  const goalsOpen = () => { try { return localStorage.getItem(GOALS_OPEN) === '1'; } catch (_) { return false; } };
  const setGoalsOpen = on => { try { if (on) localStorage.setItem(GOALS_OPEN, '1'); else localStorage.removeItem(GOALS_OPEN); } catch (_) {} };
  const preferNotes = () => { try { return localStorage.getItem(PREFER_NOTES) === '1'; } catch (_) { return false; } };
  const setPreferNotes = on => { try { if (on) localStorage.setItem(PREFER_NOTES, '1'); else localStorage.removeItem(PREFER_NOTES); } catch (_) {} };
  let T = null, queued = null;
  // Where a lesson id lives: an area map has its own page.
  const route = id => (String(id).startsWith('map-') ? 'map/' + String(id).slice(4) : 'lesson/' + id);

  // ctx: {section, lesson: {id, title, objectives, blocks, map?}, layout: node hidden during a session,
  //       done(key, correct), recall(block, text), pitch(block, text, followup)}. An area map's page
  //       (lesson.map) keeps its layout in view until a session opens: it is the page, not notes.
  function mount(slot, ctx) {
    if (!slot) return;
    if (T?.id !== ctx.section + ':' + ctx.lesson.id) {
      T = {id: ctx.section + ':' + ctx.lesson.id, ctx, host: document.createElement('div'), info: null, overview: null,
           session: null, open: false, busy: false, pending: null, rendered: 0, mode: 'teach', error: '', notes: preferNotes()};
      T.host.className = 'tu-host';
      load();
    }
    T.ctx = ctx;
    slot.replaceWith(T.host);
    placeHost(T.host.classList.contains('is-tools'));
    hideLesson();
    if (T.info) takeQueued();
  }

  // Home asks for a session on a lesson before opening it: {section, lesson, resume}.
  function queue(q) { queued = q; }
  function takeQueued() {
    const q = queued;
    if (!q || q.section !== T.ctx.section || q.lesson !== T.ctx.lesson.id) return;
    queued = null;
    if (!T.info.enabled) return;
    if (q.mode && T.info.modes?.some(m => m.id === q.mode)) T.mode = q.mode;
    T.focus = q.focus || '';
    T.carry = q.carry || null;
    T.layer = q.layer || 0;
    act(T.session?.status === 'active' && !q.mode && !q.focus && !q.carry ? 'resume' : 'start');
  }

  // Notes stay hidden until chosen when the tutor is on. The lesson body's own display rule beats
  // [hidden], so hide it inline.
  function hideLesson() {
    const page = !!T.ctx.lesson.map;
    if (T.ctx.layout) T.ctx.layout.style.display = !T.warming && (T.open || (!page && T.info?.enabled && !T.notes)) ? 'none' : '';
  }

  // The warm-up before a session: shown in the lesson body, then the tutor (or full marks) follows.
  const warming = id => !!T?.warming && T.ctx.lesson.id === id;
  function warmed(id, session) {
    if (!warming(id)) return false;
    T.warming = false;
    if (session?.tested_out) { T.passed = true; paint(); T.host.scrollIntoView?.({block: 'start', behavior: 'smooth'}); }
    else act('start-now');
    return true;
  }

  async function load() {
    const t = T;
    t.host.innerHTML = '';
    try {
      const [info, overview] = await Promise.all([api(`/tutor/lessons/${t.ctx.section}/${t.ctx.lesson.id}`), api('/tutor')]);
      if (T !== t) return;
      t.info = info; t.overview = overview;
      if (info.active) t.session = info.active;
      // A conversation waiting on this lesson opens by itself: the tutor is the default way in.
      if (info.active && info.enabled && !t.notes && !queued && !t.ctx.lesson.overview) t.open = true;   // an overview page shows itself first
    } catch (e) { if (T === t) t.host.innerHTML = ''; return; }
    paint();
    takeQueued();
  }

  const cast = id => (T.overview?.story?.cast || []).find(c => c.id === id);


  // Reading the notes, the tutor is a way in, not the page's next step: two icon buttons by the lesson title
  // (start the tutor; what the outside tutor reported, opened as a popover), not banners above the lesson.
  const ICON = {
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>',
    report: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  };
  const toolsMode = () => !!T.info && !T.warming && !T.passed && (!T.info.enabled || T.notes || !!T.ctx.lesson.overview) && !(T.open && T.session);
  function toolsHtml() {
    const i = T.info, active = T.session && T.session.status === 'active';
    const x = i.outside, has = x || (i.outside_elsewhere || []).length;
    const when = x ? ' · ' + new Date(x.at * 1000).toLocaleDateString(undefined, {day: 'numeric', month: 'short'}) : '';
    const tutor = i.enabled ? `<button type="button" class="tu-icon" data-tu="${active ? 'resume' : 'start'}" aria-label="${active ? 'Continue your tutor session' : 'Learn this with the tutor'}" title="${active ? 'Continue your tutor session' : T.ctx.lesson.overview ? 'Go through the overview with the tutor' : 'Learn this with the tutor: it asks the questions and brings in the activities'}">${ICON.chat}${active ? '<i class="tu-dot"></i>' : ''}</button>` : '';
    const report = has ? `<button type="button" class="tu-icon ${T.outOpen ? 'is-on' : ''}" data-tu="outside" aria-expanded="${!!T.outOpen}" aria-label="What your outside tutor reported${esc(when)}" title="From your outside tutor${esc(when)}">${ICON.report}</button>` : '';
    if (!tutor && !report) return '';
    return `<div class="tu-tools">${report}${tutor}</div>${T.outOpen && has ? `<div class="tu-pop" role="dialog" aria-label="From your outside tutor">${outsideHtml()}</div>` : ''}${T.error ? `<p class="tu-error">${esc(T.error)}</p>` : ''}`;
  }
  function entryHtml() {
    const i = T.info, o = T.overview, out = outsideHtml();
    if (toolsMode()) return toolsHtml();
    const active = T.session && T.session.status === 'active';
    if (T.warming) return out + `<section class="tu-entry tu-compact"><span><b>Quick check first.</b> Answer what you can below; the tutor starts from what you miss.</span>${btn('Skip it: start the tutor', 'start-now')}</section>`;
    if (T.passed) return out + `<section class="tu-entry"><span class="sd-eyebrow">FULL MARKS</span><p>You got every warm-up question right, so this lesson counts as done and Home moves you on.</p>
      <div class="sd-actions">${btn('Next lesson →', 'home', '', true)}${btn('Talk it through anyway', 'start-now')}${btn('Read the notes', 'notes')}</div></section>`;
    const go = active ? btn('Continue your session', 'resume', '', true) : btn('Start', 'start', '', true);
    const mode = o.modes.find(m => m.id === T.mode);
    const style = active ? '' : `<label class="tu-style">Style <select data-tu-mode aria-label="Session style">${o.modes.map(m => `<option value="${m.id}" ${T.mode === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>`;
    const fresh = i.outside?.picks_up && !active;
    const nx = !active && i.next ? `<p class="tu-previously"><b>Your tutor suggested next:</b> ${esc(i.next.title)}${i.next.why ? `, to ${esc(i.next.why)}` : ''}. ${btn('Go there →', 'go-next')}</p>` : '';
    return out + `<section class="tu-entry"><span class="sd-eyebrow">LEARN THIS WITH THE TUTOR</span>
      <p class="tu-scene">${esc(i.scene)}</p>${fresh ? `<p class="tu-previously">Your next session picks up where you got to with the outside tutor.</p>` : i.previously && i.previously !== i.outside?.summary ? `<p class="tu-previously"><b>Last time:</b> ${inline(i.previously)}</p>` : ''}
      ${nx}<p class="sd-muted tu-hint">${active ? 'Your session is waiting where you left it.' : esc(mode?.blurb || '')} Talk or type.</p>
      <div class="sd-actions">${go}${active ? btn('End it and get the debrief', 'fresh') : ''}${T.ctx.lesson.map ? '' : btn('Read the notes instead', 'notes')}${T.ctx.lesson.map ? '' : style}</div>
      ${T.error ? `<p class="tu-error">${esc(T.error)}</p>` : ''}</section>`;
  }

  // What an outside tutor (ChatGPT over the handover) reported for this lesson, and ideas here it
  // filed from sessions on other lessons. Shown with or without the model.
  function outsideHtml() {
    const x = T.info.outside, away = T.info.outside_elsewhere || [];
    const link = e => `<a href="#/${e.section}/lesson/${encodeURIComponent(e.lesson)}">${esc(e.lesson_title)}</a> (${e.ideas})`;
    const also = away.length ? `<p class="sd-muted tu-out-away">Ideas here were also covered in outside sessions on ${away.slice(0, 3).map(link).join(', ')}.</p>` : '';
    if (!x) return also ? `<section class="tu-outside">${also}</section>` : '';
    const c = x.counts || {}, f = x.filing || {};
    const tally = [['right', c.right], ['partial', c.partial], ['wrong', c.wrong], ['explained', x.explained]].filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(' · ') || 'nothing graded';
    const filing = f.status === 'done' ? (f.elsewhere.length ? `<p class="tu-out-filed">Also filed ${f.elsewhere.reduce((n, e) => n + e.ideas, 0)} ideas in other lessons: ${f.elsewhere.slice(0, 5).map(link).join(', ')}.</p>`
        : x.topics ? `<p class="sd-muted">Its ${x.topics} other topics added ${f.here} ideas here and none elsewhere.</p>` : '')
      : f.status === 'pending' ? `<p class="sd-muted">Filing ${x.topics} other topics onto the course…</p>`
      : f.status ? `<p class="tu-error">${esc(f.retry?.error || 'Filing did not finish.')} ${btn('File them again', 'refile')}</p>` : '';
    return `<section class="tu-outside"><span class="sd-eyebrow">FROM YOUR OUTSIDE TUTOR · ${esc(new Date(x.at * 1000).toLocaleDateString(undefined, {day: 'numeric', month: 'short'}))}</span>
      <p><b>${esc(tally)}</b>${x.topics ? ` · ${x.topics} other topic${x.topics === 1 ? '' : 's'}` : ''}</p>${filing}
      ${x.summary ? `<details><summary>What you covered</summary><div class="tu-out-summary">${md(x.summary)}</div>${x.next_steps ? `<p><b>Next:</b> ${inline(x.next_steps)}</p>` : ''}</details>` : ''}
      ${x.suggestions.length ? `<details><summary>Its suggestions for this lesson (${x.suggestions.length})</summary><ul>${x.suggestions.map(t => `<li>${inline(t)}</li>`).join('')}</ul></details>` : ''}${also}</section>`;
  }

  function panelHtml() {
    const s = T.session, mode = T.overview.modes.find(m => m.id === s.mode), open = goalsOpen();
    const back = T.ctx.lesson.overview ? 'Back to the overview' : T.ctx.lesson.map ? 'Back to the page' : 'Show the notes';
    return `<section class="tu-panel"><header class="tu-head"><div><span class="sd-eyebrow">TUTOR · ${esc(mode?.label || s.mode)}</span><h3>${esc(T.ctx.lesson.title)}</h3></div>
        <div class="tu-head-actions"><button type="button" class="button tu-goals-btn" data-tu="goals" aria-expanded="${open}" aria-controls="tu-goals">Objectives <span class="tu-progress"></span></button>${btn(back, 'close')}${s.status === 'active' ? btn('End session', 'end') : ''}</div>
        <button type="button" class="tu-stage-btn" data-tu="stage" aria-expanded="${!stageOff()}" aria-controls="tu-stage" aria-label="Activities panel" title="${stageOff() ? 'Show' : 'Hide'} the activities panel" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path class="tu-stage-btn-fill" d="M14 4h4.5A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14z" /><path d="M14 4v16" /></svg></button></header>
      <div class="tu-body${open ? ' goals-open' : ''}${stageOff() ? ' stage-off' : ''}">
        <aside class="tu-goals" id="tu-goals" aria-label="Objectives"${open ? '' : ' hidden'}><span class="sd-eyebrow">OBJECTIVES</span><ol class="tu-objectives"></ol></aside>
        <div class="tu-convo"></div>
        <aside class="tu-stage" id="tu-stage" aria-label="Whiteboard and activities" hidden><div class="tu-stage-tabs" role="tablist" aria-label="What the tutor brought in"></div><div class="tu-stage-items"></div></aside>
      </div></section>`;
  }

  // The stage: whiteboards, activities and designs, one shown at a time. Each keeps its node (and its live
  // state) when another is shown; the message it came with keeps a chip that brings it back.
  function stageAdd(node, label, id) {
    const stage = T.host.querySelector('.tu-stage');
    if (!stage) return;
    node.dataset.stage = id;
    node.classList.add('tu-stage-item');
    stage.querySelector('.tu-stage-items').appendChild(node);
    const tab = document.createElement('button');
    tab.type = 'button'; tab.className = 'tu-stage-tab'; tab.dataset.stageTab = id; tab.setAttribute('role', 'tab');
    tab.textContent = label;
    tab.addEventListener('click', () => stageShow(id));
    stage.querySelector('.tu-stage-tabs').appendChild(tab);
    stage.hidden = false;
    T.host.querySelector('.tu-body')?.classList.add('has-stage');
    const toggle = T.host.querySelector('.tu-stage-btn'); if (toggle) toggle.hidden = false;
  }
  // The stage folds away (the Activities button) so the chat can have the width; a chip, or something new brought in,
  // opens it again.
  function stageOpen(on) {
    setStageOff(!on);
    T.host.querySelector('.tu-body')?.classList.toggle('stage-off', !on);
    const toggle = T.host.querySelector('.tu-stage-btn');
    toggle?.setAttribute('aria-expanded', String(on));
    toggle?.setAttribute('title', `${on ? 'Hide' : 'Show'} the activities panel`);
  }
  function stageShow(id, open = true) {
    const stage = T.host.querySelector('.tu-stage');
    if (!stage) return;
    if (open) stageOpen(true);
    stage.querySelectorAll('.tu-stage-item').forEach(n => { n.hidden = n.dataset.stage !== id; });
    stage.querySelectorAll('.tu-stage-tab').forEach(n => { const on = n.dataset.stageTab === id; n.classList.toggle('is-on', on); n.setAttribute('aria-selected', String(on)); });
    T.host.querySelectorAll('.tu-chip').forEach(n => n.classList.toggle('is-on', n.dataset.stageChip === id));
  }
  function paint() {
    if (!T.info) return;
    T.chat?.unmount(); T.chat = null;
    hideLesson();
    const tools = !T.open || !T.session ? toolsMode() : false;
    placeHost(tools);
    if (!T.open || !T.session) { window.SenpaiChat?.leaveScreen(T.host); T.host.innerHTML = entryHtml(); wireEntry(); return; }
    T.host.innerHTML = panelHtml();
    // The session is the page: it fills the screen under the header, which names the lesson and the style.
    const mode = T.overview.modes.find(m => m.id === T.session.mode);
    window.SenpaiChat?.screen(T.host, T.ctx.lesson.title, `Tutor · ${mode?.label || T.session.mode}`);
    T.rendered = 0;
    wirePanel();
    sync();
  }

  // Icon buttons sit in the corner of the lesson's title block; the full entry card sits below it.
  function placeHost(tools) {
    T.host.classList.toggle('is-tools', tools);
    const intro = T.host.closest('.sd-rich-intro') || (T.host.previousElementSibling?.matches?.('.sd-rich-intro') ? T.host.previousElementSibling : null);
    if (!intro) return;
    if (tools && T.host.parentElement !== intro) intro.appendChild(T.host);
    else if (!tools && T.host.parentElement === intro) intro.after(T.host);
  }
  function wireEntry() {
    T.host.querySelector('[data-tu-mode]')?.addEventListener('change', e => { T.mode = e.target.value; paint(); });
    T.host.querySelectorAll('[data-tu]').forEach(n => n.addEventListener('click', () => act(n.dataset.tu)));
  }
  // The conversation itself is the shared chat (src/features/tutor/TutorChat.tsx): it draws the turns, streams replies
  // and hands each stored session back here, where the stage and objectives follow it.
  function chatProps() {
    const t = T;
    return {session: t.session, cast, blocks: t.ctx.lesson.blocks || [], next: t.info?.next || null,
      onSession(s) { if (T !== t) return; t.session = s; sync(); },
      showStage: id => stageShow(id),
      onMove(m) { queue({section: m.section, lesson: m.lesson, carry: t.session?.id}); window.AppSections?.select(m.section, route(m.lesson)); },
      onAct: a => act(a)};
  }
  function wirePanel() {
    T.host.querySelectorAll('.tu-head [data-tu]').forEach(n => n.addEventListener('click', () => act(n.dataset.tu)));
    T.chat = window.SenpaiChat.tutor(T.host.querySelector('.tu-convo'), chatProps());
    setTimeout(() => T?.host.querySelector('.tu-convo .ch-input')?.focus({preventScroll: true}), 0);
  }

  async function act(action) {
    const t = T;
    try {
      if (action === 'outside') { t.outOpen = !t.outOpen; paint(); return; }
      if (action === 'goals') {
        const on = !goalsOpen(); setGoalsOpen(on);
        t.host.querySelector('.tu-body')?.classList.toggle('goals-open', on);
        const g = t.host.querySelector('.tu-goals'); if (g) g.hidden = !on;
        t.host.querySelector('.tu-goals-btn')?.setAttribute('aria-expanded', String(on));
        return;
      }
      if (action === 'stage') { stageOpen(stageOff()); return; }
      if (action === 'refile') {
        await api(`/knowledge/handback/${t.info.outside.filing.retry.session}/file`, 'POST');
        if (T === t) load();
      } else if (action === 'notes') {
        t.notes = true; t.passed = false; setPreferNotes(true); paint(); t.ctx.layout?.scrollIntoView?.({block: 'start'});
      } else if (action === 'home') {
        window.AppSections?.select(t.ctx.section, 'home');
      } else if (action === 'start' && t.mode === 'teach' && !t.focus && !t.carry && t.ctx.section === 'system-design'
                 && await window.DesignLesson?.warmup?.(t.ctx.lesson.id)) {
        if (T !== t) return;
        t.warming = true; t.passed = false; t.notes = false; t.error = '';
        paint(); window.DesignLesson?.refresh?.();
        t.ctx.layout?.scrollIntoView?.({block: 'start', behavior: 'smooth'});
      } else if (action === 'start' || action === 'start-now') {
        if (t.warming) { t.warming = false; window.DesignLesson?.refresh?.(); }
        t.passed = false;
        setPreferNotes(false);
        t.busy = true; t.error = ''; t.open = true;
        t.session = {id: null, mode: t.mode, status: 'active', turns: [], objectives: t.info.objectives.map(() => ({status: 'open'})), progress: {demonstrated: 0, total: t.info.objectives.length}};
        paint(); t.host.scrollIntoView?.({block: 'start', behavior: 'smooth'});
        const body = {section: t.ctx.section, lesson: t.ctx.lesson.id, mode: t.mode, key: rid(), focus: t.focus || '', carry: t.carry || null, layer: t.layer || 0};
        t.focus = ''; t.carry = null; t.layer = 0;
        const s = await t.chat.start(body);
        if (T !== t) return;
        t.session = s; t.busy = false; paint();
      } else if (action === 'resume') {
        t.open = true; paint(); t.host.scrollIntoView?.({block: 'start', behavior: 'smooth'});
      } else if (action === 'close') {
        t.open = false; t.notes = true; paint(); t.ctx.layout?.scrollIntoView?.({block: 'start'});
      } else if (action === 'end' || action === 'fresh') {
        if (action === 'fresh') { t.open = true; paint(); }
        t.busy = true;
        t.host.querySelectorAll('[data-tu="end"]').forEach(n => { n.disabled = true; });
        t.session = await t.chat.end();   // the debrief streams into the chat
        t.info = await api(`/tutor/lessons/${t.ctx.section}/${t.ctx.lesson.id}`);
        if (T !== t) return;
        t.busy = false; paint();
      } else if (action === 'go-next' && t.info?.next) {
        const n = t.info.next;
        queue({section: n.section, lesson: n.lesson});
        window.AppSections?.select(n.section, route(n.lesson));
      } else if (action === 'again') {
        t.open = false; t.session = null; t.info = await api(`/tutor/lessons/${t.ctx.section}/${t.ctx.lesson.id}`); paint();
      }
    } catch (e) {
      if (T !== t) return;
      t.busy = false;
      if (!t.session?.id) { t.open = false; t.session = null; t.error = e.message; paint(); }   // otherwise the chat shows it
    }
  }

  // An activity answer or a design run goes to the tutor as a turn, through the chat so its reply streams.
  function send(body) { T.chat?.send(body).catch(() => {}); }

  // Follow the session: the chat redraws, the stage gains what new turns brought in (earlier items and their live
  // state stay put), and the objectives update.
  function sync() {
    const s = T.session;
    if (!T.host.querySelector('.tu-convo')) return;
    T.chat?.update(chatProps());
    const answered = new Set(s.turns.filter(t => t.role === 'block').map(t => t.block));
    const before = T.host.querySelectorAll('.tu-stage-item').length, live = T.rendered > 0;
    s.turns.slice(T.rendered).forEach((turn, i) => stageTurn(turn, T.rendered + i, answered));
    T.rendered = s.turns.length;
    const items = T.host.querySelectorAll('.tu-stage-item');
    if (items.length > before) stageShow(items[items.length - 1].dataset.stage, live);
    if (s.status === 'ended') T.host.querySelector('.tu-head [data-tu="end"]')?.remove();
    T.host.querySelector('.tu-objectives').innerHTML = T.ctx.lesson.objectives.map((o, i) => {
      const st = s.objectives[i]?.status || 'open';
      return `<li class="tu-obj is-${st}" title="${MARK[st][1]}"><span aria-hidden="true">${MARK[st][0]}</span><span>${inline(o)}</span></li>`;
    }).join('');
    T.host.querySelector('.tu-progress').textContent = `${s.progress.demonstrated}/${s.progress.total}`;
  }

  // What a tutor turn brought in goes on the stage; its message in the chat carries a card that brings it forward.
  // Ids match TutorChat's turnParts.
  function stageTurn(turn, at, answered) {
    if (turn.role !== 'tutor') return;
    (turn.boards || []).forEach((d, i) => stageAdd(boardNode(d, `wb${at}-${i}`), `Whiteboard: ${d.title || 'sketch'}`, `wb${at}-${i}`));
    (turn.designs || []).forEach((d, i) => stageAdd(designNode(d, at), `Simulator: ${d.title}`, `ds${at}-${i}`));
    if (turn.show_block) {
      const b = (T.ctx.lesson.blocks || []).find(x => x.key === turn.show_block);
      stageAdd(blockNode(turn.show_block, answered.has(turn.show_block)), `Activity: ${String(b?.title || b?.prompt || 'try it').replace(/[*`]/g, '').slice(0, 48)}`, `ac${at}`);
    }
  }

  // A diagram the tutor drew on the whiteboard: drawn like a lesson's architecture block, with its
  // request paths playable. Nothing is recorded from it.
  function boardNode(d, key) {
    const wrap = document.createElement('div');
    wrap.className = 'tu-block tu-board';
    if (!B()) return wrap;
    const b = {...d, key: String(key).replace(/[^\w-]/g, '')};
    wrap.innerHTML = B().renderBlock(b);
    B().wire(wrap, {blocks: [b]}, {saved: {}, save() {}, done() {}});
    return wrap;
  }

  // A design the tutor handed over for the simulator: folded until opened, then the design builder
  // with the tutor's traffic and incidents. He can change it, run the day, and send the run back.
  function designNode(d, at) {
    const wrap = document.createElement('div');
    wrap.className = 'tu-block tu-design';
    const incidents = (d.scenario.events || []).map(e => `${window.SDSim?.EVENT_LABEL?.[e.type] || e.type} at ${String(e.at).padStart(2, '0')}:00`);
    wrap.innerHTML = `<button type="button" class="sd-sim-open" aria-expanded="false"><strong>Simulator: ${esc(d.title)}</strong><span>Open it ▾</span></button>
      <p class="sd-muted tu-design-sub">${d.graph.nodes.length} components${incidents.length ? ' · ' + esc(incidents.join(', ')) : ''}${d.note ? ' · ' + esc(d.note) : ''}</p>`;
    wrap.querySelector('.sd-sim-open').addEventListener('click', () => {
      if (!window.SDBuilder) { wrap.querySelector('.tu-design-sub').textContent = 'The simulator is not loaded on this page.'; return; }
      const t = T, stage = document.createElement('div'), bar = document.createElement('div');
      bar.className = 'tu-design-bar';
      wrap.innerHTML = `<p class="tu-design-head"><b>${esc(d.title)}</b>${incidents.length ? ` <span class="sd-muted">· ${esc(incidents.join(', '))}</span>` : ''}</p>`;
      wrap.append(stage, bar);
      const scenario = {...d.scenario, id: `tutor-${t.session?.id}-${at}`};
      let last = null;
      const builder = window.SDBuilder.mount(stage, {mode: 'game', scenario, initial: d.graph, storageKey: `tutor-design-${t.session?.id}-${at}`,
        onRun(res, graph, info) {
          if (info?.whatif) return;
          last = {res, graph};
          const live = T === t && t.session?.status === 'active';
          bar.innerHTML = `<span>${res.summary.availability.toFixed(2)}% available · ${window.SDBuilder.money(res.bill.total)}/month</span>${live ? btn('Send this run to the tutor', 'send-run', '', true) : ''}`;
          bar.querySelector('[data-tu="send-run"]')?.addEventListener('click', () => {
            const {res: r, graph: g} = last;
            bar.innerHTML = '<span class="sd-muted">Sent.</span>';
            send({run: {turn: at, availability: r.summary.availability, cost: r.bill.total,
              objectives: r.summary.objectives.slice(0, 8).map(o => ({label: o.label, target: o.target, actual: o.actual, pass: !!o.pass})),
              events: (r.events || []).slice(0, 6).map(e => ({label: e.label, at: e.at, outcome: e.outcome})),
              findings: (r.findings || []).filter(f => f.level === 'bad' || f.level === 'warn').slice(0, 6).map(f => String(f.text).slice(0, 300)),
              graph: {nodes: g.nodes.map(n => ({id: n.id, defId: n.defId, ...(n.cfg ? {cfg: n.cfg} : {})})), edges: g.edges.map(e => ({from: e.from, to: e.to}))}}});
          });
        }});
      wrap._handle = builder;
    });
    return wrap;
  }

  // One of the lesson's own activities, live; its answer is recorded like in the lesson and told to the tutor.
  function blockNode(key, done) {
    const wrap = document.createElement('div');
    wrap.className = 'tu-block';
    const b = (T.ctx.lesson.blocks || []).find(x => x.key === key);
    if (!b || !B()) { wrap.textContent = 'This activity could not be shown.'; return wrap; }
    if (done) { wrap.innerHTML = `<p class="sd-muted">Activity answered.</p>`; return wrap; }
    wrap.innerHTML = B().renderBlock(b);
    const t = T;
    const handle = B().wire(wrap, {blocks: [b]}, {
      saved: {}, recall: t.ctx.recall, pitch: t.ctx.pitch, save() {},
      done(k, correct) {
        Promise.resolve(t.ctx.done?.(k, correct)).catch(() => {});
        if (T === t && t.session?.status === 'active' && typeof correct === 'boolean') send({block: {key: k, correct}});
      },
    });
    wrap._handle = handle;
    return wrap;
  }

  function reset() { if (T) window.SenpaiChat?.leaveScreen(T.host); T = null; }
  window.Tutor = {mount, reset, queue, warming, warmed, route};
})();
