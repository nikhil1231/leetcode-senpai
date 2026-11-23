"""A curated pool for when generation cannot supply an exercise (no model, or the queue is empty on first use).
Written by hand, so they are served without validation by a model; each is a small, self-contained repository."""
import copy
import secrets
import time

_BASE = {'kind': 'exercise', 'mode': 'reading', 'language': 'python', 'status': 'ready', 'source': 'curated',
         'visible_tests': {}, 'hidden_tests': {}, 'reference_fix': {}, 'assistant_plan': None, 'validation': {'ok': True, 'curated': True}}

_QUEUE_FILES = {
    'README.md': "# jobq\n\nA tiny in-process job queue used by the billing exports. Jobs are enqueued by the API layer and run by a\nsingle worker loop. Failed jobs are retried a few times before being parked.\n",
    'jobq/queue.py': '''"""In-memory job queue with retry accounting."""
import time
from collections import deque

MAX_ATTEMPTS = 3


class Job:
    def __init__(self, job_id, payload):
        self.id = job_id
        self.payload = payload
        self.attempts = 0
        self.not_before = 0.0


class JobQueue:
    def __init__(self, clock=time.monotonic):
        self._ready = deque()
        self._parked = []
        self._clock = clock

    def enqueue(self, job):
        self._ready.append(job)

    def next_due(self):
        now = self._clock()
        for _ in range(len(self._ready)):
            job = self._ready.popleft()
            if job.not_before <= now:
                return job
            self._ready.append(job)
        return None

    def retry(self, job, delay):
        job.attempts += 1
        if job.attempts >= MAX_ATTEMPTS:
            self._parked.append(job)
            return False
        job.not_before = self._clock() + delay * job.attempts
        self._ready.append(job)
        return True

    @property
    def parked(self):
        return list(self._parked)
''',
    'jobq/worker.py': '''"""The worker loop: pull a due job, run its handler, report the outcome."""
import logging

log = logging.getLogger("jobq.worker")


class Worker:
    def __init__(self, queue, handlers, delay=2.0):
        self.queue = queue
        self.handlers = handlers
        self.delay = delay
        self.done = []

    def step(self):
        job = self.queue.next_due()
        if job is None:
            return False
        handler = self.handlers.get(job.payload.get("type"))
        if handler is None:
            log.error("no handler for %s", job.payload)
            return True
        try:
            handler(job.payload)
        except TimeoutError:
            self.queue.retry(job, self.delay)
        except Exception:
            log.exception("job %s failed", job.id)
        else:
            self.done.append(job.id)
        return True

    def drain(self):
        while self.step():
            pass
''',
    'jobq/api.py': '''"""What the API layer calls to submit work."""
from .queue import Job

_next_id = 0


def submit(queue, payload):
    global _next_id
    _next_id += 1
    queue.enqueue(Job(_next_id, payload))
    return _next_id
''',
}


_LIMITER = {
    'README.md': "# limiter\n\nA sliding-window rate limiter for the public API. Each client may make `limit` requests in any `window` seconds; a request\nstops counting once `window` seconds have passed.\n",
    'limiter/__init__.py': '',
    'limiter/window.py': """\"\"\"Sliding-window rate limiter keyed by client.\"\"\"
from collections import defaultdict, deque


class SlidingWindowLimiter:
    def __init__(self, limit, window, clock):
        self.limit = limit
        self.window = window
        self.clock = clock
        self._hits = defaultdict(deque)

    def _evict(self, key, now):
        hits = self._hits[key]
        while hits and now - hits[0] >= self.window:
            hits.popleft()

    def allow(self, key):
        now = self.clock()
        self._evict(key, now)
        hits = self._hits[key]
        if len(hits) > self.limit:
            return False
        hits.append(now)
        return True

    def remaining(self, key):
        self._evict(key, self.clock())
        return max(0, self.limit - len(self._hits[key]))
""",
    'limiter/api.py': """\"\"\"What the HTTP layer calls for each request.\"\"\"


def check(limiter, client):
    if limiter.allow(client):
        return 200, {"X-RateLimit-Remaining": str(limiter.remaining(client))}
    return 429, {"Retry-After": "1"}
""",
    'tests/test_visible.py': """import unittest

from limiter.window import SlidingWindowLimiter


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class VisibleTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.limiter = SlidingWindowLimiter(3, 10, self.clock)

    def test_requests_under_the_limit_are_allowed(self):
        self.assertTrue(all(self.limiter.allow("a") for _ in range(3)))

    def test_the_fourth_request_in_a_window_is_blocked(self):
        for _ in range(3):
            self.limiter.allow("a")
        self.assertFalse(self.limiter.allow("a"))

    def test_the_window_slides(self):
        for _ in range(3):
            self.limiter.allow("a")
        self.clock.t = 10
        self.assertTrue(self.limiter.allow("a"))

    def test_clients_are_independent(self):
        for _ in range(3):
            self.limiter.allow("a")
        self.assertTrue(self.limiter.allow("b"))
""",
}
_LIMITER_HIDDEN = {'tests/test_hidden.py': """import unittest

from limiter.api import check
from limiter.window import SlidingWindowLimiter


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class HiddenTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.limiter = SlidingWindowLimiter(2, 5, self.clock)

    def test_exactly_the_limit_is_allowed_in_a_burst(self):
        results = [self.limiter.allow("k") for _ in range(5)]
        self.assertEqual(results, [True, True, False, False, False])

    def test_remaining_counts_down_to_zero(self):
        self.limiter.allow("k")
        self.assertEqual(self.limiter.remaining("k"), 1)
        self.limiter.allow("k")
        self.assertEqual(self.limiter.remaining("k"), 0)

    def test_the_api_returns_429_on_the_third_request(self):
        self.assertEqual([check(self.limiter, "k")[0] for _ in range(3)], [200, 200, 429])

    def test_blocked_requests_do_not_extend_the_window(self):
        for _ in range(4):
            self.limiter.allow("k")
        self.clock.t = 5
        self.assertTrue(self.limiter.allow("k"))

    def test_limit_of_one(self):
        one = SlidingWindowLimiter(1, 5, self.clock)
        self.assertEqual([one.allow("k"), one.allow("k")], [True, False])
"""}
_LIMITER_FIX = {'limiter/window.py': _LIMITER['limiter/window.py'].replace('len(hits) > self.limit', 'len(hits) >= self.limit')}

_BASE_LIMITER = {**{k: v for k, v in _LIMITER.items() if k != 'tests/test_visible.py'}, **_LIMITER_FIX}
_ALLOW_N_FIX = _BASE_LIMITER['limiter/window.py'].replace("""    def allow(self, key):
        now = self.clock()
        self._evict(key, now)
        hits = self._hits[key]
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True
""", """    def allow(self, key):
        return self.allow_n(key, 1)

    def allow_n(self, key, n):
        if n < 0:
            raise ValueError("n must not be negative")
        now = self.clock()
        self._evict(key, now)
        hits = self._hits[key]
        if n > self.limit - len(hits):
            return False
        hits.extend([now] * n)
        return True
""")
_ALLOW_N_FLAWED = _BASE_LIMITER['limiter/window.py'].replace("""    def remaining(self, key):""", """    def allow_n(self, key, n):
        for _ in range(n):
            if not self.allow(key):
                return False
        return True

    def remaining(self, key):""")
_FEATURE_VISIBLE = """import unittest

from limiter.window import SlidingWindowLimiter


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class VisibleTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.limiter = SlidingWindowLimiter(4, 10, self.clock)

    def test_allow_n_within_the_limit(self):
        self.assertTrue(self.limiter.allow_n("a", 3))

    def test_allow_n_refuses_when_the_request_costs_too_much(self):
        self.assertTrue(self.limiter.allow_n("a", 3))
        self.assertFalse(self.limiter.allow_n("a", 2))

    def test_plain_allow_still_works(self):
        self.assertTrue(all(self.limiter.allow("a") for _ in range(4)))
        self.assertFalse(self.limiter.allow("a"))
"""
_FEATURE_HIDDEN = {'tests/test_hidden.py': """import unittest

from limiter.window import SlidingWindowLimiter


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class HiddenTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.limiter = SlidingWindowLimiter(4, 10, self.clock)

    def test_a_refused_request_consumes_nothing(self):
        self.limiter.allow_n("a", 3)
        self.assertFalse(self.limiter.allow_n("a", 2))
        self.assertEqual(self.limiter.remaining("a"), 1)

    def test_zero_cost_is_allowed_and_free(self):
        self.assertTrue(self.limiter.allow_n("a", 0))
        self.assertEqual(self.limiter.remaining("a"), 4)

    def test_a_request_bigger_than_the_limit_is_never_allowed(self):
        self.assertFalse(self.limiter.allow_n("a", 5))
        self.assertEqual(self.limiter.remaining("a"), 4)

    def test_cost_expires_with_the_window(self):
        self.limiter.allow_n("a", 4)
        self.clock.t = 10
        self.assertTrue(self.limiter.allow_n("a", 4))

    def test_negative_cost_is_rejected(self):
        with self.assertRaises(ValueError):
            self.limiter.allow_n("a", -1)
"""}

CURATED = [
    {**_BASE, 'category': 'comprehension', 'difficulty': 2, 'skills': ['control-flow', 'error-handling'], 'archetype': 'a background job worker with a retry queue',
     'title': 'The export queue', 'task': "A job `{type: 'export'}` is submitted and its handler raises `TimeoutError` on the first two calls, then succeeds.\n\nTrace what happens from `submit` until the job is finished: how many times does the handler run, what ends up in `worker.done`, and what is in `queue.parked`? Then say what would happen if the handler raised `ValueError` instead.",
     'files': _QUEUE_FILES, 'editable': [],
     'findings': [
         {'id': 'f1', 'text': 'A TimeoutError sends the job back through queue.retry, which counts the attempt and delays the next one by delay times the attempt number.', 'key': True, 'anchors': [('jobq/worker.py', '        except TimeoutError:\n            self.queue.retry(job, self.delay)'), ('jobq/queue.py', '        job.attempts += 1\n        if job.attempts >= MAX_ATTEMPTS:')]},
         {'id': 'f2', 'text': 'The handler runs three times (two timeouts, then success); the job is not parked because the third call succeeds and so retry is not called a third time. It ends in worker.done and parked stays empty.', 'key': True, 'anchors': [('jobq/worker.py', '        try:\n            handler(job.payload)')]},
         {'id': 'f3', 'text': 'Any other exception (ValueError) is only logged: the job is dropped, never retried, never parked and not in done.', 'key': True, 'anchors': [('jobq/worker.py', '        except Exception:\n            log.exception("job %s failed", job.id)')]},
         {'id': 'f4', 'text': 'A retried job is not due until its not_before time; next_due rotates the queue past jobs that are not yet due, so drain() stops when only not-due jobs are left.', 'key': False, 'anchors': [('jobq/queue.py', '            if job.not_before <= now:\n                return job')]}],
     'rubric': ['Follows the submit, next_due, handler, retry path in order', 'States the handler runs three times and the final state', 'Notices that a ValueError is swallowed and the job is lost'],
     'hints': ['Start with `Worker.step` and look at which exceptions it handles differently.', 'Count how `attempts` changes and where `MAX_ATTEMPTS` is compared.', 'Look at what happens to a job after an exception that is not a TimeoutError.'],
     'review': {'expected_behaviour': 'Timeouts are retried with a growing delay; other failures are logged and dropped.', 'execution_path': '1. submit enqueues a Job. 2. step takes it from next_due. 3. The handler raises TimeoutError, so retry bumps attempts and requeues it with a delay. 4. drain stops while the job is not yet due; once due, the second timeout repeats this. 5. The third call succeeds and the id goes into done.', 'root_cause': '', 'interactions': 'drain() ends as soon as next_due returns None, which also happens when jobs are merely waiting out a delay.'},
     'model_answer': 'The API layer calls submit, which wraps the payload in a Job and enqueues it. The worker pulls it with next_due, finds the handler by payload type and runs it. A TimeoutError calls queue.retry: attempts goes to 1, below MAX_ATTEMPTS, so the job is requeued with a delay of 2 seconds times the attempt number. Once due again, the second timeout repeats this with a 4 second delay and attempts 2. The third run succeeds so the id lands in worker.done and nothing is parked. A ValueError would be logged by the broad except and the job simply disappears.', 'fix_summary': ''},
    {**_BASE, 'category': 'localisation', 'difficulty': 2, 'skills': ['boundaries', 'retries'], 'archetype': 'a background job worker with a retry queue',
     'title': 'Jobs vanish after a timeout', 'task': "Support reports that some exports are never delivered. In the logs, a job for customer 4412 shows two `TimeoutError`s from the export handler and then nothing: no success, no error, and it is not in the parked list either.\n\nFind the underlying bug and explain how it produces what support saw.",
     'files': {**_QUEUE_FILES, 'jobq/queue.py': _QUEUE_FILES['jobq/queue.py'].replace('return job\n            self._ready.append(job)', 'return job\n            self._ready.append(job)').replace('''    def next_due(self):
        now = self._clock()
        for _ in range(len(self._ready)):
            job = self._ready.popleft()
            if job.not_before <= now:
                return job
            self._ready.append(job)
        return None''', '''    def next_due(self):
        now = self._clock()
        for _ in range(len(self._ready)):
            job = self._ready.popleft()
            if job.not_before <= now:
                return job
            self._ready.appendleft(job)
        return None''')},
     'editable': [],
     'findings': [
         {'id': 'f1', 'text': 'next_due puts a not-yet-due job back on the front of the deque (appendleft) instead of the back, so it is popped again on the next loop iteration.', 'key': True, 'anchors': [('jobq/queue.py', '            self._ready.appendleft(job)')]},
         {'id': 'f2', 'text': 'Because the same not-due job keeps being inspected, the loop never reaches later jobs in the queue; they are starved and never run while the delayed job waits. Items behind it look lost.', 'key': True, 'anchors': [('jobq/queue.py', '            job = self._ready.popleft()\n            if job.not_before <= now:')]}],
     'rubric': ['Identifies appendleft in next_due as the cause', 'Explains why jobs behind a delayed job are starved', 'Ties it to the symptom: retried work stops progressing'],
     'hints': ['The symptom is about what happens while a job is waiting out its delay. Which function decides what runs next?', 'Look at what next_due does with a job that is not due yet, and where it is put back.', 'Compare where a not-due job is put back with the order the loop reads from.'],
     'review': {'expected_behaviour': 'A delayed job should wait at the back so other due jobs run first.', 'execution_path': '1. Two timeouts requeue the job with a delay. 2. next_due pops it, sees it is not due and pushes it back to the front. 3. The loop pops the same job again, and ends with None. 4. Jobs behind it never get a turn.', 'root_cause': 'next_due re-queues a not-due job at the front of the deque.', 'interactions': 'The worker treats None from next_due as "nothing to do", so drain() quits and the stuck state looks like a clean finish.'},
     'model_answer': 'next_due rotates through the ready deque looking for a due job, but it puts a job that is not yet due back with appendleft, so it lands at the front and is popped again immediately. After the retry delay is set the delayed job is therefore examined over and over, and every job behind it is never reached. next_due returns None, the worker loop treats that as idle and drain stops, so the work looks silently lost.', 'fix_summary': 'Put a not-due job back with append (to the back) so the rotation visits every job once.'},
    {**_BASE, 'category': 'repair', 'difficulty': 1, 'skills': ['boundaries'], 'archetype': 'a token-bucket rate limiter in front of an API',
     'title': 'One request too many', 'language': 'python',
     'task': "The public API's rate limit is documented as 3 requests per 10 seconds per client, but an integration partner reports that they can send 4 in a burst before they see a `429`.\n\nFind the bug, fix it, and run the tests. Then explain what was wrong and why your change is the right one.",
     'files': {k: v for k, v in _LIMITER.items()}, 'editable': ['limiter/api.py', 'limiter/window.py'],
     'visible_tests': {'tests/test_visible.py': _LIMITER['tests/test_visible.py']}, 'hidden_tests': _LIMITER_HIDDEN, 'reference_fix': _LIMITER_FIX,
     'findings': [{'id': 'f1', 'text': 'allow() blocks only when the number of recorded hits is strictly greater than the limit, so a client with exactly `limit` hits is let through once more. The check should be >=.', 'key': True,
                   'anchors': [('limiter/window.py', '        if len(hits) > self.limit:')]}],
     'rubric': ['Names the comparison in allow() as the cause', 'Explains why it lets limit+1 requests through', 'Describes a fix that also keeps the other tests passing'],
     'hints': ['Count how many requests succeed before the first 429. Which function decides?', 'Look at the comparison between the stored hits and the limit.', 'What should happen when the stored hits already equal the limit?'],
     'review': {'expected_behaviour': 'At most `limit` requests succeed in any window; the next one is refused.', 'execution_path': '1. The fourth call to allow() evicts nothing. 2. len(hits) is 3, and 3 > 3 is false. 3. The request is recorded and allowed. 4. Only the fifth call is blocked.', 'root_cause': 'The check uses > instead of >=.', 'interactions': 'The eviction uses >= for the window edge, so the two boundary checks look alike and the wrong one is easy to miss.'},
     'model_answer': 'allow() decides with `len(hits) > self.limit`. With limit 3 and three hits recorded, that is false, so a fourth hit is appended and allowed; only the next call is refused. It should refuse as soon as the recorded hits reach the limit, so the comparison should be >=. Everything else, including eviction and remaining(), is already consistent with that.', 'fix_summary': 'Change `>` to `>=` in SlidingWindowLimiter.allow.'},
    {**_BASE, 'mode': 'assisted', 'category': 'feature', 'difficulty': 2, 'skills': ['boundaries', 'state'], 'archetype': 'a token-bucket rate limiter in front of an API',
     'title': 'Weighted requests', 'language': 'python',
     'task': "Some endpoints are more expensive than others, so they should cost more than one request against a client's limit.\n\nAdd `SlidingWindowLimiter.allow_n(key, n)`: it succeeds, and records `n` requests, only if the client still has room for all `n`; otherwise it refuses and records nothing. `allow(key)` should keep working as before.",
     'files': {**_BASE_LIMITER, 'tests/test_visible.py': _FEATURE_VISIBLE}, 'editable': ['limiter/api.py', 'limiter/window.py'],
     'visible_tests': {'tests/test_visible.py': _FEATURE_VISIBLE}, 'hidden_tests': _FEATURE_HIDDEN, 'reference_fix': {'limiter/window.py': _ALLOW_N_FIX},
     'findings': [{'id': 'f1', 'text': 'allow_n must check that all n fit before recording anything, so a refused request leaves the window unchanged.', 'key': True, 'anchors': [('limiter/window.py', '    def remaining(self, key):')]},
                  {'id': 'f2', 'text': 'Edge cases: n of 0 is allowed and free, n above the limit is never allowed, a negative n is an error.', 'key': False, 'anchors': [('limiter/window.py', '    def _evict(self, key, now):')]}],
     'rubric': ['Records all n hits or none', 'Handles zero, oversize and negative n', 'Runs the tests and reads the failures'],
     'hints': ['What should the window look like after a refused request?', 'Check how much room is left before you record anything.', 'Try asking for more than the limit in one go.'],
     'review': {'expected_behaviour': 'A weighted request is all-or-nothing against the window.', 'execution_path': 'allow_n evicts old hits, compares n with the room left, then records n hits or none.', 'root_cause': '', 'interactions': 'Implementing allow_n by calling allow in a loop consumes part of the limit before a later call fails.'},
     'model_answer': 'Check n against the room left (limit minus recorded hits) after evicting, return False without touching the window if it does not fit, otherwise append n hits. Reject negative n. Make allow(key) a call to allow_n(key, 1).', 'fix_summary': 'Evict, compare n with limit minus recorded hits, then extend the deque by n or return False.',
     'assistant_plan': {'kind': 'partial-state', 'description': 'allow_n loops over allow(), so a refused request has already recorded some of its hits.', 'tell': 'Ask for more than is left, then check remaining(): the failed request has used up the limit.',
                        'message': "I'd build `allow_n` on top of `allow`, so the limit logic stays in one place: call `allow(key)` n times and stop at the first refusal. A request that fits succeeds, one that does not returns False, and `allow` itself is untouched, so existing callers keep working. Here is the patch for `limiter/window.py`.",
                        'flawed_files': {'limiter/window.py': _ALLOW_N_FLAWED}}},
]


def _resolve(ex):
    from . import spec as S
    for f in ex['findings']:
        f['locations'] = [{'path': p, 'start': w[0], 'end': w[1]} for p, a in f.pop('anchors', []) if (w := S.locate(ex['files'], p, a))]
        assert f['locations'], (ex['title'], f['id'])
    return ex


def pick(mode, category=None, seen=()):
    from . import spec as S
    pool = [e for e in CURATED if e['mode'] == mode and (category is None or e['category'] == category)] or [e for e in CURATED if e['mode'] == mode]
    fresh = [e for e in pool if e['title'] not in seen]
    if not fresh:   # this category's hand-written ones are used up: a different unseen one beats repeating one just done
        compat = (lambda e: (e['category'] in S.EXECUTABLE) == (category in S.EXECUTABLE)) if category else (lambda e: True)
        fresh = [e for e in CURATED if e['mode'] == mode and compat(e) and e['title'] not in seen] or pool
    ex = _resolve(copy.deepcopy(fresh[0 if len(fresh) == 1 else secrets.randbelow(len(fresh))]))
    ex.update(id='ex_' + secrets.token_hex(8), created_at=time.time())
    return ex
