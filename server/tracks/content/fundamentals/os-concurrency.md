---
id: os-concurrency
category: systems
skill: systems
title: 'Synchronisation: mutexes, semaphores, monitors and deadlock'
minutes: 17
summary: When threads share data, a critical section must run as if alone. A mutex gives one thread at a time; a semaphore counts permits; a condition variable lets a thread sleep until some state changes, and a monitor bundles a lock with its conditions. Always wait on a condition in a loop. Deadlock needs four conditions at once (mutual exclusion, hold and wait, no preemption, circular wait), so you prevent it by breaking one, most often with a global lock order. Livelock, starvation and spinning versus blocking are the follow-ups.
objectives:
  - Explain race conditions, critical sections and what makes an operation atomic
  - Compare mutexes, spinlocks, semaphores, condition variables and monitors
  - Write a correct bounded buffer, waiting in a loop
  - State the four Coffman conditions and prevent deadlock by breaking one
  - Distinguish deadlock, livelock and starvation
sources:
  - ['Arpaci-Dusseau, Operating Systems: Three Easy Pieces, chapters 26 to 32 (concurrency)', 'https://pages.cs.wisc.edu/~remzi/OSTEP/']
  - ['Allen B. Downey, The Little Book of Semaphores', 'https://greenteapress.com/wp/semaphores/']
  - ['E. G. Coffman, M. Elphick, A. Shoshani, System Deadlocks (1971)', 'https://dl.acm.org/doi/10.1145/356586.356588']
  - ['Butler Lampson, David Redell, Experience with Processes and Monitors in Mesa (1980)', 'https://dl.acm.org/doi/10.1145/358818.358824']
---

## Races and critical sections

`count++` looks like one step but is three: load, add, store. Two threads interleaving those steps lose updates. Any code that reads and writes shared state, where the result depends on timing, is a **race condition**; the code that touches the shared state is a **critical section**, and it needs **mutual exclusion**. The Java lesson shows the same problem from the language side ([Java concurrency](#/fundamentals/lesson/java-concurrency)).

The building block underneath every lock is an atomic hardware instruction: **test-and-set**, **compare-and-swap** (CAS) or load-linked/store-conditional. CAS ("set x to new if it still equals old") also powers lock-free counters and queues.

## The primitives

- **Mutex** (lock): one holder at a time; others block until it's released. Only the holder may unlock it.
- **Spinlock**: waiters loop on the lock instead of sleeping. Cheaper than a context switch when critical sections are a few hundred nanoseconds and every thread has its own core; wasteful otherwise. Kernels use them; user code mostly shouldn't, and modern mutexes spin briefly before sleeping anyway (Linux futexes are uncontended in user space).
- **Semaphore** (Dijkstra): an integer with `wait` (P: decrement, block if it would go negative) and `signal` (V: increment, wake a waiter). A **counting** semaphore limits concurrency to N (a pool of 10 database connections); a **binary** semaphore is like a mutex but any thread may signal it, which makes it useful for signalling between threads.
- **Condition variable**: lets a thread sleep *inside* a critical section until some condition might be true. `wait(cv, mutex)` atomically releases the mutex and sleeps, then re-acquires it before returning. `signal` wakes one waiter, `broadcast` wakes all.
- **Monitor**: a lock plus its condition variables, with every method running under the lock. Java's `synchronized` with `wait`/`notify`, and Python's `threading.Condition`, are monitors.
- **Read-write lock**: many readers or one writer. Good for read-heavy data; watch for writer starvation.

```sort
prompt: Which primitive fits each job best?
buckets: [Mutex, Counting semaphore, Condition variable, Read-write lock]
items:
  - {text: 'At most 10 threads may hold a database connection at once', bucket: 1, why: 'N permits.'}
  - {text: 'Protect a balance while it is read, checked and updated', bucket: 0, why: 'One holder at a time.'}
  - {text: 'A consumer sleeps until the queue is non-empty', bucket: 2, why: 'Sleep until a state change, under the queue''s lock.'}
  - {text: 'A routing table read on every request and replaced every few minutes', bucket: 3, why: 'Many concurrent readers, rare writers.'}
  - {text: 'Rate-limit calls to an API to 5 in flight', bucket: 1, why: 'Bound concurrency.'}
  - {text: 'A worker waits until "shutdown requested or work available"', bucket: 2, why: 'A predicate over shared state.'}
```

## Waiting in a loop

The bounded buffer (producer-consumer) is the canonical exercise. Producers wait while the buffer is full; consumers wait while it's empty. The rule that catches people: **always re-check the condition in a `while` loop after waking.**

Two reasons. Most systems use **Mesa semantics**: `signal` only makes a waiter runnable, and by the time it re-acquires the lock another thread may have taken the item. And **spurious wakeups** are allowed: `wait` may return with no signal at all. (Hoare semantics, where the signalled thread runs immediately, would make `if` safe; almost nothing implements it.)

```bug
title: A bounded buffer
prompt: Two producers and two consumers share this queue. Under load, a consumer occasionally pops from an empty list. Which lines are wrong?
lang: python
code: |
  class BoundedBuffer:
      def __init__(self, cap):
          self.items, self.cap = [], cap
          self.lock = threading.Lock()
          self.not_full = threading.Condition(self.lock)
          self.not_empty = threading.Condition(self.lock)

      def put(self, x):
          with self.lock:
              while len(self.items) == self.cap:
                  self.not_full.wait()
              self.items.append(x)
              self.not_empty.notify()

      def take(self):
          with self.lock:
              if not self.items:
                  self.not_empty.wait()
              x = self.items.pop(0)
              self.not_full.notify()
              return x
bug: [17]
explain: |
  Line 17 checks with `if`. Consumer A waits on an empty buffer; a producer adds an item and notifies; before A re-acquires the lock, consumer B (which wasn't waiting) takes the item. A wakes, doesn't re-check, and pops from an empty list. Spurious wakeups cause the same failure. `put` gets it right with `while` on line 10. Use `while not self.items:` in `take`.
```

## Deadlock

Deadlock is a set of threads each waiting for a resource another one holds, so none can proceed. It requires all four **Coffman conditions** at once:

1. **Mutual exclusion**: resources can't be shared.
2. **Hold and wait**: a thread holds one resource while waiting for another.
3. **No preemption**: resources can't be taken away.
4. **Circular wait**: a cycle in the "waits for" graph.

Break any one and deadlock is impossible:

- **Circular wait** is the usual target: acquire locks in a **global order** (by account ID, by address, by a documented hierarchy). Transferring between accounts? Lock the lower ID first, whichever direction the money moves.
- **Hold and wait**: acquire everything at once, or with `tryLock`: if the second lock isn't available, release the first and retry after a random back-off.
- **No preemption**: timeouts on lock acquisition, and databases that abort one transaction to break a cycle.
- Or limit how many contend at once (a semaphore with N−1 permits around N resources).

Databases **detect** deadlocks rather than prevent them: they build the wait-for graph, find the cycle, and abort one transaction, which your code should simply retry. The banker's algorithm (avoidance, by refusing allocations that could lead to an unsafe state) is textbook material rarely used in practice, because it needs to know maximum demands in advance.

```sim
name: philosophers
title: Dining philosophers
intro: 'Philosophers sit around a table with one fork between each pair and need both neighbouring forks to eat. Each strategy runs 100 times with random timing.'
challenges:
  - {text: 'Deadlock the table', metric: deadlockRate, op: '>', value: 0}
  - {text: 'Break circular wait with a lock order and never deadlock', metric: deadlockRate, op: '==', value: 0, and: [{metric: strategy, op: '==', value: 'ordered'}]}
  - {text: 'Prevent deadlock with a semaphore instead', metric: deadlockRate, op: '==', value: 0, and: [{metric: strategy, op: '==', value: 'waiter'}]}
takeaway: |
  Deadlock needs all four Coffman conditions. A global lock order removes circular wait, tryLock with back-off removes hold-and-wait, and limiting the number of contenders makes a full cycle impossible. Shorter thinking times mean more contention and faster deadlocks.
```

```timeline
title: Two transfers, two locks
lanes: [Transfer A→B, Account A lock, Account B lock, Transfer B→A]
state: {A: free, B: free}
steps:
  - {lane: Transfer A→B, to: Account A lock, text: 'lock(A)', set: {A: 'held by A→B'}}
  - {lane: Transfer B→A, to: Account B lock, text: 'lock(B)', set: {B: 'held by B→A'}}
  - {lane: Transfer A→B, to: Account B lock, text: 'lock(B): blocks, B→A holds it'}
  - {lane: Transfer B→A, to: Account A lock, text: 'lock(A): blocks, A→B holds it'}
find:
  prompt: Both transfers wait forever. Which step first made a deadlock possible, by acquiring locks in a different order from the other transfer?
  answer: 1
  explain: Transfer B→A locked B first while A→B locked A first, so the two disagree on order and a cycle can form. If both lock the lower-numbered account first, B→A would block on lock(A) at step 1 while holding nothing, and A→B would complete.
```

## Deadlock's relatives

- **Livelock**: threads keep changing state in response to each other without progress, like two people stepping aside in a corridor in sync. Naive tryLock-and-retry does it; random back-off breaks the symmetry.
- **Starvation**: one thread never gets the resource because others keep winning. Unfair locks, reader-preferring read-write locks and priority schedulers can starve; fair (FIFO) locks fix it at some cost in throughput.
- **Priority inversion**: see [CPU scheduling](#/fundamentals/lesson/os-scheduling).

```recall
prompt: An interviewer asks, "Two threads each transfer money between two bank accounts and sometimes the app hangs. Why, and how do you fix it?"
points:
  - Each transfer locks its source then its destination, so opposite transfers acquire in opposite orders
  - All four Coffman conditions hold, and the circular wait makes a deadlock
  - Fix by imposing a global lock order, such as always locking the lower account ID first
  - Alternatives are tryLock with timeout and random back-off, or a single lock or a database transaction
  - Detect with a thread dump (jstack) showing each thread waiting on a lock the other holds
model: |
  Each transfer locks the source account and then the destination. A transfer from A to B locks A then B, while a concurrent B-to-A transfer locks B then A. If each gets its first lock, each waits forever for the other's: mutual exclusion, hold-and-wait, no preemption and circular wait all hold, so it's a deadlock. A thread dump (`jstack`, or `py-spy dump`) shows two threads each blocked on a lock the other owns. The standard fix is a global order: always lock the account with the lower ID first, regardless of direction, which makes a cycle impossible. Alternatives: `tryLock` with a timeout and random back-off (breaks hold-and-wait, risks livelock without the randomness), or move the transfer into one database transaction and let the database detect deadlocks and retry the victim.
```

```questions
- kind: check
  prompt: Why must a thread re-check its condition in a while loop after `wait()` on a condition variable returns?
  choices:
    - text: The state may have changed before it got the lock back, and spurious wakeups happen
      correct: true
    - text: Because wait() keeps holding the lock, so the state can't be trusted afterwards
      why: It does release it, atomically, and re-acquires it before returning.
    - text: To avoid a deadlock with the signalling thread
      why: The issue is a stale condition, not deadlock.
    - text: Because signal() always wakes every waiting thread at once, not just one of them
      why: signal() wakes one; broadcast() wakes all. Either way, re-check.
  explanation: Under Mesa semantics a signal is a hint that the condition may be true.
- kind: check
  prompt: Which Coffman condition does "always lock the lower account ID first" break?
  choices:
    - text: Circular wait
      correct: true
    - text: Hold and wait
      why: Threads still hold one lock while waiting for another.
    - text: Mutual exclusion
      why: Locks are still exclusive.
    - text: No preemption
      why: Locks still can't be taken away.
  explanation: With a total order on locks, a cycle in the wait-for graph can't form.
- kind: check
  prompt: When is a spinlock a better choice than a blocking mutex?
  choices:
    - text: The critical section is very short and the holder is running on another core
      correct: true
    - text: The critical section performs disk I/O that can take several milliseconds
      why: Spinning while the holder waits on disk wastes a whole core.
    - text: There are many more runnable threads than cores, so contention is high
      why: The holder may not even be running; spinning burns its CPU time.
    - text: Always, because spinlocks avoid context switches
      why: Only when the wait is shorter than a context switch.
  explanation: Spinning costs a core while waiting; sleeping costs a context switch.
- kind: check
  prompt: Two threads repeatedly try to take each other's lock with tryLock, release on failure and retry immediately. Neither makes progress, but neither is blocked. What is this?
  choices:
    - text: Livelock
      correct: true
    - text: Deadlock
      why: Neither is blocked; they keep acting.
    - text: Starvation
      why: Starvation is one thread losing while others progress.
    - text: Priority inversion
      why: No priorities are involved.
  explanation: Random back-off breaks the symmetry.
- kind: fire
  prompt: What does a counting semaphore initialised to 5 allow?
  choices:
    - text: Up to 5 threads past wait() at once
      correct: true
    - text: Exactly 5 calls to signal() before it blocks
      why: Signal may be called any number of times.
    - text: One thread, 5 times
      why: That's a reentrant lock.
  explanation: A natural fit for bounding concurrency.
- kind: fire
  prompt: Which hardware instruction underlies most lock-free data structures?
  choices:
    - text: Compare-and-swap
      correct: true
    - text: Memory fence only
      why: Fences order memory; they don't update atomically.
    - text: A system call
      why: Lock-free code avoids the kernel.
  explanation: CAS updates a word only if it still holds the expected value.
- kind: fire
  prompt: How do databases usually handle deadlocks between transactions?
  choices:
    - text: Detect the cycle and abort one transaction, which the client retries
      correct: true
    - text: Prevent them in advance with the banker's algorithm on every lock request
      why: That needs advance knowledge of every transaction's needs.
    - text: They can't deadlock, because of MVCC
      why: Row locks still can.
  explanation: Postgres checks after deadlock_timeout and aborts one waiter.
- kind: fire
  prompt: What is a monitor?
  choices:
    - text: A lock plus condition variables, with every method run while holding the lock
      correct: true
    - text: A background thread that watches the others and kills any that deadlock
      why: That's a watchdog or detector.
    - text: A spinlock with a timeout
      why: Not the term.
  explanation: Java's synchronized plus wait/notify is a monitor.
- kind: fire
  prompt: Which is NOT one of the four Coffman conditions?
  choices:
    - text: Starvation
      correct: true
    - text: Hold and wait
      why: It is one.
    - text: Circular wait
      why: It is one.
  explanation: Mutual exclusion, hold and wait, no preemption, circular wait.
```
