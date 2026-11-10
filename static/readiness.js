// Interview readiness across every section (GET /api/readiness): the Overview page, the card on every
// section's Home, the sidebar chip and the section links in the Overview nav. One scale for all six sections;
// untested is unknown, never zero. The numbers come from the server (server/readiness.py); this only draws them.
(function () {
  'use strict';
  const { api, escapeHtml: esc } = window.H;
  const IDS = ['leetcode', 'system-design', 'fundamentals', 'ai', 'experience', 'practical'];
  const SHORT = { leetcode: 'Coding', 'system-design': 'System design', fundamentals: 'Fundamentals', ai: 'AI', experience: 'Experience', practical: 'Practical' };
  const NAME = { leetcode: 'LeetCode', 'system-design': 'System Design', fundamentals: 'Fundamentals', ai: 'AI Engineering', experience: 'Experience', practical: 'Practical Coding' };
  const DETAILS = { leetcode: ['Topics', { tab: 'topics' }], 'system-design': ['What you know', { view: 'progress' }], fundamentals: ['What you know', { view: 'progress' }],
    ai: ['What you know', { view: 'progress' }], experience: ['Story bank', { view: 'stories' }], practical: ['Mistakes book', { view: 'mistakes' }] };
  const BAND_CLASS = { 'Interview-ready': 'is-ready', 'Nearly there': 'is-near', Building: 'is-building', Early: 'is-early' };
  const TTL = 60000;
  let cache = null, at = 0, pending = null, here = 'leetcode';

  const signedIn = () => !document.getElementById('app')?.classList.contains('hidden');
  const unknown = r => r.band === 'Not started' || r.band === 'Not enough tested to say';   // too little tested for a number
  const known = o => !unknown(o);
  const pctText = r => (unknown(r) ? '–' : r.ready + '%');
  const bandClass = b => BAND_CLASS[b] || 'is-unknown';

  function load(force) {
    if (!force && cache && Date.now() - at < TTL) return Promise.resolve(cache);
    if (pending) return pending;
    pending = api('/readiness').then(d => { cache = d; at = Date.now(); return d; }).finally(() => { pending = null; });
    return pending;
  }

  function open(id, where = {}) {
    if (id === 'leetcode') {
      window.AppSections.select('leetcode');
      if (where.tab) window.App?.goTab(where.tab);
    } else window.AppSections.select(id, where.view || 'home');
  }

  // ---------- sidebar chip ----------
  function pips(rows) {
    return `<span class="rd-pips" aria-hidden="true">${rows.map(r => `<i style="--c:var(--sec-${r.id})"><b style="width:${unknown(r) ? 0 : Math.max(4, r.ready)}%"></b></i>`).join('')}</span>`;
  }
  function paintChip(d) {
    const el = document.getElementById('readiness-chip');
    if (!el) return;
    const o = d.overall, isKnown = o.band !== 'Not started' && o.band !== 'Not enough tested to say';
    const iv = d.interview && d.interview.days_left >= 0 ? ` · ${d.interview.days_left}d` : '';
    el.innerHTML = `<span class="rd-chip-top"><span>Readiness${iv}</span><em>${isKnown ? o.ready + '%' : '–'}</em></span>${pips(d.sections)}`;
    el.setAttribute('aria-label', `Interview readiness ${isKnown ? o.ready + ' percent, ' + o.band : o.band.toLowerCase()}. Open the overview.`);
    el.classList.toggle('hidden', here === 'readiness');
    // the same numbers beside each space in the switcher, so choosing where to work is informed
    d.sections.forEach(r => {
      const opt = document.querySelector(`#section-menu [data-section="${r.id}"]`);
      if (!opt) return;
      let tag = opt.querySelector('.section-pct');
      if (!tag) { tag = document.createElement('span'); tag.className = 'section-pct'; opt.insertBefore(tag, opt.querySelector('.section-check')); }
      tag.textContent = pctText(r);
      tag.title = `${r.title}: ${r.band}`;
    });
  }
  function mark(section) {
    here = section;
    const el = document.getElementById('readiness-chip');
    if (!el || !signedIn()) return;
    el.classList.toggle('hidden', section === 'readiness' || !cache);
    if (!el.dataset.bound) { el.dataset.bound = '1'; el.addEventListener('click', () => window.AppSections.select('readiness')); }
    load().then(paintChip).catch(() => {});
  }

  // ---------- nav links under the Overview nav ----------
  function navLinks() {
    return `<span class="design-nav-label rd-nav-label">JUMP TO</span>${IDS.map(id => {
      const r = cache?.sections.find(s => s.id === id);
      return `<button type="button" class="rd-nav-link" data-go-section="${id}" style="--c:var(--sec-${id})"><i></i>${esc(NAME[id])}<em>${r ? pctText(r) : ''}</em></button>`;
    }).join('')}`;
  }

  // ---------- card: the same readiness card on every section Home (section-home.js) ----------
  function cardHtml(d, id, { stats = [], details } = {}) {
    const r = d.sections.find(x => x.id === id), o = d.overall;
    if (!r) return '';
    const [label, to] = details || DETAILS[id];
    const stat = ([k, v, warn]) => `<div class="${warn ? 'is-warn' : ''}"><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
    return `<span class="sd-eyebrow">INTERVIEW READINESS</span>
      <div class="sh-stand-num"><strong>${pctText(r)}</strong><span class="rd-band ${bandClass(r.band)}">${esc(r.band)}</span></div>
      <p class="sh-stand-sub">${unknown(r) ? (r.coverage ? 'Too little tested to score yet.' : 'Nothing tested here yet, so there is no score.') : 'of this section you would get right today'}</p>
      <div class="rd-bar" style="--c:var(--accent)" role="img" aria-label="${r.ready}% held, ${r.coverage}% tested, ready line at 70%"><span class="rd-bar-tested" style="width:${r.coverage}%"></span><span class="rd-bar-held" style="width:${r.ready}%"></span></div>
      <p class="sh-stand-key"><span><i class="is-held"></i>held</span><span><i class="is-tested"></i>${r.coverage}% tested</span><span><i class="is-line"></i>ready</span></p>
      <p class="rd-focus">${r.slipping ? `<b class="rd-slip">${r.slipping} slipping.</b> ` : ''}${esc(r.focus)}</p>
      ${stats.length ? `<dl class="hub-stats">${stats.map(stat).join('')}</dl>` : ''}
      <button type="button" class="hub-stand-link" data-rd-details>${esc(label)} →</button>
      <button type="button" class="sh-all" data-rd-overview aria-label="Overall readiness ${known(o) ? o.ready + ' percent' : 'unknown'}. Open Overview."><span>All six sections <b>${known(o) ? o.ready + '%' : '–'}</b></span>${pips(d.sections)}</button>`;
  }
  async function homeCard(el, id, opts = {}) {
    if (!el) return false;
    try {
      const d = await load();
      if (!el.isConnected) return true;
      el.innerHTML = cardHtml(d, id, opts);
      const to = (opts.details || DETAILS[id])[1];
      el.querySelector('[data-rd-details]')?.addEventListener('click', () => (typeof to === 'function' ? to() : open(id, to)));
      el.querySelector('[data-rd-overview]')?.addEventListener('click', () => window.AppSections.select('readiness'));
      return true;
    } catch (e) { console.warn('readiness card', e); return false; }   // never in the critical path
  }

  // ---------- the Overview page ----------
  function radar(rows) {
    const cx = 190, cy = 150, R = 96, n = rows.length;
    const ang = i => -Math.PI / 2 + i * 2 * Math.PI / n;
    const pt = (i, v, r = R) => [cx + r * v / 100 * Math.cos(ang(i)), cy + r * v / 100 * Math.sin(ang(i))];
    const poly = vals => vals.map((v, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ');
    const rings = [25, 50, 75, 100].map(v => `<polygon class="rd-ring ${v === 75 ? 'is-target' : ''}" points="${poly(rows.map(() => v))}"/>`).join('');
    const spokes = rows.map((_, i) => { const [x, y] = pt(i, 100); return `<line class="rd-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
    const labels = rows.map((r, i) => {
      const [x, y] = pt(i, 100, R + 18), c = Math.cos(ang(i)), anchor = Math.abs(c) < .25 ? 'middle' : c > 0 ? 'start' : 'end';
      return `<text class="rd-axis" x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="${anchor}" style="fill:var(--sec-${r.id})">${esc(SHORT[r.id])}</text><text class="rd-axis-val" x="${x.toFixed(1)}" y="${(y + 13).toFixed(1)}" text-anchor="${anchor}">${pctText(r)}</text>`;
    }).join('');
    const dots = rows.map((r, i) => { const [x, y] = pt(i, r.ready); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" style="fill:var(--sec-${r.id})"/>`; }).join('');
    const alt = rows.map(r => `${r.title} ${unknown(r) ? 'not tested' : r.ready + ' percent'}`).join(', ');
    return `<svg class="rd-radar" viewBox="0 0 380 300" role="img" aria-label="Readiness by section: ${esc(alt)}">${rings}${spokes}<polygon class="rd-area-tested" points="${poly(rows.map(r => r.coverage))}"/><polygon class="rd-area-ready" points="${poly(rows.map(r => r.ready))}"/>${dots}${labels}</svg>`;
  }
  function summary(o, rows) {
    const by = id => rows.find(r => r.id === id);
    if (!known(o)) return `${o.coverage ? `Only ${o.coverage}% of the syllabus has been tested` : 'Nothing has been tested yet'}, so there is no score to trust. A placement check in a section takes about five minutes and starts the picture.`;
    const w = by(o.weakest), s = by(o.strongest);
    const spread = w && s && w.id !== s.id ? ` ${esc(s.title)} is furthest along (${s.ready}%); <b>${esc(w.title)}</b> holds you back (${w.ready}%). A loop is usually only as strong as its weakest round.` : '';
    return `You could produce about <b>${o.ready}%</b> of everything across the six sections right now, measured on the ${o.coverage}% of it that has been tested.${spread}`;
  }
  function card(r, weakest) {
    const [detailLabel, detailTo] = DETAILS[r.id];
    return `<article class="rd-card ${r.id === weakest ? 'is-weakest' : ''}" style="--c:var(--sec-${r.id})">
      <header><h3>${esc(r.title)}</h3>${r.id === weakest ? '<span class="rd-flag">Biggest gap</span>' : ''}<span class="rd-band ${bandClass(r.band)}">${esc(r.band)}</span></header>
      <div class="rd-num"><strong>${pctText(r)}</strong><span>${unknown(r) ? (r.coverage ? 'too little tested to score' : 'not tested yet') : 'held right now'}</span></div>
      <div class="rd-bar" role="img" aria-label="${r.ready}% held, ${r.coverage}% tested"><span class="rd-bar-tested" style="width:${r.coverage}%"></span><span class="rd-bar-held" style="width:${r.ready}%"></span></div>
      <p class="rd-head">${esc(r.headline)}</p>
      <p class="rd-focus">${r.slipping ? `<b class="rd-slip">${r.slipping} slipping.</b> ` : ''}${esc(r.focus)}</p>
      <footer><span class="rd-weight">${Math.round(r.weight * 100)}% of your plan</span><button type="button" class="rd-link" data-rd-section="${r.id}">Continue →</button><button type="button" class="rd-link is-quiet" data-rd-details="${r.id}">${esc(detailLabel)}</button></footer></article>`;
  }
  function interviewHtml(iv, o) {
    if (!iv) return `<p class="rd-iv"><button type="button" class="rd-link" data-rd-iv="edit">Set your interview date</button> <span class="sd-muted">for a countdown and the weekly pace it needs.</span></p>`;
    const past = iv.days_left < 0, n = Math.abs(iv.days_left);
    const when = past ? `was ${n} day${n === 1 ? '' : 's'} ago` : iv.days_left === 0 ? 'is today' : `is in ${n} day${n === 1 ? '' : 's'}`;
    const pace = past || !known(o) ? '' : iv.gap === 0 ? ' You are past the line; keep it there.' : ` To reach ${iv.target}% you need about <b>+${iv.per_week}</b> points a week.`;
    return `<p class="rd-iv"><b>Your interview ${when}</b> (${esc(iv.date)}).${pace} <button type="button" class="rd-link is-quiet" data-rd-iv="edit">Change</button></p>`;
  }
  function interviewForm(iv) {
    return `<form class="rd-iv-form"><label>Interview date <input type="date" class="input" data-rd-iv-date value="${esc(iv?.date || '')}" required></label><button type="submit" class="button is-primary is-small">Save</button>${iv ? '<button type="button" class="button is-ghost is-small" data-rd-iv="clear">Remove</button>' : ''}<button type="button" class="button is-ghost is-small" data-rd-iv="cancel">Cancel</button></form>`;
  }
  async function home(ctx) {
    const d = await load(true);
    if (ctx.stale()) return;
    const o = d.overall, rows = d.sections;
    ctx.root.innerHTML = `<div class="rd">
      <div class="sd-page-intro"><span class="sd-eyebrow">OVERVIEW</span><h2 id="sd-heading" tabindex="-1">Start with the next step. See where you stand.</h2></div>
      <div id="daily-coach-summary"></div>
      <div id="rd-tutor"></div>
      <section class="rd-hero">
        <div class="rd-hero-main"><span class="sd-eyebrow">INTERVIEW READINESS</span>
          <div class="rd-big"><strong>${known(o) ? o.ready + '%' : '–'}</strong><span class="rd-band ${bandClass(o.band)}">${esc(o.band)}</span></div>
          <p class="rd-summary">${summary(o, rows)}</p>
          <div id="rd-iv">${interviewHtml(d.interview, o)}</div>
          <p class="rd-week-line">${o.gained_week ? `<b>+${o.gained_week}</b> ideas learned this week` : 'Nothing new learned this week'}${o.slipped_week ? ` · <b>${o.slipped_week}</b> slipped` : ''}${o.slipping ? ` · ${o.slipping} due a review` : ''}</p>
          <p class="rd-key"><span><i class="is-held"></i>Held right now</span><span><i class="is-tested"></i>Tested so far</span><span><i class="is-target"></i>Interview-ready line</span></p></div>
        <div class="rd-hero-chart">${radar(rows)}</div>
      </section>
      <div class="rd-grid">${rows.map(r => card(r, rows.length > 1 && known(o) ? o.weakest : null)).join('')}</div>
      <p class="rd-note sd-muted">How this is measured: each section counts what you would get right today out of its whole syllabus (recall fades without practice), so an untested section reads as unknown, not zero. Coding counts skills by the evidence behind them; Experience also counts whether each competency has a story. The overall figure weights sections by your plan.</p></div>`;
    // The day's plan (Do this next, with the week against the plan, and today's session), then the tutor's pick.
    if (window.Senpai) window.Senpai.mountToday(); else window.DailyCoach?.mountSummary();
    window.TutorHome?.line(ctx.root.querySelector('#rd-tutor'));
    const ivBox = ctx.root.querySelector('#rd-iv');
    const saveDate = async value => { try { await api('/config', 'POST', { interview_date: value }); await load(true); window.AppSections.select('readiness'); } catch (err) { window.H.toast?.(err.message || 'Could not save the date', 'error'); } };
    ctx.root.addEventListener('submit', e => { if (e.target.closest('.rd-iv-form')) { e.preventDefault(); const v = ivBox.querySelector('[data-rd-iv-date]').value; if (v) saveDate(v); } });
    ctx.root.addEventListener('click', e => {
      const iv = e.target.closest('[data-rd-iv]');
      if (iv) { const a = iv.dataset.rdIv; if (a === 'edit') { ivBox.innerHTML = interviewForm(d.interview); ivBox.querySelector('input').focus(); } else if (a === 'cancel') ivBox.innerHTML = interviewHtml(d.interview, o); else if (a === 'clear') saveDate(''); return; }
      const go = e.target.closest('[data-rd-section]'), det = e.target.closest('[data-rd-details]');
      if (go) open(go.dataset.rdSection);
      else if (det) open(det.dataset.rdDetails, { tab: DETAILS[det.dataset.rdDetails][1].tab, view: DETAILS[det.dataset.rdDetails][1].view });
    });
    paintChip(d);
  }

  // The chip needs the app to be signed in; look for that a few times after load rather than calling the API early.
  let tries = 0;
  const wait = setInterval(() => { if (signedIn()) { clearInterval(wait); mark(here); } else if (++tries > 60) clearInterval(wait); }, 800);

  window.Tracks?.register('readiness', { home });   // tutor-home.js adds the Tutor page
  window.Readiness = { load, card: homeCard, mark, navLinks, open };
})();
