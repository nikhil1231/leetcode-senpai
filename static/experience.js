// Experience: story bank (drafted from Job Scout CV evidence), timed behavioural answers with a
// STAR self-check, deep-dive packs, and probing questions on individual CV claims.
(function () {
  'use strict';
  const T = window.Tracks;
  const { esc, md, inline, btn, when, wireActions } = T;
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  let pending = null;   // CV claim handed from one view to the next (refs aren't URL-safe)

  const chips = (ids, comps) => ids.map(id => `<span class="tr-tag">${esc(comps.find(c => c.id === id)?.title || id)}</span>`).join('');
  const statusDot = s => `<span class="tr-dot is-${s}" title="${s}"></span>`;

  async function overview(ctx) { const d = await ctx.call(''); return ctx.stale() ? null : d; }

  // ---------- overview ----------
  function home(ctx) {
    return overview(ctx).then(d => {
      if (!d) return;
      const nextP = d.prompts.find(p => p.id === d.next_prompt);
      const gaps = d.coverage.filter(c => !c.stories.length);
      const cv = d.cv;
      ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">EXPERIENCE</span><h2>${esc(d.track.blurb)}</h2></div>
        ${T.knowledgeHtml(d, 'answers and deep dives you could give well today')}
        <div class="tr-next-grid">
          <section class="sd-panel tr-next"><span class="sd-eyebrow">PRACTISE OUT LOUD</span><h3>${esc(nextP.text)}</h3><p class="sd-muted">A timed answer, then a STAR self-check${d.llm ? ' and coach feedback if you type or dictate it' : ''}.</p>${btn('Start a timed answer', 'go', 'data-view="drill"', true)}</section>
          <section class="sd-panel tr-next"><span class="sd-eyebrow">STORY BANK</span><h3>${d.stories.length} stor${d.stories.length === 1 ? 'y' : 'ies'} · ${gaps.length} competenc${gaps.length === 1 ? 'y' : 'ies'} uncovered</h3><p class="sd-muted">Aim for two stories per competency. Each story can answer several prompts.</p>${btn('Open the story bank', 'go', 'data-view="stories"')}</section>
          <section class="sd-panel tr-next"><span class="sd-eyebrow">DEEP DIVES</span><h3>${d.packs.length} technical packs from your topics</h3><p class="sd-muted">Interviewers drill into what's on your CV. Practise the follow-ups before they ask.</p>${btn('Open deep dives', 'go', 'data-view="dives"')}</section>
        </div>
        <section class="sd-panel"><h3>Competency coverage</h3><p class="sd-muted">Every behavioural question tests one or two of these. A gap is a question you'd have to improvise.</p>
          <table class="tr-table"><thead><tr><th>Competency</th><th>Stories</th><th>Prompts held</th><th></th></tr></thead><tbody>
          ${d.coverage.map(c => `<tr class="${c.stories.length ? '' : 'is-gap'}"><td><b>${esc(c.title)}</b><span class="sd-muted tr-block">${esc(c.blurb)}</span></td><td>${c.stories.length || '<span class="tr-warn">none</span>'}</td><td>${c.held}/${c.prompts}</td><td>${c.stories.length ? '' : btn('Write one', 'new-story', `data-comp="${c.id}"`)}</td></tr>`).join('')}
          </tbody></table></section>
        ${cvHtml(d)}`;
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
      ${d.stories.length ? `<div class="tr-story-grid">${d.stories.map(s => `<button type="button" class="sd-lesson-card tr-story-card" data-t="story" data-id="${s.id}"><span class="sd-eyebrow">${s.drills ? `PRACTISED ${s.drills}× · LAST ${when(s.last_drilled).toUpperCase()}` : 'NOT PRACTISED YET'}</span><h3>${esc(s.title)}</h3><div>${chips(s.competencies || [], d.competencies)}</div><span><span>${s.result ? esc(s.result.slice(0, 80)) : '<i>No result written yet</i>'}</span><span>Edit →</span></span></button>`).join('')}</div>`
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
        <div class="sd-actions">${btn(isNew ? 'Save story' : 'Save changes', 'save', '', true)}${!isNew ? btn('Practise with this story', 'practise') : ''}${!isNew ? btn('Archive', 'archive') : ''}</div>
      </section>
      <aside class="tr-aside">${s.source_excerpt ? `<section class="sd-panel"><span class="sd-eyebrow">CV EVIDENCE</span><p class="tr-quote">${esc(s.source_excerpt)}</p>${btn(d.llm ? 'Draft STAR from this' : 'Copy into Situation', 'draft-it')}<p class="sd-muted">${d.llm ? 'The draft uses only what the evidence says, and puts [placeholders] where you must add facts.' : 'The model is off, so the evidence is copied for you to rewrite.'}</p></section>` : ''}
        <section class="sd-panel"><span class="sd-eyebrow">WHAT INTERVIEWERS PROBE</span><ul class="tr-plain">${d.probes.slice(0, 5).map(p => `<li>${esc(p)}</li>`).join('')}</ul></section></aside></div>`;
    const get = () => {
      const out = { competencies: [...ctx.root.querySelectorAll('[data-comp]:checked')].map(n => n.value) };
      ctx.root.querySelectorAll('[data-f]').forEach(n => { out[n.dataset.f] = n.value.trim(); });
      return out;
    };
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
    }
    wireActions(ctx.root, {
      go: n => ctx.go(n.dataset.view),
      'draft-it': draftIt,
      save: async () => {
        const body = { ...get(), source_ref: s.source_ref || null, source_excerpt: s.source_excerpt || null };
        if (!body.title) { window.H.toast?.('Give the story a title'); return; }
        if (isNew) await ctx.call('/stories', 'POST', body);
        else await ctx.call('/stories/' + s.id, 'PUT', { ...body, revision: s.revision });
        window.H.toast?.('Story saved'); ctx.go('stories');
      },
      archive: async () => { if (!confirm('Archive this story? Its practice history is kept.')) return; await ctx.call(`/stories/${s.id}/archive`, 'POST', {}); ctx.go('stories'); },
      practise: () => ctx.go('drill'),
    });
    if (autoDraft && d.llm) draftIt().catch(e => window.H.toast?.(e.message, 'error'));
    else if (autoDraft) ctx.root.querySelector('[data-f=situation]').value ||= s.source_excerpt;
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
    }
    function stageAnswer() {
      started = Date.now();
      ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">ANSWERING</span><h2>“${esc(p.text)}”</h2></div>
        <section class="sd-panel tr-answering"><div class="tr-clock" aria-live="off">0:00</div><div class="tr-clock-bar"><span></span><i style="left:${100 * lo / (d.max_clean_seconds)}%"></i><i style="left:${100 * hi / (d.max_clean_seconds)}%"></i></div>
        <p class="sd-muted">Speak your answer. Optionally capture it below for ${d.llm ? 'coach feedback' : 'your own review'}.</p>
        <textarea class="textarea tr-transcript" data-dictate rows="6" maxlength="6000" placeholder="Optional: type or dictate what you said"></textarea>
        <div class="sd-actions">${btn('Stop', 'stop', '', true)}</div></section>`;
      const clock = ctx.root.querySelector('.tr-clock'), bar = ctx.root.querySelector('.tr-clock-bar span');
      timer = setInterval(() => {
        seconds = Math.round((Date.now() - started) / 1000);
        clock.textContent = fmt(seconds);
        clock.classList.toggle('is-over', seconds > hi);
        bar.style.width = Math.min(100, 100 * seconds / d.max_clean_seconds) + '%';
      }, 250);
    }
    async function stageCheck() {
      clearInterval(timer); seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      const area = ctx.root.querySelector('.tr-transcript');
      if (!area || area.dataset.settling) return;
      area.dataset.settling = '1';
      await window.Dictate?.settle(area);
      if (ctx.stale()) return;
      const text = area.value || '';
      ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">SELF-CHECK · ${fmt(seconds)} ${seconds > d.max_clean_seconds ? '· TOO LONG' : seconds > hi ? '· A LITTLE LONG' : seconds < lo ? '· SHORT' : '· GOOD LENGTH'}</span><h2>How did that go?</h2><p>Be honest: this decides when the prompt comes back. A clean answer needs at least five ticks, including role, result and fit, in under ${fmt(d.max_clean_seconds)}.</p></div>
        <section class="sd-panel"><ul class="tr-checks">${d.checks.map(c => `<li><label><input type="checkbox" data-check="${c.key}"> ${esc(c.text)}</label></li>`).join('')}</ul>
        <div class="sd-actions">${btn('Save', 'save', '', true)}</div></section>`;
      ctx.root.dataset.text = text;
    }
    async function save() {
      const checks = {};
      ctx.root.querySelectorAll('[data-check]').forEach(n => { checks[n.dataset.check] = n.checked; });
      const b = ctx.root.querySelector('[data-t=save]'); b.disabled = true; b.textContent = 'Saving…';
      const res = await ctx.call('/drills', 'POST', { prompt_id: p.id, story_id: storyId || null, seconds, checks, text: ctx.root.dataset.text || '' });
      if (ctx.stale()) return;
      const fb = res.feedback;
      ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">${res.drill.clean ? 'CLEAN ANSWER' : 'NOT YET CLEAN'}</span><h2>${res.drill.clean ? 'That counts.' : 'This prompt will come back soon.'}</h2><p>${res.drill.clean ? 'It returns as it starts to fade.' : 'Tighten the story in the bank, then try again on another day.'}</p></div>
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
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">DEEP DIVES</span><h2>The questions after "tell me about it"</h2><p>Packs on the topics you listed in Job Scout, with model answers, plus probing questions on each CV claim. Answer in writing as you would say it.</p></div>
      ${d.packs.map(p => `<section class="sd-panel" id="pack-${p.id}"><h3>${esc(p.title)}</h3><p class="sd-muted">${esc(p.blurb)}</p><ul class="tr-list">${p.questions.map(q => `<li class="tr-dive-row">${statusDot(q.status)}<button type="button" class="tr-link" data-t="dive" data-id="${q.id}">${esc(q.prompt)}</button></li>`).join('')}</ul></section>`).join('')}
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
      <div class="sd-actions">${btn('Check my answer', 'check', '', true)}<span class="sd-muted">Write before you look.</span></div><div class="tr-dive-result" hidden></div></section>
      <div class="sd-actions">${next ? btn('Next question →', 'dive', `data-id="${next.id}"`) : btn('Back to deep dives', 'go', 'data-view="dives"')}</div>`;
    const area = ctx.root.querySelector('textarea'), out = ctx.root.querySelector('.tr-dive-result');
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
