// The one layout every section Home uses (LeetCode Today, System Design, Fundamentals, AI, Experience,
// Practical): the section's heading, the plan's next step as a slim line, then this section's own next step
// with up to two alternatives on the left and the readiness card on the right, then whatever the section
// lists below. The readiness card is the same size and in the same place everywhere, and shows the same
// numbers as Overview (Readiness.card). A section supplies content; this file owns the arrangement.
(function () {
  'use strict';
  const { escapeHtml: esc } = window.H;
  const NAME = { leetcode: 'LeetCode', 'system-design': 'System Design', fundamentals: 'Fundamentals', ai: 'AI Engineering', experience: 'Experience', practical: 'Practical Coding' };
  const TAGLINE = {
    leetcode: 'Coding problems, and the reviews that are due.',
    'system-design': 'Designing systems and explaining the trade-offs.',
    fundamentals: 'How the stack under your code works.',
    ai: 'Building with LLMs, from one API call to a production system.',
    experience: 'Your past projects, told as interview answers.',
    practical: 'Building, extending, debugging and reviewing real code.',
  };

  // The plan line and readiness card arrive a moment after the markup. A redraw starts them from what they
  // showed last time, so a background refresh with nothing new doesn't collapse and regrow the page.
  const last = {};

  // next: {kicker, title, why, button} (button is ready HTML); alts: [{title, why, attrs}] rendered as buttons
  // carrying `attrs` (the section wires their clicks); below: HTML under the layout; note: one small line under the heading.
  function html({ section, next, alts = [], extra = '', below = '', note = '' }) {
    return `<div class="sh" data-sh="${esc(section)}">
      <header class="sd-page-intro sh-intro"><span class="sd-eyebrow">${esc(NAME[section].toUpperCase())}</span><h2 ${section === 'leetcode' ? '' : 'id="sd-heading" '}tabindex="-1">${esc(TAGLINE[section])}</h2>${note ? `<p class="sh-note">${note}</p>` : ''}</header>
      <div class="sh-plan" data-sh-plan>${last[section]?.plan || ''}</div>
      <div class="sh-layout">
        <div class="sh-main">
          <section class="hub-next"><span class="hub-kicker">${esc(next.kicker || 'Next step')}</span><h3>${esc(next.title)}</h3>${next.why ? `<p>${next.why}</p>` : ''}<div class="sd-actions">${next.button}</div></section>
          ${alts.length ? `<div class="hub-alts" role="group" aria-label="Other options">${alts.map(a => `<button type="button" class="hub-alt" ${a.attrs}><span class="hub-kicker">Or</span><b>${esc(a.title)}</b><small>${esc(a.why || '')}</small><i aria-hidden="true">→</i></button>`).join('')}</div>` : ''}
          ${extra}
        </div>
        <aside class="sh-stand" data-sh-stand aria-label="Interview readiness for ${esc(NAME[section])}">${last[section]?.stand || '<span class="sd-eyebrow">INTERVIEW READINESS</span><p class="sh-stand-wait">Loading readiness…</p>'}</aside>
      </div>
      ${below ? `<div class="sh-below">${below}</div>` : ''}</div>`;
  }

  // Once the view is in the page: the plan line and the readiness card. Both are optional extras, never in the
  // critical path: if either fails the Home still works. stats: [[label, value, warn?]] shown inside the card.
  function attach(root, section, { stats = [], details } = {}) {
    const plan = root.querySelector('[data-sh-plan]'), stand = root.querySelector('[data-sh-stand]');
    const keep = last[section] ||= {};
    if (plan) Promise.resolve(window.NextUp?.banner(plan, section)).then(() => { if (plan.isConnected) keep.plan = plan.innerHTML; });
    if (stand) Promise.resolve(window.Readiness?.card(stand, section, { stats, details })).then(ok => {
      if (!stand.isConnected) return;
      if (ok) keep.stand = stand.innerHTML; else { keep.stand = ''; stand.remove(); }
    });
  }

  window.SectionHome = { html, attach, NAME };
})();
