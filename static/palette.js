// Command palette: Ctrl/Cmd-K (or "/") jumps to any page, lesson, simulator, exercise or problem, and runs a few actions.
(function () {
  'use strict';
  const { api, escapeHtml: esc } = window.H;
  const SD_VIEWS = [['home', 'Home'], ['curriculum', 'Learn'], ['simulators', 'Simulators'], ['practise', 'Practise'], ['progress', 'What you know'],
    ['quickfire', 'Quickfire'], ['mistakes', 'Mistakes book'], ['papers', 'Past papers'], ['drills', 'Estimation drills'], ['skills', 'Skill drills'], ['cases', 'Design cases']];
  const TRACK_VIEWS = [['fundamentals', 'Fundamentals', [['home', 'Home'], ['lessons', 'Learn'], ['practise', 'Practise'], ['progress', 'What you know']]],
    ['ai', 'AI Engineering', [['home', 'Home'], ['lessons', 'Learn'], ['practise', 'Practise'], ['progress', 'What you know']]],
    ['experience', 'Experience', [['home', 'Overview'], ['stories', 'Story bank'], ['drill', 'Timed answers'], ['dives', 'Deep dives'], ['mistakes', 'Mistakes book']]],
    ['practical', 'Practical Coding', [['home', 'Exercises'], ['mistakes', 'Mistakes book']]],
    ['readiness', 'Overview', [['home', 'Interview readiness']]]];
  const KIND = { page: 'Page', action: 'Action', lesson: 'Lesson', simulator: 'Simulator', exercise: 'Exercise', problem: 'Problem' };

  let index = null, loading = null, results = [], sel = 0, root, input, list, lastFocus;

  const go = {
    leetcode: (tab) => { window.AppSections?.select('leetcode'); window.App?.goTab(tab); },
    section: (s, v) => window.AppSections?.select(s, v),
    hash: (h) => { location.hash = h; },
  };

  function staticItems() {
    const out = [];
    document.querySelectorAll('#tabs li[data-tab]').forEach((li) => {
      const t = li.textContent.trim();
      out.push({ kind: 'page', title: t, sub: 'LeetCode', key: 'leetcode/' + li.dataset.tab, run: () => go.leetcode(li.dataset.tab) });
    });
    SD_VIEWS.forEach(([v, t]) => out.push({ kind: 'page', title: t, sub: 'System Design', key: 'system-design/' + v, run: () => go.section('system-design', v) }));
    TRACK_VIEWS.forEach(([s, name, views]) => views.forEach(([v, t]) => out.push({ kind: 'page', title: `${name}: ${t}`, sub: name, key: s + '/' + v, run: () => go.section(s, v) })));
    out.push(
      { kind: 'action', title: 'Do this next', sub: 'Your plan\'s next step', run: () => window.NextUp?.load(true).then((d) => d.primary ? window.Senpai?.start(d.primary.action) : window.App?.goTab('senpai')) },
      { kind: 'action', title: 'See interview readiness across all sections', sub: 'Overview', run: () => go.section('readiness', 'home') },
      { kind: 'action', title: 'Start a System Design quickfire round', sub: 'Practise', run: () => go.section('system-design', 'quickfire') },
      { kind: 'action', title: 'Start any problem by URL, number or title', sub: 'LeetCode', run: () => document.getElementById('btn-quick-start')?.click() },
      { kind: 'action', title: 'Open the design builder', sub: 'System Design', run: () => { go.section('system-design', 'simulators'); setTimeout(() => window.DesignSimulators?.openItem('builder', 'builder'), 50); } },
      { kind: 'action', title: 'Play Ripple Ops', sub: 'System Design', run: () => { go.section('system-design', 'simulators'); setTimeout(() => window.DesignSimulators?.openItem('game', 'ripple'), 50); } });
    return out;
  }

  async function simulators() {
    const get = (p) => fetch(p + '?v=' + (window.ASSET_VER || '')).then((r) => r.json());
    const [designs, ints, crs] = await Promise.all([get('/walkthrough/index.json'), get('/simulators/internals.json'), get('/simulators/courses.json')]);
    const sim = (kind, id, title, sub) => ({ kind: 'simulator', title, sub, run: () => { go.section('system-design', 'simulators'); setTimeout(() => window.DesignSimulators?.openItem(kind, id), 50); } });
    return [...designs.designs.map((d) => sim('design', d.id, d.title, 'System design simulator')),
      ...ints.topics.map((t) => sim('internals', t.id, t.title, 'Simulator · ' + (t.categoryLabel || ''))),
      ...crs.items.map((t) => sim('course', t.id, t.title, 'Simulator · ' + (t.categoryLabel || '')))];
  }

  function build() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    loading = Promise.allSettled([api('/search-index'), simulators()]).then(([si, sims]) => {
      const dyn = si.status === 'fulfilled' ? si.value.items.map((i) => ({ ...i, run: i.route ? () => go.hash(i.route)
        : () => { go.leetcode('problems'); setTimeout(() => { const f = document.getElementById('problems-search'); if (f) { f.value = i.title; f.dispatchEvent(new Event('input', { bubbles: true })); } }, 400); } })) : [];
      index = [...staticItems(), ...dyn, ...(sims.status === 'fulfilled' ? sims.value : [])];
      return index;
    }).finally(() => { loading = null; });
    return loading;
  }

  // Every word must appear; titles that start with a word, or contain it at a word start, rank first.
  function score(item, words) {
    const t = item.title.toLowerCase().replace(/^\d+\s+/, ''), s = (item.sub || '').toLowerCase();
    let n = t.includes(words.join(' ')) ? 6 : 0;   // the whole phrase, in order, beats the same words scattered
    for (const w of words) {
      if (t.startsWith(w)) n += 6; else if (t.includes(' ' + w)) n += 4; else if (t.includes(w)) n += 2; else if (s.includes(w)) n += 1; else return -1;
    }
    return n + (item.kind === 'page' || item.kind === 'action' ? 0.5 : 0);
  }
  function search(q) {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return (index || []).filter((i) => i.kind === 'action').concat((index || []).filter((i) => i.kind === 'page').slice(0, 8));
    return (index || []).map((i, k) => [i, score(i, words), k]).filter((x) => x[1] >= 0).sort((a, b) => b[1] - a[1] || a[2] - b[2]).slice(0, 40).map((x) => x[0]);
  }

  function draw() {
    list.innerHTML = results.length ? results.map((r, i) => `<li role="option" id="pal-${i}" aria-selected="${i === sel}" class="${i === sel ? 'is-sel' : ''}" data-i="${i}">
        <span class="pal-kind">${esc(KIND[r.kind] || r.kind)}</span><span class="pal-title">${esc(r.title)}</span><span class="pal-sub">${esc(r.sub || '')}</span></li>`).join('')
      : `<li class="pal-empty">${index ? 'Nothing matches that.' : 'Loading…'}</li>`;
    input.setAttribute('aria-activedescendant', results.length ? 'pal-' + sel : '');
    list.querySelector('.is-sel')?.scrollIntoView({ block: 'nearest' });
  }
  function refresh() { results = search(input.value); sel = 0; draw(); }

  function close() {
    if (root.classList.contains('hidden')) return;
    root.classList.add('hidden');
    lastFocus?.focus?.();
  }
  function choose(i) {
    const r = results[i];
    if (!r) return;
    close();
    try { r.run(); } catch (e) { window.H.toast?.('Could not open that', 'error'); }
  }
  async function open() {
    lastFocus = document.activeElement;
    root.classList.remove('hidden');
    input.value = '';
    refresh();
    input.focus();
    await build();
    if (!root.classList.contains('hidden')) refresh();
  }

  function mount() {
    root = document.createElement('div');
    root.id = 'palette';
    root.className = 'palette hidden';
    root.innerHTML = `<div class="pal-card" role="dialog" aria-modal="true" aria-label="Search">
      <input class="pal-input" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" placeholder="Jump to a lesson, simulator, problem or page…" autocomplete="off" spellcheck="false" />
      <ul id="pal-list" class="pal-list" role="listbox"></ul>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>`;
    document.body.appendChild(root);
    input = root.querySelector('.pal-input'); list = root.querySelector('.pal-list');
    input.addEventListener('input', refresh);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (results.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length; draw(); } }
      else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    list.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) choose(+li.dataset.i); });
    list.addEventListener('mousemove', (e) => { const li = e.target.closest('li[data-i]'); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; draw(); } });
    root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); root.classList.contains('hidden') ? open() : close(); }
      else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && root.classList.contains('hidden')) { e.preventDefault(); open(); }
    });
    const trigger = document.getElementById('btn-palette');
    if (trigger) { if (/Mac|iPhone|iPad/.test(navigator.platform || '')) trigger.querySelector('kbd').textContent = '⌘K'; trigger.addEventListener('click', open); }
    setTimeout(build, 4000);   // warm the index once the page has settled; failure is silent
  }

  const pages = () => staticItems().filter((i) => i.kind === 'page' && i.key).map((i) => ({ key: i.key, label: i.sub === 'LeetCode' || i.title.includes(': ') ? (i.sub === 'LeetCode' ? 'LeetCode: ' : '') + i.title : i.sub + ': ' + i.title }));
  window.Palette = { open, close, pages };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
