"""Versioned authored cases and focused practice. Public projections omit answers."""
from copy import deepcopy

VERSION = 1
SKILLS = {
    'requirements': 'Scope and guarantees',
    'reads': 'Read paths and freshness',
    'capacity': 'Capacity and bottlenecks',
    'retries': 'Retries and durable work',
    'concurrency': 'Concurrent state changes',
    'operations': 'Recovery and simplicity',
}
FIELDS = {
    'requirements': 'Requirements and assumptions',
    'interfaces': 'APIs and data model',
    'flow': 'Request and data flow',
    'diagram': 'Architecture connections',
    'tradeoffs': 'Decisions and trade-offs',
    'failures': 'Failures, recovery and monitoring',
}
CASES = {
    'links': {
        'title': 'A dependable link service', 'family': 'Read-heavy lookup',
        'summary': 'Create short links, resolve them quickly, and honour changes.',
        'prompt': 'Design a service where authenticated owners create, update and disable short links. Visitors resolve a code to its destination. Explain a complete create and resolve flow before adding scale.',
        'requirements': [
            '10 million active links; 20,000 resolutions/second at peak and 20 writes/second.',
            'A destination change or disable must take effect within 60 seconds everywhere.',
            'Acknowledged creations must survive an application-server crash.',
            'Owners may modify only their own links. A disabled or unknown link must not redirect.',
        ],
        'skills': ['requirements', 'reads', 'capacity', 'operations'],
        'followups': ['Trace a cache miss, from request to response.',
                      'What happens when the cache is unavailable?',
                      'How would your design change if disables had to take effect immediately?'],
        'rubric': 'Accept a relational or key-value source of truth with justified access patterns. Check owner authorization, collision handling, durability before acknowledgement, and a defensible freshness bound including every cache layer. Do not require a cache or sharding without a capacity argument. A 60-second TTL alone needs assumptions about refill races and upstream caches. Immediate disable is a follow-up, not a baseline requirement.',
    },
    'jobs': {
        'title': 'Reliable document processing', 'family': 'Asynchronous processing',
        'summary': 'Accept a document, process it asynchronously, and recover from crashes.',
        'prompt': 'Design a document-processing service. An authenticated user submits a stored document for conversion, receives a job ID, and checks its status. Workers produce an output artifact.',
        'requirements': [
            'Inputs already reside in object storage. Design job submission, execution and status retrieval.',
            'A successful submission response promises that the job will not be silently lost.',
            'Workers can crash at any step and queue messages can be delivered more than once.',
            'Repeated requests with the same user and request ID must return the same logical job. Different payloads with that ID must be rejected.',
            'Peak arrivals are 30 jobs/second; each worker processes 2 jobs/second. Persistent failures must become visible to users and operators.',
        ],
        'skills': ['requirements', 'retries', 'capacity', 'operations'],
        'followups': ['Trace a crash after output creation but before queue acknowledgement.',
                      'What if the database commit succeeds but enqueueing fails?',
                      'Which metric tells you users are waiting too long?'],
        'rubric': 'Check an atomic durable acceptance boundary, consistent job identity, ownership checks, retry-safe output publication, recovery of DB/queue dual writes, bounded retries and observable terminal failure. Accept transactional outbox, durable DB job polling, or another explained recovery mechanism. Do not assume queue deduplication makes external effects exactly once. Fifteen workers merely match peak arrival rate and provide no recovery headroom.',
    },
    'seats': {
        'title': 'Reservations without double booking', 'family': 'Contended state',
        'summary': 'Hold one seat, confirm it once, and handle competing requests.',
        'prompt': 'Design a seat reservation service. A signed-in user can hold an available seat for five minutes and confirm the hold. Payment is out of scope; confirmation is a local state transition.',
        'requirements': [
            'Each seat belongs to one event and can have at most one confirmed reservation.',
            'Many users and multiple application servers may request the same seat concurrently.',
            'Expired holds cannot be confirmed. Only the hold owner may confirm.',
            'Client retries must not create additional reservations or change the result of a completed confirmation.',
            'Browsing may be stale by 10 seconds; hold and confirmation decisions must use authoritative state.',
        ],
        'skills': ['requirements', 'concurrency', 'reads', 'operations'],
        'followups': ['Walk through two users claiming the final seat at the same time.',
                      'What happens if expiry and confirmation race?',
                      'Which components could you remove at modest traffic?'],
        'rubric': 'Check atomic ownership/state/expiry predicates, an authoritative clock assumption, durable confirmation and retry semantics. Accept transactions with appropriate locks, conditional writes, or equivalent explained serialization. A process-local mutex is insufficient across servers; a read-then-write without atomic validation races. Do not require distributed locks or microservices. Separate stale browsing from correctness-critical writes.',
    },
}

LESSONS = {
    'requirements': {
        'title': 'Turn a feature into a guarantee',
        'principle': 'Name the operation, its success promise, and what must remain true when requests overlap or components fail.',
        'worked': 'For a file upload, “fast and reliable” is vague. “After a successful response, the file survives an application-server restart” identifies a durability boundary. Ask which failures and delays the product must tolerate.',
        'question': 'For a reservation, what must remain true even when two users click at the same instant?',
        'repair': 'Write one correctness condition, one measurable quality target, and one explicit out-of-scope feature in your design.',
    },
    'reads': {
        'title': 'Follow a stale value',
        'principle': 'A cache is another copy of state. Specify how long that copy may be used and what happens when it cannot be trusted.',
        'worked': 'A profile picture can be stale for a minute, while an access revocation may need immediate enforcement. Trace the source of truth, cache fill, update, invalidation and downstream caches. A TTL bounds age only under the assumptions of that read and refill protocol.',
        'question': 'If an old read finishes after invalidation, can it repopulate stale data?',
        'repair': 'Annotate each read with its source, allowed staleness and cache-failure behaviour.',
        'source': ['HTTP cache freshness', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control'],
    },
    'capacity': {
        'title': 'Calculate to make a decision',
        'principle': 'Connect each estimate to a bottleneck or capacity decision. State peak load, unit size and headroom assumptions.',
        'worked': 'At 12 tasks/second arriving and 10 completing, backlog grows by 2 each second. Matching arrivals stops growth but does not drain existing work. Recovery requires spare processing capacity or lower arrivals.',
        'question': 'How much spare capacity is needed to drain a backlog of 600 tasks in five minutes?',
        'repair': 'Add one capacity calculation and state the design decision it changes.',
    },
    'retries': {
        'title': 'Find the crash between two writes',
        'principle': 'A retry may follow a successful operation whose response was lost. Keep a stable operation identity and explain how its result and side effects stay consistent.',
        'worked': 'A worker writes an output and crashes before acknowledging its message. Redelivery can repeat the work. A stable job ID and retry-safe publication can preserve one logical output. Recording “done” separately still leaves a crash window; examine both orders.',
        'question': 'If the effect is external, what cooperation or reconciliation does that boundary require?',
        'repair': 'Mark the durable acceptance point and trace retries at each subsequent boundary.',
        'source': ['AWS: retry-safe APIs', 'https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/'],
    },
    'concurrency': {
        'title': 'Make the condition and change atomic',
        'principle': 'Two requests can both observe an available resource. The availability check and ownership change must be coordinated at the authoritative state.',
        'worked': 'Two users read “available”. If each later writes an owner without rechecking atomically, both may believe they won. A conditional update or appropriately locked transaction lets one request change the state; the other observes a conflict.',
        'question': 'Does a lock held inside one application process protect requests handled by another server?',
        'repair': 'Write the exact state, owner and expiry predicates required for confirmation.',
        'source': ['PostgreSQL: row locks', 'https://www.postgresql.org/docs/current/explicit-locking.html'],
    },
    'operations': {
        'title': 'Explain recovery before adding components',
        'principle': 'Every component needs a purpose and a failure story. Prefer the simplest design that meets the stated workload and guarantees.',
        'worked': 'A queue absorbs a short burst but cannot solve permanent overload. Track oldest pending work and processing failures, bound retries, expose terminal errors, and specify how recovery resumes durable work.',
        'question': 'Which user-visible symptom would show that a queue is healthy but its workers are stuck?',
        'repair': 'Remove one unnecessary component, or justify it with a requirement. Add one actionable failure signal.',
    },
}


def exercise(skill, title, prompt, choices, correct, explanation, transfer=False):
    return dict(skill=skill, title=title, prompt=prompt, choices=choices,
                correct=correct, explanation=explanation, transfer=transfer)


EXERCISES = {
    'scope-promise': exercise('requirements', 'A successful response',
        'A service returns “upload complete” before any durable copy exists. The server crashes. Which missing guarantee best explains the loss?',
        ['Durability before acknowledging success', 'More cache capacity', 'A shorter URL'], 0,
        'Define what success promises. If it promises persistence, acknowledgement must follow a durable acceptance boundary.'),
    'scope-transfer': exercise('requirements', 'A different success promise',
        'A report API returns 202 Accepted after durably recording a job, before generating the report. The documented promise is acceptance for processing. Does this alone violate that promise?',
        ['Yes: every successful response requires the report to be finished', 'No: durable acceptance satisfies this stated promise', 'Yes: a cache must contain the report'], 1,
        'Success is operation-specific. Durable acceptance can fulfil an asynchronous contract; completion and terminal failure still need observable states.', True),
    'reads-stale': exercise('reads', 'Different freshness requirements',
        'An item description may lag by a minute. Remaining stock must be authoritative when a purchase is committed. Which read policy fits?',
        ['Use the same minute-old cache for both decisions', 'Cache descriptions; validate stock atomically at purchase', 'Disable all caches in the entire product'], 1,
        'The correctness-critical decision needs authoritative validation. Other reads can use their own freshness budgets.'),
    'reads-transfer': exercise('reads', 'Late cache refill',
        'A read captures old DB value A. A writer commits B and invalidates the cache. The earlier read then fills the cache with A. Can invalidation alone prevent this stale refill?',
        ['Yes, because the writer finished', 'No, the refill also needs coordination or a version/freshness policy', 'Yes, if there are more cache nodes'], 1,
        'The operations overlap. The cache protocol must address an older read completing after invalidation; adding nodes does not order these events.', True),
    'capacity-backlog': exercise('capacity', 'A growing queue',
        'A queue starts empty. Arrivals remain 12 tasks/second and completions remain 10/second for 60 seconds. Ignoring startup effects, how many tasks accumulate?',
        [], '120', 'Backlog grows at 12 − 10 = 2 tasks/second; 2 × 60 = 120.'),
    'capacity-transfer': exercise('capacity', 'Drain the backlog',
        'A photo service has 600 queued tasks and continues receiving 10 tasks/second. What sustained completion rate in tasks/second drains that backlog in 300 seconds?',
        [], '12', 'Spare throughput must be 600 / 300 = 2 tasks/second. Total throughput must be 10 + 2 = 12.', True),
    'retry-crash': exercise('retries', 'Crash after the side effect',
        'A worker performs a side effect, crashes before acknowledging its queue message, and receives the message again. What can happen without retry protection?',
        ['The side effect can happen twice', 'The queue proves the effect never happened', 'Acknowledgement is automatically recovered from the effect'], 0,
        'Message redelivery can repeat the side effect. Explain stable operation identity and the consistency boundary around the effect.'),
    'retry-transfer': exercise('retries', 'Same key, different intent',
        'An export request ID was used for document A. A client reuses that ID for document B. Which policy preserves a clear idempotency contract?',
        ['Silently return A while claiming B was exported', 'Create B and overwrite the old result', 'Reject the mismatched payload for the reused ID'], 2,
        'The same operation identity must not silently refer to different intent. Compare the payload with the saved request contract.', True),
    'concurrency-race': exercise('concurrency', 'Two servers, one seat',
        'Two servers read that seat S is free, then each unconditionally writes its user as owner. What prevents both requests from claiming success?',
        ['An in-process mutex on each server', 'An atomic conditional write or suitable transaction at the authoritative store', 'A longer cache TTL'], 1,
        'Coordinate the check and state change across all writers. Independent process locks cannot serialize this shared state.'),
    'concurrency-transfer': exercise('concurrency', 'Confirm an expiring hold',
        'A hold may expire while its owner confirms it. What must the confirmation state change validate atomically?',
        ['Only that the seat was free earlier', 'Only the user ID in a browser cache', 'Current hold identity, owner, unexpired deadline and eligible state'], 2,
        'Validation must concern current authoritative state and a defined clock, at the transition that confirms ownership.', True),
    'operations-signal': exercise('operations', 'Workers are stuck',
        'A queue accepts messages normally but consumers stop making progress. Which signal most directly captures how long pending users have waited?',
        ['Number of application code files', 'Age of the oldest pending job', 'Whether the queue accepts connections'], 1,
        'Oldest pending age reveals user waiting time even when the queue itself is available.'),
    'operations-transfer': exercise('operations', 'Persistent overload',
        'Incoming work permanently exceeds processing capacity. What does adding a queue alone accomplish?',
        ['It stores growing backlog until another limit is reached', 'It creates additional processing capacity', 'It guarantees a fixed completion latency'], 0,
        'A queue buffers work. Sustained overload requires more capacity, admission control, reduced work, or an explicit rejection/degradation policy.', True),
}


def public_case(key):
    return {k: deepcopy(v) for k, v in CASES[key].items() if k != 'rubric'} | {'id': key, 'version': VERSION}


def public_exercise(key):
    return {k: deepcopy(v) for k, v in EXERCISES[key].items()
            if k not in ('correct', 'explanation')} | {'id': key, 'version': VERSION}


def check_exercise(key, answer):
    item = EXERCISES[key]
    return str(answer).strip().casefold() == str(item['correct']).casefold()
