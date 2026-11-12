// Distributed-data simulators for the system design lessons: clock skew and last-write-wins, replay after a
// stream processor crashes, batch join strategies, dual writes versus one log, and schema compatibility.
// Models are pure (dist-models.js); this file draws them with the shared simulator helpers (sd-sims.js).
(function () {
  'use strict';
  if (!window.SDSims || !window.DistModels) return;
  const M = window.DistModels, { esc, fmt, bytes, controls, bars, stats, shell, simple } = window.SDSims.H;
  const reg = window.SDSims.register;
  const secs = s => !isFinite(s) ? 'does not fit' : s >= 3600 ? (s / 3600).toFixed(1) + ' h' : s >= 60 ? (s / 60).toFixed(1) + ' min' : s.toFixed(s < 10 ? 1 : 0) + ' s';

  // ---------- Clocks: whose write survives? ----------
  reg('lwwclock', (el, cfg, api) => simple(el, cfg, api, { strategy: 'lww', skew: 0, gap: 50, concurrent: false },
    [{ key: 'strategy', label: 'How replicas pick a winner', type: 'select', options: Object.entries(M.CLOCK_STRATEGIES) },
      { key: 'skew', label: 'Clock of B\'s node vs. true time', min: -300, max: 300, step: 10, fmt: v => (v > 0 ? '+' : '') + v + ' ms' },
      { key: 'gap', label: 'Real time between the writes', min: 10, max: 300, step: 10, fmt: v => v + ' ms' },
      { key: 'concurrent', label: 'B never saw A\'s write (concurrent)', type: 'toggle' }],
    s => {
      const r = M.clockRace(s), cell = w => `<div class="dc-write ${r.kept.includes(w.who) ? 'is-kept' : 'is-dropped'}"><b>${w.who} writes ${esc(w.value)}</b>`
        + `<span>real time ${w.real} ms · stamp ${esc(String(w.stamp))}</span><em>${r.kept.includes(w.who) ? 'kept' : 'discarded'}</em></div>`;
      const tone = r.siblings ? 'ok' : r.lostAny ? 'bad' : 'ok';
      return {
        metrics: { lostCausal: r.lostCausal ? 1 : 0, lostAny: r.lostAny ? 1 : 0, siblings: r.siblings ? 1 : 0, strategy: r.strategy, skew: r.skew, usesLogical: r.strategy === 'lww' ? 0 : 1 },
        html: `<div class="dc-writes">${r.writes.map(cell).join('')}</div>`
          + `<p class="fs-decision is-${tone}">${esc(r.verdict)}</p><p class="sim-note">${esc(r.why)}`
          + (r.strategy === 'lww' && !r.concurrent ? ` With these settings last-write-wins loses B's write once B's clock runs more than <b>${r.gap} ms</b> behind.` : '') + '</p>'
          + stats([{ label: 'Kept', value: r.kept.join(' + ') }, { label: 'Silently lost', value: r.lost.length ? r.lost.join(', ') : 'none', tone: r.lost.length ? 'bad' : 'ok' }]),
      };
    }));

  // ---------- Stream processing: crash and replay ----------
  reg('replay', (el, cfg, api) => simple(el, cfg, api, { mode: 'after', events: 20, every: 5, crashAt: 12 },
    [{ key: 'mode', label: 'Delivery strategy', type: 'select', options: Object.entries(M.STREAM_MODES) },
      { key: 'every', label: 'Events per batch (commit interval)', min: 1, max: 10 },
      { key: 'crashAt', label: 'Crash while handling event', min: 1, max: 20 }],
    s => {
      const r = M.streamRun(s);
      const strip = r.effects.map((c, i) => `<span class="dc-ev ${c === 0 ? 'is-lost' : c > 1 ? 'is-dup' : 'is-ok'}${i + 1 >= r.batch[0] && i + 1 <= r.batch[1] ? ' is-batch' : ''}${i + 1 === r.crashAt ? ' is-crash' : ''}" title="event ${i + 1}: ${c} effect${c === 1 ? '' : 's'}">${i + 1}${c > 1 ? '×' + c : c === 0 ? '✕' : ''}</span>`).join('');
      return {
        metrics: { lost: r.lost, duplicated: r.duplicated, exact: r.exact ? 1 : 0, mode: r.mode, every: r.every },
        html: `<div class="dc-strip" role="img" aria-label="Effects per event">${strip}</div>`
          + stats([{ label: 'Events never processed', value: String(r.lost), tone: r.lost ? 'bad' : 'ok' }, { label: 'Extra effects (duplicates)', value: String(r.duplicated), tone: r.duplicated ? 'warn' : 'ok' }, { label: 'Result', value: r.exact ? 'Exactly once' : r.lost ? 'Data lost' : 'Duplicates', tone: r.exact ? 'ok' : 'bad' }])
          + `<ol class="fs-steps">${r.trace.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`
          + '<p class="sim-note">Outlined events are the batch that was in flight; the bar marks the crash. Each event has an external effect such as an email or a payment.</p>',
      };
    }));

  // ---------- Batch: join strategies ----------
  reg('batchjoin', (el, cfg, api) => simple(el, cfg, api, { clicks: 1e9, users: 1e6, workers: 100, skew: 0, memGB: 8, prepartitioned: false },
    [{ key: 'clicks', label: 'Click events (100 B each)', min: 1e7, max: 1e11, log: true },
      { key: 'users', label: 'User profiles (200 B each)', min: 1e4, max: 1e9, log: true },
      { key: 'workers', label: 'Workers', min: 10, max: 1000, step: 10 },
      { key: 'skew', label: 'Share of clicks from one hot user', min: 0, max: 90, step: 5, fmt: v => v + '%' },
      { key: 'memGB', label: 'Memory per worker', min: 1, max: 64, fmt: v => v + ' GB' },
      { key: 'prepartitioned', label: 'Both inputs were already partitioned and sorted by user', type: 'toggle' }],
    s => {
      const r = M.joinCost({ ...s, skew: s.skew / 100 }), finite = r.rows.filter(x => isFinite(x.seconds)), max = Math.max(...finite.map(x => x.seconds));
      return {
        metrics: { best: r.best, skew: s.skew, sortSeconds: r.rows[0].seconds, bestSeconds: r.rows.find(x => x.key === r.best).seconds, broadcastOk: r.rows[1].ok ? 1 : 0, skewedBeatsSort: r.rows[3].seconds < r.rows[0].seconds ? 1 : 0 },
        html: bars(r.rows.map(x => ({ label: x.label, value: isFinite(x.seconds) ? x.seconds : 0, text: isFinite(x.seconds) ? secs(x.seconds) : 'not possible', cls: x.key === r.best ? 'c0' : !x.ok ? 'is-dead' : '' })), max)
          + stats([{ label: 'Big table', value: bytes(r.bigBytes) }, { label: 'Small table', value: bytes(r.smallBytes), tone: r.smallBytes > r.memGB * 1e9 ? 'warn' : '' }, { label: 'Fastest', value: M.JOINS[r.best] }])
          + `<ul class="dc-notes">${r.rows.map(x => `<li class="${x.key === r.best ? 'is-best' : ''}"><b>${esc(x.label)}:</b> ${esc(x.note)}${x.ok ? ` Slowest worker handles ${esc(bytes(x.straggler))}${x.shuffled ? `, ${esc(bytes(x.shuffled))} moved across the network` : ''}.` : ''}</li>`).join('')}</ul>`,
      };
    }));

  // ---------- Derived data: dual writes versus one log ----------
  reg('dualwrite', (el, cfg, api) => {
    let seed = 7;
    const defs = [{ key: 'mode', label: 'How the search index is kept up to date', type: 'select', options: [['dual', 'The client writes the database and the index itself'], ['log', 'The index replays the database\'s change log']] },
      { key: 'conflict', label: 'Updates that race with another client', min: 0, max: 100, step: 5, fmt: v => v + '%' },
      { key: 'crash', label: 'Clients that die between the two writes', min: 0, max: 10, step: 1, fmt: v => v + '%' },
      { key: 'again', label: 'Run again', type: 'button' }];
    return simple(el, cfg, api, { mode: 'dual', conflict: 20, crash: 2 }, defs, s => {
      const r = M.dualWrite({ mode: s.mode, conflict: s.conflict / 100, crash: s.crash / 100, keys: 500, seed });
      return {
        metrics: { diverged: r.diverged, pct: r.pct, mode: r.mode, converged: r.converged ? 1 : 0, race: r.race, lostSecond: r.lostSecond },
        html: stats([{ label: 'Records checked', value: String(r.keys) }, { label: 'Database and index disagree', value: `${r.diverged} (${r.pct}%)`, tone: r.diverged ? 'bad' : 'ok' }])
          + bars([{ label: 'Writes arrived in opposite orders', value: r.race, cls: 'c1', text: String(r.race) }, { label: 'Client died after the first write', value: r.lostSecond, cls: 'c2', text: String(r.lostSecond) }], Math.max(1, r.race, r.lostSecond))
          + `<p class="sim-note">${r.mode === 'log' ? 'The log has one order, the database\'s commit order, and a restarted consumer resumes from its saved position. The index can lag, but it cannot disagree.' : 'Nothing makes the two systems apply concurrent writes in the same order, and a crash between the two writes leaves one of them behind with no error anywhere. The disagreement is permanent until something repairs it.'}</p>`,
      };
    }, (key, state) => { if (key === 'again') seed += 13; });
  });

  // ---------- Encoding: is this schema change safe? ----------
  reg('compat', (el, cfg, api) => {
    const defs = [{ key: 'format', label: 'Format', type: 'select', options: Object.entries(M.FORMATS) },
      { key: 'change', label: 'Change to inspect', type: 'select', options: Object.entries(M.CHANGES) }];
    return simple(el, cfg, api, { format: 'proto', change: 'addOptional' }, defs, s => {
      const b = M.compatBoard(s.format), r = M.compat(s.format, s.change), mark = x => `<td class="${x.ok ? 'is-ok' : 'is-bad'}">${x.ok ? '✓' : '✗'}</td>`;
      return {
        metrics: { safeCount: b.safe, safe: r.safe ? 1 : 0, backward: r.backward ? 1 : 0, forward: r.forward ? 1 : 0, format: s.format, change: s.change },
        html: `<table class="fs-table dc-compat"><thead><tr><th>Change</th><th>New code reads old data</th><th>Old code reads new data</th></tr></thead><tbody>`
          + b.rows.map(x => `<tr class="${x.change === s.change ? 'is-on' : ''}"><td>${esc(M.CHANGES[x.change])}</td>${mark(x.newReadsOld)}${mark(x.oldReadsNew)}</tr>`).join('') + '</tbody></table>'
          + `<div class="fs-flow is-${r.safe ? 'ok' : 'bad'}"><b>${esc(M.CHANGES[s.change])}</b><span>${r.safe ? 'Safe both ways' : r.backward ? 'Breaks old readers' : r.forward ? 'Breaks new readers' : 'Breaks both'}</span>`
          + `<ol><li><b>New code, old data:</b> ${esc(r.newReadsOld.why)}</li><li><b>Old code, new data:</b> ${esc(r.oldReadsNew.why)}</li></ol></div>`
          + `<p class="sim-note">${b.safe} of ${b.rows.length} changes are safe in both directions for ${esc(M.FORMATS[s.format])}. During a rolling upgrade, and for data stored years ago, both directions happen.</p>`,
      };
    });
  });
})();
