const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(sitting = 'paper_1') {
  const classes = new Set(['hidden']), requests = [], actions = new Map(), storage = new Map();
  const draft = {id: 'paper_1', status: 'sitting', scope_label: 'Mixed', items: [], answers: {}, time_limit_sec: 900};
  let click, routed, paints = 0;
  const pill = {classList: {toggle(c, on) { on ? classes.add(c) : classes.delete(c); }}, addEventListener(_, fn) { click = fn; }};
  const window = {H: {$: id => id === '#btn-back-to-paper' ? pill : null, escapeHtml: s => s,
    api: async (path, method = 'GET') => {
      requests.push([path, method]);
      if (path.endsWith('/discard')) { sitting = null; return {}; }
      if (path.endsWith('/papers')) return {sitting, papers: [], lengths: {}, grades: []};
      return draft;
    }}, SystemDesign: {isBusy: () => false, repaint() { paints++; }, openView: async () => {}},
    AppSections: {select(...args) { routed = args; }}};
  const context = {window, document: {addEventListener() {}, body: {classList: {contains: () => false}}},
    sessionStorage: {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k)},
    performance: {now: () => 1}, clearInterval, clearTimeout, setTimeout, setInterval};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../static/sd-papers.js'), 'utf8'), context);
  const root = {querySelectorAll: selector => selector === '[data-paper]' ? [...actions].map(([action]) => ({dataset: {paper: action}, addEventListener(_, fn) {actions.set(action, fn);}})) : [], querySelector: () => null};
  return {papers: window.DesignPapers, requests, classes, storage, click: () => click(), route: () => routed,
    wire(...names) { names.forEach(n => actions.set(n, null)); window.DesignPapers.wire(root); }, act: name => actions.get(name)()};
}

test('header restores ongoing paper after reload and resumes it directly', async () => {
  const h = harness();
  await h.papers.refreshOngoing();
  assert.equal(h.classes.has('hidden'), false);
  h.click();
  assert.deepEqual(h.route(), ['system-design', 'papers']);
  await h.papers.open();
  assert.equal(h.papers.current().id, 'paper_1');
  h.papers.stop();
  assert.equal(h.classes.has('hidden'), false);
});

test('quit discards the draft and clears the header and local clock', async () => {
  const h = harness();
  await h.papers.open(); h.click(); await h.papers.open();
  h.storage.set('sd-paper-elapsed:paper_1', '50');
  h.wire('discard'); await h.act('discard');
  assert.equal(h.papers.current(), null);
  assert.equal(h.classes.has('hidden'), true);
  assert.equal(h.storage.has('sd-paper-elapsed:paper_1'), false);
  assert.ok(h.requests.some(([p]) => p.endsWith('/discard')));
  assert.equal(h.requests.some(([p]) => /\/(answer|finish|mark)$/.test(p)), false);
});

test('header stays hidden without an ongoing paper', async () => {
  const h = harness(null); await h.papers.refreshOngoing();
  assert.equal(h.classes.has('hidden'), true);
});
