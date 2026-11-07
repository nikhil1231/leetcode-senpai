// Night Shift engine: one incident, played minute by minute. Pure: a level (simulators/nightshift.json)
// and the player's moves in, the shift's state out; node tests every level with it. Commands cost time
// and show the box's real output (a different one once things are stable). Actions change the incident:
// a fix holds, a temporary fix holds until it relapses, some do nothing, some make it worse, and a few
// work at the price of an outage. Once it's stable, the diagnosis and the lasting fix are asked, and
// the score weighs time, impact, risky moves, hints and whether it will page you again tomorrow.
(function (root) {
  'use strict';
  const clone = o => JSON.parse(JSON.stringify(o));
  const EVENT = { worse: 0.6 };

  function start(level) {
    return { level: level.id, minute: 0, log: [{ kind: 'page', at: 0, text: level.page }, ...(level.opening || []).map(m => ({ kind: 'chat', at: 0, who: m.who, text: m.text }))],
      ran: [], acted: [], stable: null, relapseAt: null, stableAt: null, risky: [], worse: 0, impact: 0, hints: 0, answers: {}, closed: false, said: [], relapsed: 0 };
  }

  function tick(s, level, minutes) {
    for (let i = 0; i < minutes; i++) {
      if (!s.stable) s.impact += level.impact.perMin * (1 + EVENT.worse * s.worse);
      s.minute++;
      if (s.stable === 'temp' && s.relapseAt != null && s.minute >= s.relapseAt) {
        s.stable = null; s.relapseAt = null; s.relapsed++;
        s.log.push({ kind: 'sys', at: s.minute, text: "It's back. The alert is firing again: whatever you did bought time, but the cause is still there." });
      }
      (level.timeline || []).forEach((m, k) => {
        if (!s.said.includes(k) && m.at <= s.minute && !s.stable) { s.said.push(k); s.log.push({ kind: 'chat', at: s.minute, who: m.who, text: m.text }); }
      });
      // A shift doesn't last forever: well past par, the incident is handed to someone else.
      if (!s.stable && s.minute >= limit(level)) {
        s.closed = true; s.handedOver = true;
        s.log.push({ kind: 'sys', at: s.minute, text: `${s.minute} minutes in and still firing: Priya takes over the incident, and you hand over what you know.` });
        s.result = score(s, level);
        return;
      }
    }
  }
  const limit = level => level.limit || Math.max(40, level.par * 5);

  function run(s0, level, id) {
    const c = level.commands.find(x => x.id === id);
    if (!c || s0.closed) return s0;
    const s = clone(s0);
    s.log.push({ kind: 'cmd', at: s.minute, id, cmd: c.cmd, out: s.stable && c.after ? c.after : c.out });
    if (!s.ran.includes(id)) s.ran.push(id);
    tick(s, level, c.minutes || 1);
    return s;
  }

  // A command nobody scripted, answered elsewhere (the model, or a "not available" note).
  function freeform(s0, level, line, out) {
    if (s0.closed) return s0;
    const s = clone(s0);
    s.log.push({ kind: 'cmd', at: s.minute, cmd: String(line).slice(0, 200), out: String(out).slice(0, 3000), free: true });
    tick(s, level, 1);
    return s;
  }

  function act(s0, level, id) {
    const a = level.actions.find(x => x.id === id);
    if (!a || s0.closed) return s0;
    const s = clone(s0);
    tick(s, level, a.minutes || 1);
    s.acted.push(id);
    if (a.risky) s.risky.push(id);
    const was = s.stable;
    if (a.effect === 'fix') s.stable = 'fix';
    else if (a.effect === 'outage') { s.stable = 'fix'; s.impact += level.impact.perMin * 5; }
    else if (a.effect === 'temp' && s.stable !== 'fix') { s.stable = 'temp'; s.relapseAt = s.minute + (a.relapse || 30); }
    else if (a.effect === 'worse') s.worse++;
    if (s.stable && !was && s.stableAt == null) s.stableAt = s.minute;
    if (s.stable === 'fix') s.relapseAt = null;
    s.log.push({ kind: 'act', at: s.minute, id, label: a.label, text: a.say, effect: a.effect });
    return s;
  }

  function hint(s0, level) {
    const s = clone(s0), h = (level.hints || [])[s.hints];
    if (!h) return s;
    s.hints++;
    s.log.push({ kind: 'chat', at: s.minute, who: 'priya', text: h, hint: true });
    return s;
  }

  function answer(s0, kind, i) {
    const s = clone(s0);
    if (s.answers[kind] == null) s.answers[kind] = i;
    return s;
  }

  function close(s0, level) {
    if (!s0.stable) return s0;
    const s = clone(s0);
    s.closed = true;
    s.result = score(s, level);
    return s;
  }

  function score(s, level) {
    const diagnosis = s.answers.diagnosis === level.diagnosis.answer, fix = s.answers.fix === level.fix.answer;
    const lasting = s.stable === 'fix', mitigated = s.stableAt != null ? s.stableAt : s.minute;
    const quick = mitigated <= level.par * 1.5;
    let stars = 0;
    if (s.stable) stars = 1;
    if (stars && diagnosis && fix && lasting) stars = 2;
    if (stars === 2 && quick && !s.risky.length && s.hints <= 1 && !s.relapsed) stars = 3;
    const notes = [];
    if (s.handedOver) return { stars: 0, diagnosis: false, fix: false, lasting: false, minutes: s.minute, impact: Math.round(s.impact), risky: s.risky.length, hints: s.hints, commands: s.ran.length,
      handedOver: true, notes: [`Handed over after ${s.minute} minutes without it being stable (par ${level.par}). The cause: ${level.diagnosis.choices[level.diagnosis.answer]}`] };
    if (!lasting) notes.push("You closed it on a temporary fix: it will page someone again.");
    if (s.risky.length) notes.push('A risky move: it worked, at the cost of an outage or lost work.');
    if (!quick) notes.push(`Stable after ${mitigated} minutes (par ${level.par}).`);
    if (s.hints > 1) notes.push(`${s.hints} hints from Priya.`);
    if (s.relapsed) notes.push('It came back once before you fixed it for real.');
    if (!diagnosis) notes.push('The diagnosis was off.');
    if (!fix) notes.push('The lasting fix was off.');
    return { stars, diagnosis, fix, lasting, minutes: mitigated, impact: Math.round(s.impact), risky: s.risky.length, hints: s.hints, commands: s.ran.length, notes };
  }

  // The best line through a level, for tests and the "show me" replay: the commands that matter, the fix.
  function solve(level) {
    let s = start(level);
    for (const c of level.commands.slice(0, 3)) s = run(s, level, c.id);
    s = act(s, level, level.actions.find(a => a.effect === 'fix').id);
    s = answer(answer(s, 'diagnosis', level.diagnosis.answer), 'fix', level.fix.answer);
    return close(s, level);
  }

  const api = { start, run, freeform, act, hint, answer, close, score, solve, limit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NightShiftEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
