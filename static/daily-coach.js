// Senpai's daily reviews: process evidence against the plan, separate from each subject's answer tutor.
(function () {
  const { $, api, escapeHtml: esc, beginRender } = window.H;
  const App = window.App;
  let selectedDate = null;
  const drafts = new Map();
  let rendering = false;

  let generating = false;
  function prerequisites(data) {
    if (!data.target_job.trim()) return 'Add your career target (in Job Scout, or in Settings) to give Senpai a direction.';
    if (!data.model_enabled) return 'Senpai\'s model is unavailable. Configure OPENROUTER_API_KEY on the server; saved reviews remain available.';
    if (!data.enabled) return 'Automatic reviews are paused. You can still request a review below.';
    return `Automatic review at ${data.review_time} (${data.timezone}) for the previous completed day. The app server must be running; the browser can be closed.`;
  }

  async function mountSummary() {
    const box = $('#daily-coach-summary');
    if (!box) return;
    try {
      const data = await api('/coach/daily');
      if (!box.isConnected) return;
      const latest = data.reports[0];
      box.innerHTML = `<section class="dc-summary"><div><h2>Senpai</h2>
        <p>${esc(latest ? `${latest.date}${latest.partial ? ' · partial day' : ''}: ${latest.summary}` : prerequisites(data))}</p></div>
        <button class="button is-small" type="button">${latest ? 'Read review' : 'Open Senpai'}</button></section>`;
      box.querySelector('button').addEventListener('click', () => App.goTab('senpai'));
    } catch (error) {
      if (box.isConnected) {
        box.innerHTML = '<p class="help">Senpai could not load. <button class="button is-ghost is-small" type="button">Open Senpai</button></p>';
        box.querySelector('button').addEventListener('click', () => App.goTab('senpai'));
      }
    }
  }

  const citations = (ids) => `<span class="dc-citations">${(ids || []).map((id, i) =>
    `<button type="button" class="button is-ghost is-small" data-evidence="${esc(id)}" title="Show supporting activity ${esc(id)}">Evidence ${i + 1}</button>`).join('')}</span>`;

  function observations(title, rows) {
    if (!rows?.length) return '';
    return `<section class="dc-panel"><h3>${title}</h3><ul class="dc-observations">${rows.map((r) =>
      `<li><span class="dc-confidence">${r.confidence === 'tentative' ? 'Tentative interpretation' : 'Observed'}</span>
      <p>${esc(r.text)}</p>${citations(r.evidence_ids)}</li>`).join('')}</ul></section>`;
  }

  function reportHtml(report, currentGoal) {
    const key = `${report.timezone}:${report.date}`;
    const feedback = report.feedback || { status: 'pending', note: '' };
    const draft = drafts.get(key) ?? feedback.note;
    const adjustment = report.adjustment;
    return `<article class="dc-report">
      <header class="dc-report-head"><div><span class="dc-eyebrow">${esc(report.date)} · ${esc(report.timezone)}${report.partial ? ' · Partial-day preview' : ''}</span>
        <h2>Daily review</h2><p class="dc-review-summary">${esc(report.summary)}</p></div><p class="help">Generated ${esc(new Date(report.generated_at * 1000).toLocaleString())}</p></header>
      <details class="dc-goal"><summary>Career target used for this review${report.target_job !== currentGoal ? ' (your saved goal has since changed)' : ''}</summary><p>${esc(report.target_job)}</p></details>
      <section class="dc-panel"><h3>What you practised</h3><p>${esc(report.practiced)}</p></section>
      <div class="dc-columns">${observations('What it noticed', report.observations)}${observations('Keep doing', report.keep_doing)}</div>
      <section class="dc-panel dc-adjustment"><span class="dc-eyebrow">One adjustment</span>
        ${adjustment ? `<h3>${esc(adjustment.action)}</h3><p>${esc(adjustment.rationale)}</p>${citations(adjustment.evidence_ids)}` : '<h3>No change recommended</h3><p>The available evidence does not justify an adjustment today.</p>'}
        <h3>Next session</h3><p>${esc(report.tomorrow)}</p>
      </section>
      ${report.curriculum_suggestions?.length ? `<section class="dc-panel"><h3>Curriculum ideas</h3><p class="help">Suggestions only. Plan changes go through Senpai's limits and approvals.</p><ul>${report.curriculum_suggestions.map((s) =>
        `<li><b>${esc(s.change)}</b><p>${esc(s.rationale)}</p>${citations(s.evidence_ids)}</li>`).join('')}</ul></section>` : ''}
      <section class="dc-panel"><h3>Make Senpai more useful</h3>
        ${report.reflection_question ? `<p>${esc(report.reflection_question)}</p>` : ''}
        <label for="dc-note">Reflection or correction (optional)</label><textarea id="dc-note" class="input" rows="3" maxlength="2000" placeholder="Context the activity log missed, or whether this advice helped…">${esc(draft)}</textarea>
        <p class="help">Feedback informs future reviews and the advice follow-through above. Plan changes Senpai made or proposed are listed in the decision history.</p>
        <div class="dc-actions"><button type="button" class="button${feedback.status === 'accepted' ? ' is-primary' : ''}" data-feedback="accepted">I’ll try this</button>
          <button type="button" class="button${feedback.status === 'dismissed' ? ' is-primary' : ''}" data-feedback="dismissed">Not useful</button>
          <button type="button" class="button is-ghost" data-feedback="pending">Save reflection only</button></div>
        <p class="help" id="dc-feedback-status" role="status">${feedback.status === 'pending' ? (feedback.note ? 'Reflection saved.' : '') : feedback.status === 'accepted' ? 'Marked as an experiment to try. Curriculum unchanged.' : 'Marked not useful; future reviews will receive this feedback.'}</p>
      </section>
      <details class="dc-panel"><summary>Coverage and uncertainty</summary><ul>${(report.limitations || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>
      <details class="dc-panel" id="dc-evidence"><summary>Supporting activity · includes preceding days for trend context</summary>
        <div class="dc-evidence-list">${(report.evidence || []).map((e) => {
          const { id, title, subject, at, activity, ...process } = e;
          return `<details data-event-id="${esc(id)}"><summary><span>${esc(subject)}</span> · ${esc(title)} · ${esc(new Date(at * 1000).toLocaleString(undefined, { timeZone: report.timezone }))}</summary>
            <p>${esc(activity)}</p><dl>${Object.entries(process).map(([k, v]) => `<div><dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</dd></div>`).join('')}</dl><p class="help">Source: ${esc(id)}</p></details>`;
        }).join('')}</div></details>
    </article>`;
  }

  let host = null;
  async function renderCoach(target) {
    if (target) host = target;
    if (rendering || generating || !host?.isConnected) return;
    rendering = true;
    const el = host;
    try {
      if (!el.childElementCount) beginRender(el, 'Loading your learning review…');
      const data = await api('/coach/daily');
      const reports = new Map(data.reports.map((r) => [r.date, r]));
      selectedDate = selectedDate || data.reports[0]?.date || data.eligible_date;
      let report = reports.get(selectedDate);
      el.innerHTML = `<p class="help">${esc(prerequisites(data))} <button type="button" class="button is-ghost is-small" id="dc-settings">Schedule</button></p>
        <div class="dc-toolbar"><label for="dc-date">Review day <input id="dc-date" class="input" type="date" max="${esc(data.today)}" value="${esc(selectedDate)}"></label>
          <button class="button is-primary" id="dc-generate" type="button"${!data.target_job.trim() || !data.model_enabled ? ' disabled' : ''}>Review selected day</button>
          <button class="button is-ghost${report ? '' : ' hidden'}" id="dc-regenerate" type="button"${!data.target_job.trim() || !data.model_enabled ? ' disabled' : ''}>Regenerate</button>
          <button class="button is-ghost" id="dc-refresh" type="button">Refresh</button></div>
        <p class="help">Today produces a labelled partial-day preview; the scheduled review finalises it after the day ends. Regeneration uses the current career target.</p>
        <nav class="dc-history" aria-label="Recent daily reviews">${data.reports.map((r) => `<button type="button" class="button is-small${r.date === selectedDate ? ' is-primary' : ' is-ghost'}" data-review-date="${esc(r.date)}">${esc(r.date)}${r.partial ? ' · preview' : ''}</button>`).join('')}</nav>
        <p id="dc-status" class="dc-status" role="status" aria-live="polite">${esc(data.status?.state === 'unavailable' ? data.status.message : '')}</p>
        <div id="dc-report">${report ? reportHtml(report, data.target_job) : '<div class="dc-panel"><h3>No saved review for this day</h3><p>Choose a day with recorded activity and request a review. Empty days do not receive invented advice.</p></div>'}</div>`;
      $('#dc-settings').addEventListener('click', () => App.goTab('settings'));
      $('#dc-refresh').addEventListener('click', () => renderCoach());
      $('#dc-date').addEventListener('change', () => { selectedDate = $('#dc-date').value || data.eligible_date; renderCoach(); });
      el.querySelectorAll('[data-review-date]').forEach((b) => b.addEventListener('click', () => { selectedDate = b.dataset.reviewDate; renderCoach(); }));
      const bindReport = () => {
        if (!report) return;
        const key = `${report.timezone}:${report.date}`;
        $('#dc-note').addEventListener('input', () => drafts.set(key, $('#dc-note').value));
        el.querySelectorAll('[data-evidence]').forEach((b) => b.addEventListener('click', () => {
          const target = Array.from(el.querySelectorAll('[data-event-id]')).find((node) => node.dataset.eventId === b.dataset.evidence);
          if (!target) return;
          $('#dc-evidence').open = true;
          target.open = true;
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }));
        el.querySelectorAll('[data-feedback]').forEach((b) => b.addEventListener('click', async () => {
          const buttons = el.querySelectorAll('[data-feedback]');
          buttons.forEach((button) => { button.disabled = true; });
          const status = $('#dc-feedback-status');
          status.textContent = 'Saving…';
          try {
            const saved = await api(`/coach/daily/${encodeURIComponent(report.date)}/feedback`, 'POST', {
              timezone: report.timezone, status: b.dataset.feedback, note: $('#dc-note').value,
            });
            report = saved.report;
            drafts.delete(key);
            $('#dc-report').innerHTML = reportHtml(report, data.target_job);
            bindReport();
          } catch (e) {
            status.textContent = e.message;
            buttons.forEach((button) => { button.disabled = false; });
          }
        }));
      };
      bindReport();
      const generate = async (force) => {
        const status = $('#dc-status');
        const reportBox = $('#dc-report');
        const date = selectedDate;
        const controls = Array.from(el.querySelectorAll('.dc-toolbar input, .dc-toolbar button, [data-review-date]'));
        controls.forEach((control) => { control.disabled = true; });
        generating = true;
        status.textContent = 'Reviewing your practice process…';
        try {
          const result = await api('/coach/daily', 'POST', { date, force });
          if (!reportBox.isConnected) return;
          report = result.report;
          reportBox.innerHTML = reportHtml(report, data.target_job);
          $('#dc-regenerate').classList.remove('hidden');
          bindReport();
          status.textContent = report.partial ? 'Partial-day preview saved.' : 'Daily review saved.';
        } catch (e) {
          status.textContent = e.message;
        } finally {
          controls.forEach((control) => { control.disabled = false; });
          generating = false;
        }
      };
      $('#dc-generate').addEventListener('click', () => generate(false));
      $('#dc-regenerate').addEventListener('click', () => generate(true));
    } catch (error) {
      el.innerHTML = `<div class="dc-panel"><h2>Daily reviews could not load</h2><p>${esc(error.message)}</p><button class="button" id="dc-retry" type="button">Retry</button></div>`;
      $('#dc-retry').addEventListener('click', () => renderCoach());
    } finally {
      rendering = false;
    }
  }

  window.Views.renderCoach = renderCoach;
  window.DailyCoach = { mountSummary };
  const refresh = () => {
    if (document.visibilityState !== 'visible' || $('#app').classList.contains('hidden')) return;
    const tab = App.currentActiveTab();
    if (tab === 'senpai' || tab === 'today') App.render(tab).catch(() => {});
  };
  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 60000);
})();
