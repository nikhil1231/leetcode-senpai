"""Proving a question fair before it is served, by running it. In order, cheapest first, stopping at the first failure:

1. the starter compiles and does not already pass;
2. the reference solution passes every test on three full 20-run submissions (no flaky results), within the time budget;
3. every broken solution compiles and fails at least one test on two submissions out of two, so the tests really catch
   the mistakes they are meant to;
4. from level 3, one broken solution uses a weaker tool than the level needs (and, by 3, fails);
5. an independent solve: a second model, shown only the statement, the starter and the visible tests (what the learner
   sees), writes a solution that passes everything. One retry shows it its visible test results, as Run would.

The reference solution's measurements are kept for the review, which compares the learner's against them."""
import re

from .. import coach
from ..coding import model_io
from . import generate, judge

REFERENCE_RUNS, BROKEN_RUNS = 3, 2
BUDGET_SEC = 45
SOLVER = (
    "You are a strong Java engineer solving a concurrency question in an interview. Read the statement and the tests you "
    "are shown, then write the complete class. Reply with only the Java source of the whole file in one ```java block."
)


def _check(checks, name, ok, detail=''):
    checks.append({'name': name, 'ok': bool(ok), 'detail': '' if ok else str(detail)[:600]})
    return bool(ok)


def _first_problem(result):
    if result['compile_error']:
        return 'compile error: ' + result['compile_error'][:400]
    bad = next((r for r in result['rows'] if r['status'] != 'passed'), None)
    if bad:
        return f"{bad['id']} {bad['status']}: {bad['message'][:400]}"
    return result['error'][:400] or 'no tests ran'


def solve(q, feedback=None):
    """Blocking: the independent solver's class, from what the learner would see."""
    prompt = (f"Statement:\n{coach.statement_text(q['statement_html'], limit=12000)}\n\n"
              f"Starter code ({q['class_name']}.java):\n```java\n{q['starter']}```\n\n"
              f"Visible tests (more hidden tests check the statement's requirements, every test runs 20 times with "
              f"{q['timeout_ms']} ms per run):\n```java\n{q['visible_tests']}```")
    if feedback:
        prompt += f"\n\nYour previous solution:\n```java\n{feedback['code']}```\nRunning the visible tests gave: {feedback['result']}\nFix it."
    text, _ = model_io.chat(generate.AREA, SOLVER, prompt, timeout=420)
    m = re.search(r'```(?:java)?\s*\n(.*?)```', text or '', re.S)
    return (m.group(1) if m else text or '').strip() + '\n'


def check(q, independent=True):
    """Blocking. -> {ok, checks, reference: measured numbers}. `independent=False` skips the model solve (tests)."""
    checks, out = [], {'ok': False, 'checks': [], 'reference': None}
    out['checks'] = checks
    starter = judge.submit(q, q['starter'], repeats=1)
    if not _check(checks, 'the starter compiles', not starter['compile_error'], starter['compile_error']):
        return out
    if not _check(checks, 'the starter does not already pass', not judge.passed(starter), 'every test passes on the starter code'):
        return out
    for i in range(REFERENCE_RUNS):
        ref = judge.submit(q, q['solution'])
        if not _check(checks, f'the reference solution passes every test (submission {i + 1})', judge.passed(ref), _first_problem(ref)):
            return out
        if not _check(checks, 'the reference solution runs within the time budget', ref['seconds'] <= BUDGET_SEC,
                      f"a submission took {ref['seconds']} s"):
            return out
        if i == 0:
            out['reference'] = judge.measured(ref)
    if not _check(checks, 'the visible tests run on their own', judge.passed(judge.run(q, q['solution'])), 'the reference fails a visible run'):
        return out
    for b in q['broken']:
        for i in range(BROKEN_RUNS):
            r = judge.submit(q, b['code'])
            if not _check(checks, f"broken solution {b['n']} ({b['kind']}) compiles", not r['compile_error'], r['compile_error']):
                return out
            if not _check(checks, f"the tests catch broken solution {b['n']} ({b['kind']}), submission {i + 1}",
                          judge.failed_any(r), f"broken solution {b['n']} ({b['kind']}: {b['description']}) passed every test"):
                return out
    if q['level'] >= 3 and not _check(checks, 'a broken solution uses a weaker tool than the level needs',
                                      any(b['weaker_tool'] for b in q['broken']), 'no broken solution is marked weaker_tool'):
        return out
    if independent:
        code = solve(q)
        r = judge.submit(q, code)
        if not judge.passed(r):
            seen = judge.run(q, code)
            shown = 'all visible tests pass' if judge.passed(seen) else _first_problem(seen)
            code = solve(q, {'code': code, 'result': shown})
            r = judge.submit(q, code)
        if not _check(checks, 'an independent solver passes from the statement alone', judge.passed(r), _first_problem(r)):
            out['solver_failure'] = True
            return out
    out['ok'] = True
    return out


def make(spec):
    """Blocking: generate, validate, and repair once if validation found a fixable problem. Raises GenError."""
    q, conversation = generate.generate(spec)
    result = check(q)
    if not result['ok']:
        problems = [f"{c['name']}: {c['detail']}" for c in result['checks'] if not c['ok']]
        if result.get('solver_failure'):
            problems.append('so the statement may not say everything the hidden tests check; make every tested '
                            'behaviour explicit in the statement')
        q, conversation = generate.repair(spec, conversation, problems)
        result = check(q)
    q['validation'] = {'ok': result['ok'], 'checks': result['checks']}
    if not result['ok']:
        raise generate.GenError('failed validation: ' + '; '.join(f"{c['name']}: {c['detail']}" for c in result['checks'] if not c['ok']))
    q['reference_metrics'] = result['reference']
    q['status'] = 'ready'
    return q
