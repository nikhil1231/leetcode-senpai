// AI Engineering: the AI-assisted coding round. A playbook page (what's scored, the hour planned,
// what to say), the practice rounds, and the rounds themselves opened in place with practical.js's
// workspace, so you stay in the AI section. Registers course views; other course tracks have no
// rounds and fall back to their overview.
(function () {
  'use strict';
  const T = window.Tracks;
  const { esc, btn, when, wireActions } = T;
  const SCORED = [
    ['Approach', 'Understand the problem and the code before acting.',
      ['Reads the files and runs the tests before opening the AI chat', 'Says a hypothesis out loud, then tests it'],
      ['Pastes the brief into the AI in the first two minutes']],
    ['Control', 'You direct the AI; it doesn’t direct you.',
      ['Small, specific prompts naming the file, function and behaviour', 'Rejects a suggestion that doesn’t fit, and says why'],
      ['“Fix it”, then “rewrite the whole file” when that fails']],
    ['Verification', 'Read, run and test everything it writes.',
      ['Reads each diff against the spec before running it', 'Tests the boundary the visible tests don’t cover'],
      ['Accepts a diff because the tests went green', 'Trusts “I ran the tests” from a chat-only AI']],
    ['Communication', 'Keep the interviewer in the loop.',
      ['Narrates before prompting: “I’ll ask it to…, then check…”', 'Can explain any line when asked'],
      ['Goes silent while iterating on prompts']],
  ];
  const HOUR = [['0–5', 'Orient', 'Read the brief and files, run the tests, ask questions.'],
    ['5–20', 'Fix the bug', 'Reproduce, hypothesise, small fix, verify every complaint.'],
    ['20–45', 'Add the feature', 'Plan it yourself, delegate pieces, review each diff.'],
    ['45–60', 'Scale it', 'Find the bottleneck, change the approach, explain if unfinished.']];
  const SAY = ['“I’ll take a couple of minutes to read the code and run the tests before I use the AI.”',
    '“My hypothesis is that the overlap check is inclusive, so back-to-back meetings clash. Let me write a test for both orders.”',
    '“I’m going to ask it to make overlaps() half-open in both directions, then I’ll check the comparison against the rule.”',
    '“It says the tests pass, but it can’t run code, so I’ll run them.”',
    '“I don’t want this part: it changes free_slots too, which isn’t related. I’ll take only the overlap change.”',
    '“I’m stuck on this one. Here’s what I’ve ruled out. I’ll move on to the feature and come back.”'];
  const STATUS = { solid: 'Held', learning: 'Learning', fading: 'Fading', shaky: 'Redo', unseen: 'Not started' };

  function exerciseCard(e) {
    const state = e.open ? 'In progress' : e.best ? `${e.best.clean ? 'Clean' : 'Attempted'} · ${when(e.best.at)}` : 'Not started';
    return `<button type="button" class="sd-lesson-card tr-ex-card is-${e.status}" data-t="exercise" data-id="${esc(e.id)}"><span class="sd-eyebrow">AI-ASSISTED · ${e.minutes} MIN · ${STATUS[e.status] || ''}</span><h3>${esc(T.shortTitle(e.title))}</h3><p class="tr-card-sum">Bug, feature, scale, with an AI pair whose first answer you shouldn’t trust.</p><span><span>${state}</span><span>${e.open ? 'Resume →' : 'Open →'}</span></span></button>`;
  }

  async function round(ctx) {
    const d = await ctx.call('');
    if (ctx.stale()) return;
    const r = (d.rounds || []).find(x => x.id === 'assisted');
    if (!r) { ctx.go('home'); return; }
    const lessons = d.course.find(c => c.id === 'assisted')?.lessons || [];
    ctx.root.innerHTML = `<div class="sd-page-intro"><span class="sd-eyebrow">THE AI-ASSISTED CODING ROUND</span><h2>Fix, extend and scale code with an AI pair, and show you’re the one driving.</h2>
        <p>One problem in three phases, usually in a codebase you didn’t write. Expect a browser IDE with an AI chat (CoderPad, HackerRank), or your own editor and tools on a screen share. You’re scored on how you work with the AI, not on how much it writes. Ask your recruiter which format and models you’ll get.</p></div>
      <section class="tr-ready"><div><span class="sd-eyebrow">READINESS FOR THIS ROUND</span><div class="tr-ready-num"><strong>${r.pct}%</strong><span>${r.held} of ${r.items} lesson items and rounds held</span></div></div><div class="sd-course-bar"><span style="width:${r.pct}%"></span></div></section>
      <section class="tr-cat"><div class="tr-cat-head"><h3>What they score</h3><p class="sd-muted">Four areas, the same across Meta, Canva, Rippling and the public guides. The AI’s output isn’t one of them.</p></div>
        <div class="tr-score-grid">${SCORED.map(([t, g, good, bad]) => `<div class="sd-panel tr-score"><h4>${t}</h4><p class="sd-muted">${g}</p><ul class="tr-signal is-good">${good.map(x => `<li>${esc(x)}</li>`).join('')}</ul><ul class="tr-signal is-bad">${bad.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div></section>
      <section class="tr-cat"><div class="tr-cat-head"><h3>Practice rounds</h3><p class="sd-muted">${d.llm ? 'With an AI pair that behaves like interview assistants: it answers only what you ask and can be wrong.' : 'The model is off: use your own assistant beside the app and log your prompts in the round, so the process review still works.'} Each round ends with a walkthrough and a review of how you drove the AI.</p></div>
        <div class="sd-lesson-grid">${r.exercises.map(exerciseCard).join('')}</div></section>
      <div class="tr-two">
        <section class="sd-panel"><span class="sd-eyebrow">THE HOUR, PLANNED</span><ol class="tr-hour">${HOUR.map(([m, t, x]) => `<li><span>${m}</span><div><b>${t}</b><p class="sd-muted">${x}</p></div></li>`).join('')}</ol><p class="sd-muted">The most common failure is spending half the hour on the bug. Not finishing the scale phase is fine if you can explain what you’d do.</p></section>
        <section class="sd-panel"><span class="sd-eyebrow">SAY IT OUT LOUD</span><ul class="tr-say">${SAY.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
      </div>
      <section class="tr-cat"><div class="tr-cat-head"><h3>Learn it first</h3><p class="sd-muted">About 40 minutes: what’s scored, debugging with an AI pair, and how to talk about your own workflow.</p></div>
        <div class="sd-lesson-grid">${lessons.map(l => `<button type="button" class="sd-lesson-card tr-lesson-card ${l.checked ? 'is-done' : ''}" data-t="lesson" data-id="${l.id}"><span class="sd-eyebrow">${l.minutes} MIN · ${l.held}/${l.items} HELD</span><h3>${esc(l.title)}</h3><p class="tr-card-sum">${esc(l.summary.split('. ')[0])}.</p><span><span>${l.checked ? 'Checked ✓' : l.opened ? 'Started' : 'Not started'}</span><span>Open →</span></span></button>`).join('')}</div></section>`;
    wireActions(ctx.root, { exercise: n => ctx.go('exercise/' + n.dataset.id), lesson: n => ctx.go('lesson/' + n.dataset.id) });
  }

  async function exercise(ctx) {
    const views = window.PracticalViews;
    if (!views) throw new Error('The practice workspace did not load. Reload the page.');
    const back = /^ai-pair-/.test(ctx.arg || '') ? ['round', '← AI round'] : ['home', '← Overview'];
    await views.exercise({ ...ctx, back: back[1], call: (path, method = 'GET', body) => window.H.api('/tracks/practical' + path, method, body),
      go: v => ctx.go(v === 'home' ? back[0] : v) });
  }

  T.register('course', { round, exercise });
})();
