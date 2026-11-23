"""Running an exercise's tests: the visible ones for the learner's Run button, and everything at submission and validation.
Visible tests live in the exercise's files; hidden tests exist only in the stored exercise and are added to the sandbox
directory for a run, never sent anywhere."""
import difflib

from . import sandbox, spec as S


def modules(tests):
    return sorted(p[:-3].replace('/', '.') for p in tests if p.endswith('.py') and not p.endswith('__init__.py'))


def overlay(ex, learner=None, fixed=False):
    """The repository to run: the original files, with the learner's edits (editable files only) or the reference fix."""
    files = dict(ex['files'])
    if fixed:
        files.update(ex.get('reference_fix') or {})
    for p, code in (learner or {}).items():
        if p in (ex.get('editable') or []) and isinstance(code, str) and len(code) <= S.MAX_FILE_BYTES:
            files[p] = code
    return files


def _run(ex, files, tests, hidden=None):
    if ex.get('language') == 'java':
        from . import java_sandbox
        result = java_sandbox.run_tests(files, tests, hidden=hidden)
    elif ex.get('language', 'python') != 'python':
        raise sandbox.SandboxError('Only Python and Java execution is supported')
    else:
        result = sandbox.run_tests(files, modules(tests), hidden=hidden)
    if result.get('loaderror') or result.get('timed_out') or result.get('crashed') or not result.get('rows'):
        result['rows'] = [*(result.get('rows') or []), {'id': 'runner.execution', 'status': 'error',
                         'message': result.get('loaderror') or ('Test run timed out' if result.get('timed_out') else 'Test run did not finish')}]
    return result


def run_visible(ex, learner=None):
    return _run(ex, overlay(ex, learner), ex['visible_tests'])


def run_hidden(ex, learner=None, fixed=False):
    return _run(ex, overlay(ex, learner, fixed), ex['hidden_tests'], hidden=ex['hidden_tests'])


def learner_rows(result, keep_messages=True):
    """Rows safe to send to the learner. Hidden-test messages stay server-side until the review."""
    return [{'id': r['id'].split('.', 1)[-1], 'status': r['status'], 'message': r['message'] if keep_messages else ''} for r in result.get('rows') or []]


def unified(ex, learner, fixed=False):
    """Unified diff of the original sources against the learner's edits (or the reference fix)."""
    after = overlay(ex, learner, fixed)
    out = []
    for p in sorted(ex.get('editable') or []):
        a, b = ex['files'][p], after.get(p, ex['files'][p])
        if a != b:
            out += difflib.unified_diff(a.splitlines(True), b.splitlines(True), f'a/{p}', f'b/{p}', n=3)
    return ''.join(out)[:20_000]


def check_exercise(ex):
    """Validation by running it: the repository imports, the baseline works, the bug reproduces, the reference fix passes
    everything, and the results are the same twice. -> list of {name, ok, detail}."""
    checks = []

    def add(name, ok, detail=''):
        checks.append({'name': name, 'ok': bool(ok), 'detail': '' if ok else detail})
        return ok
    base_v, base_h = run_visible(ex), run_hidden(ex)
    for label, r in (('visible', base_v), ('hidden', base_h)):
        add(f'{label} tests load and finish', not r.get('loaderror') and not r['timed_out'] and not r['crashed'] and r['rows'],
            r.get('loaderror') or ('timed out' if r['timed_out'] else 'no results' if not r['rows'] else ''))
    if not all(c['ok'] for c in checks):
        return checks
    sv, sh = sandbox.summary(base_v), sandbox.summary(base_h)
    add('baseline works', sv['passed'] >= 1, f"visible {sv['passed']}/{sv['total']} pass")
    add('the bug reproduces in the visible tests', sv['failed'], 'no visible test fails on the buggy code')
    add('hidden tests catch the bug', sh['failed'], 'no hidden test fails on the buggy code')
    add('at least two hidden tests', sh['total'] >= 2, f"{sh['total']} hidden")
    fv = run_visible({**ex, 'files': overlay(ex, fixed=True)})
    fh = run_hidden(ex, fixed=True)
    fvs, fhs = sandbox.summary(fv), sandbox.summary(fh)
    add('the reference fix passes the visible tests', fvs['total'] and not fvs['failed'] and not fv['timed_out'], ', '.join(fvs['failed'][:3]))
    add('the reference fix passes the hidden tests', fhs['total'] and not fhs['failed'] and not fh['timed_out'], ', '.join(fhs['failed'][:3]))
    plan = ex.get('assistant_plan') or {}
    if plan.get('flawed_files'):
        bad = {**ex, 'reference_fix': plan['flawed_files']}
        flaw_v, flaw_h = sandbox.summary(run_visible({**ex, 'files': overlay(bad, fixed=True)})), sandbox.summary(run_hidden(bad, fixed=True))
        if plan['kind'] == 'invented-api':
            add('the flawed patch breaks when run', flaw_v['failed'] or flaw_h['failed'], 'the flawed patch runs cleanly')
        else:
            add('the flawed patch passes the visible tests', not flaw_v['failed'], ', '.join(flaw_v['failed'][:3]))
            add('the flawed patch fails a hidden test', flaw_h['failed'], 'the flawed patch passes everything')
    again = sandbox.summary(run_visible(ex))
    add('results are repeatable', again == sv, 'the buggy code gave different results twice')
    return checks
