// The tutor: a conversation that leads you through a lesson. With the model on, a lesson opens as
// a choice: learn it with the tutor, or read the notes (the choice of notes is remembered). A
// session replaces the lesson body with a chat, the lesson's objectives as a checklist and, in
// "Teach me", the lesson's own activities brought in by the tutor. Activity answers are recorded
// exactly as in the lesson. Ending a session brings a debrief from the tutor: the only teaching in
// the role-play modes. Home can queue a session, which starts as soon as the lesson opens.
// Without the model there is no card and the lesson works as usual.
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

  // ctx: {section, lesson: {id, title, objectives, blocks}, layout: node hidden during a session,
  //       done(key, correct), recall(block, text), pitch(block, text, followup)}
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
    act(T.session?.status === 'active' ? 'resume' : 'start');
  }

  // Notes stay hidden until chosen when the tutor is on. The lesson body's own display rule beats
  // [hidden], so hide it inline.
  function hideLesson() {
    if (T.ctx.layout) T.ctx.layout.style.display = T.open || (T.info?.enabled && !T.notes) ? 'none' : '';
  }

  async function load() {
    const t = T;
    t.host.innerHTML = '';
    try {
      const [info, overview] = await Promise.all([api(`/tutor/lessons/${t.ctx.section}/${t.ctx.lesson.id}`), api('/tutor')]);
      if (T !== t) return;
      t.info = info; t.overview = overview;
      if (info.active) t.session = info.active;
    } catch (e) { if (T === t) t.host.innerHTML = ''; return; }
    paint();
    takeQueued();
  }

  const cast = id => (T.overview?.story?.cast || []).find(c => c.id === id);


  function entryHtml() {
    const i = T.info, o = T.overview;
    if (!i.enabled) return '';
    const active = T.session && T.session.status === 'active';
    const go = active ? btn('Continue your session', 'resume', '', true) : btn(T.notes ? 'Learn this with the tutor' : 'Start', 'start', '', true);
    if (T.notes) return `<section class="tu-entry tu-compact"><span>Rather be taught? The tutor asks the questions and brings in this lesson's activities.</span>${go}</section>`;
    const mode = o.modes.find(m => m.id === T.mode);
    const style = active ? '' : `<label class="tu-style">Style <select data-tu-mode aria-label="Session style">${o.modes.map(m => `<option value="${m.id}" ${T.mode === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>`;
    return `<section class="tu-entry"><span class="sd-eyebrow">LEARN THIS WITH THE TUTOR</span>
      <p class="tu-scene">${esc(i.scene)}</p>${i.previously ? `<p class="tu-previously"><b>Last time:</b> ${inline(i.previously)}</p>` : ''}
      <p class="sd-muted tu-hint">${active ? 'Your session is waiting where you left it.' : esc(mode?.blurb || '')} Talk or type.</p>
      <div class="sd-actions">${go}${active ? btn('End it and get the debrief', 'fresh') : ''}${btn('Read the notes instead', 'notes')}${style}</div>
      ${T.error ? `<p class="tu-error">${esc(T.error)}</p>` : ''}</section>`;
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
      await window.Dictate?.settle?.(box);
      const text = box.value.trim();
      if (!text) return;
      box.value = '';
      send({text});
    });
    setTimeout(() => box.focus({preventScroll: true}), 0);
  }

  async function act(action) {
    const t = T;
    try {
      if (action === 'notes') {
        t.notes = true; setPreferNotes(true); paint(); t.ctx.layout?.scrollIntoView?.({block: 'start'});
      } else if (action === 'start') {
        setPreferNotes(false);
        t.busy = true; t.error = ''; t.open = true;
        t.session = {id: null, mode: t.mode, status: 'active', turns: [], objectives: t.info.objectives.map(() => ({status: 'open'})), progress: {demonstrated: 0, total: t.info.objectives.length}};
        paint(); status(`${cast(firstSpeaker(t.mode))?.name || 'The tutor'} is getting ready…`);
        const s = await api('/tutor/sessions', 'POST', {section: t.ctx.section, lesson: t.ctx.lesson.id, mode: t.mode, key: rid()});
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
      } else if (action === 'again') {
        t.open = false; t.session = null; t.info = await api(`/tutor/lessons/${t.ctx.section}/${t.ctx.lesson.id}`); paint();
      }
    } catch (e) {
      if (T !== t) return;
      t.busy = false;
      if (!t.session?.id) { t.open = false; t.session = null; t.error = e.message; paint(); } else status(e.message, true);
    }
  }
  const firstSpeaker = mode => ({explain: 'jo', critique: 'marcus', 'war-room': 'priya', interview: 'marcus'}[mode] || 'tutor');

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
    } catch (e) {
      if (T !== t) return;
      t.busy = false;
      status(e.message, true);
    }
  }
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
      chat.insertAdjacentHTML('beforeend', `<div class="tu-wrap"><b>Session ended.</b> ${s.progress.demonstrated} of ${s.progress.total} objectives shown. What you showed is now in your knowledge model.<div class="sd-actions">${retry}${btn('Back to the lesson', 'close', '', !retry)}${btn('Another session', 'again')}</div></div>`);
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
    } else {
      const who = turn.debrief ? {name: 'Tutor', role: 'Debrief'} : turn.speaker === 'tutor' ? {name: 'Tutor', role: ''} : (cast(turn.speaker) || {name: turn.speaker, role: ''});
      n.className = 'tu-msg tu-them' + (turn.debrief ? ' tu-debrief' : ''); n.dataset.speaker = turn.speaker;
      n.innerHTML = `<div class="tu-who"><span class="tu-avatar" aria-hidden="true">${esc(who.name[0])}</span><b>${esc(who.name)}</b>${who.role ? `<small>${esc(who.role)}</small>` : ''}</div><div class="tu-text sd-md">${md(turn.say)}</div>`;
      if (turn.show_block) n.appendChild(blockNode(turn.show_block, answered.has(turn.show_block)));
    }
    return n;
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
  window.Tutor = {mount, reset, queue};
})();
