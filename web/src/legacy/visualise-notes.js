// Topic notes as HTML strings, for the imperative simulator pages (the React pages use components/topic/TopicNotes.tsx).
(function () {
  'use strict';
  const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
  const split = (s, seps) => {
    for (const sep of seps) { const i = s.indexOf(sep); if (i > 8 && i < s.length - 8) return [s.slice(0, i), s.slice(i + sep.length)]; }
    return [s, ''];
  };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  function keyCard(t) {
    const said = v => v && !/^(varies|n\/?a|-|—)$/i.test(v.trim());
    const cx = [said(t.time) && ['Time', t.time], said(t.space) && ['Space', t.space]].filter(Boolean);
    return `<div class="vz-key"><span class="vz-kicker">Key idea</span><p class="vz-key-text">${inl(t.keyIdea || t.blurb)}</p>
      ${cx.length ? `<p class="vz-cx">${cx.map(([k, v]) => `<span>${k} <code>${esc(v)}</code></span>`).join('')}</p>` : ''}</div>`;
  }
  function notes(t, { background, practice } = {}) {
    const tabs = [];
    const steps = t.steps?.length ? `<ol class="vz-steps">${t.steps.map(x => `<li><span>${inl(x)}</span></li>`).join('')}</ol>` : `<p class="vz-prose">${esc(t.howItWorks || '')}</p>`;
    tabs.push(['how', 'How it works', `${steps}${background ? `<details class="vz-bg"><summary>Background: why it matters</summary><p>${esc(background)}</p></details>` : ''}`]);
    if (t.tradeoffs?.length) tabs.push(['trade', 'Trade-offs', `<div class="vz-tiles">${t.tradeoffs.map(x => {
      const [choice, why] = split(x.rationale, ['. ']);
      return `<article class="vz-tile"><h4>${esc(x.decision)}</h4><p class="vz-choice">${esc(choice.replace(/\.$/, ''))}</p>${why ? `<p class="vz-why">${esc(why)}</p>` : ''}</article>`;
    }).join('')}</div>`, t.tradeoffs.length]);
    if (t.pitfalls?.length) tabs.push(['pit', 'Pitfalls', `<ul class="vz-pits">${t.pitfalls.map(x => {
      const [mistake, cost] = split(x, [' — ', ' - ', '; ', ': ']);
      return cost ? `<li><strong>${esc(mistake)}</strong><span>${esc(cap(cost))}</span></li>` : `<li>${esc(x)}</li>`;
    }).join('')}</ul>`, t.pitfalls.length]);
    const qs = t.questions || t.followUps || [], asks = qs.filter(x => x.trim().endsWith('?')).length * 2 >= qs.length;
    if (qs.length) tabs.push(['qs', asks ? 'Interview questions' : 'Interview follow-ups', `<p class="vz-hint">${asks ? 'Answer each out loud in two or three sentences, then check yourself against the simulator.' : 'How an interviewer pushes this further. Say how your design or code would change for each.'}</p>
      <ol class="vz-qs">${qs.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`, qs.length]);
    if (practice) tabs.push(['lc', 'Practise', practice, t.problems?.length]);
    return `<div class="vz-notes" data-vz-notes><div class="vz-tabs" role="tablist" aria-label="Notes">${tabs.map(([id, label, , n], i) =>
      `<button type="button" role="tab" id="vz-tab-${id}" class="vz-tab${i ? '' : ' is-on'}" aria-selected="${!i}" aria-controls="vz-panel-${id}" tabindex="${i ? -1 : 0}" data-vz-tab="${id}">${esc(label)}${n ? ` <span>${n}</span>` : ''}</button>`).join('')}</div>
      ${tabs.map(([id, , body], i) => `<div class="vz-panel" role="tabpanel" id="vz-panel-${id}" aria-labelledby="vz-tab-${id}"${i ? ' hidden' : ''}>${body}</div>`).join('')}</div>`;
  }
  function wireNotes(root) {
    const box = root.querySelector('[data-vz-notes]');
    if (!box) return;
    const tabs = [...box.querySelectorAll('[data-vz-tab]')];
    const pick = b => tabs.forEach(x => {
      const on = x === b;
      x.classList.toggle('is-on', on); x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
      box.querySelector('#vz-panel-' + x.dataset.vzTab).hidden = !on;
    });
    tabs.forEach((b, i) => {
      b.addEventListener('click', () => pick(b));
      b.addEventListener('keydown', e => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        const n = tabs[(i + d + tabs.length) % tabs.length]; pick(n); n.focus(); e.preventDefault();
      });
    });
  }
  window.Visualise = { keyCard, notes, wireNotes };
})();
