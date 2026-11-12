// Simulators: every interactive widget in one searchable place. Ripple Ops (the builder as a game,
// sd-game.js), the design builder (a sandbox), 27 worked system designs (sd-walkthrough.js), 32
// internals simulators (storage engines, consensus, transactions, networking...) and the Fundamentals
// and AI course simulators (fund-sims.js, ai-sims.js; listed in simulators/courses.json). Each opens
// full width with its notes underneath. Ripple Ops keeps its runs on the server; everything else here
// is static files.
(function () {
  'use strict';
  const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const getJson = async url => {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  let items = null, internals = null, course = null, error = '';
  let query = '', group = '', current = null, keep = false, inst = null, token = 0, wantLevel = '';

  async function load() {
    if (items) return;
    const [designs, ints, crs] = await Promise.all([getJson('/walkthrough/index.json'), getJson('/simulators/internals.json'), getJson('/simulators/courses.json')]);
    internals = Object.fromEntries(ints.topics.map(t => [t.id, t]));
    course = Object.fromEntries(crs.items.map(t => [t.id, t]));
    items = [{ kind: 'game', id: 'ripple', title: 'Ripple Ops: the design game', blurb: 'Take Ripple from a garage to a billion users. Every level is a chapter of the course: a budget, targets and a bad day. Draw and size the system, live through the day, and hear from the team how it went.', group: 'build', tag: 'Game' },
      { kind: 'builder', id: 'builder', title: 'Design builder', blurb: 'A blank canvas. Drag in components, size them, set a scale, and run a simulated day against what you drew.', group: 'build', tag: 'Sandbox' },
      ...designs.designs.map(d => ({ kind: 'design', id: d.id, title: d.title, blurb: d.problem, group: 'designs', tag: d.category, difficulty: d.difficulty,
        meta: `${d.components} components · ${d.flows.length} flows`, text: d.flows.join(' ') })),
      ...ints.topics.map(t => ({ kind: 'internals', id: t.id, title: t.title, blurb: t.blurb, group: t.category, tag: t.categoryLabel, difficulty: t.difficulty,
        meta: `${t.minutes} min`, text: `${t.overview} ${t.pitfalls.join(' ')}` })),
      ...crs.items.map(t => ({ kind: 'course', id: t.id, title: t.title, blurb: t.blurb, group: t.category, tag: t.categoryLabel, meta: t.lessonTitle, text: `${t.notes} ${t.challenges.join(' ')}` }))];
    // The list is four kinds of thing, each split into its own categories.
    const sub = (cats, i) => (cats.find(([id]) => id === i.group) || [i.group, i.tag])[1];
    SECTIONS = [
      { id: 'build', title: 'Build and play', blurb: 'Draw a system yourself and live through its day: the design game, or a blank canvas.', has: i => i.kind === 'game' || i.kind === 'builder', sub: () => '' },
      { id: 'designs', title: 'Worked system designs', blurb: 'Classic interview designs. Step through each request flow, then stress the design and watch what breaks.', has: i => i.kind === 'design',
        sub: i => i.tag, order: ['Foundations', 'Core Services', 'Advanced Systems'] },
      { id: 'internals', title: 'Inside the building blocks', blurb: 'What those designs are made of: storage engines, consensus, transactions and the network, one mechanism at a time.', has: i => i.kind === 'internals',
        sub: i => sub(ints.categories, i), order: ints.categories.map(([, l]) => l) },
      { id: 'course', title: 'From the Fundamentals and AI courses', blurb: 'The simulators inside those lessons, here to replay on their own.', has: i => i.kind === 'course',
        sub: i => sub(crs.categories, i), order: crs.categories.map(([, l]) => l) },
    ];
  }
  let SECTIONS = [];

  const shown = () => {
    const q = query.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    const kind = SECTIONS.find(x => x.id === group);
    const hits = items.filter(i => (!kind || kind.has(i)) && words.every(w => `${i.title} ${i.blurb} ${i.tag} ${i.text || ''}`.toLowerCase().includes(w)));
    if (!words.length) return hits;
    const score = i => words.reduce((n, w) => n + (i.title.toLowerCase().includes(w) ? 4 : 0) + (i.tag.toLowerCase().includes(w) ? 2 : 0) + (i.blurb.toLowerCase().includes(w) ? 1 : 0), 0);
    return hits.map((i, k) => [i, score(i), k]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(x => x[0]);   // best match first, otherwise list order
  };
  const pill = d => d ? `<span class="wt-pill wt-${esc(d)}">${esc(d)}</span>` : '';
  const card = i => `<button type="button" class="sim-card${i.kind === 'game' ? ' is-featured' : ''}" data-sim-open="${esc(i.kind)}:${esc(i.id)}">
      <span class="sim-card-top"><strong>${esc(i.title)}</strong>${pill(i.difficulty)}</span><span class="sim-card-blurb">${esc(i.blurb)}</span>
      <span class="sim-card-meta"><span>${esc(i.tag)}</span>${i.meta ? `<span>${esc(i.meta)}</span>` : ''}</span></button>`;
  const grid = () => {
    const list = shown(), searching = !!query.trim();
    if (!list.length) return '<p class="sim-count" aria-live="polite">0 simulators</p><p class="sim-empty">Nothing matches. Try a shorter search, or clear the filter.</p>';
    const parts = SECTIONS.map(sec => {
      const mine = list.filter(sec.has);
      if (!mine.length) return '';
      const subs = [...new Set(mine.map(sec.sub))].sort((a, b) => (sec.order || []).indexOf(a) - (sec.order || []).indexOf(b));
      const body = subs.map(name => {
        const cards = mine.filter(i => sec.sub(i) === name);
        return `${name && subs.length > 1 ? `<h4 class="sim-sub">${esc(name)} <span>${cards.length}</span></h4>` : ''}<div class="sim-cards${sec.id === 'build' ? ' is-build' : ''}">${cards.map(card).join('')}</div>`;
      }).join('');
      return `<section class="sim-section" id="sim-${sec.id}"><header class="sim-section-head"><h3>${esc(sec.title)} <span>${mine.length}</span></h3>${searching ? '' : `<p>${esc(sec.blurb)}</p>`}</header>${body}</section>`;
    }).join('');
    return `<p class="sim-count" aria-live="polite">${searching || group ? `${list.length} of ${items.length} simulators` : `${items.length} simulators in four groups`}</p>${parts}`;
  };
  const chips = () => [['', 'All'], ...SECTIONS.map(x => [x.id, x.id === 'course' ? 'Course simulators' : x.id === 'internals' ? 'Building blocks' : x.id === 'designs' ? 'System designs' : 'Build and play'])]
    .map(([id, label]) => `<button type="button" class="sim-chip${group === id ? ' is-on' : ''}" data-sim-group="${esc(id)}" aria-pressed="${group === id}">${esc(label)} <span>${id ? items.filter(SECTIONS.find(x => x.id === id).has).length : items.length}</span></button>`).join('');

  function intro() {
    return `<div class="sd-page-intro"><span class="sd-eyebrow">SIMULATORS</span><h2 id="sd-heading" tabindex="-1">See it run, then break it.</h2>
      <p>Build a design yourself, step through a classic one and stress it, or open up the mechanisms underneath: storage engines, consensus and the network.</p></div>`;
  }
  function listHtml() {
    return `${intro()}<div class="sim-tools"><input type="search" class="input sim-search" data-sim-search placeholder="Search simulators: raft, cache, payment, TLS…" value="${esc(query)}" aria-label="Search simulators">
      <div class="sim-chips" role="group" aria-label="Show">${chips()}</div></div>
      <div data-sim-grid>${grid()}</div>
      <p class="sim-foot">Looking for algorithm animations? The 46 step-throughs for graphs, trees, DP and more are on the <button type="button" class="sim-link" data-sim-dsa>LeetCode Visualise tab</button>.</p>`;
  }

  const internalsInfo = t => window.Visualise.notes(t, { background: t.overview });
  function courseInfo(t) {
    const section = t.category === 'ai' ? 'ai' : 'fundamentals';
    return `<div class="vz-info">${t.notes ? `<section><h3>What to notice</h3>${window.SDBlocks ? `<div class="sd-md">${window.SDBlocks.md(t.notes)}</div>` : `<p>${esc(t.notes)}</p>`}</section>` : ''}
      ${t.challenges.length ? `<section><h3>Try this</h3><ul>${t.challenges.map(c => `<li>${esc(c)}</li>`).join('')}</ul></section>` : ''}
      <section><h3>The lesson</h3><p><a href="#/${section}/lesson/${encodeURIComponent(t.lesson)}">${esc(t.lessonTitle)} →</a></p></section></div>`;
  }
  function detailHtml(it) {
    const t = it.kind === 'internals' ? internals[it.id] : null;
    const c = it.kind === 'course' ? course[it.id] : null;
    return `<div class="sim-detail"><div class="sim-top"><button type="button" class="button" data-sim-back>← All simulators</button>
      ${it.kind === 'design' || it.kind === 'game' ? '' : `<h2>${esc(it.title)} ${pill(it.difficulty)}${t ? `<span class="sim-min">${t.minutes} min</span>` : ''}</h2>`}</div>
      ${c && c.blurb ? `<p class="sim-note">${esc(c.blurb)}</p>` : ''}${t ? window.Visualise.keyCard(t) : ''}<div class="sim-stage" data-sim-stage><p class="wt-note">Loading…</p></div>${t ? internalsInfo(t) : ''}${c ? courseInfo(c) : ''}</div>`;
  }

  function render() {
    if (error) return `${intro()}<div class="sd-error">${esc(error)}</div><button type="button" class="button" data-sim-retry>Try again</button>`;
    if (!items) return `${intro()}<p class="wt-note">Loading…</p>`;
    return current ? detailHtml(current) : listHtml();
  }

  function stop() {
    token++;
    if (inst) { try { inst.destroy ? inst.destroy() : inst(); } catch (e) { console.warn('Could not stop simulator', e); } inst = null; }
  }
  const home = () => { current = null; window.SystemDesign?.openView('simulators'); };

  function wire(root) {
    stop();
    const level = wantLevel; wantLevel = '';
    root.querySelector('[data-sim-retry]')?.addEventListener('click', () => { error = ''; items = null; window.SystemDesign?.openView('simulators'); });
    if (!items) return;
    if (!current) {
      const g = root.querySelector('[data-sim-grid]');
      root.querySelector('[data-sim-search]')?.addEventListener('input', e => { query = e.target.value; g.innerHTML = grid(); });
      root.querySelectorAll('[data-sim-group]').forEach(b => b.addEventListener('click', () => {
        group = b.dataset.simGroup; g.innerHTML = grid();
        root.querySelectorAll('[data-sim-group]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      }));
      root.querySelector('[data-sim-dsa]')?.addEventListener('click', () => {
        window.AppSections?.go('/leetcode/visualise');
      });
      g.addEventListener('click', e => {
        const c = e.target.closest('[data-sim-open]');
        if (!c) return;
        const [kind, id] = c.dataset.simOpen.split(':');
        current = items.find(i => i.kind === kind && i.id === id); keep = true;
        window.SystemDesign?.openView('simulators');
      });
      return;
    }
    root.querySelector('[data-sim-back]')?.addEventListener('click', home);
    window.Visualise?.wireNotes(root);
    const stage = root.querySelector('[data-sim-stage]'), mine = token;
    if (current.kind === 'game') inst = window.RippleOps.mount(stage, { level: level || undefined, sandbox: () => openItem('builder', 'builder'), onRoute: sync });
    else if (current.kind === 'builder') inst = window.SDBuilder.mount(stage);
    else if (current.kind === 'design') inst = window.SDWalkthrough.mount(stage, { design: current.id });
    else if (current.kind === 'course') {
      if (!window.SDSims?.has(current.id)) { stage.innerHTML = '<p class="wt-note">This simulator is not loaded on this page.</p>'; return; }
      stage.innerHTML = '';
      inst = window.SDSims.mount(current.id, stage, {}, { metrics() {}, touched() {} });
    } else {
      const id = current.id;
      import(/* webpackIgnore: true */ `/widgets/internals/${id}.js`).then(m => {
        if (mine !== token) return;
        stage.innerHTML = ''; inst = m.mount(stage);
      }).catch(e => { if (mine === token) stage.innerHTML = `<p class="wt-note">Could not load this simulator: ${esc(e.message)}</p>`; });
    }
  }

  async function open() {
    const want = api.want; api.want = null;
    if (!keep && !want) current = null;          // arriving from the menu shows the list; opening a card keeps its choice
    keep = false; wantLevel = '';
    try { await load(); error = ''; } catch (e) { error = `Could not load the simulators (${e.message}).`; }
    if (want && items) {                  // a refreshed URL: #/system-design/simulators/<kind>~<id>[~<level>]
      const [kind, id, level] = want.split('~');
      current = items.find(i => i.kind === kind && i.id === id) || null; wantLevel = level || '';
    }
  }

  // Open one simulator directly (from a lesson, the home page or Ripple Ops).
  async function openItem(kind, id) {
    try { await load(); } catch (e) { error = `Could not load the simulators (${e.message}).`; }
    current = items?.find(i => i.kind === kind && i.id === id) || null; keep = true;
    await window.SystemDesign?.openView('simulators');
  }

  // The URL names the open simulator (and Ripple level) so a refresh lands in the same place.
  const route = () => current ? 'simulators/' + current.kind + '~' + current.id + (current.kind === 'game' && inst?.route?.() ? '~' + inst.route() : '') : 'simulators';
  const sync = () => { if (current && document.body.classList.contains('section-design')) window.AppSections?.replace('/system-design/' + route()); };
  const api = window.DesignSimulators = { render, wire, open, stop, openItem, route, isBusy: () => false };
})();
