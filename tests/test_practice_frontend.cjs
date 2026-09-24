const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const catalog = () => ({
  modes: [{ id: 'break', title: 'Find the breaking input', duration: '1 min', description: 'Find a bug' },
          { id: 'fill', title: 'Fill the missing piece', duration: '1 min', description: 'Fill a blank' }],
  exercises: [{ id: 'break-last', mode: 'break', topic: 'Arrays', title: 'Last element', variants: false },
              { id: 'fill-dp', mode: 'fill', topic: 'DP', title: 'Stairs', variants: false }],
  status: {},
});
const arrayQ = (n = 1) => ({ id: `v1:break-last:${n}`, template: 'break-last', mode: 'break', title: 'Last element',
  topic: 'Arrays', code: 'return False', prompt: 'Find an input', input_type: 'array' });
const choiceQ = (n = 1) => ({ id: `v1:fill-dp:${n}`, template: 'fill-dp', mode: 'fill', title: 'Stairs', topic: 'DP',
  code: 'ways[i] = ___', prompt: 'Fill it', input_type: 'choice',
  options: [{ id: '2', text: 'a' }, { id: '0', text: 'b' }, { id: '1', text: 'c' }] });
const graded = (q, extra = {}) => ({ question_id: q.id, template: q.template, mode: q.mode, correct: true,
  revealed: false, explanation: 'Because.', expected: true, actual: false, correct_option: '0', solution: 'b', ...extra });
const settle = () => new Promise(resolve => setImmediate(resolve));

function ui(api) {
  const nodes = new Map();
  let keydown = null;
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, {
        id: id.replace('#', ''), innerHTML: '', textContent: '', value: '', disabled: false, dataset: {}, listeners: {},
        classList: { toggle(c, on) { on ? classes.add(c) : classes.delete(c); }, contains: c => classes.has(c) },
        focus() {},
        addEventListener(event, fn) { this.listeners[event] = fn; },
        querySelectorAll(selector) {
          const html = node('#tab-practice').innerHTML;
          if (selector === '[data-mode]') return [...html.matchAll(/data-mode="([^"]*)"/g)].map(m => {
            const n = node(`mode:${m[1]}`); n.dataset.mode = m[1]; return n; });
          const options = [...html.matchAll(/data-option="([^"]*)"/g)].map(m => {
            const n = node(`option:${m[1]}`); n.dataset.option = m[1]; return n; });
          if (selector === '[data-option]') return options;
          if (selector.includes('#practice-input')) return [node('#practice-input'), node('#practice-check'), node('#practice-reveal'), ...options];
          return [];
        },
      });
    }
    return nodes.get(id);
  }
  const document = {
    addEventListener(event, fn) { if (event === 'keydown') keydown = fn; },
    querySelector() { return null; },
  };
  const window = { Views: {}, H: { $: node, escapeHtml: x => String(x), api, loader: x => x } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/practice.js'), 'utf8'),
    { window, document, URLSearchParams });
  const html = () => node('#tab-practice').innerHTML;
  return {
    node, html, render: window.Views.renderPractice,
    click: async id => { await node(id).listeners.click(); await settle(); },
    key: async (key, target = {}, extra = {}) => {
      let prevented = false;
      const e = { key, target, preventDefault() { prevented = true; }, ...extra };
      if (target.listeners && target.listeners.keydown) target.listeners.keydown(e);
      keydown(e);
      await settle();
      return prevented;
    },
  };
}

test('clicking a category starts a run straight into a question', async () => {
  const calls = [];
  const view = ui(async url => { calls.push(url); return url === '/practice' ? catalog() : arrayQ(); });
  await view.render();
  assert.match(view.html(), /Mixed/);
  assert.deepEqual(calls, ['/practice']);
  await view.click('mode:break');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /^\/practice\/next\?mode=break&topic=&recent=$/);
  assert.match(view.html(), /Your counterexample/);
});

test('a number key answers a choice, the answer shows at once, Enter serves the prefetched next', async () => {
  const calls = [];
  let served = 0;
  const view = ui(async (url, method, body) => {
    calls.push([url, body]);
    if (url === '/practice') return catalog();
    if (method === 'POST') return graded(choiceQ(1), { correct: false, correct_option: '0', solution: 'b' });
    return choiceQ(++served);
  });
  await view.render();
  await view.click('mode:fill');
  assert.equal(await view.key('2'), true);
  assert.equal(calls.filter(([u]) => u === '/practice/answer')[0][1].answer, '0');
  assert.match(view.node('#practice-feedback').innerHTML, /Not quite/);
  assert.match(view.node('#practice-feedback').innerHTML, /b/);
  assert.equal(view.node('option:0').classList.contains('is-correct'), true);
  assert.equal(view.node('option:1').classList.contains('is-correct'), false);
  // The next question is fetched while the explanation is read, with this one as recent.
  const nexts = calls.filter(([u]) => u.startsWith('/practice/next'));
  assert.equal(nexts.length, 2);
  assert.match(nexts[1][0], /recent=fill-dp/);
  await view.key('Enter');
  assert.equal(calls.filter(([u]) => u.startsWith('/practice/next')).length, 2);
  assert.match(view.html(), /v1:fill-dp:2|Stairs/);
  assert.match(view.node('#practice-tally').innerHTML + view.html(), /1 answered · 0 right/);
  await view.key('Escape');
  assert.match(view.html(), /Last run: 1 answered, 0 right/);
  assert.match(view.html(), /1 to revisit/);
});

test('Enter checks a typed answer, Shift+Enter does not, and a failed save keeps the draft', async () => {
  let posts = 0;
  const view = ui(async (url, method) => {
    if (url === '/practice') return catalog();
    if (method === 'POST') { posts++; throw new Error('Save unavailable'); }
    return arrayQ();
  });
  await view.render();
  await view.click('mode:break');
  const input = view.node('#practice-input');
  input.value = '[1,\n 1]';
  assert.equal(await view.key('Enter', input, { shiftKey: true }), false);
  assert.equal(posts, 0);
  const before = view.html();
  await view.render();  // a background refresh must not wipe the question
  assert.equal(view.html(), before);
  await view.key('Enter', input);
  assert.equal(posts, 1);
  assert.equal(input.value, '[1,\n 1]');
  assert.equal(input.disabled, false);
  assert.equal(view.node('#practice-check').disabled, false);
  assert.equal(view.node('#practice-error').textContent, 'Save unavailable');
});

test('double submissions save once', async () => {
  let finish, posts = 0;
  const view = ui(async (url, method) => {
    if (url === '/practice') return catalog();
    if (method === 'POST') { posts++; return new Promise(resolve => { finish = resolve; }); }
    return arrayQ();
  });
  await view.render();
  await view.click('mode:break');
  view.node('#practice-input').value = '[1, 1]';
  view.node('#practice-check').listeners.click();
  view.node('#practice-check').listeners.click();
  view.node('#practice-input').listeners.keydown({ key: 'Enter', preventDefault() {} });
  await settle();
  assert.equal(posts, 1);
  finish(graded(arrayQ())); await settle();
  assert.match(view.node('#practice-feedback').innerHTML, /That’s right/);
});

test('Esc during a pending save stops the run without reopening the question', async () => {
  let finish;
  const view = ui(async (url, method) => {
    if (url === '/practice') return catalog();
    if (method === 'POST') return new Promise(resolve => { finish = resolve; });
    return arrayQ();
  });
  await view.render();
  await view.click('mode:break');
  view.node('#practice-reveal').listeners.click();
  await settle();
  await view.key('Escape');
  finish(graded(arrayQ(), { correct: false, revealed: true, solution: '[1, 1]' })); await settle();
  assert.match(view.html(), /Pick a kind of question/);
  assert.match(view.html(), /1 to revisit/);
  assert.doesNotMatch(view.html(), /practice-input/);
});
