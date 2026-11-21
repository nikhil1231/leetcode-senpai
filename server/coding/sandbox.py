"""Running generated and learner-edited code: in a separate process, as an unprivileged user, with CPU, memory, file and
time limits, a scrubbed environment and a throwaway directory. Nothing here imports or executes the code in the server.

What this container can and cannot do: it cannot create network or mount namespaces, so the network is refused by the audit
hook in sandbox_boot.py (sockets, subprocesses, native code, files outside the work directory) rather than by the kernel. That
stops generated code, which is written by a model and edited by the learner, from doing anything by accident; it is not a
wall against deliberate escape. Where bubblewrap is available (a developer machine) it is used for a real network and
filesystem namespace as well."""
import json
import os
import resource
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import threading

BOOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sandbox_boot.py')
NOBODY = 65534
WALL_SEC = 20
LIMITS = {resource.RLIMIT_CPU: (15, 15), resource.RLIMIT_AS: (768 << 20, 768 << 20), resource.RLIMIT_FSIZE: (4 << 20, 4 << 20),
          resource.RLIMIT_NOFILE: (64, 64), resource.RLIMIT_NPROC: (48, 48), resource.RLIMIT_CORE: (0, 0)}
MAX_OUT = 400_000
_slots = threading.Semaphore(2)     # the box is shared: at most two sandboxes at once


class SandboxError(RuntimeError):
    pass


def _prepare(files, hidden=None):
    root = tempfile.mkdtemp(prefix='cp-run-')
    for group in (files, hidden or {}):
        for path, code in group.items():
            full = os.path.join(root, path)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, 'w', encoding='utf-8') as fh:
                fh.write(code)
    for dirpath, _, names in os.walk(root):      # test folders import as packages
        if os.path.basename(dirpath) == 'tests' and '__init__.py' not in names:
            open(os.path.join(dirpath, '__init__.py'), 'w').close()
    if os.geteuid() == 0:
        for dirpath, dirs, names in os.walk(root):
            os.chown(dirpath, NOBODY, NOBODY)
            for n in names:
                os.chown(os.path.join(dirpath, n), NOBODY, NOBODY)
    os.chmod(root, 0o700 if os.geteuid() != 0 else 0o755)
    return root


def _child():
    os.setsid()
    for res, lim in LIMITS.items():
        resource.setrlimit(res, lim)
    if os.geteuid() == 0:
        os.setgroups([])
        os.setgid(NOBODY)
        os.setuid(NOBODY)


def _command(root, nonce, modules):
    return [sys.executable, '-I', '-S', '-B', BOOT, root, nonce, *modules]


def run_tests(files, modules, hidden=None, wall=WALL_SEC):
    """Run unittest `modules` (dotted names) against `files` ({path: code}); `hidden` files are added to the directory for
    this run only. -> {'rows': [{id, status, message}], 'loaderror', 'seconds', 'timed_out', 'crashed'}. Blocking."""
    nonce = secrets.token_hex(12)
    with _slots:
        root = _prepare(files, hidden)
        try:
            env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': root, 'LANG': 'C.UTF-8', 'PYTHONHASHSEED': '0', 'TZ': 'UTC'}
            proc = subprocess.Popen(_command(root, nonce, modules), cwd=root, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, preexec_fn=_child, close_fds=True)
            timed_out = False
            try:
                out, _ = proc.communicate(timeout=wall)
            except subprocess.TimeoutExpired:
                timed_out = True
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    proc.kill()
                out, _ = proc.communicate()
            finally:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)   # anything a test left running
                except (ProcessLookupError, PermissionError):
                    pass
            text = (out or b'')[:MAX_OUT].decode('utf-8', 'replace')
            for line in reversed(text.splitlines()):
                if line.startswith(nonce + ' '):
                    try:
                        return {**json.loads(line[len(nonce) + 1:]), 'timed_out': timed_out, 'crashed': False}
                    except ValueError:
                        break
            return {'rows': [], 'loaderror': '', 'seconds': wall if timed_out else 0, 'timed_out': timed_out, 'crashed': not timed_out,
                    'tail': text[-600:]}
        finally:
            shutil.rmtree(root, ignore_errors=True)


def summary(result):
    rows = result.get('rows') or []
    passed = sum(r['status'] == 'passed' for r in rows)
    return {'passed': passed, 'total': len(rows), 'failed': [r['id'] for r in rows if r['status'] in ('failed', 'error')]}
