"""Java 21 test execution under a deny-by-default Java policy and OS resource limits.

Compile without annotation processors; run with only work-directory file access. Network, processes, native libraries,
reflection overrides, environment reads and disabling the security manager are not granted. A newer JVM that removes the
manager fails closed. This is the same personal, trusted-learner threat model as sandbox.py, not hostile multi-tenant hosting.
See https://docs.oracle.com/en/java/javase/21/security/java-se-platform-security-architecture.html.
"""
import base64
import os
from pathlib import Path
import re
import resource
import secrets
import shutil
import signal
import subprocess
import tempfile
import time

from . import sandbox, spec as S

HARNESS = Path(__file__).with_name('JavaTestRunner.java')
# JVM address space includes reserved areas beyond the heap; actual heap is capped at 128 MiB.
JVM = ['-Xms16m', '-Xmx128m', '-Xss512k', '-XX:+UseSerialGC', '-XX:ActiveProcessorCount=1',
       '-XX:CompressedClassSpaceSize=32m', '-XX:MaxMetaspaceSize=96m', '-XX:ReservedCodeCacheSize=32m', '-XX:-UsePerfData']


def _child(nproc=64, overrides=None, cpus=None):
    os.setsid()
    if cpus and hasattr(os, 'sched_setaffinity'):   # Linux: keep a busy-looping test to a share of the shared box
        os.sched_setaffinity(0, set(sorted(os.sched_getaffinity(0))[:cpus]))
    for key, limits in {**sandbox.LIMITS, resource.RLIMIT_AS: (2 << 30, 2 << 30), resource.RLIMIT_NPROC: (nproc, nproc),
                        **(overrides or {})}.items():
        resource.setrlimit(key, limits)
    if os.geteuid() == 0:
        os.setgroups([])
        os.setgid(sandbox.NOBODY)
        os.setuid(sandbox.NOBODY)


def _run(command, root, wall, nproc=64, limits=None, cpus=None):
    """`nproc` counts threads too (a JVM starts about twenty of its own); `limits` overrides sandbox.LIMITS entries."""
    # File-backed output is bounded by RLIMIT_FSIZE; a printing loop cannot exhaust the API's memory.
    with tempfile.TemporaryFile() as output:
        proc = subprocess.Popen(command, cwd=root,
                                env={'PATH': '/usr/bin:/bin', 'HOME': root, 'LANG': 'C.UTF-8', 'TZ': 'UTC'},
                                stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
                                preexec_fn=lambda: _child(nproc, limits, cpus), close_fds=True)
        timed_out = False
        try:
            proc.wait(timeout=wall)
        except subprocess.TimeoutExpired:
            timed_out = True
        finally:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
        output.seek(0)
        return output.read(sandbox.MAX_OUT).decode('utf-8', 'replace'), timed_out, proc.returncode


def run_tests(files, tests, hidden=None, wall=20):
    started = time.monotonic()
    result = {'rows': [], 'loaderror': '', 'seconds': 0, 'timed_out': False, 'crashed': False}
    if not shutil.which('java') or not shutil.which('javac'):
        return {**result, 'loaderror': 'Java 21 runtime is not installed', 'crashed': True}
    all_files = {**files, **(hidden or {})}
    if any(not S.safe_path(p) or p.startswith('_runner/') or p == 'JavaTestRunner.java' for p in all_files):
        raise sandbox.SandboxError('Unsafe or reserved Java source path')
    classes = []
    for path in sorted(tests):
        if not path.endswith('.java'):
            continue
        code = all_files.get(path, '')
        package = re.search(r'^\s*package\s+([\w.]+)\s*;', code, re.M)
        classes.append((package[1] + '.' if package else '') + Path(path).stem)
    with sandbox._slots:
        root = sandbox._prepare(all_files)
        try:
            private = Path(root, '_runner')
            private.mkdir()
            harness = private / 'JavaTestRunner.java'
            harness.write_text(HARNESS.read_text())
            # Compiled code and the policy remain read-only to the dropped user during execution.
            policy = private / 'java.policy'
            policy.write_text('grant { permission java.io.FilePermission "' + root + '/-", "read"; };\n')
            classes_dir = private / 'classes'
            classes_dir.mkdir()
            if os.geteuid() == 0:
                os.chown(classes_dir, sandbox.NOBODY, sandbox.NOBODY)
            sources = [str(Path(root, p)) for p in all_files if p.endswith('.java')]
            command = ['javac', *['-J' + flag for flag in JVM], '-proc:none', '-encoding', 'UTF-8',
                       '-d', str(classes_dir), '-classpath', str(classes_dir), str(harness), *sources]
            output, timeout, code = _run(command, root, wall)
            if timeout or code:
                return {**result, 'loaderror': 'Java compilation failed: ' + output[-1800:], 'timed_out': timeout,
                        'crashed': not timeout, 'seconds': round(time.monotonic() - started, 2)}
            nonce = secrets.token_hex(12)
            command = ['java', *JVM, '-ea', '-Djava.security.manager', '-Djava.security.policy==' + str(policy),
                       '-cp', str(classes_dir), 'JavaTestRunner', nonce, *classes]
            output, timeout, code = _run(command, root, wall)
            for line in output.splitlines():
                parts = line.split('\t')
                if len(parts) == 4 and parts[0] == nonce and parts[2] in ('passed', 'failed', 'error'):
                    try:
                        result['rows'].append({'id': base64.b64decode(parts[1]).decode(), 'status': parts[2],
                                               'message': base64.b64decode(parts[3]).decode()[:900]})
                    except (ValueError, UnicodeError):
                        pass
            finished = nonce + '\tDONE' in output.splitlines()
            return {**result, 'timed_out': timeout, 'crashed': bool(code) and not timeout,
                    'loaderror': '' if finished and not code else 'Java tests did not finish: ' + output[-1800:],
                    'seconds': round(time.monotonic() - started, 2)}
        finally:
            shutil.rmtree(root, ignore_errors=True)
