---
id: consistency
category: distributed
skill: requirements
title: Consistency models, quorums and partitions
minutes: 18
summary: '"Consistent" means different things in different contexts. In distributed data it is a spectrum — from linearizable (behaves like one copy) through causal to eventual. During a network partition, an operation must either stay available and risk inconsistency or stay consistent and refuse to answer (CAP). Even without partitions, stronger consistency costs latency (PACELC). Make the choice per operation, and implement it with quorums or a single leader.'
objectives:
  - Distinguish linearizable, sequential, causal, read-your-writes and eventual consistency with concrete examples
  - State CAP and PACELC precisely and apply them per operation, not per product
  - Reason about quorums (R + W > N), sloppy quorums, hinted handoff, read repair and anti-entropy
  - Choose consistency levels for real operations and explain the failure behaviour to users
sources:
  - ['Martin Kleppmann: Please stop calling databases CP or AP', 'https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html']
  - ['Daniel Abadi: Consistency tradeoffs in modern distributed database system design (PACELC)', 'https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf']
  - ['Jepsen: Consistency models', 'https://jepsen.io/consistency']
case: seats
---

> [!story] The likes that went backwards
> A social app stored like counts in a Dynamo-style store with `R = 1, W = 1` for speed. Users noticed a post's likes jump from 1,204 to 1,198 and back on refresh — reads hit different replicas that had applied different updates. Annoying, harmless. The same team then used the same settings for "has this coupon been redeemed?" and discovered that, under replica lag, the same single-use coupon could be redeemed several times. Identical storage, different requirement: the consistency level has to be chosen per operation.

## The spectrum

| Model | Promise | Example of what's forbidden |
|---|---|---|
| **Linearizable** (strong) | Every operation appears to take effect atomically at one instant between its start and end; all clients see one order consistent with real time | After a write completes, any later read returning the old value |
| **Sequential** | All clients see the same order of operations, but it needn't match real time across clients | Two clients disagreeing on the order of two writes |
| **Causal** | Operations that are causally related (a reply after the post it answers) are seen in that order by everyone; concurrent ones may differ | Seeing a reply before the comment it replies to |
| **Read-your-writes / monotonic reads** (session guarantees) | A client sees its own writes and never goes back in time | Your edit disappearing on refresh |
| **Eventual** | If writes stop, replicas converge — eventually | Nothing in particular, in the meantime |

```timeline
title: Is this linearizable?
intro: Three replicas, asynchronous replication. Client A writes, then — after A's write has completed — client B reads.
lanes: [Client A, Client B, Replica 1, Replica 2]
state: {'Replica 1': 'x = 1', 'Replica 2': 'x = 1'}
steps:
  - {lane: Client A, to: Replica 1, text: 'write x = 2 → ack', set: {'Replica 1': 'x = 2'}}
  - {lane: Client A, to: Client B, text: 'A tells B over chat: "updated, go look"'}
  - {lane: Client B, to: Replica 2, text: 'read x → 1', note: 'Replica 2 has not applied the write yet'}
  - {lane: Replica 1, to: Replica 2, text: 'replicate x = 2', set: {'Replica 2': 'x = 2'}}
find:
  prompt: Which step violates linearizability?
  answer: 2
  explain: |
    B's read started **after** A's write completed, yet returned the old value. A linearizable system must return 2. This system is eventually consistent — it converges at step 4 — and even causally broken, because B acted on A's message. Fixes: read from the leader or a quorum that overlaps the write, or have B carry the write's version and wait for it.
```

## CAP, stated properly

During a **network partition**, a replica cut off from the others must choose, *for each operation*:

- **Consistency:** refuse (or wait) rather than return something that might violate the promise, or
- **Availability:** answer anyway, risking stale reads or conflicting writes.

CAP doesn't mean "pick two of three in normal operation", and partition tolerance isn't optional — networks partition. Labelling an entire product "CP" or "AP" hides that operations differ.

**PACELC** extends it: if there's a **P**artition, choose **A** or **C**; **E**lse (normal operation), choose **L**atency or **C**onsistency. Strong consistency costs coordination — round trips to a leader or a quorum — every time, not just during failures.

```sort
prompt: During a partition, should each operation prefer consistency (refuse) or availability (answer, possibly stale)?
buckets: [Prefer consistency, Prefer availability]
items:
  - {text: 'Confirm the last seat for a concert', bucket: 0, why: 'Selling it twice breaks the core invariant. Better to say "try again" than to double-book.'}
  - {text: "Show a user's follower count", bucket: 1, why: 'A slightly stale number is harmless. An error page is worse.'}
  - {text: 'Redeem a single-use coupon', bucket: 0, why: 'Allowing both sides of a partition to redeem it breaks "single use".'}
  - {text: 'Add an item to a shopping cart', bucket: 1, why: "Amazon's classic choice: accept the write and merge carts later. Losing an add costs more than an occasional duplicate."}
  - {text: 'Withdraw cash, limited by the account balance', bucket: 0, why: 'Overdrafts from both sides of a partition are real money.'}
  - {text: 'Render the home feed', bucket: 1, why: 'A feed a few seconds old is fine. Availability wins.'}
```

## Quorums in leaderless systems

Dynamo-style stores (Cassandra, Riak, DynamoDB internally) write to **N** replicas and consider a write successful after **W** acknowledgements. A read asks **R** replicas and returns the newest version among them.

- If **R + W > N**, every read set overlaps every write set, so a read sees at least one replica with the latest acknowledged write (given no concurrent writes and no sloppy quorum).
- `N = 3, W = 2, R = 2` is the classic balanced choice. `W = 3, R = 1` gives fast reads and fragile writes; `W = 1, R = 1` is fast and only eventually consistent.

```sim
name: quorum
title: Quorums and partitions
config: {initial: {w: 1, r: 1}}
challenges:
  - {text: 'Set N=3, W=1, R=1 and catch a stale read (write, then read until you get an old version)', metric: staleRead, op: '==', value: 1}
  - {text: 'Choose W and R so quorums overlap for N=3 (stale-read rate drops to 0%)', metric: staleRate, op: '==', value: 0, and: [{metric: n, op: '==', value: 3}]}
  - {text: 'With N=3, W=2, R=2, cut off two nodes. Can you still write?', metric: down, op: '>=', value: 2, and: [{metric: w, op: '==', value: 2}]}
takeaway: |
  Overlapping quorums give strong-looking reads, at the price that a minority of reachable replicas can't serve them — exactly CAP's trade-off made concrete. Real systems add **read repair** (fix stale replicas seen during reads), **anti-entropy** (background Merkle-tree comparison) and **hinted handoff** (another node holds writes for a down replica), which improve convergence but don't change the basic overlap arithmetic.
```

> [!senior] Quorums aren't automatically linearizable
> Even with R + W > N, concurrent writes, clock-based last-write-wins conflict resolution, **sloppy quorums** (writing to stand-in nodes during failures) and partial write failures can produce non-linearizable results. Cassandra's lightweight transactions (Paxos) exist for operations such as compare-and-set that truly need linearizability. When an invariant matters, use a single leader or consensus for that operation.

```calc
title: How many replicas can be down?
prompt: A Dynamo-style store runs with **N = 5**, **W = 3** and **R = 3**. How many replicas can be unreachable while **both** reads and writes for a key still succeed?
answer: 2
unit: replicas
tolerance: 1.01
steps: |
  Writes need 3 of 5 reachable, so up to 2 can be down. Reads also need 3 of 5, so 2 again. The answer is **2**, with R + W = 6 > 5 so every read overlaps every write. Changing to W = 4, R = 2 keeps the overlap but writes now fail if 2 replicas are down — consistency settings decide *which* operations lose availability.
```

## Choosing per operation

Most products need several levels at once:

- **Linearizable** for invariants: uniqueness, balances, inventory decrements, leader election, locks.
- **Causal or session guarantees** for user experience: you see your own edits, replies appear after posts.
- **Eventual** for derived or display data: counts, feeds, search indexes, recommendations.

Then tell users what failure looks like: "We couldn't confirm your seat — please retry", rather than a silent double booking.

```predict
prompt: A messaging app shows a reply before the message it replies to for some users, then fixes itself a second later. Which guarantee is missing?
choices:
  - Linearizability
  - Causal consistency — causally related messages must appear in order everywhere
  - Durability
  - Partition tolerance
answer: 1
reveal: |
  The reply depends on the original, so everyone should see them in that order. Causal consistency (implemented with per-conversation sequence numbers, version vectors or delivery ordering) prevents this without the cost of full linearizability across the whole system.
```

```interview
ask: How would you choose consistency guarantees for an event ticketing system’s seat holds, confirmations and availability displays, balancing latency and user experience during network partitions?
say: |
  "Different operations get different guarantees. Seat confirmation is linearizable — a single leader per event partition with a conditional write — so during a partition, the minority side refuses confirmations with a retry message. Seat maps and counts are eventually consistent from replicas and caches, up to about 10 seconds stale. Users always see their own holds, via session routing to the leader. If we used a leaderless store for anything critical, it'd be quorum reads and writes with R + W > N plus lightweight transactions for compare-and-set; everything else runs at ONE for latency."
followups:
  - q: Is your system CP or AP?
    a: Neither label is useful on its own. Confirmation chooses consistency under partition; browsing chooses availability. I'd describe the behaviour of each operation.
  - q: What does R + W > N give you?
    a: Read and write sets overlap, so a read contacts at least one replica that has the latest acknowledged write. On its own it doesn't guarantee linearizability under concurrency or sloppy quorums.
  - q: What's PACELC adding to CAP?
    a: That even without partitions, consistency costs latency, because coordination needs round trips. So you trade latency against consistency all the time, not just during failures.
weak: |
  "We'll use an AP database because availability matters," or "CAP means pick two." No per-operation reasoning, no quorum arithmetic.
strong: |
  Names the consistency model each operation needs, explains partition behaviour per operation, uses quorum arithmetic correctly with its caveats, accounts for latency (PACELC), and describes what users see during failures.
```

```recall
prompt: Explain what CAP actually says, why "CP or AP" is a poor description of a whole system, and give an example of one product choosing differently for two operations.
points:
  - CAP applies during a network partition — a replica that can't reach others must either refuse (consistency) or answer possibly stale or conflicting (availability)
  - Partitions aren't optional, so the real choice is C versus A during them, not "pick two"
  - The choice can differ per operation in the same product, so a single label hides the real behaviour
  - Example — a ticketing site refuses seat confirmation on the minority side (C) but keeps serving the seat map from replicas (A)
model: |
  CAP says that when the network partitions, a node that can't coordinate must either refuse requests to preserve consistency, or serve them and risk returning stale data or accepting conflicting writes. Since partitions happen whatever you do, the decision is C versus A during them. That decision belongs to operations, not products. A ticketing system can make "confirm this seat" refuse with a retry message when it can't reach the leader — protecting one owner per seat — while "show the seat map" happily serves a slightly stale replica copy. Calling the whole system CP or AP describes neither.
```

```questions
- kind: check
  prompt: Client A's write completes. Afterwards, client B reads the same key and gets the old value. Which model is violated?
  choices:
    - text: Linearizability
      correct: true
    - text: Eventual consistency
      why: The replicas may still converge later, so eventual consistency allows this.
    - text: Durability
      why: The write wasn't lost — it just hasn't reached the replica B read from.
    - text: Partition tolerance
      why: That isn't a consistency model.
  explanation: Linearizability requires any read starting after a write completes to see that write (or a newer one).
- kind: check
  type: numeric
  prompt: With N = 5 replicas and W = 3, what's the smallest R that guarantees read and write quorums overlap?
  answer: 3
  unit: replicas
  tolerance: 0.01
  explanation: You need R + W > N, so R > 2 and R = 3. Then any 3 replicas read share at least one with any 3 written.
- kind: check
  type: multi
  prompt: Which operations usually need linearizable (strong) consistency? Select all that apply.
  choices:
    - text: Decrementing the last unit of inventory
      correct: true
    - text: Ensuring a username is unique
      correct: true
    - text: Electing a single leader for a partition
      correct: true
    - text: Showing a view counter
      why: A slightly stale count is fine.
    - text: Updating a recommendations list
      why: Derived data can be eventually consistent.
  explanation: Invariants and coordination need strong consistency. Display and derived data rarely do.
- kind: check
  prompt: What does PACELC add to CAP?
  choices:
    - text: Even with no partition, stronger consistency costs latency, because of the coordination round trips
      correct: true
    - text: Partitions can be avoided with better networks
      why: Partitions still happen. PACELC is about normal operation.
    - text: Availability is more important than consistency
      why: It frames a trade-off, not a preference.
    - text: Databases must be CP
      why: It describes trade-offs and prescribes nothing.
  explanation: The latency/consistency trade-off is present on every request, not just during failures.
- kind: fire
  prompt: A reply appears before its parent message for some users. What's missing?
  choices:
    - text: Causal consistency
      correct: true
    - text: Linearizability across the whole system
      why: That would fix it, but causal consistency is the minimal guarantee needed.
    - text: Strong durability
      why: Nothing was lost.
    - text: Sharding
      why: Unrelated.
  explanation: Causally related operations must be seen in order. Per-conversation sequencing or version vectors provide it cheaply.
- kind: fire
  prompt: In a 3-replica quorum system with W = 2 and R = 2, two replicas become unreachable. What happens?
  choices:
    - text: Both reads and writes fail for keys on those replicas — the system chose consistency for them
      correct: true
    - text: Reads and writes continue normally
      why: Only one replica is reachable, which is fewer than either quorum.
    - text: Writes succeed but reads fail
      why: Writes need 2 acknowledgements too.
    - text: The data is lost
      why: It's unavailable, not lost.
  explanation: Quorums trade availability for consistency when too few replicas are reachable.
- kind: fire
  prompt: Why is calling a database "AP" or "CP" usually unhelpful?
  choices:
    - text: Behaviour depends on configuration and on the operation, and many systems offer different levels per request
      correct: true
    - text: Because CAP is wrong
      why: The theorem is fine. Labels oversimplify how it applies.
    - text: Because databases never partition
      why: Networks partition.
    - text: Because every database is CA
      why: CA doesn't exist under partitions.
  explanation: Describe each operation's behaviour during partitions and its latency cost instead.
- kind: fire
  level: advanced
  prompt: Why might R + W > N still fail to give linearizable behaviour?
  choices:
    - text: Concurrent writes, last-write-wins on skewed clocks, sloppy quorums and partially failed writes can all expose anomalies
      correct: true
    - text: The arithmetic is wrong
      why: The overlap argument is right for reaching the latest acknowledged write. The anomalies come from elsewhere.
    - text: Quorums only work with N = 3
      why: Any N works.
    - text: Reads ignore versions
      why: Reads compare versions. That doesn't remove these edge cases.
  explanation: Use consensus-backed operations (such as Paxos-based lightweight transactions) or a single leader for operations that truly need linearizability.
- kind: fire
  type: multi
  prompt: Which mechanisms help leaderless replicas converge after failures? Select all that apply.
  choices:
    - text: Read repair — updating stale replicas noticed during reads
      correct: true
    - text: Anti-entropy — background comparison using Merkle trees
      correct: true
    - text: Hinted handoff — another node holds writes for a down replica and forwards them later
      correct: true
    - text: Disabling replication during failures
      why: That increases divergence.
  explanation: These repair divergence over time. They improve eventual consistency without changing quorum overlap.
```
