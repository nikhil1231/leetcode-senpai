// The tutor's page, under Overview (#/readiness/tutor): what your tutor would do with you now (/api/tutor/home),
// one click from the conversation, and what it remembers about how you learn. Overview's Home shows the same
// pick as one line (Views.tutorLine). Without the model the page says so and points at the plan; nothing else
// depends on it.
(function () {
  'use strict';
  const {api, escapeHtml: esc, toast} = window.H;
  const LABEL = {resume: 'Carry on', next: 'Start', pickup: 'Pick it up', course: 'Start'};
  const EYEBROW = {resume: 'Where you left off', next: 'Your tutor suggests', pickup: 'From your other tutor', course: 'Next in the course'};
  const SECTION = {'system-design': 'System Design', fundamentals: 'Fundamentals', ai: 'AI Engineering'};

  function open(pick) {
    window.Tutor?.queue({section: pick.section, lesson: pick.lesson, resume: pick.kind === 'resume'});
    window.AppSections?.select(pick.section, 'lesson/' + pick.lesson);
  }

  async function page(ctx) {
    const d = await api('/tutor/home');
    if (ctx.stale()) return;
    const p = d.pick;
    const known = [...new Set([...(d.notes || []).map(n => n.text), ...(d.style || [])])];
    ctx.root.innerHTML = `<section class="tuh">
      <div class="sd-page-intro"><span class="sd-eyebrow">OVERVIEW · TUTOR</span><h2 id="sd-heading" tabindex="-1">Learn it by talking it through.</h2>
        <p>The tutor teaches inside any System Design, Fundamentals or AI lesson. Here is where it would start with you now, and what it has learned about how you learn.</p></div>
      ${!d.enabled ? `<div class="tuh-pick"><span class="dc-eyebrow">Tutor offline</span><h2>The tutor needs a model</h2><p>No model is connected, so there's nobody to talk to yet. Every lesson, check and review works as usual.</p>
        <div class="sd-actions"><button type="button" class="button is-primary" data-tuh="overview">Back to Overview</button></div></div>` : p ? `
      <div class="tuh-pick"><span class="dc-eyebrow">${esc(EYEBROW[p.kind] || 'Your tutor suggests')}${SECTION[p.section] ? ' · ' + SECTION[p.section] : ''}</span><h2>${esc(p.title)}</h2>${p.why ? `<p>${esc(p.why)}</p>` : ''}
        <div class="sd-actions"><button type="button" class="button is-primary" data-tuh="go">${LABEL[p.kind] || 'Start'}</button></div></div>` : '<p class="help">Nothing in particular is waiting. Open any lesson and the tutor is there.</p>'}
      ${known.length ? `<section class="tuh-known"><h3>What your tutor knows about how you learn</h3><ul>${known.map(t => `<li><span>${esc(t)}</span>${(d.notes || []).some(n => n.text === t) ? `<button type="button" class="button is-ghost is-small" data-forget="${esc(t)}" aria-label="Forget this">Forget</button>` : ''}</li>`).join('')}</ul>
        <p class="help">The tutor adds to this as it gets to know you; the rest comes from your other tutor's notes.</p></section>` : ''}
    </section>`;
    ctx.root.querySelector('[data-tuh="go"]')?.addEventListener('click', () => open(p));
    ctx.root.querySelector('[data-tuh="overview"]')?.addEventListener('click', () => window.AppSections.select('readiness'));
    ctx.root.querySelectorAll('[data-forget]').forEach(b => b.addEventListener('click', async () => {
      try { await api('/tutor/learner/forget', 'POST', {text: b.dataset.forget}); window.AppSections.select('readiness', 'tutor'); } catch (e) { toast?.(e.message, 'error'); }
    }));
  }

  // One line on Overview's Home: the tutor's pick, when the model is on and there is one.
  async function line(el) {
    if (!el) return;
    try {
      const d = await api('/tutor/home');
      if (!el.isConnected || !d.enabled || !d.pick) return;
      const p = d.pick;
      el.innerHTML = `<div class="rd-tutor"><span class="dc-eyebrow">${esc(EYEBROW[p.kind] || 'Your tutor suggests')}</span><b>${esc(p.title)}</b>${SECTION[p.section] ? `<span class="sd-muted">${SECTION[p.section]}</span>` : ''}
        <button type="button" class="button is-small" data-tuh="go">${LABEL[p.kind] || 'Start'}</button><button type="button" class="rd-link is-quiet" data-tuh="page">The tutor →</button></div>`;
      el.querySelector('[data-tuh="go"]').addEventListener('click', () => open(p));
      el.querySelector('[data-tuh="page"]').addEventListener('click', () => window.AppSections.select('readiness', 'tutor'));
    } catch (e) { /* the tutor is never in the critical path */ }
  }

  document.getElementById('btn-go-tutor')?.addEventListener('click', () => window.AppSections?.select('readiness', 'tutor'));
  document.getElementById('btn-go-settings')?.addEventListener('click', () => {
    window.AppSections?.leaveSection?.();
    window.App?.goTab('settings');
  });
  window.Tracks?.register('readiness', {tutor: page});
  window.TutorHome = {line, page};
})();
