---
id: jvm-internals
category: java
skill: java
title: The JVM: class loading, JIT and garbage collection
minutes: 18
summary: Java compiles to bytecode that the JVM loads lazily, interprets, and then compiles to machine code for the hot paths, which is why a fresh service is slow for its first minute. Memory is split into the heap, metaspace, thread stacks and native memory, and each has its own out-of-memory error. The garbage collector frees what isn't reachable from the GC roots, and generational collectors make the common case (objects that die young) cheap. Interviewers probe how GC works, G1 versus ZGC, what a Java memory leak is, how to read the different OutOfMemoryErrors, and heap sizing in containers.
objectives:
  - Describe how a class gets from source to running machine code, including class loading and tiered JIT compilation
  - Name the JVM's memory areas and match each OutOfMemoryError to its cause
  - Explain reachability, generational collection and promotion, and compare G1 with ZGC
  - Diagnose a Java memory leak and size the heap for a container
sources:
  - ['The Java Virtual Machine Specification: Loading, Linking, and Initializing', 'https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html']
  - ['HotSpot Virtual Machine Garbage Collection Tuning Guide', 'https://docs.oracle.com/en/java/javase/21/gctuning/']
  - ['JEP 439: Generational ZGC', 'https://openjdk.org/jeps/439']
  - ['Java SE docs: Troubleshooting memory leaks', 'https://docs.oracle.com/en/java/javase/21/troubleshoot/troubleshooting-memory-leaks.html']
---

> [!story] The pod that died at 600 MB
> Ripple's links service ran in a container with a 1 GiB memory limit and `-Xmx1g`. It was killed with exit code 137 every few hours, while heap graphs showed plenty of room. The heap was only part of the process: metaspace, the code cache, 200 thread stacks and Netty's direct buffers added several hundred megabytes outside it, and the kernel's OOM killer counted all of it. Setting `-XX:MaxRAMPercentage=70` left the rest of the limit for the memory outside the heap.

## From source to running code

`javac` compiles `.java` files to **bytecode** in `.class` files: instructions for the JVM, not for a CPU. The JVM then runs it in three stages.

**Class loading** is lazy: a class is loaded the first time it's used, not when the program starts. Loading happens through a hierarchy of class loaders (bootstrap for the core JDK, then platform, then application), and each one asks its parent first (**parent delegation**), so your code can't replace `java.lang.String`. Then the class is **linked** (bytecode verified, static fields given default values) and **initialised**: static initialisers run, once, under a lock the JVM holds. That's why the holder idiom (`private static class Holder { static final Registry I = new Registry(); }`) gives a lazy, thread-safe singleton without any explicit locking.

**Interpretation and JIT compilation**: methods start out interpreted. The JVM counts how often each method and loop runs, and **tiered compilation** compiles the hot ones, first quickly with C1, then, if they stay hot, with the optimising C2 compiler using the profile it gathered. C2 **inlines** small methods, removes bounds checks it can prove are safe, and uses **escape analysis** to keep objects that never leave a method out of the heap entirely. If an assumption later turns out wrong (a second subclass appears at a call site it assumed had one), the code is **deoptimised** back to the interpreter.

That's why a freshly started service has slow first requests (**warm-up**), and why micro-benchmarks written as a timing loop in `main` give nonsense: the loop may be measuring the interpreter, or the JIT may remove the work entirely because the result is unused. Use JMH for benchmarks.

## The JVM's memory areas

| Area | Holds | Sized by | When it runs out |
|---|---|---|---|
| Heap | Every object and array | `-Xmx`, `-XX:MaxRAMPercentage` | `OutOfMemoryError: Java heap space` |
| Metaspace | Class metadata | `-XX:MaxMetaspaceSize` (unlimited by default) | `OutOfMemoryError: Metaspace`, usually classes generated or loaded in a loop |
| Thread stacks | One per thread: frames, locals, partial results | `-Xss` (often 1 MB) | `StackOverflowError` for deep recursion; `unable to create native thread` when there are too many threads |
| Code cache | JIT-compiled machine code | `-XX:ReservedCodeCacheSize` | A warning, then the JIT stops compiling and the service slows |
| Direct (native) memory | NIO and Netty buffers outside the heap | `-XX:MaxDirectMemorySize` | `OutOfMemoryError: Direct buffer memory` |

`OutOfMemoryError: GC overhead limit exceeded` means the JVM was spending nearly all its time collecting and recovering almost nothing: the heap is effectively full.

In a container, the JVM reads the cgroup memory limit and by default sets the maximum heap to **25%** of it, which is often too little. Set `-XX:MaxRAMPercentage` (commonly 60% to 75%) rather than a fixed `-Xmx`, and leave room for everything in the table that isn't the heap, or the kernel's OOM killer will end the process with exit code 137 and no Java stack trace at all.

## How garbage collection works

Java doesn't use reference counting. A collector starts from the **GC roots** (local variables on every thread's stack, static fields, JNI references) and marks every object it can reach. Everything else is garbage. Cycles are no problem: two objects that point at each other but that nothing else reaches are collected together.

Most collectors are **generational**, based on the observation that most objects die young (request objects, temporary strings, iterators):

1. New objects are allocated in **eden**, part of the **young generation**. Allocation is very cheap, a pointer bump in a per-thread buffer.
2. When eden fills, a **minor GC** copies the few live objects into a **survivor** space and frees all of eden at once. The cost depends on what survives, not on how much garbage there was.
3. Each minor GC an object survives increases its **age**. Past a threshold (up to 15), it's **promoted** to the **old generation**.
4. When the old generation fills, a bigger collection runs over it.

A "stop-the-world" pause is a moment when every application thread is halted so the collector can work safely. Modern collectors do most of their work **concurrently** with the application and keep the pauses short.

| Collector | Flag | Good for |
|---|---|---|
| G1 | default since Java 9 | Most services. Splits the heap into regions, collects the regions with the most garbage first, and aims for a pause target (`-XX:MaxGCPauseMillis`, 200 ms by default). |
| ZGC | `-XX:+UseZGC` | Large heaps and latency-sensitive services. Almost all work is concurrent, with pauses well under a millisecond whatever the heap size. Generational since Java 21. Costs some CPU and throughput. |
| Parallel | `-XX:+UseParallelGC` | Batch jobs that care about total throughput and can tolerate longer pauses. |
| Serial | `-XX:+UseSerialGC` | Tiny heaps and single-CPU containers. |

```sim
name: jvmgc
title: A generational heap under load
intro: 'Ripple''s service allocates request objects, most of which die within one request, plus a cache that keeps some of them. Change the heap, the allocation rate and how much survives, and watch the young and old generations.'
challenges:
  - {text: 'Find a setup where minor GCs are frequent but cheap, and the old generation stays flat', metric: healthy, op: '==', value: 1}
  - {text: 'Keep objects alive just long enough to be promoted, so the old generation fills and has to be collected', metric: oldGcs, op: '>', value: 0}
  - {text: 'Turn on the leak and run the heap out of memory', metric: oom, op: '==', value: 1}
  - {text: 'Switch to ZGC and keep the longest pause under 1 ms', metric: maxPause, op: '<', value: 1, and: [{metric: collector, op: '==', value: 'zgc'}]}
takeaway: |
  A minor GC costs time in proportion to what survives, not to how much was allocated, so lots of short-lived garbage is cheap. Trouble starts when objects live just long enough to be promoted, and when something keeps references it no longer needs: the old generation then grows after every collection until the JVM spends its time collecting and still runs out.
```

## Memory leaks in Java

A Java memory leak is an object that's still **reachable** but will never be used again. The collector can't free it, because something still refers to it. Common causes:

- **Static or long-lived collections that only grow**: a `static Map` used as a cache with no eviction or size limit.
- **Listeners and callbacks** registered and never removed, including inner classes that hold their outer instance.
- **`ThreadLocal` in a thread pool**: pool threads live for ever, so a value set and never `remove()`d stays with the thread.
- **Unclosed resources**: connections, streams and native buffers.
- **Class loader leaks** in application servers that redeploy, which show up as growing metaspace.

The sign of a leak is a heap whose level **after each full collection** keeps rising. To find it: watch GC logs (`-Xlog:gc*`) or `jstat -gcutil <pid>`, take a heap dump (`jcmd <pid> GC.heap_dump` or `-XX:+HeapDumpOnOutOfMemoryError`), and open it in Eclipse MAT or VisualVM to see which objects dominate and which path from a GC root keeps them alive. Java Flight Recorder (`jcmd <pid> JFR.start`) records allocation and GC behaviour with low overhead in production.

A `WeakReference` doesn't keep its object alive, so a `WeakHashMap` drops entries whose keys are no longer used elsewhere. A `SoftReference` is cleared only under memory pressure. Both are rarely the right fix for a cache: use a bounded cache such as Caffeine, with a size limit and expiry.

```incident
title: Heap keeps growing
start: s0
nodes:
  s0:
    text: 'Ripple''s links service has slowed down over three days. GC logs show the old generation 40% full after a full GC on Monday, 65% on Tuesday and 85% today, with full GCs now every few minutes. What do you do first?'
    options:
      - {text: 'Take a heap dump and look at what dominates the old generation', next: s1}
      - {text: 'Double -Xmx and restart', next: bad1}
      - {text: 'Switch from G1 to ZGC', next: bad2}
  bad1:
    text: 'The service recovers, and in six days it''s back where it started. A bigger heap only delays a leak, and full GCs on a bigger heap take longer.'
    verdict: 'Not quite. A rising floor after full GCs means something is holding references. Find it before you resize.'
  bad2:
    text: 'Pauses get shorter, but the heap still fills and the service hits OutOfMemoryError on Thursday.'
    verdict: 'Not quite. A different collector can''t free objects that are still reachable.'
  s1:
    text: 'In Eclipse MAT, 70% of the retained heap is one `ConcurrentHashMap` held by a static field `PreviewCache.ENTRIES`, with 9 million entries. Nothing ever removes them. What do you change?'
    options:
      - {text: 'Replace it with a bounded cache (Caffeine) with a maximum size and an expiry', next: good}
      - {text: 'Call System.gc() every hour', next: bad3}
      - {text: 'Make the map a WeakHashMap', next: bad4}
  bad3:
    text: 'The full GCs run on schedule and free nothing, because every entry is still reachable from the static field.'
    verdict: 'Not quite. Garbage collection only frees unreachable objects.'
  bad4:
    text: 'The keys are short strings built per request, so entries vanish almost immediately and the hit rate drops to zero. Also, WeakHashMap isn''t thread-safe.'
    verdict: 'Not quite. Weak keys tie an entry''s life to the key object, not to whether the cache is useful.'
  good:
    text: 'With a 100,000-entry limit and a 10-minute expiry, the old generation settles at 30% after each full GC and stays there.'
    verdict: 'Correct. The leak was a reachable collection with no bound, and the fix was to give it one.'
```

```recall
prompt: An interviewer asks, "How does garbage collection work in the JVM, and why is it generational?" Answer as you would out loud.
points:
  - Objects are live if they're reachable from GC roots (thread stacks, static fields); everything else is collected, including cycles
  - Most objects die young, so new objects go in a young generation that's collected often and cheaply
  - A minor GC copies the few survivors to a survivor space, ages them, and promotes long-lived ones to the old generation; its cost depends on survivors, not garbage
  - Names the trade-off between collectors, for example G1's pause target versus ZGC's concurrent, sub-millisecond pauses
model: |
  The JVM doesn't count references. It starts from the GC roots, which are things like local variables on each thread's stack and static fields, marks everything reachable, and frees the rest, so cycles aren't a problem. It's generational because most objects die very young, like the temporary objects of one request. New objects go into eden, and when eden fills, a minor GC copies the few that are still alive into a survivor space and wipes eden in one go, so the cost is proportional to what survives, not to the garbage. Objects that survive enough minor GCs are promoted to the old generation, which is collected less often. G1, the default, splits the heap into regions and collects the ones with the most garbage first to meet a pause target. ZGC does almost all its work concurrently, so pauses stay under a millisecond even on huge heaps, at some cost in CPU.
```

```questions
- kind: check
  prompt: A service in a container with a 2 GiB memory limit and no heap flags. Roughly what maximum heap does a modern JVM choose?
  choices:
    - text: About 512 MiB, 25% of the container limit
      correct: true
    - text: About 2 GiB, the whole container limit
      why: The default is a quarter of the available memory, to leave room for everything else.
    - text: A quarter of the host machine's memory
      why: Container-aware JVMs (Java 10 and later) read the cgroup limit.
    - text: It grows without limit until the container is killed
      why: The heap always has a maximum.
  explanation: The default MaxRAMPercentage is 25. Most services set it to 60 to 75 and leave the rest for metaspace, stacks and native memory.
- kind: check
  prompt: Which of these are typical causes of a Java memory leak?
  type: multi
  choices:
    - text: A static HashMap used as a cache with no eviction
      correct: true
    - text: A ThreadLocal set in a pooled thread and never removed
      correct: true
    - text: Two objects that refer only to each other and nothing else refers to
      why: Tracing collectors free unreachable cycles.
    - text: Allocating millions of short-lived objects per second
      why: That's what the young generation is for; it costs CPU, but nothing leaks.
  explanation: A leak in Java is an object that's still reachable but no longer needed.
- kind: check
  prompt: Why does a minor GC stay fast even when eden was full of garbage?
  choices:
    - text: It copies only the live objects and frees eden in one go
      correct: true
    - text: It runs entirely on a background thread with no pause
      why: Young collections in G1 and Parallel do pause, briefly.
    - text: It skips any objects allocated in the last few milliseconds
      why: Every object in eden is considered.
    - text: It frees each dead object individually, which is cheap
      why: Dead objects are never visited at all; that's why it's fast.
  explanation: A copying collector's cost is proportional to the survivors. Garbage costs nothing to leave behind.
- kind: check
  prompt: A fresh deploy has slow requests for its first minute, then speeds up. What's the usual cause?
  choices:
    - text: Code is interpreted until the JIT compiles the hot methods
      correct: true
    - text: The garbage collector is resizing the heap
      why: Heap resizing is rarely the cause of a minute of slowness.
    - text: Classes are being verified for every request
      why: Each class is loaded and verified once.
    - text: The thread pool starts with one thread and grows slowly
      why: Pool start-up takes milliseconds, not a minute.
  explanation: Tiered compilation needs the code to run many times before C2 optimises it. Warm-up traffic or a class-data cache helps.
- kind: fire
  prompt: '`OutOfMemoryError: Metaspace`. What usually causes it?'
  choices:
    - text: Classes loaded over and over, by proxies or redeploys
      correct: true
    - text: Too many live objects on the heap at once
      why: That's "Java heap space".
    - text: Recursion that goes too deep for the thread stack
      why: That's StackOverflowError.
  explanation: Metaspace holds class metadata, so it grows with the number of loaded classes.
- kind: fire
  prompt: Which collector should a latency-sensitive service with a 64 GB heap consider first?
  choices:
    - text: ZGC
      correct: true
    - text: Serial
      why: Single-threaded and stop-the-world; long pauses on a big heap.
    - text: Parallel
      why: Built for throughput, with long pauses.
  explanation: ZGC's pauses stay well under a millisecond regardless of heap size.
- kind: fire
  prompt: What marks a Java memory leak in GC logs?
  choices:
    - text: Heap use after each full GC keeps rising
      correct: true
    - text: Frequent minor GCs, several every second
      why: That's normal under a high allocation rate.
    - text: A high peak heap level just before each GC
      why: Peaks are normal; the level after collection matters.
  explanation: If the floor keeps rising, something is keeping objects reachable.
- kind: fire
  prompt: Why does the holder idiom give a lazy, thread-safe singleton without explicit locks?
  choices:
    - text: The JVM initialises a class once, under a lock, on first use
      correct: true
    - text: Static fields are always treated as volatile by the JVM
      why: They aren't; class initialisation provides the guarantee.
    - text: Nested classes are loaded as soon as the outer class loads
      why: They're loaded lazily, on first use, which is what makes it lazy.
  explanation: Class initialisation is lazy and the JVM makes it thread-safe.
```
