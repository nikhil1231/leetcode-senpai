// Fundamentals simulators: Java threads and pools, Python's GIL and event loop, Linux processes and
// memory, Postgres MVCC and locks, Kubernetes rollouts and scheduling, a VPC packet tracer, IAM, deploy
// strategies, a column rename, the home lab's reaper and deploys, and TCP/HTTP on the wire. The models
// are pure (fund-models.js); this file draws them with the shared simulator helpers (sd-sims.js).
(function () {
  'use strict';
  if (!window.SDSims || !window.FundModels) return;
  const M = window.FundModels, { esc, fmt, ms, controls, chart, bars, stats, shell, simple } = window.SDSims.H;
  const reg = window.SDSims.register;
  const btns = list => `<div class="sim-actions">${list.map(([act, label, primary]) => `<button type="button" class="button${primary ? ' is-primary' : ''}" data-do="${act}">${esc(label)}</button>`).join('')}</div>`;
  const on = (el, f) => el.addEventListener('click', e => { const b = e.target.closest('[data-do]'); if (b && el.contains(b)) f(b.dataset.do, b); });
  const log = (items, n = 8) => `<ul class="sim-log">${items.slice(-n).map(x => `<li class="${x.cls || ''}">${esc(x.text ?? x)}</li>`).join('')}</ul>`;
  const verdictBox = v => v ? `<p class="fs-verdict is-${v.ok ? 'ok' : 'bad'}">${esc(v.text)}</p>` : '';

  // ---------- Java: interleave two threads ----------
  reg('interleave', (el, cfg, api) => {
    const st = { scenario: cfg.scenario || 'counter', mode: cfg.mode || 'plain' }, seen = { lost: 0, halfBuilt: 0, stuck: 0, fixedCounter: 0, fixedDcl: 0, fixedFlag: 0 };
    const MODES = { counter: [['plain', 'count++ (plain int)'], ['sync', 'synchronized'], ['atomic', 'AtomicInteger']], dcl: [['plain', 'plain field'], ['volatile', 'volatile field']], flag: [['plain', 'plain boolean'], ['volatile', 'volatile boolean']] };
    let s = M.interleave(st.scenario, st.mode), seed = 1;
    const { ctl, out } = shell(el);
    const defs = () => [{ key: 'scenario', label: 'Program', type: 'select', options: [['counter', 'Two threads increment a counter'], ['dcl', 'Double-checked locking'], ['flag', 'A stop flag']] },
      { key: 'mode', label: 'Fix', type: 'select', options: MODES[st.scenario] }];
    const paintCtl = () => controls(ctl, defs(), st, k => { if (k === 'scenario') st.mode = MODES[st.scenario][0][0]; s = M.interleave(st.scenario, st.mode); api.touched(); paintCtl(); paint(); });
    const lane = t => {
      const prog = M.programOf(s)[t];
      return `<div class="fs-thread"><h5>Thread ${t ? 'B' : 'A'}</h5><ol class="fs-code">${prog.map((op, i) => `<li class="${i === s.pc[t] ? 'is-pc' : ''}${i < s.pc[t] ? ' is-done' : ''}">${esc(op.label)}</li>`).join('')}${M.finished(s, t) ? '<li class="is-pc">// finished</li>' : ''}</ol>
        <p class="fs-local">${esc(Object.entries(s.local[t]).map(([k, v]) => `${k} = ${v}`).join(', ') || 'no locals yet')}</p>
        <button type="button" class="button" data-do="step-${t}" ${M.finished(s, t) ? 'disabled' : ''}>Step ${t ? 'B' : 'A'}</button></div>`;
    };
    const paint = () => {
      const v = M.verdict(s);
      if (v && !v.ok) { if (st.scenario === 'counter') seen.lost = 1; if (st.scenario === 'dcl') seen.halfBuilt = 1; if (st.scenario === 'flag') seen.stuck = 1; }
      if (v && v.ok && st.mode !== 'plain') { if (st.scenario === 'counter') seen.fixedCounter = 1; if (st.scenario === 'dcl' && s.flags.sawBuilt) seen.fixedDcl = 1; if (st.scenario === 'flag') seen.fixedFlag = 1; }
      const mem = Object.entries(s.mem).filter(([k]) => k !== 'lock' || s.mem.lock != null).map(([k, x]) => `<span><b>${esc(k)}</b> ${esc(x === null ? 'null' : typeof x === 'object' ? JSON.stringify(x) : x)}</span>`).join('');
      out.innerHTML = `<div class="fs-threads">${lane(0)}${lane(1)}</div><div class="fs-mem"><span class="sd-eyebrow">SHARED MEMORY</span>${mem}${s.mem.lock != null ? `<span>lock held by ${s.mem.lock ? 'B' : 'A'}</span>` : ''}</div>
        ${verdictBox(v)}${btns([['random', 'Random schedule'], ['reset', 'Reset']])}${log(s.log.map(x => ({ text: `${x.t ? 'B' : 'A'}: ${x.label}${x.blocked ? '  (blocked)' : ''}`, cls: x.blocked ? 'is-bad' : '' })), 6)}`;
      api.metrics({ ...seen, scenario: st.scenario });
    };
    on(el, act => {
      api.touched();
      if (act.startsWith('step-')) s = M.step(s, Number(act.slice(5)));
      if (act === 'reset') s = M.interleave(st.scenario, st.mode);
      if (act === 'random') s = M.randomRun(st.scenario, st.mode, seed++);
      paint();
    });
    paintCtl(); paint();
    return { destroy() {} };
  });

  // ---------- Java: ThreadPoolExecutor ----------
  reg('threadpool', (el, cfg, api) => simple(el, cfg, api,
    { core: 4, max: 32, queue: 'unbounded', cap: 100, policy: 'abort', rate: 40, taskMs: 200, burst: 4 },
    [{ key: 'core', label: 'corePoolSize', min: 1, max: 32 }, { key: 'max', label: 'maximumPoolSize', min: 1, max: 64 },
      { key: 'queue', label: 'Work queue', type: 'select', options: [['unbounded', 'LinkedBlockingQueue (unbounded)'], ['bounded', 'ArrayBlockingQueue (bounded)'], ['sync', 'SynchronousQueue (no queue)']] },
      { key: 'cap', label: 'Queue capacity', min: 10, max: 1000, step: 10 },
      { key: 'policy', label: 'When saturated', type: 'select', options: [['abort', 'AbortPolicy (throw)'], ['caller', 'CallerRunsPolicy'], ['discard', 'DiscardPolicy']] },
      { key: 'rate', label: 'Tasks / s (normal)', min: 5, max: 200, step: 5 }, { key: 'taskMs', label: 'Task time', min: 20, max: 1000, step: 20, fmt: v => v + ' ms' },
      { key: 'burst', label: 'Burst ×, 10 s to 20 s', min: 1, max: 8, step: 0.5, fmt: v => v + '×' }],
    s => {
      const r = M.threadPool({ ...s, max: Math.max(s.max, s.core) });
      const cap = s.core / (s.taskMs / 1000), peak = s.rate * s.burst;
      return { metrics: { maxThreads: r.maxThreads, rejected: r.rejected, p99: r.p99, unbounded: s.queue === 'unbounded' ? 1 : 0, core: s.core, callerRan: r.callerRan, maxQueue: r.maxQueue },
        html: stats([{ label: 'Most threads', value: `${r.maxThreads} of max ${Math.max(s.max, s.core)}`, tone: s.queue === 'unbounded' && r.maxThreads === s.core && peak > cap ? 'warn' : '' },
          { label: 'Longest queue', value: fmt(r.maxQueue), tone: r.maxQueue > 500 ? 'bad' : '' }, { label: s.policy === 'caller' ? 'Ran on the caller' : 'Rejected', value: fmt(s.policy === 'caller' ? r.callerRan : r.rejected), tone: r.rejected ? 'bad' : '' },
          { label: 'p50 / p99 time', value: `${ms(r.p50 * 1000)} / ${ms(r.p99 * 1000)}`, tone: r.p99 > 5 ? 'bad' : '' }])
          + chart({ series: [{ label: 'Threads', cls: 's1', values: r.series.map(x => x.threads) }, { label: 'Busy', cls: 's4', values: r.series.map(x => x.busy) }, { label: 'Queued', cls: 's2', values: r.series.map(x => Math.min(x.queue, 400)) }],
            xMax: 40, xLabel: 'seconds', yLabel: 'threads / tasks', bands: [{ from: 10, to: 20, label: 'burst' }] })
          + `<p class="sim-note">${s.queue === 'unbounded' ? 'With an unbounded queue the offer never fails, so the pool never grows past core: maximumPoolSize does nothing, and the queue (and latency) grows instead.' : s.queue === 'sync' ? 'With no queue, a task needs a free thread straight away: the pool grows to max quickly, then rejects.' : 'Threads beyond core start only once the queue is full. That ordering surprises people: queue first, then grow.'}</p>` };
    }));

  // ---------- Python: the GIL ----------
  const LANE = { run: 'Running', wait: 'Waiting for the GIL / CPU', io: 'Waiting on I/O', queued: 'Queued (no free worker)', start: 'Starting a process' };
  const gantt = (r, width = 640) => {
    const scale = width / Math.max(1, r.makespan);
    return `<div class="fs-gantt">${r.segs.map((segs, i) => `<div class="fs-lane"><span>task ${i + 1}</span><svg viewBox="0 0 ${width} 12" preserveAspectRatio="none">${segs.map(g => `<rect class="fs-${g.state}" x="${g.from * scale}" width="${Math.max(0.5, (g.to - g.from) * scale)}" y="0" height="12"/>`).join('')}</svg></div>`).join('')}
      <div class="fs-gantt-key">${Object.entries(LANE).map(([k, l]) => `<span class="fs-${k}">${l}</span>`).join('')}</div></div>`;
  };
  reg('gil', (el, cfg, api) => simple(el, cfg, api, { workload: 'cpu', model: 'threads', tasks: 8, pool: 8 },
    [{ key: 'workload', label: 'Workload', type: 'select', options: [['cpu', 'CPU-bound (400 ms of maths each)'], ['io', 'I/O-bound (HTTP calls)'], ['mixed', 'Mixed']] },
      { key: 'model', label: 'Run them with', type: 'select', options: [['threads', 'ThreadPoolExecutor (GIL)'], ['processes', 'ProcessPoolExecutor'], ['asyncio', 'asyncio (one thread)'], ['free', 'Threads on free-threaded 3.13t']] },
      { key: 'tasks', label: 'Tasks', min: 2, max: 16 }, { key: 'pool', label: 'Pool size', min: 1, max: 16 }],
    s => {
      const r = M.gil({ ...s, cores: 4 }), base = M.gil({ ...s, model: 'threads', pool: 1 });
      return { metrics: { makespan: r.makespan, speedup: Math.round(base.makespan / r.makespan * 10) / 10, workload: s.workload, model: s.model },
        html: stats([{ label: 'Wall time', value: ms(r.makespan) }, { label: 'Speed-up vs one thread', value: (base.makespan / r.makespan).toFixed(1) + '×', tone: base.makespan / r.makespan > 2 ? 'ok' : '' },
          { label: 'CPU use (4 cores)', value: Math.round(r.cpuUse * 100) + '%' }]) + gantt(r) };
    }));

  // ---------- Python: one blocking call on the event loop ----------
  reg('eventloop', (el, cfg, api) => simple(el, cfg, api, { kind: 'sleep', ms: 1000 },
    [{ key: 'kind', label: 'At 1 s, one handler…', type: 'select', options: [['sleep', 'calls time.sleep()'], ['requests', 'calls requests.get() (blocking)'], ['cpu', 'parses a huge JSON (CPU)'], ['asleep', 'awaits asyncio.sleep()'], ['thread', 'awaits asyncio.to_thread(blocking)']] },
      { key: 'ms', label: 'For', min: 100, max: 2000, step: 100, fmt: v => v + ' ms' }],
    s => {
      const r = M.eventLoop(s);
      return { metrics: { worst: r.worst, slow: r.slow, blocked: r.blocked ? 1 : 0, kind: s.kind },
        html: stats([{ label: 'Other requests over 200 ms', value: String(r.slow), tone: r.slow ? 'bad' : 'ok' }, { label: 'Worst latency', value: ms(r.worst), tone: r.worst > 200 ? 'bad' : '' }, { label: 'Typical latency', value: ms(r.p50) }])
          + chart({ series: [{ label: 'Latency of every other request (ms)', cls: 's3', values: r.requests.map(x => x.ms) }], xMax: 3000, xLabel: 'arrival (ms)', yLabel: 'latency (ms)', bands: [{ from: 1000, to: 1000 + s.ms, label: r.blocked ? 'loop blocked' : 'awaiting' }] })
          + `<p class="sim-note">${r.blocked ? 'The loop is one thread. While that handler holds it, nothing else runs: every request that arrived meanwhile waits, then they all finish at once.' : 'Awaiting hands control back to the loop, so other requests carry on. to_thread moves the blocking work onto a worker thread and awaits the result.'}</p>` };
    }));

  // ---------- Linux: PID 1 in a container ----------
  reg('pid1', (el, cfg, api) => {
    const st = { init: 'shell', handler: true }, seen = { zombie: 0, killed: 0, graceful: 0, reaped: 0 };
    let s = M.container(st.init, st.handler);
    const { ctl, out } = shell(el);
    controls(ctl, [{ key: 'init', label: 'Container entrypoint', type: 'select', options: [['shell', 'CMD python app.py  (shell form: sh -c)'], ['exec', 'CMD ["python", "app.py"]  (exec form)'], ['tini', 'docker run --init  (tini as PID 1)']] },
      { key: 'handler', label: 'The app handles SIGTERM (drains, then exits)', type: 'toggle' }], st, () => { s = M.container(st.init, st.handler); api.touched(); paint(); });
    const tree = (pid, depth = 0) => s.procs.filter(p => p.ppid === pid).map(p => `<li class="fs-proc is-${p.state}" style="--d:${depth}"><b>${p.pid}</b> ${esc(p.name)} <em>${p.state === 'running' ? '' : p.state}</em></li>${tree(p.pid, depth + 1)}`).join('');
    const paint = () => {
      if (s.flags.zombie) seen.zombie = 1;
      if (s.stopped) { if (s.stopped.code === 137) seen.killed = 1; if (s.stopped.code === 0) seen.graceful = 1; }
      if (s.log.some(l => /tini reaped/.test(l))) seen.reaped = 1;
      out.innerHTML = `<ul class="fs-tree">${tree(0)}</ul>${s.stopped ? stats([{ label: 'Exit code', value: String(s.stopped.code), tone: s.stopped.code ? 'bad' : 'ok' }, { label: 'Requests dropped', value: String(s.stopped.dropped), tone: s.stopped.dropped ? 'bad' : 'ok' }, { label: 'Time to stop', value: s.stopped.seconds + ' s' }]) : ''}
        ${btns([['spawn', 'App forks a worker + helper'], ['worker-crash', 'Worker crashes'], ['helper-exits', 'Helper exits'], ['stop', 'docker stop', true], ['reset', 'Restart container']])}${log(s.log.map(t => ({ text: t, cls: /zombie|SIGKILL|ignored|never heard|cut off/.test(t) ? 'is-bad' : /exited 0|reaped/.test(t) ? 'is-ok' : '' })), 7)}`;
      api.metrics({ ...seen, init: st.init });
    };
    on(el, act => { api.touched(); s = act === 'reset' ? M.container(st.init, st.handler) : M.act(s, act); paint(); });
    paint();
    return { destroy() {} };
  });

  // ---------- Linux: a JVM against its cgroup limit ----------
  reg('jvmmem', (el, cfg, api) => simple(el, cfg, api, { limit: 2048, heapMode: 'xmx', xmx: 2048, pct: 75, threads: 100, direct: 64, load: 1 },
    [{ key: 'limit', label: 'Pod memory limit', min: 512, max: 4096, step: 128, fmt: v => v + ' MiB' },
      { key: 'heapMode', label: 'Heap size from', type: 'select', options: [['xmx', '-Xmx (fixed)'], ['pct', '-XX:MaxRAMPercentage']] },
      { key: 'xmx', label: '-Xmx', min: 256, max: 4096, step: 128, fmt: v => v + ' MiB' }, { key: 'pct', label: 'MaxRAMPercentage', min: 25, max: 95, step: 5, fmt: v => v + '%' },
      { key: 'threads', label: 'Threads', min: 20, max: 800, step: 20 }, { key: 'direct', label: 'Direct buffers (Netty…)', min: 0, max: 512, step: 32, fmt: v => v + ' MiB' },
      { key: 'load', label: 'Load', min: 0.2, max: 1, step: 0.1, fmt: v => Math.round(v * 100) + '%' }],
    s => {
      const r = M.jvmMemory(s);
      return { metrics: { oom: r.oom ? 1 : 0, headroom: Math.round(r.headroom), heapMode: s.heapMode, load: s.load },
        html: stats([{ label: 'Process RSS', value: Math.round(r.rss) + ' MiB', tone: r.oom ? 'bad' : r.headroom < 150 ? 'warn' : 'ok' }, { label: 'Heap max', value: Math.round(r.heapMax) + ' MiB' },
          { label: r.oom ? 'Outcome' : 'Headroom', value: r.oom ? 'OOMKilled · exit 137' : Math.round(r.headroom) + ' MiB', tone: r.oom ? 'bad' : '' }])
          + `<div class="fs-stack">${r.parts.map(([l, v, c]) => `<i class="fs-m-${c}" style="width:${100 * v / Math.max(s.limit, r.rss)}%" title="${esc(l)}: ${Math.round(v)} MiB"></i>`).join('')}${r.cache ? `<i class="fs-m-cache" style="width:${100 * r.cache / Math.max(s.limit, r.rss)}%" title="Page cache (reclaimable)"></i>` : ''}<em style="left:${100 * s.limit / Math.max(s.limit, r.rss)}%"></em></div>
          <div class="fs-gantt-key">${r.parts.map(([l, , c]) => `<span class="fs-m-${c}">${esc(l)}</span>`).join('')}<span class="fs-m-cache">Page cache (reclaimed first)</span><span class="fs-limit">cgroup limit</span></div>
          <p class="sim-note">${r.oom ? 'The heap is only part of the process. When everything together passes the cgroup limit the kernel sends SIGKILL: no Java OutOfMemoryError, no stack trace, just exit 137.' : 'Everything fits. Page cache counts against the cgroup too, but the kernel reclaims it before killing anything.'}</p>` };
    }));

  // ---------- Linux: a file-descriptor leak ----------
  reg('fdleak', (el, cfg, api) => simple(el, cfg, api, { rps: 50, leak: 2, limit: 1024, pooled: false },
    [{ key: 'rps', label: 'Requests / s', min: 5, max: 500, step: 5 }, { key: 'leak', label: 'Requests that leak a socket', min: 0, max: 20, step: 0.5, fmt: v => v + '%' },
      { key: 'limit', label: 'ulimit -n', type: 'select', options: [[1024, '1024'], [65536, '65536']] }, { key: 'pooled', label: 'One shared, pooled HTTP client', type: 'toggle' }],
    s => {
      const r = M.fdLeak({ ...s, leak: s.leak / 100, limit: Number(s.limit) });
      return { metrics: { emfileAt: r.emfileAt, pooled: s.pooled ? 1 : 0, limit: Number(s.limit) },
        html: stats([{ label: 'Leaked per minute', value: fmt(r.perMinute) }, { label: '"Too many open files" after', value: isFinite(r.emfileAt) ? (r.emfileAt < 60 ? r.emfileAt.toFixed(1) + ' min' : (r.emfileAt / 60).toFixed(1) + ' h') : 'never', tone: isFinite(r.emfileAt) ? 'bad' : 'ok' }])
          + chart({ series: [{ label: 'Open descriptors (ls /proc/<pid>/fd | wc -l)', cls: 's2', values: r.series.map(x => x.fds) }], xMax: 30, xLabel: 'minutes', hlines: [{ y: Number(s.limit), label: 'ulimit', cls: 'is-limit' }] })
          + `<p class="sim-note">${s.pooled ? 'A pooled client reuses a handful of connections: the count is flat.' : Number(s.limit) > 1024 && r.perMinute ? 'A higher limit only buys time: a count that keeps climbing is a leak.' : 'A count that keeps climbing is a leak. Fix the code (close it, or share one client) before raising the limit.'}</p>` };
    }));

  // ---------- Postgres: MVCC with two sessions ----------
  reg('mvcc', (el, cfg, api) => {
    const st = { level: 'rc' }, seen = { lostUpdate: 0, serialization: 0, vacuumed: 0, safe: 0 };
    let s = M.mvcc(st.level);
    const { ctl, out } = shell(el);
    controls(ctl, [{ key: 'level', label: 'Isolation level', type: 'select', options: [['rc', 'READ COMMITTED (default)'], ['rr', 'REPEATABLE READ']] }], st, () => { s = M.mvcc(st.level); api.touched(); paint(); });
    const STMTS = [['begin', 'BEGIN'], ['select', 'SELECT balance'], ['update-from-read', 'UPDATE … = (what I read) + 10'], ['update', 'UPDATE … = balance + 10'], ['for-update', 'SELECT … FOR UPDATE'], ['commit', 'COMMIT'], ['rollback', 'ROLLBACK']];
    const session = w => {
      const me = s.s[w];
      return `<div class="fs-thread"><h5>Session ${w ? 'B' : 'A'} ${me.xid ? `<small>xid ${me.xid}</small>` : ''}${me.wait ? ' <small class="fs-bad">waiting</small>' : ''}${me.error ? ' <small class="fs-bad">error</small>' : ''}</h5>
        <div class="fs-sql">${STMTS.map(([k, l]) => `<button type="button" class="button" data-do="${w}:${k}">${esc(l)}</button>`).join('')}</div>
        <p class="fs-local">${me.read != null ? `last read: ${me.read}` : 'nothing read yet'}${me.snap ? ` · snapshot sees xids ${me.snap.join(', ')}` : ''}</p></div>`;
    };
    const paint = () => {
      Object.keys(seen).forEach(k => { if (s.flags[k]) seen[k] = 1; });
      const committed = s.rows.filter(v => s.committed.includes(v.xmin) && !(v.xmax && s.committed.includes(v.xmax)));
      if (!s.flags.lostUpdate && committed.length && committed[0].balance >= 120 && s.committed.length >= 3) seen.safe = 1;
      const vis = w => s.s[w].xid ? s.rows.filter(v => M.visible(s, v, st.level === 'rr' ? s.s[w].snap : null, s.s[w].xid)).map(v => v) : [];
      out.innerHTML = `<div class="fs-threads">${session(0)}${session(1)}</div>
        <table class="fs-table"><thead><tr><th>Row version</th><th>balance</th><th>xmin (made by)</th><th>xmax (ended by)</th><th>A sees</th><th>B sees</th></tr></thead><tbody>
        ${s.rows.map((v, i) => `<tr class="${v.xmax && s.committed.includes(v.xmax) ? 'is-dead' : ''}"><td>v${i + 1}</td><td><b>${v.balance}</b></td><td>${v.xmin}${s.committed.includes(v.xmin) ? '' : s.aborted.includes(v.xmin) ? ' (aborted)' : ' (open)'}</td><td>${v.xmax || '–'}${v.lockedBy ? ` · locked by ${v.lockedBy}` : ''}</td><td>${vis(0).includes(v) ? '●' : ''}</td><td>${vis(1).includes(v) ? '●' : ''}</td></tr>`).join('')}</tbody></table>
        ${s.flags.lostUpdate ? verdictBox({ ok: false, text: 'Lost update: both sessions added 10 to what they had read, so one +10 vanished. Fix: UPDATE … SET balance = balance + 10, SELECT … FOR UPDATE, or REPEATABLE READ with a retry.' }) : s.flags.serialization ? verdictBox({ ok: true, text: 'REPEATABLE READ refused to overwrite a change its snapshot never saw: retry the transaction.' }) : ''}
        ${btns([['vacuum', 'VACUUM'], ['reset', 'Reset table']])}${log(s.log.map(x => ({ text: `${x.who}: ${x.t}`, cls: /ERROR|waits/.test(x.t) ? 'is-bad' : '' })), 7)}`;
      api.metrics({ ...seen, level: st.level });
    };
    on(el, act => {
      api.touched();
      if (act === 'reset') s = M.mvcc(st.level);
      else if (act === 'vacuum') s = M.sql(s, 0, 'vacuum');
      else { const [w, stmt] = act.split(':'); s = M.sql(s, Number(w), stmt); }
      paint();
    });
    paint();
    return { destroy() {} };
  });

  // ---------- Postgres: the lock queue behind ALTER TABLE ----------
  reg('lockqueue', (el, cfg, api) => simple(el, cfg, api, { longQuery: 30, lockTimeout: 0, qps: 50, pool: 100 },
    [{ key: 'longQuery', label: 'A report query started at 0 s runs for', min: 5, max: 60, step: 5, fmt: v => v + ' s' },
      { key: 'lockTimeout', label: "Migration's lock_timeout (0 = none)", min: 0, max: 10, step: 0.5, fmt: v => v ? v + ' s' : 'none' },
      { key: 'qps', label: 'App queries / s on the table', min: 10, max: 200, step: 10 }, { key: 'pool', label: 'Connection pool size', min: 20, max: 300, step: 10 }],
    s => {
      const r = M.lockQueue(s);
      return { metrics: { errors: Math.round(r.errors), gaveUp: r.gaveUp ? 1 : 0, saturated: r.saturated ? 1 : 0, lockTimeout: s.lockTimeout },
        html: stats([{ label: 'Queries queued behind the ALTER', value: fmt(r.maxWaiting), tone: r.saturated ? 'bad' : r.maxWaiting ? 'warn' : '' },
          { label: 'Requests failed (pool exhausted)', value: fmt(r.errors), tone: r.errors ? 'bad' : 'ok' }, { label: 'Migration', value: r.gaveUp ? 'gave up, retry later' : r.alterDone ? 'done' : 'still waiting' }])
          + chart({ series: [{ label: 'Queries waiting for a lock', cls: 's2', values: r.series.map(x => x.waiting) }], xMax: 60, xLabel: 'seconds', hlines: [{ y: s.pool, label: 'pool size', cls: 'is-limit' }], bands: [{ from: 0, to: s.longQuery, label: 'report holds ACCESS SHARE' }], vlines: [{ x: 5, label: 'ALTER TABLE asks for ACCESS EXCLUSIVE' }] })
          + `<p class="sim-note">The ALTER can't start until the report finishes, and while it waits in the lock queue every new query on the table queues behind it, even plain SELECTs. ${s.lockTimeout ? 'With lock_timeout the migration gives up quickly, the queue drains, and it can retry when the table is quiet.' : 'Set lock_timeout on the migration so it fails fast instead of taking the table down with it.'}</p>` };
    }));

  // ---------- Kubernetes: reconcile and roll out ----------
  reg('rollout', (el, cfg, api) => {
    const st = { replicas: 4, maxSurge: 1, maxUnavailable: 0 }, seen = { killed: 0, healed: 0, crashloop: 0, recovered: 0, rolled: 0 };
    let s = M.cluster(st), timer = null;
    const { ctl, out } = shell(el);
    controls(ctl, [{ key: 'maxSurge', label: 'maxSurge', min: 0, max: 3 }, { key: 'maxUnavailable', label: 'maxUnavailable', min: 0, max: 3 }], st, () => { if (!st.maxSurge && !st.maxUnavailable) st.maxSurge = 1; s = M.cluster(st); api.touched(); paint(); });
    const paint = () => {
      if (s.flags.killed && s.ready >= s.P.replicas) seen.killed = seen.healed = 1;
      if (s.flags.crashloop) seen.crashloop = 1; if (s.flags.recovered) seen.recovered = 1;
      if (s.version > 1 && s.image[s.version] === 'good' && s.pods.every(p => p.v === s.version && p.ready)) seen.rolled = 1;
      out.innerHTML = stats([{ label: 'Ready / desired', value: `${s.ready} / ${s.P.replicas}`, tone: s.ready < s.P.replicas - s.P.maxUnavailable ? 'bad' : s.ready < s.P.replicas ? 'warn' : 'ok' }, { label: 'Image', value: `v${s.version} (${s.image[s.version]})`, tone: s.image[s.version] === 'bad' ? 'bad' : '' }, { label: 'Rollout', value: s.stalled ? 'stalled' : s.pods.some(p => p.v !== s.version) ? 'in progress' : 'complete', tone: s.stalled ? 'bad' : '' }])
        + `<div class="fs-pods">${s.pods.map(p => `<span class="fs-pod is-${p.state === 'Running' ? 'run' : p.state === 'Starting' ? 'start' : 'crash'}"><b>${esc(p.id)}</b>v${p.v} · ${esc(p.state)}${p.restarts ? ` · ${p.restarts} restarts` : ''}</span>`).join('')}</div>
        ${btns([['tick', '▶ 5 s'], ['play', timer ? '⏸ Pause' : '▶ Play', true], ['kill', 'Delete a pod'], ['deploy-good', 'Deploy a good image'], ['deploy-bad', 'Deploy a broken image'], ['undo', 'kubectl rollout undo'], ['reset', 'Reset']])}${log(s.log, 7)}
        <p class="sim-note">The controller never "restarts" anything: each tick it compares desired with actual and acts on the gap. With maxUnavailable 0 a broken image can't take down the old pods, because they're only removed once new ones are Ready.</p>`;
      api.metrics(seen);
    };
    const stop = () => { clearInterval(timer); timer = null; };
    on(el, act => {
      api.touched();
      if (act === 'play') { if (timer) stop(); else timer = setInterval(() => { if (!el.isConnected) return stop(); s = M.kube(s, 'tick'); paint(); }, 700); }
      else if (act === 'reset') { stop(); s = M.cluster(st); }
      else s = M.kube(s, act);
      paint();
    });
    paint();
    return { destroy: stop };
  });

  // ---------- Kubernetes: requests, limits, QoS ----------
  reg('scheduler', (el, cfg, api) => simple(el, cfg, api, { webN: 6, webCpuReq: 0.5, webCpuLim: 1, webMem: 1, webCpuUse: 0.8, webMemUse: 0.9, batchN: 4, batchMemUse: 2, batchReq: false, nodes: 3 },
    [{ key: 'nodes', label: 'Nodes (4 CPU, 8 GiB each)', min: 1, max: 5 }, { key: 'webN', label: 'web replicas', min: 1, max: 20 },
      { key: 'webCpuReq', label: 'web CPU request', min: 0.1, max: 4, step: 0.1, fmt: v => v.toFixed(1) }, { key: 'webCpuLim', label: 'web CPU limit (0 = none)', min: 0, max: 4, step: 0.1, fmt: v => v ? v.toFixed(1) : 'none' },
      { key: 'webCpuUse', label: 'web CPU actually used', min: 0.1, max: 3, step: 0.1, fmt: v => v.toFixed(1) },
      { key: 'webMem', label: 'web memory request = limit', min: 0.25, max: 4, step: 0.25, fmt: v => v + ' GiB' }, { key: 'webMemUse', label: 'web memory actually used', min: 0.25, max: 4, step: 0.05, fmt: v => v.toFixed(2) + ' GiB' },
      { key: 'batchN', label: 'batch pods (no requests: BestEffort)', min: 0, max: 12 }, { key: 'batchMemUse', label: 'batch memory used', min: 0.5, max: 4, step: 0.5, fmt: v => v + ' GiB' },
      { key: 'batchReq', label: 'Give batch requests (2 GiB, 0.5 CPU)', type: 'toggle' }],
    s => {
      const r = M.schedule({ nodes: s.nodes, web: { n: s.webN, cpuReq: s.webCpuReq, cpuLim: s.webCpuLim, memReq: s.webMem, memLim: s.webMem, cpuUse: s.webCpuUse, memUse: s.webMemUse },
        batch: s.batchReq ? { n: s.batchN, cpuReq: 0.5, cpuLim: 0, memReq: 2, memLim: 4, cpuUse: 1.5, memUse: s.batchMemUse } : { n: s.batchN, cpuReq: 0, cpuLim: 0, memReq: 0, memLim: 0, cpuUse: 1.5, memUse: s.batchMemUse } });
      const web = r.pods.find(p => p.kind === 'web');
      return { metrics: { pending: r.pending, oom: r.oom, evicted: r.evicted, throttled: r.throttled },
        html: stats([{ label: 'Pending (no node fits)', value: String(r.pending), tone: r.pending ? 'bad' : '' }, { label: 'OOMKilled', value: String(r.oom), tone: r.oom ? 'bad' : '' }, { label: 'Evicted', value: String(r.evicted), tone: r.evicted ? 'bad' : '' }, { label: 'CPU-throttled', value: String(r.throttled), tone: r.throttled ? 'warn' : '' }, { label: 'web QoS', value: web ? web.qos : '–' }])
          + `<div class="fs-nodes">${r.nodes.map(n => `<div class="fs-node"><h5>node-${n.i + 1}</h5>${bars([{ label: 'CPU requested', value: n.cpuReq, text: `${n.cpuReq.toFixed(1)} / ${n.cpu}`, cls: n.cpuReq > n.cpu ? 'is-dead' : '' }, { label: 'Memory used', value: n.memUse, text: `${n.memUse.toFixed(1)} / ${n.mem} GiB`, cls: n.memUse > n.mem * 0.95 ? 'is-warn' : '' }].map(b => ({ ...b, value: b.value })), n.mem)}
            <div class="fs-pods">${n.pods.map(p => `<span class="fs-pod is-${p.state === 'Running' ? (p.throttled ? 'start' : 'run') : 'crash'}" title="${esc(p.qos)}"><b>${esc(p.id)}</b>${esc(p.state)}${p.throttled && p.state === 'Running' ? ' · throttled' : ''}</span>`).join('')}</div></div>`).join('')}</div>
          ${r.pending ? `<div class="fs-pods">${r.pods.filter(p => p.state === 'Pending').map(p => `<span class="fs-pod is-crash"><b>${esc(p.id)}</b>Pending</span>`).join('')}</div>` : ''}
          <p class="sim-note">The scheduler places pods by <b>requests</b>, not by what they use. Limits bite at runtime: over a memory limit is OOMKilled, over a CPU limit is throttled (latency, not errors). When a node runs out of memory, BestEffort pods are evicted first.</p>` };
    }));

  // ---------- AWS: VPC packet tracer ----------
  reg('vpc', (el, cfg, api) => {
    const st = { ...M.VPC_DEFAULT, ...(cfg.start || {}) };
    const { ctl, out } = shell(el);
    controls(ctl, [{ key: 'publicRoute', label: 'Public subnet: 0.0.0.0/0 → internet gateway', type: 'toggle' },
      { key: 'privateRoute', label: 'Private subnet: 0.0.0.0/0 →', type: 'select', options: [['nat', 'NAT gateway'], ['igw', 'internet gateway'], ['none', 'no default route']] },
      { key: 'natInPublic', label: 'NAT gateway sits in the public subnet', type: 'toggle' }, { key: 'appPublicIp', label: 'App servers get public IPs', type: 'toggle' },
      { key: 'albSg', label: 'ALB security group: 443 from 0.0.0.0/0', type: 'toggle' },
      { key: 'appSg', label: 'App security group: 8080 from', type: 'select', options: [['alb', "the ALB's security group"], ['any', '0.0.0.0/0'], ['none', 'nothing']] },
      { key: 'dbSg', label: 'DB security group: 5432 from', type: 'select', options: [['app', "the app's security group"], ['any', '0.0.0.0/0'], ['none', 'nothing']] },
      { key: 'dbPublic', label: 'Database "publicly accessible"', type: 'toggle' }], st, () => { api.touched(); paint(); });
    const paint = () => {
      const r = M.vpcScore(st);
      out.innerHTML = stats([{ label: 'Flows behaving as they should', value: `${r.right} of ${r.total}`, tone: r.right === r.total ? 'ok' : 'warn' }])
        + r.flows.map(f => { const good = f.res.ok === f.want && !f.res.exposed; return `<div class="fs-flow is-${good ? 'ok' : 'bad'}"><b>${f.want ? '' : '✗ should fail: '}${esc(f.label)}</b><span>${f.res.ok ? (f.want ? (f.res.exposed ? '⚠ works, but exposed' : '✓ reaches it') : '⚠ it gets through') : (f.want ? '✗ blocked' : '✓ blocked')}</span>
          <ol>${(f.res.hops || []).map(h => `<li>${esc(h.why)}</li>`).join('')}${f.res.ok ? '' : `<li class="fs-bad">${esc(f.res.why)}</li>`}</ol></div>`; }).join('');
      api.metrics({ right: r.right, total: r.total, exposed: r.flows.some(f => !f.want && f.res.ok) ? 1 : 0 });
    };
    paint();
    return { destroy() {} };
  });

  // ---------- AWS: IAM policy evaluator ----------
  const IAM_STATEMENTS = [
    { id: 'readReports', where: 'identity', st: { sid: 'ReadReports', effect: 'Allow', action: 's3:GetObject', resource: 'arn:aws:s3:::reports/*' }, label: 'Identity: Allow s3:GetObject on reports/*' },
    { id: 'allS3', where: 'identity', st: { sid: 'AdminS3', effect: 'Allow', action: 's3:*', resource: '*' }, label: 'Identity: Allow s3:* on *' },
    { id: 'denyDelete', where: 'resource', st: { sid: 'NoDeletes', effect: 'Deny', action: 's3:Delete*', resource: 'arn:aws:s3:::reports/*' }, label: 'Bucket policy: Deny s3:Delete* on reports/*' },
    { id: 'bucketRead', where: 'resource', st: { sid: 'PartnerRead', effect: 'Allow', action: 's3:GetObject', resource: 'arn:aws:s3:::reports/public/*' }, label: 'Bucket policy: Allow s3:GetObject on reports/public/*' },
    { id: 'mfa', where: 'identity', st: { sid: 'DenyWithoutMfa', effect: 'Deny', action: 's3:Put*', resource: '*', condition: { mfa: false } }, label: 'Identity: Deny s3:Put* unless MFA' },
    { id: 'boundary', where: 'boundary', st: { sid: 'ReadOnlyBoundary', effect: 'Allow', action: ['s3:Get*', 's3:List*'], resource: '*' }, label: 'Permissions boundary: only s3:Get* and s3:List*' },
  ];
  const IAM_REQUESTS = [['s3:GetObject|arn:aws:s3:::reports/q3.pdf', 'GetObject reports/q3.pdf'], ['s3:PutObject|arn:aws:s3:::reports/q4.pdf', 'PutObject reports/q4.pdf'],
    ['s3:DeleteObject|arn:aws:s3:::reports/q3.pdf', 'DeleteObject reports/q3.pdf'], ['s3:GetObject|arn:aws:s3:::payroll/may.csv', 'GetObject payroll/may.csv'], ['s3:GetObject|arn:aws:s3:::reports/public/brochure.pdf', 'GetObject reports/public/brochure.pdf']];
  reg('iam', (el, cfg, api) => {
    const st = { req: IAM_REQUESTS[0][0], mfa: false, readReports: true, allS3: false, denyDelete: true, bucketRead: false, mfa_rule: false, boundary: false };
    const seen = new Set();
    const { ctl, out } = shell(el);
    controls(ctl, [{ key: 'req', label: 'Request', type: 'select', options: IAM_REQUESTS }, { key: 'mfa', label: 'Signed in with MFA', type: 'toggle' },
      ...IAM_STATEMENTS.map(x => ({ key: x.id === 'mfa' ? 'mfa_rule' : x.id, label: x.label, type: 'toggle' }))], st, () => { api.touched(); paint(); });
    const paint = () => {
      const pol = { identity: [], resource: [], boundary: null };
      IAM_STATEMENTS.forEach(x => { if (st[x.id === 'mfa' ? 'mfa_rule' : x.id]) { if (x.where === 'boundary') pol.boundary = [x.st]; else pol[x.where].push(x.st); } });
      const [action, resource] = st.req.split('|'), r = M.evaluate(pol, { action, resource, context: { mfa: st.mfa } });
      seen.add(r.why);
      out.innerHTML = `<p class="fs-decision is-${r.decision === 'Allow' ? 'ok' : 'bad'}">${r.decision}</p><ol class="sim-notes">${r.trail.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        <p class="sim-note">Evaluation order: an explicit Deny anywhere wins. Otherwise something must Allow it; with a permissions boundary the identity's Allow must also fall inside the boundary. Anything not allowed is an implicit deny.</p>`;
      api.metrics({ explicit: seen.has('explicit') ? 1 : 0, implicit: seen.has('implicit') ? 1 : 0, boundary: seen.has('boundary') ? 1 : 0, resource: seen.has('resource') ? 1 : 0, kinds: seen.size });
    };
    paint();
    return { destroy() {} };
  });

  // ---------- CI/CD: deployment strategies ----------
  reg('deploys', (el, cfg, api) => simple(el, cfg, api, { strategy: 'rolling', errorRate: 30, detectMin: 5, autoRollback: true },
    [{ key: 'strategy', label: 'Strategy', type: 'select', options: [['rolling', 'Rolling update'], ['bluegreen', 'Blue-green'], ['canary', 'Canary 1% → 5% → 25% → 100%'], ['flag', 'Feature flag for 2%']] },
      { key: 'errorRate', label: 'The bad build fails', min: 1, max: 100, step: 1, fmt: v => v + '% of requests' },
      { key: 'detectMin', label: 'Alerting notices after', min: 1, max: 20, step: 1, fmt: v => v + ' min' }, { key: 'autoRollback', label: 'Roll back automatically', type: 'toggle' }],
    s => {
      const r = M.deploy({ ...s, errorRate: s.errorRate / 100 });
      return { metrics: { exposed: Math.round(r.exposed * 100), failed: r.failed, strategy: s.strategy },
        html: stats([{ label: 'Most traffic on the bad build', value: Math.round(r.exposed * 100) + '%', tone: r.exposed > 0.5 ? 'bad' : r.exposed > 0.1 ? 'warn' : 'ok' }, { label: 'Failed requests', value: fmt(r.failed), tone: r.failed > 500 ? 'bad' : '' }, { label: 'Rolled back at', value: r.rolledBackAt != null ? r.rolledBackAt.toFixed(1) + ' min' : 'never' }])
          + chart({ series: [{ label: 'Share on the new build', cls: 's4', values: r.series.map(x => x.share * 100) }, { label: 'Error rate %', cls: 's3', values: r.series.map(x => x.err * 100) }], xMax: 40, yMax: 100, xLabel: 'minutes', yLabel: '%' }) };
    }));

  // ---------- CI/CD: expand and contract ----------
  reg('migration', (el, cfg, api) => {
    let plan = [];
    const order = ['add-new', 'dual-write', 'backfill', 'read-new', 'drop-old', 'rename', 'deploy-new'];
    const seen = { broke: 0, clean: 0 };
    el.innerHTML = '<div class="fs-migr"></div>';
    const box = el.firstChild;
    const paint = () => {
      const r = M.migrate(plan);
      if (r.broken) seen.broke = 1; if (r.clean) seen.clean = 1;
      box.innerHTML = `<p class="sim-note">Rename <code>users.fullname</code> to <code>full_name</code> while the app keeps running. Each deploy is rolling, so the old and new versions run side by side for a while. Pick the steps in order.</p>
        <div class="sim-actions">${order.map(id => `<button type="button" class="button" data-do="${id}" ${plan.includes(id) ? 'disabled' : ''}>${esc(M.MIGRATION_STEPS[id].label)}</button>`).join('')}</div>
        <ol class="fs-steps">${r.steps.map(x => `<li class="is-${x.problems.length ? 'bad' : 'ok'}"><b>${esc(x.label)}</b><span>columns: ${esc(Object.entries(x.schema).map(([c, v]) => c + (v === 'empty' ? ' (empty)' : '')).join(', '))} · running: ${esc(x.running.join(' + '))}</span>${x.problems.map(p => `<em>${esc(p)}</em>`).join('')}</li>`).join('')}</ol>
        ${r.done ? verdictBox({ ok: !r.broken, text: r.broken ? 'Renamed, but users saw errors or missing data on the way. Each step must work with both versions that run during it.' : 'Renamed with no downtime: expand (add, dual-write, backfill), switch reads, then contract.' }) : ''}
        ${btns([['undo', 'Undo a step'], ['reset', 'Start again']])}`;
      api.metrics({ ...seen, steps: plan.length });
    };
    on(el, act => { api.touched(); if (act === 'reset') plan = []; else if (act === 'undo') plan.pop(); else if (!plan.includes(act)) plan.push(act); paint(); });
    paint();
    return { destroy() {} };
  });

  // ---------- Home lab: the reaper ----------
  reg('reaper', (el, cfg, api) => simple(el, cfg, api, { rule: 'fixed', sessionsPerHour: 3, spikeSessions: 14 },
    [{ key: 'rule', label: 'Reaper', type: 'select', options: [['fixed', 'Fixed: idle 24 h, every 15 min'], ['adaptive', 'Adaptive: limits shrink with memory, every 30 s']] },
      { key: 'sessionsPerHour', label: 'New agent sessions / hour', min: 1, max: 8, step: 0.5 }, { key: 'spikeSessions', label: 'Sessions opened at 18:00', min: 0, max: 30 }],
    s => {
      const r = M.reaper(s), hours = r.series.map(x => x.h);
      return { metrics: { crashed: r.crashed != null ? 1 : 0, killed: r.killed, rule: s.rule },
        html: stats([{ label: 'Outcome', value: r.crashed != null ? `box locked up at ${String(Math.floor(r.crashed / 60)).padStart(2, '0')}:${String(r.crashed % 60).padStart(2, '0')}` : 'survived the day', tone: r.crashed != null ? 'bad' : 'ok' },
          { label: 'Sessions reaped', value: String(r.killed) }, { label: 'Lowest available RAM', value: r.minAvail.toFixed(1) + ' GiB', tone: r.minAvail < 0 ? 'bad' : '' }])
          + chart({ series: [{ label: 'Memory wanted (GiB)', cls: 's2', values: r.series.filter((_, i) => i % 10 === 0).map(x => x.used) }, { label: 'Live sessions ÷ 4', cls: 's4', values: r.series.filter((_, i) => i % 10 === 0).map(x => x.sessions / 4) }],
            xMax: hours[hours.length - 1] || 24, xLabel: 'hour of the day', hlines: [{ y: r.params.ramGb, label: 'RAM full: swapping above this' }] })
          + `<p class="sim-note">${s.rule === 'fixed' ? 'A fixed rule does the same thing whatever the memory: idle sessions pile up until the box is swapping, and a check every 15 minutes can\'t react to demand that grows between runs.' : 'The scarcer the memory, the less is kept around: the idle limit drops from 24 h to 4 h, 1 h, then 15 min, and passes run every 30 s, at most 8 kills each.'}</p>` };
    }));

  // ---------- Home lab: pull deploys that roll back ----------
  reg('pulldeploy', (el, cfg, api) => simple(el, cfg, api, { rememberFailed: false },
    [{ key: 'rememberFailed', label: 'Remember a commit that failed its health check', type: 'toggle' }],
    s => {
      const r = M.pullDeploy(s);
      return { metrics: { downMinutes: r.downMinutes, flaps: r.flaps, remember: s.rememberFailed ? 1 : 0 },
        html: stats([{ label: 'Minutes down', value: String(r.downMinutes), tone: r.downMinutes > 3 ? 'bad' : 'ok' }, { label: 'Rollbacks', value: String(r.flaps), tone: r.flaps > 1 ? 'bad' : '' }])
          + `<div class="fs-uptime">${r.series.map(x => `<i class="${x.up ? 'is-up' : 'is-down'}" title="${x.m} min"></i>`).join('')}</div>${log(r.events.map(e => ({ text: `${e.m.toFixed(1)} min  ${e.text}`, cls: /unhealthy/.test(e.text) ? 'is-bad' : /fix/.test(e.text) ? 'is-ok' : '' })), 12)}` };
    }));

  // ---------- Networking: slow start ----------
  reg('slowstart', (el, cfg, api) => simple(el, cfg, api, { kb: 500, rttMs: 50, initCwnd: 10, lossAt: 0, reused: false },
    [{ key: 'kb', label: 'Response size', min: 14, max: 4000, step: 14, fmt: v => v + ' KB' }, { key: 'rttMs', label: 'Round trip', min: 5, max: 300, step: 5, fmt: v => v + ' ms' },
      { key: 'initCwnd', label: 'Initial window (segments)', min: 1, max: 40 }, { key: 'lossAt', label: 'Lose a packet in round', min: 0, max: 8, fmt: v => v ? String(v) : 'none' },
      { key: 'reused', label: 'Reuse a warm connection (keep-alive)', type: 'toggle' }],
    s => {
      const r = M.slowStart(s);
      return { metrics: { ms: r.ms, rtts: r.rtts, reused: s.reused ? 1 : 0 },
        html: stats([{ label: 'Time to download', value: ms(r.ms) }, { label: 'Handshake round trips', value: String(r.setup) }, { label: 'Data round trips', value: String(r.rtts) }])
          + bars(r.rounds.map(x => ({ label: `round ${x.rtt}${x.loss ? ' (loss)' : ''}`, value: x.cwnd, text: `${x.cwnd} segments · ${fmt(x.kb)} KB`, cls: x.loss ? 'is-dead' : '' })), Math.max(...r.rounds.map(x => x.cwnd)))
          + `<p class="sim-note">A new connection starts with a small window and doubles it each round trip, so small and medium responses are bound by round trips, not bandwidth. A warm connection skips the handshakes and starts with a big window.</p>` };
    }));

  // ---------- Networking: head-of-line blocking ----------
  reg('hol', (el, cfg, api) => simple(el, cfg, api, { proto: 'h2', loss: 2, streams: 12, rttMs: 60 },
    [{ key: 'proto', label: 'Protocol', type: 'select', options: [['h1', 'HTTP/1.1 (6 connections)'], ['h2', 'HTTP/2 (one TCP connection)'], ['h3', 'HTTP/3 (QUIC)']] },
      { key: 'loss', label: 'Packet loss', min: 0, max: 10, step: 0.5, fmt: v => v + '%' }, { key: 'streams', label: 'Resources on the page', min: 2, max: 30 }, { key: 'rttMs', label: 'Round trip', min: 10, max: 300, step: 10, fmt: v => v + ' ms' }],
    s => {
      const r = M.hol({ ...s, loss: s.loss / 100 });
      return { metrics: { stalled: r.stalled, proto: s.proto, loss: s.loss, slowest: r.slowest },
        html: stats([{ label: 'Page done', value: ms(r.slowest) }, { label: 'Packets lost', value: String(r.lost) }, { label: 'Resources delayed by a loss', value: `${r.stalled} of ${r.streams.length}`, tone: r.stalled > r.lost ? 'warn' : '' }])
          + bars(r.streams.map(x => ({ label: `resource ${x.stream + 1}`, value: x.ms, text: `${Math.round(x.ms)} ms${x.stall ? ` (+${Math.round(x.stall)})` : ''}`, cls: x.stall ? 'is-warn' : '' })), r.slowest)
          + `<p class="sim-note">${s.proto === 'h2' ? 'HTTP/2 multiplexes everything on one TCP connection, and TCP delivers bytes in order: one lost packet holds up every stream behind it until it is resent.' : s.proto === 'h3' ? 'QUIC recovers loss per stream, so a lost packet only delays its own resource, and the handshake is one round trip.' : 'HTTP/1.1 needs a connection per request in flight (browsers open 6), each with its own handshakes, and requests on a connection wait in line.'}</p>` };
    }));
})();
