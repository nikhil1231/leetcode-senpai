"""Validation: nothing is served until it passes. Deterministic checks run at assembly (generate.py: files parse, anchors
exist, no comment gives the bug away). This adds the independent solve: a second model, shown only what the learner would
see, answers the task, and the examiner marks that answer. If a fresh reader cannot reach the key findings from the code, the
exercise is ambiguous or unsolvable and is thrown away. Executable categories are additionally run in the sandbox (runner)."""
from . import grade, model_io, spec as S

PASS = 55
SOLVER = (
    "You are a strong backend engineer reading an unfamiliar repository to answer a question. Investigate carefully, then answer "
    "in plain prose, citing code as [path:start-end] with the line numbers shown. Reply with the answer only."
)


def solve(ex):
    shown = {'task': ex['task'], 'repository': grade._repo({'files': ex['files']})}
    text, _ = model_io.chat('coding_gen', SOLVER, f"QUESTION:\n{shown['task']}\n\nREPOSITORY:\n{shown['repository']}", timeout=300)
    return text


def validate(ex):
    """Blocking. Returns the validation record; ex['status'] becomes 'ready' only when it passes."""
    checks = []
    if ex['category'] in S.EXECUTABLE:
        from . import runner
        checks = runner.check_exercise(ex)
        if not all(c['ok'] for c in checks):
            return {'ok': False, 'checks': checks}
    if ex['category'] == 'feature':      # a feature has no explanation to find; the tests and the reference solution are the check
        return {'ok': True, 'checks': checks, 'solver_score': None}
    answer = solve(ex)
    refs = S.parse_refs(answer, ex['files'])
    marked = grade.mark(ex, answer, refs, 0)
    keys = [f for f in ex['findings'] if f['key']]
    met = {f['id'] for f in marked['findings'] if f['met']}
    key_met = sum(1 for f in keys if f['id'] in met)
    checks.append({'name': 'independent solve', 'ok': marked['score'] >= PASS and key_met >= max(1, len(keys) // 2 + len(keys) % 2),
                   'detail': f"a fresh reader scored {marked['score']}, {key_met} of {len(keys)} key findings"})
    return {'ok': all(c['ok'] for c in checks), 'checks': checks, 'solver_score': marked['score']}
