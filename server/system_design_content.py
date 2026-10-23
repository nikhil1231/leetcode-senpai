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

# Casebook practice cases (each has a walkthrough lesson of the same name).
CASES.update({
    'feed': {
        'title': 'A social news feed', 'family': 'Fan-out and ranking', 'name': 'News feed',
        'metric': '100k feed loads / sec', 'tags': 'Fan-out · caching · ranking',
        'summary': 'Post, follow and read a ranked home timeline in under 200 ms.',
        'prompt': 'Design the home feed for a social app. Users post text and images, follow other users, and open a ranked feed of posts from accounts they follow.',
        'requirements': [
            '300M daily active users; each opens the feed about 10 times a day; 0.5 posts per user per day.',
            'Feed p99 under 200 ms excluding image download. Posts reach followers within about 5 seconds; authors see their own post immediately.',
            'Some accounts have tens of millions of followers. Deleted or privatised posts must stop appearing promptly.',
            'Likes and comment counts may lag by seconds but must not double count a user.',
        ],
        'skills': ['capacity', 'reads', 'requirements', 'operations'],
        'followups': ['What happens when an account with 40M followers posts?', 'How do you paginate a ranked feed without duplicates?', 'A timeline cache shard is lost — what do users see?'],
        'rubric': 'Check estimates leading to precomputed timelines, a hybrid fan-out that handles celebrities, ID-only timelines hydrated at read time with delete/privacy filtering, a ranking step with a latency budget and fallback, idempotent likes with non-hot-row counters, media via object storage and CDN, and read-your-writes for authors. Accept pure pull with strong justification at stated scale only if read cost is addressed. Do not require a specific ML ranking design.',
    },
    'chat': {
        'title': 'A chat system', 'family': 'Real-time delivery', 'name': 'Chat',
        'metric': '230k messages / sec', 'tags': 'Ordering · delivery · presence',
        'summary': 'One-to-one and group chat with receipts, presence and offline delivery.',
        'prompt': 'Design a messaging service with 1:1 and group conversations (up to 1,000 members), delivery and read receipts, presence, history across devices, and push notifications for offline users.',
        'requirements': [
            '500M daily active users sending about 40 messages each per day; about 30% online at peak.',
            'Once the sender sees "sent", the message must never be lost. Order is preserved within a conversation.',
            'Online recipients receive messages within 500 ms p99. Offline users are notified and catch up when they reconnect.',
            'Users have several devices; history and read state are consistent across them.',
        ],
        'skills': ['retries', 'requirements', 'capacity', 'operations'],
        'followups': ['A send times out on a flaky network. What happens when the client retries?', 'How do messages reach a user connected to a different gateway?', 'How does a 1,000-member group change your delivery design?'],
        'rubric': 'Check persist-before-ack with a server-assigned per-conversation sequence and client message IDs for idempotent retries, a gateway tier plus pub/sub routing, resume-by-sequence on reconnect with gap detection, monotonic receipt counters, presence as heartbeats with TTL and scoped fan-out, partitioned message storage with bounded partitions, and push for offline users. Client timestamps as ordering, or delivering before persisting, are correctness problems.',
    },
    'ratelimiter': {
        'title': 'A distributed rate limiter', 'family': 'Shared counters', 'name': 'Rate limiter',
        'metric': '2M checks / sec', 'tags': 'Algorithms · atomicity · failure modes',
        'summary': 'Enforce per-customer API limits across a fleet of gateways.',
        'prompt': 'Design a rate-limiting service used by an API gateway fleet to enforce per-API-key and per-IP limits, with different limits per plan and per endpoint.',
        'requirements': [
            '200 gateway instances; 2M requests/s at peak; 5M API keys.',
            'Limits like "100 requests/s with bursts of 200" per key, and stricter per-endpoint limits; changes to a plan apply within a minute.',
            'The limiter adds under 2 ms p99 to a request. Over-limit requests get 429 with Retry-After.',
            'A limiter outage must not take the whole API down, but login and SMS endpoints must stay protected.',
        ],
        'skills': ['capacity', 'concurrency', 'operations', 'requirements'],
        'followups': ['Why not count per gateway instance?', 'What happens when the counter store is unavailable?', 'How do you handle one key sending 50% of all traffic?'],
        'rubric': 'Check an algorithm choice justified by burst semantics (token bucket or sliding window), atomic distributed counting (Lua or equivalent) or a local-plus-sync hybrid with stated error, sharding of counter keys, latency budget, limit configuration distribution, 429 responses with headers, and per-endpoint fail-open versus fail-closed decisions. Per-instance counters alone multiply the limit and need correction.',
    },
    'notifications': {
        'title': 'A notification service', 'family': 'Fan-out and delivery', 'name': 'Notifications',
        'metric': '1B notifications / day', 'tags': 'Queues · preferences · providers',
        'summary': 'Send push, email and SMS notifications reliably, respecting preferences.',
        'prompt': 'Design a service other teams call to notify users by push, email, SMS and in-app inbox, respecting user preferences, quiet hours and rate limits.',
        'requirements': [
            '1B notifications a day, with marketing campaigns sending 50M at once; transactional messages (password resets, OTPs) must arrive within seconds.',
            'Each notification is sent at most once per channel to a user, even if callers retry.',
            'Users can opt out per category and channel; quiet hours apply to non-urgent messages.',
            'Third-party providers (APNs, FCM, an email provider, an SMS provider) have rate limits and outages.',
        ],
        'skills': ['retries', 'capacity', 'operations', 'requirements'],
        'followups': ['How do you stop a 50M marketing campaign delaying password resets?', 'The SMS provider is down for 20 minutes — what happens?', 'How do you avoid sending the same push twice?'],
        'rubric': 'Check an accept-and-queue API with idempotency keys, separate priority lanes for transactional and bulk traffic, preference and quiet-hour evaluation, per-provider rate limiting with backoff and circuit breakers, retries with dead-lettering, delivery status tracking, and campaign fan-out done in batches. Exactly-once claims must rest on deduplication, not on the queue.',
    },
    'typeahead': {
        'title': 'Search autocomplete', 'family': 'Low-latency reads', 'name': 'Typeahead',
        'metric': '200k queries / sec', 'tags': 'Tries · precomputation · caching',
        'summary': 'Suggest the top completions for a prefix within tens of milliseconds.',
        'prompt': 'Design search-box autocomplete: as the user types, return the 10 most popular completions for the current prefix, updated with trending queries.',
        'requirements': [
            '200k suggestion requests/s at peak (several per search as users type).',
            'p99 under 50 ms end to end; suggestions reflect trends within about an hour.',
            'Offensive or legally blocked suggestions must be removable within minutes.',
            'Support personalisation lightly (recent searches) without per-user indexes for everyone.',
        ],
        'skills': ['reads', 'capacity', 'operations', 'requirements'],
        'followups': ['How do you update popularity without rebuilding everything?', 'How do you remove a bad suggestion immediately?', 'What do you cache, and where?'],
        'rubric': 'Check precomputed top-k per prefix (trie or prefix table) built offline from query logs with periodic or streaming updates, sharding by prefix with hot-prefix handling, edge/browser caching of short prefixes, client debouncing, a blocklist filter applied at serve time for fast removal, and a small personal layer merged at read time. Computing top-k by scanning at request time does not meet the latency target.',
    },
    'video': {
        'title': 'Video upload and streaming', 'family': 'Media pipelines', 'name': 'Video platform',
        'metric': '500 hours uploaded / min', 'tags': 'Transcoding · CDN · storage tiers',
        'summary': 'Upload, transcode and stream video worldwide with adaptive bitrate.',
        'prompt': 'Design a video platform where creators upload videos and viewers stream them on any device, with view counts and resumable playback.',
        'requirements': [
            '500 hours of video uploaded per minute; billions of views a day, mostly of a small fraction of videos.',
            'Playback starts within 2 seconds and adapts to network quality.',
            'Uploads of multi-GB files survive network interruptions; a video becomes watchable within minutes of upload.',
            'View counts may lag but should not be grossly inflated by bots or retries.',
        ],
        'skills': ['capacity', 'operations', 'reads', 'retries'],
        'followups': ['Walk through what happens between upload completing and the video being watchable.', 'Where do video bytes come from when a viewer presses play?', 'How do you control storage cost for long-tail videos?'],
        'rubric': 'Check resumable multipart uploads to object storage, an asynchronous DAG of transcoding jobs into multiple renditions and segmented HLS/DASH, idempotent retry-safe jobs, CDN delivery with adaptive bitrate manifests, metadata in a database separate from bytes, popularity-based storage tiering, and async view counting with deduplication. Streaming bytes through application servers is a scaling flaw.',
    },
    'rides': {
        'title': 'A ride-hailing service', 'family': 'Geospatial matching', 'name': 'Ride hailing',
        'metric': '200k location updates / sec', 'tags': 'Geo-indexing · matching · state machines',
        'summary': 'Match riders to nearby drivers and track trips in real time.',
        'prompt': 'Design the core of a ride-hailing app: drivers report locations, riders request rides, the system matches a nearby driver, and both track the trip.',
        'requirements': [
            '800k drivers online at peak, each sending a location every 4 seconds; 20k ride requests per minute in big cities at peak.',
            'Matching completes within a few seconds; a driver is never assigned two active trips.',
            'Trip state (requested, accepted, en route, in progress, completed) is durable and survives server failures.',
            'Riders see the driver approach on a map with updates every few seconds.',
        ],
        'skills': ['concurrency', 'capacity', 'reads', 'requirements'],
        'followups': ['How do you find the nearest available drivers?', 'Two riders are matched to the same driver at once — what stops it?', 'A city has a concert ending: what breaks first?'],
        'rubric': 'Check an in-memory geo index (cells such as H3/geohash) fed by location updates with TTLs and sharded by region, matching via expanding rings and an atomic driver assignment (conditional update or offer/accept with leases), a durable trip state machine, real-time location push to riders, and separation of ephemeral location data from durable trip records. Storing every location update in the transactional database is a scaling flaw.',
    },
    'kv': {
        'title': 'A distributed key-value store', 'family': 'Storage internals', 'name': 'Key-value store',
        'metric': '1M ops / sec', 'tags': 'Partitioning · replication · quorums',
        'summary': 'Build a Dynamo-style store that stays available through node failures.',
        'prompt': 'Design a distributed key-value store with get(key) and put(key, value) that scales horizontally and tolerates node and zone failures.',
        'requirements': [
            '100 TB of data, 1M operations/s, values up to 1 MB.',
            'Writes stay available when a node or a whole zone fails; tunable consistency per request.',
            'Adding nodes rebalances data without downtime and with limited data movement.',
            'Single-digit millisecond p99 for reads of small values.',
        ],
        'skills': ['concurrency', 'capacity', 'requirements', 'operations'],
        'followups': ['How are keys assigned to nodes, and what moves when you add one?', 'What do R and W mean, and what happens during a partition?', 'How do replicas that missed writes catch up?'],
        'rubric': 'Check consistent hashing with virtual nodes, replication to N distinct nodes across zones, quorum reads and writes with explained R+W>N semantics and caveats, conflict handling (versions/vector clocks or LWW with stated risk), hinted handoff, read repair and anti-entropy, an LSM-style storage engine per node, and failure detection. Claiming linearizability from quorums alone needs qualification.',
    },
    'crawler': {
        'title': 'A web crawler', 'family': 'Large-scale batch', 'name': 'Web crawler',
        'metric': '1B pages / day', 'tags': 'Frontier · politeness · dedupe',
        'summary': 'Crawl billions of pages politely, without duplicates, and keep them fresh.',
        'prompt': 'Design a web crawler that fetches pages for a search index, discovering new URLs from links and refreshing pages as they change.',
        'requirements': [
            '1B pages fetched per day across hundreds of millions of hosts.',
            'Politeness: never more than one request per host every few seconds; respect robots.txt.',
            'Avoid fetching the same URL repeatedly and detect duplicate content.',
            'Important and frequently changing pages are refreshed more often than static ones.',
        ],
        'skills': ['capacity', 'operations', 'retries', 'requirements'],
        'followups': ['How do you enforce per-host politeness across thousands of fetchers?', 'How do you know whether a URL has been seen before?', 'How do you avoid crawler traps?'],
        'rubric': 'Check a URL frontier with prioritisation and per-host queues for politeness, partitioning fetchers by host, robots.txt caching, URL normalisation and a seen-set (Bloom filter plus durable store), content fingerprints for duplicate detection, DNS caching, revisit scheduling by change rate, trap defences (depth and per-host limits), and checkpointing for crash recovery. A single global FIFO queue fails politeness.',
    },
    'payments': {
        'title': 'A payment system', 'family': 'Money movement', 'name': 'Payments',
        'metric': '10k payments / sec', 'tags': 'Idempotency · ledgers · reconciliation',
        'summary': 'Charge customers exactly once and keep a ledger that always balances.',
        'prompt': 'Design the payment backend for an online marketplace: charge buyers through external payment processors, pay out sellers, and handle refunds.',
        'requirements': [
            '10k payment attempts/s at peak; processors respond in 200 ms to 30 s and sometimes time out.',
            'A customer is never charged twice for one order, even with client retries and timeouts.',
            'Every movement of money is recorded in a ledger whose entries always balance, and is auditable.',
            'Processor records and internal records must be reconciled daily; discrepancies are surfaced.',
        ],
        'skills': ['retries', 'concurrency', 'requirements', 'operations'],
        'followups': ['The processor call times out. What do you do?', 'How do you model a refund in the ledger?', 'How do you find payments where your records and the processor disagree?'],
        'rubric': 'Check idempotency keys end to end (client to service to processor), a payment state machine persisted before external calls, handling of unknown outcomes by querying the processor or webhooks rather than blind retries, a double-entry append-only ledger, outbox-driven events, sagas or compensations for multi-step flows, webhook verification and deduplication, and daily reconciliation. Retrying charges without idempotency, or mutable balance rows without a ledger, are correctness failures.',
    },
})

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
