// Visualise: step-through animations of 46 algorithms and data structures, a tab in the LeetCode section.
// Topic text lives in /widgets/dsa/index.json; each animation is a prebuilt module (widgets/dsa/<id>.js,
// export mount(el) -> unmount) loaded only when its topic is opened. Nothing here touches the server or
// your practice data, and the tab works offline once its files are cached.
(function () {
  'use strict';
  const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const ver = () => window.ASSET_VER || '';
  const host = () => document.getElementById('tab-visualise');
  const filter = { q: '', cat: '' };
  let data = null, unmount = null, token = 0;

  async function load() {
    if (data) return data;
    const r = await fetch(`/widgets/dsa/index.json?v=${ver()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (data = await r.json());
  }
  function stop() {
    token++;
    if (unmount) { try { unmount(); } catch (e) { console.warn('Could not unmount animation', e); } unmount = null; }
  }
  const matches = t => (!filter.cat || t.category === filter.cat)
    && (!filter.q || `${t.title} ${t.blurb} ${t.categoryLabel} ${t.problems.map(p => p.title).join(' ')}`.toLowerCase().includes(filter.q.toLowerCase()));
  const pill = d => `<span class="vz-pill vz-${esc(d)}">${esc(d)}</span>`;

  function list(el) {
    stop();
    const shown = data.topics.filter(matches);
    el.innerHTML = `<div class="vz">
      <div class="vz-bar">
        <input class="vz-search input" type="search" placeholder="Search algorithms or problems" value="${esc(filter.q)}" aria-label="Search algorithms">
        <div class="vz-chips" role="group" aria-label="Category">
          <button type="button" class="vz-chip${filter.cat ? '' : ' is-on'}" data-cat="">All ${data.topics.length}</button>
          ${data.categories.map(([id, label]) => `<button type="button" class="vz-chip${filter.cat === id ? ' is-on' : ''}" data-cat="${esc(id)}">${esc(label)}</button>`).join('')}
        </div>
      </div>
      <div class="vz-grid">${shown.map(t => `<button type="button" class="vz-card" data-id="${esc(t.id)}">
        <span class="vz-card-top"><strong>${esc(t.title)}</strong>${pill(t.difficulty)}</span>
        <span class="vz-card-blurb">${esc(t.blurb)}</span>
        <span class="vz-card-meta"><code>${esc(t.time)}</code><span>${esc(t.categoryLabel)}</span></span>
      </button>`).join('') || '<p class="vz-empty">Nothing matches. Clear the search or pick another category.</p>'}</div></div>`;
    const search = el.querySelector('.vz-search');
    search.addEventListener('input', () => {
      filter.q = search.value;
      const at = search.selectionStart;
      list(el);
      const again = el.querySelector('.vz-search');
      again.focus(); again.setSelectionRange(at, at);
    });
    el.querySelectorAll('.vz-chip').forEach(b => b.addEventListener('click', () => { filter.cat = b.dataset.cat; list(el); }));
    el.querySelectorAll('.vz-card').forEach(b => b.addEventListener('click', () => open(el, b.dataset.id)));
  }

  async function open(el, id) {
    stop();
    const i = data.topics.findIndex(t => t.id === id), t = data.topics[i];
    if (!t) return list(el);
    const prev = data.topics[i - 1], next = data.topics[i + 1], mine = ++token;
    el.innerHTML = `<div class="vz vz-detail">
      <div class="vz-head">
        <button type="button" class="button vz-back">← All algorithms</button>
        <h2>${esc(t.title)} ${pill(t.difficulty)}</h2>
        <span class="vz-nav">
          <button type="button" class="button" data-go="${esc(prev?.id || '')}" ${prev ? '' : 'disabled'} aria-label="Previous: ${esc(prev?.title || '')}">‹</button>
          <button type="button" class="button" data-go="${esc(next?.id || '')}" ${next ? '' : 'disabled'} aria-label="Next: ${esc(next?.title || '')}">›</button>
        </span>
      </div>
      <div class="vz-stage" data-stage><p class="vz-empty">Loading…</p></div>
      <div class="vz-info">
        <section><h3>Concept</h3><p>${esc(t.concept)}</p>
          <p class="vz-cx"><span>Time <code>${esc(t.time)}</code></span><span>Space <code>${esc(t.space)}</code></span></p></section>
        <section><h3>Common pitfalls</h3><ul>${t.pitfalls.map(p => `<li>${esc(p)}</li>`).join('')}</ul></section>
        ${t.problems.length ? `<section><h3>Practise on LeetCode</h3><ul class="vz-links">${t.problems.map(p => `<li><a href="${p.slug ? `https://leetcode.com/problems/${encodeURIComponent(p.slug)}/` : `https://leetcode.com/problemset/?search=${encodeURIComponent(p.title)}`}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a></li>`).join('')}</ul></section>` : ''}
        ${t.followUps.length ? `<section><h3>Interview follow-ups</h3><ul>${t.followUps.map(p => `<li>${esc(p)}</li>`).join('')}</ul></section>` : ''}
      </div></div>`;
    el.querySelector('.vz-back').addEventListener('click', () => list(el));
    el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => b.dataset.go && open(el, b.dataset.go)));
    const stage = el.querySelector('[data-stage]');
    try {
      const m = await import(`/widgets/dsa/${t.id}.js?v=${ver()}`);
      if (mine !== token) return;
      stage.innerHTML = '';
      unmount = m.mount(stage);
    } catch (e) {
      if (mine === token) stage.innerHTML = `<p class="vz-empty">Could not load this animation: ${esc(e.message)}</p>`;
    }
    el.scrollIntoView?.({ block: 'start' });
  }

  async function render() {
    const el = host();
    if (!el) return;
    if (!data) el.innerHTML = '<p class="vz-empty">Loading…</p>';
    try { await load(); } catch (e) {
      el.innerHTML = `<p class="vz-empty">Could not load the algorithm list (${esc(e.message)}). <button type="button" class="button" id="vz-retry">Retry</button></p>`;
      el.querySelector('#vz-retry').addEventListener('click', render);
      return;
    }
    if (wanted) { const id = wanted; wanted = null; return open(el, id); }
    list(el);
  }

  // Jump to one animation from elsewhere (the Problems tab): open the tab, then the topic.
  let wanted = null;
  function show(id) {
    wanted = id;
    document.querySelector('#tabs li[data-tab="visualise"]')?.click();
  }
  // Put a "watch it run" button on each Problems-tab row whose problem an animation uses. The row is
  // matched on its LeetCode slug; rows are redrawn on every filter, so this is safe to call repeatedly.
  async function decorate(box) {
    let d;
    try { d = await load(); } catch { return; }
    const by = new Map();
    d.topics.forEach(t => t.problems.forEach(p => { if (p.slug) (by.get(p.slug) || by.set(p.slug, []).get(p.slug)).push(t); }));
    box.querySelectorAll('.problem-actions').forEach(a => {
      const slug = a.querySelector('[data-slug]')?.dataset.slug;
      const topics = by.get(slug) || [];
      if (!slug || !topics.length || a.querySelector('.vz-see')) return;
      topics.slice(0, 2).forEach(t => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'button is-small is-ghost vz-see'; b.dataset.vz = t.id;
        b.title = `Watch ${t.title} run, step by step`; b.textContent = '▶ ' + t.title;
        b.addEventListener('click', () => show(t.id));
        a.append(b);
      });
    });
  }

  window.Views = window.Views || {};
  window.Views.renderVisualise = render;
  // Hidden tabs keep their DOM, so a running animation would keep ticking. Drop it and the page with it:
  // coming back redraws the list.
  const el = host();
  if (el) new MutationObserver(() => { if (el.classList.contains('hidden') && el.childElementCount) { stop(); el.innerHTML = ''; } })
    .observe(el, { attributes: true, attributeFilter: ['class'] });
  window.Visualise = { render, stop, show, decorate };
})();
