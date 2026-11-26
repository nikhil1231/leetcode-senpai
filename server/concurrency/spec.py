"""Pure rules for custom concurrency questions: the five levels, how the current level moves with results, the level a new
question is written at (mostly yours, sometimes easier, occasionally a stretch), the topic it covers, and when the buffer
is refilled. No I/O and no model calls, like scheduler.py."""
import random

SLUG_PREFIX = 'cc-'
CATEGORY = 'Concurrency'
TARGET_READY = 2         # unstarted questions kept ready
MAX_UNCOMPLETED = 3      # ready plus in progress, beyond which only the Generate button makes more
LEVEL_OFFSETS = ((0, 0.50), (-1, 0.25), (-2, 0.15), (1, 0.10))
PROMOTE_CREDIT = 2.0     # clean solves at or above the level needed to move up
BASE_WEIGHT = 0.5        # a clean solve of one of LeetCode's own concurrency problems counts for half
BASE_LEVEL = 2
DISCARD_REASONS = {
    'ambiguous': 'The statement was ambiguous',
    'tests-wrong': 'A test was wrong or flaky',
    'too-easy': 'Too easy',
    'too-hard': 'Too hard for where I am',
    'repeat': 'Too like one I have done',
    'other': 'Something else',
}

LEVELS = {
    1: {'label': 'Foundations',
        'tools': ['synchronized', 'volatile', 'wait/notifyAll', 'Thread.join'],
        'shape': 'order a few calls made from different threads, alternate two threads, or make a small class thread-safe',
        'tests': 'correctness and ordering under many repetitions'},
    2: {'label': 'Coordination',
        'tools': ['Semaphore', 'CountDownLatch', 'AtomicInteger/AtomicReference', 'ConcurrentHashMap'],
        'shape': 'several threads coordinating through counts or permits: a pool of N permits, a one-shot gate, threads taking turns by number',
        'tests': 'correctness and ordering, plus limits that must never be exceeded (no more than N inside at once)'},
    3: {'label': 'Locks and conditions',
        'tools': ['ReentrantLock with several Conditions', 'tryLock(timeout)', 'CyclicBarrier', 'ExecutorService and Future'],
        'shape': 'a bounded structure with separate wait conditions, an operation that gives up after a timeout instead of '
                 'deadlocking, or work split across a pool in rounds',
        'tests': 'correctness, timeouts that are honoured (a call that cannot proceed returns or fails within its time limit), and no deadlock'},
    4: {'label': 'Contention and lifecycle',
        'tools': ['ReentrantReadWriteLock', 'StampedLock', 'CompletableFuture chains', 'interrupts and cancellation',
                  'Phaser', 'fair versus unfair locks'],
        'shape': 'a shared structure read far more than written where writers must not starve, a cancellable job with a '
                 'deadline, or single-flight loading (concurrent requests for the same key trigger one load)',
        'tests': 'everything below, plus real parallelism (several readers inside at once), fairness or no starvation, and '
                 'threads that exit cleanly when interrupted'},
    5: {'label': 'Design under load',
        'tools': ['lock-free CAS loops', 'lock striping', 'several primitives combined', 'graceful shutdown and draining'],
        'shape': 'a component that combines several primitives: a lock-free stack or counter, a sharded rate limiter, a '
                 'scheduler that survives a failing task and drains cleanly on shutdown()',
        'tests': 'everything below, plus progress under heavy contention and clean shutdown with work in flight'},
}

# What a question is about, separate from the level: the level decides which tools it needs. min_level is the lowest
# level the topic makes sense at; `tools` are the ones it naturally exercises, for steering towards weak spots.
TOPICS = [
    {'key': 'ordering', 'label': 'Ordering calls across threads', 'min_level': 1, 'tools': ['wait/notifyAll', 'CountDownLatch', 'Semaphore']},
    {'key': 'alternation', 'label': 'Threads taking turns', 'min_level': 1, 'tools': ['wait/notifyAll', 'Semaphore', 'ReentrantLock with several Conditions']},
    {'key': 'shared-counter', 'label': 'Shared state updated by many threads', 'min_level': 1, 'tools': ['synchronized', 'AtomicInteger/AtomicReference', 'lock-free CAS loops']},
    {'key': 'producer-consumer', 'label': 'Producers and consumers', 'min_level': 1, 'tools': ['wait/notifyAll', 'ReentrantLock with several Conditions', 'Semaphore']},
    {'key': 'gate', 'label': 'Gates, latches and start signals', 'min_level': 2, 'tools': ['CountDownLatch', 'Phaser', 'CompletableFuture chains']},
    {'key': 'resource-pool', 'label': 'A pool of limited resources', 'min_level': 2, 'tools': ['Semaphore', 'tryLock(timeout)', 'graceful shutdown and draining']},
    {'key': 'grouping', 'label': 'Forming groups of threads (like molecules or teams)', 'min_level': 2, 'tools': ['Semaphore', 'CyclicBarrier']},
    {'key': 'rounds', 'label': 'Work in rounds with barriers', 'min_level': 3, 'tools': ['CyclicBarrier', 'Phaser', 'ExecutorService and Future']},
    {'key': 'timeouts', 'label': 'Operations that give up after a timeout', 'min_level': 3, 'tools': ['tryLock(timeout)', 'ReentrantLock with several Conditions', 'CompletableFuture chains']},
    {'key': 'deadlock-avoidance', 'label': 'Taking several locks without deadlocking', 'min_level': 3, 'tools': ['tryLock(timeout)', 'lock striping', 'ReentrantLock with several Conditions']},
    {'key': 'parallel-work', 'label': 'Splitting work across a thread pool', 'min_level': 3, 'tools': ['ExecutorService and Future', 'CompletableFuture chains', 'ConcurrentHashMap']},
    {'key': 'rate-limiting', 'label': 'Rate limiting', 'min_level': 3, 'tools': ['Semaphore', 'lock-free CAS loops', 'lock striping']},
    {'key': 'reader-writer', 'label': 'Many readers, few writers', 'min_level': 4, 'tools': ['ReentrantReadWriteLock', 'StampedLock', 'fair versus unfair locks']},
    {'key': 'single-flight', 'label': 'Loading a value once for many callers', 'min_level': 4, 'tools': ['CompletableFuture chains', 'ConcurrentHashMap']},
    {'key': 'cancellation', 'label': 'Cancellation, interrupts and deadlines', 'min_level': 4, 'tools': ['interrupts and cancellation', 'ExecutorService and Future']},
    {'key': 'scheduling', 'label': 'Delayed and scheduled work', 'min_level': 4, 'tools': ['ReentrantLock with several Conditions', 'graceful shutdown and draining']},
    {'key': 'lock-free', 'label': 'Lock-free structures', 'min_level': 5, 'tools': ['lock-free CAS loops', 'AtomicInteger/AtomicReference']},
    {'key': 'pipeline', 'label': 'A multi-stage pipeline with shutdown', 'min_level': 5, 'tools': ['graceful shutdown and draining', 'several primitives combined']},
]
TOPIC_BY_KEY = {t['key']: t for t in TOPICS}
RECENT_TOPICS = 5


def clamp(level):
    return max(1, min(5, int(level)))


def difficulty(level):
    """The Easy/Medium/Hard label the rest of the app reads (interview pace, lists)."""
    return 'Easy' if level <= 2 else 'Medium' if level <= 4 else 'Hard'


def is_custom(slug):
    return bool(slug) and slug.startswith(SLUG_PREFIX)


def should_refill(ready, in_progress):
    """Whether the background queue makes another question: keep TARGET_READY ready, never more than MAX_UNCOMPLETED
    unfinished in all. The Generate button skips this."""
    return ready < TARGET_READY and ready + in_progress < MAX_UNCOMPLETED


def outcome(attempt):
    """'clean', 'struggle' or None (not rated yet, or neither) for one solve.

    Clean: Accepted with few failed submits, no hints, rated medium or high confidence, and a code score of 4 or more
    when it has been graded. Struggle: unsolved, the solution or hints needed, rated low, or a score of 2 or less."""
    if attempt.get('unsolved') or attempt.get('gave_up'):
        return 'struggle'
    score = (attempt.get('solution_grade') or {}).get('score')
    conf, indep = attempt.get('confidence'), attempt.get('independence')
    if indep in ('hints', 'solution') or conf == 1 or (score is not None and score <= 2):
        return 'struggle'
    if conf is None:
        return None
    if conf >= 2 and (attempt.get('wrong_before_ac') or 0) <= 2 and (score is None or score >= 4):
        return 'clean'
    return None


def current_level(history):
    """The level new questions centre on, from solves in time order: [{level, outcome, base}].

    Up one after PROMOTE_CREDIT of clean solves at or above the level (LeetCode's own problems count half, as level 2);
    down one after a struggle on a custom question at or below it. A stretch that goes badly does not pull you down."""
    level, credit = 1, 0.0
    for h in history:
        lv = h.get('level') or BASE_LEVEL
        if h.get('outcome') == 'clean' and lv >= level:
            credit += BASE_WEIGHT if h.get('base') else 1.0
            if credit >= PROMOTE_CREDIT:
                level, credit = min(5, level + 1), 0.0
        elif h.get('outcome') == 'struggle' and not h.get('base') and lv <= level:
            level, credit = max(1, level - 1), 0.0
    return level


def pick_level(level, ready_levels, rng=random):
    """The level for the next question: around yours, with variance (LEVEL_OFFSETS). While what is ready holds nothing at
    or below your level, the next one is at or below it, so there is always one you can just get on with."""
    options = LEVEL_OFFSETS
    if ready_levels and not any(lv <= level for lv in ready_levels):
        options = [(d, w) for d, w in LEVEL_OFFSETS if d <= 0]
    weights = {}
    for d, w in options:
        weights[clamp(level + d)] = weights.get(clamp(level + d), 0) + w
    levels = sorted(weights)
    return rng.choices(levels, weights=[weights[lv] for lv in levels])[0]


def weak_tools(history):
    """Tools you have struggled with more than you have handled cleanly, weakest first: [{tools, outcome}]."""
    score = {}
    for h in history:
        for tool in h.get('tools') or []:
            score[tool] = score.get(tool, 0) + (1 if h.get('outcome') == 'struggle' else -0.5 if h.get('outcome') == 'clean' else 0)
    return [t for t, s in sorted(score.items(), key=lambda kv: -kv[1]) if s > 0]


def choose_topic(level, recent, weak=(), rng=random):
    """A topic that fits the level and was not among the last few; leaning towards a weak tool about half the time."""
    fits = [t for t in TOPICS if t['min_level'] <= level]
    fresh = [t for t in fits if t['key'] not in list(recent)[-RECENT_TOPICS:]] or fits
    level_tools = set(LEVELS[level]['tools'])
    focus = [w for w in weak if w in level_tools or any(w in t['tools'] for t in fresh)]
    if focus and rng.random() < 0.5:
        tool = focus[0]
        matching = [t for t in fresh if tool in t['tools']]
        if matching:
            return rng.choice(matching), tool
    return rng.choice(fresh), None


def public(q, done=False):
    """What the browser sees of a question in the list. The tool it practises is shown only once you have solved it."""
    out = {'id': q['id'], 'title': q['title'], 'level': q['level'], 'status': q['status'], 'slug': q.get('slug'),
           'difficulty': difficulty(q['level']), 'created_at': q.get('created_at'), 'started_at': q.get('started_at')}
    if done:
        out['tool'] = q.get('primary_tool')
        out['topic'] = TOPIC_BY_KEY.get(q.get('topic'), {}).get('label')
    return out


def measurement_flags(mine, ref):
    """Plain-language flags from a submission's measurements against the reference's (both judge.measured), for the
    review. Only large differences count: test timings on a shared machine are noisy."""
    if not mine or not ref:
        return []
    out = []
    cpu, rcpu = mine.get('cpu_ms') or 0, ref.get('cpu_ms') or 0
    wall, rwall = mine.get('wall_ms') or 0, ref.get('wall_ms') or 0
    if cpu - rcpu > 300 and cpu >= 3 * max(rcpu, 50):
        out.append(f'CPU time {round(cpu)} ms against the reference\'s {round(rcpu)} ms ({cpu / max(rcpu, 1):.1f}x): '
                   'threads are probably spinning instead of blocking')
    if wall - rwall > 500 and wall >= 3 * max(rwall, 50):
        out.append(f'wall time {round(wall)} ms against the reference\'s {round(rwall)} ms ({wall / max(rwall, 1):.1f}x): '
                   'work may be serialised, or threads may sleep or wait longer than they need to')
    for tid, r in (ref.get('tests') or {}).items():
        m = (mine.get('tests') or {}).get(tid) or {}
        for name, rv in (r.get('metrics') or {}).items():
            mv = (m.get('metrics') or {}).get(name)
            if mv is not None and rv and rv >= 2 and mv * 2 <= rv:
                out.append(f'{tid.rsplit(".", 1)[-1]}: {name} reached {mv}, the reference reached {rv}')
    return out[:5]


def measurement_text(mine, ref):
    """Per-test numbers, learner and reference side by side, for the review prompt."""
    if not mine:
        return ''
    lines = [f"total: wall {round(mine.get('wall_ms') or 0)} ms, CPU {round(mine.get('cpu_ms') or 0)} ms"
             + (f"; reference wall {round(ref.get('wall_ms') or 0)} ms, CPU {round(ref.get('cpu_ms') or 0)} ms" if ref else '')]
    for tid, m in (mine.get('tests') or {}).items():
        r = ((ref or {}).get('tests') or {}).get(tid) or {}
        line = f"{tid.rsplit('.', 1)[-1]}: wall {m.get('wall_ms')} ms, CPU {m.get('cpu_ms')} ms"
        if m.get('metrics'):
            line += ', ' + ', '.join(f'{k}={v}' for k, v in m['metrics'].items())
        if r:
            line += f" | reference wall {r.get('wall_ms')} ms, CPU {r.get('cpu_ms')} ms"
            if r.get('metrics'):
                line += ', ' + ', '.join(f'{k}={v}' for k, v in r['metrics'].items())
        lines.append(line)
    return '\n'.join(lines[:14])
