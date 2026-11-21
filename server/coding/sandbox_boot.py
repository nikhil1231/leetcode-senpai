"""Runs inside the sandbox process, never imported by the server. Started as `python -I -S -B sandbox_boot.py WORKDIR NONCE
MODULE...` after the parent has applied resource limits and dropped to an unprivileged user.

It installs an audit hook that refuses network use, new processes, native code loading, writes outside the work directory
and reads outside it and the Python installation, then runs the named unittest modules and prints one result line carrying the
nonce (which the code under test never sees). The hook is a second wall behind the OS limits, not a replacement for them."""
import json
import os
import sys
import time
import unittest

work = os.path.realpath(sys.argv[1])
nonce = sys.argv[2]
modules = sys.argv[3:]
del sys.argv[1:]
os.chdir(work)
sys.path.insert(0, work)
READ_OK = tuple(os.path.realpath(p) for p in {sys.prefix, sys.base_prefix, sys.exec_prefix, sys.base_exec_prefix, work,
                                               '/usr/lib', '/usr/share/zoneinfo', '/etc/localtime', '/proc/self', '/dev/urandom', '/dev/null'})
DENY = ('socket.', 'subprocess.', 'os.exec', 'os.fork', 'os.forkpty', 'os.system', 'os.spawn', 'os.posix_spawn', 'ctypes.', 'os.kill',
        'os.killpg', 'os.setuid', 'os.chown', 'os.chmod', 'shutil.chown', 'pty.', 'webbrowser.', 'urllib.Request', 'smtplib.', 'ftplib.',
        'http.client.', 'mmap.', 'os.putenv', 'os.symlink', 'os.link', 'os.mkfifo', 'os.mknod', 'signal.', 'resource.setrlimit')
WRITE_FLAGS = os.O_WRONLY | os.O_RDWR | os.O_APPEND | os.O_CREAT | os.O_TRUNC


def inside(path, roots):
    p = os.path.realpath(path)
    return any(p == r or p.startswith(r.rstrip('/') + '/') for r in roots)


def guard(event, args):
    if event.startswith(DENY):
        raise PermissionError(f'{event} is not allowed in the sandbox')
    if event == 'open':
        path, mode, flags = args
        if isinstance(path, int):
            return
        path = os.fsdecode(path)
        writing = bool(flags & WRITE_FLAGS) or (isinstance(mode, str) and any(c in mode for c in 'wax+'))
        if not inside(path, (work,) if writing else READ_OK):
            raise PermissionError(f'{"write" if writing else "read"} outside the work directory: {path}')
    elif event in ('os.remove', 'os.rename', 'os.rmdir', 'os.mkdir', 'os.truncate', 'os.utime'):
        for a in args[:2]:
            if isinstance(a, (str, bytes)) and not inside(os.fsdecode(a), (work,)):
                raise PermissionError(f'{event} outside the work directory')
    elif event in ('os.listdir', 'os.scandir') and args and isinstance(args[0], (str, bytes)) and not inside(os.fsdecode(args[0]), READ_OK):
        raise PermissionError('listing outside the work directory')


class Collect(unittest.TestResult):
    def __init__(self):
        super().__init__()
        self.rows = []

    def _add(self, test, status, err=None):
        msg = ''
        if err:
            msg = self._exc_info_to_string(err, test)
            msg = msg[-900:]
        self.rows.append({'id': test.id(), 'status': status, 'message': msg})

    def addSuccess(self, test): self._add(test, 'passed')
    def addFailure(self, test, err): self._add(test, 'failed', err)
    def addError(self, test, err): self._add(test, 'error', err)
    def addSkip(self, test, reason): self._add(test, 'skipped')
    def addExpectedFailure(self, test, err): self._add(test, 'passed')
    def addUnexpectedSuccess(self, test): self._add(test, 'failed')


def main():
    out = {'rows': [], 'loaderror': ''}
    suite = unittest.TestSuite()
    for name in modules:
        try:
            suite.addTests(unittest.defaultTestLoader.loadTestsFromName(name))
        except BaseException as e:   # an import error in the code under test is a result, not a crash
            out['loaderror'] = f'{type(e).__name__}: {e}'[:600]
    result = Collect()
    result.buffer = True
    real_stdout = sys.stdout
    started = time.time()
    sys.addaudithook(guard)
    try:
        suite.run(result)
    except BaseException as e:
        out['loaderror'] = out['loaderror'] or f'{type(e).__name__}: {e}'[:600]
    for t, tb in result.errors + result.failures:
        pass
    out['rows'] = result.rows
    for r in out['rows']:
        if r['id'].startswith('unittest.loader._FailedTest'):
            r['id'] = 'import error'
    out['seconds'] = round(time.time() - started, 2)
    real_stdout.write('\n' + nonce + ' ' + json.dumps(out) + '\n')
    real_stdout.flush()
    os._exit(0)


main()
