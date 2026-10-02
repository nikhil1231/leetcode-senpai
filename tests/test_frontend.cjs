// Run with node --test tests/test_frontend.cjs (no npm dependencies).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function app(fetch) {
  const nodes = new Map();
  const intervals = new Map();
  let nextTimer = 1;
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', disabled: false, innerHTML: '', dataset: {}, listeners: {},
      // contains() answers false because the stub never hides anything, and
      // querySelectorAll() answers empty because no node here has children:
      // enough for code that decorates rendered markup to run without one.
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      querySelectorAll: () => [],
      // No ancestors in a flat stub, so the callers that decorate a field's
      // wrapper simply find nothing to decorate.
      closest: () => null,
      addEventListener(event, handler) { this.listeners[event] = handler; },
      setAttribute() {}, removeAttribute() {},
    });
    return nodes.get(selector);
  };
  // The page behind a modal is redrawn as its state changes; no view is loaded
  // here, so that redraw is a no-op on the Today tab.
  node('#tabs li.is-active').dataset.tab = 'today';
  // Page-level listeners are kept so a test can play "the tab came back".
  const listeners = { window: {}, document: {} };
  const timeouts = new Map();
  const context = vm.createContext({
    window: { location: { hostname: 'localhost' },
              addEventListener(event, fn) { listeners.window[event] = fn; },
              Views: { renderToday: async () => {} } },
    document: {
      readyState: 'loading', visibilityState: 'visible',
      addEventListener(event, fn) { listeners.document[event] = fn; },
      querySelector: node, querySelectorAll: () => [], body: node('body'),
    },
    stored: {},
    localStorage: { getItem: () => null, setItem(k, v) { context.stored[k] = v; } }, fetch,
    setInterval(fn) { const id = nextTimer++; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn, ms) { const id = nextTimer++; timeouts.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timeouts.delete(id); },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8'), context);
  return { node, intervals, timeouts, listeners, run: (code) => vm.runInContext(code, context) };
}
const response = (body) => ({ ok: true, json: async () => body });

// The annotate modal reads as closed, so a pending solve would open it.
const closeModal = (ui) => { ui.node('#annotate-modal').classList.contains = (c) => c === 'hidden'; };

test('slow solve detection never overlaps and resumes after failure', async () => {
  let rejectRequest;
  let calls = 0;
  const ui = app(() => {
    calls++;
    if (calls === 1) return new Promise((resolve, reject) => { rejectRequest = reject; });
    return response({ pending: [] });
  });
  ui.run('activeSession = { session_id: "one" }');
  const first = ui.run('detectSolves({ force: true })');
  // A second trigger (focus and visibilitychange both fire) joins the first.
  assert.equal(ui.run('detectSolves({ force: true })'), first);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  rejectRequest(new Error('offline'));
  await first;
  await ui.run('detectSolves({ force: true })');
  assert.equal(calls, 2);
});

test('detection answer from a cancelled session cannot reopen annotation', async () => {
  let resolveRequest;
  const ui = app(() => new Promise((resolve) => { resolveRequest = resolve; }));
  closeModal(ui);
  ui.run('activeSession = { session_id: "one" }');
  const request = ui.run('detectSolves({ force: true })');
  await Promise.resolve();
  await Promise.resolve();
  ui.run('activeSession = null');
  resolveRequest(response({ pending: [{ id: 'old' }] }));
  await request;
  assert.equal(ui.run('currentAttempt'), null);
});

test('coming back to the tab mid-run checks at once; without a run it stays throttled', async () => {
  let polls = 0;
  const ui = app(async (url) => { if (String(url).includes('/poll')) polls++; return response({ pending: [] }); });
  closeModal(ui);
  ui.run('activeSession = { session_id: "one" }; lastDetectAt = Date.now() - 10000');
  await ui.listeners.window.focus();
  await ui.run('detectInFlight');
  assert.equal(polls, 1);

  ui.run('activeSession = null; lastDetectAt = Date.now() - 10000');
  await ui.listeners.window.focus();
  await ui.run('detectInFlight');
  assert.equal(polls, 1);
});

test('a mid-run return that finds nothing looks once more, and only once', async () => {
  let polls = 0;
  const ui = app(async (url) => { if (String(url).includes('/poll')) polls++; return response({ pending: [] }); });
  closeModal(ui);
  ui.run('activeSession = { session_id: "one" }');
  await ui.run('detectSolves({ force: true })');
  const followups = [...ui.timeouts.values()].filter((t) => t.ms === 5000);
  assert.equal(followups.length, 1);
  ui.timeouts.clear();
  await followups[0].fn();
  assert.equal(polls, 2);
  assert.equal([...ui.timeouts.values()].filter((t) => t.ms === 5000).length, 0);
});

test('recall request failure preserves the draft and restores usable actions', async () => {
  const ui = app(async () => { throw new Error('Network unavailable'); });
  ui.run('currentRecall = { slug: "two-sum" }; llmEnabled = true');
  ui.node('#recall-text').value = 'Use a complement map';
  ui.node('#recall-time').value = 'O(n)';
  await ui.run('submitRecall()');
  assert.equal(ui.node('#recall-text').value, 'Use a complement map');
  for (const field of ['text', 'time', 'space']) {
    assert.equal(ui.node(`#recall-${field}`).disabled, false);
  }
  assert.match(ui.node('#recall-grade').innerHTML, /Network unavailable/);
  assert.match(ui.node('#recall-actions').innerHTML, /Try again/);
  assert.equal(typeof ui.node('#btn-submit-recall').listeners.click, 'function');
  assert.equal(ui.intervals.size, 0);
});

test('a recall marks its row while grading and redraws the page once graded', async () => {
  let resolveRecall;
  const urls = [];
  const ui = app((url) => {
    urls.push(url);
    if (url.endsWith('/review/recall')) return new Promise((resolve) => { resolveRecall = resolve; });
    return response({});
  });
  ui.run('currentRecall = { slug: "two-sum" }; llmEnabled = true');
  ui.node('#recall-text').value = 'Use a complement map';
  const submission = ui.run('submitRecall()');
  assert.equal(ui.run('settling.get("two-sum")'), 'grading');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!urls.some((u) => u.endsWith('/overview')));
  resolveRecall(response({ attempt_id: 'r1', grading_status: 'viewed', graded: { grade: 3 } }));
  await submission;
  await new Promise((resolve) => setImmediate(resolve));
  // Redrawn behind the grade, before anyone clicks Done.
  assert.equal(ui.run('settling.has("two-sum")'), false);
  assert.ok(urls.some((u) => u.endsWith('/overview')));
  assert.match(ui.node('#recall-actions').innerHTML, /Done/);
});

test('cancelling self-grading resolves submission without saving a recall', async () => {
  let calls = 0;
  const ui = app(async () => { calls++; return response({}); });
  ui.run('currentRecall = { slug: "two-sum" }; wireRecallButtons()');
  const submission = ui.run('submitRecall()');
  assert.equal(ui.node('#btn-submit-recall').disabled, true);
  ui.node('#btn-close-recall').listeners.click();
  await submission;
  assert.equal(calls, 0);
  assert.equal(ui.run('resolveSelfGrade'), null);
  assert.equal(ui.node('#btn-submit-recall').disabled, false);
});

test('a failed recall grade offers self-grading, which schedules and closes', async () => {
  const calls = [];
  const ui = app(async (url, opts) => {
    calls.push([url, opts && opts.body]);
    if (url.endsWith('/review/recall')) {
      return response({ attempt_id: 'r9', grading_status: 'failed', grading_error: 'provider down' });
    }
    return response({ ok: true });
  });
  ui.run('currentRecall = { slug: "two-sum" }; llmEnabled = true');
  ui.node('#recall-text').value = 'Use a complement map';
  await ui.run('submitRecall()');
  assert.match(ui.node('#recall-grade').innerHTML, /provider down/);
  assert.match(ui.node('#recall-actions').innerHTML, /Grade it myself/);
  assert.match(ui.node('#recall-actions').innerHTML, /Retry grading/);
  const graded = ui.node('#btn-selfgrade-recall').listeners.click();
  assert.equal(ui.node('#btn-selfgrade-recall').disabled, true);
  ui.run('resolveSelfGrade(2)');
  await graded;
  const post = calls.find(([u]) => u.endsWith('/review/recall/r9/self-grade'));
  assert.ok(post, 'posts the self-grade against the failed recall');
  assert.deepEqual(JSON.parse(post[1]), { confidence: 2 });
});

test('reopening a self-graded recall shows the self-grade, not an empty score', async () => {
  const ui = app(async () => response({ grading_status: 'viewed', recall_grade: null, confidence: 3 }));
  ui.run('currentRecall = { slug: "two-sum" }');
  await ui.run('loadRecallAttempt("r1")');
  assert.match(ui.node('#recall-grade').innerHTML, /Self-graded: <b>High/);
  assert.doesNotMatch(ui.node('#recall-grade').innerHTML, /undefined/);
});

test('annotation rejects double-clicks and keeps notes on a failed save', async () => {
  let rejectRequest;
  let calls = 0;
  const ui = app(() => {
    calls++;
    return new Promise((resolve, reject) => { rejectRequest = reject; });
  });
  ui.run('currentAttempt = { id: "attempt-one" }');
  ui.node('#conf-group button.sel').dataset.val = '3';
  ui.node('#indep-group button.sel').dataset.val = 'solo';
  ui.node('#annotate-note').value = 'Remember duplicate values';
  const save = ui.node('#btn-save-annotate').listeners.click;
  const first = save();
  await save();
  assert.equal(calls, 1);
  rejectRequest(new Error('offline'));
  await first;
  assert.equal(ui.node('#btn-save-annotate').disabled, false);
  assert.equal(ui.node('#annotate-note').value, 'Remember duplicate values');
  assert.equal(ui.run('currentAttempt.id'), 'attempt-one');
});

test('a slow problem lookup cannot overwrite a newer one', async () => {
  const resolvers = [];
  const ui = app(() => new Promise((resolve) => { resolvers.push(resolve); }));
  const candidate = (slug, title) => response({
    candidates: [{ slug, title, difficulty: 'Medium', category: 'Stack',
                   in_library: false, frontend_id: 1 }],
    exact: true,
  });

  // api() awaits an auth token before it reaches fetch, so each lookup needs a
  // microtask turn before its request actually goes out.
  const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

  ui.node('#quickstart-input').value = 'car fleet';
  const stale = ui.run('runQuickStartLookup()');
  await flush();
  ui.node('#quickstart-input').value = 'two sum';
  const fresh = ui.run('runQuickStartLookup()');
  await flush();

  // The newer lookup answers first, then the abandoned one finally lands.
  resolvers[1](candidate('two-sum', 'Two Sum'));
  await fresh;
  resolvers[0](candidate('car-fleet', 'Car Fleet'));
  await stale;

  const shown = ui.node('#quickstart-result').innerHTML;
  assert.match(shown, /Two Sum/);
  assert.doesNotMatch(shown, /Car Fleet/);
});

test('a failed problem lookup leaves nothing startable', async () => {
  const ui = app(() => Promise.reject(new Error('offline')));
  ui.node('#quickstart-input').value = '853';

  await ui.run('runQuickStartLookup()');

  assert.match(ui.node('#quickstart-result').innerHTML, /offline/);
  assert.equal(ui.node('#btn-start-quickstart').disabled, true);
});

test('a better submission restates the open modal without touching the draft', async () => {
  // new_attempts is left out: the re-render it triggers needs more of a DOM than
  // this stub has, and the modal is what's under test here.
  const ui = app(async () => response({
    pending: [{ id: 'attempt-one', submission_id: 2, source: 'auto',
                time_taken_sec: 960, resubmissions: 1,
                first_ac_time_taken_sec: 540, lang: 'python3' }],
  }));
  ui.run(`currentAttempt = { id: "attempt-one", submission_id: 1, source: "auto",
                             time_taken_sec: 540 }`);
  ui.node('#annotate-note').value = 'Forgot the hash map at first';
  // The stub's classList.contains() answers false, i.e. the modal is open.
  await ui.run('detectSolves({ force: true })');

  assert.equal(ui.run('currentAttempt.submission_id'), 2);
  const facts = ui.node('#annotate-facts').innerHTML;
  assert.match(facts, /Time <b>16:00<\/b>/);      // the whole sitting, not the first AC
  assert.match(facts, /First AC <b>09:00<\/b>/);  // which is kept alongside it
  assert.match(facts, /Accepted subs <b>2<\/b>/);
  // Nothing typed is thrown away, and no second modal is stacked on top.
  assert.equal(ui.node('#annotate-note').value, 'Forgot the hash map at first');
  assert.equal(ui.run('currentAttempt.id'), 'attempt-one');
});

test('an unchanged solve leaves the open modal alone', async () => {
  const ui = app(async () => response({
    pending: [{ id: 'attempt-one', submission_id: 1, time_taken_sec: 999 }],
  }));
  ui.run('currentAttempt = { id: "attempt-one", submission_id: 1, time_taken_sec: 540 }');
  await ui.run('detectSolves({ force: true })');
  assert.equal(ui.run('currentAttempt.time_taken_sec'), 540);
  assert.equal(ui.node('#annotate-facts').innerHTML, '');
});

test('a solve with no captured code asks for a fresh cookie when it is known dead', () => {
  const ui = app(async () => response({}));
  ui.run(`llmEnabled = true; lcState = "expired";
          initAnnotateGrade({ id: "attempt-one", submission_id: 7, code: null })`);
  const panel = ui.node('#annotate-grade-body').innerHTML;
  assert.match(panel, /expired/);
  assert.match(panel, /grade-cookie-form/);
});

test('a solve with no captured code still promises a grade while the cookie may be fine', () => {
  const ui = app(async () => response({}));
  ui.run(`llmEnabled = true; lcState = "ok";
          initAnnotateGrade({ id: "attempt-one", submission_id: 7, code: null })`);
  assert.match(ui.node('#annotate-grade-body').innerHTML, /Save your rating/);
});

test('a solve that lands without its code re-checks the cookie at once', () => {
  const ui = app(async () => response({}));
  ui.run(`llmEnabled = true; lastLcCheckAt = Date.now();
          openAnnotate({ id: "attempt-one", slug: "two-sum", submission_id: 7, code: null })`);
  // No cookie in the stub's localStorage, so the answer is immediate.
  assert.equal(ui.run('lcState'), 'missing');
  assert.match(ui.node('#annotate-grade-body').innerHTML, /grade-cookie-form/);
});

test('coming back to the page re-checks the cookie at most every few minutes', () => {
  const ui = app(async () => response({}));
  ui.run('lastLcCheckAt = Date.now(); lcState = "ok"; recheckLeetCodeAuth()');
  assert.equal(ui.run('lcState'), 'ok');
  ui.run('lastLcCheckAt = Date.now() - LC_RECHECK_GAP_MS; recheckLeetCodeAuth()');
  assert.equal(ui.run('lcState'), 'missing');
});

test('a manual log has no submission to explain away', () => {
  const ui = app(async () => response({}));
  ui.run(`llmEnabled = true;
          initAnnotateGrade({ id: "attempt-one", submission_id: null, code: null })`);
  assert.equal(ui.node('#annotate-grade-body').innerHTML, '');
});

test('saving a manual log never promises a grade', async () => {
  const calls = [];
  const ui = app(async (path) => { calls.push(path); return response({ ok: true }); });
  ui.run('llmEnabled = true; currentAttempt = { id: "attempt-one", code: null }');
  ui.node('#conf-group button.sel').dataset.val = '3';
  ui.node('#indep-group button.sel').dataset.val = 'solo';
  await ui.node('#btn-save-annotate').listeners.click();
  assert.equal(ui.node('#toast').textContent, 'Logged');
  assert.ok(!calls.some((p) => p.includes('grade-solution')));
});

test('a cookie that dies before grading is replaced and graded without leaving the modal', async () => {
  const calls = [];
  let cookieGood = false;
  const ui = app(async (path) => {
    calls.push(path);
    if (path.endsWith('/leetcode-status')) return response({ state: 'ok' });
    if (path.endsWith('/grade-solution')) {
      return response(cookieGood
        ? { grading_status: 'viewed', graded: { score: 4, analysis: 'hash map' } }
        : { grading_status: 'needs_cookie', cookie_state: 'expired' });
    }
    return response({ ok: true });
  });
  ui.run('llmEnabled = true; currentAttempt = { id: "attempt-one", submission_id: 7, code: null }');
  ui.node('#conf-group button.sel').dataset.val = '3';
  ui.node('#indep-group button.sel').dataset.val = 'solo';
  await ui.node('#btn-save-annotate').listeners.click();
  assert.match(ui.node('#annotate-grade-body').innerHTML, /grade-cookie-form/);
  assert.equal(ui.run('lcState'), 'expired');

  cookieGood = true;
  ui.node('#grade-cookie-input').value = ' fresh-cookie ';
  await ui.node('#grade-cookie-form').listeners.submit({ preventDefault() {} });
  assert.equal(ui.run('stored.lc_session'), 'fresh-cookie');
  assert.equal(ui.run('lcState'), 'ok');
  assert.equal(calls.filter((p) => p.endsWith('/grade-solution')).length, 2);
  assert.match(ui.node('#annotate-grade-body').innerHTML, /Score <b>4\/5<\/b>/);
  assert.equal(ui.node('#btn-save-annotate').dataset.saved, '1');
});

// The stub's localStorage.getItem answers null, i.e. no cookie in this browser.
test('no cookie in this browser warns without asking the server', async () => {
  let calls = 0;
  const ui = app(async () => { calls++; return response({ state: 'ok' }); });
  await ui.run('checkLeetCodeAuth()');
  assert.equal(calls, 0);
  assert.equal(ui.node('#lc-warning').textContent, 'LeetCode cookie not set');
});

test('a cookie LeetCode refuses is reported as expired', async () => {
  const ui = app(async () => response({ state: 'expired' }));
  ui.run(`localStorage.getItem = () => "a-cookie"; checkLeetCodeAuth()`);
  await new Promise((r) => setImmediate(r));
  assert.equal(ui.node('#lc-warning').textContent, 'LeetCode cookie expired');
});

test('an unreachable LeetCode is never reported as a dead cookie', async () => {
  for (const outcome of ['unknown', 'ok']) {
    const ui = app(async () => response({ state: outcome }));
    ui.run(`localStorage.getItem = () => "a-cookie";
            $("#lc-warning").textContent = "stale"; checkLeetCodeAuth()`);
    await new Promise((r) => setImmediate(r));
    // Hidden, and so never seen — the stub can't hide, so assert the state that
    // drives it rather than the class.
    assert.equal(ui.node('#lc-warning').textContent, 'stale', outcome);
  }
});

test('a failed status request leaves the warning alone', async () => {
  const ui = app(async () => { throw new Error('offline'); });
  ui.run(`localStorage.getItem = () => "a-cookie";
          $("#lc-warning").textContent = ""; checkLeetCodeAuth()`);
  await new Promise((r) => setImmediate(r));
  assert.equal(ui.node('#lc-warning').textContent, '');
});

test('locking in a plan needs an approach and a time target', async () => {
  const bodies = [];
  const ui = app(async (path, opts) => {
    if (opts && opts.body) bodies.push([path, JSON.parse(opts.body)]);
    return response({ active: null, url: 'u' });
  });
  ui.run('window.open = () => ({}); pendingStart = { slug: "two-sum", kind: "review" }; planOpenedAt = Date.now() - 90000');
  ui.node('#predict-approach').value = 'hash complements';
  ui.run('doStart("planned")');
  assert.equal(bodies.length, 0);
  assert.equal(ui.run('pendingStart.slug'), 'two-sum');

  ui.node('#predict-time').value = 'O(n)';
  await ui.run('doStart("planned")')?.catch?.(() => {});
  const [path, body] = bodies[0];
  assert.equal(path, '/api/session/start');
  assert.equal(body.plan_status, 'planned');
  assert.equal(body.predicted_approach, 'hash complements');
  assert.equal(body.complexity_target_time, 'O(n)');
  assert.ok(body.plan_time_sec >= 89 && body.plan_time_sec <= 91);
  assert.equal(ui.run('pendingStart'), null);
});

test('no idea yet starts the run without a plan but keeps the thinking time', async () => {
  const bodies = [];
  const ui = app(async (path, opts) => {
    if (opts && opts.body) bodies.push(JSON.parse(opts.body));
    return response({ active: null, url: 'u' });
  });
  ui.run('window.open = () => ({}); pendingStart = { slug: "two-sum", kind: "new" }; planOpenedAt = Date.now() - 30000');
  ui.node('#predict-approach').value = 'half an idea';
  await ui.run('doStart("blank")')?.catch?.(() => {});
  assert.equal(bodies[0].plan_status, 'blank');
  assert.equal(bodies[0].predicted_approach, undefined);
  assert.ok(bodies[0].plan_time_sec >= 29);
});

test('lock-in switches to the run and opens the editor before the start answers', async () => {
  let answer;
  const ui = app((path) => (String(path).includes('/session/start')
    ? new Promise((resolve) => { answer = resolve; }) : response({ pending: [] })));
  ui.run('window.open = () => ({}); planOpenedAt = Date.now() - 60000');
  ui.run('window.Editor = { mount: (a, st) => { window.mounts.push([a, st]); }, unmount() {}, setPaused() {}, preload() {} }');
  ui.run('window.mounts = []');
  ui.run(`pendingStart = { slug: "two-sum", kind: "review", title: "Two Sum", url: "https://lc/two-sum",
          content_html: "<p>x</p>", editor: { available: true, can_judge: true, starter_code: "S",
          example_testcases: ["[1]"], interview_runs: 2, par_sec: 900 } }`);
  ui.node('#predict-approach').value = 'hash';
  ui.node('#predict-time').value = 'O(n)';
  ui.node('#predict-edge-cases').value = 'empty; Empty; dupes';
  const started = ui.run('doStart("planned")');
  // Painted from the click: no id yet, controls that need one are off.
  const [pending, state] = ui.run('window.mounts[0]');
  assert.equal(pending.session_id, null);
  assert.equal(ui.run('activeSession.title'), 'Two Sum');
  assert.equal(ui.node('#active-par').textContent, '15m pace');
  assert.equal(ui.node('#btn-pause-session').disabled, true);
  assert.equal(state.code, 'S');
  assert.deepEqual([...state.planned_edge_cases], ['empty', 'dupes']);

  await new Promise((r) => setImmediate(r));
  answer(response({ url: 'u', active: { ...pending, session_id: 's1', hints_available: true },
                    editor: { code: 'S', now_ms: 5 } }));
  await started;
  const [real, fromStart] = ui.run('window.mounts[1]');
  assert.equal(real.session_id, 's1');
  assert.equal(fromStart.now_ms, 5);
  assert.equal(ui.node('#btn-pause-session').disabled, false);
});

test('a lock-in whose start fails puts the dashboard back', async () => {
  const ui = app(async (path) => (String(path).includes('/session/start')
    ? { ok: false, status: 503, statusText: 'x', json: async () => ({ detail: "You're offline." }) }
    : response({ pending: [] })));
  ui.run('window.open = () => ({}); planOpenedAt = Date.now()');
  ui.run('window.Editor = { mount() {}, unmount() { window.unmounted = true; }, setPaused() {}, preload() {} }');
  ui.run('pendingStart = { slug: "two-sum", kind: "new" }');
  await ui.run('doStart("skipped")');
  assert.equal(ui.run('activeSession'), null);
  assert.equal(ui.run('window.unmounted'), true);
  assert.equal(ui.node('#toast').textContent, "Couldn't start the run: You're offline.");
});

test('saving a planned solve sends whether the plan held, then grades the plan', async () => {
  const calls = [];
  const ui = app(async (path, opts) => {
    calls.push([path, opts && opts.body ? JSON.parse(opts.body) : null]);
    if (path.endsWith('/annotate')) return response({ ok: true, plan: { status: 'planned', held: 'pivoted' } });
    return response({ ok: true, plan: { status: 'planned', graded: true, score: 2, approach_verdict: 'partial' } });
  });
  ui.run('llmEnabled = true; currentAttempt = { id: "a1", code: null, plan: { status: "planned" } }');
  ui.node('#conf-group button.sel').dataset.val = '3';
  ui.node('#indep-group button.sel').dataset.val = 'solo';
  ui.node('#held-group button.sel').dataset.val = 'pivoted';
  await ui.node('#btn-save-annotate').listeners.click();
  const annotate = calls.find(([p]) => p.endsWith('/annotate'));
  assert.equal(annotate[1].plan_held, 'pivoted');
  assert.ok(calls.some(([p]) => p.endsWith('/a1/grade-plan')));
  assert.equal(ui.node('#toast').textContent, 'Logged — grading your plan…');
  assert.match(ui.node('#annotate-plan-grade').innerHTML, /Plan score <b>2\/5<\/b>/);
});

test('stopping an optimize run goes back to rating that solve, not the queue head', async () => {
  const ui = app(async () => response({
    pending: [{ id: 'older', slug: 'a', title: 'A' }, { id: 'optimized', slug: 'b', title: 'B' }],
  }));
  closeModal(ui);
  await ui.run('reopenForRating("optimized")');
  assert.equal(ui.run('currentAttempt.id'), 'optimized');
});

test('a hint asks with the code on screen, lists unnumbered and draws its marks', async () => {
  const calls = [];
  const ui = app(async (path, opts) => {
    calls.push([path, opts && opts.body ? JSON.parse(opts.body) : null]);
    return response({ hint: 'What does `seen` hold?', level: 2, available: true,
                      marks: [{ line: 3, text: 'x', note: 'here?' }] });
  });
  ui.run(`window.Editor = { tick() { window.ticked = true; }, flush: async () => {}, code: () => "CODE",
          showMarks: (m) => { window.marks = m; return m.length; } }`);
  ui.run('activeSession = { session_id: "s1", hints: ["Earlier one."], hint_level: 1, hints_available: true }');
  await ui.node('#btn-hint').listeners.click();
  const [path, body] = calls.find(([p]) => p.endsWith('/session/hint'));
  assert.equal(body.code, 'CODE');
  assert.equal(ui.run('window.ticked'), true);
  assert.equal(ui.run('activeSession.hint_level'), 2);
  const html = ui.node('#hint-panel').innerHTML;
  assert.match(html, /<ul class="hint-list">/);
  assert.match(html, /<li class="is-latest">What does <code>seen<\/code> hold\?<\/li>/);
  assert.doesNotMatch(html, /of \d/);
  assert.equal(ui.node('#btn-hint').textContent, 'Another hint');
  assert.equal(ui.run('window.marks[0].note'), 'here?');
});

test('giving up takes a second click, then keeps the approach on screen', async () => {
  const calls = [];
  const ui = app(async (path) => { calls.push(path); return response({ text: 'Slide a window.' }); });
  ui.run('activeSession = { session_id: "s1", give_up_available: true }');
  const btn = ui.node('#btn-give-up');
  await btn.listeners.click();
  assert.equal(btn.textContent, 'Sure? Click again');
  assert.equal(calls.filter((p) => p.endsWith('/give-up')).length, 0);
  await btn.listeners.click();
  assert.equal(calls.filter((p) => p.endsWith('/give-up')).length, 1);
  assert.equal(ui.run('activeSession.give_up'), 'Slide a window.');
  assert.match(ui.node('#give-up-panel').innerHTML, /The approach[\s\S]*Slide a window\./);
});
