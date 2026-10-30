---
id: cache-aside
category: caching
skill: reads
title: Cache-aside, write strategies and eviction
minutes: 16
summary: A cache is a bet that recently or frequently read data will be read again. Its value comes almost entirely from the miss rate, its risks from the copy it keeps, and its behaviour under memory pressure from the eviction policy you choose.
objectives:
  - Trace cache-aside hit, miss and write paths, and explain why writes usually delete rather than set
  - Compare cache-aside, read-through, write-through, write-behind and write-around by failure mode
  - Reason about hit rate as the lever on backend load, and size a cache from a working set
  - Choose an eviction policy and recognise scan pollution, penetration and cold starts
sources:
  - ['AWS: Database caching strategies (patterns)', 'https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html']
  - ['Redis: key eviction policies', 'https://redis.io/docs/latest/develop/reference/eviction/']
  - ['Nishtala et al., Scaling Memcache at Facebook (NSDI 2013)', 'https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala']
case: links
---

> [!story] The cache that was holding up the database
> A retailer's product database served about 2,000 queries a second during normal traffic, comfortably. A Redis cluster in front of it absorbed another 38,000 reads a second. One Friday a deploy changed the cache key format from `product:{id}` to `product:v2:{id}`. Every key missed at once. Forty thousand reads a second landed on a database sized for two thousand, connection pools filled, the API timed out, and the outage lasted until engineers rolled back. Nothing was "broken" — the cache was simply doing a job nobody had written down: it *was* the capacity plan.

That story is the whole lesson in miniature: a cache is not an optimisation you bolt on, it is part of your capacity model, and its miss path is a production path.

```predict
prompt: A database handles 1,000 reads/s at a comfortable 50% CPU. Traffic grows to 10,000 reads/s and you add a cache with a **90% hit rate**. Roughly what load reaches the database?
choices:
  - 9,000 reads/s — the cache only helps latency
  - 1,000 reads/s — the same as before
  - 100 reads/s — caches remove almost everything
  - 5,000 reads/s — caches roughly halve load
answer: 1
reveal: |
  Load on the source is **requests × miss rate**: 10,000 × 10% = 1,000/s. Notice the leverage: moving from a 90% to a 99% hit rate cuts database load **ten times** (to 100/s), while moving from 50% to 60% barely matters. Engineers talk about hit rate, but the number that sizes your backend is the *miss* rate.
```

## Why caches work at all

Caches exploit two facts about real workloads. Access is **skewed**: a small fraction of keys gets most reads (popular products, celebrity profiles, today's headlines — often close to a Zipf distribution). And access has **locality in time**: something read now is likely to be read again soon. If neither holds — every request reads a different, rarely repeated key — a cache adds a network hop and memory cost for nothing.

The other reason is the gap between storage tiers:

| Operation | Typical latency | Relative |
|---|---|---|
| Read from in-process memory (hash map) | ~100 ns | 1× |
| Redis/Memcached GET, same availability zone | 0.2–1 ms | ~5,000× |
| Indexed primary-key lookup in a warm relational DB | 1–5 ms | ~25,000× |
| Query with joins/aggregation, or cold pages from disk | 10–100+ ms | ~500,000× |
| Cross-region round trip | 60–150 ms | ~1,000,000× |

> [!numbers] Numbers worth memorising
> One Redis node serves on the order of **100k simple operations/s**; a typical relational primary serves on the order of **5–20k simple queries/s** depending on size. So a cache usually buys you *throughput headroom* even more than latency.

## The cache-aside read path

In **cache-aside** (also called lazy loading) the application owns the logic. The cache knows nothing about the database.

```arch
title: Cache-aside
nodes:
  - {id: client, label: Client, kind: client, x: 0, y: 1}
  - {id: api, label: API server, kind: service, x: 1, y: 1, note: owns cache logic}
  - {id: cache, label: Redis, kind: cache, x: 2, y: 0, note: 'copy, may be stale'}
  - {id: db, label: Database, kind: db, x: 2, y: 2, note: source of truth}
edges:
  - [client, api, GET /products/42]
  - [api, cache, GET product:42]
  - [api, db, SELECT]
paths:
  - label: Cache hit
    steps:
      - [client, api, 'Request arrives']
      - [api, cache, 'GET product:42 → value found (~0.5 ms). Respond immediately.']
  - label: Cache miss
    steps:
      - [client, api, 'Request arrives']
      - [api, cache, 'GET product:42 → nil. A miss is a normal path, not an error.']
      - [api, db, 'SELECT * FROM products WHERE id = 42 (~3 ms)']
      - [api, cache, 'SET product:42 <value> EX 300 — populate for the next reader']
  - label: Write
    steps:
      - [client, api, 'PUT /products/42 {price: 12}']
      - [api, db, 'UPDATE products SET price = 12 … COMMIT — the source of truth changes first']
      - [api, cache, 'DEL product:42 — drop the copy; the next read refills it']
```

```pseudo
def get_product(id):
    value = cache.get(f"product:{id}")
    if value is not None:
        return value                       # hit
    row = db.query("SELECT ... FROM products WHERE id = %s", id)
    if row is None:
        cache.set(f"product:{id}", NOT_FOUND, ex=30)   # negative cache, short TTL
        return None
    cache.set(f"product:{id}", row, ex=300)            # TTL bounds how long a mistake lives
    return row

def update_price(id, price):
    db.execute("UPDATE products SET price = %s WHERE id = %s", price, id)  # commit first
    cache.delete(f"product:{id}")                                         # then invalidate
```

Three properties make cache-aside the default:

1. **Resilience.** If the cache is down, reads fall through to the database. The system gets slower, not wrong — *provided the database can survive the full read load* (it often can't; see below).
2. **Only requested data is cached.** Memory holds the working set, not the whole dataset.
3. **The database stays authoritative.** The cache can always be flushed and rebuilt.

Its costs: the first read of every key pays the miss penalty (cold start), the application code carries the logic, and the copy can go stale.

## Writes: why delete beats set

On a write you can either **update** the cached value (`SET`) or **invalidate** it (`DEL`) so the next reader refills from the database. Deleting is usually right, and the reason is concurrency.

```timeline
title: Two writers that both SET the cache
intro: Two requests change the same product's price at nearly the same moment. Each updates the database, then writes its new value into the cache.
lanes: [Writer A, Writer B, Database, Cache]
state: {Database: 'price = 10', Cache: 'price = 10'}
steps:
  - {lane: Writer A, to: Database, text: 'UPDATE price = 11; COMMIT', set: {Database: 'price = 11'}}
  - {lane: Writer B, to: Database, text: 'UPDATE price = 12; COMMIT', set: {Database: 'price = 12'}}
  - {lane: Writer B, to: Cache, text: 'SET product:42 = 12', set: {Cache: 'price = 12'}}
  - {lane: Writer A, to: Cache, text: 'SET product:42 = 11 (A was descheduled for 40 ms: GC pause)', set: {Cache: 'price = 11 ⚠'}}
  - {lane: Writer A, to: Writer A, text: 'Every reader now gets 11 until the TTL expires', note: 'The database says 12. The cache says 11, and nothing will correct it.'}
find:
  prompt: Click the step that leaves the cache permanently disagreeing with the database.
  answer: 3
  explain: |
    The database serialised the writes (B won), but the **cache writes arrived in the opposite order**. Nothing orders `SET`s from different processes. If both writers had issued `DEL` instead, the order wouldn't matter: the cache would end up empty either way, and the next read would fetch 12 from the database. (Deletes don't remove *every* race — a slow reader can still refill an old value; that's the next lesson.)
```

Deleting also avoids doing work nobody may need (recomputing an expensive derived value on every write to a rarely read key) and keeps one code path — the read path — responsible for building cache entries.

> [!mistake] Writing the cache before the database
> `cache.set(...)` then `db.update(...)` means a failed or rolled-back database write leaves a value in the cache that **never existed** in the source of truth. Always change the source first, then invalidate.

## The write-strategy family

Cache-aside is one of five patterns you should be able to compare on a whiteboard.

| Pattern | Read path | Write path | Strength | Failure mode to name |
|---|---|---|---|---|
| **Cache-aside** | App checks cache, loads DB on miss | App writes DB, deletes cache key | Simple, resilient to cache loss | Stale refill races; cold misses |
| **Read-through** | Cache library loads from DB on miss | (usually paired with one below) | Loading logic centralised | Same as cache-aside; library becomes a dependency |
| **Write-through** | Cache always holds fresh data | Write goes to cache **and** DB synchronously | Reads after writes are fresh | Every write pays both latencies; caches data never read |
| **Write-behind (write-back)** | Cache serves reads | Write to cache, ack, flush to DB **asynchronously** | Very fast writes; batching/coalescing | **Acknowledged writes lost** if the cache node dies before flush |
| **Write-around** | Cache-aside reads | Write to DB only; cache fills on later read | Avoids polluting cache with write-once data | First read after write is a miss |

```sort
prompt: Match each workload to the write strategy you'd reach for first.
buckets: [Cache-aside + delete on write, Write-through, Write-behind, Write-around]
items:
  - {text: 'Product catalogue: 200 reads per write, a few minutes of staleness acceptable', bucket: 0, why: 'The default: reads dominate, the DB stays authoritative, cache loss is survivable.'}
  - {text: 'Game leaderboard: millions of score increments/s, losing a few seconds of increments in a crash is tolerable', bucket: 2, why: 'Write-behind coalesces increments in memory and flushes in batches — accepting bounded loss is the explicit trade.'}
  - {text: 'User session/profile that is read immediately after every update, and must reflect it', bucket: 1, why: 'Write-through keeps the cache fresh after each write, so the read that follows is a hit with new data.'}
  - {text: 'Audit log entries: written constantly, almost never read back', bucket: 3, why: 'Caching data that will not be read just evicts useful entries. Write around the cache.'}
  - {text: 'Bank balance shown after a transfer', bucket: 1, why: 'Freshness after write matters, and write-behind would risk losing acknowledged money movements. Many teams simply read balances from the source.'}
explain: |
  Strategies differ in *where acknowledgement happens* and *which copy is fresh*. Ask: if the cache node vanished right now, what would be lost, and what would merely be slow?
```

## Hit rate, working set and sizing

The **working set** is the data actively read within the window your TTL covers. Size the cache for the working set, not the dataset. Skew is your friend: under Zipf-like access, caching the top 10–20% of keys often captures 80–95% of reads.

Use the simulator: requests follow a Zipf distribution over 20,000 keys, the cache is LRU with a TTL, and the red dashed line is what the database can take.

```sim
name: cache
title: Hit rate, skew and the database
config:
  controls: [rps, skew, size, ttl, dbCap]
  initial: {warm: true}
challenges:
  - {text: 'Bring the average database load under its 400 q/s capacity at 2,000 req/s (cache size and TTL are your levers)', metric: avgDb, op: '<', value: 400}
  - {text: 'Reach a 90% hit rate while caching at most half the keyspace (10,000 entries)', metric: hitRate, op: '>=', value: 90, and: [{metric: size, op: '<=', value: 10000}]}
  - {text: 'Now flatten the traffic: set skew to 0.6 and watch the same cache fall below a 70% hit rate', metric: hitRate, op: '<', value: 70, and: [{metric: skew, op: '<=', value: 0.6}]}
takeaway: |
  Hit rate is a property of the **workload and the cache together**. Skewed traffic makes a small cache powerful; flat traffic makes even a large cache weak. Shorter TTLs also cut hit rate because keys expire before they are reused. Even when the *average* fits, notice the spikes: keys loaded together at start-up share a TTL and expire together, and the first seconds of a cold cache send everything to the database. Averages size the steady state; spikes take you down. Synchronised expiry and stampedes are the subject of the hot-keys lesson.
```

```calc
title: Minimum hit rate for a database budget
prompt: Peak traffic is **40,000 reads/s**. The database should stay under **2,000 queries/s** (leaving headroom for writes). What is the minimum cache hit rate?
answer: 95
unit: '%'
tolerance: 1.02
hint: Allowed miss rate = database budget ÷ total reads.
steps: |
  Miss rate ≤ 2,000 ÷ 40,000 = 5%, so hit rate ≥ **95%**. Then ask the uncomfortable question: what happens during a cold start or a cache failure, when the hit rate is 0%? The database sees 40,000/s — 20× its budget. That is why the miss path needs protection (request coalescing, rate limiting, warming) and not just the steady state.
```

```faded
title: Sizing a product cache
prompt: Fill in the blanks of this sizing argument.
text: |
  The catalogue has 5M products, but analytics show the top 400k account for about 90% of views. Each serialised entry is about 2 KB.

  Working set in memory: 400,000 × 2 KB ≈ [[#800]] MB. Redis has per-key overhead, so budget roughly [[1.5–2×|1×|10×]], about 1.5 GB.

  At 30,000 reads/s and a 90% hit rate, the database sees [[#3000]] reads/s. Doubling the cache to hold 1M products might raise the hit rate to 96%, cutting database reads to [[#1200]]/s.

  Because one Redis node handles on the order of 100k ops/s, a single primary with a replica [[is enough for throughput|cannot possibly keep up|must be sharded twenty ways]]; we'd shard only for memory or failure-isolation reasons.
explain: The structure is what interviewers listen for — *working set × entry size × overhead*, then *requests × miss rate* for backend load, then a sanity check against per-node throughput.
```

## Eviction: what leaves when memory is full

When the cache reaches its memory limit, the eviction policy decides what to drop.

- **LRU** (least recently used): evict the key untouched for longest. Good default for recency-driven workloads. Redis implements an *approximated* LRU: it samples a few keys (default 5) and evicts the oldest of the sample, trading precision for zero bookkeeping overhead.
- **LFU** (least frequently used): evict the key with the lowest access frequency (with decay so old popularity fades). Better when popularity is stable and you must resist one-off scans. Redis offers `allkeys-lfu` / `volatile-lfu`.
- **TTL-based**: expired keys are removed; `volatile-*` policies only evict keys that have a TTL.
- **Random**: surprisingly competitive when access is uniform; cheap.

Modern in-process caches such as Caffeine use **W-TinyLFU**: a small recency window plus a frequency sketch that admits a new key only if it is likely to be more useful than the victim — robust against both recency and scan patterns.

> [!mistake] Redis's default policy is not LRU
> Out of the box `maxmemory-policy` is `noeviction`: when memory is full, writes **fail with errors**. For a pure cache you must set an eviction policy such as `allkeys-lru` or `allkeys-lfu` explicitly.

```predict
prompt: A nightly analytics job iterates over all 5M products, reading each one once through the same LRU cache that serves the website. The site's p99 latency spikes every morning. Why?
choices:
  - The analytics job holds locks on the products table
  - The scan touched millions of one-off keys, evicting the hot working set; the morning traffic misses until it is rebuilt
  - Redis forgets everything at midnight because TTLs reset daily
  - LRU caches cannot hold more than one million keys
answer: 1
reveal: |
  This is **scan pollution**. Under LRU, "recently used" is the only signal, so a one-pass scan makes cold keys look hot and pushes out the genuinely popular ones. Fixes: let batch jobs **bypass** the cache (or use their own), switch to **LFU**/W-TinyLFU, or read from a replica instead of through the cache.
```

## Keys, values and the misses you didn't plan for

**Key design.** Include everything that changes the value: `product:v3:{id}:{locale}:{currency}`. A version prefix lets you change the serialised format without reading old entries as new ones — but as the opening story showed, bumping it invalidates everything at once, so roll it out gradually or pre-warm.

**Per-user data.** Never cache a personalised value under a shared key. `profile:{id}` must still be authorised against the caller on every read; the cache is not an access-control layer.

**Cache penetration.** Requests for keys that don't exist always miss — a bot requesting random IDs sends every request to the database. Cache negative results (`NOT_FOUND`) with a short TTL, or front lookups with a **Bloom filter** of existing IDs.

**Large values.** A 2 MB value costs serialisation CPU and network on every hit, and a single hot large key can saturate one cache node's NIC. Cache the fields you need, compress, or split.

**Cold starts and failure.** After a flush, a new cluster, or a cache outage, hit rate is 0% and the database takes the full load. Plan for it: warm the cache from a snapshot or traffic replay, ramp traffic, coalesce concurrent misses, and shed load at the database tier rather than letting it fall over.

> [!senior] Two-level caching
> An in-process L1 cache (seconds of TTL) in front of Redis L2 removes a network hop for the hottest keys and protects Redis from hot-key overload. The new problem is invalidation: every API instance holds its own copy, so a `DEL` in Redis doesn't reach them. Teams use very short L1 TTLs, broadcast invalidations over pub/sub, or restrict L1 to data that tolerates seconds of staleness.

```bug
title: Review this cache code
prompt: This code shipped and caused two incidents. Click the lines that are wrong.
lang: python
code: |
  def get_profile(user_id, viewer_id):
      key = f"profile:{user_id}"
      cached = redis.get(key)
      if cached:
          return cached
      profile = db.fetch_profile(user_id, viewer=viewer_id)  # includes private fields if viewer == owner
      redis.set(key, profile)
      return profile

  def update_profile(user_id, fields):
      redis.set(f"profile:{user_id}", {**get_profile(user_id, user_id), **fields})
      db.update_profile(user_id, fields)
bug: [7, 11]
explain: |
  **Line 7** caches a viewer-specific result (it may include the owner's private fields) under a key that ignores the viewer, so the next stranger receives the owner's private data — and with no TTL the entry lives forever. **Line 11** writes the cache *before* the database and with a value derived from a possibly stale read; if the database update fails, the cache holds data that never existed, and concurrent writers can interleave. Fix: key by the variant (or cache only the public projection and authorise on read), set a TTL, and on writes update the database then `DEL` the key.
fix: |
  def get_profile(user_id, viewer_id):
      public = redis.get(f"profile:public:{user_id}")
      if public is None:
          public = db.fetch_public_profile(user_id)
          redis.set(f"profile:public:{user_id}", public, ex=300)
      if viewer_id == user_id:
          return {**public, **db.fetch_private_fields(user_id)}   # never shared-cached
      return public

  def update_profile(user_id, fields):
      db.update_profile(user_id, fields)
      redis.delete(f"profile:public:{user_id}")
```

```interview
ask: How would you design caching for a read-heavy, database-backed API, covering read and write behaviour, capacity planning, freshness and cache failures?
say: |
  "I'd put a cache-aside layer in front of the database for the read-heavy endpoints. Reads check Redis, fall back to the database on a miss and populate with a TTL; writes commit to the database and then delete the key. The database stays the source of truth, so losing the cache makes us slower, not wrong. I'd size it for the working set — roughly N hot items × entry size × ~1.5 overhead — and target a hit rate that keeps the database under its budget, while making sure the miss path survives a cold start."
followups:
  - q: Why delete on write instead of updating the cache?
    a: Concurrent writers can apply their cache SETs in a different order from their database commits, leaving an older value cached indefinitely. Deletes are order-insensitive, and the next read rebuilds from the source. It also avoids recomputing values nobody reads.
  - q: What happens if Redis goes down?
    a: Reads fall through to the database at 100% miss rate. If the database can't take that, we need protection — per-key request coalescing, a circuit breaker that serves degraded responses, load shedding — and a warm-up plan before restoring traffic.
  - q: How would you choose an eviction policy?
    a: LRU for recency-driven access; LFU (or W-TinyLFU in-process) when popularity is stable and batch scans could pollute the cache. And explicitly configure it — Redis defaults to noeviction.
  - q: When would you NOT add a cache?
    a: When reuse is low (uniform access), when every read must be strictly fresh, when the source is already fast enough with headroom, or when writes dominate reads. A cache is extra state with its own failure modes, so it needs a measured reason.
weak: |
  "I'll add Redis to make it fast." — No read/write path, no invalidation story, no idea of hit rate or what happens when the cache fails.
strong: |
  Names the pattern and both paths, explains delete-on-write and why, connects hit rate to database load with a number, plans the cold-start/failure path, and mentions one key-design or penetration detail. Then offers the trade-off: freshness bounded by TTL plus invalidation.
```

```recall
prompt: In your own words, explain the difference between **cache-aside** and **write-behind**, and describe what each one loses (or doesn't) if the cache cluster dies.
points:
  - Cache-aside: the application reads the cache, loads from the database on a miss, and writes go to the database (then invalidate)
  - Write-behind: writes are acknowledged once in the cache and flushed to the database asynchronously
  - Losing the cache in cache-aside loses no data, only performance (reads fall through to the database)
  - Losing the cache in write-behind can lose acknowledged writes that had not been flushed
model: |
  With cache-aside the database is always written first and remains the source of truth; the cache is a disposable copy filled on read misses. If the cache cluster dies, nothing is lost — reads fall through to the database, which must absorb the extra load. With write-behind the cache accepts the write and acknowledges it, and a background process flushes to the database later. That makes writes fast and lets you batch them, but if the cache dies before flushing, writes the client was told succeeded are gone. Use write-behind only where that bounded loss is explicitly acceptable.
```

```questions
- kind: check
  prompt: A cache serves 20,000 reads/s at a 95% hit rate. A deploy changes the key format and the hit rate drops to 80% while the cache refills. What happens to database read load?
  choices:
    - text: It quadruples, from about 1,000/s to about 4,000/s
      correct: true
    - text: It rises slightly, from about 1,000/s to about 1,200/s
      why: That would be the change in hits, not misses. Database load tracks the miss rate, which went from 5% to 20%.
    - text: It stays the same, because the number of requests is unchanged
      why: Every miss becomes a database query, so the request count alone doesn't determine database load.
    - text: It rises to 16,000/s
      why: 16,000/s is the number of hits at 80%. The database receives the misses — 20% of 20,000.
  explanation: Database load = requests × miss rate. 20,000 × 5% = 1,000/s becomes 20,000 × 20% = 4,000/s. Small drops in hit rate near the top cause large multiples in backend load.
- kind: check
  type: multi
  prompt: Why do most cache-aside designs **delete** the key on write instead of setting the new value? Select all that apply.
  choices:
    - text: Concurrent writers' cache SETs can land in a different order than their database commits, leaving an older value cached
      correct: true
    - text: The next read rebuilds the entry from the source of truth, keeping one code path responsible for cache contents
      correct: true
    - text: It avoids recomputing expensive derived values for keys that may never be read again
      correct: true
    - text: Deleting guarantees readers can never see stale data
      why: A slow reader can still refill an old value after the delete — the stale-refill race covered in the next lesson.
    - text: Deleting reduces the number of database reads
      why: It does the opposite — the next read is a guaranteed miss. You accept that cost for correctness and simplicity.
  explanation: Delete-on-write is order-insensitive across concurrent writers and keeps the read path as the only producer of cache entries. It narrows staleness windows but does not eliminate them on its own.
- kind: check
  type: order
  prompt: Put the steps of a cache-aside **read miss** in order.
  items:
    - Look up the key in the cache and get nothing back
    - Query the database for the record
    - Write the record into the cache with a TTL
    - Return the record to the caller
  explanation: Check the cache, fall through to the source on a miss, populate the cache for the next reader, respond. (Some implementations respond before populating; the order of the last two is a latency trade-off, not a correctness one.)
- kind: check
  level: advanced
  prompt: A nightly batch job reads every one of 5M products once through the same `allkeys-lru` Redis cache used by the website. Each morning the site's p99 latency spikes for an hour. What is the best explanation and fix?
  choices:
    - text: The scan evicts the hot working set (scan pollution); bypass the cache for the batch job or use an LFU-style policy
      correct: true
    - text: Redis is single-threaded, so the batch job blocks it; add more Redis threads
      why: The latency spike persists after the job finishes — that points to lost cache contents, not contention during the job.
    - text: The batch job's reads extend every key's TTL, so stale data is served in the morning
      why: Reads don't extend TTLs in Redis, and staleness wouldn't show up as a latency spike.
    - text: LRU caches cannot evict efficiently above one million keys
      why: Redis's approximated LRU samples a few keys per eviction, so it scales fine. The problem is *what* it evicts, not how fast.
  explanation: Under LRU a one-pass scan makes millions of cold keys look recently used and pushes out genuinely hot entries. Morning traffic then misses until the working set is rebuilt. Keep batch reads out of the serving cache, or use a frequency-aware policy (LFU, W-TinyLFU) that resists scans.
- kind: fire
  type: numeric
  prompt: Peak traffic is 60,000 reads/s and the database can safely serve 3,000 queries/s of reads. What minimum cache hit rate (in %) keeps it within budget?
  answer: 95
  unit: '%'
  tolerance: 0.006
  explanation: Allowed miss rate = 3,000 ÷ 60,000 = 5%, so the hit rate must be at least 95%. At a 0% hit rate (cold start, cache outage) the database would see 20× its budget.
- kind: fire
  prompt: A team switches from cache-aside to write-behind to speed up writes. What new risk must they accept or mitigate?
  choices:
    - text: Writes acknowledged to clients can be lost if a cache node fails before flushing to the database
      correct: true
    - text: Reads become slower because every read now goes to the database
      why: In write-behind, reads are served from the cache. The change affects where writes are acknowledged.
    - text: The cache can no longer evict keys
      why: Eviction still works, though dirty entries must be flushed before they are evicted.
    - text: Database writes become synchronous with every request
      why: The opposite — write-behind makes database writes asynchronous, which is both its benefit and its risk.
  explanation: Write-behind moves the acknowledgement point into the cache. Unless the cache is itself durable and replicated, a crash between acknowledgement and flush loses data the client believes is saved.
- kind: fire
  prompt: A scraper requests millions of random, non-existent product IDs. Each request misses the cache and queries the database. What is the most targeted mitigation?
  choices:
    - text: Cache "not found" results with a short TTL, or check IDs against a Bloom filter of existing products
      correct: true
    - text: Increase the TTL on existing products to 24 hours
      why: Existing products aren't the problem — the missing keys never get cached, so their TTL is irrelevant.
    - text: Switch the eviction policy to LFU
      why: Eviction decides what leaves the cache. These keys never enter it, so the policy doesn't help.
    - text: Add more read replicas so the database can absorb the misses
      why: That buys capacity but leaves an unbounded amplification path open to anyone who can generate IDs.
  explanation: This is cache penetration. Negative caching stores the absence itself; a Bloom filter answers "definitely not present" without touching the database. Rate limiting the client is a sensible complement.
- kind: fire
  level: advanced
  prompt: You add a 10-second in-process L1 cache on each of 40 API servers in front of Redis. What is the main new correctness problem?
  choices:
    - text: An invalidation in Redis doesn't reach the 40 local copies, so servers can serve old values for up to the L1 TTL
      correct: true
    - text: Redis will evict more keys because it receives fewer reads
      why: Fewer reads means less load on Redis. Eviction depends on memory pressure, not read volume.
    - text: The L1 cache makes the database the bottleneck
      why: An extra cache layer reduces traffic further down the stack, not more.
    - text: In-process caches cannot use LRU
      why: They can, and libraries like Caffeine use even better admission policies.
  explanation: Each instance holds an independent copy. Deleting the Redis key doesn't touch them. Bound the L1 TTL to what the data tolerates, or broadcast invalidations (e.g. pub/sub) to every instance.
- kind: fire
  type: multi
  prompt: In which situations is a cache likely **not** worth adding? Select all that apply.
  choices:
    - text: Each request reads a different key and keys are rarely repeated
      correct: true
    - text: Every read must reflect the very latest committed write
      correct: true
    - text: The source query takes 1 ms and the database runs at 15% utilisation at peak
      correct: true
    - text: A product page is read 500 times for each edit and tolerates a minute of staleness
      why: High reuse plus tolerated staleness is the ideal caching workload.
    - text: A celebrity profile receives a large share of all reads
      why: Skewed, hot reads are exactly where caches pay off — though hot keys need their own protection.
  explanation: Caches pay off with reuse, tolerated staleness and an expensive or constrained source. Without those, they add state, cost and failure modes for little gain.
```
