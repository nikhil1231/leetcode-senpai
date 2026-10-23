const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function app(api = async () => ({reply: 'Try a right shift.', model: 'test/model'})) {
  const nodes = new Map(), handlers = {}, observers = [];
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set(id === '#page-coach' ? ['hidden'] : []);
      nodes.set(id, { id: id.slice(1), value: '', textContent: '', innerText: '', innerHTML: '', attributes: {}, listeners: {},
        classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c) },
        querySelectorAll: () => [], getClientRects: () => [1], focus() { this.focused = true; },
        setAttribute(k,v) {this.attributes[k] = v;}, getAttribute(k) {return this.attributes[k];},
        addEventListener(k,fn) {this.listeners[k] = fn;}, contains: n => n === node('#page-coach-input'),
        insertAdjacentHTML(_, html) {this.innerHTML += html;},
      });
    }
    return nodes.get(id);
  }
  let tab = node('#tab-practice');
  const body = node('body');
  const context = vm.createContext({
    window: { H: {$: node, api, escapeHtml: s => s.replaceAll('<', '&lt;').replaceAll('>', '&gt;')} },
    llmEnabled: true, llmModel: 'test/model',
    document: {body, querySelectorAll: () => [],
      querySelector: s => s.startsWith('main') ? tab : null,
      addEventListener(k,fn) {handlers[k] = fn;},
    },
    MutationObserver: class {constructor(fn) {observers.push(fn);} observe() {}},
  });
  node('#page-title').textContent = 'Quickfire';
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/page-coach.js'), 'utf8'), context);
  const send = async text => {node('#page-coach-input').value = text; await node('#page-coach-form').listeners.submit({preventDefault() {}});};
  return {node, body, handlers, observers, send, snapshot: context.window.PageCoach.snapshot,
    setTab(value) {tab = value;}, open() {node('#btn-page-coach').listeners.click();}};
}

test('messages receive fresh question, selected mistake and bounded recent history', async () => {
  const calls = [], ui = app(async (_, method, body) => {calls.push(body); return {reply: '<script>use `exp >>= 1`</script>', model: 'test/model'};});
  ui.node('#tab-practice').innerText = 'Compute powers\nexp -= 1\nexp >>= 1';
  const wrong = {...ui.node('#wrong'), innerText: 'exp -= 1', matches: s => s.includes('is-wrong')};
  ui.node('#tab-practice').querySelectorAll = s => s.startsWith('.is-wrong') ? [wrong] : [];
  ui.open(); await ui.send('Why was I wrong?');
  assert.match(calls[0].context, /incorrect selection/);
  assert.match(calls[0].context, /exp -= 1/);
  assert.equal(calls[0].history.length, 0);
  assert.match(ui.node('#page-coach-messages').innerHTML, /&lt;script&gt;/);
  ui.node('#page-title').textContent = 'Lesson';
  ui.body.classList.add('section-design');
  ui.setTab(ui.node('#tab-design'));
  ui.node('#tab-design').innerText = 'Caching trade-offs';
  for (let i = 0; i < 6; i++) await ui.send('Explain this');
  assert.equal(calls.at(-1).history.length, 8);
  assert.equal(calls.at(-1).section, 'system-design');
  assert.equal(calls.at(-1).page, 'Lesson');
  assert.match(calls.at(-1).context, /Caching trade-offs/);
  assert.doesNotMatch(calls.at(-1).context, /Compute powers/);
});

test('snapshot excludes settings, credential fields and oversized page text', () => {
  const ui = app(), root = ui.node('#tab-practice');
  root.innerText = 'Question\n' + 'x'.repeat(20000);
  const field = (id,type,value) => ({id, name: '', type, value, labels: [], getAttribute: () => null,
    getClientRects: () => [1], closest: () => null});
  root.querySelectorAll = s => s.startsWith('input') ? [field('answer','text','my answer'), field('cookie','text','COOKIE_SECRET'), field('pass','password','PASSWORD_SECRET')] : [];
  const state = ui.snapshot();
  assert.ok(state.context.length <= 12000);
  assert.match(state.context, /my answer/);
  assert.doesNotMatch(state.context, /COOKIE_SECRET|PASSWORD_SECRET/);
  ui.setTab(ui.node('#tab-settings'));
  ui.node('#tab-settings').innerText = 'Credentials';
  assert.equal(ui.snapshot().context, '');
});

test('pending sends are serialized and a failed send preserves the draft', async () => {
  let reject, count = 0;
  const ui = app(() => {count++; return new Promise((_, fail) => {reject = fail;});});
  ui.open();
  const request = ui.send('Help me');
  await ui.send('Duplicate');
  assert.equal(count, 1);
  assert.equal(ui.node('#page-coach-send').disabled, true);
  reject(new Error('Coach unavailable')); await request;
  assert.equal(ui.node('#page-coach-input').value, 'Help me');
  assert.equal(ui.node('#page-coach-send').disabled, false);
  assert.equal(ui.node('#page-coach-error').textContent, 'Coach unavailable');
});

test('coach keyboard events cannot trigger Quickfire and editor entry closes the panel', async () => {
  const ui = app(); ui.open();
  let stopped = false, prevented = false;
  ui.node('#page-coach-input').value = 'Explain';
  ui.handlers.keydown({key:'Enter',target:ui.node('#page-coach-input'),preventDefault() {prevented=true;},stopImmediatePropagation() {stopped=true;}});
  assert.equal(stopped, true); assert.equal(prevented, true);
  await new Promise(resolve => setImmediate(resolve));
  ui.body.classList.add('has-editor-run');
  ui.observers[0]();
  assert.equal(ui.node('#page-coach').classList.contains('hidden'), true);
  assert.equal(ui.node('#btn-page-coach').attributes['aria-expanded'], 'false');
  ui.open();
  assert.equal(ui.node('#page-coach').classList.contains('hidden'), true);
  ui.body.classList.add('section-design');
  ui.open();
  assert.equal(ui.node('#page-coach').classList.contains('hidden'), false);
});
