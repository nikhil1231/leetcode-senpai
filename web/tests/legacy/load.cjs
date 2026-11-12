// Loads a module from src/legacy/ the way the browser does, into a bare vm context, and hands back what it registered.
// The imperative modules assign their API to `window` (or the global); a few expose test-only helpers through
// globalThis.__legacyExports. No bundler, no DOM: the pure ones (models, engines, calculators) need neither.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '../../src/legacy');
const GLOBAL = { 'ai-models': 'AIModels', 'ai-sim': 'AISim', 'core-models': 'CoreModels', 'dist-models': 'DistModels', 'fund-models': 'FundModels',
  'nightshift-engine': 'NightShiftEngine', 'sd-sim': 'SDSim', 'sd-stress': 'SDStress', 'sd-builder-calc': 'SDBuilderCalc' };

// Run in this realm (not a vm context), so arrays and objects the modules return compare equal to the test's own.
function run(names) {
  const root = { console, Math, JSON, Date };
  root.window = root;
  globalThis.__legacyExports = {};
  for (const n of names) new Function('window', fs.readFileSync(path.join(DIR, `${n}.js`), 'utf8')).call(root, root);
  return root;
}
// `deps` run first in the same root (sd-sim looks for SDStress and AISim).
const module_ = (name, deps = []) => run([...deps, name])[GLOBAL[name]];
const exports_ = (name) => { run([name]); return globalThis.__legacyExports[name]; };
module.exports = { module: module_, exports: exports_, DIR, PUBLIC: path.join(__dirname, '../../public') };
