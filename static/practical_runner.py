"""Runs the test_* functions of the given modules and reports each result.

Used in the browser (Pyodide, inside a worker) and by the server's content tests, so an
exercise behaves identically in both. Modules under `root` are re-imported on every run.
"""
import contextlib
import importlib
import io
import os
import sys
import time
import traceback


def _error(root):
    etype, value, tb = sys.exc_info()
    frames = [f for f in traceback.extract_tb(tb) if f.filename.startswith(root)]
    lines = traceback.format_list(frames[-4:]) + traceback.format_exception_only(etype, value)
    return ''.join(lines).replace(root + os.sep, '')


_ROOTS = set()


def run(modules, root):
    root = os.path.abspath(root)
    for old in _ROOTS - {root}:
        while old in sys.path:
            sys.path.remove(old)
    _ROOTS.add(root)
    if root not in sys.path:
        sys.path.insert(0, root)
    for name, mod in list(sys.modules.items()):
        if any((getattr(mod, '__file__', None) or '').startswith(r) for r in _ROOTS):
            del sys.modules[name]
    importlib.invalidate_caches()
    results = []
    for module in modules:
        try:
            mod = importlib.import_module(module)
        except Exception:
            results.append({'name': module, 'ok': False, 'error': _error(root), 'output': '', 'ms': 0})
            continue
        for name, fn in list(vars(mod).items()):
            if not (name.startswith('test_') and callable(fn)):
                continue
            out, start = io.StringIO(), time.perf_counter()
            try:
                with contextlib.redirect_stdout(out):
                    fn()
                ok, error = True, ''
            except Exception:
                ok, error = False, _error(root)
            results.append({'name': f'{module}.{name}', 'ok': ok, 'error': error,
                            'output': out.getvalue()[-2000:], 'ms': round((time.perf_counter() - start) * 1000, 1)})
    return {'passed': sum(r['ok'] for r in results), 'total': len(results), 'results': results}
