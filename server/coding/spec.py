"""Pure parts of Coding Practice: the exercise shape, what the browser may see, code references, difficulty and the
choice of what to practise next. No I/O, no model calls (like scheduler.py and insights.py)."""
import posixpath
import random
import re

MODES = ('reading', 'assisted')
CATEGORIES = {'reading': ('comprehension', 'localisation', 'repair'), 'assisted': ('feature', 'bugfix')}
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
CATEGORY_LABELS = {'comprehension': 'Code comprehension', 'localisation': 'Bug localisation', 'repair': 'Debug and repair',
                   'feature': 'Feature', 'bugfix': 'Bug fix'}
EXECUTABLE = ('repair', 'feature', 'bugfix')   # categories whose code is edited and run (Python, in the sandbox)
LANGUAGES = {'python': ('py',), 'javascript': ('js', 'mjs'), 'go': ('go',), 'java': ('java',)}
READING_LANGUAGES = [('python', 5), ('javascript', 2), ('go', 2), ('java', 1)]
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


def choose(attempts, mode, rng=None, recent_archetypes=(), executable=False, category=None):
    """The next exercise to make or serve: {mode, category, difficulty, skills, language, archetype}. Leans toward the
    categories and skills with the weakest recent results, and never repeats a recent scenario."""
    rng = rng or random
    cats = [c for c in CATEGORIES[mode] if executable or c not in EXECUTABLE]
    level = difficulty(attempts, mode)
    wc = weakness(attempts, mode, 'category', cats)
    category = category if category in cats else rng.choices(cats, weights=[0.4 + wc[c] for c in cats])[0]
    ws = weakness(attempts, mode, 'skills', list(SKILLS))
    skills = [s for s, _ in sorted(ws.items(), key=lambda kv: -kv[1] - rng.random() * 0.15)[:2]]
    fresh = [a for a in ARCHETYPES if a not in set(recent_archetypes)] or ARCHETYPES
    langs = [('python', 1)] if category in EXECUTABLE else READING_LANGUAGES
    language = rng.choices([l for l, _ in langs], weights=[w for _, w in langs])[0]
    plan = None
    if mode == 'assisted':
        careless = overreliance(attempts)
        plan = None if rng.random() < (0.15 if careless else NO_MISTAKE_SHARE) else rng.choice(list(MISTAKES))
    return {'plan': plan, 'mode': mode, 'category': category, 'difficulty': level, 'skills': skills, 'language': language,
            'archetype': rng.choice(fresh)}


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
