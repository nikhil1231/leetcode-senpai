---
id: consensus
category: distributed
skill: concurrency
title: Consensus, leader election and coordination
minutes: 17
summary: Whenever several machines must agree on one thing — who the leader is, which value was committed, who holds a lock — you need consensus. Raft and Paxos achieve it with majorities, terms and logs, tolerating minority failures and never letting two leaders commit conflicting decisions. You rarely implement them; you use etcd or ZooKeeper, and you still need fencing, because a lease can expire while its holder is paused.
objectives:
  - Explain why agreement needs majorities, and how many failures a cluster of N tolerates
  - Walk through Raft leader election (terms, randomised timeouts, votes) and log replication (commit on majority)
  - Use a coordination service for leader election, configuration and leases, and know its limits
  - Explain why distributed locks need fencing tokens, and when to avoid locks entirely
sources:
  - ['Ongaro & Ousterhout, In Search of an Understandable Consensus Algorithm (Raft)', 'https://raft.github.io/raft.pdf']
  - ['The Raft consensus algorithm (interactive visualisation)', 'https://raft.github.io/']
  - ['Martin Kleppmann: How to do distributed locking', 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html']
---

> [!story] The lock that wasn't
> A team guarded a nightly billing job with a Redis lock that expired after 30 seconds, renewed every 10. One night the job's JVM hit a 45-second garbage-collection pause while holding the lock. The lock expired, a second instance acquired it and started billing, and then the first instance woke up — still believing it held the lock — and continued too. Customers were charged twice. Nothing in Redis was broken: a lease can always expire while its holder isn't running, and only the storage being written to can catch the stale holder.

## Why majorities

To agree on a value despite failures, a decision must be accepted by a **quorum** such that any two quorums overlap. With a majority (⌊N/2⌋ + 1), two different decisions can never both win, because any two majorities share at least one node that would refuse the second.

| Cluster size | Majority | Failures tolerated |
|---|---|---|
| 3 | 2 | 1 |
| 4 | 3 | 1 |
| 5 | 3 | 2 |
| 7 | 4 | 3 |

Even numbers add cost without adding tolerance, which is why consensus clusters run 3 or 5 nodes (rarely 7 — every write waits for a majority, so bigger clusters are slower).

```calc
title: How many nodes for this tolerance?
prompt: A consensus cluster must keep committing writes while any **3** nodes are down. What's the smallest cluster size?
answer: 7
unit: nodes
tolerance: 1.01
steps: |
  To tolerate f failures you need 2f + 1 nodes, so that the f + 1 survivors are still a majority: 2 × 3 + 1 = **7** (majority 4). Placement matters as much as count: spread 7 nodes as 3/2/2 across three zones and losing any one zone leaves at least 4 nodes — still a majority. Put 4 in one zone and losing that zone leaves 3 of 7, and the cluster stops.
```

## Raft in brief

Raft splits consensus into understandable parts:

- **Terms:** time is divided into numbered terms, each with at most one leader. Every message carries a term; anyone seeing a higher term steps down to follower.
- **Leader election:** followers expect heartbeats. If one hears nothing for a **randomised** election timeout (say 150–300 ms), it increments the term, votes for itself and asks the others. Each node votes at most once per term, and only for candidates whose log is at least as up to date as its own. A majority of votes makes a leader. Randomisation makes split votes rare.
- **Log replication:** clients send commands to the leader, which appends them to its log and replicates them. An entry is **committed** once a majority has stored it. Only committed entries are applied to the state machine, and a committed entry is never lost, because any future leader must have it (the voting rule guarantees that).

```sim
name: raft
title: Leader election in a 5-node cluster
challenges:
  - {text: 'Run the cluster, then crash the leader and watch a new one get elected in a higher term', metric: newLeader, op: '>=', value: 1}
  - {text: 'Partition the cluster 2 | 3 and see that only the majority side can elect a leader', metric: partitioned, op: '==', value: 1, and: [{metric: elections, op: '>=', value: 2}]}
takeaway: |
  The minority side keeps timing out and starting elections, but never gets 3 votes, so it can never commit writes. An old leader stranded there may *think* it's still leader, yet it can't reach a majority to commit anything, and steps down as soon as it hears the higher term. That's how Raft avoids split brain without perfectly synchronised clocks.
```

```order
prompt: Order the steps for committing a client write in Raft.
items:
  - The client sends the command to the leader
  - The leader appends the entry to its own log
  - The leader sends AppendEntries to its followers, which append the entry and acknowledge
  - Once a majority (including the leader) has the entry, the leader marks it committed
  - The leader applies the entry to its state machine and replies to the client
  - Followers learn the new commit index on the next message and apply the entry too
explain: The client is told "done" only after a majority has durably stored the entry, which is why committed writes survive the loss of any minority, including the leader.
```

> [!senior] FLP, and why timeouts are unavoidable
> The FLP result shows that no deterministic algorithm can guarantee consensus in a fully asynchronous network if even one node may crash, because you can't tell a crashed node from a slow one. Practical algorithms stay **safe** always (never two conflicting commits) and are **live** (make progress) only when the network behaves well enough for timeouts to work. That's why bad timeout settings cause election storms, not data corruption.

## Use a coordination service

You almost never implement Raft or Paxos yourself. Systems like **etcd** (Raft), **ZooKeeper** (Zab) and **Consul** (Raft) provide small, strongly consistent key-value stores with:

- **Leader election** for your services (one active scheduler, one primary database manager such as Patroni).
- **Configuration and service discovery** with watches that notify on change.
- **Leases / ephemeral nodes** that disappear when a client stops heartbeating.
- **Linearizable compare-and-set** for small pieces of coordination state.

They're for **coordination metadata** — kilobytes to megabytes, modest write rates — not application data.

```sort
prompt: Is a consensus-backed coordination service (etcd, ZooKeeper) the right tool?
buckets: [Good fit, Wrong tool]
items:
  - {text: 'Choosing which of three scheduler instances is active', bucket: 0, why: 'Leader election with leases is the canonical use.'}
  - {text: 'Storing 2 billion user sessions', bucket: 1, why: 'Far beyond its intended size and write rate. Use a scalable data store.'}
  - {text: 'Holding the current shard → node mapping that every router watches', bucket: 0, why: 'Small, critical config that must be consistent, with change notifications.'}
  - {text: 'A high-volume counter incremented 100k times per second', bucket: 1, why: 'Every write goes through a majority round. Use a sharded counter in a normal store.'}
  - {text: 'Ensuring only one primary database is promoted after failover', bucket: 0, why: 'Exactly the split-brain prevention consensus provides.'}
```

## Distributed locks need fencing

A lock service grants a **lease**. But the lock holder can pause (GC, VM migration, a swap storm) or be partitioned **after** checking it holds the lock and **before** writing. By the time it writes, the lease may have expired and someone else may hold it.

```timeline
title: A paused lock holder, with and without fencing
lanes: [Worker 1, Worker 2, Lock service, Storage]
state: {Lock: free, 'Storage accepts tokens ≥': '0', File: v0}
steps:
  - {lane: Worker 1, to: Lock service, text: 'acquire → granted, fencing token 33', set: {Lock: 'Worker 1 (token 33)'}}
  - {lane: Worker 1, to: Worker 1, text: '45 s GC pause…'}
  - {lane: Lock service, to: Lock service, text: 'lease expires', set: {Lock: free}}
  - {lane: Worker 2, to: Lock service, text: 'acquire → granted, token 34', set: {Lock: 'Worker 2 (token 34)'}}
  - {lane: Worker 2, to: Storage, text: 'write v1 with token 34 → accepted', set: {File: v1, 'Storage accepts tokens ≥': '34'}}
  - {lane: Worker 1, to: Storage, text: 'wakes, writes v2 with token 33 → REJECTED (33 < 34)'}
find:
  prompt: Without fencing, which step would have corrupted the data?
  answer: 5
  explain: |
    Worker 1 still believes it holds the lock. Without a token check, its write would overwrite Worker 2's work — the double-billing incident. With **fencing tokens** (monotonic numbers issued with each lock grant), the storage rejects writes carrying a token older than one it has already seen. The lock service alone can't prevent this; the resource being protected must check.
```

```bug
title: A "safe" distributed lock
prompt: This job uses a Redis lock so only one instance runs billing. Which lines are unsafe?
lang: python
code: |
  def run_billing():
      if redis.set("lock:billing", HOSTNAME, nx=True, ex=30):
          for invoice in pending_invoices():
              charge(invoice)                    # may take minutes in total
          redis.delete("lock:billing")
bug: [4, 5]
explain: |
  **Line 4:** the work outlives the 30-second lease. After 30 s another instance acquires the lock and both charge customers, and nothing downstream checks a fencing token. Renew the lease while working, *and* make the effect safe on its own: idempotency keys per invoice, or a fencing token checked by the billing store. **Line 5** deletes the lock unconditionally. If the lease expired and someone else now holds it, this deletes *their* lock. Delete only if the value is still yours (an atomic compare-and-delete in Lua). Better still, structure the work so correctness doesn't depend on the lock at all.
fix: |
  def run_billing():
      token = lock_service.acquire("billing", ttl=30)        # returns a monotonic fencing token
      with lock_service.keepalive(token):
          for invoice in pending_invoices():
              charge(invoice, idempotency_key=f"invoice-{invoice.id}", fencing_token=token)
      lock_service.release(token)                             # no-op if no longer the holder
```

> [!mistake] Locks for correctness versus locks for efficiency
> If a lock only prevents *duplicate work* (two instances doing the same idempotent job), an occasionally broken lock is acceptable. If it protects *correctness* (no double charges, no corrupted files), the lock must come from a consensus system, and the protected resource must enforce fencing — or you redesign so the effect is idempotent and the lock becomes an optimisation.

```interview
say: |
  "For the single active scheduler I'd use leader election in etcd: instances campaign for a key with a lease, the winner renews it every few seconds, and a lost lease means it must stop. Because a paused leader might still act, every job it dispatches carries the election revision as a fencing token, and the job store rejects stale tokens. etcd runs as 3 nodes, one per zone, tolerating one failure. Application data stays in Postgres; etcd only holds coordination state."
followups:
  - q: Why 3 or 5 nodes, not 4?
    a: A majority of 4 is 3, so 4 nodes tolerate one failure — the same as 3 — while every write waits for one more node. Odd sizes maximise tolerance per node.
  - q: How does Raft avoid two leaders?
    a: A leader needs a majority of votes in a term, and each node votes once per term, so two candidates can't both win the same term. An old leader can't commit without a majority, and steps down on seeing a higher term.
  - q: Is a Redis lock with a TTL enough?
    a: For efficiency, often yes. For correctness, no — a paused holder can outlive its lease. Use a consensus-backed lock, and have the protected resource check fencing tokens, or make the operation idempotent.
weak: |
  "Use a distributed lock in Redis so only one instance runs it." No awareness of lease expiry, pauses, fencing or majorities.
strong: |
  Explains majorities and failure tolerance, walks through Raft election and commit, uses etcd or ZooKeeper for coordination metadata only, and insists on fencing tokens or idempotency for correctness.
```

```recall
prompt: Explain why a distributed lock with a lease can still allow two processes to act as the holder, and how fencing tokens prevent damage.
points:
  - A lease expires after a timeout, but the holder may be paused (GC, VM stall) or partitioned and not know it has expired
  - Another process can acquire the lock after expiry while the first still believes it holds it
  - Fencing tokens are monotonically increasing numbers issued with each lock grant
  - The protected resource rejects operations carrying a token lower than one it has already accepted, so the stale holder's writes fail
model: |
  A lease is just a promise that expires. If the holder stops running — a long GC pause, a frozen VM, a network partition — the lease can expire without it noticing, another process acquires the lock, and when the first resumes it carries on as if nothing happened. Two "holders" then write. Fencing fixes it at the resource: every grant comes with a strictly increasing token, the holder sends the token with each write, and the storage remembers the highest token it has accepted and rejects anything lower. The paused process's late write carries an old token and bounces.
```

```questions
- kind: check
  type: numeric
  prompt: How many node failures can a 5-node Raft cluster tolerate while still committing writes?
  answer: 2
  unit: nodes
  tolerance: 0.01
  explanation: A majority of 5 is 3, so the cluster keeps working with 3 nodes up — that is, with 2 failed.
- kind: check
  prompt: Why does Raft use randomised election timeouts?
  choices:
    - text: To make it unlikely that several followers become candidates at the same time and split the vote
      correct: true
    - text: To encrypt votes
      why: Randomisation is about timing, not security.
    - text: To make leaders change regularly
      why: A healthy leader keeps its role as long as heartbeats arrive.
    - text: Because clocks can't be read precisely
      why: The point is spreading candidates out in time.
  explanation: Staggered timeouts let one candidate usually start and win before the others time out.
- kind: check
  prompt: When is a Raft log entry considered committed?
  choices:
    - text: Once a majority of the cluster has stored it
      correct: true
    - text: As soon as the leader appends it
      why: The leader alone could crash and lose it.
    - text: When every node has stored it
      why: That would let one slow node block progress.
    - text: When the client receives it back
      why: The client is told only after the entry is committed.
  explanation: Majority storage guarantees any future leader has the entry, so committed entries survive the loss of any minority.
- kind: check
  type: multi
  prompt: Which uses suit a coordination service such as etcd or ZooKeeper? Select all that apply.
  choices:
    - text: Electing one active instance of a scheduler
      correct: true
    - text: Storing small shared configuration with change notifications
      correct: true
    - text: Coordinating database failover to prevent two primaries
      correct: true
    - text: Storing a high-volume event stream
      why: That needs a log designed for throughput, such as Kafka.
    - text: Holding terabytes of user data
      why: These stores are designed for small coordination metadata.
  explanation: Coordination services give strongly consistent, small-scale state for agreement problems.
- kind: fire
  prompt: A lock holder pauses for longer than its lease, and another process acquires the lock. What prevents the first from corrupting data when it resumes?
  choices:
    - text: Fencing tokens checked by the protected resource, which rejects writes with an older token
      correct: true
    - text: A longer lease
      why: Pauses can always exceed it.
    - text: Renewing the lease more often
      why: A paused process can't renew anything.
    - text: Logging a warning
      why: That doesn't stop the write.
  explanation: Only the resource being written can reliably reject stale holders, using monotonically increasing tokens.
- kind: fire
  prompt: Why are 4-node consensus clusters uncommon?
  choices:
    - text: They tolerate the same single failure as a 3-node cluster while needing more nodes per write
      correct: true
    - text: Raft requires an odd number of nodes
      why: It works with any size. Even sizes are just less efficient.
    - text: They elect two leaders
      why: Majority voting prevents that.
    - text: They can't tolerate any failures
      why: They tolerate one.
  explanation: A majority of 4 is 3, so 4 nodes tolerate one failure — the same as 3 — at a higher write cost.
- kind: fire
  prompt: During a 2 | 3 partition of a 5-node Raft cluster, what can the 2-node side do?
  choices:
    - text: Nothing that commits — it can't reach a majority to elect a leader or commit entries
      correct: true
    - text: Elect its own leader and accept writes
      why: It would need 3 votes and only has 2.
    - text: Serve linearizable reads normally
      why: Linearizable reads also need majority confirmation or a valid lease.
    - text: Merge with the majority automatically
      why: Not until the partition heals.
  explanation: Only a majority can make progress. The minority side is unavailable for writes, which is what prevents split brain.
- kind: fire
  level: advanced
  prompt: What does the FLP impossibility result imply for practical consensus systems?
  choices:
    - text: They can't guarantee progress in a fully asynchronous network with crashes, so they use timeouts for liveness while always preserving safety
      correct: true
    - text: Consensus is impossible in practice
      why: It works whenever the network is reasonably timely.
    - text: They must use synchronised atomic clocks
      why: Some systems use clocks for performance, but Raft and Paxos don't need them for safety.
    - text: They lose committed data during partitions
      why: Safety is preserved. Only progress stalls.
  explanation: Real systems never violate safety. Under bad network conditions they may stall or hold repeated elections instead.
- kind: fire
  type: multi
  prompt: Which make a lock-protected job safe even if the lock occasionally fails? Select all that apply.
  choices:
    - text: Idempotent effects, such as idempotency keys per invoice
      correct: true
    - text: Fencing tokens enforced by the store being written
      correct: true
    - text: Compare-and-delete when releasing, so you never remove someone else's lock
      correct: true
    - text: Assuming the TTL is always long enough
      why: Pauses and partitions can outlast any TTL.
  explanation: Design so correctness doesn't rest on the lock alone. Then the lock prevents wasted work rather than disasters.
```
