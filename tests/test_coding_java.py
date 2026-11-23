"""Run with Java 21 installed (the API Docker image includes it). No models or external services."""
import shutil

import pytest

from server.coding import java_sandbox, runner, sandbox

pytestmark = pytest.mark.skipif(not shutil.which('javac'), reason='Java 21 JDK required')

FILES = {
    'quota/Limiter.java': 'package quota; public class Limiter { public boolean allow(int used, int max) { return used <= max; } }',
    'tests/VisibleTest.java': '''package tests;
import quota.Limiter;
public class VisibleTest {
    public static void testBelow() { assert new Limiter().allow(2, 3); }
    public static void testAtLimit() { assert !new Limiter().allow(3, 3) : "limit reached"; }
}''',
}
HIDDEN = {'tests/HiddenTest.java': '''package tests; import quota.Limiter;
public class HiddenTest {
    public static void testZero() { assert !new Limiter().allow(0, 0); }
    public static void testAbove() { assert !new Limiter().allow(4, 3); }
}'''}


def exercise():
    return {'language': 'java', 'files': FILES, 'editable': ['quota/Limiter.java'],
            'visible_tests': {'tests/VisibleTest.java': FILES['tests/VisibleTest.java']}, 'hidden_tests': HIDDEN,
            'reference_fix': {'quota/Limiter.java': FILES['quota/Limiter.java'].replace('<=', '<')}}


def test_java_baseline_fix_hidden_and_validation():
    ex = exercise()
    visible = runner.run_visible(ex)
    assert not visible['loaderror'], visible
    assert sandbox.summary(visible)['passed'] == 1
    assert all('HiddenTest' not in row['id'] for row in visible['rows'])
    fixed = runner.run_hidden(ex, fixed=True)
    assert sandbox.summary(fixed) == {'passed': 2, 'total': 2, 'failed': []}, fixed
    checks = runner.check_exercise(ex)
    assert all(c['ok'] for c in checks), checks


@pytest.mark.parametrize('body', [
    'java.nio.file.Files.readString(java.nio.file.Path.of("/etc/passwd"));',
    'new java.net.Socket("127.0.0.1", 80);',
    'new ProcessBuilder("true").start();',
    'System.setSecurityManager(null);',
    'System.getenv("HOME");',
])
def test_java_refuses_outside_access(body):
    source = 'public class ProbeTest { public static void testDenied() throws Exception { ' + body + ' } }'
    result = java_sandbox.run_tests({'ProbeTest.java': source}, ['ProbeTest.java'])
    assert len(result['rows']) == 1, result
    assert result['rows'][0]['status'] == 'error', result
    assert 'AccessControlException' in result['rows'][0]['message'], result


def test_java_compile_error_and_missing_test_are_not_passes():
    result = java_sandbox.run_tests({'BadTest.java': 'not java'}, ['BadTest.java'])
    assert result['loaderror'] and result['rows'] == []
    result = java_sandbox.run_tests({'EmptyTest.java': 'public class EmptyTest {}'}, ['EmptyTest.java'])
    assert result['loaderror'] and result['rows'] == []


def test_java_timeout_preserves_failure():
    source = 'public class LoopTest { public static void testLoop() { while (true) {} } }'
    result = java_sandbox.run_tests({'LoopTest.java': source}, ['LoopTest.java'], wall=2)
    assert result['timed_out'] and result['loaderror'], result


def test_java_http_run_submit_and_hidden_isolation(store, monkeypatch):
    from fastapi.testclient import TestClient
    from server import auth, main
    from server.coding import api, fallback, queue
    ex = {**fallback.pick('reading', 'repair'), **exercise(), 'id': 'java-repair', 'status': 'ready'}
    # The test fixture uses a separate source tree from the curated Python exercise.
    ex['findings'] = [{'id': 'f1', 'key': True, 'text': 'Equality must reject.',
                       'locations': [{'path': 'quota/Limiter.java', 'start': 1, 'end': 1}]}]
    store.put_track_record(queue.EX, ex['id'], ex)
    monkeypatch.setattr(api, 'get_store', lambda uid: store)
    monkeypatch.setattr(queue, 'kick', lambda *args: None)
    monkeypatch.setattr(api.model_io, 'available', lambda: False)
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    try:
        with TestClient(main.app) as client:
            opened = client.post('/api/coding/reading/start', json={'category': 'repair'}).json()
            assert opened['exercise']['language'] == 'java'
            assert 'HiddenTest' not in str(opened)
            aid = opened['attempt']['id']
            run = client.post(f'/api/coding/attempts/{aid}/run', json={'files': {}}).json()
            assert run['passed'] == 1 and run['total'] == 2
            assert 'HiddenTest' not in str(run)
            result = client.post(f'/api/coding/attempts/{aid}/submit', json={
                'revision': run['revision'], 'files': ex['reference_fix'],
                'explanation': 'The limit must reject equality before admitting another item.'}).json()['attempt']
            assert result['result']['score'] == 100
            assert result['result']['tests']['hidden_summary']['passed'] == 2
    finally:
        main.app.dependency_overrides.clear()


def test_java_compile_errors_cannot_receive_full_test_marks():
    from server.coding import api
    ex = exercise()
    bad = runner.run_visible(ex, {'quota/Limiter.java': 'not java'})
    assert sandbox.summary(bad)['failed']
    assert runner.learner_rows(bad)[0]['status'] == 'error'
    tests = {'visible_summary': sandbox.summary(bad), 'hidden_summary': {'total': 2, 'passed': 2}}
    assert api._combine(tests, None)['score'] < 100
