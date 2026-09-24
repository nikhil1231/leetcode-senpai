const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const catalog = () => ({
  storage_scope: 'test',
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

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) || null,
           setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

function ui(api, sessionStorage = memoryStorage()) {
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
  const window = { sessionStorage, Views: {}, H: { $: node, escapeHtml: x => String(x), api, loader: x => x } };
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
    if (url === '/practice/check') return { correct: true };
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

test('a five-question round finishes after feedback without fetching a sixth', async () => {
  let served = 0;
  const view = ui(async (url, method) => url === '/practice' ? catalog()
    : method === 'POST' ? graded(choiceQ(served)) : choiceQ(++served));
  await view.render();
  view.node('#practice-length').listeners.change({target: {value: '5'}});
  await view.click('mode:fill');
  for (let i = 0; i < 5; i++) {
    await view.key('1');
    if (i === 4) assert.match(view.node('#practice-feedback').innerHTML, /Finish round/);
    await view.key('Enter');
  }
  assert.equal(served, 5);
  assert.match(view.html(), /Last run: 5 answered/);
});

test('round recap distinguishes a guessed success from a secure takeaway', async () => {
  const view = ui(async (url, method) => {
    if (url === '/practice') return catalog();
    if (url === '/practice/guess') return graded(choiceQ(), {guessed: true});
    if (method === 'POST') return graded(choiceQ());
    return choiceQ();
  });
  await view.render();
  await view.click('mode:fill');
  await view.key('1');
  await view.click('#practice-guess');
  await view.key('Escape');
  assert.match(view.html(), /Revisit · Stairs/);
  assert.doesNotMatch(view.html(), /Takeaway · Stairs/);
  assert.match(view.html(), /Because/);
});

test('recall-first hides choices before exposure and submits a typed answer', async () => {
  let payload;
  const view = ui(async (url, method, body) => {
    if (url === '/practice') return catalog();
    if (method === 'POST') { payload = body; return graded(choiceQ()); }
    return choiceQ();
  });
  await view.render();
  view.node('#practice-recall-first').listeners.change({target: {checked: true}});
  await view.click('mode:fill');
  assert.doesNotMatch(view.html(), /data-option=/);
  view.node('#practice-input').value = 'ways[i-1] + ways[i-2]';
  await view.key('Enter', view.node('#practice-input'));
  assert.equal(payload.recall, true);
  assert.equal(payload.assisted, false);
  assert.equal(await view.key('Enter', {id: 'practice-guess', tagName: 'BUTTON'}), false);
});

test('failed counterexamples permit retry without exposing the answer', async () => {
  let checks = 0, saved;
  const view = ui(async (url, method, body) => {
    if (url === '/practice') return catalog();
    if (url === '/practice/check') return {correct: ++checks > 1, expected: false, actual: false};
    if (method === 'POST') { saved = body; return graded(arrayQ(), {assisted: true}); }
    return arrayQ();
  });
  await view.render();
  await view.click('mode:break');
  view.node('#practice-input').value = '[1, 2]';
  await view.click('#practice-check');
  assert.equal(saved, undefined);
  assert.match(view.node('#practice-feedback').innerHTML, /Try another input/);
  assert.doesNotMatch(view.node('#practice-feedback').innerHTML, /breaking input:/);
  view.node('#practice-input').value = '[1, 1]';
  await view.click('#practice-check');
  assert.equal(saved.assisted, true);
});

const roundKey = 'light-practice-round:v1:test';

test('refresh restores the exact question, draft and recall settings', async () => {
  const storage = memoryStorage();
  const first = ui(async url => url === '/practice' ? catalog() : choiceQ(42), storage);
  await first.render();
  first.node('#practice-recall-first').listeners.change({target: {checked: true}});
  first.node('#practice-length').listeners.change({target: {value: '5'}});
  await first.click('mode:fill');
  first.node('#practice-input').value = 'ways[i - 1]\n + ways[i - 2]';
  first.node('#practice-input').listeners.input();
  const calls = [];
  const restored = ui(async url => {
    calls.push(url);
    return url === '/practice' ? catalog() : {question: choiceQ(42), result: null};
  }, storage);
  await restored.render();
  assert.match(restored.html(), /Resume round/);
  assert.equal(calls.length, 1); // no question fetch until the user resumes
  await restored.click('#practice-resume');
  assert.equal(calls[1], '/practice/resume/v1%3Afill-dp%3A42');
  assert.equal(restored.node('#practice-input').value, 'ways[i - 1]\n + ways[i - 2]');
  assert.doesNotMatch(restored.html(), /data-option=/);
  assert.match(restored.html(), /0 \/ 5 answered/);
  await restored.key('Escape');
  assert.equal(storage.getItem(roundKey), null);
});

test('refresh after an answer restores feedback and counts it only once', async () => {
  const storage = memoryStorage();
  const answer = graded(choiceQ(7), {answer: '0'});
  const api = async (url, method) => {
    if (url === '/practice') return catalog();
    if (url.startsWith('/practice/resume/')) return {question: choiceQ(7), result: answer};
    if (method === 'POST') return answer;
    return choiceQ(7);
  };
  const first = ui(api, storage);
  await first.render();
  await first.click('mode:fill');
  await first.key('2');
  for (let i = 0; i < 2; i++) {
    const restored = ui(api, storage);
    await restored.render();
    await restored.click('#practice-resume');
    assert.equal(restored.node('#practice-tally').textContent, '1 answered · 1 right');
    assert.match(restored.node('#practice-feedback').innerHTML, /That’s right/);
    assert.equal(restored.node('option:0').disabled, true);
  }
});

test('refresh during a lost save response reconciles the server without reposting', async () => {
  const storage = memoryStorage();
  const first = ui(async (url, method) => {
    if (url === '/practice') return catalog();
    if (method === 'POST') return new Promise(() => {});
    return choiceQ(8);
  }, storage);
  await first.render();
  await first.click('mode:fill');
  first.node('option:0').listeners.click();
  await settle();
  assert.equal(JSON.parse(storage.getItem(roundKey)).pendingAnswer.answer, '0');
  let posts = 0;
  const restored = ui(async (url, method) => {
    if (method === 'POST') posts++;
    if (url === '/practice') return catalog();
    if (url.startsWith('/practice/resume/')) return {question: choiceQ(8), result: graded(choiceQ(8), {answer: '0'})};
    return choiceQ(9);
  }, storage);
  await restored.render();
  await restored.click('#practice-resume');
  assert.equal(posts, 0);
  assert.equal(restored.node('#practice-tally').textContent, '1 answered · 1 right');
  assert.equal(JSON.parse(storage.getItem(roundKey)).pendingAnswer, null);
});

test('an interrupted unsaved submission retries the same answer and assistance flags', async () => {
  const storage = memoryStorage();
  const first = ui(async (url, method) => {
    if (url === '/practice') return catalog();
    if (method === 'POST') throw new Error('Offline');
    return choiceQ(8);
  }, storage);
  await first.render();
  await first.click('mode:fill');
  await first.click('#practice-recall');
  first.node('#practice-input').value = 'ways[i-1]+ways[i-2]';
  await first.click('#practice-check');
  let payload;
  const restored = ui(async (url, method, body) => {
    if (url === '/practice') return catalog();
    if (url.startsWith('/practice/resume/')) return {question: choiceQ(8), result: null};
    if (method === 'POST') { payload = body; return graded(choiceQ(8), {answer: body.answer, assisted: true}); }
    return choiceQ(9);
  }, storage);
  await restored.render();
  await restored.click('#practice-resume');
  assert.equal(payload.question_id, choiceQ(8).id);
  assert.equal(payload.answer, 'ways[i-1]+ways[i-2]');
  assert.equal(payload.assisted, true);
  assert.equal(payload.recall, true);
  assert.equal(restored.node('#practice-tally').textContent, '1 answered · 1 right');
});

test('refresh retries an interrupted guess without adding another answer', async () => {
  const storage = memoryStorage();
  const first = ui(async (url, method) => {
    if (url === '/practice') return catalog();
    if (url === '/practice/guess') throw new Error('Offline');
    if (method === 'POST') return graded(choiceQ(), {answer: '0'});
    return choiceQ();
  }, storage);
  await first.render();
  await first.click('mode:fill');
  await first.key('2');
  await first.click('#practice-guess');
  let guesses = 0;
  const restored = ui(async url => {
    if (url === '/practice') return catalog();
    if (url.startsWith('/practice/resume/')) return {question: choiceQ(), result: graded(choiceQ(), {answer: '0'})};
    if (url === '/practice/guess') { guesses++; return graded(choiceQ(), {answer: '0', guessed: true}); }
    return choiceQ(2);
  }, storage);
  await restored.render();
  await restored.click('#practice-resume');
  assert.equal(guesses, 1);
  assert.equal(restored.node('#practice-tally').textContent, '1 answered · 1 right');
  assert.match(restored.node('#practice-feedback').innerHTML, /Marked as a guess/);
  await restored.key('Escape');
  assert.match(restored.html(), /Revisit · Stairs/);
});

test('resume survives an API error and stopping cancels a pending restore', async () => {
  const storage = memoryStorage();
  const first = ui(async url => url === '/practice' ? catalog() : arrayQ(), storage);
  await first.render();
  await first.click('mode:break');
  let finish, attempts = 0;
  const restored = ui(async url => {
    if (url === '/practice') return catalog();
    if (++attempts === 1) throw new Error('Offline');
    return new Promise(resolve => { finish = resolve; });
  }, storage);
  await restored.render();
  await restored.click('#practice-resume');
  assert.match(restored.html(), /Offline/);
  restored.node('#practice-retry').listeners.click();
  await settle();
  await restored.key('Escape');
  finish({question: arrayQ(), result: null});
  await settle();
  assert.match(restored.html(), /Pick a kind of question/);
  assert.doesNotMatch(restored.html(), /Resume round/);
  assert.equal(storage.getItem(roundKey), null);
});

test('draft recovery is scoped by user and invalid or expired snapshots are discarded', async () => {
  const storage = memoryStorage();
  const api = async url => url === '/practice' ? catalog() : arrayQ();
  const first = ui(api, storage);
  await first.render();
  await first.click('mode:break');
  const original = storage.getItem(roundKey);
  const otherUser = ui(async () => ({...catalog(), storage_scope: 'someone-else'}), storage);
  await otherUser.render();
  assert.doesNotMatch(otherUser.html(), /Resume round/);
  assert.equal(storage.getItem(roundKey), original);
  for (const invalid of ['{broken', JSON.stringify({...JSON.parse(original), savedAt: 1}),
                         JSON.stringify({...JSON.parse(original), run: {}})]) {
    storage.setItem(roundKey, invalid);
    const restored = ui(api, storage);
    await restored.render();
    assert.doesNotMatch(restored.html(), /Resume round/);
    assert.equal(storage.getItem(roundKey), null);
  }
});

test('unavailable browser storage does not prevent practicing', async () => {
  const blocked = () => { throw new Error('Storage disabled'); };
  const view = ui(async (url, method) => url === '/practice' ? catalog()
    : method === 'POST' ? graded(choiceQ()) : choiceQ(),
    {getItem: blocked, setItem: blocked, removeItem: blocked});
  await view.render();
  await view.click('mode:fill');
  await view.key('1');
  assert.match(view.node('#practice-feedback').innerHTML, /That’s right/);
  await view.key('Escape');
  assert.match(view.html(), /Last run: 1 answered/);
});

test('offline practice says answers are kept locally and counts what is waiting to sync', async () => {
  const view = ui(async (url, method) => {
    if (url === '/practice') return { ...catalog(), sync: { offline: true, unsynced: 0 } };
    if (method === 'POST') return graded(choiceQ(1), { sync: { offline: true, unsynced: 1 } });
    return choiceQ();
  });
  await view.render();
  assert.match(view.html(), /Offline\. Answers are saved on this computer/);
  await view.click('mode:fill');
  assert.match(view.html(), /offline, saved locally/);
  await view.key('2');
  assert.match(view.node('#practice-tally').textContent, /1 answered · 1 right · offline, saved locally/);
  await view.key('Escape');
  assert.match(view.html(), /1 answer waiting to sync/);
});

test('online practice with nothing pending shows no sync note', async () => {
  const view = ui(async url => url === '/practice' ? { ...catalog(), sync: { offline: false, unsynced: 0 } } : choiceQ());
  await view.render();
  assert.doesNotMatch(view.html(), /Offline|waiting to sync|saved locally/);
});
