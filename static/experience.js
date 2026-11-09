// Experience: story bank (drafted from Job Scout CV evidence), timed behavioural answers with a
// STAR self-check, deep-dive packs, and probing questions on individual CV claims.
(function () {
  'use strict';
  const T = window.Tracks;
  const { esc, md, inline, btn, when, wireActions } = T;
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  let pending = null;   // CV claim handed from one view to the next (refs aren't URL-safe)

  const chips = (ids, comps) => ids.map(id => `<span class="tr-tag">${esc(comps.find(c => c.id === id)?.title || id)}</span>`).join('');
  const STATUS_LABEL = { solid: 'Solid', learning: 'Learning', fading: 'Fading', shaky: 'Missed last time', unseen: 'Not tried' };
  const statusDot = s => `<span class="tr-dot is-${s}" role="img" aria-label="${STATUS_LABEL[s] || s}" title="${STATUS_LABEL[s] || s}"></span>`;
  const isHeld = s => s === 'solid' || s === 'learning';
  const STAR = ['situation', 'task', 'action', 'result', 'reflection'];
  const starFill = st => STAR.filter(k => (st[k] || '').trim());
  const wordCount = t => (String(t).trim().match(/\S+/g) || []).length;
  const aloud = words => fmt(Math.round(words / 2.2));          // about 130 words a minute
  const shorten = (t, n = 64) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
  // The tally of answers in this sitting (reset after half an hour away), so a run of prompts has a visible score.
  let session = { n: 0, clean: 0, at: 0 };
  const tally = clean => {
    if (Date.now() - session.at > 30 * 60 * 1000) session = { n: 0, clean: 0, at: 0 };
    session = { n: session.n + 1, clean: session.clean + (clean ? 1 : 0), at: Date.now() };
  };

  async function overview(ctx) { const d = await ctx.call(''); return ctx.stale() ? null : d; }

  // ---------- overview ----------
  const firstOpenDive = d => { for (const p of d.packs) { const q = p.questions.find(x => !isHeld(x.status)); if (q) return { pack: p, q }; } return null; };
  function stepsHtml(d) {
    const drilled = d.recent_drills.length > 0 || d.prompts.some(p => p.status !== 'unseen');
    const dived = d.packs.some(p => p.questions.some(q => q.status !== 'unseen'));
    const steps = [[d.stories.length > 0, 'Write one story', 'Your real project, in your own words. Everything else builds on it.', btn(d.stories.length ? 'Open the story bank' : 'Write a story', d.stories.length ? 'go' : 'new-story', d.stories.length ? 'data-view="stories"' : '', !d.stories.length)],
      [drilled, 'Answer one prompt out loud', 'Timed, then a STAR self-check. It is the closest thing here to the real round.', btn('Start a timed answer', 'go', 'data-view="drill"', d.stories.length > 0 && !drilled)],
      [dived, 'Try one deep dive', 'The follow-ups interviewers ask about your own work.', btn('Open deep dives', 'go', 'data-view="dives"')]];
    if (steps.every(x => x[0])) return '';
    return `<section class="sd-panel tr-steps"><span class="sd-eyebrow">GETTING STARTED · ${steps.filter(x => x[0]).length} OF 3</span><ol>${steps.map(([done, title, why, action]) => `<li class="${done ? 'is-done' : ''}"><span class="tr-step-mark" aria-hidden="true">${done ? '✓' : ''}</span><div><b>${title}${done ? ' <span class="sd-muted">· done</span>' : ''}</b><p class="sd-muted">${why}</p></div>${done ? '' : action}</li>`).join('')}</ol></section>`;
  }
  function coverageHtml(d) {
    const rows = [...d.coverage].sort((a, b) => (!!a.stories.length - !!b.stories.length) || ((a.held / (a.prompts || 1)) - (b.held / (b.prompts || 1))));
    return `<section class="tr-cat"><div class="tr-cat-head"><h3>Competency coverage</h3><p class="sd-muted">Every behavioural question tests one or two of these. A gap is a question you would have to improvise. Gaps first.</p></div>
      <ul class="tr-comps">${rows.map(c => `<li class="tr-comp-tile ${c.stories.length ? '' : 'is-gap'}"><div class="tr-comp-top"><b>${esc(c.title)}</b><span class="tr-tag ${c.stories.length ? '' : 'is-warn'}">${c.stories.length ? `${c.stories.length} stor${c.stories.length === 1 ? 'y' : 'ies'}` : 'no story'}</span></div>
        <p class="sd-muted">${esc(c.blurb)}</p><div class="tr-comp-foot"><span class="tr-comp-held" role="img" aria-label="${c.held} of ${c.prompts} prompts held"><i style="width:${c.prompts ? 100 * c.held / c.prompts : 0}%"></i></span><small>${c.held}/${c.prompts} prompts held</small>${c.stories.length ? '' : btn('Write one', 'new-story', `data-comp="${c.id}"`)}</div></li>`).join('')}</ul></section>`;
  }
  function recentHtml(d) {
    if (!d.recent_drills.length) return '';
    const by = Object.fromEntries(d.prompts.map(p => [p.id, p]));
    return `<section class="sd-panel tr-recent"><h3>Recent timed answers</h3><ul>${d.recent_drills.slice(0, 5).map(r => `<li><span class="tr-dot is-${r.clean ? 'solid' : 'shaky'}" role="img" aria-label="${r.clean ? 'Clean' : 'Not clean'}"></span><span>${esc(shorten(by[r.prompt_id]?.text || 'A prompt', 70))}</span><em>${fmt(r.seconds)}</em><small>${when(r.at)}</small></li>`).join('')}</ul></section>`;
  }
  function home(ctx) {
    return overview(ctx).then(d => {
      if (!d) return;
      const nextP = d.prompts.find(p => p.id === d.next_prompt);
      const gaps = d.coverage.filter(c => !c.stories.length);
      const dive = firstOpenDive(d);
      const hero = !d.stories.length
        ? `<span class="sd-eyebrow">START HERE</span><h3>Write your first story</h3><p class="sd-muted">One real project, as you would say it: the situation, what <b>you</b> did, and a measured result. ${d.cv.available ? 'Your CV evidence below can draft it for you.' : 'You can write it by hand.'}</p>${btn('Write a story', 'new-story', '', true)}`
        : `<span class="sd-eyebrow">PRACTISE OUT LOUD</span><h3>${esc(nextP.text)}</h3><p class="sd-muted">A timed answer, then a STAR self-check${d.llm ? ' and coach feedback if you type or dictate it' : ''}. Aim for ${fmt(d.target_seconds[0])} to ${fmt(d.target_seconds[1])}.</p>${btn('Start a timed answer', 'go', 'data-view="drill"', true)}`;
      ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">EXPERIENCE</span><h2>${esc(d.track.blurb)}</h2></div>
        <div id="rd-strip"></div>
        ${T.knowledgeHtml(d, 'answers and deep dives you could give well today')}
        <section class="sd-panel tr-hero">${hero}</section>
        ${stepsHtml(d)}
        <div class="tr-next-grid is-two">
          <section class="sd-panel tr-next"><span class="sd-eyebrow">STORY BANK</span><h3>${d.stories.length} stor${d.stories.length === 1 ? 'y' : 'ies'} · ${gaps.length ? `${gaps.length} competenc${gaps.length === 1 ? 'y' : 'ies'} uncovered` : 'every competency covered'}</h3><p class="sd-muted">Aim for two stories per competency. Each story can answer several prompts.</p>${btn('Open the story bank', 'go', 'data-view="stories"')}</section>
          <section class="sd-panel tr-next"><span class="sd-eyebrow">DEEP DIVES</span><h3>${dive ? esc(shorten(dive.q.prompt, 90)) : 'Every deep dive is held'}</h3><p class="sd-muted">${dive ? `Next in ${esc(dive.pack.title)}. Interviewers drill into what is on your CV, so practise the follow-ups before they ask.` : 'They come back as they fade.'}</p>${btn(dive ? 'Answer it' : 'Open deep dives', dive ? 'dive' : 'go', dive ? `data-id="${dive.q.id}"` : 'data-view="dives"')}</section>
        </div>
        ${coverageHtml(d)}
        ${recentHtml(d)}
        ${cvHtml(d, 4)}`;
      window.Readiness?.strip(ctx.root.querySelector('#rd-strip'), 'experience');
      wireActions(ctx.root, handlers(ctx, d));
    });
  }
  function cvHtml(d, limit = 6) {
    const cv = d.cv;
    if (!cv.available) return `<section class="sd-panel"><h3>From your CV</h3><p class="sd-muted">Job Scout's career context isn't available here (it syncs weekly on the server). You can still write stories by hand.</p></section>`;
    return `<section class="sd-panel"><h3>From your CV <span class="sd-muted">· via Job Scout${cv.fetched_at ? ', synced ' + when(cv.fetched_at) : ''}</span></h3>
      <p class="sd-muted">The evidence employers' roles cite most. Turn each into a story, then let the interviewer probe it.</p>
      <ul class="tr-list">${cv.claims.slice(0, limit).map((c, i) => `<li class="tr-claim"><div><span class="sd-eyebrow">CITED BY ${c.cited_by_roles} ROLES</span><p>${esc(c.excerpt)}…</p></div><div class="tr-claim-actions">${c.story_id ? btn('Open story', 'story', `data-id="${c.story_id}"`) : btn('Draft a story', 'draft', `data-i="${i}"`)}${btn('Probe it', 'probe', `data-i="${i}"`)}</div></li>`).join('')}</ul>
      ${cv.topics.length ? `<h4 class="tr-sub">Topics you marked in Job Scout</h4><ul class="tr-topic-list">${cv.topics.map(t => `<li><span>${esc(t.topic)}</span><span class="tr-tag ${t.state === 'Needs work' ? 'is-warn' : ''}">${esc(t.state || '')}${t.focus ? ' · ' + esc(t.focus) : ''}</span>${t.pack ? btn('Practise', 'pack', `data-pack="${t.pack}"`) : ''}</li>`).join('')}</ul>` : ''}</section>`;
  }
  function handlers(ctx, d) {
    return {
      go: n => ctx.go(n.dataset.view),
      story: n => ctx.go('story/' + n.dataset.id),
      'new-story': n => { pending = { competencies: n.dataset.comp ? [n.dataset.comp] : [] }; ctx.go('story/new'); },
      draft: n => { const c = d.cv.claims[+n.dataset.i]; pending = { ref: c.ref, excerpt: c.excerpt, draft: true }; ctx.go('story/new'); },
      probe: n => { const c = d.cv.claims[+n.dataset.i]; pending = { ref: c.ref, excerpt: c.excerpt }; ctx.go('claim'); },
      pack: n => { ctx.go('dives'); setTimeout(() => document.getElementById('pack-' + n.dataset.pack)?.scrollIntoView({ behavior: 'smooth' }), 300); },
      dive: n => ctx.go('dive/' + n.dataset.id),
      drill: n => ctx.go('drill/' + n.dataset.id),
    };
  }

  // ---------- story bank ----------
  async function stories(ctx) {
    const d = await overview(ctx); if (!d) return;
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">STORY BANK · ${d.stories.length}</span><h2>Your stories</h2><p>Write each as you would say it: a short situation, <b>your</b> actions and reasoning, a measured result, and what you learned. Keep them true: interviewers probe.</p></div>
      <div class="sd-actions">${btn('New story', 'new-story', '', true)}</div>
      ${d.stories.length ? `<div class="tr-story-grid">${d.stories.map(s => `<button type="button" class="sd-lesson-card tr-story-card" data-t="story" data-id="${s.id}"><span class="sd-eyebrow">${s.drills ? `PRACTISED ${s.drills}× · LAST ${when(s.last_drilled).toUpperCase()}` : 'NOT PRACTISED YET'}</span><h3>${esc(s.title)}</h3><div>${chips(s.competencies || [], d.competencies)}</div><div class="tr-star"><span class="tr-star-dots" aria-hidden="true">${STAR.map(k => `<i class="${(s[k] || '').trim() ? 'is-on' : ''}"></i>`).join('')}</span><span>${starFill(s).length} of 5 parts written${(s.result || '').trim() && !/\d/.test(s.result) ? ' · the result has no number' : ''}</span></div><span><span>${s.result ? esc(s.result.slice(0, 80)) : '<i>No result written yet</i>'}</span><span>Edit →</span></span></button>`).join('')}</div>`
        : `<section class="sd-panel"><h3>No stories yet</h3><p class="sd-muted">Start from your CV below: each draft uses only what the evidence says, and marks the numbers and details you must fill in.</p></section>`}
      ${cvHtml(d, 12)}`;
    wireActions(ctx.root, handlers(ctx, d));
  }

  async function story(ctx) {
    const d = await overview(ctx); if (!d) return;
    const isNew = ctx.arg === 'new';
    const s = isNew ? { title: '', competencies: [], situation: '', task: '', action: '', result: '', reflection: '', ...(pending ? { source_ref: pending.ref, source_excerpt: pending.excerpt, competencies: pending.competencies || [] } : {}) } : d.stories.find(x => x.id === ctx.arg);
    const autoDraft = isNew && pending?.draft;
    pending = null;
    if (!s) throw new Error('That story was not found.');
    const field = (k, label, hint, rows) => `<label class="tr-field"><span>${label}</span><small>${hint}</small><textarea class="textarea" data-f="${k}" rows="${rows}" maxlength="3000">${esc(s[k] || '')}</textarea></label>`;
    ctx.root.innerHTML = `<div class="sd-breadcrumb">${btn('← Story bank', 'go', 'data-view="stories"')}</div>
      <div class="sd-page-intro"><span class="sd-eyebrow">${isNew ? 'NEW STORY' : 'EDIT STORY'}</span><h2>${isNew ? 'Write a story' : esc(s.title)}</h2></div>
      <div class="tr-two"><section class="sd-panel tr-story-form">
        <label class="tr-field"><span>Title</span><small>A short name you'll recognise, such as "ZooKeeper 3.8 upgrade".</small><input class="input" data-f="title" maxlength="120" value="${esc(s.title)}"></label>
        <div class="tr-field"><span>Competencies it shows</span><small>Pick one to three. Each prompt asks for specific ones.</small><div class="tr-comp-pick">${d.competencies.map(c => `<label class="tr-comp"><input type="checkbox" data-comp value="${c.id}" ${s.competencies.includes(c.id) ? 'checked' : ''}> ${esc(c.title)}</label>`).join('')}</div></div>
        ${field('situation', 'Situation', 'Context in two sentences: where, what system, why it mattered.', 3)}
        ${field('task', 'Task', 'What you were responsible for, or the problem to solve.', 2)}
        ${field('action', 'Action', 'What <b>you</b> did and why: decisions, alternatives, how you handled resistance.', 6)}
        ${field('result', 'Result', 'The outcome, with numbers: latency, incidents, time saved, users.', 3)}
        ${field('reflection', 'Reflection', 'What you learned, or would do differently.', 2)}
        <div class="tr-gaps" hidden></div>
        <div class="sd-actions">${btn(isNew ? 'Save story' : 'Save changes', 'save', '', true)}${btn('Save and practise', 'practise')}${!isNew ? btn('Archive', 'archive') : ''}<span class="sd-muted tr-hint-keys">Ctrl+S saves</span></div>
      </section>
      <aside class="tr-aside"><section class="sd-panel tr-health" aria-live="polite"><span class="sd-eyebrow">STORY HEALTH</span><ul></ul><p class="tr-health-foot sd-muted"></p></section>${s.source_excerpt ? `<section class="sd-panel"><span class="sd-eyebrow">CV EVIDENCE</span><p class="tr-quote">${esc(s.source_excerpt)}</p>${btn(d.llm ? 'Draft STAR from this' : 'Copy into Situation', 'draft-it')}<p class="sd-muted">${d.llm ? 'The draft uses only what the evidence says, and puts [placeholders] where you must add facts.' : 'The model is off, so the evidence is copied for you to rewrite.'}</p></section>` : ''}
        <section class="sd-panel"><span class="sd-eyebrow">WHAT INTERVIEWERS PROBE</span><ul class="tr-plain">${d.probes.slice(0, 5).map(p => `<li>${esc(p)}</li>`).join('')}</ul></section></aside></div>`;
    const get = () => {
      const out = { competencies: [...ctx.root.querySelectorAll('[data-comp]:checked')].map(n => n.value) };
      ctx.root.querySelectorAll('[data-f]').forEach(n => { out[n.dataset.f] = n.value.trim(); });
      return out;
    };
    // A live read of what the story still needs, from what is typed (no model involved).
    function refreshHealth() {
      const v = get(), box = ctx.root.querySelector('.tr-health');
      const first = (v.action.match(/\bI\b/g) || []).length;
      const checks = [[!!v.title, 'A title you will recognise'], [v.competencies.length >= 1 && v.competencies.length <= 3, 'One to three competencies picked'],
        [wordCount(v.situation) > 0 && wordCount(v.situation) <= 70, 'A short situation (under about 70 words)'], [first >= 2, 'Action in the first person: say "I" at least twice'],
        [/\d/.test(v.result), 'A result with a number in it'], [wordCount(v.reflection) > 0, 'A reflection: what you learned or would change']];
      box.querySelector('ul').innerHTML = checks.map(([ok, text]) => `<li class="${ok ? 'is-ok' : ''}"><span aria-hidden="true">${ok ? '✓' : '○'}</span>${text}</li>`).join('');
      const words = ['situation', 'task', 'action', 'result', 'reflection'].reduce((n, k) => n + wordCount(v[k]), 0);
      const unlocks = d.prompts.filter(p => p.competencies.some(c => v.competencies.includes(c))).length;
      box.querySelector('.tr-health-foot').textContent = `${words ? `About ${aloud(words)} spoken (aim for ${fmt(d.target_seconds[0])} to ${fmt(d.target_seconds[1])}). ` : ''}${v.competencies.length ? `Answers ${unlocks} of ${d.prompts.length} prompts.` : ''}`;
    }
    async function draftIt() {
      const b = ctx.root.querySelector('[data-t=draft-it]'); if (b) { b.disabled = true; b.textContent = 'Drafting…'; }
      const res = await ctx.call('/draft', 'POST', { excerpt: s.source_excerpt, competencies: get().competencies });
      if (ctx.stale()) return;
      for (const k of ['title', 'situation', 'task', 'action', 'result', 'reflection']) {
        const el = ctx.root.querySelector(`[data-f="${k}"]`);
        if (el && res.draft[k] && !el.value.trim()) el.value = res.draft[k];
      }
      const gaps = ctx.root.querySelector('.tr-gaps');
      if (res.draft.gaps?.length || res.message) {
        gaps.hidden = false;
        gaps.innerHTML = `${res.message ? `<p class="sd-muted">${esc(res.message)}</p>` : ''}${res.draft.gaps?.length ? `<b>Fill these in before you use it:</b><ul>${res.draft.gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}`;
      }
      if (b) { b.disabled = false; b.textContent = d.llm ? 'Draft again into empty fields' : 'Copy into Situation'; }
      refreshHealth();
    }
    async function save(next = 'stories') {
      const body = { ...get(), source_ref: s.source_ref || null, source_excerpt: s.source_excerpt || null };
      if (!body.title) { window.H.toast?.('Give the story a title'); ctx.root.querySelector('[data-f=title]')?.focus(); return; }
      if (isNew) await ctx.call('/stories', 'POST', body);
      else await ctx.call('/stories/' + s.id, 'PUT', { ...body, revision: s.revision });
      window.H.toast?.('Story saved'); ctx.go(next);
    }
    ctx.root.addEventListener('input', refreshHealth); ctx.root.addEventListener('change', refreshHealth);
    ctx.root.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save().catch(err => window.H.toast?.(err.message, 'error')); } });
    refreshHealth();
    wireActions(ctx.root, {
      go: n => ctx.go(n.dataset.view),
      'draft-it': draftIt,
      save: () => save(),
      archive: async () => { if (!confirm('Archive this story? Its practice history is kept.')) return; await ctx.call(`/stories/${s.id}/archive`, 'POST', {}); ctx.go('stories'); },
      practise: () => save('drill'),
    });
    if (autoDraft && d.llm) draftIt().catch(e => window.H.toast?.(e.message, 'error'));
    else if (autoDraft) { ctx.root.querySelector('[data-f=situation]').value ||= s.source_excerpt; refreshHealth(); }
  }

  // ---------- timed answers ----------
  async function drill(ctx) {
    const [d, next] = await Promise.all([overview(ctx), ctx.call('/drill/next', 'POST', { exclude: [], prompt_id: ctx.arg || null })]);
    if (!d) return;
    const p = next.prompt;
    const suggested = next.stories;
    let storyId = suggested[0] || '', timer = null, started = 0, seconds = 0;
    const [lo, hi] = d.target_seconds;
    ctx.onLeave(() => clearInterval(timer));
    const storyOptions = () => d.stories.length
      ? `<div class="tr-story-pick">${[...suggested.map(id => d.stories.find(s => s.id === id)), ...d.stories.filter(s => !suggested.includes(s.id))].filter(Boolean).map(s => `<label class="tr-pick ${suggested.includes(s.id) ? 'is-suggested' : ''}"><input type="radio" name="story" value="${s.id}" ${s.id === storyId ? 'checked' : ''}> <span><b>${esc(s.title)}</b> ${chips(s.competencies || [], d.competencies)}</span></label>`).join('')}<label class="tr-pick"><input type="radio" name="story" value="" ${storyId ? '' : 'checked'}> <span>No story, improvise</span></label></div>`
      : `<p class="sd-muted">You have no stories yet. Improvise this one, then write it up in the story bank.</p>`;
    function stagePrep() {
      ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">TIMED ANSWER · ${chips(p.competencies, d.competencies)}</span><h2>“${esc(p.text)}”</h2><p>Answer out loud, as you would in the interview. Aim for ${fmt(lo)} to ${fmt(hi)}.</p></div>
        <div class="tr-two"><section class="sd-panel"><h3>Which story will you tell?</h3>${storyOptions()}<div class="sd-actions">${btn('Start the clock', 'start', '', true)}${btn('Skip this prompt', 'skip')}</div></section>
        <aside class="tr-aside"><section class="sd-panel"><span class="sd-eyebrow">WHAT A STRONG ANSWER SHOWS</span><p>${esc(p.signals)}</p></section><section class="sd-panel tr-story-peek" hidden></section></aside></div>`;
      const peek = () => {
        const s = d.stories.find(x => x.id === storyId), box = ctx.root.querySelector('.tr-story-peek');
        box.hidden = !s; if (!s) return;
        box.innerHTML = `<span class="sd-eyebrow">YOUR NOTES (HIDDEN WHILE YOU ANSWER)</span><h4>${esc(s.title)}</h4>${['situation', 'task', 'action', 'result', 'reflection'].filter(k => s[k]).map(k => `<p><b>${k[0].toUpperCase() + k.slice(1)}:</b> ${esc(s[k])}</p>`).join('')}`;
      };
      ctx.root.querySelectorAll('[name=story]').forEach(n => n.addEventListener('change', () => { storyId = n.value; peek(); }));
      peek();
      ctx.root.querySelector('[data-t=start]')?.focus({ preventScroll: true });
    }
    let answering = false;
    const ZONES = [['Keep going: a little short so far', 'is-short'], ['In the zone', 'is-good'], ['Start wrapping up', 'is-long'], ['Over time: this will not count as clean', 'is-over']];
    const zoneOf = sec => (sec < lo ? 0 : sec <= hi ? 1 : sec <= d.max_clean_seconds ? 2 : 3);
    function stageAnswer() {
      started = Date.now(); answering = true;
      ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">ANSWERING</span><h2>“${esc(p.text)}”</h2></div>
        <section class="sd-panel tr-answering"><div class="tr-clock is-short" aria-live="off">0:00</div><p class="tr-zone" role="status">${ZONES[0][0]}</p>
        <div class="tr-clock-bar"><span></span><i style="left:${100 * lo / d.max_clean_seconds}%"></i><i style="left:${100 * hi / d.max_clean_seconds}%"></i></div>
        <p class="sd-muted tr-bar-key">The marks are ${fmt(lo)} and ${fmt(hi)}. Past ${fmt(d.max_clean_seconds)} an answer is too long to count.</p>
        <p class="sd-muted">Speak your answer. Optionally capture it below for ${d.llm ? 'coach feedback' : 'your own review'}.</p>
        <textarea class="textarea tr-transcript" data-dictate rows="6" maxlength="6000" placeholder="Optional: type or dictate what you said"></textarea>
        <div class="sd-actions">${btn('Stop', 'stop', '', true)}<span class="sd-muted">Space or Ctrl+Enter stops</span></div></section>`;
      const clock = ctx.root.querySelector('.tr-clock'), bar = ctx.root.querySelector('.tr-clock-bar span'), zone = ctx.root.querySelector('.tr-zone');
      let z = 0;
      timer = setInterval(() => {
        seconds = Math.round((Date.now() - started) / 1000);
        clock.textContent = fmt(seconds);
        const now = zoneOf(seconds);
        if (now !== z) { clock.classList.remove(ZONES[z][1]); clock.classList.add(ZONES[now][1]); zone.textContent = ZONES[now][0]; z = now; }
        bar.style.width = Math.min(100, 100 * seconds / d.max_clean_seconds) + '%';
      }, 250);
    }
    const onKey = e => {
      if (!answering) return;
      const typing = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT';
      if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || (e.key === ' ' && !typing && e.target.tagName !== 'BUTTON')) { e.preventDefault(); stageCheck(); }
    };
    document.addEventListener('keydown', onKey);
    ctx.onLeave(() => document.removeEventListener('keydown', onKey));
    async function stageCheck() {
      answering = false; clearInterval(timer); seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      const area = ctx.root.querySelector('.tr-transcript');
      if (!area || area.dataset.settling) return;
      area.dataset.settling = '1';
      await window.Dictate?.settle(area);
      if (ctx.stale()) return;
      const text = area.value || '';
      ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">SELF-CHECK · ${fmt(seconds)} ${seconds > d.max_clean_seconds ? '· TOO LONG' : seconds > hi ? '· A LITTLE LONG' : seconds < lo ? '· SHORT' : '· GOOD LENGTH'}</span><h2>How did that go?</h2><p>Be honest: this decides when the prompt comes back. A clean answer needs at least five ticks, including role, result and fit, in under ${fmt(d.max_clean_seconds)}.</p></div>
        <section class="sd-panel"><ul class="tr-checks">${d.checks.map(c => `<li><label><input type="checkbox" data-check="${c.key}"> <span>${esc(c.text)}${c.required ? ' <span class="tr-req">required</span>' : ''}</span></label></li>`).join('')}</ul>
        <p class="tr-verdict" role="status" aria-live="polite"></p>
        <div class="sd-actions">${btn('Save', 'save', '', true)}</div></section>`;
      ctx.root.dataset.text = text;
      const NEED = { role: 'your own role', result: 'a concrete result', fit: 'answering the question asked' };
      const verdict = () => {
        const on = [...ctx.root.querySelectorAll('[data-check]:checked')].map(n => n.dataset.check);
        const missing = d.checks.filter(c => c.required && !on.includes(c.key)).map(c => NEED[c.key] || c.key);
        const more = Math.max(0, d.min_checks - on.length), long = seconds > d.max_clean_seconds;
        const el = ctx.root.querySelector('.tr-verdict');
        const ok = !missing.length && !more && !long;
        el.classList.toggle('is-ok', ok);
        el.textContent = ok ? 'This will count as a clean answer.' : `Not clean yet: ${[long ? `it ran past ${fmt(d.max_clean_seconds)}` : '', missing.length ? `still to show ${missing.join(', ')}` : '', more && !missing.length ? `tick ${more} more` : ''].filter(Boolean).join('; ')}.`;
      };
      ctx.root.querySelectorAll('[data-check]').forEach(n => n.addEventListener('change', verdict)); verdict();
    }
    async function save() {
      const checks = {};
      ctx.root.querySelectorAll('[data-check]').forEach(n => { checks[n.dataset.check] = n.checked; });
      const b = ctx.root.querySelector('[data-t=save]'); b.disabled = true; b.textContent = 'Saving…';
      const res = await ctx.call('/drills', 'POST', { prompt_id: p.id, story_id: storyId || null, seconds, checks, text: ctx.root.dataset.text || '' });
      if (ctx.stale()) return;
      const fb = res.feedback;
      tally(res.drill.clean);
      ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">${res.drill.clean ? 'CLEAN ANSWER' : 'NOT YET CLEAN'}</span><h2>${res.drill.clean ? 'That counts.' : 'This prompt will come back soon.'}</h2><p>${res.drill.clean ? 'It returns as it starts to fade.' : 'Tighten the story in the bank, then try again on another day.'}</p>${session.n > 1 ? `<p class="tr-session"><b>This sitting: ${session.clean} clean of ${session.n}.</b></p>` : ''}</div>
        ${fb ? `<section class="sd-panel"><h3>Coach feedback</h3><ul class="sd-rubric">${fb.checks.map(c => `<li class="${c.met ? 'is-right' : 'is-missing'}"><span>${c.met ? '✓' : '○'}</span><div><b>${esc(d.checks.find(x => x.key === c.key)?.text || c.key)}</b><p>${esc(c.note)}</p></div></li>`).join('')}</ul><p><b>Strongest:</b> ${esc(fb.strongest)}</p><p><b>Change next time:</b> ${esc(fb.improve)}</p></section>` : res.message ? `<p class="sd-muted">${esc(res.message)}</p>` : ''}
        <section class="sd-panel"><h3>The interviewer follows up</h3><p class="sd-muted">Answer each out loud in 30 to 60 seconds.</p><ol class="tr-plain">${p.probes.map(q => `<li>${esc(q)}</li>`).join('')}</ol></section>
        <div class="sd-actions">${btn('Next prompt', 'next', '', true)}${storyId ? btn('Edit the story', 'story', `data-id="${storyId}"`) : btn('Write this story up', 'new-story')}${btn('Overview', 'go', 'data-view="home"')}</div>`;
    }
    wireActions(ctx.root, {
      start: stageAnswer, stop: stageCheck, save,
      skip: async () => { const r = await ctx.call('/drill/next', 'POST', { exclude: [p.id] }); ctx.go('drill/' + r.prompt.id); },
      next: async () => { const r = await ctx.call('/drill/next', 'POST', { exclude: [p.id] }); ctx.go('drill/' + r.prompt.id); },
      story: n => ctx.go('story/' + n.dataset.id), 'new-story': () => { pending = { competencies: p.competencies.slice(0, 2) }; ctx.go('story/new'); },
      go: n => ctx.go(n.dataset.view),
    });
    stagePrep();
  }

  // ---------- deep dives ----------
  async function dives(ctx) {
    const d = await overview(ctx); if (!d) return;
    const legend = ['solid', 'learning', 'fading', 'shaky', 'unseen'].map(k => `<span>${statusDot(k)} ${STATUS_LABEL[k]}</span>`).join('');
    const pack = p => {
      const held = p.questions.filter(q => isHeld(q.status)).length, next = p.questions.find(q => !isHeld(q.status));
      return `<section class="sd-panel" id="pack-${p.id}"><div class="tr-pack-head"><div><h3>${esc(p.title)}</h3><p class="sd-muted">${esc(p.blurb)}</p></div>
        <div class="tr-pack-meter"><span class="tr-pack-count"><b>${held}</b>/${p.questions.length} held</span><span class="tr-comp-held" role="img" aria-label="${held} of ${p.questions.length} held"><i style="width:${100 * held / p.questions.length}%"></i></span>${next ? btn(held ? 'Next question' : 'Start', 'dive', `data-id="${next.id}"`, !held) : '<span class="sd-muted">All held</span>'}</div></div>
        <ul class="tr-list">${p.questions.map(q => `<li class="tr-dive-row">${statusDot(q.status)}<button type="button" class="tr-link" data-t="dive" data-id="${q.id}">${esc(q.prompt)}</button><small class="sd-muted tr-st">${STATUS_LABEL[q.status]}</small></li>`).join('')}</ul></section>`;
    };
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">DEEP DIVES</span><h2>The questions after "tell me about it"</h2><p>Packs on the topics you listed in Job Scout, with model answers, plus probing questions on each CV claim. Answer in writing as you would say it.</p></div>
      <p class="tr-legend" aria-label="Status key">${legend}</p>
      ${d.packs.map(pack).join('')}
      ${cvHtml(d, 12)}`;
    wireActions(ctx.root, handlers(ctx, d));
  }
  async function dive(ctx) {
    const d = await overview(ctx); if (!d) return;
    const pack = d.packs.find(p => p.questions.some(q => q.id === ctx.arg));
    if (!pack) throw new Error('Unknown deep-dive question.');
    const q = pack.questions.find(x => x.id === ctx.arg), i = pack.questions.indexOf(q), next = pack.questions[i + 1];
    ctx.root.innerHTML = `<div class="sd-breadcrumb">${btn('← Deep dives', 'go', 'data-view="dives"')}<span>/ ${esc(pack.title)}</span></div>
      <div class="sd-page-intro"><span class="sd-eyebrow">QUESTION ${i + 1} OF ${pack.questions.length}</span><h2>${esc(q.prompt)}</h2></div>
      <section class="sd-panel"><textarea class="textarea" data-dictate rows="9" maxlength="4000" placeholder="Answer as you would out loud: mechanism first, then the failure modes and trade-offs."></textarea>
      <div class="sd-actions">${btn('Check my answer', 'check', '', true)}<span class="sd-muted">Write before you look · Ctrl+Enter checks</span></div><div class="tr-dive-result" hidden></div></section>
      <div class="sd-actions">${next ? btn('Next question →', 'dive', `data-id="${next.id}"`) : btn('Back to deep dives', 'go', 'data-view="dives"')}</div>`;
    const area = ctx.root.querySelector('textarea'), out = ctx.root.querySelector('.tr-dive-result');
    area.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ctx.root.querySelector('[data-t=check]')?.click(); } });
    area.focus({ preventScroll: true });
    const STATUS = { covered: ['✓', 'is-right'], partial: ['◐', 'is-partial'], missing: ['○', 'is-missing'], incorrect: ['✗', 'is-wrong'] };
    wireActions(ctx.root, {
      ...handlers(ctx, d),
      check: async node => {
        if (node.disabled) return;
        node.disabled = true; await window.Dictate?.settle(area); node.disabled = false;
        if (area.value.trim().length < 15) { area.focus(); return; }
        node.disabled = true; area.disabled = true; node.textContent = 'Checking…';
        const res = await ctx.call('/dives/' + q.id, 'POST', { text: area.value.trim() });
        node.textContent = 'Checked'; out.hidden = false;
        const model = `<details class="sd-model" ${res.grade ? '' : 'open'}><summary>Model answer</summary>${md(res.model)}</details>`;
        if (res.grade) {
          out.innerHTML = `<ul class="sd-rubric">${res.grade.points.map(p => `<li class="${STATUS[p.status][1]}"><span>${STATUS[p.status][0]}</span><div><b>${inline(p.point)}</b><p>${inline(p.note)}</p></div></li>`).join('')}</ul><p>${inline(res.grade.feedback)}</p>${model}<p class="sd-muted">${res.attempt.clean ? 'Counts as held.' : 'Comes back soon.'}</p>`;
        } else {
          out.innerHTML = `${res.message ? `<p class="sd-muted">${esc(res.message)}</p>` : ''}${model}<p><b>Tick the points your answer covered:</b></p><ul class="sd-rubric is-self">${res.points.map((p, k) => `<li><label><input type="checkbox" data-point="${k}"> ${inline(p)}</label></li>`).join('')}</ul><div class="sd-actions">${btn('Record self-check', 'self', '', true)}</div>`;
          out.querySelector('[data-t=self]').addEventListener('click', async e => {
            e.stopPropagation(); e.target.disabled = true;
            const covered = out.querySelectorAll('[data-point]:checked').length;
            const r = await ctx.call(`/dives/attempts/${res.attempt.id}/self`, 'POST', { covered });
            e.target.insertAdjacentHTML('afterend', `<span class="sd-muted"> ${covered} of ${res.points.length}. ${r.clean ? 'Counts as held.' : 'Comes back soon.'}</span>`);
          });
        }
      },
    });
  }
  async function claim(ctx) {
    const d = await overview(ctx); if (!d) return;
    const c = pending; pending = null;
    if (!c) { ctx.go('dives'); return; }
    ctx.root.innerHTML = `<div class="sd-breadcrumb">${btn('← Deep dives', 'go', 'data-view="dives"')}</div><div class="sd-page-intro"><span class="sd-eyebrow">PROBE A CV CLAIM</span><h2>The interviewer has read your CV</h2><p class="tr-quote">${esc(c.excerpt)}</p></div><section class="sd-panel tr-probes"><p class="tr-loading">Preparing questions…</p></section>`;
    const res = await ctx.call('/probes', 'POST', { claim: c.excerpt });
    if (ctx.stale()) return;
    const box = ctx.root.querySelector('.tr-probes');
    box.innerHTML = `<p class="sd-muted">${res.generated ? 'Questions written for this claim by the coach.' : 'General deep-dive questions (the model is off).'} Answer each out loud or in writing, then rate yourself honestly.</p>
      <ol class="tr-probe-list">${res.probes.map((q, i) => `<li data-probe="${i}"><p><b>${esc(q)}</b></p><textarea class="textarea" rows="3" maxlength="4000" placeholder="Notes on your answer (optional)"></textarea><div class="sd-actions"><span class="sd-muted">How did you do?</span>${btn('Solid', 'rate', 'data-r="solid"')}${btn('Shaky', 'rate', 'data-r="shaky"')}${btn("Couldn't answer", 'rate', 'data-r="blank"')}</div></li>`).join('')}</ol>`;
    wireActions(ctx.root, {
      go: n => ctx.go(n.dataset.view),
      rate: async n => {
        const li = n.closest('[data-probe]');
        await ctx.call('/claims', 'POST', { ref: c.ref, probe: res.probes[+li.dataset.probe], text: li.querySelector('textarea').value, rating: n.dataset.r });
        li.querySelectorAll('button').forEach(b => { b.disabled = true; });
        li.classList.add('is-rated', 'is-' + n.dataset.r);
      },
    });
  }
  async function mistakes(ctx) {
    const d = await overview(ctx); if (!d) return;
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">MISTAKES BOOK</span><h2>What to practise again</h2><p>Prompts you answered poorly and deep dives you missed. Clear them on a later day.</p></div>
      ${T.mistakesHtml(d, v => v.kind === 'prompt' ? btn('Answer again', 'drill', `data-id="${v.id.slice(7)}"`) : btn('Try again', 'dive', `data-id="${v.id.slice(5)}"`))}`;
    wireActions(ctx.root, handlers(ctx, d));
  }

  T.register('experience', { home, stories, story, drill, dives, dive, claim, mistakes });
})();
