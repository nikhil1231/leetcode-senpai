// The Tutor tab, where the app opens: what your tutor would do with you now (/api/tutor/home),
// one click from the conversation, and what it remembers about how you learn. A conversation left
// part-way through reopens by itself on the first visit. Without the model the tab steps aside
// for Today, so the daily loop never depends on it.
(function () {
  'use strict';
  const {api, escapeHtml: esc, toast} = window.H;
  let first = true;

  function open(pick) {
    window.Tutor?.queue({section: pick.section, lesson: pick.lesson, resume: pick.kind === 'resume'});
    window.AppSections?.select(pick.section, 'lesson/' + pick.lesson);
  }

  async function renderTutor() {
    const el = document.getElementById('tab-tutor');
    if (!el.childElementCount) el.innerHTML = '<p class="help tuh-loading">Finding where you are…</p>';
    let d;
    try { d = await api('/tutor/home'); } catch (e) { el.innerHTML = `<p class="help">${esc(e.message)}</p>`; return; }
    if (!d.enabled) { if (first) { first = false; window.App?.goTab('today'); return; } }
    const p = d.pick;
    if (first && p?.kind === 'resume') { first = false; open(p); }
    first = false;
    const label = {resume: 'Carry on', next: 'Start', pickup: 'Pick it up', course: 'Start'}[p?.kind] || 'Start';
    const eyebrow = {resume: 'Where you left off', next: 'Your tutor suggests', pickup: 'From your other tutor', course: 'Next in the course'}[p?.kind] || '';
    const known = [...new Set([...(d.notes || []).map(n => n.text), ...(d.style || [])])];
    el.innerHTML = `<section class="tuh">
      ${!d.enabled ? `<div class="tuh-pick"><span class="dc-eyebrow">Tutor offline</span><h2>The tutor needs a model</h2><p>No model is connected, so there's nobody to talk to yet. Everything else works as usual.</p>
        <div class="sd-actions"><button type="button" class="button is-primary" data-tuh="today">Today's plan</button></div></div>` : p ? `
      <div class="tuh-pick"><span class="dc-eyebrow">${esc(eyebrow)}</span><h2>${esc(p.title)}</h2>${p.why ? `<p>${esc(p.why)}</p>` : ''}
        <div class="sd-actions"><button type="button" class="button is-primary" data-tuh="go">${label}</button>
        <button type="button" class="button is-ghost" data-tuh="today">Today's plan</button></div></div>` : '<p class="help">Nothing in particular is waiting. Open any lesson and the tutor is there.</p>'}
      ${known.length ? `<details class="tuh-known"><summary>What your tutor knows about how you learn</summary><ul>${known.map(t => `<li><span>${esc(t)}</span>${(d.notes || []).some(n => n.text === t) ? `<button type="button" class="button is-ghost is-small" data-forget="${esc(t)}" aria-label="Forget this">Forget</button>` : ''}</li>`).join('')}</ul>
        <p class="help">The tutor adds to this as it gets to know you; the rest comes from your other tutor's notes.</p></details>` : ''}
    </section>`;
    el.querySelector('[data-tuh="go"]')?.addEventListener('click', () => open(p));
    el.querySelector('[data-tuh="today"]')?.addEventListener('click', () => window.App?.goTab('today'));
    el.querySelectorAll('[data-forget]').forEach(b => b.addEventListener('click', async () => {
      try { await api('/tutor/learner/forget', 'POST', {text: b.dataset.forget}); renderTutor(); } catch (e) { toast?.(e.message, 'error'); }
    }));
  }

  document.getElementById('btn-go-tutor')?.addEventListener('click', () => {
    window.AppSections?.leaveSection?.();
    window.App?.goTab('tutor');
  });
  document.getElementById('btn-go-settings')?.addEventListener('click', () => {
    window.AppSections?.leaveSection?.();
    window.App?.goTab('settings');
  });
  window.Views = window.Views || {};
  window.Views.renderTutor = renderTutor;
})();
