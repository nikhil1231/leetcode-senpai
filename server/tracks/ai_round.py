"""Process signals for an AI-assisted round, read from the attempt's timeline. Pure: no I/O, no model.

Interviewers score four areas: approach, control, verification and communication. Some of each
is visible in the raw record (when you first prompted, what you asked, whether you ran the
tests after your last edit, what you said at the end), so these observations need no model.
An optional model review (coach.grade_process) adds judgement on top; it never replaces these.
"""
import re

AREAS = [
    ('approach', 'Approach', 'Understand and reproduce before prompting.'),
    ('control', 'Control', 'Direct the AI with small, specific tasks.'),
    ('verification', 'Verification', 'Read, run and test everything it writes.'),
    ('communication', 'Communication', 'Explain the bug, the fix and how you checked it.'),
]
READ_FIRST = 120          # seconds of reading or running before a first prompt counts as planned
WALKTHROUGH_WORDS = 60
VAGUE = re.compile(r"^\W*(please\s+)?(fix|solve|do|finish|implement|debug)\b(\s+(it|this|that|everything|the\s+(bug|code|problem|tests?)))?\W*$", re.I)
REWRITE = re.compile(r'\b(rewrite|redo|start over)\b.*\b(whole|entire|everything|all|file|module)\b', re.I)
SPECIFIC = re.compile(r'[A-Za-z_]\w*\(|\w+\.py\b|\b\w+_\w+\b|`[^`]+`')
VERIFY_WORDS = re.compile(r'\b(test|tests|tested|ran|run|checked|verified|edge case|reproduc\w*)\b', re.I)


def words(text):
    return len(re.findall(r"[\w'’-]+", text or ''))


def vague(prompt):
    """A prompt that hands over the decision: "fix it", a bare request with no file, function or behaviour."""
    text = prompt.strip()
    if VAGUE.match(text) or REWRITE.search(text):
        return True
    return words(text) < 8 and not SPECIFIC.search(text)


def signals(attempt, prompts):
    """-> {'areas': [{key, title, goal, ok, notes}], 'stats': {...}}.

    `attempt` is a submitted practical attempt; `prompts` are the user's messages to the AI pair
    (or prompts they logged from their own tool), each {'text', 'at'}. `ok` is None when there's
    too little evidence to call it.
    """
    start = attempt.get('started_at') or 0
    runs = sorted(r['at'] for r in attempt.get('runs') or [])
    edits = sorted(attempt.get('edits') or [])
    asked = sorted(prompts, key=lambda p: p['at'])
    first = asked[0]['at'] if asked else None
    notes = {k: [] for k, _, _ in AREAS}
    ok = {}

    # Approach: reading and reproducing come before the first prompt.
    runs_before = sum(1 for t in runs if first is None or t < first)
    if first is None:
        ok['approach'] = None
        notes['approach'].append("You didn't use the AI pair. That's fine for a small fix, but the round expects you to show you can direct it.")
    else:
        delay = first - start
        ok['approach'] = runs_before > 0 or delay >= READ_FIRST
        if runs_before:
            notes['approach'].append(f'You ran the tests {runs_before} time{"s" if runs_before > 1 else ""} before your first prompt.')
        else:
            notes['approach'].append("You didn't run the tests before your first prompt; reproduce the bug first, so you can judge the AI's answer.")
        notes['approach'].append(f'First prompt after {_dur(delay)}.' + ('' if delay >= READ_FIRST or runs_before else ' Opening the AI in the first two minutes reads as reaching for the tool before the problem.'))

    # Control: specific, bounded prompts; no "rewrite everything".
    if asked:
        loose = [p['text'] for p in asked if vague(p['text'])]
        ok['control'] = len(loose) * 3 <= len(asked)
        notes['control'].append(f'{len(asked)} prompt{"s" if len(asked) > 1 else ""}, {len(loose)} vague.')
        if loose:
            notes['control'].append(f'For example "{_clip(loose[0])}". Name the file, the function and the behaviour you want.')
    else:
        ok['control'] = None

    # Verification: tests run after the last change, and the hidden checks.
    last_edit, last_run = (edits[-1] if edits else None), (runs[-1] if runs else None)
    if last_run is None:
        ok['verification'] = False
        notes['verification'].append('You never ran the tests before submitting.')
    else:
        fresh = last_edit is None or last_run >= last_edit
        notes['verification'].append(f'{len(runs)} test run{"s" if len(runs) > 1 else ""}.' + (
            '' if fresh else ' You changed the code after your last run and submitted without re-running.'))
        checks = attempt.get('checks') or {}
        failed = checks.get('total', 0) - checks.get('passed', 0)
        if failed:
            notes['verification'].append(f'{failed} hidden check{"s" if failed > 1 else ""} failed: the boundaries a plausible patch misses. Test the cases the visible tests don\'t cover.')
        ok['verification'] = fresh and not failed

    # Communication: the closing walkthrough to the interviewer.
    said = attempt.get('walkthrough') or ''
    n = words(said)
    if not n:
        ok['communication'] = False
        notes['communication'].append('No walkthrough. Expect "what was the bug, and how do you know it\'s fixed?" at the end of every phase.')
    else:
        checked = bool(VERIFY_WORDS.search(said))
        ok['communication'] = n >= WALKTHROUGH_WORDS and checked
        notes['communication'].append(f'Walkthrough of {n} words.' + ('' if n >= WALKTHROUGH_WORDS else ' Too short to cover the bug, the fix and the evidence.'))
        if not checked:
            notes['communication'].append('It never says how you verified the fix.')

    stats = {'prompts': len(asked), 'runs': len(runs), 'runs_before_first_prompt': runs_before,
             'seconds_to_first_prompt': None if first is None else round(first - start)}
    return {'areas': [{'key': k, 'title': t, 'goal': g, 'ok': ok[k], 'notes': notes[k]} for k, t, g in AREAS],
            'stats': stats}


def _dur(seconds):
    seconds = max(0, int(seconds))
    return f'{seconds} s' if seconds < 60 else f'{seconds // 60} min {seconds % 60:02d} s'


def _clip(text, n=70):
    text = ' '.join(text.split())
    return text if len(text) <= n else text[:n - 1] + '…'
