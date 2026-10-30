---
id: java-concurrency
category: languages
skill: languages
title: Java concurrency and the memory model
minutes: 16
summary: Threads share memory, and the Java Memory Model says when one thread is guaranteed to see another's writes. Happens-before edges (locks, volatile, thread start/join, concurrent collections) are the only guarantees; everything else is a race. Interviewers probe visibility vs atomicity, `synchronized` vs `ReentrantLock` vs atomics, executors and back-pressure, CompletableFuture, and what virtual threads change.
objectives:
  - Separate visibility, atomicity and ordering, and name the tool that gives each
  - Explain happens-before and why double-checked locking needs volatile
  - Size and configure a thread pool, including what happens when its queue fills
  - Explain what virtual threads change, and what pins them
sources:
  - ['JSR-133 (Java Memory Model) FAQ', 'https://www.cs.umd.edu/~pugh/java/memoryModel/jsr-133-faq.html']
  - ['Java SE docs: java.util.concurrent', 'https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/package-summary.html']
  - ['JEP 444: Virtual Threads', 'https://openjdk.org/jeps/444']
---

> [!story] The flag that never flipped
> A service had a background thread that polled `while (!stopped) { work(); }`, and a shutdown hook that set `stopped = true`. In tests it stopped instantly. In production, under the JIT, it never stopped: the compiler hoisted the read of the non-volatile `stopped` out of the loop, because nothing in the Java Memory Model required the loop to ever see another thread's write. One keyword, `volatile`, fixed it.

## Three separate problems

Concurrency bugs come in three kinds, and each has its own fix:

- **Visibility**: does thread B ever *see* thread A's write? Without a happens-before edge, it may not, ever. Fixed by `volatile`, locks, or publishing through a concurrent collection.
- **Atomicity**: is a compound action (read-modify-write, check-then-act) indivisible? `count++` is three steps. Fixed by locks, `AtomicLong`/`LongAdder`, or `ConcurrentHashMap.compute`.
- **Ordering**: the compiler and CPU reorder independent operations. Happens-before edges also constrain reordering.

`volatile` fixes visibility and ordering for single reads and writes. It does **not** make `count++` atomic.

## Happens-before

If action X *happens-before* Y, then Y sees X's effects. The edges you use every day:

| Edge | Meaning |
|---|---|
| Program order | Within one thread, earlier actions happen-before later ones |
| Monitor lock | Unlocking a monitor happens-before every later lock of the same monitor |
| Volatile | A write to a volatile field happens-before every later read of that field |
| Thread start / join | `t.start()` happens-before t's actions; t's actions happen-before `t.join()` returns |
| Concurrent collections | Putting an object in happens-before another thread taking it out |
| Futures | A task's actions happen-before `future.get()` returns |

Edges are transitive, which is why "write fields, then write a volatile flag" safely publishes the fields to a reader who reads the flag first.

```bug
title: Lazy singleton
prompt: This lazily created cache is shared by many request threads. Which lines are wrong?
lang: java
code: |
  class Registry {
      private static Registry instance;
      private final Map<String, Handler> handlers = new HashMap<>();
      static Registry get() {
          if (instance == null) {
              synchronized (Registry.class) {
                  if (instance == null) instance = new Registry();
              }
          }
          return instance;
      }
      void register(String k, Handler h) { handlers.put(k, h); }
  }
bug: [2, 3]
explain: |
  **Line 2**: double-checked locking needs `instance` to be **volatile**. Without it, another thread can see a non-null reference to a `Registry` whose constructor writes aren't visible yet: the reference assignment can be reordered before the object is fully initialised. **Line 3**: a plain `HashMap` mutated by many threads can lose entries or corrupt its buckets. Use `ConcurrentHashMap`. Simpler still: the holder idiom (`private static class Holder { static final Registry I = new Registry(); }`), which class initialisation makes lazy and thread-safe for free.
```

## Locks, atomics and concurrent collections

- **`synchronized`**: simple, reentrant, released automatically. Good default.
- **`ReentrantLock`**: adds `tryLock` with timeout, interruptible waits, fairness and multiple `Condition`s. Always unlock in `finally`.
- **`ReadWriteLock` / `StampedLock`**: many readers, rare writers. `StampedLock` has optimistic reads but isn't reentrant.
- **Atomics**: `AtomicLong.incrementAndGet` uses compare-and-set. Under heavy contention, `LongAdder` spreads updates across cells and is much faster for counters you read rarely.
- **`ConcurrentHashMap`**: lock striping per bin. `computeIfAbsent` is atomic per key. Its `size()` is only an estimate under concurrent updates.

Deadlock needs four conditions; break any one of them. In practice the fix is a **global lock order** (always lock account with the lower id first) or `tryLock` with timeout and back-off.

## Executors and back-pressure

Don't create threads per task. A `ThreadPoolExecutor` has a core size, a max size, a work queue and a rejection policy, and they interact in a way that surprises people: **it only grows past the core size when the queue is full.** With an unbounded `LinkedBlockingQueue`, the max size is never used and the queue can grow until the heap runs out.

Sizing rule of thumb: CPU-bound work wants about one thread per core. Blocking I/O work wants `cores × (1 + wait time / compute time)`. Better still, bound the queue and choose a rejection policy: `CallerRunsPolicy` slows the producer down, which is natural back-pressure.

```predict
prompt: A `ThreadPoolExecutor` has core size 4, max size 32, and an unbounded `LinkedBlockingQueue`. Tasks are slow I/O calls and arrive faster than 4 threads can finish them. What happens?
choices:
  - The pool grows to 32 threads and stays there
  - The pool stays at 4 threads and the queue grows without limit
  - Tasks are rejected once 32 are running
  - The pool alternates between 4 and 32 threads
answer: 1
reveal: |
  The executor creates threads beyond the core size only when the queue rejects an offer, and an unbounded queue never does. So you get 4 threads, an ever-growing backlog, rising latency, and eventually `OutOfMemoryError`. `Executors.newFixedThreadPool` is built exactly like this. Use a bounded `ArrayBlockingQueue` with a rejection policy, or a semaphore in front of the pool.
```

## CompletableFuture and virtual threads

`CompletableFuture` composes asynchronous steps (`thenApply`, `thenCompose`, `allOf`). Two traps: async stages without an explicit executor run on the common `ForkJoinPool`, which is sized for CPU work, so blocking calls there starve everyone. And exceptions travel down the chain until something handles them with `exceptionally` or `handle`. If nothing does, the failure is silent.

**Virtual threads** (Java 21) are cheap threads that the JVM mounts on a few carrier threads. When one blocks on I/O, it unmounts, so you can write simple blocking code and run a million concurrent requests. They don't make CPU-bound work faster. Watch for **pinning**: blocking inside a `synchronized` block (before JDK 24) or in native code holds the carrier thread. Don't pool virtual threads; create one per task and limit concurrency with a semaphore.

```recall
prompt: An interviewer asks, "What's the difference between `volatile` and `AtomicInteger`, and when do you need a lock instead?" Answer as you would out loud.
points:
  - volatile guarantees visibility and ordering of single reads/writes (a happens-before edge), not atomicity of compound actions
  - AtomicInteger adds atomic read-modify-write operations via compare-and-set (incrementAndGet, compareAndSet)
  - A lock is needed when an invariant spans several variables or steps (check-then-act across fields)
  - Mentions a concrete example such as count++ being a lost-update race on a volatile field
model: |
  `volatile` gives visibility and ordering: a write is seen by every later read, and it acts as a publication barrier. But `count++` on a volatile field is still three steps, so two threads can both read 5 and both write 6. `AtomicInteger` fixes single-variable read-modify-write with compare-and-set loops, like `incrementAndGet`. When the invariant spans more than one variable, for example moving money between two balances or check-then-insert across two maps, no single atomic covers it, so you need a lock or a single atomic operation on a combined structure.
```

```questions
- kind: check
  prompt: A field is declared `volatile int count` and ten threads each run `count++` 1,000 times. What final value can you expect?
  choices:
    - text: Anything up to 10,000, because `count++` is not atomic
      correct: true
    - text: Exactly 10,000, because volatile makes it thread-safe
      why: volatile gives visibility, not atomicity of read-modify-write.
    - text: Exactly 1,000, because each thread overwrites the others
      why: Updates interleave; most usually survive.
    - text: It throws ConcurrentModificationException
      why: That exception is about iterating collections, not primitive fields.
  explanation: Two threads can read the same value and both write value + 1, losing an update. Use AtomicInteger or LongAdder.
- kind: check
  prompt: Which of these creates a happens-before edge between thread A's writes and thread B's reads?
  type: multi
  choices:
    - text: A releases a lock that B later acquires
      correct: true
    - text: A writes a volatile field that B later reads
      correct: true
    - text: A puts an object into a ConcurrentLinkedQueue that B takes out
      correct: true
    - text: A calls Thread.sleep(100) before B reads
      why: Sleeping creates no memory ordering guarantee at all.
  explanation: Locks, volatiles and concurrent collections all publish safely. Timing does not.
- kind: check
  prompt: Why does an unbounded queue make a ThreadPoolExecutor's maximum pool size useless?
  choices:
    - text: The pool only adds threads beyond the core size when the queue refuses a task
      correct: true
    - text: Unbounded queues disable thread creation entirely
      why: Core threads are still created.
    - text: The maximum size applies only to scheduled executors
      why: It applies to every ThreadPoolExecutor.
  explanation: Offers to an unbounded queue always succeed, so the pool stays at core size while the backlog grows.
- kind: fire
  prompt: You need a hit counter incremented by thousands of threads and read once a minute. Best choice?
  choices:
    - text: LongAdder
      correct: true
    - text: synchronized long
      why: Correct, but every increment contends on one monitor.
    - text: volatile long
      why: Not atomic, so increments are lost.
    - text: AtomicLong
      why: Correct, but a single contended CAS location is slower than LongAdder's striped cells.
  explanation: LongAdder spreads increments across cells and sums them on read, which suits write-heavy, read-rarely counters.
- kind: fire
  prompt: What's the standard way to prevent deadlock when transferring between two accounts that each have a lock?
  choices:
    - text: Always acquire the two locks in a global order, such as by account id
      correct: true
    - text: Make the locks fair
      why: Fairness affects starvation, not lock-order cycles.
    - text: Use volatile balances
      why: That gives no mutual exclusion.
  explanation: A consistent order breaks the circular-wait condition.
- kind: fire
  prompt: A virtual thread blocks on a socket read inside a synchronized block (JDK 21). What happens?
  choices:
    - text: It pins its carrier thread, which can't run other virtual threads until the read returns
      correct: true
    - text: It unmounts normally and frees the carrier
      why: Monitors pinned the carrier before JDK 24; ReentrantLock doesn't.
    - text: The JVM throws an IllegalStateException
      why: It runs, just with reduced scalability.
  explanation: Pinning keeps the carrier busy. Prefer ReentrantLock around blocking calls on JDK 21 to 23.
- kind: fire
  prompt: CompletableFuture.supplyAsync(task) without an executor runs the task where?
  choices:
    - text: On the common ForkJoinPool
      correct: true
    - text: On the calling thread
      why: That's what the non-async variants can do.
    - text: On a new platform thread per task
      why: It reuses the shared common pool.
  explanation: Blocking I/O there starves every other user of the common pool. Pass your own executor.
```
