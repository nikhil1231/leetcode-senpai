"""The concurrency runner and validation against real Java 21 (the API image has it). No models: the independent solve is
skipped or faked."""
import shutil

import pytest

from server.concurrency import judge, validate
from tests.fixtures import concurrency_buffer as F

pytestmark = pytest.mark.skipif(not shutil.which('javac'), reason='Java 21 JDK required')


def test_reference_passes_every_run_and_the_mistakes_fail():
    q = F.question()
    ref = judge.submit(q, F.SOLUTION)
    assert judge.passed(ref), ref
    assert all(r['runs'] == judge.SUBMIT['repeats'] for r in ref['rows'])
    unsync = judge.submit(q, F.UNSYNCHRONISED)
    assert judge.failed_any(unsync)
    hang = judge.submit(q, F.NO_SIGNAL)
    stuck = [r for r in hang['rows'] if r['status'] == 'timeout']
    assert stuck and 'BoundedBuffer' in stuck[0]['message'], hang     # the dump shows where the threads wait
    assert len(hang['rows']) == 4                                     # a deadlock does not stop the other tests


def test_busy_waiting_shows_in_cpu_time():
    q = F.question()
    ref, spin = judge.measured(judge.submit(q, F.SOLUTION)), judge.measured(judge.submit(q, F.UNSYNCHRONISED))
    assert spin['cpu_ms'] > 3 * ref['cpu_ms'], (spin, ref)


def test_compile_error_and_printing():
    q = F.question()
    bad = judge.submit(q, 'public class BoundedBuffer { oops }')
    assert bad['compile_error'] and not bad['rows'] and not judge.failed_any(bad)
    assert judge.submit_view(bad)['status'] == 'Compile Error'
    loud = F.SOLUTION.replace('items.addLast(value);', 'items.addLast(value); System.out.println("put " + value);')
    run = judge.run_view(judge.run(q, loud), 3)
    assert run['passed'] and 'put 1' in run['cases'][0]['stdout']


def test_the_sandbox_still_refuses_outside_access_and_executors_work():
    q = F.question()
    sneaky = F.SOLUTION.replace('public int size() {', 'public int size() { try { java.nio.file.Files.readString(java.nio.file.Path.of("/etc/passwd")); } catch (Exception e) { throw new RuntimeException(e); }')
    r = judge.submit(q, sneaky, repeats=1)
    assert any('AccessControlException' in row['message'] for row in r['rows']), r
    pooled = F.SOLUTION.replace('public int size() {', 'public int size() { var ex = java.util.concurrent.Executors.newFixedThreadPool(2); ex.submit(() -> 1); ex.shutdownNow();')
    assert judge.passed(judge.submit(q, pooled, repeats=2))


def test_validation_accepts_a_fair_question_and_rejects_untested_mistakes():
    result = validate.check(F.question(), independent=False)
    assert result['ok'], result['checks']
    assert result['reference']['tests']
    # A "broken" solution that is actually correct shows the tests do not catch it.
    weak = F.question(broken=[{**F.question()['broken'][0], 'code': F.SOLUTION}, F.question()['broken'][1]])
    result = validate.check(weak, independent=False)
    assert not result['ok'] and 'passed every test' in result['checks'][-1]['detail']
    # From level 3, one broken solution must use a weaker tool.
    no_weaker = F.question(broken=[{**b, 'weaker_tool': False} for b in F.question()['broken']])
    assert not validate.check(no_weaker, independent=False)['ok']


def test_independent_solver_must_pass(monkeypatch):
    calls = []

    def solve(q, feedback=None):
        calls.append(feedback)
        return F.SOLUTION if feedback else F.NO_SIGNAL
    monkeypatch.setattr(validate, 'solve', solve)
    assert validate.check(F.question())['ok'] and len(calls) == 2       # wrong first, fixed after seeing Run's results
    monkeypatch.setattr(validate, 'solve', lambda q, feedback=None: F.STARTER)
    result = validate.check(F.question())
    assert not result['ok'] and result['solver_failure']


def test_a_run_killed_for_spinning_names_the_test_it_died_in(monkeypatch):
    import resource
    monkeypatch.setattr(judge, 'LIMITS', {resource.RLIMIT_CPU: (4, 4)})
    spin = '''public class SpinTest {
    public static void testAFirst() { }
    public static void testBSpins() {
        Conc.parallel(4, 3000, i -> { long end = System.nanoTime() + 2_000_000_000L; while (System.nanoTime() < end) { } });
    }
    public static void testCNeverReached() { }
}'''
    r = judge.execute({'SpinTest.java': spin}, ['SpinTest'], 5, 4000, 60)
    assert [x['id'] for x in r['rows']] == ['SpinTest.testAFirst', 'SpinTest.testBSpins'], r
    assert r['rows'][1]['status'] == 'timeout' and 'spin' in r['rows'][1]['message']
    view = judge.submit_view(r)
    assert view['status'] == 'Time Limit Exceeded' and view['input'] == 'B spins'
