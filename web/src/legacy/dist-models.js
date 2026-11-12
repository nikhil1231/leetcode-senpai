// Models behind the distributed-data simulators (dist-sims.js draws them): clock skew and last-write-wins,
// stream replay after a crash, batch join strategies, dual writes versus one log, and schema compatibility.
// Pure: no DOM, no I/O, seeded randomness, so node can test them (tests/test_dist_models.cjs). Teaching
// models: right about who loses data and why, not benchmarks.
(function (root) {
  'use strict';
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

  // ---------- Clocks: whose write survives? ----------
  // Client A writes x=1 through node 1 (an accurate clock). `gap` ms later client B writes x=2 through node 2,
  // whose clock is `skew` ms off. If B read A's value first the writes are causally ordered (B is later);
  // otherwise they are concurrent. Each strategy decides which value the replicas keep.
  const CLOCK_STRATEGIES = {
    lww: 'Last write wins (time of day)',
    lamport: 'Lamport timestamps',
    vector: 'Version vectors',
  };
  function clockRace(o = {}) {
    const strategy = CLOCK_STRATEGIES[o.strategy] ? o.strategy : 'lww';
    const skew = num(o.skew, -500, 500, 0), gap = num(o.gap, 1, 500, 50), concurrent = !!o.concurrent;
    const a = { who: 'A', value: 'x = 1', real: 0, stamp: 0 };
    const b = { who: 'B', value: 'x = 2', real: gap, stamp: gap + skew };
    let kept, why;
    if (strategy === 'lww') {
      // A tie goes to the higher node id, so B.
      kept = b.stamp >= a.stamp ? [b] : [a];
      why = `Timestamps: A = ${a.stamp} ms, B = ${b.stamp} ms. The higher stamp wins.`;
    } else if (strategy === 'lamport') {
      // Causal: B saw A's counter (1), so B's counter is 2. Concurrent: both are 1, and the node id breaks the tie.
      const ca = 1, cb = concurrent ? 1 : 2;
      kept = cb > ca || (cb === ca && 'B' > 'A') ? [b] : [a];
      a.stamp = ca; b.stamp = cb;
      why = `Counters: A = ${ca}, B = ${cb}${concurrent ? ' (equal, so the node id decides)' : ' (B saw A, so it jumped past it)'}.`;
    } else {
      kept = concurrent ? [a, b] : [b];
      why = concurrent ? 'Neither version vector dominates the other, so both are kept as siblings.' : "B's version vector includes A's write, so B replaces it.";
    }
    // A write replaced by a causally later one is not lost; one thrown away unjustly (the later write, or either
    // of two concurrent writes) is.
    const lost = [a, b].filter(w => !kept.includes(w) && (concurrent || w.who === 'B'));
    const lostCausal = !concurrent && lost.some(w => w.who === 'B');
    return {
      strategy, skew, gap, concurrent, writes: [a, b], kept: kept.map(w => w.who), lost: lost.map(w => w.who), why,
      lostCausal, lostAny: lost.length > 0, siblings: kept.length > 1,
      // Skew below this makes last-write-wins drop the causally later write.
      threshold: -gap,
      verdict: kept.length > 1 ? 'Both writes kept: the application merges them.'
        : lostCausal ? "B's later write was thrown away: an acknowledged update vanished."
          : lost.length ? 'One of two concurrent writes was silently discarded.' : 'Correct: the later write replaced the earlier one.',
    };
  }

  // ---------- Stream processing: crash and replay ----------
  // `events` numbered 1..n are processed in batches of `every`. The processor crashes while handling event
  // `crashAt`, restarts from the last committed position and carries on. Each processed event has an external
  // effect (an email, a payment, a row). `mode` is the delivery strategy.
  const STREAM_MODES = {
    before: 'Commit the offset before processing (at most once)',
    after: 'Commit the offset after processing (at least once)',
    idempotent: 'At least once, with an idempotent sink',
    atomic: 'Effects and offset committed together',
  };
  function streamRun(o = {}) {
    const n = Math.round(num(o.events, 6, 40, 20)), every = Math.round(num(o.every, 1, 20, 5));
    const crashAt = Math.round(num(o.crashAt, 1, n, 12)), mode = STREAM_MODES[o.mode] ? o.mode : 'after';
    const effects = new Array(n + 1).fill(0);
    const trace = [];
    const batchStart = ev => Math.floor((ev - 1) / every) * every + 1;
    const start = batchStart(crashAt), end = Math.min(n, start + every - 1);
    const processBatch = (from, to, stopAt) => {
      for (let ev = from; ev <= to; ev++) {
        if (stopAt && ev === stopAt) return ev;
        if (mode === 'idempotent') { if (!effects[ev]) effects[ev] = 1; } else effects[ev]++;
      }
      return 0;
    };
    // Batches before the crash batch complete normally.
    for (let s = 1; s < start; s += every) {
      processBatch(s, Math.min(n, s + every - 1));
    }
    trace.push(`Events 1–${start - 1} are done and committed.`);
    if (mode === 'before') {
      trace.push(`Offset ${end} is committed first, for the batch ${start}–${end}.`);
      processBatch(start, end, crashAt);
      trace.push(`Crash while handling event ${crashAt}. The offset already says the batch is done, so events ${crashAt}–${end} are never processed.`);
    } else if (mode === 'atomic') {
      // Effects stay invisible until the batch commits, so a crash discards them and the batch reruns once.
      trace.push(`Crash while handling event ${crashAt}: the uncommitted effects of ${start}–${crashAt - 1} are discarded.`);
      processBatch(start, end);
      trace.push(`Restart from offset ${start - 1}; the batch ${start}–${end} reruns and commits once.`);
    } else {
      processBatch(start, end, crashAt);
      trace.push(`Crash while handling event ${crashAt}, after events ${start}–${crashAt - 1} already took effect.`);
      processBatch(start, end);
      trace.push(`Restart from offset ${start - 1}; the whole batch ${start}–${end} runs again${mode === 'idempotent' ? ', but the sink ignores event IDs it has seen' : ''}.`);
    }
    if (end < n) processBatch(end + 1, n);
    trace.push(end < n ? `Events ${end + 1}–${n} follow normally.` : 'No events remain.');
    let lost = 0, duplicated = 0;
    for (let ev = 1; ev <= n; ev++) { if (effects[ev] === 0) lost++; else if (effects[ev] > 1) duplicated += effects[ev] - 1; }
    return { n, every, crashAt, mode, effects: effects.slice(1), lost, duplicated, exact: lost === 0 && duplicated === 0, batch: [start, end], trace };
  }

  // ---------- Batch: joining a big fact table to a small one ----------
  const JOINS = {
    sortmerge: 'Sort-merge (reduce-side)',
    broadcast: 'Broadcast hash (map-side)',
    partitioned: 'Partitioned hash (map-side)',
    skewed: 'Sort-merge with the hot key split',
  };
  const BW = 100e6; // bytes per second a worker can read or receive
  const SHUFFLE = 3; // a shuffled byte is read, sent and merged: three passes against one for a local scan
  function joinCost(o = {}) {
    const clicks = num(o.clicks, 1e6, 1e11, 1e9), users = num(o.users, 1e3, 1e9, 1e6);
    const workers = Math.round(num(o.workers, 2, 2000, 100)), skew = num(o.skew, 0, 0.95, 0), memGB = num(o.memGB, 0.5, 256, 8);
    const pre = !!o.prepartitioned, cB = 100, uB = 200;
    const big = clicks * cB, small = users * uB, mem = memGB * 1e9;
    const out = { clicks, users, workers, skew, memGB, prepartitioned: pre, bigBytes: big, smallBytes: small, rows: [] };
    // `straggler` is the bytes the slowest worker must handle; `passes` is how many times each is touched.
    const row = (key, shuffled, straggler, passes, ok, note) => ({ key, label: JOINS[key], shuffled, straggler, passes, seconds: ok ? straggler * passes / BW : Infinity, ok, note });
    const even = (big + small) / workers, hot = skew * big;
    out.rows.push(row('sortmerge', big + small, Math.max(even, hot), SHUFFLE, true, skew > 0.2 ? 'One reducer receives the hot key and everyone waits for it.' : 'Both inputs are shuffled across the network, then merged.'));
    out.rows.push(row('broadcast', workers * small, small + big / workers, 1, small <= mem, small <= mem ? 'Every worker loads the small table and streams its own slice of the big one. The big table is never shuffled.' : 'The small table does not fit in a worker\'s memory.'));
    const part = small / workers;
    out.rows.push(row('partitioned', 0, Math.max(even, hot), 1, pre && part <= mem, !pre ? 'Needs both inputs to have been partitioned by the join key and sorted the same way earlier. They have not been.' : part <= mem ? 'Each worker joins its own pair of partitions with no shuffle. A hot key still makes one partition huge.' : 'Even one partition of the small table is too big for memory.'));
    out.rows.push(row('skewed', big + small + (skew > 0 ? workers * uB : 0), Math.max(even, skew > 0 ? hot / workers + even : even), SHUFFLE, true, skew > 0 ? 'The hot key\'s records are spread over many workers and its small-table row is copied to each.' : 'No hot key, so it behaves like sort-merge.'));
    const ok = out.rows.filter(r => r.ok);
    out.best = ok.reduce((m, r) => (r.seconds < m.seconds ? r : m), ok[0]).key;
    return out;
  }

  // ---------- Derived data: two writes versus one log ----------
  // Each of `keys` records is updated; a share of them are updated by two clients at once. The database and a
  // derived index must end up the same. With dual writes each client writes both systems itself; with a log the
  // database's commit order is the only order and the index replays it.
  function dualWrite(o = {}) {
    const keys = Math.round(num(o.keys, 20, 2000, 500)), conflict = num(o.conflict, 0, 1, 0.2), crash = num(o.crash, 0, 0.2, 0.02);
    const mode = o.mode === 'log' ? 'log' : 'dual', r = rng(Math.round(num(o.seed, 1, 1e6, 7)));
    let race = 0, lostSecond = 0;
    for (let i = 0; i < keys; i++) {
      if (mode === 'dual') {
        if (r() < conflict && r() < 0.5) race++;      // the two systems saw the two writes in opposite orders
        else if (r() < crash) lostSecond++;           // the client died between the two writes
      } else { r(); r(); r(); }                       // keep the random stream aligned between modes
    }
    const diverged = race + lostSecond;
    return { mode, keys, diverged, race, lostSecond, pct: Math.round(1000 * diverged / keys) / 10, converged: diverged === 0 };
  }

  // ---------- Encoding: is a schema change safe? ----------
  // Each change is [new code reads old data, old code reads new data] for a format, with the reason.
  const FORMATS = { proto: 'Protocol Buffers / Thrift', avro: 'Avro', json: 'JSON (no schema)' };
  const CHANGES = {
    addOptional: 'Add an optional field with a default',
    addRequired: 'Add a required field (no default)',
    removeOptional: 'Remove an optional field',
    removeRequired: 'Remove a required field',
    rename: 'Rename a field',
    reuseTag: 'Reuse a removed field number for something new',
    widen: 'Widen an integer from 32 to 64 bits',
  };
  const T = (ok, why) => ({ ok, why });
  const COMPAT = {
    proto: {
      addOptional: [T(1, 'Old records lack the field, so the default is used.'), T(1, 'Old code skips the unknown tag, using the type to know how many bytes to skip.')],
      addRequired: [T(0, 'Old records lack the required field, so the check fails.'), T(1, 'Old code ignores the unknown tag.')],
      removeOptional: [T(1, 'The unknown tag in old data is skipped.'), T(1, 'The missing optional field takes its default.')],
      removeRequired: [T(1, 'The unknown tag in old data is skipped.'), T(0, 'Old code requires a field that is no longer written.')],
      rename: [T(1, 'Names are not in the encoding; only the tag number matters.'), T(1, 'Same tag, same meaning.')],
      reuseTag: [T(0, 'Old data still carries the old meaning under that tag: garbage or a silent mix-up.'), T(0, 'Old code reads the new meaning as the old type.')],
      widen: [T(1, 'The parser pads the narrower value.'), T(0, 'Old code truncates a value that no longer fits in 32 bits.')],
    },
    avro: {
      addOptional: [T(1, 'The reader fills in its declared default.'), T(1, 'The old reader schema has no such field, so it is ignored.')],
      addRequired: [T(0, 'With no default there is nothing to fill in for old data.'), T(1, 'The old reader ignores the extra field.')],
      removeOptional: [T(1, 'The writer\'s extra field is ignored.'), T(1, 'The reader\'s default fills the gap (the field had one).')],
      removeRequired: [T(1, 'The writer\'s extra field is ignored.'), T(0, 'A field with no default cannot be filled when the writer omits it.')],
      rename: [T(1, 'An alias in the reader schema matches the old name.'), T(0, 'The old reader does not know the new name or an alias for it.')],
      reuseTag: [T(1, 'Avro has no field numbers; this change does not exist.'), T(1, 'Avro has no field numbers; this change does not exist.')],
      widen: [T(1, 'Schema resolution promotes int to long.'), T(0, 'A long cannot be read as an int.')],
    },
    json: {
      addOptional: [T(1, 'Readers that tolerate missing fields cope.'), T(1, 'Readers that ignore unknown fields cope.')],
      addRequired: [T(0, 'Old documents lack it, and nothing enforces a default.'), T(1, 'Old code ignores unknown keys, if it is a tolerant reader.')],
      removeOptional: [T(1, 'Tolerant readers cope.'), T(1, 'Old code treats the key as absent.')],
      removeRequired: [T(1, 'The extra key is ignored.'), T(0, 'Old code expects the key and fails.')],
      rename: [T(0, 'The name is the identity, so old documents look like they lack the field.'), T(0, 'Old code looks for the old name and finds nothing.')],
      reuseTag: [T(1, 'JSON has no field numbers; this change does not exist.'), T(1, 'JSON has no field numbers; this change does not exist.')],
      widen: [T(1, 'JSON has one number type, so nothing changes on the wire.'), T(0, 'Numbers above 2^53 lose precision in JavaScript and similar parsers.')],
    },
  };
  function compat(format, change) {
    const pair = (COMPAT[FORMATS[format] ? format : 'proto'] || {})[CHANGES[change] ? change : 'addOptional'];
    return { format, change, newReadsOld: pair[0], oldReadsNew: pair[1], backward: !!pair[0].ok, forward: !!pair[1].ok, safe: !!(pair[0].ok && pair[1].ok) };
  }
  function compatBoard(format) {
    const rows = Object.keys(CHANGES).map(c => compat(format, c));
    return { rows, safe: rows.filter(r => r.safe).length };
  }

  const api = { rng, CLOCK_STRATEGIES, clockRace, STREAM_MODES, streamRun, JOINS, joinCost, dualWrite, FORMATS, CHANGES, compat, compatBoard };
  root.DistModels = api;
})(typeof window !== 'undefined' ? window : globalThis);
