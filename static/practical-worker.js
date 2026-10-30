// Runs exercise tests in Pyodide, off the main thread, so an infinite loop can be stopped by
// terminating the worker. Messages: {type:'init'} and {type:'run', id, files, modules}.
/* global importScripts, loadPyodide */
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/';
let ready = null;

function init() {
  if (!ready) {
    ready = (async () => {
      importScripts(PYODIDE + 'pyodide.js');
      const py = await loadPyodide({ indexURL: PYODIDE });
      const runner = await (await fetch('/practical_runner.py', { credentials: 'same-origin' })).text();
      py.FS.mkdirTree('/runner');
      py.FS.writeFile('/runner/practical_runner.py', runner);
      py.runPython("import sys\nsys.path.insert(0, '/runner')");
      return py;
    })();
  }
  return ready;
}

function resetDir(py, dir) {
  const FS = py.FS;
  try {
    for (const name of FS.readdir(dir)) {
      if (name === '.' || name === '..') continue;
      const path = dir + '/' + name;
      if (FS.isDir(FS.stat(path).mode)) { resetDir(py, path); FS.rmdir(path); } else FS.unlink(path);
    }
  } catch (e) { FS.mkdirTree(dir); }
}

self.onmessage = async e => {
  const msg = e.data;
  try {
    const py = await init();
    if (msg.type === 'init') { self.postMessage({ type: 'ready' }); return; }
    resetDir(py, '/work');
    for (const [name, text] of Object.entries(msg.files)) py.FS.writeFile('/work/' + name, text);
    py.globals.set('_modules', py.toPy(msg.modules));
    const out = py.runPython("import json, practical_runner\njson.dumps(practical_runner.run(list(_modules), '/work'))");
    self.postMessage({ type: 'result', id: msg.id, result: JSON.parse(out) });
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, error: String(err && err.message || err) });
  }
};
