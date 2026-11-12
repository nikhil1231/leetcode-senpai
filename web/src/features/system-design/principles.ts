// System Design principles: seventeen heuristics in four groups, and the table of hard guarantees and the simpler ones
// that usually replace them. Static content, drawn by PrinciplesPage.

export interface Principle { n: number; title: string; body: string; example: string; ask: string }
export interface PrincipleGroup { id: string; name: string; blurb: string; items: Principle[] }
export interface Swap { hard: string; easier: string; refs: number[] }

export const SWAPS: Swap[] = [
  { hard: "Exactly-once execution", easier: "At-least-once delivery with idempotent handlers", refs: [3, 4] },
  { hard: "Distributed atomic transaction", easier: "Local transaction plus durable recovery (outbox, reconciliation)", refs: [5] },
  { hard: "Shared state guarded by a distributed lock", easier: "One owner per partition of the state", refs: [1, 2] },
  { hard: "Global event ordering", easier: "Ordering per entity (order, account, user)", refs: [10] },
  { hard: "A cache that is never stale", easier: "Bounded staleness plus invalidation", refs: [9, 15] },
  { hard: "Every component always available", easier: "Graceful degradation when one is not", refs: [14] },
  { hard: "No concurrent modifications", easier: "Optimistic concurrency: a version check on write, retry on conflict", refs: [2, 6] },
  { hard: "Every request processed instantly", easier: "Queue it and process it shortly after", refs: [12] },
  { hard: "No failures", easier: "Failures that are detected, contained and recoverable", refs: [13, 14] },
];

export const GROUPS: PrincipleGroup[] = [
  {
    id: "correctness", name: "Correctness", blurb: "Keeping data right when requests overlap, messages repeat and processes crash.",
    items: [
      {
        n: 1, title: "Avoid coordination before making it faster",
        body: "Distributed locks, consensus and synchronous calls between services are slow and bring failure modes of their own. Before building one, check whether ownership can be split so that no two parties ever need to agree.",
        example: "Ten workers updating the same account need a lock between them. Route every update for an account to a single owner (one partition, one consumer, one shard) and the lock is no longer needed.",
        ask: "Can each piece of state have exactly one writer?",
      },
      {
        n: 2, title: "Enforce a guarantee at the smallest boundary that can hold it",
        body: "A rule kept inside one database transaction has far fewer ways to go wrong than the same rule kept across several services. Push each invariant (a rule that must always hold) down to the narrowest component that can enforce it atomically.",
        example: "Unique usernames come from a UNIQUE constraint, not a distributed lock. A check-and-debit is one UPDATE … WHERE balance >= amount, not a read, a check in application code and a separate write.",
        ask: "What is the smallest component that can check and change this in one atomic step?",
      },
      {
        n: 3, title: "Make operations idempotent rather than chasing exactly-once",
        body: "Guaranteeing that something runs exactly once across a network is very hard. If running it twice has the same effect as running it once (idempotent), you no longer need to know whether the first attempt happened, and at-least-once delivery becomes safe.",
        example: "A payment request carries a client-generated idempotency key. The server stores the key with the result and returns the stored result for any repeat. Queue consumers, retries and background jobs use the same pattern.",
        ask: "What happens if this runs twice?",
      },
      {
        n: 4, title: "Treat a timeout as an unknown outcome",
        body: "A timeout means you stopped waiting, not that nothing happened. The operation may have succeeded, failed or still be running, and retrying blindly on that basis is how a customer gets charged twice.",
        example: "After a payment call times out, retry with the same idempotency key, or ask the provider for the outcome before deciding what to do next.",
        ask: "If this call times out, how do I find out what actually happened?",
      },
      {
        n: 5, title: "When two steps can't be atomic, make the gap recoverable",
        body: "You usually can't update your database and call an external API in one transaction. You can durably record what you intend to do, do it, and run a process that finds anything left halfway after a crash and finishes or undoes it.",
        example: "A transactional outbox writes the order and an \"order created\" message in the same local transaction, and a relay publishes the message afterwards. Payment reconciliation and durable workflow engines such as Temporal work the same way.",
        ask: "If the process dies between these two steps, what finds and repairs the half-done work?",
      },
      {
        n: 6, title: "Prefer state that only moves forward",
        body: "A system is easier to reason about when its information only advances: a version number increases, an event is appended, a job goes from pending to running to done and never back. Fewer possible transitions leave fewer interleavings to check.",
        example: "A fencing token is a number that goes up each time a lock is granted. Storage rejects any write carrying a lower token than the highest it has seen, so a stalled old lock holder can't overwrite a newer one, and no clock is involved.",
        ask: "Can this change be an append or an increment instead of an overwrite?",
      },
    ],
  },
  {
    id: "performance", name: "Performance and scale", blurb: "Getting more done with the resources you have before asking for more.",
    items: [
      {
        n: 7, title: "Remove work before adding capacity",
        body: "Before adding servers, look for work you can eliminate through caching, batching, deduplication, precomputation or a better algorithm.",
        example: "Bringing a page from 100 database queries down to 1 (fixing an N+1 query) usually does more than adding ten read replicas.",
        ask: "Which work here is repeated, redundant or not needed at all?",
      },
      {
        n: 8, title: "Decide whether work happens at write time or read time",
        body: "Many designs come down to doing work when data is written so that reads are cheap, or keeping writes cheap and doing the work when someone reads. Neither is better in general: the ratio of reads to writes and how fresh the result must be decide it.",
        example: "A social feed can be assembled when the user opens it (cheap posts, expensive reads) or pushed into followers' feeds when someone posts (expensive posts, cheap reads). Large systems often mix the two, building feeds for celebrity accounts at read time.",
        ask: "Is this read much more often than it is written, and how stale may the result be?",
      },
      {
        n: 9, title: "Pay for consistency only where the business needs it",
        body: "Strong consistency usually needs coordination, and coordination costs latency and availability. Spend it on the invariants that matter and let the rest be eventually consistent.",
        example: "A bank balance needs strongly consistent updates. A follower count can lag by a few seconds without harming anyone.",
        ask: "What goes wrong, and for whom, if this value is briefly out of date?",
      },
      {
        n: 10, title: "Order events per entity, not globally",
        body: "A single global order pushes every event through one sequence and caps throughput. Most systems only need the events for one order, account or user to be handled in order.",
        example: "Partition a Kafka topic by account ID. Each account's events stay in order within its partition, and different accounts are processed in parallel.",
        ask: "Which events actually need to be ordered relative to each other?",
      },
      {
        n: 11, title: "Make the common path fast and every path correct",
        body: "Not every path needs to be equally fast. Optimise the one most requests take, and make sure the rarer paths still produce a correct result, even if slowly.",
        example: "A cache serves most reads and the database handles the misses. Workers process jobs as normal, and a sweeper picks up jobs whose worker died.",
        ask: "What happens on the slow or unusual path, and is it still correct?",
      },
    ],
  },
  {
    id: "reliability", name: "Reliability", blurb: "Expecting parts to fail, lag and overload, and limiting the damage when they do.",
    items: [
      {
        n: 12, title: "A queue absorbs bursts but adds no capacity",
        body: "A queue lets a system ride out a short spike. If work keeps arriving faster than it is processed, the backlog grows without limit, and a larger buffer only delays the failure.",
        example: "With 1,000 requests a second arriving and 800 processed, the backlog grows by 200 a second, or 720,000 an hour. The fixes are more consumers, backpressure, load shedding or less incoming work.",
        ask: "Is the sustained arrival rate below the processing rate?",
      },
      {
        n: 13, title: "Retry with limits",
        body: "Retries turn brief failures into successes, but unchecked retries pile load onto a service that is already struggling and can turn a slowdown into an outage. They are also only safe for operations that are safe to repeat.",
        example: "Use exponential backoff with jitter (a random spread so clients don't retry in step), a cap on attempts, an overall deadline, and a retry budget across all callers.",
        ask: "If the dependency is down for a minute, how much extra load do my retries add?",
      },
      {
        n: 14, title: "Contain failures rather than trying to prevent all of them",
        body: "Something is always failing somewhere. Design so that a failing part takes as little else down with it as possible (a small blast radius). A partly working system is usually far more useful than one that is entirely down.",
        example: "If recommendations fail, checkout should carry on with a default list or none. Timeouts, circuit breakers (stop calling a dependency that keeps failing), bulkheads (separate resource pools per dependency) and graceful degradation all serve this.",
        ask: "If this dependency fails, what else stops working?",
      },
      {
        n: 15, title: "Assume data is stale and bound how stale",
        body: "Caches, replicas, asynchronous consumers, DNS records and monitoring dashboards all lag behind reality. The useful questions are how far behind they can fall, how you would notice, and what happens if someone acts on old data.",
        example: "A replica two seconds behind is fine for a product page but not for the order page straight after checkout, so that read goes to the primary (read-your-writes).",
        ask: "How stale can this get, how would I notice, and what happens if someone acts on it?",
      },
    ],
  },
  {
    id: "judgement", name: "Architecture and judgement", blurb: "Deciding what belongs in the design at all.",
    items: [
      {
        n: 16, title: "Every component has to justify its failure modes",
        body: "A new component can improve one property and still make the whole system less reliable, because it brings its own failures and its own operational work.",
        example: "Redis speeds up reads and adds cache failures and invalidation. Kafka decouples services and is one more system to run. Microservices let teams deploy separately and turn function calls into network calls, with consistency problems between them.",
        ask: "What new failure does this introduce, and is the gain worth it?",
      },
      {
        n: 17, title: "Choose the simplest design that meets the requirements",
        body: "Design for the load you have or can reasonably expect, not the largest you can imagine. Sharding, distributed databases, event pipelines and microservices do not make a design better on their own.",
        example: "One well-indexed Postgres primary with a read replica handles thousands of writes a second, which covers most products for years.",
        ask: "Which requirement forces this extra complexity?",
      },
    ],
  },
];

export const REFRAMES: [string, string][] = [
  ["Designing a distributed lock service", "Can shared ownership be removed, so each record has one writer?"],
  ["Building exactly-once messaging", "Can a duplicate be made harmless?"],
  ["Keeping every copy of the data in sync", "Is eventual consistency acceptable here, and within what bound?"],
  ["Making every dependency highly available", "Can the feature degrade instead of failing when one is down?"],
];
