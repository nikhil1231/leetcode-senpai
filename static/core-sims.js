// CS-core simulators: a JWT verifier, six web attacks against your defences, OAuth flows under attack,
// SQL joins and window functions on tiny tables, a CPU scheduler, page replacement, dining philosophers
// and test shapes against a flawed service. Models are pure (core-models.js); this file draws them with
// the shared simulator helpers (sd-sims.js).
(function () {
  'use strict';
  if (!window.SDSims || !window.CoreModels) return;
  const M = window.CoreModels, { esc, fmt, controls, chart, stats, shell, simple } = window.SDSims.H;
  const reg = window.SDSims.register;
  const TONE = { breach: 'bad', limited: 'warn', blocked: 'ok' };
  const WORD = { breach: 'Breached', limited: 'Damage limited', blocked: 'Blocked' };
  const chip = o => `<span class="cs-chip is-${TONE[o]}">${WORD[o]}</span>`;
  const cell = v => v === null ? '<td class="cs-null">NULL</td>' : `<td>${esc(v)}</td>`;
  const table = (cols, rows) => `<table class="fs-table"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="cs-empty">(no rows)</td></tr>`}</tbody></table>`;
  const sql = text => `<pre class="sd-code" data-lang="sql"><code>${esc(text)}</code></pre>`;
  const steps = list => `<ol class="fs-steps">${list.map(s => typeof s === 'string' ? `<li>${esc(s)}</li>` : `<li class="is-${s.ok && !s.warn ? 'ok' : 'bad'}">${esc(s.text)}</li>`).join('')}</ol>`;

  // ---------- Security: a JWT verifier ----------
  reg('jwt', (el, cfg, api) => {
    const seen = { breach: 0, noneSigned: 0 };
    return simple(el, cfg, api, { attack: 'tamper', sig: false, alg: false, exp: true, aud: true },
      [{ key: 'attack', label: 'Token sent by the client', type: 'select', options: Object.entries(M.JWT_ATTACKS).map(([k, v]) => [k, v.label]) },
        { key: 'sig', label: 'Verify the signature', type: 'toggle' }, { key: 'alg', label: 'Pin the algorithm to RS256 (ignore the header\'s alg)', type: 'toggle' },
        { key: 'exp', label: 'Check exp', type: 'toggle' }, { key: 'aud', label: 'Check iss and aud', type: 'toggle' }],
      s => {
        const r = M.jwtVerify(s.attack, s), t = r.token, safe = M.jwtSafe(s);
        if (r.breach) seen.breach = 1;
        if (r.breach && s.attack === 'none' && s.sig) seen.noneSigned = 1;
        return { metrics: { ...seen, attack: s.attack, safeAll: safe ? 1 : 0 },
          html: `<div class="cs-tok"><span class="cs-tok-h"><b>header</b>${esc(JSON.stringify(t.header))}</span><span class="cs-tok-p"><b>payload</b>${esc(JSON.stringify(t.payload))}</span><span class="cs-tok-s"><b>signature</b>${esc(t.sig)}</span></div>`
            + steps(r.steps) + `<p class="fs-decision is-${r.breach ? 'bad' : r.accepted ? 'ok' : 'ok'}">${esc(r.outcome)}</p>`
            + `<p class="sim-note">${safe ? 'These checks reject every attack in the list and still accept the genuine token.' : 'At least one token in the list gets through with these checks. Try them all.'}</p>` };
      });
  });

  // ---------- Security: six web attacks ----------
  reg('websec', (el, cfg, api) => {
    const st = { show: 'xss', ...Object.fromEntries(M.WEB_DEFENCES.map(([k]) => [k, false])) };
    const { ctl, out } = shell(el);
    controls(ctl, [{ key: 'show', label: 'Show the attack', type: 'select', options: Object.entries(M.WEB_ATTACKS).map(([k, v]) => [k, v.label]) },
      ...M.WEB_DEFENCES.map(([k, l]) => ({ key: k, label: l, type: 'toggle' }))], st, () => { api.touched(); paint(); });
    const paint = () => {
      const b = M.webBoard(st), r = b.rows.find(x => x.attack === st.show);
      out.innerHTML = stats([{ label: 'Breached', value: String(b.breaches), tone: b.breaches ? 'bad' : 'ok' }, { label: 'Damage limited', value: String(b.limited), tone: b.limited ? 'warn' : '' },
        { label: 'Blocked', value: `${b.blocked} of 6`, tone: b.blocked === 6 ? 'ok' : '' }, { label: 'Defences on', value: String(b.used) }])
        + `<table class="fs-table cs-board"><tbody>${b.rows.map(x => `<tr class="${x.attack === st.show ? 'is-on' : ''}"><td>${esc(M.WEB_ATTACKS[x.attack].label)}</td><td>${chip(x.outcome)}</td></tr>`).join('')}</tbody></table>`
        + `<div class="fs-flow is-${TONE[r.outcome] === 'ok' ? 'ok' : 'bad'}"><b>${esc(M.WEB_ATTACKS[st.show].label)}</b><span>${WORD[r.outcome]}</span><p class="cs-vector"><code>${esc(M.WEB_ATTACKS[st.show].vector)}</code></p><ol>${r.steps.map(x => `<li>${esc(x)}</li>`).join('')}<li><b>${esc(r.text)}</b></li></ol></div>`;
      api.metrics({ breaches: b.breaches, limited: b.limited, used: b.used, xss: r.attack === 'xss' ? r.outcome : b.rows[0].outcome, allBlocked: b.blocked === 6 ? 1 : 0,
        httponlyOnly: st.httponly && b.rows[0].outcome === 'limited' ? 1 : 0 });
    };
    paint();
    return { destroy() {} };
  });

  // ---------- Security: OAuth flows under attack ----------
  reg('oauth', (el, cfg, api) => {
    const seen = { implicitLeak: 0, pkceBeaten: 0 };
    return simple(el, cfg, api, { flow: 'code', attack: 'intercept', state: false, exact: false },
      [{ key: 'flow', label: 'Flow', type: 'select', options: Object.entries(M.OAUTH_FLOWS) }, { key: 'attack', label: 'Attack', type: 'select', options: Object.entries(M.OAUTH_ATTACKS) },
        { key: 'state', label: 'Send and check a state parameter', type: 'toggle' }, { key: 'exact', label: 'Authorisation server matches redirect_uri exactly', type: 'toggle' }],
      s => {
        const r = M.oauth(s.flow, s.attack, s), safe = M.oauthSafe(s.flow, s);
        if (s.flow === 'implicit' && r.outcome === 'breach') seen.implicitLeak = 1;
        if (s.flow === 'pkce' && r.outcome === 'breach') seen.pkceBeaten = 1;
        const all = Object.keys(M.OAUTH_ATTACKS).map(a => [a, M.oauth(s.flow, a, s).outcome]);
        return { metrics: { ...seen, flow: s.flow, outcome: r.outcome, safeAll: safe ? 1 : 0 },
          html: `<div class="fs-flow is-${TONE[r.outcome] === 'ok' ? 'ok' : 'bad'}"><b>${esc(M.OAUTH_ATTACKS[s.attack])}</b><span>${WORD[r.outcome]}</span><ol>${r.steps.map(x => `<li>${esc(x)}</li>`).join('')}<li><b>${esc(r.text)}</b></li></ol></div>`
            + `<table class="fs-table cs-board"><tbody>${all.map(([a, o]) => `<tr class="${a === s.attack ? 'is-on' : ''}"><td>${esc(M.OAUTH_ATTACKS[a])}</td><td>${chip(o)}</td></tr>`).join('')}</tbody></table>`
            + `<p class="sim-note">${safe ? 'This setup blocks all four attacks.' : 'Not every attack is blocked with this flow and these settings.'}</p>` };
      });
  });

  // ---------- SQL: joins ----------
  const JOIN_NOTE = {
    inner: 'Only pairs that match. Dee (no orders) and the guest order (user_id NULL) both vanish: NULL = anything is unknown, never true.',
    left: 'Every user, matched or not. Columns from orders are NULL where nothing matched.',
    right: 'Every order, matched or not. Mostly written as a LEFT JOIN with the tables swapped.',
    full: 'Everything from both sides, NULL-filled where there was no partner.',
    cross: 'Every user with every order (4 × 5 = 20). A missing ON condition does this by accident.',
    anti: 'LEFT JOIN, then keep rows where the right side is NULL: rows with no match. NOT EXISTS says the same thing.',
    semi: 'EXISTS returns each user once, however many orders match. A plain JOIN would repeat Ana.',
  };
  reg('sqljoin', (el, cfg, api) => {
    const seen = { starWrong: 0 };
    return simple(el, cfg, api, { join: 'inner', filter: 'none', agg: 'none' },
      [{ key: 'join', label: 'Join', type: 'select', options: [['inner', 'INNER JOIN'], ['left', 'LEFT JOIN'], ['right', 'RIGHT JOIN'], ['full', 'FULL OUTER JOIN'], ['cross', 'CROSS JOIN'], ['anti', 'Anti-join (LEFT JOIN … IS NULL)'], ['semi', 'Semi-join (EXISTS)']] },
        { key: 'filter', label: 'Only paid orders', type: 'select', options: [['none', 'no filter'], ['on', "in the ON clause"], ['where', 'in the WHERE clause']] },
        { key: 'agg', label: 'Then count per user', type: 'select', options: [['none', 'no'], ['star', 'COUNT(*)'], ['col', 'COUNT(o.id)']] }],
      s => {
        const r = M.sqlJoin(s), inner = M.sqlJoin({ ...s, join: 'inner' });
        if (s.agg === 'star' && ['left', 'full'].includes(s.join) && r.rows.some(x => x[0] === 'Dee' && x[1] === 1)) seen.starWrong = 1;
        const collapsed = s.join === 'left' && s.filter === 'where' && M.sameRows(r, inner);
        return { metrics: { ...seen, join: s.join, filter: s.filter, rows: r.n, allUsers: r.allUsers, neverOrdered: r.neverOrdered, noPaid: r.noPaid, leftBecameInner: collapsed ? 1 : 0 },
          html: `<div class="cs-pair"><div><span class="sd-eyebrow">USERS</span>${table(['id', 'name', 'city'], M.USERS.map(u => [u.id, u.name, u.city]))}</div><div><span class="sd-eyebrow">ORDERS</span>${table(['id', 'user_id', 'total', 'status'], M.ORDERS.map(o => [o.id, o.user_id, o.total, o.status]))}</div></div>`
            + sql(r.sql) + stats([{ label: 'Rows', value: String(r.n) }, { label: 'NULLs in the result', value: String(r.nulls) }]) + table(r.cols, r.rows)
            + `<p class="sim-note">${collapsed ? 'The WHERE clause runs after the join. The NULL-extended rows fail status = \'paid\' (NULL compared with anything is unknown), so this LEFT JOIN returns exactly what an INNER JOIN would. Put the condition in ON to keep every user.' : s.agg === 'star' && ['left', 'full'].includes(s.join) ? 'COUNT(*) counts rows, and the NULL-filled row for Dee is a row. COUNT(o.id) counts non-NULL values, so Dee gets 0.' : esc(JOIN_NOTE[s.join])}</p>` };
      });
  });

  // ---------- SQL: window functions ----------
  reg('sqlwindow', (el, cfg, api) => {
    const seen = { gap: 0, peerShared: 0, peerFixed: 0 };
    return simple(el, cfg, api, { fn: 'row_number', part: 'region', order: 'amount', frame: 'range', top: false },
      [{ key: 'fn', label: 'Function', type: 'select', options: [['row_number', 'ROW_NUMBER()'], ['rank', 'RANK()'], ['dense_rank', 'DENSE_RANK()'], ['sum', 'SUM(amount): running total'], ['lag', 'LAG(amount): previous row'], ['avg3', 'AVG(amount) over 3 rows'], ['groupby', 'Compare: GROUP BY']] },
        { key: 'part', label: 'PARTITION BY', type: 'select', options: [['region', 'region'], ['none', '(none: one window)']] },
        { key: 'order', label: 'ORDER BY', type: 'select', options: [['amount', 'amount DESC'], ['month', 'month']] },
        { key: 'frame', label: 'Frame for SUM', type: 'select', options: [['range', 'default (RANGE: peers included)'], ['rows', 'ROWS UNBOUNDED PRECEDING']] },
        { key: 'top', label: 'Keep only v ≤ 2 (top 2)', type: 'toggle' }],
      s => {
        const r = M.sqlWindow(s);
        if (r.gap) seen.gap = 1;
        if (r.peerShared) seen.peerShared = 1;
        if (seen.peerShared && s.fn === 'sum' && s.frame === 'rows' && s.order === 'amount') seen.peerFixed = 1;
        const note = s.fn === 'groupby' ? 'GROUP BY collapses each group to one row. A window function computes over the group and keeps every row.'
          : s.top && !['row_number', 'rank', 'dense_rank'].includes(s.fn) ? 'Top-N filtering needs a ranking function.'
          : s.top ? 'You cannot filter on a window function in WHERE (WHERE runs before windows are computed), so wrap it in a CTE or subquery. With RANK, ties can return more than two rows per region.'
          : r.peerShared ? 'With ORDER BY and no frame, the default is RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW, which includes every row tied with the current one. Tied rows share one total. ROWS counts physical rows instead.'
          : s.fn === 'rank' ? 'RANK leaves a gap after ties (1, 1, 3); DENSE_RANK does not (1, 1, 2); ROW_NUMBER breaks ties arbitrarily unless ORDER BY makes them unique.'
          : 'Each row keeps its identity; the window is the partition, in ORDER BY order.';
        return { metrics: { ...seen, fn: s.fn, topOk: r.topOk, rows: r.n },
          html: sql(r.sql) + stats([{ label: 'Rows out', value: String(r.n) }, { label: 'Input rows', value: String(M.SALES.length) }]) + table(r.cols, r.rows) + `<p class="sim-note">${esc(note)}</p>` };
      });
  });

  // ---------- OS: CPU scheduling ----------
  reg('cpusched', (el, cfg, api) => simple(el, cfg, api, { load: 'convoy', algo: 'fcfs', q: 4, cs: 0 },
    [{ key: 'load', label: 'Workload', type: 'select', options: [['convoy', 'One long job, then three short ones'], ['mixed', 'Batch jobs and short web requests'], ['equal', 'Four equal jobs at once']] },
      { key: 'algo', label: 'Scheduler', type: 'select', options: [['fcfs', 'First come, first served'], ['sjf', 'Shortest job first (non-preemptive)'], ['srtf', 'Shortest remaining time first (preemptive)'], ['rr', 'Round robin'], ['mlfq', 'Multi-level feedback queue (2, 4, ∞)']] },
      { key: 'q', label: 'Round-robin quantum', min: 1, max: 12, fmt: v => v + ' ms' }, { key: 'cs', label: 'Context-switch cost', min: 0, max: 3, fmt: v => v + ' ms' }],
    s => {
      const r = M.schedule(s), W = 640, sc = W / Math.max(1, r.makespan);
      const lane = (name, segs) => `<div class="fs-lane"><span>${esc(name)}</span><svg viewBox="0 0 ${W} 12" preserveAspectRatio="none">${segs.map(g => `<rect class="fs-${g.state}" x="${g.from * sc}" width="${Math.max(0.5, (g.to - g.from) * sc)}" y="0" height="12"/>`).join('')}</svg></div>`;
      const cpuSegs = []; r.cpu.forEach((c, k) => { if (c === 'switch') cpuSegs.push({ state: 'start', from: k, to: k + 1 }); });
      return { metrics: { algo: s.algo, load: s.load, avgWait: Math.round(r.avgWait * 100) / 100, avgResp: Math.round(r.avgResp * 100) / 100, overhead: Math.round(r.overhead * 100) / 100 },
        html: stats([{ label: 'Average wait', value: r.avgWait.toFixed(1) + ' ms', tone: r.avgWait > 15 ? 'bad' : r.avgWait < 4 ? 'ok' : '' }, { label: 'Average response', value: r.avgResp.toFixed(1) + ' ms' },
          { label: 'Average turnaround', value: r.avgTurn.toFixed(1) + ' ms' }, { label: 'Context switches', value: String(r.switches) }, { label: 'CPU lost to switching', value: Math.round(r.overhead * 100) + '%', tone: r.overhead > 0.2 ? 'bad' : '' }])
          + `<div class="fs-gantt">${r.segs.map((g, i) => lane(r.rows[i].name, g)).join('')}${s.cs ? lane('switch', cpuSegs) : ''}<div class="fs-gantt-key"><span class="fs-run">Running</span><span class="fs-wait">Ready, waiting for the CPU</span>${s.cs ? '<span class="fs-start">Context switch</span>' : ''}<span>0 to ${r.makespan} ms</span></div></div>`
          + table(['job', 'arrives', 'burst', 'first runs', 'done', 'wait', 'response'], r.rows.map(x => [x.name, x.at, x.burst, x.first, x.done, x.wait, x.response]))
          + `<p class="sim-note">${{ fcfs: 'Short jobs stuck behind a long one wait for all of it: the convoy effect.', sjf: 'SJF minimises average wait only among jobs already waiting; once a long job starts it cannot be interrupted.', srtf: 'Preempting for the shortest remaining job gives the lowest average wait possible, but needs to know job lengths and can starve long jobs.', rr: 'Each job gets a quantum in turn: good response time, but more switches, and with equal jobs everyone finishes late.', mlfq: 'New jobs start at top priority with a short quantum; jobs that use their whole quantum sink. Short, interactive work stays fast without knowing lengths in advance.' }[s.algo]}</p>` };
    }));

  // ---------- OS: page replacement ----------
  reg('paging', (el, cfg, api) => {
    const seen = { belady: 0 };
    return simple(el, cfg, api, { string: 'locality', algo: 'fifo', frames: 3 },
      [{ key: 'string', label: 'Reference string', type: 'select', options: [['locality', 'Textbook mix (20 references)'], ['belady', '1 2 3 4 1 2 5 1 2 3 4 5'], ['loop', 'A loop over 5 pages, three times']] },
        { key: 'algo', label: 'Replacement', type: 'select', options: [['fifo', 'FIFO'], ['lru', 'LRU'], ['clock', 'Clock (second chance)'], ['opt', 'Optimal (needs the future)']] },
        { key: 'frames', label: 'Physical frames', min: 1, max: 7 }],
      s => {
        const r = M.paging(s), opt = M.paging({ ...s, algo: 'opt' }), curve = M.faultCurve(s.string, s.algo), optC = M.faultCurve(s.string, 'opt');
        const belady = s.frames > 1 && curve[s.frames - 1] > curve[s.frames - 2];
        if (belady) seen.belady = 1;
        const grid = `<div class="cs-grid-wrap"><table class="cs-grid"><thead><tr><th>ref</th>${r.cols.map(c => `<th>${c.pg}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: s.frames }, (_, f) => `<tr><th>f${f}</th>${r.cols.map(c => { const v = c.frames[f]; const isNew = !c.hit && v === c.pg; return `<td class="${isNew ? 'is-new' : ''}${c.hit && v === c.pg ? ' is-hit' : ''}">${v ?? ''}${c.bits && v != null ? `<sup>${c.bits[f]}</sup>` : ''}</td>`; }).join('')}</tr>`).join('')}<tr class="cs-faultrow"><th></th>${r.cols.map(c => `<td class="${c.hit ? 'is-hit' : 'is-fault'}">${c.hit ? '✓' : 'F'}</td>`).join('')}</tr></tbody></table></div>`;
        return { metrics: { ...seen, algo: s.algo, frames: s.frames, string: s.string, faults: r.faults, gapToOpt: r.faults - opt.faults },
          html: stats([{ label: 'Page faults', value: String(r.faults), tone: r.faults === r.refs.length ? 'bad' : '' }, { label: 'Hit rate', value: Math.round(r.rate * 100) + '%' }, { label: 'Optimal would fault', value: String(opt.faults) },
            { label: `With ${s.frames - 1 || 1} frame${s.frames - 1 === 1 ? '' : 's'}`, value: s.frames > 1 ? String(curve[s.frames - 2]) : '—', tone: belady ? 'bad' : '' }])
            + grid + chart({ series: [{ label: s.algo.toUpperCase() + ' faults', cls: 's3', values: curve, xs: [1, 2, 3, 4, 5, 6, 7], dots: true }, { label: 'Optimal', cls: 's1', values: optC, xs: [1, 2, 3, 4, 5, 6, 7] }], xMax: 7, xFmt: v => String(Math.round(v)), xLabel: 'frames', yLabel: 'faults', h: 180 })
            + `<p class="sim-note">${belady ? 'Belady\'s anomaly: one more frame, more faults. FIFO (and Clock, which is FIFO with a second chance) can do this. LRU and Optimal are stack algorithms: the pages held with n frames are always a subset of those held with n+1, so more memory never hurts.' : s.string === 'loop' && s.algo === 'lru' && r.faults === r.refs.length ? 'A loop one page bigger than memory is LRU\'s worst case: the page it evicts is always the one needed next. Databases use scan-resistant variants for this reason.' : s.algo === 'clock' ? 'Superscripts are reference bits. The hand clears set bits as it sweeps and evicts the first page it finds with a 0: a cheap approximation of LRU.' : 'F marks a page fault; the newly loaded page is highlighted.'}</p>` };
      });
  });

  // ---------- OS: dining philosophers ----------
  const PH_NOTE = {
    naive: 'Everyone picks up the left fork, then waits for the right. If all five grab their left fork at once, each waits for a neighbour forever: all four Coffman conditions hold.',
    ordered: 'Always take the lower-numbered fork first. The last philosopher reaches for fork 0 before fork 4, so a cycle of waiting cannot form: circular wait is broken.',
    trylock: 'Take the first fork, try the second, and put the first back if it is busy. No one holds while waiting (hold-and-wait is broken), at the cost of retries and possible livelock without random back-off.',
    waiter: 'A counting semaphore lets at most four of five reach for forks. With one seat empty, someone always gets both forks.',
  };
  reg('philosophers', (el, cfg, api) => simple(el, cfg, api, { strategy: 'naive', n: 5, think: 2, eat: 3 },
    [{ key: 'strategy', label: 'Strategy', type: 'select', options: [['naive', 'Left fork, then right fork'], ['ordered', 'Lower-numbered fork first (lock ordering)'], ['trylock', 'tryLock the second, back off if busy'], ['waiter', 'A waiter semaphore (at most N−1 seated)']] },
      { key: 'n', label: 'Philosophers', min: 2, max: 8 }, { key: 'think', label: 'Thinking time (max)', min: 1, max: 10, fmt: v => v + ' ticks' }, { key: 'eat', label: 'Eating time (max)', min: 1, max: 8, fmt: v => v + ' ticks' }],
    s => {
      const r = M.philosopherTrials(s, 100), x = r.example.snapshot, n = s.n, R = 78, C = 110;
      const pos = (i, rad, off = 0) => { const a = -Math.PI / 2 + 2 * Math.PI * (i + off) / n; return [C + rad * Math.cos(a), C + rad * Math.sin(a)]; };
      let svg = `<svg class="cs-table" viewBox="0 0 220 220" role="img" aria-label="The table${r.example.deadlock !== null ? ' at the moment of deadlock' : ''}"><circle cx="${C}" cy="${C}" r="52" class="cs-board-c"/>`;
      x.ph.forEach((p, i) => { if (p.wants != null && x.forks[p.wants] !== null && x.forks[p.wants] !== i) { const [a, b] = pos(i, R), [c, d] = pos(p.wants, 52, 0.5); svg += `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" class="cs-wait"/>`; } });
      x.forks.forEach((owner, f) => { const [a, b] = pos(f, 52, 0.5), [c, d] = owner === null ? pos(f, 40, 0.5) : pos(owner, R - 14); svg += `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" class="cs-fork${owner === null ? '' : ' is-held'}"/><text x="${a}" y="${b - 4}" class="cs-label">f${f}</text>`; });
      x.ph.forEach((p, i) => { const [a, b] = pos(i, R); svg += `<circle cx="${a}" cy="${b}" r="13" class="cs-ph is-${p.state}"/><text x="${a}" y="${b + 4}" class="cs-label" text-anchor="middle">P${i}</text>`; });
      svg += '</svg>';
      return { metrics: { strategy: s.strategy, deadlockRate: r.rate, meals: r.mealsPer100, worst: r.worst, retries: r.retries },
        html: stats([{ label: 'Runs that deadlocked (of 100)', value: String(r.deadlocks), tone: r.deadlocks ? 'bad' : 'ok' }, { label: 'Meals per 100 ticks', value: String(r.mealsPer100) },
          { label: 'Longest wait for forks', value: r.worst + ' ticks', tone: r.worst > 60 ? 'warn' : '' }, { label: 'Back-offs per run', value: String(r.retries) }])
          + `<div class="cs-ph-wrap">${svg}<div><p class="sim-note">${r.example.deadlock !== null ? `Snapshot of the first deadlocked run, at tick ${r.example.deadlock}: every philosopher holds one fork and waits (red line) for one a neighbour holds.` : 'Snapshot of a run at its end. Red lines: waiting for a fork someone else holds.'}</p><div class="fs-gantt-key"><span class="cs-k-eat">Eating</span><span class="cs-k-hungry">Hungry</span><span class="cs-k-think">Thinking</span></div><p class="sim-note">${esc(PH_NOTE[s.strategy])}</p></div></div>` };
    }));

  // ---------- Testing: test shapes against a flawed service ----------
  const FLAW = { leak: 'Memory leak: OOM-killed after about 9 hours', pool: 'Connection pool caps throughput at 700 rps while CPUs sit idle', cold: 'Autoscaling takes ~3 minutes, so a sudden spike errors before capacity arrives', ceiling: 'The known ceiling: ~1,100 rps at maximum scale (expected)' };
  reg('loadshape', (el, cfg, api) => {
    const seen = new Set();
    return simple(el, cfg, api, { shape: 'load', leak: true, pool: true, coldScale: true },
      [{ key: 'shape', label: 'Test to run', type: 'select', options: Object.entries(M.TEST_SHAPES).map(([k, v]) => [k, v.label]) },
        { key: 'leak', label: 'Planted flaw: memory leak', type: 'toggle' }, { key: 'pool', label: 'Planted flaw: small DB connection pool', type: 'toggle' }, { key: 'coldScale', label: 'Planted flaw: slow autoscaling', type: 'toggle' }],
      s => {
        const r = M.loadTest(s);
        if (s.leak && s.pool && s.coldScale) r.found.forEach(f => seen.add(f));
        const xs = r.series.map(p => p.m), hrs = r.minutes > 120;
        const xFmt = v => hrs ? (v / 60).toFixed(0) + ' h' : Math.round(v) + ' m';
        return { metrics: { shape: s.shape, foundLeak: seen.has('leak') ? 1 : 0, foundPool: seen.has('pool') ? 1 : 0, foundCold: seen.has('cold') ? 1 : 0, foundAll: ['leak', 'pool', 'cold'].every(f => seen.has(f)) ? 1 : 0, pass: r.pass ? 1 : 0 },
          html: stats([{ label: 'Verdict', value: r.pass ? 'Pass' : 'Fail', tone: r.pass ? 'ok' : 'bad' }, { label: 'Peak error rate', value: Math.round(r.peakErr * 100) + '%', tone: r.peakErr > 0.01 ? 'bad' : '' },
            { label: 'Worst p99', value: Math.round(r.worstP99) + ' ms', tone: r.worstP99 > 500 ? 'bad' : '' }, { label: 'Flaws found (all tests)', value: `${['leak', 'pool', 'cold'].filter(f => seen.has(f)).length} of 3` }])
            + chart({ series: [{ label: 'Offered rps', cls: 's2', values: r.series.map(p => p.rps), xs }, { label: 'Served rps', cls: 's1', values: r.series.map(p => p.served), xs }], xMax: r.minutes, xFmt, xLabel: 'time', yLabel: 'requests / s', h: 170 })
            + chart({ series: [{ label: 'p99 latency (ms)', cls: 's3', values: r.series.map(p => p.p99), xs }, { label: 'Memory (MB)', cls: 's4', values: r.series.map(p => p.mem), xs }], xMax: r.minutes, xFmt, xLabel: 'time', yLabel: 'ms / MB', h: 170, hlines: [{ y: 2048, label: 'memory limit' }] })
            + `<ul class="sim-notes">${r.found.length ? r.found.map(f => `<li>Found: ${esc(FLAW[f])}${r.breakAt && f !== 'leak' ? ` (first errors at ${Math.round(r.breakAt)} rps)` : ''}.</li>`).join('') : '<li>Nothing found. A pass says this shape of traffic works, nothing more.</li>'}</ul>` };
      });
  });
})();
