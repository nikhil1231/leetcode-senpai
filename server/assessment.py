"""Observed outcomes, coaching opinions and help are separate evidence."""
import hashlib

VERSION = 1
HELP_ORDER = {'none': 0, 'clarification': 0, 'unknown': 1,
              'conceptual_hint': 2, 'code_hint': 3, 'solution': 4}


def code_identity(code):
    return hashlib.sha256((code or '').encode()).hexdigest()


def assistance(a):
    events = a.get('assistance_events') or []
    labels = [e.get('kind', 'unknown') for e in events]
    if a.get('gave_up') or a.get('independence') == 'solution':
        labels.append('solution')
    if a.get('recall_hints') or a.get('independence') == 'hints':
        labels.append('conceptual_hint')
    if a.get('hint_level_used') and not events:
        labels.append('unknown')
    if not labels:
        return 'none' if a.get('independence') == 'solo' else 'unknown'
    return max(labels, key=lambda x: HELP_ORDER.get(x, 1))


def independence(a):
    help_ = assistance(a)
    return 'solution' if help_ == 'solution' else 'hints' if help_ in ('conceptual_hint', 'code_hint', 'unknown') else 'solo'


def observed(a):
    if a.get('unsolved'):
        return 'ended_unsolved'
    if a.get('submission_id'):
        return 'accepted'
    return a.get('execution_status', 'unknown')


def normalize(a, problem, opinion=None):
    opinion = opinion or {}
    objections = []
    for claim in opinion.get('correctness_objections') or []:
        # Only the dedicated verifier may confer confirmed status. Never trust
        # model-supplied "verified" flags or the current editor buffer.
        objections.append({**claim, 'verification': 'unverified'})
    return {'version': VERSION, 'source_attempt': a.get('id'),
            'submission_id': a.get('submission_id'), 'code_identity': code_identity(a.get('code')),
            'execution_status': observed(a), 'constraint_version': code_identity(problem.get('content_html')) if problem.get('content_html') else None,
            'assistance': assistance(a),
            'dimensions': {'execution': observed(a), 'approach': opinion.get('analysis'),
                'constraints': 'unknown' if not problem.get('content_html') else opinion.get('constraint_analysis', 'unassessed'),
                'complexity': {'time': opinion.get('inferred_time'), 'space': opinion.get('inferred_space')},
                'clarity': opinion.get('clarity'), 'optional_optimisation': opinion.get('optimisation')},
            'correctness_objections': objections}


def episode_attempt(a, attempts):
    """Revealed methods cannot disappear through an immediate retry."""
    at = a.get('solved_at') or 0
    events = list(a.get('assistance_events') or [])
    for previous in attempts:
        if previous.get('slug') != a.get('slug') or previous.get('id') == a.get('id'):
            continue
        gap = at - (previous.get('solved_at') or 0)
        if 0 <= gap < 86400 and assistance(previous) == 'solution':
            events.append({'kind': 'solution', 'source': previous.get('id'), 'at': previous.get('solved_at')})
    return {**a, 'assistance_events': events}


async def verify_objection(attempt, claim, runner, validate_input):
    """Run a serialized custom case against an immutable submission snapshot.

    runner is a separate LeetCode Run operation, never submit and never local
    eval. Unsupported contracts/cookies/harnesses retain an unverified claim.
    """
    result = {**claim, 'verification': 'unverified', 'code_identity': code_identity(attempt.get('code'))}
    required = ('input', 'expected_output', 'claimed_actual_output', 'explanation')
    if not attempt.get('code') or not all(claim.get(k) is not None for k in required):
        return result
    try:
        if not validate_input(claim['input']):
            return {**result, 'verification': 'invalid_input'}
        run = await runner(attempt['code'], claim['input'])
        if run.get('code_identity') != result['code_identity'] or run.get('status') != 'completed':
            return result
        actual = run.get('actual_output')
        if actual == claim['expected_output']:
            return {**result, 'verification': 'disproved', 'observed_output': actual}
        if actual == claim['claimed_actual_output']:
            return {**result, 'verification': 'reproduced', 'observed_output': actual}
        return {**result, 'observed_output': actual}
    except Exception:
        return result


async def verify_sort_colors(attempt, claim, question_id, auth):
    """The reviewed Sort Colors contract; other contracts stay unverified."""
    import json
    from . import leetcode
    def validate(data):
        try:
            nums = json.loads(data)
            expected = json.loads(claim['expected_output'])
            return (isinstance(nums, list) and 1 <= len(nums) <= 300
                    and all(type(n) is int and n in (0, 1, 2) for n in nums)
                    and sorted(nums) == expected)
        except (ValueError, TypeError, KeyError):
            return False
    async def runner(code, data):
        if not auth or not question_id or attempt.get('lang') not in (None, 'python3', 'python'):
            return {'status': 'unavailable'}
        result = await leetcode.run_code(attempt['slug'], question_id, code, data, auth)
        cases = result.get('cases') or []
        if result.get('error') or len(cases) != 1:
            return {'status': 'unavailable'}
        output = cases[0].get('output')
        return {'status': 'completed', 'code_identity': code_identity(code),
                'actual_output': json.dumps(json.loads(output), separators=(',', ':'))}
    normalized = dict(claim)
    try:
        for key in ('expected_output', 'claimed_actual_output'):
            normalized[key] = json.dumps(json.loads(claim[key]), separators=(',', ':'))
    except (ValueError, TypeError, KeyError):
        return {**claim, 'verification': 'unverified'}
    return await verify_objection(attempt, normalized, runner, validate)

# A reviewed contradiction from the audit, tied to the exact saved code.
# tests/fixtures/sort_colors_regression.json checks the claimed case and the
# independent exhaustive reference over every 0/1/2 array of lengths 1..9.
SORT_COLORS_CORRECTION = {
    'code_identity': 'f519771457e82ad6aa0a1fe63b952d3c0e71dd9a52f1cb901fcf6c72f4b2bae6',
    'input': '[1,2,0]', 'claimed_actual_output': '[1,0,2]',
    'observed_output': '[0,1,2]', 'verification': 'disproved',
    'provenance': 'reviewed executable regression; 29523 valid arrays checked against sorting',
    'version': 1,
}
