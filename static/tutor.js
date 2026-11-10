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
      if (info.active && info.enabled && !t.notes && !queued) t.open = true;
    } catch (e) { if (T === t) t.host.innerHTML = ''; return; }
    paint();
    takeQueued();
  }

  const cast = id => (T.overview?.story?.cast || []).find(c => c.id === id);


  function entryHtml() {
    const i = T.info, o = T.overview, out = outsideHtml();
    if (!i.enabled) return out;
    const active = T.session && T.session.status === 'active';
    if (T.warming) return out + `<section class="tu-entry tu-compact"><span><b>Quick check first.</b> Answer what you can below; the tutor starts from what you miss.</span>${btn('Skip it: start the tutor', 'start-now')}</section>`;
    if (T.passed) return out + `<section class="tu-entry"><span class="sd-eyebrow">FULL MARKS</span><p>You got every warm-up question right, so this lesson counts as done and Home moves you on.</p>
      <div class="sd-actions">${btn('Next lesson →', 'home', '', true)}${btn('Talk it through anyway', 'start-now')}${btn('Read the notes', 'notes')}</div></section>`;
    const go = active ? btn('Continue your session', 'resume', '', true) : btn(T.notes ? 'Learn this with the tutor' : 'Start', 'start', '', true);
    if (T.notes) return out + `<section class="tu-entry tu-compact"><span>Rather be taught? The tutor asks the questions and brings in this lesson's activities.</span>${go}</section>`;
    const mode = o.modes.find(m => m.id === T.mode);
    const style = active ? '' : `<label class="tu-style">Style <select data-tu-mode aria-label="Session style">${o.modes.map(m => `<option value="${m.id}" ${T.mode === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>`;
    const fresh = i.outside?.picks_up && !active;
    const nx = !active && i.next ? `<p class="tu-previously"><b>Your tutor suggested next:</b> ${esc(i.next.title)}${i.next.why ? `, to ${esc(i.next.why)}` : ''}. ${btn('Go there →', 'go-next', '', true)}</p>` : '';
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
    const s = T.session, mode = T.overview.modes.find(m => m.id === s.mode);
    return `<section class="tu-panel"><header class="tu-head"><div><span class="sd-eyebrow">TUTOR · ${esc(mode?.label || s.mode)}</span><h3>${esc(T.ctx.lesson.title)}</h3></div>
        <div class="tu-head-actions">${btn('Show the notes', 'close')}${s.status === 'active' ? btn('End session', 'end') : ''}</div></header>
      <div class="tu-body"><div class="tu-chat" aria-live="polite"></div>
        <details class="tu-rail" ${window.matchMedia?.('(max-width: 760px)').matches ? '' : 'open'}><summary><span class="sd-eyebrow">OBJECTIVES</span> <span class="sd-muted tu-progress"></span></summary><ol class="tu-objectives"></ol></details></div>
      <form class="tu-compose"><textarea data-dictate rows="2" aria-label="Your reply" placeholder="Answer, ask, or think out loud…"></textarea>
        <button type="submit" class="button is-primary">Send</button></form>
      <div class="tu-status" role="status"></div></section>`;
  }

  function paint() {
    if (!T.info) return;
    hideLesson();
    if (!T.open || !T.session) { T.host.innerHTML = entryHtml(); wireEntry(); return; }
    T.host.innerHTML = panelHtml();
    T.rendered = 0;
    wirePanel();
    sync();
  }

  function wireEntry() {
    T.host.querySelector('[data-tu-mode]')?.addEventListener('change', e => { T.mode = e.target.value; paint(); });
    T.host.querySelectorAll('[data-tu]').forEach(n => n.addEventListener('click', () => act(n.dataset.tu)));
  }
  function wirePanel() {
    T.host.querySelectorAll('.tu-head [data-tu]').forEach(n => n.addEventListener('click', () => act(n.dataset.tu)));
    const form = T.host.querySelector('.tu-compose'), box = form.querySelector('textarea');
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (T.busy) return;
      await window.Dictate?.hold?.(box);  // the mic, if on, comes back on with the reply (resumeMic)
      const text = box.value.trim();
      if (!text) { resumeMic(); return; }
      box.value = '';
      send({text});
    });
    setTimeout(() => box.focus({preventScroll: true}), 0);
  }

  async function act(action) {
    const t = T;
    try {
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
        paint(); status(`${cast(firstSpeaker(t.mode))?.name || 'The tutor'} is getting ready…`);
        const s = await api('/tutor/sessions', 'POST', {section: t.ctx.section, lesson: t.ctx.lesson.id, mode: t.mode, key: rid(), focus: t.focus || '', carry: t.carry || null, layer: t.layer || 0});
        t.focus = ''; t.carry = null; t.layer = 0;
        if (T !== t) return;
        t.session = s; t.busy = false; paint();
      } else if (action === 'resume') {
        t.open = true; paint();
      } else if (action === 'close') {
        t.open = false; t.notes = true; paint(); t.ctx.layout?.scrollIntoView?.({block: 'start'});
      } else if (action === 'end' || action === 'fresh') {
        if (action === 'fresh') { t.open = true; paint(); }
        t.busy = true; status('Writing your debrief…');
        t.host.querySelectorAll('[data-tu="end"]').forEach(n => { n.disabled = true; });
        t.session = await api(`/tutor/sessions/${t.session.id}/end`, 'POST', {});
        t.info = await api(`/tutor/lessons/${t.ctx.section}/${t.ctx.lesson.id}`);
        if (T !== t) return;
        t.busy = false; t.pending = null; paint();
      } else if (action === 'retry' && t.pending) {
        send(t.pending, true);
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
      if (!t.session?.id) { t.open = false; t.session = null; t.error = e.message; paint(); } else status(e.message, true);
    }
  }
  const firstSpeaker = mode => ({explain: 'jo', critique: 'marcus', 'war-room': 'priya', interview: 'marcus', cv: 'marcus'}[mode] || 'tutor');

  async function send(body, retry = false) {
    const t = T;
    if (!retry) t.pending = {...body, key: rid()};
    t.busy = true;
    const chat = t.host.querySelector('.tu-chat');
    if (!retry && body.text) chat?.insertAdjacentHTML('beforeend', `<div class="tu-msg tu-me tu-optimistic"><div class="tu-text">${esc(body.text)}</div></div>`);
    status(`${cast(lastSpeaker())?.name || 'The tutor'} is thinking…`);
    scrollChat();
    try {
      const s = await api(`/tutor/sessions/${t.session.id}/turns`, 'POST', t.pending);
      if (T !== t) return;
      t.session = s; t.busy = false;
      if (!s.error) t.pending = null;
      sync();
      resumeMic();
    } catch (e) {
      if (T !== t) return;
      t.busy = false;
      status(e.message, true);
      resumeMic();
    }
  }
  function resumeMic() { window.Dictate?.resume?.(T?.host.querySelector('.tu-compose textarea')); }
  function lastSpeaker() { const turns = T.session?.turns || []; for (let i = turns.length - 1; i >= 0; i--) if (turns[i].role === 'tutor') return turns[i].speaker; return 'tutor'; }

  function status(text, isError = false) {
    const n = T.host.querySelector('.tu-status');
    if (!n) return;
    n.className = 'tu-status' + (isError ? ' is-error' : text ? ' is-busy' : '');
    n.innerHTML = text ? esc(text) + (isError && T.pending ? ' ' + btn('Try again', 'retry') : '') : '';
    n.querySelector('[data-tu]')?.addEventListener('click', () => act('retry'));
  }
  function scrollChat() { const c = T.host.querySelector('.tu-chat'); if (c) c.scrollTop = c.scrollHeight; }

  // Append turns the chat has not shown yet; earlier turns (and live activities in them) stay put.
  function sync() {
    const s = T.session, chat = T.host.querySelector('.tu-chat');
    if (!chat) return;
    chat.querySelectorAll('.tu-optimistic').forEach(n => n.remove());
    const answered = new Set(s.turns.filter(t => t.role === 'block').map(t => t.block));
    s.turns.slice(T.rendered).forEach(turn => chat.appendChild(turnNode(turn, answered)));
    T.rendered = s.turns.length;
    if (s.status === 'ended' && !chat.querySelector('.tu-wrap')) {
      const retry = s.debrief_due ? btn('Write the debrief', 'end', '', true) : '';
      const nx = !retry && T.info?.next;
      chat.insertAdjacentHTML('beforeend', `<div class="tu-wrap"><b>Session ended.</b> ${s.progress.demonstrated} of ${s.progress.total} objectives shown. What you showed is now in your knowledge model.<div class="sd-actions">${retry}${nx ? btn(`Next: ${nx.title} →`, 'go-next', '', true) : ''}${btn('Back to the lesson', 'close', '', !retry && !nx)}${btn('Another session', 'again')}</div></div>`);
      chat.querySelectorAll('.tu-wrap [data-tu]').forEach(n => n.addEventListener('click', () => act(n.dataset.tu)));
      T.host.querySelector('.tu-compose')?.remove();
      T.host.querySelector('.tu-head [data-tu="end"]')?.remove();
    }
    T.host.querySelector('.tu-objectives').innerHTML = T.ctx.lesson.objectives.map((o, i) => {
      const st = s.objectives[i]?.status || 'open';
      return `<li class="tu-obj is-${st}" title="${MARK[st][1]}"><span aria-hidden="true">${MARK[st][0]}</span><span>${inline(o)}</span></li>`;
    }).join('');
    T.host.querySelector('.tu-progress').textContent = `${s.progress.demonstrated} of ${s.progress.total} shown`;
    status(s.error || '', !!s.error);
    scrollChat();
  }

  function turnNode(turn, answered) {
    const n = document.createElement('div');
    if (turn.role === 'learner') {
      n.className = 'tu-msg tu-me'; n.innerHTML = `<div class="tu-text">${esc(turn.text)}</div>`;
    } else if (turn.role === 'block') {
      n.className = 'tu-note'; n.textContent = turn.correct ? 'You got the activity right.' : 'You missed the activity.';
    } else if (turn.role === 'run') {
      n.className = 'tu-note'; n.textContent = `You ran the design in the simulator: ${Number(turn.availability || 0).toFixed(2)}% availability.`;
    } else {
      const who = turn.debrief ? {name: 'Tutor', role: 'Debrief'} : turn.speaker === 'tutor' ? {name: 'Tutor', role: ''} : (cast(turn.speaker) || {name: turn.speaker, role: ''});
      n.className = 'tu-msg tu-them' + (turn.debrief ? ' tu-debrief' : ''); n.dataset.speaker = turn.speaker;
      n.innerHTML = `<div class="tu-who"><span class="tu-avatar" aria-hidden="true">${esc(who.name[0])}</span><b>${esc(who.name)}</b>${who.role ? `<small>${esc(who.role)}</small>` : ''}</div><div class="tu-text sd-md">${md(turn.say)}</div>`;
      const at = T.session?.turns.indexOf(turn);
      (turn.boards || []).forEach((d, i) => n.appendChild(boardNode(d, `wb${at}-${i}`)));
      (turn.designs || []).forEach(d => n.appendChild(designNode(d, at)));
      if (turn.show_block) n.appendChild(blockNode(turn.show_block, answered.has(turn.show_block)));
      if (turn.links?.length) n.appendChild(linksNode(turn.links));
      if (turn.move) n.appendChild(moveNode(turn.move));
    }
    return n;
  }

  // Game levels, worked designs and simulators the tutor handed over: links to the Simulators page.
  function linksNode(links) {
    const wrap = document.createElement('div');
    wrap.className = 'tu-links';
    const TAG = {game: 'Play in Ripple Ops', design: 'Worked design', internals: 'Simulator'};
    wrap.innerHTML = links.map(l => `<a class="tu-link is-${esc(l.kind)}" href="${esc(l.href)}"><span>${TAG[l.kind] || 'Open'}</span><b>${esc(l.title)} →</b></a>`).join('');
    return wrap;
  }

  // The tutor suggests carrying the conversation into another lesson: one click, and the thread comes along.
  function moveNode(m) {
    const wrap = document.createElement('div');
    wrap.className = 'tu-move';
    wrap.innerHTML = btn(`Carry on in ${m.title} →`, 'move', '', true);
    const from = T.session?.id;
    wrap.querySelector('button').addEventListener('click', () => {
      queue({section: m.section, lesson: m.lesson, carry: from});
      window.AppSections?.select(m.section, route(m.lesson));
    });
    return wrap;
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

  function reset() { T = null; }
  window.Tutor = {mount, reset, queue, warming, warmed, route};
})();
