---
id: design-kv
category: casebook
skill: concurrency
title: Design a distributed key-value store
minutes: 22
summary: Designing a Dynamo-style store pulls together everything in the distributed section — consistent hashing with virtual nodes for placement, N-way replication across zones, tunable R/W quorums, hinted handoff and read repair to survive failures, Merkle-tree anti-entropy to converge, gossip for membership, versioning for conflicts, and an LSM engine on each node.
objectives:
  - Size a cluster from data volume, replication and throughput
  - Design placement, replication and the read and write paths with tunable quorums
  - Handle node failures and partitions with hinted handoff, read repair and anti-entropy
  - Explain membership, failure detection, conflict resolution and the per-node storage engine
sources:
  - ['DeCandia et al., Dynamo: Amazon’s Highly Available Key-value Store (SOSP 2007)', 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf']
  - ['Apache Cassandra documentation: Dynamo', 'https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html']
  - ['Hayashibara et al., The φ Accrual Failure Detector', 'https://ieeexplore.ieee.org/document/1353004']
case: kv
---

## 1. Requirements

- API: `get(key)` and `put(key, value[, context])`; values up to 1 MB.
- **100 TB** of data, **1M ops/s**, single-digit-millisecond p99 for small values.
- Writes stay available through node and zone failures; **tunable consistency** per request.
- Add capacity without downtime and with limited data movement.

## 2. Sizing

```calc
title: How many nodes?
prompt: 100 TB of data, replication factor **3**. Each node has **8 TB** of disk, which you fill to at most **50%** (compaction headroom and rebalancing). How many nodes do you need for storage?
answer: 75
unit: nodes
tolerance: 1.02
steps: |
  100 TB × 3 = 300 TB stored. Usable per node = 4 TB. 300 ÷ 4 = **75 nodes**. Check throughput too: 1M ops/s with each request touching 2–3 replicas is ~2.5M replica operations/s; at ~40k per node that's ~63 nodes. Storage binds slightly first, so plan ~80 nodes across 3 zones.
```

## 3. Placement and replication

```sim
name: hashring
title: Placement with virtual nodes
config: {nodes: 6, vnodes: 100}
challenges:
  - {text: 'Add a node and confirm only a small fraction of keys move', metric: moved, op: '<', value: 25}
```

Each key's **preference list** is the next **N = 3** distinct physical nodes clockwise on the ring, in **different zones**. Any node can act as **coordinator** for a request; clients either send to a random node (which forwards) or use a ring-aware client that goes straight to a replica.

## 4. Write and read paths

```arch
title: A quorum write and read
nodes:
  - {id: client, label: Client, kind: client, x: 0, y: 1}
  - {id: coord, label: Coordinator, kind: service, x: 1, y: 1}
  - {id: r1, label: Replica A (zone 1), kind: db, x: 2, y: 0}
  - {id: r2, label: Replica B (zone 2), kind: db, x: 2, y: 1}
  - {id: r3, label: Replica C (zone 3), kind: db, x: 2, y: 2}
edges:
  - [client, coord, 'put(k, v)']
  - [coord, r1, 'write']
  - [coord, r2, 'write']
  - [coord, r3, 'write']
paths:
  - label: Write W=2
    steps:
      - [client, coord, 'put(k, v) with consistency QUORUM']
      - [coord, r1, 'Send to all 3 replicas in parallel, each with a version (timestamp or vector clock)']
      - [coord, r2, 'Each replica appends to its commit log + memtable and acks']
      - [client, coord, 'After 2 acks, reply success; the third replica catches up (or gets a hint)']
  - label: Read R=2 with repair
    steps:
      - [client, coord, 'get(k) with consistency QUORUM']
      - [coord, r2, 'Ask 2 replicas (one for data, one for a digest)']
      - [coord, r3, 'Replica C returns an older version']
      - [client, coord, 'Return the newest version, and asynchronously write it back to C (read repair)']
```

```sim
name: quorum
title: Tune R and W
config: {initial: {n: 3, w: 2, r: 2}}
challenges:
  - {text: 'Cut off one replica and confirm both reads and writes still succeed at R=W=2', metric: down, op: '==', value: 1, and: [{metric: w, op: '==', value: 2}, {metric: r, op: '==', value: 2}]}
  - {text: 'Configure fast reads (R=1) while keeping quorums overlapping for N=3', metric: overlap, op: '==', value: 1, and: [{metric: r, op: '==', value: 1}, {metric: n, op: '==', value: 3}]}
```

## 5. Surviving failures

```sort
prompt: Which mechanism handles each situation?
buckets: [Hinted handoff, Read repair, Anti-entropy (Merkle trees), Gossip + failure detector]
items:
  - {text: 'Replica B is down for 10 minutes while writes continue', bucket: 0, why: 'Another node stores the writes as hints and delivers them when B returns, so writes stay available.'}
  - {text: 'A read notices replica C holds an older version', bucket: 1, why: 'The coordinator writes the newest version back to C during or after the read.'}
  - {text: 'A replica was down for a day and some hints expired; cold keys have never been read since', bucket: 2, why: 'Background comparison of Merkle tree hashes finds and syncs only the differing key ranges.'}
  - {text: 'Nodes need to learn that node 17 has joined and node 4 seems dead', bucket: 3, why: 'Gossip spreads membership and heartbeat state; an accrual failure detector turns heartbeat gaps into suspicion levels.'}
```

```timeline
title: A replica misses writes
lanes: [Coordinator, Replica A, Replica B, Replica C, Hint store (on D)]
state: {'A': v1, 'B': v1, 'C': v1}
steps:
  - {lane: Replica C, to: Replica C, text: 'C becomes unreachable', set: {C: 'v1 (down)'}}
  - {lane: Coordinator, to: Replica A, text: 'put k=v2 → A acks', set: {A: v2}}
  - {lane: Coordinator, to: Replica B, text: 'put k=v2 → B acks (W=2 met)', set: {B: v2}}
  - {lane: Coordinator, to: Hint store (on D), text: 'store hint "k=v2 for C"'}
  - {lane: Replica C, to: Replica C, text: 'C comes back'}
  - {lane: Hint store (on D), to: Replica C, text: 'deliver hint → C applies v2', set: {C: v2}}
crashes:
  - after: 3
    label: node D (holding the hint) also dies
    verdict: safe
    text: The hint is lost, so C stays at v1 for now. Quorum reads still return v2 (R=2 overlaps W=2), read repair fixes C if k is read, and anti-entropy fixes it eventually even if k is never read. Layered repair is why one lost mechanism doesn't mean lost convergence.
```

## 6. Conflicts and versions

With concurrent writes from different coordinators (or during partitions with sloppy quorums), replicas can hold divergent versions. Options:

- **Last-write-wins (LWW)** by timestamp: simple, but concurrent writes silently lose data, and clock skew picks the "wrong" winner. Acceptable for idempotent overwrites such as caches and sessions.
- **Vector clocks / version vectors**: detect true concurrency and return all **siblings** to the client, which merges (Dynamo's shopping cart merged by union) and writes back with the merged context.
- **CRDTs**: data types (counters, sets, maps) that merge automatically and deterministically.

```predict
prompt: Two clients concurrently `put` different values to the same key through different coordinators, and the store uses last-write-wins on client-supplied timestamps. One client's clock is 2 seconds fast. What happens?
choices:
  - Both values are kept
  - The fast-clock client's value wins regardless of real order, and the other write is silently lost
  - The store rejects both
  - The store waits for clocks to sync
answer: 1
reveal: |
  LWW resolves by timestamp, so skew decides. For data where losing a concurrent update matters, use version vectors with sibling resolution, CRDTs, or a consensus-based conditional write (like Cassandra's lightweight transactions) for compare-and-set semantics.
```

## 7. The node's storage engine

Each node runs an **LSM tree**: writes go to a commit log and memtable, flush to SSTables, and compact in the background; Bloom filters per SSTable keep reads of absent keys cheap. That gives the fast, sequential writes a write-available store needs.

```bug
title: A coordinator's write path
prompt: Which lines break the store's guarantees?
lang: python
code: |
  def put(key, value):
      replicas = ring.next_nodes(key, n=3)              # may include the same physical node twice
      acks = 0
      for r in replicas:                                 # sequential
          if r.write(key, value, ts=time.time()):
              acks += 1
      return acks >= 1
bug: [2, 4, 7]
explain: |
  **Line 2** may pick virtual nodes on the same physical machine (or zone), so "3 replicas" can be one server. Skip duplicate hosts and zones. **Line 4** writes sequentially, so latency is the sum of three round trips and one slow replica blocks the rest. Write to all replicas in parallel and return when W acks arrive. **Line 7** reports success after a single ack whatever the requested consistency, so a QUORUM write isn't a quorum and an immediate QUORUM read can miss it. Return once W acks are in, and store hints for unreachable replicas.
```

```interview
say: |
  "Keys hash onto a ring with ~256 virtual nodes per server; each key's preference list is the next 3 distinct nodes in 3 zones. Any node coordinates: writes go in parallel to all 3 replicas and succeed after W acks; reads ask R replicas, return the newest version, and read-repair stale ones. QUORUM (R=W=2) is the default, with ONE available for latency-sensitive reads. When a replica is down, hinted handoff keeps writes available; Merkle-tree anti-entropy converges cold keys; gossip plus a phi-accrual detector manage membership. Conflicts use version vectors, with LWW only for overwrite-only tables, and compare-and-set goes through Paxos-backed lightweight transactions. Each node is an LSM engine with Bloom filters. 100 TB × RF3 at 4 TB usable per node is about 75–80 nodes."
followups:
  - q: Does R+W>N make it linearizable?
    a: No. It ensures read and write sets overlap, but concurrent writes, sloppy quorums with hinted handoff, and LWW conflicts can still yield anomalies. Use consensus-backed operations for linearizable compare-and-set.
  - q: What happens when you add a node?
    a: It takes ownership of ranges from its ring neighbours (small slices from many nodes, with virtual nodes) and streams those ranges in while still serving. Only about 1/N of the data moves.
  - q: How do replicas converge if a key is never read?
    a: Anti-entropy. Nodes compare Merkle trees of their ranges in the background and sync only the differing subtrees.
weak: |
  "Hash keys mod N to servers and replicate to a backup." No virtual nodes, quorums, failure handling, conflict resolution or storage engine.
strong: |
  Sizes the cluster, places with consistent hashing across zones, explains coordinator quorum paths, layers hinted handoff, read repair and anti-entropy, handles membership and conflicts honestly, and grounds the node on an LSM engine.
```

```recall
prompt: Describe what happens to writes for a key when one of its three replicas is down, and how that replica becomes consistent again.
points:
  - With W=2, the write succeeds once the two reachable replicas acknowledge it
  - The coordinator (or another node) stores a hint for the down replica (hinted handoff) and delivers it when the replica returns
  - Reads with R=2 still see the latest value because quorums overlap, and read repair fixes stale replicas encountered during reads
  - Background anti-entropy with Merkle trees eventually syncs any remaining differences, even for keys never read
model: |
  The coordinator sends the write to all three replicas in parallel. Two acknowledge, which meets W=2, so the client gets success. For the third, which is unreachable, a hint — "this write belongs to replica C" — is stored on another node and replayed when C comes back. Meanwhile quorum reads (R=2) always include at least one replica with the new value, and if a read touches C after it returns but before the hint lands, the coordinator writes the newer version back to it. If hints were lost or expired, periodic anti-entropy compares Merkle trees between replicas and repairs any ranges that differ.
```

```bug
style: critique
title: A candidate's key-value store
prompt: The candidate describes a Dynamo-style store with N=3. Which claims would you push back on?
lang: text
code: |
  Keys are placed on a consistent-hash ring with many virtual nodes per server.
  Each key is replicated to the next three distinct servers on the ring, in different zones.
  They choose R=1 and W=1 and say this still guarantees reads see the latest write.
  Conflicting versions are detected with version vectors and returned to the client to merge.
  Hinted handoff stores writes for a down replica, and anti-entropy with Merkle trees repairs drift.
  Each node stores data in an LSM tree: a write-ahead log, memtable and sorted files.
bug: [3]
explain: |
  **Line 3:** with N=3, R=1, W=1 gives R + W = 2, not more than N, so a read can hit a replica that missed the latest write. Read-your-latest needs overlapping quorums (for example R=2, W=2). R=1, W=1 is a valid choice for speed, but only with eventual consistency.
```

```questions
- kind: check
  type: numeric
  prompt: 60 TB of data at replication factor 3, with 6 TB usable per node. How many nodes are needed for storage?
  answer: 30
  unit: nodes
  tolerance: 0.01
  explanation: 180 TB ÷ 6 TB = 30 nodes. Check throughput as well and take the larger figure.
- kind: check
  prompt: What's a key's preference list in a Dynamo-style store?
  choices:
    - text: The N distinct physical nodes (ideally in different zones) found walking clockwise from the key's ring position
      correct: true
    - text: The list of clients allowed to read the key
      why: That's access control.
    - text: The previous versions of the key
      why: Those are versions, not placement.
    - text: The nodes with the most free disk
      why: Placement is deterministic from the ring.
  explanation: Deterministic placement on distinct failure domains is how replicas survive node and zone failures.
- kind: check
  type: multi
  prompt: Which mechanisms help replicas converge after failures? Select all that apply.
  choices:
    - text: Hinted handoff
      correct: true
    - text: Read repair
      correct: true
    - text: Merkle-tree anti-entropy
      correct: true
    - text: Disabling writes during failures
      why: That sacrifices availability rather than restoring consistency.
  explanation: Layered repair — immediate, on read, and in the background — gives convergence despite failures.
- kind: check
  prompt: Why should a coordinator write to all replicas in parallel rather than one by one?
  choices:
    - text: Latency becomes the time of the W-th fastest replica instead of the sum of all round trips, and one slow replica doesn't block the others
      correct: true
    - text: Parallel writes use less bandwidth
      why: Bandwidth is the same.
    - text: Sequential writes are impossible
      why: They're possible, just slow.
    - text: To guarantee linearizability
      why: Parallelism affects latency, not consistency.
  explanation: Waiting for the fastest W of N responses gives tail tolerance.
- kind: fire
  prompt: What's the main risk of last-write-wins conflict resolution?
  choices:
    - text: Concurrent updates are silently discarded, and clock skew decides which one survives
      correct: true
    - text: It's too slow
      why: It's fast.
    - text: It needs vector clocks
      why: It uses timestamps instead.
    - text: It can't handle deletes
      why: Tombstones handle deletes.
  explanation: Use LWW only where overwrites are acceptable. Otherwise use version vectors, CRDTs or consensus.
- kind: fire
  prompt: A replica was down for two days, its hints expired, and some keys were never read since. What repairs them?
  choices:
    - text: Background anti-entropy comparing Merkle trees and syncing differing ranges
      correct: true
    - text: Read repair
      why: Only keys that are read get repaired that way.
    - text: Nothing — they stay stale forever
      why: Anti-entropy exists for exactly this case.
    - text: Restarting the cluster
      why: A restart doesn't sync data.
  explanation: Merkle trees let replicas find differences cheaply by comparing hashes top-down.
- kind: fire
  prompt: How do nodes learn about membership changes and failures without a central master?
  choices:
    - text: Gossip protocols spreading state, with an accrual failure detector judging liveness from heartbeat gaps
      correct: true
    - text: Every node pings every other node every millisecond
      why: That's O(N²) traffic at a high rate.
    - text: A single coordinator node
      why: That's a single point of failure, which Dynamo avoids.
    - text: DNS
      why: DNS doesn't track liveness at this granularity.
  explanation: Gossip scales logarithmically, and accrual detectors adapt to network conditions.
- kind: fire
  level: advanced
  prompt: Which operation in a Dynamo-style store needs consensus (e.g. Paxos-based lightweight transactions) rather than quorums alone?
  choices:
    - text: Compare-and-set, such as "create the username only if it doesn't exist"
      correct: true
    - text: Plain overwrites of a session blob
      why: LWW quorum writes are fine for those.
    - text: Reading a cached profile
      why: That needs no coordination.
    - text: Appending to a log with unique keys
      why: Unique keys don't conflict.
  explanation: Conditional writes need agreement on the order of competing proposals, which is what consensus provides.
- kind: fire
  type: order
  prompt: Order the quorum write path.
  items:
    - The client sends put(k, v) to any node (the coordinator)
    - The coordinator finds k's preference list on the ring
    - It sends the write to all N replicas in parallel, with a version
    - Replicas append to the commit log and memtable, then ack
    - After W acks the coordinator replies; it stores hints for any unreachable replica
  explanation: Parallel replication, quorum acknowledgement and hints for stragglers keep writes fast and available.
```
