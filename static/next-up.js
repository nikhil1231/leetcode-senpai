// "Do this next": the one recommendation, shared by Today, Tutor and every section Home.
// The server (senpai/next) picks the open block from whichever bucket is furthest behind its weekly share.
(function () {
  const { api, escapeHtml: esc } = window.H;
  let pending = null, loadedAt = 0;

  // One request serves every card on the page; a card drawn a second later reuses it.
  function load(force) {
    if (!force && pending && Date.now() - loadedAt < 15000) return pending;
    loadedAt = Date.now();
    pending = api('/senpai/next').catch((e) => { pending = null; throw e; });
    return pending;
  }

  const ACTIVITY = { check: 'Check', retrieval: 'Retrieval', implementation: 'Implementation', explanation: 'Explanation', design: 'Design' };
  const meta = (b, label) => [ACTIVITY[b.activity] || b.activity, b.minutes ? b.minutes + ' min' : '', label].filter(Boolean).join(' · ');
  const labelOf = (d, id) => (d.standing.find((r) => r.id === id) || {}).label || '';

  function weekBars(d) {
    const rows = d.standing.filter((r) => r.target_min > 0);
    if (!rows.length) return '';
    return `<ul class="nu-week" aria-label="This week against the time split">${rows.map((r) => {
      const w = Math.min(100, Math.round((r.ratio || 0) * 100));
      return `<li class="${d.primary && d.primary.bucket === r.id ? 'is-next' : ''}"><span>${esc(r.label)}</span>
        <i class="nu-bar" role="img" aria-label="${esc(r.label)}: ${r.served_min} of ${r.target_min} minutes"><b style="width:${w}%"></b></i>
        <em>${r.served_min}<small>/${r.target_min}m</small></em></li>`;
    }).join('')}</ul>`;
  }

  function start(block) { window.Senpai?.start(block.action); }

  // The full card: Today and Tutor.
  function cardHtml(d) {
    if (!d.primary) {
      return `<section class="nu-card is-clear"><span class="dc-eyebrow">Do this next</span>
        <h2>${d.session_complete ? 'Today\'s session is done' : 'Nothing is queued'}</h2>
        <p class="nu-why">${esc(d.note || (d.session_complete ? 'Everything planned for today is finished. Prepare another session in Senpai if you want more, or stop here.' : 'Open Senpai to prepare a session.'))}</p>
        <div class="nu-actions"><button type="button" class="button" data-nu-senpai>Open Senpai</button></div>${weekBars(d)}</section>`;
    }
    const p = d.primary;
    return `<section class="nu-card"><span class="dc-eyebrow">Do this next</span>
      <h2>${esc(p.title)}</h2><p class="nu-meta">${esc(meta(p, labelOf(d, p.bucket)))}</p>
      <p class="nu-why">${esc(d.reason)}</p>${p.why ? `<p class="nu-sub">${esc(p.why)}</p>` : ''}
      <div class="nu-actions"><button type="button" class="button is-primary" data-nu="p">Start</button>
        ${d.alternatives.map((a, i) => `<button type="button" class="button is-ghost nu-alt" data-nu="${i}" title="${esc(a.why || '')}">Or: ${esc(a.title)} <small>${a.minutes} min</small></button>`).join('')}</div>
      ${weekBars(d)}</section>`;
  }

  function bind(el, d) {
    el.querySelector('[data-nu="p"]')?.addEventListener('click', () => start(d.primary));
    el.querySelectorAll('.nu-alt').forEach((n) => n.addEventListener('click', () => start(d.alternatives[+n.dataset.nu])));
    el.querySelector('[data-nu-senpai]')?.addEventListener('click', () => window.App?.goTab('senpai'));
  }

  async function mount(el, { force = false } = {}) {
    if (!el) return null;
    try {
      const d = await load(force);
      if (!el.isConnected) return d;
      el.innerHTML = cardHtml(d);
      bind(el, d);
      return d;
    } catch (e) {
      el.innerHTML = '';   // the recommendation is never in the critical path: the page works without it
      return null;
    }
  }

  // A slim line for section Homes, which have their own, section-specific suggestion.
  async function banner(el, section) {
    if (!el) return null;
    try {
      const d = await load();
      if (!el.isConnected || !d.primary) { if (el.isConnected) el.innerHTML = ''; return d; }
      const p = d.primary;
      el.innerHTML = `<div class="nu-banner"><div><span class="dc-eyebrow">Your plan's next step</span>
        <b>${esc(p.title)}</b> <span class="nu-meta">${esc(meta(p, labelOf(d, p.bucket)))}</span>
        <p class="nu-why">${esc(d.reason)}</p></div><button type="button" class="button is-small" data-nu="p">Start</button></div>`;
      bind(el, d);
      return d;
    } catch (e) { if (el.isConnected) el.innerHTML = ''; return null; }
  }

  window.NextUp = { load, mount, banner };
})();
