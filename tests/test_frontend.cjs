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
    });
    return nodes.get(selector);
  };
  const context = vm.createContext({
    window: { location: { hostname: 'localhost' }, addEventListener() {} },
    document: {
      readyState: 'loading', addEventListener() {},
      querySelector: node, querySelectorAll: () => [],
    },
    localStorage: { getItem: () => null }, fetch,
    setInterval(fn) { const id = nextTimer++; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout() {}, clearTimeout() {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8'), context);
  return { node, intervals, run: (code) => vm.runInContext(code, context) };
}
const response = (body) => ({ ok: true, json: async () => body });

test('slow solve polling never overlaps and resumes after failure', async () => {
  let rejectRequest;
  let calls = 0;
  const ui = app(() => {
    calls++;
    if (calls === 1) return new Promise((resolve, reject) => { rejectRequest = reject; });
    return response({ pending: [] });
  });
  ui.run('activeSession = { session_id: "one" }; startPolling()');
  const tick = [...ui.intervals.values()][0];
  const first = tick();
  await tick();
  assert.equal(calls, 1);
  rejectRequest(new Error('offline'));
  await first;
  await tick();
  assert.equal(calls, 2);
});

test('poll response from a cancelled session cannot reopen annotation', async () => {
  let resolveRequest;
  const ui = app(() => new Promise((resolve) => { resolveRequest = resolve; }));
  ui.run('activeSession = { session_id: "one" }; startPolling()');
  const request = [...ui.intervals.values()][0]();
  await Promise.resolve();
  await Promise.resolve();
  ui.run('activeSession = null; stopPolling()');
  resolveRequest(response({ pending: [{ id: 'old' }] }));
  await request;
  assert.equal(ui.run('currentAttempt'), null);
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

test('a solve with no captured code says why, instead of hiding the grade panel', () => {
  const ui = app(async () => response({}));
  ui.run(`llmEnabled = true;
          initAnnotateGrade({ id: "attempt-one", submission_id: 7, code: null })`);
  const panel = ui.node('#annotate-grade').innerHTML;
  assert.match(panel, /No solution grade/);
  assert.match(panel, /LEETCODE_SESSION/);
});

test('a manual log has no submission to explain away', () => {
  const ui = app(async () => response({}));
  ui.run(`llmEnabled = true;
          initAnnotateGrade({ id: "attempt-one", submission_id: null, code: null })`);
  assert.equal(ui.node('#annotate-grade').innerHTML, '');
});

test('saving an ungradable solve never promises a grade', async () => {
  const calls = [];
  const ui = app(async (path) => { calls.push(path); return response({ ok: true }); });
  ui.run('llmEnabled = true; currentAttempt = { id: "attempt-one", code: null }');
  ui.node('#conf-group button.sel').dataset.val = '3';
  ui.node('#indep-group button.sel').dataset.val = 'solo';
  await ui.node('#btn-save-annotate').listeners.click();
  assert.equal(ui.node('#toast').textContent, 'Logged');
  assert.ok(!calls.some((p) => p.includes('grade-solution')));
});
