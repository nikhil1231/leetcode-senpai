---
id: consistent-hashing
category: distributed
skill: capacity
title: Consistent hashing
minutes: 14
summary: With hash-mod-N, adding one server reshuffles almost every key. Consistent hashing places servers and keys on the same ring so that a membership change moves only about 1/N of the keys. Virtual nodes even out the load, replicas go to the next distinct servers on the ring, and variants such as rendezvous, jump and bounded-load hashing fix its remaining weaknesses.
objectives:
  - Explain why modulo hashing remaps most keys on resize and how the ring avoids it
  - Use virtual nodes to balance load and to weight heterogeneous servers
  - Place replicas on the ring across distinct physical nodes and failure domains
  - Compare rendezvous (HRW), jump consistent hashing and bounded-load hashing, and know where each is used
sources:
  - ['Karger et al., Consistent Hashing and Random Trees (STOC 1997)', 'https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf']
  - ['DeCandia et al., Dynamo: Amazon’s Highly Available Key-value Store (SOSP 2007)', 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf']
  - ['Google Research: Consistent hashing with bounded loads', 'https://research.google/blog/consistent-hashing-with-bounded-loads/']
---

> [!story] The cache resize that took down the database
> A team ran 10 memcached servers and picked one per key with `hash(key) % 10`. Traffic grew, so they added an 11th server on a Tuesday afternoon. About 90% of keys suddenly mapped to a different server — which didn't have them. The cache hit rate fell from 95% to under 10% in seconds, and the database behind it, sized for a 5% miss rate, collapsed. The client library had offered "ketama" consistent hashing all along; turning it on would have moved about one key in eleven.

## Why modulo fails

With `server = hash(key) % N`, a key stays put when N changes only if its hash happens to give the same remainder for both values. Going from N to N + 1, that's about 1/(N + 1) of keys — so roughly **N/(N + 1) of all keys move**: 91% when going from 10 to 11 servers.

## The ring

Map the hash space onto a circle (0 … 2³² − 1, wrapping around). Hash each **server** to points on the ring, and hash each **key** too. A key belongs to the first server found **clockwise** from it.

- **Adding** a server takes over only the keys between it and its counter-clockwise neighbour — about 1/N of all keys, all taken from one neighbour.
- **Removing** a server hands its keys to its clockwise neighbour; nothing else moves.

```sim
name: hashring
title: Ring versus modulo
config: {nodes: 4, vnodes: 1}
challenges:
  - {text: 'Add a node with 1 virtual node each, and compare how many keys move on the ring versus with modulo', metric: moved, op: '<', value: 40, and: [{metric: vnodes, op: '==', value: 1}]}
  - {text: 'With 1 virtual node per server the load is lopsided. Raise virtual nodes until the busiest node holds under 1.2× its fair share', metric: maxRatio, op: '<', value: 1.2}
  - {text: 'Turn on the celebrity key: one node takes far more traffic however balanced the keys are', metric: hot, op: '==', value: true}
takeaway: |
  The ring moves roughly 1/N of keys per change; modulo moves nearly all of them. But with one point per server, random placement leaves some servers owning much bigger arcs. **Virtual nodes** — 100–200 points per server — average that out. No placement scheme spreads a single hot key, though: that needs replication or splitting of the key itself (see the hot-keys lesson).
```

```calc
title: How many keys move?
prompt: A ring with virtual nodes balances **100 million** keys across **20** servers. You add a **21st** server with the same weight. About how many **million** keys move?
answer: 4.8
unit: million keys
tolerance: 1.08
steps: |
  The new server should end up with 1/21 of the keys: 100M ÷ 21 ≈ **4.8 million**, taken in small slices from all the others (thanks to virtual nodes). With modulo, 20/21 ≈ 95 million keys would move. For a cache that's the difference between a 5% hit-rate dip and a cold cache.
```

## Virtual nodes

With a single point per server, arc sizes vary wildly; some servers own twice their fair share. **Virtual nodes** place each server at many points (`node-3#0`, `node-3#1`, …). Benefits:

- **Balance:** with ~100+ points per server, every server's total arc is close to 1/N.
- **Spread on change:** a new server takes small slices from *every* existing server rather than one big slice from one neighbour; a failed server's load spreads across all the survivors.
- **Weighting:** give a server with twice the capacity twice as many virtual nodes.

```faded
title: Look up a key on the ring
prompt: Complete the lookup algorithm.
text: |
  Keep the virtual-node positions in an array sorted by hash, each with its physical server. To find a key's owner, compute `h = hash(key)` and [[binary-search for the first position ≥ h|scan every server and pick a random one|take h mod the number of servers]], which costs O(log V) for V virtual nodes.

  If `h` is greater than every position, wrap around to [[the first position in the array|the last position|a random position]], because the ring is circular.

  For replication factor 3, keep walking clockwise from that position and collect the next [[3 distinct physical servers (skipping virtual nodes of servers already chosen)|3 virtual nodes, whatever server they belong to|3 random servers]], ideally in different availability zones.
explain: The ring is just a sorted array plus a binary search. The subtle part is replica selection — with virtual nodes, consecutive points often belong to the same physical machine, so you must skip duplicates.
```

```bug
title: Replica placement on a ring
prompt: This function chooses 3 replicas for a key. The cluster uses 128 virtual nodes per server across 3 zones. Which lines are wrong?
lang: python
code: |
  def replicas(key, ring, n=3):
      i = bisect.bisect_left(ring.positions, stable_hash(key))
      chosen = []
      while len(chosen) < n:
          vnode = ring.vnodes[i % len(ring.vnodes)]
          chosen.append(vnode.server)
          i += 1
      return chosen
bug: [6]
explain: |
  **Line 6** appends whatever physical server owns each successive virtual node. With 128 virtual nodes per server, two or three consecutive points often belong to the **same** machine, so "3 replicas" can be one server listed three times — and one disk failure loses the data. Skip servers already chosen, and preferably skip servers in a zone already chosen too. Dynamo calls this a "preference list" of distinct physical nodes.
fix: |
  def replicas(key, ring, n=3):
      i = bisect.bisect_left(ring.positions, stable_hash(key))
      chosen, zones = [], set()
      while len(chosen) < n:
          s = ring.vnodes[i % len(ring.vnodes)].server
          if s not in chosen and s.zone not in zones:
              chosen.append(s); zones.add(s.zone)
          i += 1
      return chosen
```

## Variants worth knowing

| Algorithm | Idea | Strengths | Used in |
|---|---|---|---|
| **Ring + virtual nodes** | First server clockwise | Well understood; supports replication walks | Dynamo, Cassandra, Riak, memcached ketama |
| **Rendezvous / HRW** | Score every server with `hash(key, server)`; pick the highest | No ring, perfect balance, minimal movement; easy top-k for replicas | Some CDNs and load balancers, Ceph-like placement ideas |
| **Jump consistent hash** | A tiny arithmetic function maps a key to bucket 0..N−1 | No memory, perfectly even; but buckets can only be added or removed at the end | Sharded storage with numbered shards |
| **Maglev hashing** | Precomputed lookup table with near-even load and minimal disruption | O(1) lookup at line rate | Google's Maglev load balancer |
| **Bounded loads** | Consistent hashing, but a server above (1 + ε) × average load passes the key on | Caps hot servers with only slightly more movement | Google Cloud Pub/Sub, HAProxy, Vimeo |

```predict
prompt: A load balancer uses consistent hashing on user ID so each user's requests reach the same backend (useful for local caches). One backend dies. What happens to users?
choices:
  - Every user is reassigned to a new backend, and all local caches go cold
  - Only that backend's users move — spread across the survivors if virtual nodes are used — while everyone else stays put
  - Users on the dead backend get errors until it returns
  - The load balancer switches to round robin
answer: 1
reveal: |
  That's the whole point: membership changes only affect the keys owned by the changed node. With virtual nodes, its users spread across all remaining backends instead of doubling one neighbour's load. Their local cache entries are lost, but nobody else's are.
```

```sort
prompt: Where is consistent (or rendezvous) hashing the right tool?
buckets: [Good fit, Not the point]
items:
  - {text: 'A client choosing which of 40 cache servers holds a key', bucket: 0, why: 'Adding or removing a cache server should move as few keys as possible.'}
  - {text: 'A Dynamo-style store placing keys and their replicas on nodes', bucket: 0, why: 'The original use case: incremental growth with minimal data movement.'}
  - {text: 'Making one viral key spread across many servers', bucket: 1, why: 'Any deterministic key → server mapping sends one key to one place. Hot keys need splitting or replication.'}
  - {text: 'Routing a user to the same backend to reuse a warm local cache, tolerating backend churn', bucket: 0, why: 'Affinity that survives membership changes for most users.'}
  - {text: 'Enforcing a uniqueness invariant across shards', bucket: 1, why: 'Placement says nothing about cross-shard correctness.'}
```

```interview
ask: How would you distribute keys and replicas across a 20-node distributed cache as it grows, accounting for node failures, unequal server capacities, zone outages and hot keys?
say: |
  "Cache nodes are chosen with consistent hashing — a ring with about 150 virtual nodes per server — so adding the 21st node moves around 5% of keys instead of 95%, and a failure spreads its load evenly over the survivors. Bigger nodes get proportionally more virtual nodes. For replicated storage we walk clockwise to the next three distinct servers in different zones. If we needed tighter balance under skew, I'd use consistent hashing with bounded loads; hot individual keys are handled separately, by splitting them."
followups:
  - q: Why virtual nodes?
    a: With one point per server, random arcs are very uneven, and a failure dumps all its load on one neighbour. Many points per server balance ownership, spread changes across all servers, and allow weighting.
  - q: How is rendezvous hashing different?
    a: Each key scores every server with a hash and picks the highest — no ring, naturally balanced, and only the keys whose winner changes move. It costs O(N) per lookup, which is fine for tens to hundreds of servers.
  - q: Does consistent hashing solve hot keys?
    a: No. It spreads many keys evenly, but each key still maps to one server. Hot keys need replication, splitting or caching.
weak: |
  "Use consistent hashing to make it scale." Can't explain what moves on resize, or why virtual nodes and replica placement matter.
strong: |
  Explains modulo remapping versus ring movement with numbers, uses virtual nodes for balance and weighting, places replicas on distinct nodes and zones, knows the alternatives, and separates key distribution from hot keys.
```

```recall
prompt: Explain why adding a server to a consistent-hashing ring moves only about 1/N of the keys, and why virtual nodes are used.
points:
  - Keys and servers are hashed onto the same ring; each key belongs to the next server clockwise
  - A new server takes only the keys on the arc between itself and its predecessor; every other key keeps its owner
  - That's about 1/N of keys for an evenly balanced ring, versus nearly all keys with hash mod N
  - Virtual nodes (many points per server) even out arc sizes, spread moved keys across all servers, and allow weighting by capacity
model: |
  Both servers and keys are hashed onto a circle, and a key belongs to the first server clockwise from it. Adding a server only claims the keys on the arc just before it — previously owned by its clockwise neighbour — so every other key's owner is unchanged, and about 1/(N+1) of keys move, compared with nearly all of them under hash mod N. With one point per server, though, arcs vary a lot in size and one neighbour absorbs all the change. Giving each server many virtual points makes ownership close to even, spreads joins and failures across all servers, and lets bigger machines take more points.
```

```questions
- kind: check
  type: numeric
  prompt: With hash(key) mod N, roughly what percentage of keys move when going from 9 to 10 servers?
  answer: 90
  unit: '%'
  tolerance: 0.03
  explanation: A key keeps its server only if hash mod 9 equals hash mod 10, about 1 in 10, so about 90% move. A ring would move about 10%.
- kind: check
  prompt: On a consistent-hashing ring, which keys move when a server is removed?
  choices:
    - text: Only the keys it owned, which pass to the next server(s) clockwise
      correct: true
    - text: All keys are reassigned
      why: Every other key keeps its owner.
    - text: Keys owned by its counter-clockwise neighbour
      why: That neighbour keeps its keys.
    - text: A random half of all keys
      why: Movement is limited to the removed server's arc.
  explanation: Minimal disruption is the defining property. Only the departed server's keys find a new home.
- kind: check
  type: multi
  prompt: What do virtual nodes provide? Select all that apply.
  choices:
    - text: More even key ownership across servers
      correct: true
    - text: A failed server's load spread across many survivors, not one neighbour
      correct: true
    - text: Weighting servers by capacity (more virtual nodes for bigger servers)
      correct: true
    - text: Automatic spreading of a single hot key
      why: Each key still maps to one point and one server.
  explanation: Many points per server average out randomness and allow proportional weighting.
- kind: check
  prompt: With 128 virtual nodes per server, why must replica selection skip already-chosen servers?
  choices:
    - text: Consecutive ring positions often belong to the same physical server, so naive walking could place several replicas on one machine
      correct: true
    - text: Virtual nodes can't store data
      why: Data lives on the physical server behind each virtual node.
    - text: The ring requires an odd number of replicas
      why: There's no such requirement.
    - text: Skipping makes lookups faster
      why: It's about fault tolerance, not speed.
  explanation: Replicas must land on distinct physical nodes, ideally in distinct zones, to survive failures.
- kind: fire
  type: numeric
  prompt: A balanced ring holds 60 million keys on 11 servers. A 12th equal server joins. About how many million keys move?
  answer: 5
  unit: million keys
  tolerance: 0.05
  explanation: The new server takes about 1/12 of the keys, so 60M ÷ 12 = 5 million.
- kind: fire
  prompt: What does rendezvous (highest random weight) hashing do?
  choices:
    - text: For each key, scores every server with hash(key, server) and picks the highest, so only keys whose winner changes move
      correct: true
    - text: Places servers on a ring and walks clockwise
      why: That's ring-based consistent hashing.
    - text: Uses hash mod N
      why: That's the naive approach.
    - text: Assigns keys round robin
      why: That isn't deterministic per key.
  explanation: HRW gives the same minimal-movement property without a ring, with excellent balance and easy top-k replica selection.
- kind: fire
  prompt: A viral key overloads its server even though keys are evenly balanced by consistent hashing. Why?
  choices:
    - text: Each key maps to exactly one server; balancing key counts doesn't balance traffic to one key
      correct: true
    - text: Consistent hashing doesn't work with popular keys
      why: It works fine. It just doesn't address per-key load.
    - text: There are too many virtual nodes
      why: Virtual nodes don't affect per-key traffic.
    - text: The ring isn't sorted
      why: Unrelated.
  explanation: Hot keys need splitting, replication or caching. Placement algorithms distribute keys, not requests to one key.
- kind: fire
  level: advanced
  prompt: What problem does "consistent hashing with bounded loads" address?
  choices:
    - text: It caps any server's load at (1 + ε) times the average by passing extra keys to the next server, limiting imbalance with little extra movement
      correct: true
    - text: It removes the need for virtual nodes in all cases
      why: It complements balance techniques by bounding load directly.
    - text: It guarantees exactly-once delivery
      why: Unrelated.
    - text: It splits hot keys automatically
      why: A single extremely hot key still exceeds one server.
  explanation: Bounded loads trade a bit of movement for a hard cap on per-server load. It's used by some load balancers and pub/sub systems.
- kind: fire
  type: multi
  prompt: Where is consistent hashing commonly used? Select all that apply.
  choices:
    - text: Client-side cache server selection (e.g. memcached ketama)
      correct: true
    - text: Data placement in Dynamo-style stores such as Cassandra
      correct: true
    - text: Load balancers that keep connection or user affinity across backend changes
      correct: true
    - text: Guaranteeing serialisable transactions
      why: Placement doesn't provide isolation.
  explanation: Wherever membership changes and you want to move as few keys (or users) as possible.
```
