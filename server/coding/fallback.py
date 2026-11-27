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

_GIFT = {
    'README.md': "# giftcards\n\nRedeems gift card balances against orders at checkout. Checkout calls the redemption endpoint once per order;\nfinance reconciles card balances against the ledger service every night.\n",
    'giftcards/api/Response.java': '''package giftcards.api;

public record Response(int status, Object body) {
    static Response ok(Object body) {
        return new Response(200, body);
    }

    static Response badRequest(String message) {
        return new Response(400, message);
    }

    static Response conflict(String message) {
        return new Response(409, message);
    }

    static Response unavailable(String message) {
        return new Response(503, message);
    }
}
''',
    'giftcards/api/RedemptionController.java': '''package giftcards.api;

import giftcards.ledger.LedgerUnavailableException;
import giftcards.model.Redemption;
import giftcards.service.InsufficientBalanceException;
import giftcards.service.RedemptionService;

public class RedemptionController {
    private final RedemptionService service;

    public RedemptionController(RedemptionService service) {
        this.service = service;
    }

    /** POST /cards/{cardId}/redemptions with {orderId, amountPence}. */
    public Response redeem(String cardId, String orderId, long amountPence) {
        if (amountPence <= 0) {
            return Response.badRequest("amount must be positive");
        }
        try {
            Redemption redemption = service.redeem(cardId, orderId, amountPence);
            return Response.ok(redemption);
        } catch (InsufficientBalanceException e) {
            return Response.conflict(e.getMessage());
        } catch (LedgerUnavailableException e) {
            return Response.unavailable("try again shortly");
        }
    }
}
''',
    'giftcards/service/RedemptionService.java': '''package giftcards.service;

import giftcards.ledger.LedgerClient;
import giftcards.model.Card;
import giftcards.model.Redemption;
import giftcards.store.CardRepository;

import java.time.Clock;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class RedemptionService {
    private final CardRepository cards;
    private final LedgerClient ledger;
    private final Clock clock;
    private final Map<String, Object> cardLocks = new ConcurrentHashMap<>();
    private final Map<String, Redemption> byOrder = new ConcurrentHashMap<>();

    public RedemptionService(CardRepository cards, LedgerClient ledger, Clock clock) {
        this.cards = cards;
        this.ledger = ledger;
        this.clock = clock;
    }

    /** Takes amountPence off the card for an order. Calling it again for the same order returns the first result. */
    public Redemption redeem(String cardId, String orderId, long amountPence) {
        Redemption earlier = byOrder.get(orderId);
        if (earlier != null) {
            return earlier;
        }
        Object lock = cardLocks.computeIfAbsent(cardId, id -> new Object());
        synchronized (lock) {
            Card card = cards.find(cardId)
                    .orElseThrow(() -> new IllegalArgumentException("unknown card " + cardId));
            if (card.balancePence() < amountPence) {
                throw new InsufficientBalanceException(cardId, card.balancePence(), amountPence);
            }
            cards.save(card.withBalance(card.balancePence() - amountPence));
            ledger.record(cardId, orderId, -amountPence);
            Redemption redemption = new Redemption(orderId, cardId, amountPence, clock.instant());
            byOrder.put(orderId, redemption);
            return redemption;
        }
    }
}
''',
    'giftcards/service/InsufficientBalanceException.java': '''package giftcards.service;

public class InsufficientBalanceException extends RuntimeException {
    public InsufficientBalanceException(String cardId, long balancePence, long wantedPence) {
        super("card " + cardId + " has " + balancePence + "p, order needs " + wantedPence + "p");
    }
}
''',
    'giftcards/store/CardRepository.java': '''package giftcards.store;

import giftcards.model.Card;

import java.util.Optional;

public interface CardRepository {
    Optional<Card> find(String cardId);

    void save(Card card);
}
''',
    'giftcards/store/InMemoryCardRepository.java': '''package giftcards.store;

import giftcards.model.Card;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

public class InMemoryCardRepository implements CardRepository {
    private final Map<String, Card> cards = new ConcurrentHashMap<>();

    @Override
    public Optional<Card> find(String cardId) {
        return Optional.ofNullable(cards.get(cardId));
    }

    @Override
    public void save(Card card) {
        cards.put(card.id(), card);
    }
}
''',
    'giftcards/ledger/LedgerClient.java': '''package giftcards.ledger;

/** The finance ledger service. Finance expects one entry for every change to a card's balance. */
public interface LedgerClient {
    void record(String cardId, String reference, long deltaPence);
}
''',
    'giftcards/ledger/LedgerUnavailableException.java': '''package giftcards.ledger;

public class LedgerUnavailableException extends RuntimeException {
    public LedgerUnavailableException(String message) {
        super(message);
    }
}
''',
    'giftcards/model/Card.java': '''package giftcards.model;

public record Card(String id, long balancePence) {
    public Card withBalance(long balancePence) {
        return new Card(id, balancePence);
    }
}
''',
    'giftcards/model/Redemption.java': '''package giftcards.model;

import java.time.Instant;

public record Redemption(String orderId, String cardId, long amountPence, Instant at) {
}
''',
}

_HOLDS = {
    'README.md': "# holds\n\nHolds cinema seats for a customer while they finish checking out. A hold takes a small card deposit and lasts ten\nminutes; a scheduler calls `releaseExpired` every minute to free the seats of holds that ran out.\n",
    'holds/HoldHandler.kt': '''package holds

data class HoldRequest(val customerId: String, val seats: List<String>)

data class HttpResponse(val status: Int, val body: Any?)

class HoldHandler(private val service: HoldService) {

    /** POST /shows/{showId}/holds with {customerId, seats}. */
    fun hold(showId: String, request: HoldRequest): HttpResponse =
        when (val result = service.hold(showId, request.customerId, request.seats)) {
            is HoldResult.Held -> HttpResponse(201, result.hold)
            is HoldResult.Taken -> HttpResponse(409, "seats already taken: ${result.seats.joinToString()}")
            HoldResult.PaymentDeclined -> HttpResponse(402, "card declined")
        }
}
''',
    'holds/HoldService.kt': '''package holds

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

data class Hold(val id: String, val showId: String, val customerId: String, val seats: List<String>, val expiresAt: Instant)

sealed interface HoldResult {
    data class Held(val hold: Hold) : HoldResult
    data class Taken(val seats: List<String>) : HoldResult
    data object PaymentDeclined : HoldResult
}

class HoldService(
    private val seats: SeatRepository,
    private val payments: PaymentClient,
    private val clock: Clock = Clock.systemUTC(),
    private val ttl: Duration = Duration.ofMinutes(10),
) {
    private val lock = ReentrantLock()
    private val holds = ConcurrentHashMap<String, Hold>()

    fun hold(showId: String, customerId: String, wanted: List<String>): HoldResult {
        require(wanted.isNotEmpty()) { "no seats requested" }
        val hold = lock.withLock {
            val taken = seats.statusOf(showId, wanted).filterValues { it != SeatStatus.FREE }.keys
            if (taken.isNotEmpty()) return HoldResult.Taken(taken.sorted())
            seats.mark(showId, wanted, SeatStatus.HELD)
            Hold(UUID.randomUUID().toString(), showId, customerId, wanted, clock.instant() + ttl)
        }
        val authorised = payments.authorise(customerId, deposit(wanted.size))
        if (!authorised) {
            seats.mark(showId, wanted, SeatStatus.FREE)
            return HoldResult.PaymentDeclined
        }
        holds[hold.id] = hold
        return HoldResult.Held(hold)
    }

    /** Called every minute by the scheduler: frees the seats of holds that have expired. */
    fun releaseExpired() {
        val now = clock.instant()
        holds.values.filter { it.expiresAt <= now }.forEach { expired ->
            seats.mark(expired.showId, expired.seats, SeatStatus.FREE)
            holds.remove(expired.id)
        }
    }

    private fun deposit(seatCount: Int) = DEPOSIT_PENCE * seatCount

    companion object {
        const val DEPOSIT_PENCE = 200L
    }
}
''',
    'holds/Seats.kt': '''package holds

enum class SeatStatus { FREE, HELD, SOLD }

interface SeatRepository {
    fun statusOf(showId: String, seatIds: List<String>): Map<String, SeatStatus>
    fun mark(showId: String, seatIds: List<String>, status: SeatStatus)
}

class InMemorySeatRepository(layout: Map<String, List<String>>) : SeatRepository {
    private val seats: MutableMap<String, MutableMap<String, SeatStatus>> =
        layout.mapValues { (_, ids) -> ids.associateWith { SeatStatus.FREE }.toMutableMap() }.toMutableMap()

    override fun statusOf(showId: String, seatIds: List<String>): Map<String, SeatStatus> {
        val show = seats[showId] ?: error("unknown show $showId")
        return seatIds.associateWith { show[it] ?: SeatStatus.SOLD }
    }

    override fun mark(showId: String, seatIds: List<String>, status: SeatStatus) {
        val show = seats.getValue(showId)
        seatIds.forEach { show[it] = status }
    }
}
''',
    'holds/Payments.kt': '''package holds

/** The payments service. Throws PaymentUnavailableException when it cannot be reached. */
interface PaymentClient {
    fun authorise(customerId: String, amountPence: Long): Boolean
}

class PaymentUnavailableException(message: String) : RuntimeException(message)
''',
}

_FOUR = ("\n\n1. Trace this request from where it enters to where it returns: which functions run, in which order, across which files.\n"
         "2. What state is shared, between which components or requests, and what protects it?\n")

WALKTHROUGHS = [
    {**_BASE, 'category': 'walkthrough', 'language': 'java', 'difficulty': 2, 'skills': ['transactions', 'retries'], 'archetype': 'a payment ledger with idempotency keys',
     'title': 'Gift card redemption',
     'task': "Checkout pays for part of order `order-77` with gift card `GC-1001`, which has a balance of 4000p. It calls "
             "`RedemptionController.redeem(\"GC-1001\", \"order-77\", 1500)`." + _FOUR +
             "3. What happens if the call to the ledger client throws `LedgerUnavailableException`? What does checkout see, and what happens when it retries the same order?\n"
             "4. Describe the test you'd write to pin that behaviour down: its setup, the failure you'd inject and what it asserts.",
     'files': _GIFT, 'editable': [],
     'findings': [
         {'id': 'f1', 'part': 'trace', 'key': True, 'text': 'The controller rejects a non-positive amount, then calls RedemptionService.redeem. That checks byOrder for an earlier result, takes the per-card lock, loads the card, checks the balance, saves the card with 1500p less, records a ledger entry of -1500, stores the Redemption in byOrder and returns it; the controller answers 200 with it.',
          'anchors': [('giftcards/service/RedemptionService.java', '            cards.save(card.withBalance(card.balancePence() - amountPence));\n            ledger.record(cardId, orderId, -amountPence);')]},
         {'id': 'f2', 'part': 'state', 'key': True, 'text': 'One RedemptionService serves every request, so its byOrder and cardLocks maps (ConcurrentHashMaps) are shared, as is the repository\'s map of cards. Redemptions on the same card are serialised by synchronized on a lock object made once per card with computeIfAbsent.',
          'anchors': [('giftcards/service/RedemptionService.java', '        Object lock = cardLocks.computeIfAbsent(cardId, id -> new Object());\n        synchronized (lock) {')]},
         {'id': 'f3', 'part': 'state', 'key': False, 'text': 'The duplicate check reads byOrder before taking the lock, so two simultaneous requests for the same order can both pass it and both debit. byOrder also lives only in memory, so a restart forgets which orders were redeemed.',
          'anchors': [('giftcards/service/RedemptionService.java', '        Redemption earlier = byOrder.get(orderId);')]},
         {'id': 'f4', 'part': 'failure', 'key': True, 'text': 'The new balance is saved before the ledger call. If record throws, the card is left at 2500p with no ledger entry and nothing in byOrder, and the controller turns the exception into a 503 "try again shortly".',
          'anchors': [('giftcards/service/RedemptionService.java', '            ledger.record(cardId, orderId, -amountPence);'), ('giftcards/api/RedemptionController.java', '        } catch (LedgerUnavailableException e) {\n            return Response.unavailable("try again shortly");')]},
         {'id': 'f5', 'part': 'failure', 'key': True, 'text': 'When checkout retries order-77, byOrder has no entry, so the card is debited again (2500p to 1000p): the customer pays 3000p for a 1500p order, and the ledger has one entry for two debits, which the nightly reconciliation will flag.',
          'anchors': [('giftcards/service/RedemptionService.java', '        if (earlier != null) {\n            return earlier;')]},
         {'id': 'f6', 'part': 'test', 'key': True, 'text': 'A test builds the service with the in-memory repository holding GC-1001 at 4000p and a fake LedgerClient that throws LedgerUnavailableException on its first call and records entries after that. It redeems 1500p (expecting the 503 or the exception), retries the same order, and asserts the balance is 2500p and the ledger has exactly one entry. It fails on this code (the balance is 1000p).',
          'anchors': [('giftcards/ledger/LedgerClient.java', '    void record(String cardId, String reference, long deltaPence);')]}],
     'rubric': ['Traces controller, service, repository and ledger calls in order', 'Names the shared maps, the shared repository and the per-card lock', 'Explains that the balance is saved before the ledger call, so a failure leaves a debit with no entry', 'Explains that the retry debits a second time because byOrder was never written', 'Describes a test with a failing fake ledger that asserts the balance and the ledger after a retry'],
     'hints': ['Follow redeem line by line and note which calls change something that outlives the request.', 'Look at the order of the save, the ledger call and the write to byOrder.', 'After the ledger throws, what has been saved, and what will the duplicate check find when checkout retries?'],
     'review': {'expected_behaviour': 'One debit and one ledger entry per order, however many times checkout retries.',
                'execution_path': '1. RedemptionController.redeem validates the amount. 2. RedemptionService.redeem checks byOrder. 3. It takes the per-card lock. 4. It loads the card and checks the balance. 5. It saves the reduced balance. 6. It records the ledger entry. 7. It stores the Redemption in byOrder and returns it. 8. The controller answers 200.',
                'root_cause': 'Saving the balance, writing the ledger entry and remembering the order are three separate steps with no undo, and the step that makes a retry safe (byOrder.put) comes last. A ledger failure leaves a debit with no entry, and the retry debits again.',
                'interactions': 'The 503 tells checkout to retry, and the idempotency map looks like it makes that safe, but it is only written on success.'},
     'model_answer': 'The controller checks the amount is positive and calls RedemptionService.redeem. That looks up order-77 in byOrder, finds nothing, takes the lock object for GC-1001 from cardLocks and synchronises on it. Inside, it loads the card, checks 4000p covers 1500p, saves the card at 2500p, records a ledger entry of -1500, stores a Redemption in byOrder and returns it, and the controller answers 200.\n\n'
                     'All requests share one service, so byOrder and cardLocks are shared ConcurrentHashMaps, and the repository\'s card map is shared too. The per-card synchronized block stops two redemptions on the same card interleaving. The duplicate check runs before the lock, though, so two simultaneous requests for one order could both get through, and byOrder is lost on a restart.\n\n'
                     'If the ledger call throws, the card has already been saved at 2500p, there is no ledger entry, and byOrder was never written. The controller returns 503, so checkout retries. The retry finds nothing in byOrder and debits again, leaving 1000p: the customer has paid twice and the ledger has one entry for two debits.\n\n'
                     "I'd test it with the in-memory repository holding the card at 4000p and a fake ledger that throws on the first call and records after that. Redeem 1500p, expect the failure, redeem again for the same order, then assert the balance is 2500p and the ledger has exactly one entry. Today it fails with 1000p. A fix would record the ledger entry first, or restore the balance when the ledger call fails, and write byOrder inside the lock.",
     'fix_summary': ''},
    {**_BASE, 'category': 'walkthrough', 'language': 'kotlin', 'difficulty': 2, 'skills': ['error-handling', 'state'], 'archetype': 'an inventory reservation service',
     'title': 'Cinema seat holds',
     'task': "A customer holds two seats while they finish checking out. The booking page calls "
             "`HoldHandler.hold(\"show-12\", HoldRequest(\"cust-9\", listOf(\"F7\", \"F8\")))`, and both seats are free." + _FOUR +
             "3. What happens if the call to the payment client throws `PaymentUnavailableException`? What does the customer see, and what state are F7 and F8 in straight away and ten minutes later?\n"
             "4. Describe the test you'd write to pin that behaviour down: its setup, the failure you'd inject and what it asserts.",
     'files': _HOLDS, 'editable': [],
     'idioms': [
         {'kotlin': 'when (val result = service.hold(...)) { is HoldResult.Held -> ... }', 'java': 'a switch with pattern matching over a sealed interface, or an instanceof chain', 'note': 'Binds the result once and branches on its type; because HoldResult is sealed, the compiler checks every case is covered.'},
         {'kotlin': 'sealed interface HoldResult { data class Held(...) : HoldResult; data object PaymentDeclined : HoldResult }', 'java': 'a sealed interface with records, and a singleton for the case with no data', 'note': 'A closed set of results; data object is a single instance with a readable toString.'},
         {'kotlin': 'data class Hold(val id: String, ...)', 'java': 'record Hold(String id, ...)', 'note': 'An immutable value with equals, hashCode, toString and copy generated.'},
         {'kotlin': 'lock.withLock { ... return HoldResult.Taken(...) }', 'java': 'lock.lock(); try { ... return ...; } finally { lock.unlock(); }', 'note': 'Runs the block holding the lock and always releases it. withLock is inline, so return leaves hold() itself, not just the block.'},
         {'kotlin': 'seats[showId] ?: error("unknown show $showId")', 'java': 'var show = seats.get(showId); if (show == null) throw new IllegalStateException(...)', 'note': 'The Elvis operator ?: uses the right-hand side when the left is null; error() throws IllegalStateException.'},
         {'kotlin': 'seatIds.associateWith { show[it] ?: SeatStatus.SOLD }', 'java': 'seatIds.stream().collect(toMap(id -> id, id -> show.getOrDefault(id, SOLD)))', 'note': 'Builds a map from each element to a computed value; it is the lambda\'s implicit parameter.'},
         {'kotlin': 'private val clock: Clock = Clock.systemUTC()', 'java': 'an extra constructor overload that passes the default', 'note': 'A constructor parameter with a default value; callers can leave it out or pass it by name.'},
         {'kotlin': 'companion object { const val DEPOSIT_PENCE = 200L }', 'java': 'static final long DEPOSIT_PENCE = 200L;', 'note': 'Members that belong to the class rather than an instance.'}],
     'findings': [
         {'id': 'f1', 'part': 'trace', 'key': True, 'text': 'HoldHandler.hold calls HoldService.hold, which requires at least one seat, then under the lock reads the seats\' status, finds none taken, marks F7 and F8 HELD and builds a Hold expiring in ten minutes. Outside the lock it asks the payment client to authorise a 400p deposit (200p a seat), stores the hold in holds and returns Held; the handler answers 201 with the hold.',
          'anchors': [('holds/HoldService.kt', '            seats.mark(showId, wanted, SeatStatus.HELD)'), ('holds/HoldHandler.kt', '            is HoldResult.Held -> HttpResponse(201, result.hold)')]},
         {'id': 'f2', 'part': 'state', 'key': True, 'text': 'Seat status lives in the repository, shared by every request; holds is a ConcurrentHashMap in the one HoldService. The ReentrantLock makes the check-then-mark atomic, so two customers cannot both hold the same free seat.',
          'anchors': [('holds/HoldService.kt', '        val hold = lock.withLock {')]},
         {'id': 'f3', 'part': 'state', 'key': False, 'text': 'The repository uses plain mutable maps, which are not thread-safe, yet the declined path and releaseExpired write to it outside the lock, so they can race with a hold in progress.',
          'anchors': [('holds/Seats.kt', '        seatIds.forEach { show[it] = status }')]},
         {'id': 'f4', 'part': 'failure', 'key': True, 'text': 'The seats are marked HELD before the payment call. If authorise throws, nothing catches it: the seats stay HELD, the hold is never added to holds, and the exception escapes the handler, so the customer gets a server error rather than one of the three answers.',
          'anchors': [('holds/HoldService.kt', '        val authorised = payments.authorise(customerId, deposit(wanted.size))')]},
         {'id': 'f5', 'part': 'failure', 'key': True, 'text': 'releaseExpired only frees seats of holds in the holds map, and this hold never got there, so F7 and F8 stay HELD after ten minutes and for good (until a restart). A retry by the same customer is told the seats are already taken (409).',
          'anchors': [('holds/HoldService.kt', '        holds.values.filter { it.expiresAt <= now }.forEach { expired ->'), ('holds/HoldService.kt', '        holds[hold.id] = hold')]},
         {'id': 'f6', 'part': 'test', 'key': True, 'text': 'A test builds HoldService with an InMemorySeatRepository for show-12, a fake PaymentClient that throws PaymentUnavailableException, and a clock it can move. It calls hold and expects the exception, then asserts F7 and F8 are FREE (or, moving the clock past ten minutes and calling releaseExpired, that they are FREE then). Both fail on this code.',
          'anchors': [('holds/Payments.kt', '    fun authorise(customerId: String, amountPence: Long): Boolean')]}],
     'rubric': ['Traces the handler, the locked check-and-mark, the payment call and the return', 'Names where seat state and holds live and what the lock protects', 'Explains that a payment exception leaves the seats HELD with no hold recorded', 'Explains why expiry never frees them and what a retry sees', 'Describes a test with a throwing fake payment client that asserts the seats end up free'],
     'hints': ['Follow HoldService.hold and note which steps happen inside withLock and which after it.', 'Compare what the declined path undoes with what happens when authorise throws instead of returning false.', 'Which holds does releaseExpired look at, and when is a hold added to that map?'],
     'review': {'expected_behaviour': 'Seats held for a failed hold should be freed, at once or when the hold expires.',
                'execution_path': '1. HoldHandler.hold calls HoldService.hold. 2. require checks seats were asked for. 3. Under the lock, statusOf finds both FREE. 4. mark sets them HELD and a Hold is built. 5. authorise is called for 400p. 6. The hold is put in holds. 7. Held is returned and the handler answers 201.',
                'root_cause': 'The seats are marked HELD before the payment call, and the only undo is for a declined card. An exception skips both the undo and holds[hold.id] = hold, so expiry never sees the hold and the seats are held for good.',
                'interactions': 'The declined path looks like it handles failure, but it handles a false return, not an exception; and expiry looks like a safety net, but it only knows about holds that succeeded.'},
     'model_answer': 'The handler calls HoldService.hold with show-12, cust-9 and F7, F8. require checks the list is not empty. Inside lock.withLock it reads both seats\' status from the repository, finds them FREE, marks them HELD and builds a Hold that expires in ten minutes. After the lock it asks the payment client to authorise a 400p deposit. On success the hold goes into the holds map and Held comes back; the when in the handler turns that into a 201 with the hold.\n\n'
                     'Seat status is in the repository, shared by every request, and holds is a ConcurrentHashMap on the single service. The ReentrantLock makes the check and the mark one step, so two customers cannot hold the same seat. The repository\'s maps are not thread-safe, though, and the decline path and releaseExpired write to them outside the lock.\n\n'
                     'If authorise throws, nothing catches it. The seats are already HELD, the decline path only runs on a false return, and holds[hold.id] = hold is skipped. The exception escapes the handler, so the customer sees a server error. releaseExpired only frees seats for holds in the map, so ten minutes later F7 and F8 are still HELD, and stay that way. If the customer retries they get a 409 saying the seats are taken.\n\n'
                     "I'd test it with an InMemorySeatRepository for show-12, a fake PaymentClient that throws PaymentUnavailableException, and a clock I can move. Call hold and expect the exception, then assert F7 and F8 are FREE, or move the clock past ten minutes, call releaseExpired and assert they are FREE. Both fail today.",
     'fix_summary': ''},
]

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
    *WALKTHROUGHS,
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


def pick(mode, category=None, seen=(), language=None, strict=False):
    """A curated exercise, preferring one in the language you chose (`language`, a LANGUAGE_CHOICES value). `strict`:
    only an unseen one in that language, else None, so a generated one in another language is not passed over for a repeat."""
    from . import spec as S
    want = lambda e: (S.target_language(language, e['category']) or e['language']) == e['language']
    if strict:
        pool = [e for e in CURATED if e['mode'] == mode and category in (None, e['category']) and want(e) and e['title'] not in seen]
        if not pool:
            return None
        return _fresh(pool)
    pool = [e for e in CURATED if e['mode'] == mode and (category is None or e['category'] == category)] or [e for e in CURATED if e['mode'] == mode]
    fresh = [e for e in pool if e['title'] not in seen]
    if not fresh:
        # An explicit repair request must not turn into a read-only exercise when the fallback was seen.
        fresh = pool if category else [e for e in CURATED if e['mode'] == mode and e['title'] not in seen] or pool
    return _fresh([e for e in fresh if want(e)] or fresh)


def _fresh(pool):
    ex = _resolve(copy.deepcopy(pool[0 if len(pool) == 1 else secrets.randbelow(len(pool))]))
    ex.update(id='ex_' + secrets.token_hex(8), created_at=time.time())
    return ex
