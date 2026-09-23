const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const catalog = () => ({
  modes: [{ id: 'break', title: 'Break', duration: '1 min', description: 'Find a bug' }],
  exercises: [{ id: 'break-last', mode: 'break', topic: 'Arrays', title: 'Last element', variants: false }],
  results: [],
});
const question = { id: 'v1:break-last:1', template: 'break-last', mode: 'break',
  title: 'Last element', topic: 'Arrays', code: 'return False', prompt: 'Find an input', input_type: 'array' };
const result = { question_id: question.id, template: question.template, mode: 'break',
  correct: true, revealed: false, explanation: 'Last element was skipped.', expected: true, actual: false };
const settle = () => new Promise(resolve => setImmediate(resolve));

function ui(api) {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML: '', textContent: '', value: '', disabled: false, dataset: {}, listeners: {},
      classList: { toggle() {} }, focus() {},
      addEventListener(event, fn) { this.listeners[event] = fn; },
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === '[data-exercise]') return [node('exercise')];
        if (selector === '[data-mode]') return [node('mode')];
        if (selector.includes('#practice-form input')) return [node('#practice-input'), node('#practice-check'), node('#practice-reveal')];
        return [];
      },
    });
    return nodes.get(id);
  }
  node('exercise').dataset.exercise = 'break-last';
  node('mode').dataset.mode = 'break';
  const window = { Views: {}, H: { $: node, escapeHtml: x => String(x), api, loader: x => x } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/practice.js'), 'utf8'), { window });
  return { node, render: window.Views.renderPractice,
    click: async id => { await node(id).listeners.click(); await settle(); },
    submit: async () => { node('#practice-form').listeners.submit({ preventDefault() {} }); await settle(); },
  };
}

test('opening the library never starts an exercise; opening one never starts a solve session', async () => {
  const calls = [];
  const view = ui(async url => { calls.push(url); return url === '/practice' ? catalog() : question; });
  await view.render();
  assert.deepEqual(calls, ['/practice']);
  await view.click('exercise');
  assert.deepEqual(calls, ['/practice', '/practice/question/break-last']);
  assert.match(view.node('#tab-practice').innerHTML, /Your counterexample/);
});

test('background renders preserve drafts and failed saves re-enable the form', async () => {
  const view = ui(async (url, method) => {
    if (method === 'POST') throw new Error('Save unavailable');
    return url === '/practice' ? catalog() : question;
  });
  await view.render(); await view.click('exercise');
  view.node('#practice-input').value = '[1, 1]';
  const html = view.node('#tab-practice').innerHTML;
  await view.render();
  assert.equal(view.node('#tab-practice').innerHTML, html);
  await view.submit();
  assert.equal(view.node('#practice-input').value, '[1, 1]');
  assert.equal(view.node('#practice-check').disabled, false);
  assert.equal(view.node('#practice-reveal').disabled, false);
  assert.equal(view.node('#practice-error').textContent, 'Save unavailable');
});

test('double submissions save once and feedback does not automatically choose another exercise', async () => {
  let finish;
  const calls = [];
  const view = ui(async (url, method) => {
    calls.push(url);
    if (method === 'POST') return new Promise(resolve => { finish = resolve; });
    return url === '/practice' ? catalog() : question;
  });
  await view.render(); await view.click('exercise');
  view.node('#practice-input').value = '[1, 1]';
  await view.submit(); await view.submit();
  assert.equal(calls.filter(x => x === '/practice/answer').length, 1);
  finish(result); await settle();
  assert.match(view.node('#practice-feedback').innerHTML, /That’s right/);
  assert.equal(calls.filter(x => x.includes('/question/')).length, 1);
  await view.click('#practice-return');
  assert.match(view.node('#tab-practice').innerHTML, /Last answer correct/);
});

test('leaving while a save is pending does not reopen the question', async () => {
  let finish;
  const view = ui(async (url, method) => {
    if (method === 'POST') return new Promise(resolve => { finish = resolve; });
    return url === '/practice' ? catalog() : question;
  });
  await view.render(); await view.click('exercise');
  view.node('#practice-reveal').listeners.click();
  await settle();
  await view.click('#practice-back');
  finish({ ...result, correct: false, revealed: true, solution: '[1, 1]' }); await settle();
  assert.match(view.node('#tab-practice').innerHTML, /What feels manageable/);
  assert.match(view.node('#tab-practice').innerHTML, /Answer viewed/);
  assert.doesNotMatch(view.node('#tab-practice').innerHTML, /practice-form/);
});
