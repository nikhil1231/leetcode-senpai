---
id: replication
category: distributed
skill: reads
title: Replication, lag and failover
minutes: 17
summary: Replicas give you read capacity, locality and survival when a machine dies, but every copy lags its leader by some amount, and every failover is a decision about which acknowledged writes you're willing to lose. Choose synchronous or asynchronous replication per guarantee, route reads with lag in mind, and fence old leaders so two can never accept writes.
objectives:
  - Compare synchronous, semi-synchronous and asynchronous replication by latency, durability and availability
  - Recognise replication-lag anomalies and fix them with read-your-writes and monotonic-read routing
  - Explain failover risks — lost acknowledged writes, split brain — and how fencing prevents them
  - Know when multi-leader or leaderless replication fits, and why replicas aren't backups
sources:
  - ['GitHub: October 21 post-incident analysis', 'https://github.blog/news-insights/company-news/oct21-post-incident-analysis/']
  - ['PostgreSQL: High availability, load balancing and replication', 'https://www.postgresql.org/docs/current/high-availability.html']
  - ['Martin Kleppmann, Designing Data-Intensive Applications — Chapter 5', 'https://dataintensive.net/']
---

> [!incident] 43 seconds, 24 hours
> In October 2018, a 43-second network partition between GitHub's US East Coast data centre and its East Coast network hub triggered automated failover of MySQL primaries to the West Coast. When connectivity returned, both coasts held writes the other didn't have, and cross-country latency made the new topology unworkable. Reconciling the data without losing user writes took about 24 hours of degraded service. A short blip became a long outage because replication, failover and consistency had to be untangled by hand.

## Leader–follower replication

The most common setup: one **leader** (primary) accepts writes and streams its change log to **followers** (replicas), which apply it in order. Reads can go to followers. The question is **when the leader tells the client "committed"**:

| Mode | The leader acks after… | Write latency | If the leader dies right after acking |
|---|---|---|---|
| **Asynchronous** | Its own local commit | Lowest | Recent acknowledged writes not yet shipped are **lost** on failover |
| **Semi-synchronous** | At least one replica has received it | + one round trip to the nearest replica | A promoted up-to-date replica has it |
| **Synchronous (quorum)** | A majority, or all configured replicas, have it | + round trip to the slowest required replica | No acknowledged write lost, but writes stall if those replicas are unreachable |

```sim
name: tradeoff
title: How many replicas must confirm a write?
config: {model: replicas}
challenges:
  - {text: 'Make acknowledged writes survive a leader crash while keeping write latency under 30 ms at a 20 ms cross-zone RTT', metric: lat, op: '<', value: 30, and: [{metric: x, op: '>=', value: 1}, {metric: rtt, op: '>=', value: 20}]}
  - {text: 'Require all 4 followers and watch latency and write availability suffer', metric: x, op: '==', value: 4}
takeaway: |
  Waiting for **one** nearby replica removes the "lost acknowledged write" window for the price of one round trip. Waiting for all replicas ties every write to the slowest, least available one. Most production systems wait for one replica in another zone (or a majority), and replicate asynchronously to anything farther away.
```

## Lag and the anomalies it causes

Asynchronous followers are usually milliseconds behind — and occasionally seconds or minutes, during load spikes, long transactions or network trouble. Users then see:

- **Read-your-writes violations:** you update your profile, refresh, and see the old version (the refresh hit a lagging replica).
- **Non-monotonic reads:** you see a comment, refresh, and it disappears (the second read hit a replica further behind).

Fixes:

- Read **your own** recent writes from the leader (for a short window, or for data only you edit).
- **Track positions:** the client remembers the log position (LSN) of its last write and reads only from replicas that have applied at least that position.
- **Sticky replica per session** to get monotonic reads.

```sim
name: replag
title: Who sees stale data?
challenges:
  - {text: 'With any-replica routing, make users frequently see their own writes stale (raise lag above their think time)', metric: staleRate, op: '>', value: 30, and: [{metric: routing, op: '==', value: random}]}
  - {text: 'Fix it with no stale own-writes while keeping leader load under 10% of reads', metric: staleRate, op: '==', value: 0, and: [{metric: leaderShare, op: '<', value: 10}]}
takeaway: |
  Routing every read to the leader is correct but discards the replicas. LSN-based routing is correct *and* cheap: only reads that would be stale go to the leader. Time windows ("leader for 1 s after a write") are simple, but break silently when lag spikes past the window.
```

## Failover

When the leader fails, a follower is promoted. Each step hides a trap:

1. **Detecting failure** relies on timeouts. Too short and you fail over on a GC pause; too long and you're down for longer.
2. **Choosing the new leader** — the most up-to-date replica — but with async replication even it may lack the last acknowledged writes.
3. **Redirecting clients and fencing the old leader.** If the old leader was only partitioned, not dead, it may keep accepting writes: **split brain**.

```timeline
title: Async failover loses an acknowledged write
lanes: [Client, Leader A, Replica B]
state: {'A has': 'w1 w2', 'B has': 'w1', 'Client was told': ''}
steps:
  - {lane: Client, to: Leader A, text: 'write w3 (order #8812)'}
  - {lane: Leader A, to: Client, text: 'COMMIT ok (async: not yet shipped to B)', set: {'A has': 'w1 w2 w3', 'Client was told': 'w3 committed'}}
  - {lane: Leader A, to: Leader A, text: 'A crashes; w2 and w3 never reached B'}
  - {lane: Replica B, to: Replica B, text: 'B promoted to leader', set: {'B has': 'w1 (now authoritative)'}}
  - {lane: Client, to: Replica B, text: 'read order #8812 → not found'}
find:
  prompt: At which step was the user promised something the system couldn't keep?
  answer: 1
  explain: |
    The acknowledgement in step 2 told the client w3 was committed, but only one machine had it. With asynchronous replication, failover loses acknowledged writes up to the replication lag. If that's unacceptable, acknowledge only after at least one replica has the write (semi-sync or quorum commit). When A comes back it holds writes B doesn't, and those must be discarded or reconciled by hand — the GitHub problem.
```

```predict
prompt: A partition isolates the old leader from the cluster but not from some clients. The cluster promotes a new leader. What must happen to stop both leaders accepting writes?
choices:
  - Nothing — the old leader will notice and stop
  - The old leader must be fenced — its writes rejected by a lease that has expired, a fencing token checked by storage, or forcibly cut off (STONITH)
  - Clients should pick whichever leader responds faster
  - Increase the replication factor
answer: 1
reveal: |
  A partitioned leader can't tell "I'm cut off" from "everyone else died", so it may keep accepting writes until something stops it. Fencing does: leader **leases** that expire unless renewed through a majority, **fencing tokens** (monotonic epoch numbers) that storage checks to reject writes from older epochs, or forcibly cutting the old node off ("shoot the other node in the head"). Consensus systems (next lessons) build this in.
```

## Multi-leader and leaderless

- **Multi-leader** (e.g. one leader per region): each region accepts writes locally, with low latency and regional autonomy, and replicates asynchronously to the others. The hard part is **conflicts** — two regions edit the same record. Last-write-wins silently drops one; better options are conflict-free data types (CRDTs), application merge logic, or avoiding conflicts by giving each record a home region.
- **Leaderless** (Dynamo-style: Cassandra, Riak): clients write to and read from several replicas, with quorums deciding success. Covered in the consistency lesson.

```sort
prompt: Which replication approach fits?
buckets: [Leader–follower, Multi-leader, Leaderless (quorum)]
items:
  - {text: 'A banking ledger in one region that needs simple, strongly consistent writes', bucket: 0, why: 'One writer, with synchronous replication to a standby, keeps correctness simple.'}
  - {text: 'A collaborative notes app that works offline on each device and syncs later', bucket: 1, why: 'Each device is effectively a leader. Conflict resolution (often CRDTs) is the core of the design.'}
  - {text: 'A shopping-cart store that must accept writes even during node failures, tolerating occasional merges', bucket: 2, why: "Dynamo's original use case: always writable, quorum-tunable, with conflict reconciliation."}
  - {text: 'Users in three continents each editing mostly their own data with low write latency', bucket: 1, why: 'Leaders per region with records homed to a region keep writes local and conflicts rare.'}
```

> [!mistake] Replicas are not backups
> A `DROP TABLE`, a bad migration or ransomware replicates to every follower within milliseconds. Backups — and point-in-time recovery from archived logs — let you go back in time. You need both (see the recovery lesson).

```interview
ask: How would you design replication, read consistency, failover and disaster recovery for a PostgreSQL database spanning availability zones and regions?
say: |
  "One Postgres leader with two replicas in other zones. Commits wait for one replica (semi-sync), so a leader crash loses no acknowledged write, for about 2 ms of extra latency. Reads go to replicas, except that each session carries the LSN of its last write and is only served by replicas at or past it. Failover is automated with a consensus-backed manager, like Patroni with etcd: the leader holds a lease, and an expired lease means it must step down, so we can't get split brain. A cross-region async replica handles disaster recovery, and nightly backups plus WAL archiving give point-in-time restore."
followups:
  - q: Why not fully synchronous replication to every replica?
    a: Every write would wait for the slowest replica, and one unreachable replica would block all writes. Waiting for one (or a majority) gives durability with bounded latency and tolerates a replica failure.
  - q: How do you stop a user seeing their own update disappear?
    a: Read-your-writes — route their reads to the leader briefly, or track the LSN of their last write and only read from replicas that have caught up.
  - q: What's split brain and how is it prevented?
    a: Two nodes both believing they're the leader and accepting writes. Prevent it with leases renewed through a majority, fencing tokens checked by storage, and forcibly isolating the old leader.
weak: |
  "Add read replicas for scale and fail over if the primary dies." No lag anomalies, no data-loss window, no split-brain protection.
strong: |
  Chooses the replication mode per durability need, handles lag with session-aware routing, explains failover data loss and fencing, considers multi-leader conflicts, and keeps backups separate from replicas.
```

```recall
prompt: Explain how asynchronous replication can lose a write the client was told succeeded, and what you can change to prevent it.
points:
  - With async replication the leader acks after its local commit, before followers have the write
  - If the leader crashes before shipping it, the promoted follower doesn't have that write
  - The client was told it committed, so an acknowledged write is lost (up to the replication lag)
  - Prevent it by acking only after at least one replica has the write (semi-sync/quorum), accepting extra latency, and fence the old leader when it returns
model: |
  In asynchronous replication the leader commits locally, replies "committed", and streams the change to followers a moment later. If it crashes in between, the follower that gets promoted never saw the write, so data the client was promised is gone — and when the old leader returns it holds writes the new leader lacks, which must be discarded or reconciled by hand. To prevent it, make the commit wait until at least one other replica (or a majority) has durably received the write. That costs a round trip to the nearest replica, but promotion of an up-to-date replica then loses nothing. Fencing stops the old leader accepting writes after failover.
```

```questions
- kind: check
  prompt: With asynchronous replication, what can a leader failover lose?
  choices:
    - text: Writes that were acknowledged to clients but not yet shipped to the promoted replica
      correct: true
    - text: Nothing — acknowledged writes are always replicated first
      why: That's only true for synchronous or semi-synchronous commits.
    - text: Only reads
      why: Reads don't change state.
    - text: The entire database
      why: Only the unreplicated tail is at risk.
  explanation: Async acks before replication, so the loss window is the replication lag at the moment of the crash.
- kind: check
  type: multi
  prompt: Which techniques give users read-your-writes consistency with asynchronous replicas? Select all that apply.
  choices:
    - text: Serve a user's reads from the leader for a short time after they write
      correct: true
    - text: Track the log position of their last write and only read from replicas that have applied it
      correct: true
    - text: Always read data the user edits from the leader
      correct: true
    - text: Read from a random replica
      why: A random replica may be behind the user's write.
  explanation: Route reads that could observe one's own recent writes to a source known to have them. Everything else can use any replica.
- kind: check
  prompt: What's split brain?
  choices:
    - text: Two nodes both acting as leader and accepting writes, so the data diverges
      correct: true
    - text: A replica falling behind the leader
      why: That's replication lag.
    - text: The database splitting a table into partitions
      why: That's partitioning.
    - text: Half the replicas being in another region
      why: That's just placement.
  explanation: Split brain usually follows a partition plus failover. Leases, fencing tokens and forced isolation prevent it.
- kind: check
  prompt: Why are replicas not a substitute for backups?
  choices:
    - text: Destructive changes such as DROP TABLE or a bad migration replicate to every copy
      correct: true
    - text: Replicas use a different storage format
      why: Format has nothing to do with it.
    - text: Replicas can't be read
      why: They can, often.
    - text: Backups are always faster to restore
      why: Usually slower. The point is going back in time.
  explanation: Replication protects against losing a machine. Backups and point-in-time recovery protect against losing data to mistakes.
- kind: fire
  prompt: What's the main cost of semi-synchronous replication (waiting for one replica) compared with asynchronous?
  choices:
    - text: Each commit adds a round trip to the replica, increasing write latency
      correct: true
    - text: Reads become stale
      why: Reads aren't affected by how commits are acknowledged.
    - text: Replicas can no longer serve reads
      why: They still can.
    - text: It loses more data on failover
      why: It loses less — that's the point.
  explanation: Durability across machines costs at least one network round trip per commit. Keep that replica close, in another zone of the same region.
- kind: fire
  prompt: Two regions accept writes for the same record (multi-leader) and the record is edited in both. Last-write-wins is used. What happens?
  choices:
    - text: One edit is silently discarded, based on timestamps that may be skewed
      correct: true
    - text: Both edits are merged automatically
      why: LWW keeps one and drops the other.
    - text: The database rejects both
      why: LWW accepts both and keeps one.
    - text: Edits are always applied in real-time order
      why: Clock skew can make the "later" write the earlier one.
  explanation: Multi-leader needs a conflict strategy — CRDTs, application merges, or homing records to one region.
- kind: fire
  prompt: What does a fencing token do?
  choices:
    - text: Storage rejects writes carrying an older leadership epoch, so a deposed leader can't corrupt data
      correct: true
    - text: Encrypts replication traffic
      why: That's TLS, not fencing.
    - text: Speeds up failover detection
      why: Detection uses timeouts. Fencing makes a mistaken old leader harmless.
    - text: Compresses the log
      why: Unrelated.
  explanation: Monotonic epoch numbers make every write prove it comes from the current leader.
- kind: fire
  type: multi
  level: advanced
  prompt: Which factors make automatic failover risky? Select all that apply.
  choices:
    - text: Timeouts can't distinguish a dead leader from a slow or partitioned one
      correct: true
    - text: The promoted replica may lack the latest acknowledged writes (with async replication)
      correct: true
    - text: The old leader may come back still believing it's the leader
      correct: true
    - text: Clients may keep sending writes to the old leader's address
      correct: true
    - text: Replicas can't be promoted
      why: They can — that's what failover does.
  explanation: Failover needs careful detection, a promotion rule that respects durability, fencing, and client redirection — ideally coordinated by a consensus system.
- kind: fire
  prompt: A user edits a comment, refreshes, and the comment vanishes, then reappears on the next refresh. What anomaly is this?
  choices:
    - text: Non-monotonic reads — successive reads hit replicas at different lag
      correct: true
    - text: Write skew
      why: That's a concurrency anomaly between writes.
    - text: Split brain
      why: There's only one leader here.
    - text: Lost update
      why: The data isn't lost. It's just read from replicas at different positions.
  explanation: Pin a session to one replica, or route by log position, so reads never go backwards in time.
```
