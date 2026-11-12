// Models behind the Fundamentals simulators (fund-sims.js draws them). Pure: no DOM, no I/O, seeded
// randomness, so node can test them (tests/test_fund_models.cjs). Each is a teaching model: right about
// the shape of the behaviour (who wins, what breaks first, roughly when), not a benchmark.
(function (root) {
  'use strict';
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const expo = (r, rate) => -Math.log(1 - r()) / rate;
  const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- Java: two threads, one line at a time ----------
  // A program is a list of ops per thread; run(s, t) mutates a copy of the state and may return
  // 'blocked' (stay put) or {jump: i}. Scenarios: counter++ (plain, synchronized, atomic), double-checked
  // locking (plain or volatile), and a stop flag (plain or volatile).
  const LOCK = { label: 'synchronized (lock) {', run: (s, t) => (s.mem.lock == null || s.mem.lock === t ? (s.mem.lock = t, undefined) : 'blocked') };
  const UNLOCK = { label: '}  // release lock', run: s => { s.mem.lock = null; } };
  const PROGRAMS = {
    counter(mode) {
      const inc = mode === 'atomic' ? [{ label: 'count.incrementAndGet()', run: s => { s.mem.count++; } }]
        : [{ label: 'int r = count;', run: (s, t) => { s.local[t].r = s.mem.count; } },
          { label: 'r = r + 1;', run: (s, t) => { s.local[t].r++; } },
          { label: 'count = r;', run: (s, t) => { s.mem.count = s.local[t].r; } }];
      const body = mode === 'sync' ? [LOCK, ...inc, UNLOCK] : inc;
      return { mem: { count: 0, lock: null }, threads: [[...body, ...body], [...body, ...body]] };
    },
    dcl(mode) {
      const init = { label: 'obj.config = loadConfig();  // the constructor', run: s => { s.mem.obj.config = 'loaded'; } };
      const publish = { label: mode === 'volatile' ? 'instance = obj;  // volatile write: after the constructor' : 'instance = obj;  // may be reordered before the constructor', run: s => { s.mem.instance = 'obj'; } };
      const a = [{ label: 'if (instance == null) {', run: s => (s.mem.instance ? { jump: 99 } : undefined) }, LOCK,
        { label: '  if (instance == null) {', run: s => (s.mem.instance ? { jump: 6 } : undefined) },
        { label: '    obj = new Singleton();  // memory allocated', run: s => { s.mem.obj = { config: null }; } },
        ...(mode === 'volatile' ? [init, publish] : [publish, init]), UNLOCK];
      const b = [{ label: 'Singleton i = instance;', run: (s, t) => { s.local[t].seen = s.mem.instance; } },
        { label: 'if (i != null) use(i.config);', run: (s, t) => {
          if (!s.local[t].seen) { s.local[t].note = 'saw null: would take the slow path and wait for the lock'; return; }
          s.local[t].config = s.mem.obj.config;
          if (s.mem.obj.config == null) s.flags.halfBuilt = 1; else s.flags.sawBuilt = 1;
        } }];
      return { mem: { instance: null, obj: null, lock: null }, threads: [a, b] };
    },
    flag(mode) {
      const read = { label: mode === 'volatile' ? 'while (!stop) {  // volatile read from memory' : 'while (!stop) {  // JIT may hoist this read', run: (s, t) => {
        const v = mode === 'volatile' ? s.mem.stop : (s.local[t].stop ??= s.mem.stop);
        if (v) return { jump: 2 };
        if (s.mem.stop) s.flags.missed = (s.flags.missed || 0) + 1;
      } };
      const a = [read, { label: '  work++; }', run: s => { s.mem.work++; return { jump: 0 }; } }, { label: '// stopped', run: s => { s.flags.stopped = 1; } }];
      const b = [{ label: 'Thread.sleep(…);', run: () => {} }, { label: 'stop = true;', run: s => { s.mem.stop = true; } }];
      return { mem: { stop: false, work: 0 }, threads: [a, b] };
    },
  };
  function interleave(scenario, mode) {
    const p = PROGRAMS[scenario](mode);
    return { scenario, mode, mem: p.mem, local: [{}, {}], pc: [0, 0], log: [], flags: {}, steps: 0 };
  }
  const programOf = s => PROGRAMS[s.scenario](s.mode).threads;
  const finished = (s, t) => s.pc[t] >= programOf(s)[t].length;
  function step(s0, t) {
    const prog = programOf(s0)[t];
    if (s0.pc[t] >= prog.length) return s0;
    const s = clone(s0), op = prog[s.pc[t]];
    const r = op.run(s, t);
    if (r === 'blocked') { s.log.push({ t, label: op.label, blocked: true }); s.steps++; return s; }
    s.log.push({ t, label: op.label });
    s.pc[t] = r && r.jump != null ? Math.min(r.jump, prog.length) : s.pc[t] + 1;
    s.steps++;
    if (s.log.length > 60) s.log.shift();
    return s;
  }
  // What happened, in words, once the interesting part is over.
  function verdict(s) {
    const done = finished(s, 0) && finished(s, 1);
    if (s.scenario === 'counter') {
      if (!done) return null;
      return s.mem.count === 4 ? { ok: true, text: 'count is 4: every increment landed.' } : { ok: false, lost: 4 - s.mem.count, text: `count is ${s.mem.count}, not 4: ${4 - s.mem.count} increment${4 - s.mem.count === 1 ? ' was' : 's were'} lost. Both threads read the same value before either wrote.` };
    }
    if (s.scenario === 'dcl') {
      if (s.flags.halfBuilt) return { ok: false, text: 'Thread B saw a non-null instance whose constructor had not run: config is null. That is the half-built object double-checked locking hands out without volatile.' };
      if (s.flags.sawBuilt) return { ok: true, text: 'Thread B saw a fully built instance.' };
      return done ? { ok: true, text: 'Thread B looked before anything was published, so it would have waited for the lock.' } : null;
    }
    if (s.flags.stopped) return { ok: true, text: 'The loop saw stop = true and finished.' };
    if ((s.flags.missed || 0) >= 3) return { ok: false, text: `stop is true in memory, but the loop has gone round ${s.flags.missed} more times reading its own stale copy. Nothing forces it to look again: without volatile it may never stop.` };
    return null;
  }
  function randomRun(scenario, mode, seed, limit = 80) {
    const r = rng(seed); let s = interleave(scenario, mode);
    while (s.steps < limit && !(finished(s, 0) && finished(s, 1)) && !(verdict(s) && verdict(s).ok === false && scenario !== 'counter')) {
      const live = [0, 1].filter(t => !finished(s, t));
      s = step(s, live[Math.floor(r() * live.length)]);
    }
    return s;
  }

  // ---------- Java: ThreadPoolExecutor ----------
  // execute(): fewer than core threads -> new thread; else offer to the queue; queue full and fewer than
  // max -> new thread; else the rejection policy. Idle threads above core die after keepAlive.
  function threadPool(p) {
    const P = { core: 4, max: 32, queue: 'unbounded', cap: 100, policy: 'abort', rate: 40, taskMs: 200, burst: 4, seconds: 40, burstAt: 10, burstFor: 10, keepAlive: 5, seed: 3, ...p };
    const r = rng(P.seed), dur = () => P.taskMs / 1000 * (0.6 + 0.8 * r());
    const cap = P.queue === 'sync' ? 0 : P.queue === 'unbounded' ? Infinity : P.cap;
    const rate = t => P.rate * (t >= P.burstAt && t < P.burstAt + P.burstFor ? P.burst : 1);
    const workers = [], queue = [], waits = [], lat = [], series = [];
    let rejected = 0, callerRan = 0, done = 0, callerBusy = 0, maxThreads = 0, maxQueue = 0;
    const settle = T => {
      for (;;) {
        let w = null;
        for (const x of workers) if (x.until != null && x.until <= T && (!w || x.until < w.until)) w = x;
        if (!w) break;
        done++;
        if (queue.length) { const job = queue.shift(); waits.push(w.until - job.at); const d = dur(); lat.push(w.until - job.at + d); w.until += d; }
        else { w.idle = w.until; w.until = null; }
      }
      for (let i = workers.length - 1; i >= 0 && workers.length > P.core; i--) {
        if (workers[i].until == null && workers[i].idle + P.keepAlive <= T) workers.splice(i, 1);
      }
    };
    let t = expo(r, rate(0)), sample = 0;
    while (t < P.seconds) {
      while (sample <= t) { settle(sample); series.push({ t: sample, threads: workers.length, busy: workers.filter(w => w.until != null).length, queue: queue.length }); sample += 0.5; }
      settle(t);
      const idle = workers.find(w => w.until == null);
      if (workers.length < P.core) { const d = dur(); workers.push({ until: t + d }); waits.push(0); lat.push(d); }
      else if (idle && P.queue === 'sync') { const d = dur(); idle.until = t + d; waits.push(0); lat.push(d); }
      else if (idle && !queue.length) { const d = dur(); idle.until = t + d; waits.push(0); lat.push(d); }
      else if (queue.length < cap) queue.push({ at: t });
      else if (workers.length < P.max) { const d = dur(); workers.push({ until: t + d }); waits.push(0); lat.push(d); }
      else if (P.policy === 'caller') { const d = dur(); callerRan++; lat.push(d); callerBusy = t + d; }
      else rejected++;
      maxThreads = Math.max(maxThreads, workers.length); maxQueue = Math.max(maxQueue, queue.length);
      t = Math.max(t, callerBusy) + expo(r, rate(t));
    }
    while (sample <= P.seconds) { settle(sample); series.push({ t: sample, threads: workers.length, busy: workers.filter(w => w.until != null).length, queue: queue.length }); sample += 0.5; }
    return { series, rejected, callerRan, maxThreads, maxQueue, finalQueue: queue.length, p50: pct(lat, 50), p99: pct(lat, 99), submitted: lat.length + rejected + queue.length, params: P };
  }

  // ---------- Python: the GIL, processes and asyncio ----------
  // Tasks are phases of CPU and I/O (ms). Threads share one GIL (handed over every 5 ms); processes run
  // CPU in parallel on separate cores after a start-up cost; asyncio is one thread where a coroutine runs
  // its CPU until its next await; free-threaded builds run threads' CPU in parallel, a little slower each.
  const WORKLOADS = {
    cpu: () => [{ kind: 'cpu', ms: 400 }],
    io: () => Array.from({ length: 5 }, () => [{ kind: 'cpu', ms: 4 }, { kind: 'io', ms: 80 }]).flat(),
    mixed: () => [{ kind: 'cpu', ms: 60 }, { kind: 'io', ms: 120 }, { kind: 'cpu', ms: 60 }, { kind: 'io', ms: 120 }],
  };
  function gil(p) {
    const P = { workload: 'cpu', model: 'threads', tasks: 8, pool: 8, cores: 4, ...p };
    const tasks = Array.from({ length: P.tasks }, (_, i) => ({ i, phases: WORKLOADS[P.workload](), k: 0, left: 0, worker: null, end: null, lane: [] }));
    tasks.forEach(t => { t.left = t.phases[0].ms; });
    const procs = P.model === 'processes' ? Math.min(P.pool, P.cores) : 0, START = 60;
    const slots = P.model === 'asyncio' ? Infinity : P.model === 'processes' ? procs : P.pool;
    const speed = P.model === 'free' ? 0.85 : 1;
    let holder = null, quantum = 0, loopOwner = null, ms = 0, cpuBusy = 0;
    const active = () => tasks.filter(t => t.end == null && t.worker != null);
    for (; ms < 20000 && tasks.some(t => t.end == null); ms++) {
      for (const t of tasks) if (t.end == null && t.worker == null && active().length < slots) t.worker = active().length;
      const want = active().filter(t => t.phases[t.k].kind === 'cpu' && !(P.model === 'processes' && ms < START));
      let run = [];
      if (P.model === 'threads') {
        if (!want.includes(holder) || quantum >= 5) { const order = want.filter(t => t !== holder); holder = order[0] || (want.includes(holder) ? holder : null); quantum = 0; }
        run = holder ? [holder] : [];
        quantum++;
      } else if (P.model === 'asyncio') {
        if (!want.includes(loopOwner)) loopOwner = want[0] || null;
        run = loopOwner ? [loopOwner] : [];
      } else run = want.slice(0, P.cores);
      cpuBusy += run.length;
      for (const t of tasks) {
        if (t.end != null) continue;
        const ph = t.phases[t.k];
        const state = t.worker == null ? 'queued' : P.model === 'processes' && ms < START ? 'start' : ph.kind === 'io' ? 'io' : run.includes(t) ? 'run' : 'wait';
        t.lane.push(state);
        if (state === 'io') t.left -= 1;
        if (state === 'run') t.left -= speed;
        if (t.left <= 0) { t.k++; if (t.k >= t.phases.length) t.end = ms + 1; else t.left = t.phases[t.k].ms; }
      }
    }
    const segs = tasks.map(t => { const out = []; t.lane.forEach((st, i) => { const last = out[out.length - 1]; if (last && last.state === st) last.to = i + 1; else out.push({ state: st, from: i, to: i + 1 }); }); return out; });
    const cpuWork = tasks.reduce((n, t) => n + t.phases.filter(x => x.kind === 'cpu').reduce((a, x) => a + x.ms, 0), 0);
    return { makespan: ms, segs, cpuUse: cpuBusy / Math.max(1, ms) / P.cores, cpuWork, params: P, serial: tasks.reduce((n, t) => n + t.phases.reduce((a, x) => a + x.ms, 0), 0) };
  }

  // ---------- Python: one blocking call on an event loop ----------
  // Requests arrive every `every` ms; each does a little CPU, awaits the database, does a little more.
  // At `at` ms one handler does something else for `ms`: blocking holds the loop; awaiting doesn't.
  function eventLoop(p) {
    const P = { kind: 'sleep', ms: 1000, at: 1000, every: 40, horizon: 3000, dbMs: 30, ...p };
    const holds = P.kind === 'sleep' || P.kind === 'requests' || P.kind === 'cpu';
    const reqs = [];
    for (let t = 0; t < P.horizon; t += P.every) reqs.push({ at: t, special: false });
    reqs.push({ at: P.at, special: true });
    reqs.sort((a, b) => a.at - b.at || a.special - b.special);
    let free = 0;                                   // when the loop is next free
    const ready = [];                              // [time, req, stage]
    reqs.forEach(r => ready.push([r.at, r, 0]));
    const done = [];
    while (ready.length) {
      ready.sort((a, b) => a[0] - b[0]);
      const [t, r, stage] = ready.shift();
      const start = Math.max(t, free);
      if (r.special && stage === 0) {
        if (holds) { free = start + P.ms; r.end = free; done.push(r); continue; }
        free = start + 1; ready.push([start + P.ms + (P.kind === 'thread' ? 2 : 0), r, 9]); continue;
      }
      if (stage === 9) { free = start + 1; r.end = free; done.push(r); continue; }
      if (stage === 0) { free = start + 2; ready.push([free + P.dbMs, r, 1]); continue; }
      free = start + 2; r.end = free; done.push(r);
    }
    const normal = done.filter(r => !r.special).map(r => ({ at: r.at, ms: r.end - r.at }));
    return { requests: normal, special: done.find(r => r.special), blocked: holds, worst: Math.max(...normal.map(r => r.ms)), p50: pct(normal.map(r => r.ms), 50), slow: normal.filter(r => r.ms > 200).length, params: P };
  }

  // ---------- Linux: PID 1, signals and zombies in a container ----------
  // init: 'shell' (sh -c runs the app as a child and forwards nothing), 'exec' (the app is PID 1:
  // signals without a handler are ignored, and it never reaps children it didn't start) or 'tini'.
  // The app forks a worker, which runs a helper. If the worker crashes the helper is orphaned to PID 1,
  // and when the helper exits only a real init reaps it. `handler`: the app handles SIGTERM.
  function container(init, handler) {
    const procs = init === 'exec' ? [{ pid: 1, ppid: 0, name: 'python app.py', state: 'running', app: true }]
      : [{ pid: 1, ppid: 0, name: init === 'tini' ? 'tini' : 'sh -c "python app.py"', state: 'running' }, { pid: 7, ppid: 1, name: 'python app.py', state: 'running', app: true }];
    return { init, handler: !!handler, procs, next: 20, log: [`container started: PID 1 is ${procs[0].name}`], inflight: 3, stopped: null, flags: {} };
  }
  const app = s => s.procs.find(p => p.app && p.state !== 'gone');
  function act(s0, action) {
    const s = clone(s0), a = app(s), say = t => s.log.push(t), live = p => p.state === 'running';
    if (s.stopped) return s;
    if (action === 'spawn' && a) {
      const w = s.next++, h = s.next++;
      s.procs.push({ pid: w, ppid: a.pid, name: 'worker', state: 'running', kind: 'worker' }, { pid: h, ppid: w, name: 'helper (ffmpeg)', state: 'running', kind: 'helper' });
      say(`the app forked worker ${w}, which started helper ${h}`);
    } else if (action === 'worker-crash') {
      const w = s.procs.find(p => p.kind === 'worker' && live(p));
      if (!w) { say('No worker running. Spawn one first.'); return s; }
      w.state = 'gone';
      say(`worker ${w.pid} crashed; the app wait()ed for it, its own child`);
      s.procs.filter(p => p.ppid === w.pid && p.state !== 'gone').forEach(k => { k.ppid = 1; say(`helper ${k.pid} is orphaned: re-parented to PID 1 (${s.procs[0].name})`); });
    } else if (action === 'helper-exits') {
      const h = s.procs.find(p => p.kind === 'helper' && live(p));
      if (!h) { say('No helper running. Spawn one first.'); return s; }
      const parent = s.procs.find(p => p.pid === h.ppid);
      const reaps = parent && (parent.kind === 'worker' || parent.name === 'tini');
      h.state = reaps ? 'gone' : 'zombie';
      if (reaps) say(`helper ${h.pid} exited and ${parent.kind === 'worker' ? 'its worker' : 'tini'} reaped it`);
      else { s.flags.zombie = 1; say(`helper ${h.pid} exited, but PID 1 (${parent.name}) never calls wait() for children it didn't start: a zombie, holding a PID until the container ends`); }
    } else if (action === 'stop') {
      say('docker stop: SIGTERM to PID 1, SIGKILL after 10 s');
      if (s.init === 'shell') say(`${s.procs[0].name} got SIGTERM and did not forward it: the app never heard`);
      else if (s.init === 'exec' && !s.handler) say('The app is PID 1 with no SIGTERM handler: the kernel applies no default action to PID 1, so the signal is ignored');
      else if (s.init === 'tini') say('tini forwarded SIGTERM to the app');
      if (s.init !== 'shell' && s.handler) { say(`The app stopped taking new requests, finished its ${s.inflight} in flight and exited 0`); s.stopped = { code: 0, dropped: 0, seconds: 1 }; }
      else if (s.init === 'tini') { say(`No handler, so SIGTERM's default action killed the app at once: ${s.inflight} in-flight requests cut off, exit 143`); s.stopped = { code: 143, dropped: s.inflight, seconds: 0 }; }
      else { say(`10 s later: SIGKILL. ${s.inflight} in-flight requests dropped, exit 137`); s.stopped = { code: 137, dropped: s.inflight, seconds: 10 }; }
      s.procs.forEach(p => { p.state = 'gone'; });
    }
    return s;
  }

  // ---------- Linux: a JVM against its cgroup limit ----------
  function jvmMemory(p) {
    const P = { limit: 2048, heapMode: 'xmx', xmx: 2048, pct: 75, threads: 100, stackKb: 1024, metaspace: 160, direct: 64, codeCache: 64, load: 1, pageCache: 300, ...p };
    const heapMax = P.heapMode === 'pct' ? P.limit * P.pct / 100 : P.xmx;
    const heapUsed = heapMax * Math.min(1, 0.45 + 0.55 * P.load);
    const stacks = P.threads * P.stackKb / 1024 * Math.min(1, 0.3 + 0.7 * P.load);
    const parts = [['Heap in use', heapUsed, 'heap'], ['Metaspace', P.metaspace, 'meta'], ['Thread stacks', stacks, 'stack'], ['Direct buffers', P.direct * P.load, 'direct'], ['Code cache + GC', P.codeCache + heapMax * 0.04, 'other']];
    const rss = parts.reduce((n, x) => n + x[1], 0);
    const cache = Math.max(0, Math.min(P.pageCache, P.limit - rss));
    const oom = rss > P.limit;
    return { parts, rss, heapMax, cache, oom, headroom: P.limit - rss, exit: oom ? 137 : null, javaOom: !oom && heapUsed >= heapMax * 0.999, params: P };
  }

  // ---------- Linux: a descriptor leak ----------
  function fdLeak(p) {
    const P = { rps: 50, leak: 0.02, limit: 1024, baseline: 40, pooled: false, minutes: 30, ...p };
    const per = P.pooled ? 0 : P.rps * P.leak * 60;
    const series = [], eAt = per > 0 ? (P.limit - P.baseline) / per : Infinity;
    for (let m = 0; m <= P.minutes; m += 0.5) series.push({ m, fds: Math.min(P.limit, P.baseline + per * m + (P.pooled ? 8 : 0)) });
    return { series, emfileAt: eAt, perMinute: per, params: P };
  }

  // ---------- Postgres: MVCC, two sessions ----------
  // Sessions run statements one at a time. Each row version has xmin/xmax; a snapshot lists the
  // transactions it treats as finished. Read committed takes a snapshot per statement, repeatable read
  // one per transaction. Updates wait on a row another open transaction has updated, then either reread
  // the new version (read committed) or fail with a serialization error (repeatable read).
  function mvcc(level) {
    return { level, next: 101, rows: [{ id: 1, balance: 100, xmin: 100, xmax: null }], committed: [100], aborted: [],
      s: [{ xid: null, snap: null, read: null, wait: null, error: null }, { xid: null, snap: null, read: null, wait: null, error: null }], log: [], flags: {} };
  }
  const visible = (st, v, snap, own) => {
    const done = x => x === own || (snap ? snap.includes(x) : st.committed.includes(x));
    return done(v.xmin) && !st.aborted.includes(v.xmin) && !(v.xmax != null && done(v.xmax) && !st.aborted.includes(v.xmax));
  };
  function sql(st0, who, stmt) {
    const st = clone(st0), me = st.s[who], name = who ? 'B' : 'A', say = t => st.log.push({ who: name, t });
    if (me.wait && stmt !== 'commit' && stmt !== 'rollback') { say('still waiting for the row lock'); return st; }
    if (stmt === 'vacuum') {
      const oldest = Math.min(...st.s.filter(x => x.xid).map(x => x.xid), Infinity);
      const dead = st.rows.filter(v => (v.xmax != null && st.committed.includes(v.xmax) && v.xmax < oldest) || st.aborted.includes(v.xmin));
      st.rows = st.rows.filter(v => !dead.includes(v)); st.flags.vacuumed = (st.flags.vacuumed || 0) + dead.length;
      say(`VACUUM removed ${dead.length} dead version${dead.length === 1 ? '' : 's'}${oldest < Infinity && st.rows.length > 1 ? ' (an open transaction still needs the rest)' : ''}`);
      return st;
    }
    const snapNow = () => [...st.committed];
    const snapshot = () => (st.level === 'rr' ? (me.snap ||= snapNow()) : snapNow());
    if (stmt === 'begin') { if (me.xid) return st; me.xid = st.next++; me.snap = null; me.error = null; say(`BEGIN (xid ${me.xid})`); return st; }
    if (!me.xid) { say('no open transaction: BEGIN first'); return st; }
    if (me.error && stmt !== 'rollback') { say('ERROR: current transaction is aborted, ROLLBACK first'); return st; }
    const live = () => st.rows.filter(v => visible(st, v, snapshot(), me.xid));
    if (stmt === 'select') { const v = live()[0]; me.read = v ? v.balance : null; say(`SELECT balance → ${me.read}`); return st; }
    if (stmt === 'update' || stmt === 'update-from-read' || stmt === 'for-update') {
      const head = st.rows.find(v => v.xmax == null || st.aborted.includes(v.xmax));
      const holder = head.lockedBy && head.lockedBy !== me.xid ? head.lockedBy
        : head.xmax == null && !st.committed.includes(head.xmin) && head.xmin !== me.xid && !st.aborted.includes(head.xmin) ? head.xmin : null;
      if (holder) { me.wait = { stmt, on: holder }; say(`${stmt === 'for-update' ? 'SELECT … FOR UPDATE' : 'UPDATE'} waits: xid ${holder} holds the row`); return st; }
      if (st.level === 'rr' && me.snap && !me.snap.includes(head.xmin) && head.xmin !== me.xid) {
        me.error = 'could not serialize access due to concurrent update'; st.flags.serialization = 1; say(`ERROR: ${me.error}`); return st;
      }
      if (stmt === 'for-update') { me.read = head.balance; me.locked = true; head.lockedBy = me.xid; say(`SELECT … FOR UPDATE → ${me.read} (row locked)`); return st; }
      const base = stmt === 'update-from-read' && me.read != null ? me.read : head.balance;
      const nv = { id: 1, balance: base + 10, xmin: me.xid, xmax: null, from: stmt === 'update-from-read' ? 'app' : 'db' };
      if (head.xmin !== me.xid) head.xmax = me.xid; else st.rows.splice(st.rows.indexOf(head), 1);
      st.rows.push(nv);
      say(stmt === 'update-from-read' ? `UPDATE … SET balance = ${base} + 10  (the value it read)` : `UPDATE … SET balance = balance + 10 → ${nv.balance}`);
      return st;
    }
    if (stmt === 'commit' || stmt === 'rollback') {
      const xid = me.xid;
      if (me.wait) { say('cancelled the waiting statement'); me.wait = null; }
      if (stmt === 'commit' && !me.error) st.committed.push(xid); else st.aborted.push(xid);
      st.rows.forEach(v => { if (v.lockedBy === xid) delete v.lockedBy; });
      say(stmt === 'commit' && !me.error ? `COMMIT (xid ${xid})` : `ROLLBACK (xid ${xid})`);
      Object.assign(me, { xid: null, snap: null, read: null, wait: null, error: null, locked: false });
      const other = st.s[1 - who];
      if (other.wait && other.wait.on === xid) {        // the waiter wakes up and retries its statement
        const pending = other.wait.stmt; other.wait = null;
        const woke = sql(st, 1 - who, pending);
        woke.log.splice(-1, 0, { who: who ? 'A' : 'B', t: 'woke up: the row lock is free' });
        return lost(woke);
      }
      return lost(st);
    }
    return st;
  }
  // A lost update: two committed +10s from 100 that left less than 120.
  function lost(st) {
    const latest = st.rows.filter(v => st.committed.includes(v.xmin) && (v.xmax == null || !st.committed.includes(v.xmax)))[0];
    const adds = st.rows.length && st.committed.length - 1;
    if (latest && adds >= 2 && latest.balance < 100 + 10 * adds) st.flags.lostUpdate = 1;
    return st;
  }

  // ---------- Postgres: the lock queue behind an ALTER TABLE ----------
  function lockQueue(p) {
    const P = { longQuery: 30, alterAt: 5, lockTimeout: 0, qps: 50, pool: 100, queryMs: 5, horizon: 60, ...p };
    const series = [];
    let gaveUp = false, alterStart = null, alterEnd = null, errors = 0, waiting = 0, maxWaiting = 0;
    const holdUntil = P.longQuery;
    for (let t = 0; t <= P.horizon; t += 0.5) {
      const alterWaiting = t >= P.alterAt && alterEnd == null && !gaveUp;
      if (alterWaiting && P.lockTimeout && t - P.alterAt >= P.lockTimeout) gaveUp = true;
      if (alterWaiting && !gaveUp && t >= holdUntil) { alterStart = t; alterEnd = t + 0.5; }
      const blocked = t >= P.alterAt && !gaveUp && (alterEnd == null || t < alterEnd);
      waiting = blocked ? Math.min(P.pool, waiting + P.qps * 0.5) : 0;
      const over = blocked ? Math.max(0, waiting + P.qps * 0.5 - P.pool) : 0;
      if (blocked && waiting >= P.pool) errors += P.qps * 0.5;
      maxWaiting = Math.max(maxWaiting, waiting);
      series.push({ t, waiting, errors, blocked, over });
    }
    return { series, gaveUp, alterDone: alterEnd != null, errors, maxWaiting, saturated: maxWaiting >= P.pool, params: P };
  }

  // ---------- Kubernetes: the reconcile loop and a rollout ----------
  // Every tick the Deployment controller compares desired and actual: it starts pods to reach `replicas`
  // (plus maxSurge during a rollout), and only removes old pods once new ones are Ready, keeping at
  // least replicas - maxUnavailable available. A bad image crash-loops with back-off; Ready never comes.
  function cluster(p) {
    const P = { replicas: 4, maxSurge: 1, maxUnavailable: 0, ...p };
    const pods = Array.from({ length: P.replicas }, (_, i) => ({ id: 'a' + i, v: 1, state: 'Running', ready: true, age: 30, restarts: 0, wait: 0 }));
    return { P, pods, version: 1, image: { 1: 'good' }, tick: 0, n: P.replicas, ready: P.replicas, available: true, stalled: false, log: [`Deployment web: ${P.replicas}/${P.replicas} ready on v1`], flags: {} };
  }
  function kube(s0, action) {
    const s = clone(s0), P = s.P, say = t => { s.log.push(`t=${s.tick}s ${t}`); if (s.log.length > 14) s.log.shift(); };
    if (action === 'kill') { const p = s.pods.find(x => x.state === 'Running'); if (p) { p.state = 'Gone'; say(`pod ${p.id} deleted (node drained or crashed)`); s.flags.killed = 1; } }
    if (action === 'deploy-good' || action === 'deploy-bad') { s.version++; s.image[s.version] = action === 'deploy-good' ? 'good' : 'bad'; say(`kubectl set image: v${s.version} (${s.image[s.version] === 'bad' ? 'a broken image' : 'a good image'})`); }
    if (action === 'undo') { const prev = Object.keys(s.image).map(Number).filter(v => v < s.version && s.image[v] === 'good').pop(); if (prev) { s.version++; s.image[s.version] = 'good'; say(`kubectl rollout undo: back to v${prev}'s image as v${s.version}`); } }
    if (action === 'scale-up') { P.replicas++; say(`scaled to ${P.replicas} replicas`); }
    if (action === 'tick' || action.startsWith('deploy') || action === 'kill' || action === 'undo' || action === 'scale-up') {
      s.tick += 5;
      s.pods = s.pods.filter(x => x.state !== 'Gone');
      for (const x of s.pods) {
        x.age += 5;
        if (x.state === 'Starting' && x.age >= 10) { if (s.image[x.v] === 'bad') { x.state = 'CrashLoopBackOff'; x.restarts++; x.wait = 10 * 2 ** Math.min(4, x.restarts - 1); s.flags.crashloop = 1; } else { x.state = 'Running'; x.ready = true; } }
        else if (x.state === 'CrashLoopBackOff') { x.wait -= 5; if (x.wait <= 0) { x.state = 'Starting'; x.age = 0; } }
      }
      const cur = s.pods.filter(x => x.v === s.version), old = s.pods.filter(x => x.v !== s.version);
      const ready = s.pods.filter(x => x.ready).length, minAvail = P.replicas - P.maxUnavailable;
      // scale old down only as far as availability allows
      let removable = Math.max(0, ready - minAvail);
      for (const o of old.filter(x => x.ready)) if (removable > 0 && cur.filter(x => x.ready).length + old.filter(x => x.ready && x.state !== 'Gone').length > minAvail) { o.state = 'Gone'; removable--; say(`old pod ${o.id} (v${o.v}) terminated`); }
      for (const o of old.filter(x => !x.ready)) { o.state = 'Gone'; }
      s.pods = s.pods.filter(x => x.state !== 'Gone');
      const total = s.pods.length, curNow = s.pods.filter(x => x.v === s.version).length;
      const room = P.replicas + P.maxSurge - total, need = P.replicas - curNow;
      for (let i = 0; i < Math.min(room, need); i++) { const id = 'p' + (s.n++); s.pods.push({ id, v: s.version, state: 'Starting', ready: false, age: 0, restarts: 0, wait: 0 }); say(`pod ${id} (v${s.version}) created`); }
      if (s.pods.filter(x => x.ready).length < P.replicas && !s.flags.belowAt) s.flags.belowAt = s.tick;
    }
    const readyNow = s.pods.filter(x => x.ready).length;
    s.ready = readyNow; s.available = readyNow >= P.replicas - P.maxUnavailable;
    s.stalled = s.pods.some(x => x.state === 'CrashLoopBackOff') && s.pods.filter(x => x.v === s.version && x.ready).length === 0;
    if (s.stalled) s.flags.stalled = 1;
    if (s.flags.stalled && !s.stalled && s.image[s.version] === 'good' && s.pods.every(x => x.v === s.version && x.ready)) s.flags.recovered = 1;
    return s;
  }

  // ---------- Kubernetes: scheduling, limits and eviction ----------
  // Pods are placed by requests (on the least-requested node that fits); usage above a memory limit is OOMKilled, above a CPU limit
  // throttled; when a node's memory runs out, BestEffort pods go first, then Burstable over request.
  function schedule(p) {
    const P = { nodes: 3, nodeCpu: 4, nodeMem: 8, web: { n: 6, cpuReq: 0.5, cpuLim: 1, memReq: 1, memLim: 1, cpuUse: 0.8, memUse: 0.9 },
      batch: { n: 4, cpuReq: 0, cpuLim: 0, memReq: 0, memLim: 0, cpuUse: 1.5, memUse: 2 }, ...p };
    const nodes = Array.from({ length: P.nodes }, (_, i) => ({ i, cpu: P.nodeCpu, mem: P.nodeMem, pods: [] }));
    const pods = [];
    for (const [kind, c] of [['web', P.web], ['batch', P.batch]]) for (let i = 0; i < c.n; i++) pods.push({ id: `${kind}-${i}`, kind, ...c,
      qos: c.cpuReq === 0 && c.memReq === 0 && !c.cpuLim && !c.memLim ? 'BestEffort' : c.cpuReq === c.cpuLim && c.memReq === c.memLim && c.cpuReq > 0 ? 'Guaranteed' : 'Burstable' });
    const pending = [];
    for (const pod of pods) {
      const req = x => [x.pods.reduce((a, q) => a + q.cpuReq, 0), x.pods.reduce((a, q) => a + q.memReq, 0)];
      const fits = nodes.filter(x => req(x)[0] + pod.cpuReq <= x.cpu && req(x)[1] + pod.memReq <= x.mem);
      const free = x => (x.cpu - req(x)[0]) / x.cpu + (x.mem - req(x)[1]) / x.mem - x.pods.length * 0.01;   // least requested wins
      const n = fits.sort((a, b) => free(b) - free(a))[0];
      if (n) { n.pods.push(pod); pod.node = n.i; } else { pending.push(pod); pod.state = 'Pending'; }
    }
    for (const n of nodes) {
      for (const pod of n.pods) {
        pod.state = pod.memLim && pod.memUse > pod.memLim ? 'OOMKilled' : 'Running';
        pod.throttled = pod.cpuLim && pod.cpuUse > pod.cpuLim ? pod.cpuUse / pod.cpuLim : 0;
      }
      let used = n.pods.filter(x => x.state === 'Running').reduce((a, q) => a + q.memUse, 0);
      const order = [...n.pods].filter(x => x.state === 'Running').sort((a, b) => (a.qos === 'BestEffort' ? 0 : a.qos === 'Burstable' ? 1 : 2) - (b.qos === 'BestEffort' ? 0 : b.qos === 'Burstable' ? 1 : 2) || (b.memUse - b.memReq) - (a.memUse - a.memReq));
      for (const pod of order) { if (used <= n.mem) break; if (pod.qos === 'Guaranteed') break; pod.state = 'Evicted'; used -= pod.memUse; }
      const want = n.pods.filter(x => x.state === 'Running').reduce((a, q) => a + Math.min(q.cpuUse, q.cpuLim || Infinity), 0);
      n.cpuUse = Math.min(n.cpu, want); n.memUse = used;
      n.cpuReq = n.pods.reduce((a, q) => a + q.cpuReq, 0); n.memReq = n.pods.reduce((a, q) => a + q.memReq, 0);
    }
    const count = st => pods.filter(x => x.state === st).length;
    return { nodes, pods, pending: pending.length, oom: count('OOMKilled'), evicted: count('Evicted'), throttled: pods.filter(x => x.throttled && x.state === 'Running').length, params: P };
  }

  // ---------- AWS: following a packet through a VPC ----------
  const FLOWS = [
    { id: 'web', label: 'A user opens the site', path: ['internet', 'igw', 'alb', 'app'], port: 443, want: true },
    { id: 'db', label: 'The app queries the database', path: ['app', 'db'], port: 5432, want: true },
    { id: 'egress', label: 'The app calls a payment API on the internet', path: ['app', 'nat', 'igw', 'internet'], port: 443, want: true },
    { id: 'direct', label: 'Someone on the internet connects straight to an app server', path: ['internet', 'igw', 'app'], port: 8080, want: false },
    { id: 'dbweb', label: 'Someone on the internet connects to the database', path: ['internet', 'igw', 'db'], port: 5432, want: false },
  ];
  const VPC_DEFAULT = { publicRoute: true, privateRoute: 'nat', natInPublic: true, albSg: true, appSg: 'alb', dbSg: 'app', appPublicIp: false, dbPublic: false };
  function trace(cfg0, flowId) {
    const c = { ...VPC_DEFAULT, ...cfg0 }, f = FLOWS.find(x => x.id === flowId), hops = [];
    const fail = (at, why) => ({ ok: false, at, why, hops });
    const pass = (at, why) => hops.push({ at, why });
    if (f.id === 'web') {
      if (!c.publicRoute) return fail('igw', "The public subnet's route table has no 0.0.0.0/0 → internet gateway, so the load balancer is unreachable from outside.");
      pass('igw', 'Internet gateway: the public subnet routes 0.0.0.0/0 here.');
      if (!c.albSg) return fail('alb', "The load balancer's security group doesn't allow 443 from 0.0.0.0/0.");
      pass('alb', 'Load balancer (public subnet): its security group allows 443 from anywhere.');
      if (c.appSg === 'none') return fail('app', "The app's security group allows nothing in.");
      pass('app', `App (private subnet): its security group allows 8080 from ${c.appSg === 'alb' ? "the load balancer's security group" : '0.0.0.0/0'}.`);
      return { ok: true, hops };
    }
    if (f.id === 'db') {
      if (c.dbSg === 'none') return fail('db', "The database's security group allows nothing in.");
      pass('db', `Database (isolated subnet): its security group allows 5432 from ${c.dbSg === 'app' ? "the app's security group" : '0.0.0.0/0'}. Security groups are stateful, so replies flow back.`);
      return { ok: true, hops };
    }
    if (f.id === 'egress') {
      if (c.privateRoute === 'none') return fail('nat', "The private subnet's route table has no 0.0.0.0/0 route: the call has nowhere to go.");
      if (c.privateRoute === 'igw') return c.appPublicIp ? (pass('igw', 'Straight to the internet gateway with a public IP: it works, but the app is now on the internet.'), { ok: true, hops, exposed: true })
        : fail('igw', 'The private subnet routes to the internet gateway, but the app has no public IP, so replies can never come back. Private subnets reach out through a NAT gateway.');
      if (!c.natInPublic) return fail('nat', "The NAT gateway sits in a private subnet, so its own traffic has no route to the internet gateway.");
      pass('nat', 'NAT gateway (public subnet): rewrites the source to its own public address.');
      pass('igw', 'Internet gateway → internet. Replies come back through the NAT.');
      return { ok: true, hops };
    }
    if (f.id === 'direct') {
      if (!(c.privateRoute === 'igw' && c.appPublicIp)) return fail('app', 'The app servers have no public IP and their subnet has no route from the internet gateway: nothing outside can address them.');
      if (c.appSg !== 'any') return fail('app', "The app has a public IP now, but its security group only allows the load balancer.");
      return { ok: true, hops: [{ at: 'app', why: 'Public IP, a route from the internet gateway and a security group open to 0.0.0.0/0: anyone can reach the app directly.' }] };
    }
    if (!c.dbPublic) return fail('db', 'The database is in an isolated subnet with no public IP: unreachable from the internet whatever its security group says.');
    if (c.dbSg !== 'any') return fail('db', "The database is publicly accessible, but its security group only allows the app.");
    return { ok: true, hops: [{ at: 'db', why: 'A public database with 5432 open to 0.0.0.0/0. This is how data breaches start.' }] };
  }
  function vpcScore(cfg) {
    const r = FLOWS.map(f => ({ ...f, res: trace(cfg, f.id) }));
    return { flows: r, right: r.filter(f => f.res.ok === f.want && !f.res.exposed).length, total: FLOWS.length };
  }

  // ---------- AWS: IAM policy evaluation ----------
  // Explicit deny anywhere wins; otherwise an allow from the identity policy or the resource policy
  // (same account) is needed; with a permissions boundary, the identity's allow must also be in it.
  const glob = (pat, s) => new RegExp('^' + String(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(s);
  const matches = (st, req) => [].concat(st.action).some(a => glob(a, req.action)) && [].concat(st.resource).some(r => glob(r, req.resource))
    && (!st.condition || Object.entries(st.condition).every(([k, v]) => req.context?.[k] === v));
  function evaluate(policies, req) {
    const trail = [];
    const look = (name, list) => (list || []).map(st => ({ name, st, hit: matches(st, req) })).filter(x => x.hit);
    const hits = [...look('identity', policies.identity), ...look('resource', policies.resource), ...look('boundary', policies.boundary), ...look('scp', policies.scp)];
    const deny = hits.find(h => h.st.effect === 'Deny');
    if (deny) { trail.push(`Explicit Deny in the ${deny.name} policy (${deny.st.sid || 'statement'}) wins over any Allow.`); return { decision: 'Deny', why: 'explicit', trail }; }
    if (policies.scp && !hits.some(h => h.name === 'scp' && h.st.effect === 'Allow')) { trail.push('The organisation SCP does not allow it, so nothing in the account can.'); return { decision: 'Deny', why: 'scp', trail }; }
    const idAllow = hits.find(h => h.name === 'identity' && h.st.effect === 'Allow'), resAllow = hits.find(h => h.name === 'resource' && h.st.effect === 'Allow');
    if (idAllow && policies.boundary && !hits.some(h => h.name === 'boundary' && h.st.effect === 'Allow')) {
      trail.push('The identity policy allows it, but the permissions boundary does not: a boundary caps what identity policies can grant.');
      if (!resAllow) return { decision: 'Deny', why: 'boundary', trail };
    }
    if (resAllow) { trail.push(`Allowed by the resource policy (${resAllow.st.sid || 'statement'}).`); return { decision: 'Allow', why: 'resource', trail }; }
    if (idAllow && (!policies.boundary || hits.some(h => h.name === 'boundary' && h.st.effect === 'Allow'))) { trail.push(`Allowed by the identity policy (${idAllow.st.sid || 'statement'}).`); return { decision: 'Allow', why: 'identity', trail }; }
    trail.push('No statement allows it: the default is an implicit deny.');
    return { decision: 'Deny', why: 'implicit', trail };
  }

  // ---------- CI/CD: a bad build under each deployment strategy ----------
  function deploy(p) {
    const P = { strategy: 'rolling', errorRate: 0.3, detectMin: 5, autoRollback: true, rollbackMin: 2, users: 1000, fleet: 10, minutes: 40, ...p };
    const series = []; let exposed = 0, failed = 0, rolledBackAt = null;
    const share = m => {
      if (rolledBackAt != null && m >= rolledBackAt) return 0;
      if (P.strategy === 'rolling') return Math.min(1, m / 10);
      if (P.strategy === 'bluegreen') return m >= 2 ? 1 : 0;
      if (P.strategy === 'canary') return m < 10 ? 0.01 : m < 20 ? 0.05 : m < 30 ? 0.25 : 1;
      return m >= 1 ? 0.02 : 0;                 // a feature flag on for 2% of users
    };
    const detect = m => {
      const s = share(m);
      if (P.strategy === 'canary' && P.autoRollback) return s > 0 && m >= Math.max(P.detectMin * 0.6, 3);       // automated analysis compares the canary with the baseline
      return P.autoRollback && s * P.errorRate >= 0.002 && m >= P.detectMin;
    };
    let seenAt = null;
    for (let m = 0; m <= P.minutes; m += 0.5) {
      if (seenAt == null && detect(m)) seenAt = m;
      if (seenAt != null && rolledBackAt == null) rolledBackAt = seenAt + (P.strategy === 'rolling' ? P.rollbackMin * 2 : P.strategy === 'flag' ? 0.1 : P.strategy === 'bluegreen' ? 0.2 : P.rollbackMin * 0.5);
      const s = share(m), err = s * P.errorRate;
      exposed = Math.max(exposed, s); failed += P.users * err * 0.5;
      series.push({ m, share: s, err });
    }
    return { series, exposed, failed: Math.round(failed), detectedAt: seenAt, rolledBackAt, params: P };
  }

  // ---------- CI/CD: renaming a column while two app versions run ----------
  const MIGRATION_STEPS = {
    'add-new': { label: 'Add column full_name (nullable)', schema: s => ({ ...s, full_name: 'empty' }) },
    'dual-write': { label: 'Deploy v2: writes both columns, reads fullname', app: 'v2' },
    backfill: { label: 'Backfill full_name from fullname', schema: s => (s.full_name ? { ...s, full_name: 'filled' } : s) },
    'read-new': { label: 'Deploy v3: reads and writes full_name only', app: 'v3' },
    'drop-old': { label: 'Drop column fullname', schema: s => { const n = { ...s }; delete n.fullname; return n; } },
    rename: { label: 'ALTER TABLE users RENAME fullname TO full_name', schema: s => { if (!s.fullname) return s; const n = { ...s, full_name: 'filled' }; delete n.fullname; return n; } },
    'deploy-new': { label: 'Deploy v3 (uses full_name)', app: 'v3' },
  };
  const NEEDS = { v1: { read: ['fullname'], write: ['fullname'] }, v2: { read: ['fullname'], write: ['fullname', 'full_name'] }, v3: { read: ['full_name'], write: ['full_name'] } };
  function migrate(plan) {
    let schema = { fullname: 'filled' }, running = ['v1'];
    const out = [];
    for (const id of plan) {
      const st = MIGRATION_STEPS[id];
      if (!st) continue;
      if (st.schema) schema = st.schema(schema);
      const during = st.app ? [...new Set([...running, st.app])] : running;   // a rolling deploy runs both versions for a while
      const problems = [];
      for (const v of during) {
        for (const c of NEEDS[v].read) if (!schema[c]) problems.push(`${v} reads ${c}, which no longer exists: errors`);
          else if (schema[c] === 'empty') problems.push(`${v} reads ${c}, which is still empty for old rows`);
        for (const c of NEEDS[v].write) if (!schema[c]) problems.push(`${v} writes ${c}, which no longer exists: errors`);
      }
      if (st.app) running = [st.app];
      if (st.app === 'v3' && during.includes('v1') && schema.fullname) problems.push('v1 kept writing fullname while v3 reads full_name: recent edits never reach full_name');
      out.push({ id, label: st.label, schema: { ...schema }, running: [...during], problems });
    }
    const done = !schema.fullname && schema.full_name === 'filled' && running.includes('v3');
    return { steps: out, done, broken: out.some(s => s.problems.length), clean: done && !out.some(s => s.problems.length) };
  }

  // ---------- Home lab: the reaper ----------
  // A day of agent sessions on a box: sessions open through the day, work for a while, then sit idle.
  // The fixed rule kills sessions idle 24 h, checked every 15 min; the adaptive rule checks every 30 s
  // and shrinks the idle limit as available memory falls (at most 8 kills a pass).
  function reaper(p) {
    const P = { ramGb: 8, baseGb: 3.2, perSessionGb: 0.25, sessionsPerHour: 3, rule: 'adaptive', spikeAt: 18, spikeSessions: 14, hours: 24, seed: 5, ...p };
    const r = rng(P.seed), sessions = [], series = [];
    const level = avail => (avail < 0.5 ? ['critical', 0.25] : avail < 1 ? ['high', 1] : avail < 2 ? ['low', 4] : ['normal', 24]);
    let swapFullMin = 0, killed = 0, crashed = null;
    for (let min = 0; min < P.hours * 60; min++) {
      const h = min / 60;
      const opens = (r() < P.sessionsPerHour / 60 ? 1 : 0) + (Math.abs(h - P.spikeAt) < 1 / 60 / 2 ? P.spikeSessions : 0);
      for (let i = 0; i < opens; i++) sessions.push({ open: min, workFor: 10 + r() * 50, alive: true });
      const alive = sessions.filter(s => s.alive);
      const used = P.baseGb + alive.reduce((n, s) => n + P.perSessionGb * (min - s.open < s.workFor ? 1.6 : 1), 0);
      const avail = P.ramGb - used;
      const check = P.rule === 'adaptive' ? true : min % 15 === 0;
      if (check) {
        const limitH = P.rule === 'adaptive' ? level(avail)[1] : 24;
        let n = 0;
        for (const s of alive) { const idleH = (min - s.open - s.workFor) / 60; if (idleH >= limitH && (P.rule !== 'adaptive' || n < 8)) { s.alive = false; n++; killed++; } }
      }
      swapFullMin = avail < -1.5 ? swapFullMin + 1 : 0;
      if (swapFullMin > 30 && crashed == null) crashed = min;
      series.push({ h, used: Math.min(used, P.ramGb + 2), avail, sessions: alive.length, level: level(avail)[0] });
      if (crashed != null) break;
    }
    return { series, killed, crashed, minAvail: Math.min(...series.map(x => x.avail)), params: P };
  }

  // ---------- Home lab: a pull-based deploy that rolls back ----------
  function pullDeploy(p) {
    const P = { pollMin: 2, healthWait: 1.5, rememberFailed: false, brokenAt: 4, fixedAt: 20, minutes: 30, ...p };
    const events = [], series = [];
    let running = 'good', failed = null, deployed = 'a1', head = 'a1';
    for (let m = 0; m <= P.minutes; m += 0.5) {
      if (m === P.brokenAt) { head = 'b2'; events.push({ m, text: 'Commit b2 pushed (missing an environment variable)' }); }
      if (m === P.fixedAt) { head = 'c3'; events.push({ m, text: 'Commit c3 pushed (the fix)' }); }
      let up = running === 'good' || running === 'new-good';
      if (m % P.pollMin === 0 && head !== deployed && !(P.rememberFailed && failed === head)) {
        const bad = head === 'b2';
        events.push({ m, text: `Poll: ${head} is new, build and swap` });
        if (bad) {
          events.push({ m: m + P.healthWait, text: `${head} unhealthy after 90 s: roll back to :previous` });
          if (P.rememberFailed) { failed = head; events.push({ m: m + P.healthWait, text: `${head} marked failed: not retried, alert sent` }); }
          for (let k = 0; k < P.healthWait; k += 0.5) series.push({ m: m + k, up: false });
          m += P.healthWait - 0.5;
          continue;
        }
        deployed = head; running = 'new-good';
      }
      series.push({ m, up });
    }
    const down = series.filter(x => !x.up).length * 0.5;
    return { series, events, downMinutes: down, flaps: events.filter(e => /roll back/.test(e.text)).length, params: P };
  }

  // ---------- Networking: slow start and head-of-line blocking ----------
  function slowStart(p) {
    const P = { kb: 500, rttMs: 50, initCwnd: 10, mss: 1.46, lossAt: 0, reused: false, ...p };
    let cwnd = P.reused ? 64 : P.initCwnd, sent = 0, rtts = 0, ssthresh = Infinity;
    const rounds = [];
    while (sent < P.kb && rtts < 60) {
      const send = Math.min(cwnd * P.mss, P.kb - sent);
      const loss = P.lossAt && rtts + 1 === P.lossAt;
      rounds.push({ rtt: rtts + 1, cwnd, kb: send, loss });
      sent += send; rtts++;
      if (loss) { ssthresh = Math.max(2, Math.floor(cwnd / 2)); cwnd = ssthresh; }
      else cwnd = cwnd < ssthresh ? cwnd * 2 : cwnd + 1;
    }
    const setup = P.reused ? 0 : 2;              // TCP + TLS 1.3 handshakes
    return { rounds, rtts, setup, ms: (rtts + setup) * P.rttMs, params: P };
  }
  // Many small resources over one page load. HTTP/1.1: six connections, one request at a time on each,
  // each with its own handshakes. HTTP/2: one TCP connection, streams interleaved, so a lost packet holds
  // up every byte behind it. HTTP/3: QUIC, one handshake round trip, and loss delays only its own stream.
  function hol(p) {
    const P = { proto: 'h2', loss: 0.02, streams: 12, packets: 10, rttMs: 60, seed: 11, ...p };
    const r = rng(P.seed), per = 3, n = P.streams * P.packets, lost = new Set();
    for (let i = 0; i < n; i++) if (r() < P.loss) lost.add(i);
    const out = [];
    if (P.proto === 'h1') {
      const conns = Math.min(6, P.streams), t = Array(conns).fill(2 * P.rttMs);
      for (let s = 0; s < P.streams; s++) {
        const c = s % conns; t[c] += P.rttMs;
        let extra = 0;
        for (let k = 0; k < P.packets; k++) if (lost.has(s * P.packets + k)) extra = P.rttMs;
        t[c] += P.packets * per * conns + extra;
        out.push({ stream: s, ms: t[c] });
      }
    } else {
      const start = (P.proto === 'h3' ? 1 : 2) * P.rttMs + P.rttMs, arr = i => start + (i + 1) * per;
      const at = (s, k) => s * P.packets + k;          // the server sends in priority order, stream by stream
      let held = 0;
      const fin = new Array(n);
      for (let i = 0; i < n; i++) {
        if (P.proto === 'h2') { if (lost.has(i)) held = Math.max(held, arr(i) + P.rttMs); fin[i] = Math.max(arr(i), held); }
        else fin[i] = arr(i) + (lost.has(i) ? P.rttMs : 0);
      }
      for (let s = 0; s < P.streams; s++) { let m = 0; for (let k = 0; k < P.packets; k++) m = Math.max(m, fin[at(s, k)]); out.push({ stream: s, ms: m }); }
    }
    const t = out.map(o => o.ms);
    const clean = P.loss ? hol({ ...P, loss: 0 }).streams : out;
    out.forEach((o, i) => { o.base = clean[i].ms; o.stall = o.ms - clean[i].ms; });
    return { streams: out, lost: lost.size, slowest: Math.max(...t), median: pct(t, 50), stalled: out.filter(o => o.stall > 0).length, params: P };
  }

  const api = { rng, pct, PROGRAMS, interleave, step, verdict, finished, programOf, randomRun, threadPool, WORKLOADS, gil, eventLoop,
    container, act, jvmMemory, fdLeak, mvcc, sql, visible, lockQueue, cluster, kube, schedule, FLOWS, VPC_DEFAULT, trace, vpcScore,
    evaluate, glob, deploy, MIGRATION_STEPS, migrate, reaper, pullDeploy, slowStart, hol };
  root.FundModels = api;
})(typeof window !== 'undefined' ? window : globalThis);
