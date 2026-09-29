// Run with node --test tests/test_editor_frontend.cjs (no npm dependencies).
// Loads static/editor.js against a stub DOM and a stub CodeMirror whose buffer is
// a plain string the test edits, then checks what reaches the server.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const STARTER = 'class Solution:\n    pass\n';

function editor({ state = {}, saved = null, api: apiImpl } = {}) {
  const nodes = new Map();
  const node = (sel) => {
    if (!nodes.has(sel)) nodes.set(sel, {
      value: '', disabled: false, innerHTML: '', listeners: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener(ev, fn) { this.listeners[ev] = fn; },
    });
    return nodes.get(sel);
  };
  const calls = [];
  const buffer = { code: STARTER };
  const storage = new Map(saved ? [['editor-run:v1:s1', JSON.stringify(saved)]] : []);
  const intervals = [];
  const serverState = { available: true, can_judge: true, content_html: '<p>x</p>',
                        starter_code: STARTER, example_testcases: ['[1]'], code: STARTER,
                        seq: 0, now_ms: 0, ...state };
  const api = async (p, method, body) => {
    calls.push({ path: p, body: body && JSON.parse(JSON.stringify(body)) });
    if (apiImpl) return apiImpl(p, body, calls);
    if (p.startsWith('/editor/state')) return serverState;
    return { ok: true, result: { passed: true, cases: [] } };
  };
  const noop = () => ({});
  const CM = {
    Compartment: class { of() { return {}; } reconfigure() { return {}; } },
    EditorState: { create: ({ doc }) => { buffer.code = doc; return {}; }, readOnly: { of: noop } },
    EditorView: Object.assign(class {
      constructor() { this.state = { doc: { toString: () => buffer.code } }; }
      dispatch() {} destroy() {}
    }, { theme: noop }),
    keymap: { of: noop }, indentUnit: { of: noop },
    closeBracketsKeymap: [], defaultKeymap: [], historyKeymap: [], indentWithTab: {},
  };
  for (const f of ['lineNumbers', 'highlightActiveLineGutter', 'highlightSpecialChars', 'history',
                   'drawSelection', 'indentOnInput', 'bracketMatching', 'closeBrackets',
                   'highlightActiveLine', 'syntaxHighlighting', 'python']) CM[f] = noop;
  const context = vm.createContext({
    window: { H: { $: node, escapeHtml: (s) => String(s), api, toast() {}, sanitizeProblemHtml: (h) => h || '' },
              CM, App: { onEditorSolved() {} } },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v),
                    removeItem: (k) => storage.delete(k) },
    setInterval(fn) { intervals.push(fn); return intervals.length; }, clearInterval() {},
    Date, JSON, Promise, Math, Number, Object, String,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/editor.js'), 'utf8'), context);
  const E = context.window.Editor;
  return { E, node, calls, buffer, storage,
           logs: () => calls.filter((c) => c.path === '/editor/log'),
           mount: () => E.mount({ session_id: 's1', surface: 'editor', started_at: Math.floor(Date.now() / 1000) - 60, is_paused: false }) };
}

test('diff is the single minimal replacement, or null when unchanged', () => {
  const { E } = editor();
  assert.deepEqual({ ...E.diff('return None', 'return []') }, { f: 7, to: 11, s: '[]' });
  assert.equal(E.diff('same', 'same'), null);
  for (const [a, b] of [['', 'abc'], ['abc', ''], ['aaa', 'aa'], ['x = 1\ny = 2', 'x = 10\ny = 20']]) {
    const d = E.diff(a, b);
    assert.equal(a.slice(0, d.f) + d.s + a.slice(d.to), b);
  }
});

test('a tick with no change logs nothing; a change logs one delta', async () => {
  // The server's clock says the run is a minute old; events follow it.
  const ui = editor({ state: { now_ms: 60000 } });
  await ui.mount();
  await ui.E.flush();
  ui.E.tick();
  await ui.E.flush();
  assert.equal(ui.logs().length, 0);

  ui.buffer.code = STARTER.replace('pass', 'return 1');
  ui.E.tick();
  ui.E.tick();
  await ui.E.flush();
  const [log] = ui.logs();
  assert.equal(log.body.seq, 1);
  assert.equal(log.body.events.length, 1);
  const ev = log.body.events[0];
  assert.equal(ev.k, 'd');
  assert.equal(STARTER.slice(0, ev.f) + ev.s + STARTER.slice(ev.to), ui.buffer.code);
  assert.ok(ev.t >= 60000 && ev.t < 62000);
});

test('a failed flush retries the very same batch; later edits go in the next one', async () => {
  let fail = true;
  const ui = editor({ api: async (p) => {
    if (p.startsWith('/editor/state')) return { available: true, can_judge: true, starter_code: STARTER,
                                                code: STARTER, seq: 0, now_ms: 0, example_testcases: [] };
    if (p === '/editor/log' && fail) throw new Error('offline');
    return { ok: true };
  } });
  await ui.mount();
  ui.buffer.code = STARTER + '# a\n';
  ui.E.tick();
  await ui.E.flush();
  fail = false;
  ui.buffer.code = STARTER + '# ab\n';
  ui.E.tick();
  await ui.E.flush();
  const logs = ui.logs();
  assert.deepEqual(logs.map((l) => l.body.seq), [1, 1, 2]);
  assert.deepEqual(logs[0].body.events, logs[1].body.events);
  assert.equal(logs[2].body.events.length, 1);
});

test('a run carries the unsent edits and the code as it stands', async () => {
  const ui = editor();
  await ui.mount();
  ui.buffer.code = STARTER.replace('pass', 'return 2');
  ui.node('#editor-input').value = '[1]';
  await ui.node('#editor-run').listeners.click();
  await new Promise((r) => setImmediate(r));
  const run = ui.calls.find((c) => c.path === '/editor/run');
  assert.equal(run.body.code, ui.buffer.code);
  assert.equal(run.body.data_input, '[1]');
  assert.equal(run.body.seq, 1);
  assert.equal(run.body.events.length, 1);
  // Nothing left to send afterwards: the run delivered it.
  await ui.E.flush();
  assert.equal(ui.logs().length, 0);
});

test('this browser\'s unsent work survives a reload unless another device logged past it', async () => {
  const saved = { code: STARTER + '# local\n', lastLogged: STARTER, queue: [{ t: 5, k: 'blur' }],
                  inflight: null, seq: 3 };
  const ui = editor({ saved, state: { seq: 3, code: STARTER } });
  await ui.mount();
  assert.equal(ui.buffer.code, STARTER + '# local\n');
  await ui.E.flush();
  assert.equal(ui.logs()[0].body.seq, 4);

  const behind = editor({ saved, state: { seq: 7, code: STARTER + '# other device\n' } });
  await behind.mount();
  assert.equal(behind.buffer.code, STARTER + '# other device\n');
});
