---
id: cache-freshness
category: caching
skill: reads
title: Freshness, invalidation and the stale refill race
minutes: 17
summary: '"There are only two hard things in computer science: cache invalidation and naming things." The hard part is not deleting a key — it is that deletes race with reads, crash between steps, and stack across layers. A freshness promise must hold across all of them.'
objectives:
  - State a freshness promise per data type (bounded staleness, read-your-writes, authoritative) instead of one TTL for everything
  - Trace the stale refill race and fix it with leases or versioned writes
  - Explain why application-side invalidation can silently go missing, and how CDC-driven invalidation closes the gap
  - Compute worst-case staleness across stacked caches and lagging replicas
sources:
  - ['Nishtala et al., Scaling Memcache at Facebook — leases (NSDI 2013)', 'https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala']
  - ['Debezium: change data capture', 'https://debezium.io/documentation/reference/stable/index.html']
  - ['MDN: HTTP caching', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching']
case: links
---

> [!incident] "I deleted it, why is it still there?"
> Facebook's memcache paper describes the problem plainly: a web server reads a value from the database, a concurrent update changes it and deletes the cached copy, and then the first server — slower — writes its now-stale value into the cache. The delete happened. The data is still wrong, and it stays wrong until something else touches that key. At their scale this happened constantly, so they invented **leases**. You will meet the same race the first time a user deletes a post and refreshes.

## Start with the promise, not the TTL

"Cache for 5 minutes" is a mechanism. The requirement is a **freshness promise**, and different data deserves different ones:

| Promise | Meaning | Typical data | Mechanism |
|---|---|---|---|
| **Bounded staleness** | Readers may see a value up to *T* seconds old | Product descriptions, follower counts, recommendations | TTL (+ invalidation to usually do better) |
| **Read-your-writes** | The person who changed it sees the change immediately; others may lag | Profile edits, settings, a post you just published | Route the author to the source, write-through for their session, version tokens |
| **Authoritative** | Every read reflects the latest committed state | Permissions/revocation, inventory at checkout, balances | Don't serve from a cache; or validate against the source at the decision point |

```sort
prompt: Which freshness promise does each read need?
buckets: [Bounded staleness is fine, Read-your-writes, Authoritative on every check]
items:
  - {text: 'The like count under a viral post', bucket: 0, why: 'Nobody can tell whether it says 10,402 or 10,417. A TTL of seconds to minutes is fine.'}
  - {text: 'A user changes their display name and goes back to their profile', bucket: 1, why: "If they see the old name they'll think the save failed. Other viewers can lag."}
  - {text: 'Whether a just-disabled employee may download a file', bucket: 2, why: 'Revocation must take effect now. A cached "allowed" is a security bug.'}
  - {text: 'The price shown on a search results page', bucket: 0, why: 'Display can lag, provided the price is re-validated at checkout.'}
  - {text: 'The price charged at checkout', bucket: 2, why: 'The money-moving step validates against the source of truth, not the cached display copy.'}
  - {text: 'A comment you just posted appearing in the thread', bucket: 1, why: 'Classic read-your-writes: you must see it, the rest of the world can see it a moment later.'}
```

## What a TTL does — and doesn't — bound

A TTL bounds how long **one copy in one cache** lives after it was written. It does not bound how stale the *data* is, because:

- The value may already have been old when it was cached (read from a lagging replica, or read just before a write — see the race below).
- Caches **stack**: browser → CDN → API in-process cache → Redis. Each layer can cache a copy fetched from the layer below at the last moment of *its* TTL.
- Without invalidation, a TTL is the *only* thing that corrects a stale value — so the average staleness is about TTL/2 for frequently changing data.

```predict
prompt: Redis caches product data with a **60 s** TTL. The CDN in front of the API caches the product JSON with `max-age=300`. A price changes. What is the worst case before every user sees the new price, assuming no invalidation?
choices:
  - 60 seconds — the shortest TTL wins
  - 300 seconds — the longest TTL wins
  - About 360 seconds — the layers add up
  - It's unbounded, TTLs give no guarantee at all
answer: 2
reveal: |
  The CDN can fetch from the API one instant before Redis's copy expires — getting a value that is already almost 60 s stale — and then serve it for another 300 s. Worst-case staleness is roughly the **sum** of the TTLs along the read path (plus any replica lag at fill time). When someone says "it's cached for a minute," ask: *by whom, and what's in front of it?*
```

Shorter TTLs reduce staleness but raise the miss rate. This model shows the trade-off for a single key: how often it's read, how often it changes, and the TTL you choose.

```sim
name: tradeoff
title: The TTL dial
config: {model: ttl, initial: {x: 900}}
challenges:
  - {text: 'With 2 reads/s per key and 6 updates/hour, find a TTL that keeps stale reads under 5% while keeping the hit rate above 95%', metric: stale, op: '<', value: 5, and: [{metric: hit, op: '>', value: 95}]}
  - {text: 'Now make the key change 120+ times an hour. Try to keep stale reads under 5% with a hit rate above 95% — and notice you cannot.', metric: writesPerHour, op: '>=', value: 120}
takeaway: |
  When reads per change are high, a TTL alone can give a great hit rate with little staleness. When data changes nearly as often as it's read, no TTL wins on both — you need **invalidation on write** (fresh without waiting) and keep the TTL only as a safety net for invalidations that go missing.
```

## The stale refill race

Delete-on-write fixed the two-writers problem from the previous lesson. It doesn't fix this one.

```timeline
title: A slow reader refills an old value
intro: Reader R misses and goes to the database. While R is in flight, writer W commits a new price and deletes the cache key, exactly as the textbook says.
lanes: [Reader R, Writer W, Cache, Database]
state: {Cache: '(empty)', Database: 'price = 10'}
steps:
  - {lane: Reader R, to: Cache, text: 'GET product:42 → miss'}
  - {lane: Reader R, to: Database, text: 'SELECT price → reads 10'}
  - {lane: Writer W, to: Database, text: 'UPDATE price = 12; COMMIT', set: {Database: 'price = 12'}}
  - {lane: Writer W, to: Cache, text: 'DEL product:42 (nothing to delete yet)'}
  - {lane: Reader R, to: Cache, text: 'SET product:42 = 10, TTL 1 h', set: {Cache: 'price = 10 ⚠ for up to 1 h'}}
find:
  prompt: The invalidation happened. Which step actually makes the cache wrong?
  answer: 4
  explain: |
    R's `SET` writes a value it read **before** the commit, **after** the invalidation. The delete can't protect against a write that hasn't happened yet. The window is small (R must be slower than W's commit + delete), but at thousands of requests per second on a hot key it happens daily — and the damage lasts a full TTL.
```

### Fix 1: leases

A **lease** is a token the cache hands out on a miss: "you may fill this key". A delete revokes outstanding leases. A `SET` carrying a revoked lease is rejected.

```timeline
title: The same race, with leases
lanes: [Reader R, Writer W, Cache, Database]
state: {Cache: '(empty)', Lease: none, Database: 'price = 10'}
steps:
  - {lane: Reader R, to: Cache, text: 'GET product:42 → miss, cache issues lease L1 to R', set: {Lease: 'L1 (held by R)'}}
  - {lane: Reader R, to: Database, text: 'SELECT price → 10'}
  - {lane: Writer W, to: Database, text: 'UPDATE price = 12; COMMIT', set: {Database: 'price = 12'}}
  - {lane: Writer W, to: Cache, text: 'DEL product:42 → revokes L1', set: {Lease: 'none (L1 revoked)'}}
  - {lane: Reader R, to: Cache, text: 'SET product:42 = 10 with lease L1 → REJECTED', note: 'R still returns 10 to its own caller (it read before the commit), but it cannot poison the cache.'}
  - {lane: Reader R, to: Cache, text: 'Next reader: miss → new lease L2 → reads 12 → SET accepted', set: {Cache: 'price = 12', Lease: none}}
```

Leases have a second benefit: if many readers miss the same key at once, the cache gives the lease to one and tells the others to wait briefly and retry — built-in protection against stampedes (next lesson but one).

### Fix 2: versioned writes

Store a version alongside the value and only accept a fill whose version is newer than what the cache has seen. The version must come from the **source of truth** (a row version column, an update counter, or the database's commit log position) — never from application servers' wall clocks, which disagree.

```bug
title: A versioned cache fill
prompt: This "only write newer versions" fill has one line that defeats the whole idea. Which?
lang: python
code: |
  def fill(key):
      row = db.query("SELECT price, version FROM products WHERE id = %s", key)
      # Lua script: set only if the cached version is older (atomic in Redis)
      redis.eval(SET_IF_NEWER, keys=[f"product:{key}"],
                 args=[row.price, int(time.time() * 1000)])
      return row.price
bug: [5]
explain: |
  The version passed to `SET_IF_NEWER` is the **application server's current time**, not the row's version. A slow reader that read the old row a second ago stamps it with "now", which looks newer than the writer's fill — exactly the race we wanted to stop. Use `row.version` (incremented by every UPDATE in the same transaction) so ordering follows the database's commit order.
fix: |
  def fill(key):
      row = db.query("SELECT price, version FROM products WHERE id = %s", key)
      redis.eval(SET_IF_NEWER, keys=[f"product:{key}"], args=[row.price, row.version])
      return row.price
```

### Fix 3 and 4: the pragmatic ones

- **Delayed double delete.** Delete on write, then delete *again* a moment later (a few hundred ms to a couple of seconds), catching most late refills. Cheap, widely used, and only probabilistic — name it as such.
- **Short TTL as a backstop.** Whatever else you do, keep a TTL so any missed or raced invalidation heals itself within a bounded time.

## When invalidation silently goes missing

Application-side invalidation has a structural flaw: the database commit and the cache delete are two separate operations with no transaction around them.

```timeline
title: Commit, then crash
intro: The service commits to the database, then deletes the cache key. Inject a crash at each point and see what users get.
lanes: [API server, Database, Cache]
state: {Database: 'price = 10', Cache: 'price = 10'}
steps:
  - {lane: API server, to: Database, text: 'UPDATE price = 12; COMMIT', set: {Database: 'price = 12'}}
  - {lane: API server, to: Cache, text: 'DEL product:42', set: {Cache: '(empty)'}}
  - {lane: API server, to: API server, text: 'Respond 200 OK'}
crashes:
  - after: 0
    label: after commit, before DEL
    verdict: wrong
    text: The price is changed in the database but the cache keeps serving **10** until its TTL expires. No error was logged — the process simply died (deploy, OOM kill, node failure). The same happens if the `DEL` hits a network blip and nobody retries it.
  - after: 1
    label: after DEL, before responding
    verdict: safe
    text: Data is consistent. The client sees an error or timeout and may retry the update — which is fine if the update is idempotent.
```

Other writers make it worse: a backfill script, an admin tool or another service that writes the same table directly will never call your `DEL`.

**CDC-driven invalidation** moves the responsibility to the database's own change log. A connector (e.g. Debezium reading the MySQL binlog or Postgres WAL) streams every committed change; a consumer deletes the affected cache keys and records its log position.

```timeline
title: Invalidation from the change log
lanes: [Database, CDC consumer, Cache]
state: {Database: 'price = 10', Cache: 'price = 10', Offset: '1040'}
steps:
  - {lane: Database, to: Database, text: 'Any writer commits price = 12 (log position 1041)', set: {Database: 'price = 12'}}
  - {lane: Database, to: CDC consumer, text: 'Change event 1041 streamed: products id=42 updated'}
  - {lane: CDC consumer, to: Cache, text: 'DEL product:42', set: {Cache: '(empty)'}}
  - {lane: CDC consumer, to: CDC consumer, text: 'Commit offset 1041', set: {Offset: '1041'}}
crashes:
  - after: 1
    label: consumer dies before DEL
    verdict: safe
    text: On restart the consumer resumes from its last committed offset (1040) and re-reads event 1041. The delete happens late, not never.
  - after: 2
    label: after DEL, before committing offset
    verdict: safe
    text: On restart it replays 1041 and deletes the key again. Deleting twice is harmless — **idempotent effects make at-least-once delivery safe**.
```

The costs: another moving part to run and monitor, invalidation lag equal to the pipeline lag (watch it — it's now part of your freshness bound), and mapping table rows to cache keys.

> [!senior] Replicas add a second race
> If cache fills read from **read replicas**, a reader can miss right after the invalidation, read the replica that hasn't applied the write yet, and cache the old value. Options: fill from the primary for keys written in the last few seconds, delay the (second) delete by more than typical replica lag, or carry the commit position and only fill from a replica that has reached it. Your worst-case staleness now includes replica lag.

```calc
title: Worst-case staleness across layers
prompt: |
  A key is cached in Redis with a **30 s** TTL and in a per-instance L1 cache with a **5 s** TTL. Redis is filled from a read replica whose lag peaks at **2 s**. Invalidation is best-effort. What's the worst-case staleness a user could see, in seconds?
answer: 37
unit: s
tolerance: 1.03
steps: |
  The Redis fill can read a value that is already **2 s** old (replica lag). It lives in Redis for **30 s**. An L1 fill at the last instant of that Redis copy keeps it for **5 s** more. 2 + 30 + 5 = **37 s**. If the product requirement is "price changes visible within 10 s", this design doesn't meet it without reliable invalidation of *both* layers.
```

## Read-your-writes for the author

Often only the person who made the change needs to see it instantly. Cheap ways to give them that:

- **Write-through for the author's own view**: after a write, update (not just delete) the entries that user will immediately read.
- **Bypass the cache for recent writers**: set a short-lived marker (cookie or session flag "wrote at T") and read from the primary for a few seconds.
- **Version tokens**: return the new version to the client; on the next read, if the cached version is older, go to the source.

```incident
title: Deleted posts keep reappearing
intro: |
  Support tickets: users delete a post, refresh, and it's still there — sometimes for an hour. It doesn't happen every time. The system: Postgres primary + 2 replicas, Redis cache-aside with `DEL` on write, 1 h TTL, CDN in front of the public post pages with `max-age=60`.
start: s1
nodes:
  s1:
    text: You have the incident. Where do you start?
    options:
      - {label: 'FLUSHALL on Redis to clear the stale entries', next: flush, quality: bad, note: 'Every key misses at once — a self-inflicted stampede on the database at peak.'}
      - {label: 'Reproduce with a test account and trace which layer returns the deleted post', next: s2, quality: good, note: 'Find which copy is stale before changing anything.'}
      - {label: 'Lower the TTL to 1 minute everywhere', next: s2b, quality: ok, note: "It caps the damage, but you still don't know the cause, and the miss rate jumps."}
  flush:
    text: The database CPU pins at 100% for four minutes and the site degrades. Afterwards the bug comes back within the hour.
    verdict: bad
  s2b:
    text: Reports slow down but don't stop, and database load rises 30%. You still need the cause.
    options:
      - {label: 'Now trace which layer serves the deleted post', next: s2, quality: good}
  s2:
    text: |
      Tracing shows the API's `DEL` succeeds, but about 0.5% of the time Redis ends up holding the old post again within a second of the delete. The fills that re-cache it read from a **replica**.
    options:
      - {label: 'Fill cache misses from the primary for 5 s after any write to that key', next: s3, quality: good, note: 'Removes the replica-lag refill window for recently written keys.'}
      - {label: 'Add a second DEL 2 seconds after the first (delayed double delete)', next: s3, quality: ok, note: 'Probabilistic, but cheap and catches most late refills.'}
      - {label: 'Stop using replicas entirely', next: s3x, quality: bad, note: 'Throws away read capacity to fix a narrow window.'}
  s3x:
    text: The bug stops, but the primary's CPU climbs from 40% to 85% and p99 latency doubles at peak.
    verdict: ok
  s3:
    text: Redis is now correct. Users on the public post URL still occasionally see a deleted post for up to a minute.
    options:
      - {label: 'Purge the CDN URL as part of the delete (and keep max-age short for mutable pages)', next: done, quality: good}
      - {label: 'Accept it — a minute is within our bound', next: done2, quality: ok}
  done:
    text: Deletes are now visible everywhere within a second or two, with the TTL left as a safety net.
    verdict: good
  done2:
    text: Reasonable if the product agrees a 60 s bound for public pages — but write that bound down, because "deleted" content reappearing is often a trust and legal issue, not just UX.
    verdict: ok
debrief: |
  The pattern: **find the stale layer before acting**, then fix the specific race (replica-lag refill), then account for **every** copy on the read path (the CDN). Global flushes and blanket TTL cuts trade a correctness bug for a capacity incident.
```

```interview
say: |
  "I'd define freshness per data type: most catalogue reads can be a few seconds stale, the author needs read-your-writes, and permission checks must be authoritative. For the cached data I'd invalidate on write — ideally driven by CDC from the database log so we never miss a write from another path — keep a TTL as a safety net, and protect against the stale-refill race with leases or version-checked fills. Worst-case staleness is the sum of TTLs along the read path plus replica lag, so I'd make sure that sum fits the requirement."
followups:
  - q: Why isn't delete-on-write enough?
    a: A reader that loaded the old value before the commit can write it into the cache after the delete. Deletes can't protect against a fill that hasn't happened yet. Leases or versioned fills close it; a delayed second delete and a TTL limit the damage.
  - q: How do you guarantee the invalidation happens?
    a: Application-side deletes can be lost to crashes and network errors and miss other writers. Driving invalidation from the database's change log (CDC) makes it at-least-once and ordered, and deletes are idempotent, so replays are safe. The trade is pipeline lag and another system to operate.
  - q: A user's permission is revoked. How quickly does it take effect?
    a: Authorisation decisions shouldn't depend on a long-lived cache. Either check the source at decision time, keep auth caches to seconds, or push revocations (and for tokens, keep lifetimes short or keep a revocation list).
weak: |
  "Set a TTL of 5 minutes so data is at most 5 minutes old." — Ignores stacked layers, refill races, replica lag, and different needs per data type.
strong: |
  Separates promises by data type, invalidates on write with a reliable mechanism, names the stale refill race and a fix, computes the staleness bound across layers, and keeps critical decisions off the cache.
```

```recall
prompt: Explain the **stale refill race** to a colleague and describe one way to prevent it.
points:
  - A reader misses, reads the old value from the database, and is slow to write it back
  - Meanwhile a writer commits a new value and deletes the cache key
  - The slow reader then writes the old value into the cache after the delete, where it stays until TTL
  - A prevention such as leases (delete revokes the fill token) or version-checked fills from source-of-truth versions
model: |
  Reader A misses the cache and reads price 10 from the database. Before A writes it back, writer B commits price 12 and deletes the cache key — but there's nothing there yet. A then sets the key to 10, so the cache serves a value that's already been overwritten, for a whole TTL. Leases prevent it: the cache issues a token on the miss, B's delete revokes it, and A's set with the revoked token is rejected. Alternatively store a source-of-truth version with each value and only accept fills with a newer version.
```

```questions
- kind: check
  prompt: The API caches a user's profile in Redis for 60 s, and the CDN caches the profile page with `max-age=120`. There is no invalidation. Roughly what is the worst-case staleness?
  choices:
    - text: About 180 seconds
      correct: true
    - text: 60 seconds, because the origin cache expires first
      why: The CDN can fetch an almost-expired Redis copy and then keep it for its own full TTL.
    - text: 120 seconds, because the longest TTL wins
      why: The CDN copy can already be up to 60 s old when the CDN fetches it.
    - text: Unbounded, because TTLs give no guarantee
      why: Without races or missed fills, TTLs do bound the age of each copy, and the bounds add up along the path.
  explanation: Stacked caches add their TTLs. A downstream cache can fetch from an upstream copy at the last moment of that copy's life and keep it for its own full TTL.
- kind: check
  type: multi
  prompt: Which of these can leave a cache holding an old value even though the code deletes the key after every write? Select all that apply.
  choices:
    - text: The process crashes between the database commit and the DEL
      correct: true
    - text: A slow reader that loaded the old value writes it back after the DEL
      correct: true
    - text: A cache miss is filled from a read replica that hasn't applied the write yet
      correct: true
    - text: A data-fix script updates the table directly without touching the cache
      correct: true
    - text: The key has a TTL set
      why: A TTL is what eventually corrects a stale value. It never causes one.
  explanation: Application-side invalidation is a second, separate operation. It can be skipped (crash, other writers), raced (stale refill), or undone by a fill from a lagging source. CDC-driven invalidation, leases or versioned fills, and a TTL backstop address these.
- kind: check
  prompt: Which mechanism actually prevents the stale refill race, rather than just limiting how long it lasts?
  choices:
    - text: Leases — a delete revokes the fill token issued on the miss, so the late SET is rejected
      correct: true
    - text: A shorter TTL
      why: A shorter TTL only shortens how long the stale value survives. The race still happens.
    - text: Switching from SET-on-write to DEL-on-write
      why: The race already assumes DEL-on-write. The problem is a fill that lands after the delete.
    - text: Adding more cache replicas
      why: Replication copies the stale value too. Ordering is the problem, not capacity.
  explanation: The race is a fill that lands after an invalidation. Leases (or fills checked against the source's version) make that late fill fail. TTLs and delayed double deletes only limit how long or how often it bites.
- kind: check
  type: numeric
  level: advanced
  prompt: Values are filled into Redis (TTL 20 s) from a replica with up to 3 s of lag, and API servers keep an L1 copy for 4 s. With invalidation assumed lost, what is the worst-case staleness in seconds?
  answer: 27
  unit: s
  tolerance: 0.04
  explanation: 3 s (already stale when filled) + 20 s in Redis + 4 s in L1 = 27 s. Every layer and every lagging source adds to the bound.
- kind: fire
  prompt: What does "delayed double delete" do, and what is its main limitation?
  choices:
    - text: It deletes on write and again shortly afterwards to catch late refills; it reduces the race but only probabilistically
      correct: true
    - text: It deletes the key from two cache replicas; it doubles network traffic
      why: It's about timing, not replicas. The second delete targets refills that land after the first.
    - text: It writes the value twice to make sure it's durable; it's slower than a single write
      why: Nothing is written — both operations are deletes.
    - text: It guarantees the race can't happen if the delay exceeds the TTL
      why: Any fill that lands after the second delete still sticks. The method is a heuristic.
  explanation: The second delete removes values refilled by readers that were in flight during the first. A reader slower than the delay still wins, so treat it as mitigation, not a guarantee.
- kind: fire
  prompt: Why do teams drive cache invalidation from the database change log (CDC) rather than calling DEL in application code?
  choices:
    - text: The log captures every committed change from any writer and can be replayed after crashes, so deletes are not silently lost
      correct: true
    - text: CDC makes invalidation instantaneous
      why: CDC adds pipeline lag. Its advantage is reliability and coverage, not speed.
    - text: CDC removes the need for a TTL
      why: Most teams keep a TTL as a backstop for bugs in the key mapping or long pipeline stalls.
    - text: Database logs are smaller than cache keys
      why: That has nothing to do with correctness.
  explanation: Application deletes live outside the transaction and miss other writers. The change log is ordered, durable and covers everything committed. Replays only repeat deletes, which are idempotent.
- kind: fire
  prompt: An access-control service caches "user X may access workspace Y" for 15 minutes. Security asks that revocations take effect within seconds. What's the right direction?
  choices:
    - text: Make the authorisation decision against authoritative state (or push revocations and keep any cache to seconds)
      correct: true
    - text: Keep the 15-minute cache but add jitter
      why: Jitter spreads expiries for load reasons. It doesn't shorten the revocation window.
    - text: Cache permissions in the CDN as well, so checks are faster
      why: That adds another layer that can serve a stale "allowed".
    - text: Ask users to log out after a revocation
      why: The revoked user is exactly the one who won't do that.
  explanation: Security decisions need an authoritative or very short-lived answer. Caching display data is a trade-off; caching "allowed" for 15 minutes is a vulnerability.
- kind: fire
  type: multi
  prompt: Which approaches give an author read-your-writes on their own edits without making every reader bypass the cache? Select all that apply.
  choices:
    - text: Route that user's reads to the primary for a few seconds after they write
      correct: true
    - text: Update the cache entries the author will read immediately (write-through for their view)
      correct: true
    - text: Return a version token and go to the source if the cached copy is older
      correct: true
    - text: Disable caching for everyone whenever any write happens
      why: That throws away the cache to solve a problem only the author has.
    - text: Raise the TTL so the cache holds the newest value longer
      why: A longer TTL keeps old values around longer, not new ones.
  explanation: Read-your-writes only needs special handling for the writer, for a short window. Session-scoped routing, targeted write-through or version tokens give it cheaply.
- kind: fire
  level: advanced
  prompt: A versioned fill accepts a value only if its version is newer than the cached one. Where must the version come from?
  choices:
    - text: The source of truth, ordered by commit (e.g. a row version bumped in the UPDATE, or the log position)
      correct: true
    - text: The application server's clock when the fill happens
      why: A slow reader stamps an old value with a new time, so the race comes back.
    - text: A random UUID per fill
      why: UUIDs carry no order, so "newer" means nothing.
    - text: The cache server's clock when the value is stored
      why: That measures when the fill arrived, not when the data was committed. It's the same race again.
  explanation: Versions must follow the order in which the source committed the changes. Wall clocks on readers and writers measure when someone looked, not what they saw.
```
