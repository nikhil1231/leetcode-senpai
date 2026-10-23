---
id: hot-keys
category: caching
skill: capacity
title: Hot keys, stampedes and cache failure
minutes: 16
summary: Averages size a cache; skew and synchrony break it. One celebrity key can saturate one node no matter how many you add, one expiry can send thousands of identical queries to the database at once, and one cache outage can turn a healthy database into the bottleneck. Each has a specific, nameable fix.
objectives:
  - Recognise why sharding many keys doesn't spread load for one hot key, and apply local caching, key splitting or sharded counters
  - Explain cache stampedes and prevent them with request coalescing, leases, early refresh, stale-while-revalidate and jitter
  - Plan for cache failure so the database degrades gracefully instead of collapsing
sources:
  - ['Vattani et al., Optimal Probabilistic Cache Stampede Prevention (VLDB 2015)', 'https://www.vldb.org/pvldb/vol8/p886-vattani.pdf']
  - ['Nishtala et al., Scaling Memcache at Facebook (NSDI 2013)', 'https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala']
  - ['Redis: client-side caching', 'https://redis.io/docs/latest/develop/reference/client-side-caching/']
case: links
---

> [!story] The Justin Bieber problem
> Early Instagram engineers described a recurring incident: when one of the most-followed accounts posted, likes and comments on that single photo arrived so fast that the cache and database shard holding it were overwhelmed — while the rest of the cluster sat idle. Twitter, Facebook and every social product since have a version of it. Sharding spreads *keys*; it does nothing for *one* key that a large share of all traffic wants.

```predict
prompt: A Redis cluster has 16 shards, keys hashed evenly. One key now receives **30%** of all reads, and its shard is at 100% CPU. What happens if you grow the cluster to 32 shards?
choices:
  - The hot key's load halves because there are twice as many shards
  - Nothing useful — the key still lives on exactly one shard, which still gets 30% of all reads
  - Load spreads automatically because Redis replicates hot keys
  - The hot shard gets worse because rebalancing moves more keys onto it
answer: 1
reveal: |
  A key maps to one shard. Doubling shards halves the share of *other* keys on that node but the hot key's own traffic is unchanged — the node stays saturated. You must change how that key is served: cache it locally, replicate or split it across several keys, or put it behind a CDN.
```

## Why one key can sink a node

Per-node limits are real and lower than people assume:

> [!numbers] Back-of-envelope ceilings for one cache node
> - ~**100k–200k** simple ops/s per Redis process (single-threaded command execution; more with I/O threads or pipelining)
> - A 10 Gbps NIC moves ~1.2 GB/s: at **50 KB per value** that's only ~25k reads/s, regardless of CPU
> - A "global" key read on every request — a feature-flag blob, a homepage module, a rate-limit config — is hot by construction

Hot keys come from celebrity content, viral items, flash sales, global configuration, and counters that everyone increments (likes, views, inventory).

## Fixing read-hot keys

1. **In-process L1 cache.** Each API instance keeps the hot value in memory for a few seconds. With 200 instances, the cache node sees at most ~200 reads per TTL instead of 300,000/s. Cost: up to *TTL* seconds of staleness per instance.
2. **Key splitting (replication by suffix).** Store `product:42#0` … `product:42#7` on different shards. Readers pick a random suffix; writers update (or invalidate) all copies. Load per shard drops by the copy count.
3. **Read replicas** of the cache shard, if your cache supports routing reads to replicas.
4. **CDN** for anything public: the edge absorbs it before it reaches you.

```calc
title: How many copies of a hot key?
prompt: A product key receives **300,000 reads/s** during a flash sale. Each cache shard can serve **100,000 ops/s**, and you want to run shards at no more than **50%** to absorb spikes. How many split copies of the key do you need?
answer: 6
unit: copies
tolerance: 1.01
steps: |
  Budget per shard = 100,000 × 50% = 50,000 reads/s. Copies = 300,000 ÷ 50,000 = **6**, spread over 6 different shards. With an in-process L1 cache of even 1 s on 100 API servers, the cache would see about 100 reads/s for this key — often the cheaper fix, if one second of staleness is acceptable.
```

## Fixing write-hot keys

A like counter incremented 50,000 times a second can't be fixed by read replicas: every write must land somewhere.

- **Sharded counters:** keep N sub-counters (`likes:42:0..N-1`), increment a random one, sum them on read (and cache the sum briefly).
- **Batching / write-behind:** aggregate increments in memory or a stream for a second and apply one `INCRBY 1834` instead of 1,834 `INCR`s. You trade exactness-right-now for throughput, which is fine for display counters.
- **Don't make it one key:** per-user "has liked" state and the aggregate count have different freshness needs; store them separately.

```faded
title: Designing a sharded like counter
prompt: Fill in the design.
text: |
  The counter `likes:post:42` receives up to 60,000 increments/s, and one shard handles about 100,000 ops/s. Instead of one key we keep 16 sub-counters, `likes:post:42:{0..15}`. Each like increments [[one randomly chosen sub-counter|all 16 sub-counters|the first sub-counter]], so each sub-counter receives about [[#3750]] increments/s.

  To display the total we read all 16 and add them, which costs [[16 reads|1 read|60,000 reads]] per display — so we cache the total for a couple of seconds, accepting that the displayed count can lag slightly.

  Whether *this user* already liked the post must be exact, so it lives in [[a separate per-user record|the sub-counters|the cached total]].
explain: Spreading writes over N keys divides per-key write load by N and multiplies read cost by N. Then you cache the expensive read, because a display counter tolerates seconds of staleness.
```

## The stampede (dogpile)

When a hot key expires, every request that arrives before someone refills it misses — and each one goes to the database to recompute the *same* value.

At 10,000 reads/s on one key with a 200 ms recomputation, about **2,000 identical queries** start in the window before the first refill lands. If the query is expensive, the database slows down, so the window grows, so more queries pile in: a positive feedback loop.

Experiment with it. The cache starts warm with every key sharing the same TTL; watch what happens at each expiry, during an outage, and with each defence.

```sim
name: cache
title: Stampedes, synchronised expiry and outages
config:
  controls: [rps, ttl, dbLatency, jitter, coalesce, warm, outage, dbCap]
  initial: {size: 20000, ttl: 30, skew: 1.2, rps: 3000, dbCap: 900, dbLatency: 400}
challenges:
  - {text: 'Turn on request coalescing and watch duplicate refills of the same key drop to zero', metric: dupes, op: '==', value: 0, and: [{metric: coalesce, op: '==', value: 1}]}
  - {text: 'Turn on TTL jitter and flatten the synchronised expiry spikes (peak after warm-up below 600 q/s)', metric: steadyPeak, op: '<', value: 600, and: [{metric: jitter, op: '==', value: 1}]}
  - {text: 'With both defences on, keep the database under capacity for the whole run', metric: overloadSeconds, op: '==', value: 0, and: [{metric: coalesce, op: '==', value: 1}, {metric: jitter, op: '==', value: 1}, {metric: outage, op: '==', value: 0}]}
  - {text: 'Now simulate the cache outage. How long is the database over capacity, even with every defence on?', metric: overloadSeconds, op: '>=', value: 5, and: [{metric: outage, op: '==', value: 1}]}
takeaway: |
  **Coalescing** removes duplicate refills of the same key; **jitter** stops independent keys expiring in lockstep. Neither helps when the cache itself is gone: then every request is a miss and the database must be protected by other means — load shedding, concurrency limits, serving stale data from local caches, and warming before traffic returns.
```

### Defences, from simplest to strongest

| Technique | How it works | Trade-off |
|---|---|---|
| **TTL jitter** | `ttl = base × random(0.8, 1.2)` so keys loaded together don't expire together | Spreads *many* keys; does nothing for one hot key |
| **Request coalescing (single-flight)** | Per process, the first miss for a key fetches; concurrent misses wait for its result | Per-instance: 200 instances can still send 200 queries |
| **Distributed lock / lease** | One caller cluster-wide gets the right to refill; others wait briefly or serve stale | Lock needs a timeout; waiters need a fallback |
| **Stale-while-revalidate** | Keep serving the expired value while one caller refreshes in the background | Briefly serves stale data — usually fine for hot read data |
| **Probabilistic early refresh** | Each reader may refresh *before* expiry, more likely as expiry nears | No coordination; refreshes slightly more often |

Probabilistic early expiration (the "XFetch" algorithm from Vattani et al.) is short enough to write in an interview:

```python
def get(key, ttl, beta=1.0):
    value, delta, expiry = cache.get_with_meta(key)   # delta = how long the last recompute took
    # Refresh early with probability rising as expiry approaches and as recompute cost grows.
    if value is None or time.time() - delta * beta * math.log(random.random()) >= expiry:
        start = time.time()
        value = recompute(key)
        delta = time.time() - start
        cache.set(key, value, delta=delta, ttl=ttl)
    return value
```

Because `-log(random())` is usually small but occasionally large, one reader tends to refresh a little before expiry, long before the herd arrives.

```bug
title: A refill lock that makes things worse
prompt: This "only one refiller" code took down the database during the next stampede. Which lines are wrong?
lang: python
code: |
  def get_hot(key):
      value = redis.get(key)
      if value is not None:
          return value
      if redis.set(f"lock:{key}", "1", nx=True):      # acquired refill lock
          value = db.expensive_query(key)
          redis.set(key, value, ex=300)
          redis.delete(f"lock:{key}")
          return value
      while True:                                     # someone else is refilling
          value = redis.get(key)
          if value is not None:
              return value
bug: [5, 10]
explain: |
  **Line 5** takes the lock with **no expiry**: if the refilling process crashes or times out, the lock is never released, and every request for the key waits forever. Use `nx=True, ex=10` (and ideally a token so you only delete your own lock). **Line 10** makes waiters spin on Redis in a tight loop with no sleep and no deadline — thousands of busy loops hammering the cache node. Waiters should back off briefly, give up after a deadline, and ideally serve a stale copy instead of waiting.
fix: |
  def get_hot(key):
      value, stale = redis.get(key), redis.get(f"stale:{key}")
      if value is not None:
          return value
      token = uuid4().hex
      if redis.set(f"lock:{key}", token, nx=True, ex=10):
          value = db.expensive_query(key)
          redis.set(key, value, ex=300); redis.set(f"stale:{key}", value, ex=3600)
          release_if_owner(f"lock:{key}", token)   # Lua compare-and-delete
          return value
      if stale is not None:
          return stale                              # serve stale rather than wait
      for _ in range(20):                           # bounded wait with backoff
          time.sleep(0.05)
          if (value := redis.get(key)) is not None:
              return value
      raise Unavailable()
```

## When the cache itself fails

A cache node restart, a failover, a network partition or a mass eviction drops the hit rate to near zero. If the database is sized for the miss traffic at a 95% hit rate, it is now **20× over budget**.

> [!senior] Design the miss path as a production path
> - **Bound concurrency to the database** (connection pool limits, a semaphore around expensive queries) so overload produces fast errors instead of a database meltdown.
> - **Shed load deliberately**: serve a degraded page (no recommendations, cached-yesterday counts) rather than timing out everything.
> - **Keep a local stale copy** of the hottest values in-process as a fallback.
> - **Warm before traffic returns**: replay recent keys or ramp traffic gradually after a cluster replacement.
> - **Replicate the cache** with automatic failover, and don't flush caches casually during incidents.

```incident
title: Redis failover at peak
intro: |
  Friday 19:02, peak traffic. The Redis primary for the product cache crashes; the replica is promoted in ~20 s, but the promoted replica's memory turns out to be nearly empty (replication had been broken for days). Hit rate drops from 97% to 5%. The Postgres primary is at 100% CPU, API p99 is 12 s, and the error rate is climbing.
start: s1
nodes:
  s1:
    text: What do you do first?
    options:
      - {label: 'Enable the pre-built "degraded mode" flag: product pages drop recommendations and reviews, and the API caps concurrent DB queries per instance', next: s2, quality: good, note: 'Cut load on the bottleneck immediately; fail fast instead of queueing.'}
      - {label: 'Scale the API tier from 60 to 120 instances', next: bad1, quality: bad, note: 'More instances means more concurrent database queries. The database is the bottleneck.'}
      - {label: 'Restart the database to clear the backlog', next: bad2, quality: bad, note: 'A restart drops in-flight work and comes back cold, into the same flood.'}
  bad1:
    text: Database connections jump from 600 to 1,200, the connection limit is hit, and the error rate goes to 60%. You now also have to scale back down.
    options:
      - {label: 'Roll back the scale-up and enable degraded mode', next: s2, quality: good}
  bad2:
    text: Two minutes of total outage while Postgres restarts and recovers, then the same overload returns because the cache is still empty.
    verdict: bad
  s2:
    text: Database CPU drops to 85%, p99 falls to 900 ms, errors stop rising. The cache is filling but the hit rate is only at 40%. A teammate suggests a script that warms the cache by loading all 5M products as fast as possible.
    options:
      - {label: 'Warm only the top 50k products by recent traffic, rate-limited to stay under the database budget', next: s3, quality: good, note: 'Warm the working set, not the dataset, without creating a second overload.'}
      - {label: 'Run the full-speed warm-up of all 5M products', next: bad3, quality: bad, note: 'The warm-up becomes the new stampede and evicts what traffic is warming organically.'}
      - {label: 'Do nothing and let traffic warm the cache', next: s3b, quality: ok}
  bad3:
    text: The warm-up saturates the database again and pushes recently fetched hot products out of a cache that is smaller than the whole catalogue. p99 is back to 8 s.
    verdict: bad
  s3b:
    text: It works, slowly — 25 minutes in degraded mode before the hit rate recovers to 95%.
    verdict: ok
  s3:
    text: Within six minutes the hit rate is back to 95%; you turn degraded mode off gradually. In the post-mortem, what's the most important follow-up?
    options:
      - {label: 'Alert on replication health and on cache hit rate, and test failover with a realistic cache size regularly', next: done, quality: good}
      - {label: 'Double the size of the Redis instance', next: done2, quality: ok}
  done:
    text: The real failure was undetected broken replication plus a miss path that had never been exercised. You make both visible and practise them.
    verdict: good
  done2:
    text: Memory wasn't the problem. Without monitoring replication and testing failover, the same incident can recur on a bigger instance.
    verdict: ok
debrief: |
  Protect the bottleneck first (shed load, cap concurrency, fail fast) — adding callers to an overloaded database makes it worse. Then recover the working set gradually, not the dataset all at once. Finally fix what made the failure possible *and* invisible.
```

```interview
say: |
  "Two different problems. For a read-hot key, sharding doesn't help because the key lives on one node, so I'd add a short in-process cache in front of Redis, or split the key into N copies on different shards; write-hot counters get sharded sub-counters or batched increments. For stampedes I'd coalesce concurrent misses with single-flight per instance plus a lease or short lock cluster-wide, serve stale while revalidating, and jitter TTLs so keys don't expire together. And I'd treat a cache outage as a real scenario: cap database concurrency, have a degraded mode, and warm gradually."
followups:
  - q: How do you detect hot keys?
    a: Sample commands at the cache (e.g. Redis `--hotkeys` with an LFU policy, or proxy-side sampling), track per-shard CPU and network imbalance, and log top keys per minute in the client library. Hot keys usually show up as one shard far busier than the rest.
  - q: Single-flight is per process. Isn't that still a stampede across 200 instances?
    a: It turns N thousand queries into at most 200, which is often enough. If not, add a cluster-wide lease or short lock with a timeout, and let losers serve a stale copy rather than wait.
  - q: What's wrong with refreshing hot keys from a cron job before they expire?
    a: It works for a known, small set, but it doesn't adapt to keys that become hot unexpectedly, and the cron becomes a single point of failure. Early probabilistic refresh or stale-while-revalidate adapts automatically.
weak: |
  "Add more Redis shards and a bigger database." — Neither spreads one hot key nor stops identical concurrent recomputes.
strong: |
  Distinguishes read-hot, write-hot and stampede; picks targeted fixes for each with their costs; quantifies copies or L1 effect; plans the cache-failure path with load shedding and controlled warm-up.
```

```recall
prompt: Explain why request coalescing and TTL jitter solve *different* problems, with an example of each.
points:
  - Coalescing merges concurrent misses for the same key so only one refill hits the database
  - Example of coalescing — a single hot key expiring under heavy traffic (a stampede)
  - Jitter randomises expiry times so many keys loaded at the same time don't expire at the same time
  - Example of jitter — a warm-up or deploy that filled many keys at once, causing periodic synchronised miss spikes
model: |
  Coalescing is about one key: when a hot key expires, hundreds of concurrent requests miss together, and single-flight lets one of them recompute while the rest wait for its result — so the database sees one query instead of hundreds. Jitter is about many keys: if a warm-up loaded 100k keys at 09:00 with a 30-minute TTL, they all expire at 09:30 and the database gets a spike of distinct misses. Randomising each TTL by ±20% spreads those expiries out. A hot key needs coalescing; synchronised expiry needs jitter.
```

```questions
- kind: check
  prompt: One key gets 25% of all reads and its cache shard is saturated. Which change actually relieves that shard?
  choices:
    - text: Serve the key from a short-lived in-process cache on each API server, or split it into copies on several shards
      correct: true
    - text: Double the number of shards in the cluster
      why: The key still hashes to a single shard, which still gets 25% of all reads.
    - text: Switch the eviction policy from LRU to LFU
      why: Eviction decides what leaves the cache. The hot key is already cached; the problem is the request rate.
    - text: Lower the key's TTL
      why: That causes more refills and more misses without spreading reads.
  explanation: Sharding distributes keys, not the traffic to one key. Local caching cuts reads before they reach the cache tier; key splitting spreads them over several shards.
- kind: check
  type: multi
  prompt: Which techniques reduce the number of identical database queries when a hot key expires? Select all that apply.
  choices:
    - text: Request coalescing (single-flight) per process
      correct: true
    - text: A short-lived lease or lock so one caller refills while others wait or serve stale
      correct: true
    - text: Stale-while-revalidate, refreshing in the background while serving the old value
      correct: true
    - text: Probabilistic early refresh before the TTL expires
      correct: true
    - text: Adding TTL jitter to that one key
      why: Jitter shifts when the key expires, not how many callers rush to refill it.
  explanation: Stampedes are concurrent identical refills. Coordinating them (single-flight, leases), avoiding the empty moment (stale-while-revalidate) or refreshing early all help. Jitter spreads expiries across *different* keys.
- kind: check
  type: numeric
  prompt: A hot key receives 240,000 reads/s. Each cache shard serves 120,000 ops/s and you want each at no more than 50%. How many split copies of the key are needed?
  answer: 4
  unit: copies
  tolerance: 0.01
  explanation: Budget per shard = 120,000 × 0.5 = 60,000. 240,000 ÷ 60,000 = 4 copies on 4 different shards. Writers must update or invalidate all copies.
- kind: check
  level: advanced
  prompt: Your database is sized for traffic at a 96% cache hit rate. The cache cluster fails and the hit rate drops to near zero. By roughly what factor does database read load increase?
  choices:
    - text: About 25×
      correct: true
    - text: About 4×
      why: That treats 4% as the change. Database load scales with the miss rate, which goes from 4% to 100%.
    - text: About 1.04×
      why: That confuses the hit rate with the load multiplier.
    - text: It stays the same, because the number of requests hasn't changed
      why: Every request that used to hit the cache now reaches the database.
  explanation: Load goes from 4% of requests to 100% of requests — 25×. That's why the miss path needs concurrency limits, load shedding and warm-up plans, not just a bigger cache.
- kind: fire
  prompt: A deploy warms 100,000 keys at 09:00 with a 30-minute TTL. Every 30 minutes the database sees a sharp spike of misses. What's the most targeted fix?
  choices:
    - text: Add random jitter to each key's TTL so the expiries spread out
      correct: true
    - text: Enable request coalescing
      why: These are distinct keys expiring at once. Coalescing merges concurrent requests for the same key.
    - text: Increase the TTL to 60 minutes
      why: The spikes would still come, just half as often.
    - text: Shard the cache further
      why: The misses go to the database regardless of how the cache is sharded.
  explanation: Synchronised expiry of many keys loaded together is fixed by randomising TTLs. Coalescing handles many requests for one key.
- kind: fire
  prompt: A like counter receives 80,000 increments per second on a single key. What's a standard fix?
  choices:
    - text: Split it into N sub-counters incremented at random, sum them on read, and cache the sum briefly
      correct: true
    - text: Add read replicas for the key
      why: Replicas spread reads. Every increment still has to land on the primary.
    - text: Put the counter behind a CDN
      why: CDNs cache responses to reads. They don't absorb writes.
    - text: Lower the TTL of the counter
      why: TTL has nothing to do with write throughput.
  explanation: Sharded counters divide write load by N at the cost of N reads per total. Batching increments (write-behind) is the other common approach for display counters.
- kind: fire
  prompt: In XFetch-style probabilistic early refresh, why does the refresh probability depend on how long the last recomputation took?
  choices:
    - text: Expensive values should start refreshing earlier, so the new value is ready before the old one expires
      correct: true
    - text: Slow recomputations should be skipped entirely
      why: They still have to happen. The algorithm only decides how early to start them.
    - text: It ensures every reader refreshes the key
      why: It's designed so that usually only one reader refreshes, a little before expiry.
    - text: It measures network latency to the cache
      why: The delta is recomputation time, not cache latency.
  explanation: The check `now - delta·β·ln(rand) ≥ expiry` makes refresh likelier as expiry nears and as recompute cost (delta) grows, so costly values are rebuilt before the herd arrives, with no coordination.
- kind: fire
  type: multi
  level: advanced
  prompt: The cache cluster is down and the database is overloaded. Which actions help? Select all that apply.
  choices:
    - text: Cap concurrent database queries per API instance so excess requests fail fast
      correct: true
    - text: Switch to a degraded mode that skips non-essential queries
      correct: true
    - text: Serve stale values from in-process caches where acceptable
      correct: true
    - text: Double the number of API instances
      why: More instances mean more concurrent queries against the bottleneck.
    - text: Retry failed database queries immediately, without backoff
      why: Immediate retries multiply load on a resource that's already overloaded.
  explanation: Protect the bottleneck. Limit concurrency, drop optional work, use what you already have, and avoid anything that multiplies load. Then warm the working set gradually.
- kind: fire
  prompt: A refill lock is taken with `SET lock:k 1 NX` and no expiry. What's the danger?
  choices:
    - text: If the holder crashes before deleting it, the lock is never released and every caller for that key is stuck
      correct: true
    - text: NX allows two callers to acquire it at once
      why: NX is atomic. Only one caller can set it.
    - text: Redis will evict the lock immediately
      why: An unexpired key can be evicted under memory pressure, but that isn't the main danger here.
    - text: The lock makes reads slower for other keys
      why: It only affects the one key.
  explanation: Locks need a lease (expiry) so a crashed holder can't block everyone forever, and a token so a slow holder doesn't delete a lock someone else now owns. Waiters need a deadline and ideally a stale fallback.
```
