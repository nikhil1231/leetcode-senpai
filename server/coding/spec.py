"""Pure parts of Coding Practice: the exercise shape, what the browser may see, code references, difficulty and the
choice of what to practise next. No I/O, no model calls (like scheduler.py and insights.py)."""
import posixpath
import random
import re

MODES = ('reading', 'assisted')
CATEGORIES = {'reading': ('comprehension', 'walkthrough', 'localisation', 'repair'), 'assisted': ('feature', 'bugfix')}
MAX_RUNS = 60
MAX_ASSIST = 40            # assistant messages per attempt
# Mistakes the assistant can be given to make: each is a flawed patch, written with the exercise and checked by running it.
MISTAKES = {
    'symptom-fix': 'a patch that makes the reported symptom or visible tests go away without fixing the underlying cause',
    'edge-case': 'a patch that handles the common case but misses an edge case a careful reviewer would ask about',
    'off-by-one': 'a patch with a subtle off-by-one or boundary error',
    'unsafe-retry': 'a patch that adds a retry or re-delivery that is not idempotent and can apply an effect twice',
    'partial-state': 'a patch that updates state before checking it can succeed, leaving partial changes when it fails',
    'invented-api': 'a patch that calls a helper or method that does not exist in this codebase, presented as if it did',
}
NO_MISTAKE_SHARE = 0.35    # sessions where the assistant is right, so suspicion is not the whole skill
MINUTES = {1: 20, 2: 25, 3: 35, 4: 45, 5: 50}              # test runs per attempt
CATEGORY_LABELS = {'comprehension': 'Code comprehension', 'walkthrough': 'Service walkthrough', 'localisation': 'Bug localisation',
                   'repair': 'Debug and repair', 'feature': 'Feature', 'bugfix': 'Bug fix'}
# A walkthrough asks the four questions of a practical round about one request through a small service. Findings carry
# the part they answer, so the review can show which question an answer covered.
WALKTHROUGH_PARTS = {'trace': 'Trace the request', 'state': 'How state is shared', 'failure': 'If it fails halfway',
                     'test': "The test you'd write"}
EXECUTABLE = ('repair', 'feature', 'bugfix')   # categories whose code is edited and run (Python or Java, in the sandbox)
LANGUAGES = {'python': ('py',), 'javascript': ('js', 'mjs'), 'go': ('go',), 'java': ('java',), 'typescript': ('ts', 'tsx'),
             'kotlin': ('kt',)}
READING_LANGUAGES = [('java', 70), ('python', 25), ('go', 2.5), ('typescript', 2.5)]
EXECUTION_LANGUAGES = [('java', 70), ('python', 25)]
# The language you choose to practise in (settings["coding_language"]). "mixed" is the weighted mix above. Kotlin is read,
# not run (the sandbox has no Kotlin compiler), so exercises you edit and run fall back to its nearest neighbour, Java.
LANGUAGE_CHOICES = ('mixed', 'java', 'python', 'kotlin')
LANGUAGE_LABELS = {'mixed': 'Mixed', 'java': 'Java', 'python': 'Python', 'kotlin': 'Kotlin', 'go': 'Go', 'typescript': 'TypeScript'}
RUN_INSTEAD = {'kotlin': 'java'}
# Your own test, written in an exercise you edit and run: it should fail on the code you were given and pass once fixed.
OWN_TEST = {'python': ('tests/test_mine.py', '''import unittest


class MyTest(unittest.TestCase):
    def test_catches_the_bug(self):
        self.fail("Replace this with a test that fails on the original code and passes once it is fixed.")
'''), 'java': ('tests/MineTest.java', '''package tests;

public class MineTest {
    // Each public static void test...() method is a test. Throw AssertionError (or use assert) when it fails.
    public static void testCatchesTheBug() {
        throw new AssertionError("Replace this with a test that fails on the original code and passes once it is fixed.");
    }
}
''')}
TARGET_READY = 2           # validated exercises kept per category
LEVELS = 5
MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES = 14, 24_000, 90_000

SKILLS = {
    'control-flow': 'Tracing control flow', 'async-flow': 'Async, callbacks and events', 'state': 'Where state lives and changes',
    'error-handling': 'How errors propagate', 'boundaries': 'Edge cases and boundaries', 'concurrency': 'Races, locks and ordering',
    'transactions': 'Transactions and consistency', 'retries': 'Retries and idempotency', 'caching': 'Caching and invalidation',
    'data-flow': 'Following data between modules', 'api-contracts': 'Reading APIs and contracts',
}
ARCHETYPES = [
    'a background job worker with a retry queue', 'a webhook receiver that deduplicates events', 'an inventory reservation service',
    'a token-bucket rate limiter in front of an API', 'a read-through cache with expiry', 'a CSV import pipeline with validation',
    'an in-process event bus with subscribers', 'a session store with sliding expiry', 'a cron-style task scheduler',
    'an order pricing engine with discounts', 'a feature-flag evaluator', 'a log aggregator that rolls up counts per window',
    'a notification fan-out with per-user preferences', 'a payment ledger with idempotency keys', 'a file-sync diff engine',
    'a connection pool with health checks', 'a pub/sub broker with acknowledgements', 'a leaderboard with ties and pagination',
    'a config loader with layered overrides', 'a saga coordinator for a multi-step booking',
]
# What each difficulty level means, per dimension (the brief's table). The generator is told these, loosely.
DIMENSIONS = {
    'size': ['50-120 lines in one or two files', '150-250 lines in 3-4 files', '250-450 lines in 5-7 files',
             '450-700 lines in 7-10 files', '700+ lines in 9-14 files'],
    'control': ['linear code with a few branches', 'loops, helpers and early returns', 'callbacks or async with a clear order',
                'async, callbacks and events interleaved', 'event-driven flow with several entry points'],
    'bug': ['an obvious logic mistake', 'a boundary or off-by-one error', 'a wrong assumption between two functions',
            'a subtle interaction between modules', 'an omission that only matters under a particular ordering'],
    'dependencies': ['the standard library only', 'the standard library, with a small in-memory store',
                     'a simulated database or queue with its own API', 'a simulated database, queue and cache',
                     'several simulated services with their own failure modes'],
    'state': ['local variables', 'an object holding state across calls', 'state shared between components',
              'persisted state that outlives a process', 'state replicated or coordinated between workers'],
    'concurrency': ['none', 'none, but with ordering that matters', 'threads or tasks that rarely interleave',
                    'locks and shared data', 'races, transactions and idempotency'],
    'evidence': ['a clear failure with the exact error', 'a wrong result with an example', 'a symptom described by a user',
                 'an intermittent symptom', 'only an indirect symptom in a metric or log'],
}


def dims(level):
    level = max(1, min(LEVELS, int(level)))
    return {k: v[level - 1] for k, v in DIMENSIONS.items()}


# ---- what the browser may see -------------------------------------------------------------------------

PUBLIC_KEYS = ('id', 'mode', 'category', 'language', 'difficulty', 'skills', 'title', 'task', 'archetype')


def public(ex):
    """The exercise as the learner sees it: repository, task and visible tests. Nothing that answers it."""
    out = {k: ex.get(k) for k in PUBLIC_KEYS}
    out['files'] = ex['files']
    out['editable'] = list(ex.get('editable') or [])
    out['readonly'] = ex['category'] not in EXECUTABLE
    out['can_run'] = ex['category'] in EXECUTABLE and bool(ex.get('visible_tests'))
    out['hint_count'] = len(ex.get('hints') or [])
    out['minutes'] = MINUTES.get(ex.get('difficulty'), 30) if ex.get('mode') == 'assisted' else None
    out['assistant'] = ex.get('mode') == 'assisted'
    out['curated'] = ex.get('source') == 'curated'
    if (mine := own_test(ex)) and mine[0] not in out['files']:
        out['files'] = {**out['files'], mine[0]: mine[1]}
        out['editable'].append(mine[0])
        out['own_test'] = mine[0]
    out['idioms'] = ex.get('idioms') or []
    return out


# ---- code references: "[worker.py:42-58]" in an explanation ---------------------------------------------

REF_RE = re.compile(r'\[([^\[\]\s:][^\[\]:]*?):(\d+)(?:\s*[-–]\s*(\d+))?\]')


def ref_token(path, start, end=None):
    return f'[{path}:{start}-{end}]' if end and end != start else f'[{path}:{start}]'


def parse_refs(text, files):
    """Structured references found in an explanation: [{path, start, end}] in order, for files that exist and lines
    that are in range. Typed, spoken and clicked references all end up as the same text, so they are read the same way."""
    out = []
    for m in REF_RE.finditer(text or ''):
        path = posixpath.normpath(m.group(1).strip())
        if path not in files:
            continue
        total = len(files[path].splitlines()) or 1
        start = int(m.group(2))
        end = int(m.group(3) or start)
        if end < start:
            start, end = end, start
        if 1 <= start <= total:
            out.append({'path': path, 'start': start, 'end': min(end, total)})
    return out


def overlap(a, b):
    return a['path'] == b['path'] and a['start'] <= b['end'] and b['start'] <= a['end']


def locate(files, path, anchor):
    """Lines (start, end) of the first occurrence of a snippet in a file, or None. Exact first, then line by line ignoring
    indentation and trailing space, since a model quoting code often re-indents it."""
    text = files.get(path)
    if not text or not anchor or not anchor.strip():
        return None
    snippet = anchor.strip('\n')
    at = text.find(snippet)
    if at >= 0:
        start = text.count('\n', 0, at) + 1
        return start, start + snippet.count('\n')
    want = [l.strip() for l in snippet.split('\n') if l.strip()]
    lines = [l.strip() for l in text.split('\n')]
    for i in range(len(lines)):
        j, k = i, 0
        while j < len(lines) and k < len(want):
            if not lines[j] and j > i:
                j += 1
                continue
            if lines[j] != want[k]:
                break
            j, k = j + 1, k + 1
        if k == len(want):
            return i + 1, j
    return None


def ref_evidence(refs, findings):
    """Which expected findings the learner's references land on. Evidence for the grader and the review, never a gate."""
    hits = []
    for f in findings:
        spots = f.get('locations') or []
        hits.append({'id': f['id'], 'referenced': any(overlap(r, s) for r in refs for s in spots)})
    return hits


def safe_path(path):
    p = posixpath.normpath(path or '')
    return bool(p) and not p.startswith(('/', '..')) and '\\' not in p and '\x00' not in p and not p.startswith('.') \
        and len(p) <= 120 and all(part and not part.startswith('..') for part in p.split('/'))


# ---- difficulty and what to practise next ---------------------------------------------------------------

def done(attempts, mode):
    return sorted((a for a in attempts if a.get('mode') == mode and a.get('status') == 'submitted' and a.get('score') is not None),
                  key=lambda a: a.get('submitted_at') or 0)


def difficulty(attempts, mode):
    """Walks the graded attempts in order: two in a row at 75+ move up a level, a score under 40 moves down.
    Hints and a revealed solution make a high score count for less. Tracked apart for each mode."""
    level, streak = 2, 0
    for a in done(attempts, mode):
        s = a['score'] - 10 * min(a.get('hints_used') or 0, 3)
        if s >= 75:
            streak += 1
            if streak >= 2 and level < LEVELS:
                level, streak = level + 1, 0
        elif s < 40:
            level, streak = max(1, level - 1), 0
        else:
            streak = 0
    return level


def weakness(attempts, mode, key, values):
    """value -> 0..1 weakness from the graded attempts that carry `key` (a category, or one of several skills).
    Unseen is a moderate 0.5: unknown is not weak."""
    scores = {v: [] for v in values}
    for a in done(attempts, mode)[-30:]:
        tags = a.get(key)
        for t in (tags if isinstance(tags, list) else [tags]):
            if t in scores:
                scores[t].append(a['score'] - 10 * min(a.get('hints_used') or 0, 3))
    return {v: (1 - max(0, min(100, sum(s) / len(s))) / 100) if s else 0.5 for v, s in scores.items()}


def target_language(choice, category):
    """The language to make or serve an exercise of `category` in, for your language choice; None for the mixed rotation."""
    if choice not in LANGUAGE_CHOICES or choice == 'mixed':
        return None
    if category in EXECUTABLE and choice not in dict(EXECUTION_LANGUAGES):
        return RUN_INSTEAD.get(choice)
    return choice


def flagged_skills(attempts, last=5):
    """Skills the debriefs of your last few practice interviews said to work on, most recent first."""
    out = []
    talks = sorted((a for a in attempts if (a.get('interview') or {}).get('debrief')), key=lambda a: a['interview']['debrief'].get('at') or 0)
    for a in reversed(talks[-last:]):
        out += [s for s in a['interview']['debrief'].get('skills') or [] if s in SKILLS and s not in out]
    return out


def own_test(ex):
    """(path, starter) of the test you may write for an exercise you edit and run, or None."""
    if ex.get('category') not in EXECUTABLE or ex.get('language') not in OWN_TEST:
        return None
    return OWN_TEST[ex['language']]


def learner_paths(ex):
    """The files you may change: the editable sources, and your own test where there is one."""
    mine = own_test(ex)
    return [*(ex.get('editable') or []), *([mine[0]] if mine else [])]


def own_test_written(ex, files):
    mine = own_test(ex)
    code = (files or {}).get(mine[0]) if mine else None
    return bool(code and code.strip() and code != mine[1])


def own_test_verdict(on_original, on_fix, against='reference'):
    """What your test shows, from its results on the code you were given and on the fixed code (sandbox summaries).
    A test proves it catches the bug when something fails before the fix and everything passes after it. `against` is
    'yours' while you work, when the "fixed" code is your current code and may not be fixed yet."""
    if not on_original.get('total') or not on_fix.get('total'):
        return {'catches': False, 'note': "Your test didn't run. Check that it compiles and that its test methods are named test..."}
    fails_before, passes_after = bool(on_original['failed']), not on_fix['failed']
    note = ('It fails on the original code and passes once fixed, so it catches the bug.' if fails_before and passes_after else
            'It passes on the original code, so it would not have caught the bug.' if not fails_before else
            'It fails on the fixed code too, so it tests something other than the bug, or expects the wrong behaviour.' if against != 'yours' else
            "It fails on your code too. If you haven't fixed the bug yet, fix it and check again; if you have, the test expects "
            'something other than the fix.')
    return {'catches': fails_before and passes_after, 'fails_before': fails_before, 'passes_after': passes_after, 'note': note}


def choose(attempts, mode, rng=None, recent_archetypes=(), executable=False, category=None):
    """The next exercise to make or serve: {mode, category, difficulty, skills, language, archetype}. Leans toward the
    categories and skills with the weakest recent results, and never repeats a recent scenario."""
    rng = rng or random
    cats = [c for c in CATEGORIES[mode] if executable or c not in EXECUTABLE]
    level = difficulty(attempts, mode)
    wc = weakness(attempts, mode, 'category', cats)
    category = category if category in cats else rng.choices(cats, weights=[0.4 + wc[c] for c in cats])[0]
    ws = weakness(attempts, mode, 'skills', list(SKILLS))
    for s in flagged_skills(attempts)[:3]:      # what a recent practice interview said to work on
        ws[s] += 0.3
    skills = [s for s, _ in sorted(ws.items(), key=lambda kv: -kv[1] - rng.random() * 0.15)[:2]]
    fresh = [a for a in ARCHETYPES if a not in set(recent_archetypes)] or ARCHETYPES
    langs = EXECUTION_LANGUAGES if category in EXECUTABLE else READING_LANGUAGES
    language = rng.choices([l for l, _ in langs], weights=[w for _, w in langs])[0]
    plan = None
    if mode == 'assisted':
        careless = overreliance(attempts)
        plan = None if rng.random() < (0.15 if careless else NO_MISTAKE_SHARE) else rng.choice(list(MISTAKES))
    return {'plan': plan, 'mode': mode, 'category': category, 'difficulty': level, 'skills': skills, 'language': language,
            'archetype': rng.choice(fresh)}


def language_deficits(records, executable=False):
    """Largest deficit first: balance exercises actually served, or served plus the ready buffer.

    Reading gets 70/25/2.5/2.5; execution renormalises the Java/Python weights to 70/95 and 25/95.
    Old JavaScript exercises remain readable but do not enter the new target distribution.
    """
    weights = EXECUTION_LANGUAGES if executable else READING_LANGUAGES
    counts = {lang: 0 for lang, _ in weights}
    for r in records:
        if (r.get('category') in EXECUTABLE) == executable and r.get('language') in counts:
            counts[r['language']] += 1
    total, scale = sum(counts.values()) + 1, sum(w for _, w in weights)
    return {lang: total * weight / scale - counts[lang] for lang, weight in weights}


def overreliance(attempts):
    """True when the last few AI-assisted sessions applied a flawed suggestion without catching it."""
    last = done(attempts, 'assisted')[-4:]
    missed = [a for a in last if (a.get('ai') or {}).get('planted') and not (a.get('ai') or {}).get('detected')]
    return len(last) >= 3 and len(missed) >= 2


def fit(ex, level, weak_categories=()):
    """How well a ready exercise matches what the latest results ask for (lower is better), so that one made before the
    last attempt was graded can still be passed over for a better one."""
    return abs(ex['difficulty'] - level) * 2 + (0 if ex['category'] in weak_categories else 1)


def stale(ex, level):
    return abs(ex['difficulty'] - level) >= 2
