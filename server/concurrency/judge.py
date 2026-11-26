"""Running a concurrency question's tests in the Java sandbox (coding/java_sandbox.py), with a harness made for threads:
every test runs `repeats` times on its own thread with a timeout, so a deadlock fails one test and the rest still run.

The harness (ConcurrencyTestRunner, Conc) is compiled with the learner's class, then moved to its own directory, which
the policy trusts: it may read thread stacks for a timeout report and measure CPU time. The learner's code gets file
reads in the work directory and modifyThread (an executor needs it to shut down), nothing more. Run is the visible tests
a few times; Submit is every test, repeated to catch races. Results come back in the shape the in-app editor already
shows for LeetCode's judge (leetcode.run_code / submit_code), plus what was measured for the review."""
import base64
import os
from pathlib import Path
import re
import resource
import secrets
import shutil
import signal
import time

from ..coding import java_sandbox, sandbox

HERE = Path(__file__).parent
HARNESS = ('ConcurrencyTestRunner.java', 'Conc.java')
RESERVED = {'Conc', 'ConcurrencyTestRunner', 'VisibleTest', 'HiddenTest'}
JVM = [f for f in java_sandbox.JVM if not f.startswith('-XX:ActiveProcessorCount')] + ['-XX:ActiveProcessorCount=4']
NPROC = 256
CPUS = 4                     # matches -XX:ActiveProcessorCount
LIMITS = {resource.RLIMIT_CPU: (60, 60)}   # CPU seconds across all threads; a reference run uses a few
RUN = {'repeats': 3, 'wall': 45}
SUBMIT = {'repeats': 20, 'wall': 90}
TIMEOUT_MS = (300, 5000)


def _harness_class(name):
    stem = name[:-len('.class')]
    return stem in ('Conc', 'ConcurrencyTestRunner') or stem.startswith(('Conc$', 'ConcurrencyTestRunner$'))


def _decode(text):
    return base64.b64decode(text).decode('utf-8', 'replace')


def _metrics(text):
    out = {}
    for part in filter(None, text.split(';')):
        k, _, v = part.partition('=')
        try:
            out[k] = int(v)
        except ValueError:
            pass
    return out


def execute(files, suites, repeats, timeout_ms, wall):
    """Compile `files` ({name.java: code}, default package) with the harness and run the `suites` (class names).
    -> {rows: [{id, status, message, runs, wall_ms, cpu_ms, stdout, metrics}], compile_error, error, seconds}. Blocking."""
    started = time.monotonic()
    out = {'rows': [], 'compile_error': '', 'error': '', 'seconds': 0}
    if not shutil.which('java') or not shutil.which('javac'):
        return {**out, 'error': 'Java 21 runtime is not installed'}
    if any(not re.fullmatch(r'[A-Za-z_]\w*\.java', p) or p in HARNESS for p in files):
        raise sandbox.SandboxError('Unsafe or reserved Java source path')
    timeout_ms = max(TIMEOUT_MS[0], min(TIMEOUT_MS[1], int(timeout_ms)))
    with sandbox._slots:
        root = sandbox._prepare(files)
        try:
            private = Path(root, '_runner')
            private.mkdir()
            for name in HARNESS:
                (private / name).write_text((HERE / name).read_text())
            classes, trusted = private / 'classes', private / 'trusted'
            classes.mkdir()
            trusted.mkdir()
            if os.geteuid() == 0:
                os.chown(classes, sandbox.NOBODY, sandbox.NOBODY)
            policy = private / 'java.policy'
            policy.write_text(
                f'grant codeBase "file:{trusted}/-" {{ permission java.security.AllPermission; }};\n'
                f'grant {{ permission java.io.FilePermission "{root}/-", "read"; '
                'permission java.lang.RuntimePermission "modifyThread"; };\n')
            sources = [str(private / n) for n in HARNESS] + [str(Path(root, p)) for p in files]
            command = ['javac', *['-J' + f for f in JVM], '-proc:none', '-nowarn', '-Xlint:none', '-encoding', 'UTF-8',
                       '-d', str(classes), *sources]
            text, timed_out, code = java_sandbox._run(command, root, wall, NPROC, LIMITS, CPUS)
            if timed_out or code:
                return {**out, 'compile_error': _compile_message(text, root) if not timed_out else 'Compilation timed out',
                        'seconds': round(time.monotonic() - started, 2)}
            for f in classes.iterdir():
                if _harness_class(f.name):
                    f.rename(trusted / f.name)
            nonce = secrets.token_hex(12)
            left = max(5, wall - (time.monotonic() - started) - 3)
            command = ['java', *JVM, '-ea', '-Djava.security.manager', '-Djava.security.policy==' + str(policy),
                       '-cp', f'{trusted}:{classes}', 'ConcurrencyTestRunner', nonce, str(repeats), str(timeout_ms),
                       str(int((left - 4) * 1000)), *suites]
            text, timed_out, code = java_sandbox._run(command, root, left, NPROC, LIMITS, CPUS)
            for line in text.splitlines():
                parts = line.split('\t')
                if len(parts) == 9 and parts[0] == nonce and parts[2] in ('passed', 'failed', 'error', 'timeout'):
                    try:
                        out['rows'].append({'id': _decode(parts[1]), 'status': parts[2], 'message': _decode(parts[3]),
                                            'runs': int(parts[4]), 'wall_ms': round(int(parts[5]) / 1000, 1),
                                            'cpu_ms': round(int(parts[6]) / 1000, 1), 'stdout': _decode(parts[7]),
                                            'metrics': _metrics(_decode(parts[8]))})
                    except (ValueError, UnicodeError):
                        pass
            if nonce + '\tDONE' not in text.splitlines():
                cpu = code in (-signal.SIGXCPU, -signal.SIGKILL) and not timed_out
                tail = _strip_warnings(text)[-1500:]
                out['error'] = ('The test run used up its CPU allowance' if cpu else 'The test run hit its time limit' if timed_out
                                else 'The test run stopped early') + (': ' + tail if tail else '')
                running = next((t for t in expected_tests(files, suites) if t not in {r['id'] for r in out['rows']}), None)
                if running:   # the test it died in gets the verdict, so the editor names it
                    out['rows'].append({'id': running, 'status': 'timeout' if cpu or timed_out else 'error', 'runs': 0,
                                        'message': STOPPED['cpu' if cpu else 'wall' if timed_out else 'crash'],
                                        'wall_ms': 0, 'cpu_ms': 0, 'stdout': '', 'metrics': {}})
            out['seconds'] = round(time.monotonic() - started, 2)
            return out
        finally:
            shutil.rmtree(root, ignore_errors=True)


STOPPED = {
    'cpu': 'Stopped while this test ran: the threads used a minute of CPU between them, which usually means '
           'they spin in a loop instead of waiting to be woken.',
    'wall': 'Stopped while this test ran: the whole run went over its time limit.',
    'crash': 'The test run stopped unexpectedly while this test ran.',
}


def expected_tests(files, suites):
    """Test ids in the order the harness runs them: suite by suite, methods sorted by name."""
    out = []
    for suite in suites:
        names = re.findall(r'public\s+static\s+void\s+(test\w*)\s*\(\s*\)', files.get(f'{suite}.java', ''))
        out += [f'{suite}.{n}' for n in sorted(set(names))]
    return out


def _strip_warnings(text):
    return '\n'.join(l for l in text.splitlines() if not l.startswith('WARNING:') and '\t' not in l).strip()


def _compile_message(text, root):
    text = text.replace(root + '/', '').replace(str(Path(root, '_runner')) + '/', '')
    lines = [l for l in text.splitlines() if not l.startswith(('Note:', 'warning:', 'WARNING:'))]
    return '\n'.join(lines).strip()[-2500:] or 'Compilation failed'


def files_for(q, code):
    """The sources to run: the learner's (or a reference) class and the question's test classes."""
    return {f"{q['class_name']}.java": code, 'VisibleTest.java': q['visible_tests'], 'HiddenTest.java': q['hidden_tests']}


def _lines(q, result):
    """Compile errors in the learner's class read 'Line 12: ...', as the editor marks them for LeetCode's judge."""
    if result['compile_error']:
        result['compile_error'] = re.sub(rf"^{re.escape(q['class_name'])}\.java:(\d+): ", r'Line \1: ',
                                         result['compile_error'], flags=re.M)
    return result


def run(q, code, repeats=None, wall=None):
    """Visible tests only (the Run button)."""
    files = {f"{q['class_name']}.java": code, 'VisibleTest.java': q['visible_tests']}
    return _lines(q, execute(files, ['VisibleTest'], repeats or RUN['repeats'], q.get('timeout_ms', 2000), wall or RUN['wall']))


def submit(q, code, repeats=None, wall=None):
    """Every test, repeated (the Submit button, and validation)."""
    return _lines(q, execute(files_for(q, code), ['VisibleTest', 'HiddenTest'], repeats or SUBMIT['repeats'],
                             q.get('timeout_ms', 2000), wall or SUBMIT['wall']))


def passed(result):
    return bool(result['rows']) and not result['compile_error'] and not result['error'] \
        and all(r['status'] == 'passed' for r in result['rows'])


def failed_any(result):
    """Whether the run showed the code is wrong: a compile error does not count (a broken solution must compile)."""
    return not result['compile_error'] and (bool(result['error']) or any(r['status'] != 'passed' for r in result['rows']))


# ---- the editor's result shapes -------------------------------------------------------------------------------------
def test_label(test_id):
    """HiddenTest.testReadersShareTheLock -> 'Readers share the lock'."""
    name = test_id.rsplit('.', 1)[-1]
    name = name[4:] if name.startswith('test') else name
    words = re.sub(r'(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|_', ' ', name).split()
    text = ' '.join(w if w.isupper() and len(w) > 1 else w.lower() for w in words)
    return text[:1].upper() + text[1:] if text else test_id


VERDICTS = {'timeout': 'Time Limit Exceeded', 'failed': 'Wrong Answer', 'error': 'Runtime Error'}


def _status(result):
    if result['compile_error']:
        return 'Compile Error'
    for r in result['rows']:
        if r['status'] != 'passed':
            return VERDICTS[r['status']]
    if result['error'] or not result['rows']:
        return 'Runtime Error'
    return 'Accepted'


def measured(result):
    rows = result['rows']
    return {'wall_ms': round(sum(r['wall_ms'] for r in rows), 1), 'cpu_ms': round(sum(r['cpu_ms'] for r in rows), 1),
            'tests': {r['id']: {k: r[k] for k in ('status', 'runs', 'wall_ms', 'cpu_ms', 'metrics')} for r in rows}}


def run_view(result, repeats):
    """leetcode.run_code's shape: one case per visible test."""
    status = _status(result)
    error = result['compile_error'] or result['error'] or None
    cases = [{'input': test_label(r['id']),
              'output': (f'Passed {r["runs"]} of {repeats} runs' if r['status'] == 'passed' else r['message']),
              'expected': f'Passes all {repeats} runs', 'stdout': r['stdout'], 'ok': r['status'] == 'passed'}
             for r in result['rows']]
    wall = measured(result)['wall_ms']
    return {'status': status if error else 'Accepted', 'passed': bool(cases) and all(c['ok'] for c in cases) and not error,
            'correct': sum(c['ok'] for c in cases), 'total': len(cases), 'cases': cases if not result['compile_error'] else [],
            'error': error, 'runtime': f'{round(wall)} ms', 'input': None, 'stdout': [], 'custom': True}


def submit_view(result):
    """leetcode.submit_code's shape. The first failing test is named with its message, as LeetCode shows its last case."""
    status = _status(result)
    rows = result['rows']
    bad = next((r for r in rows if r['status'] != 'passed'), None)
    m = measured(result)
    return {'status': status, 'accepted': status == 'Accepted', 'submission_id': 'cc-' + secrets.token_hex(8),
            'finished_at': int(time.time()), 'correct': sum(r['status'] == 'passed' for r in rows), 'total': len(rows) or None,
            'input': test_label(bad['id']) if bad else None, 'expected': 'Passes every run' if bad else None,
            'output': bad['message'] if bad else None, 'stdout': (bad or {}).get('stdout') or None,
            'error': result['compile_error'] or (result['error'] if not bad else None) or None,
            'runtime_percentile': None, 'memory_percentile': None,
            'runtime': f"{round(m['wall_ms'])} ms", 'memory': None, 'custom': True,
            'measured': {'wall_ms': m['wall_ms'], 'cpu_ms': m['cpu_ms']}}
