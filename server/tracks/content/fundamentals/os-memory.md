---
id: os-memory
category: systems
skill: systems
title: Virtual memory and paging
minutes: 15
summary: Every process sees its own virtual address space, which the CPU translates to physical memory one page (usually 4 KiB) at a time through page tables, cached in the TLB. Pages are loaded on demand, shared copy-on-write after fork, and evicted under pressure by an approximation of least-recently-used. When the working set no longer fits, the system thrashes. Page faults, TLB reach, huge pages and replacement policies (and Belady's anomaly) are standard interview material, and they explain real symptoms such as fork latency and database buffer behaviour.
objectives:
  - Explain address translation through multi-level page tables and the TLB
  - Tell minor from major page faults, and explain demand paging and copy-on-write
  - Compare FIFO, LRU, Clock and optimal page replacement, including Belady's anomaly
  - Explain working sets and thrashing, and what swap is for
  - Work out TLB reach and why huge pages help large-memory workloads
sources:
  - ['Arpaci-Dusseau, Operating Systems: Three Easy Pieces, chapters 18 to 23 (paging, TLBs, swapping)', 'https://pages.cs.wisc.edu/~remzi/OSTEP/']
  - ['Linux kernel docs: Memory management concepts', 'https://docs.kernel.org/admin-guide/mm/concepts.html']
  - ['L. A. Belady, R. A. Nelson, G. S. Shedler, An anomaly in space-time characteristics of certain programs running in a paging machine (1969)', 'https://dl.acm.org/doi/10.1145/363011.363155']
  - ['Peter J. Denning, The working set model for program behavior (1968)', 'https://dl.acm.org/doi/10.1145/363095.363141']
---

## Why virtual memory

Each process gets its own **virtual address space**: addresses it uses are translated by the CPU's **memory management unit** to physical addresses. That buys:

- **Isolation**: one process can't read or corrupt another's memory; a bad pointer faults instead.
- **Convenience**: every program can be linked as if it owned a large, contiguous address space.
- **Overcommit and sharing**: memory is allocated lazily, files are mapped into memory, libraries and forked pages are shared until written.

Memory is managed in **pages**, usually 4 KiB on x86-64 (16 KiB on Apple Silicon). A virtual address splits into a **page number** and an **offset** within the page; translation only changes the page number.

## Page tables and the TLB

A **page table** maps virtual page numbers to physical frames, with permission bits (read, write, execute, user/kernel) and status bits (present, accessed, dirty). A flat table would be huge: a 48-bit address space has 2^36 pages. So x86-64 uses a **four-level** tree (five-level on the newest CPUs), where unused regions have no entries at all.

Walking four levels on every memory access would be ruinous, so the CPU caches recent translations in the **TLB** (translation lookaside buffer), typically a few dozen to a couple of thousand entries. A TLB hit costs nothing extra; a miss costs a page-table walk, which may itself miss the caches. Switching to another process changes the page tables, so TLB entries are flushed or tagged with an address-space ID.

```calc
title: TLB reach
prompt: A CPU's L2 TLB has 1,536 entries. With 4 KiB pages, how much memory (in MiB) can it map without a miss? (Use 1 MiB = 1,024 KiB.)
answer: 6
unit: MiB
tolerance: 1.05
steps: |
  1,536 entries × 4 KiB = 6,144 KiB = **6 MiB**.

  A database with a 64 GiB buffer pool touching memory at random misses the TLB almost every time. With 2 MiB **huge pages**, the same entries map 1,536 × 2 MiB = 3 GiB, five hundred times more. That's why Postgres, JVMs and other big-heap programs often use huge pages. (Transparent Huge Pages does it automatically, but its background compaction causes latency spikes for some databases, which is why several recommend turning THP off and configuring explicit huge pages instead.)
```

## Page faults

A **page fault** is the CPU telling the kernel "this translation is missing or not allowed". It's normal, not an error:

- **Minor fault**: the page is in memory but not mapped for this process yet: the first touch of freshly allocated memory, a shared library page already in the page cache, or a copy-on-write page. Microseconds.
- **Major fault**: the data must be read from disk (a memory-mapped file not in cache, or a page that was swapped out). Milliseconds on SSD, much longer on spinning disk.
- **Invalid access**: no mapping, or a write to read-only memory, delivered as `SIGSEGV`.

Two mechanisms rely on faults:

- **Demand paging**: `malloc` of 1 GiB just reserves address space; frames are allocated on first touch. That's why virtual size (VSZ) is huge and resident size (RSS) is smaller.
- **Copy-on-write**: after `fork()`, parent and child share every page read-only; the first write to a page faults and copies just that page. It makes `fork` cheap, but a forked child of a process with a large, busy heap (Redis taking a snapshot, for instance) can end up copying a lot of memory, and copying the page tables of a 100 GiB process takes noticeable time.

```predict
prompt: A Redis server using 40 GiB of memory runs BGSAVE, which forks a child to write a snapshot while the parent keeps serving writes. During the snapshot, memory use on the box climbs towards 70 GiB. Why?
choices:
  - text: Copy-on-write: each page the parent writes during the snapshot gets copied
  - text: fork() copies all 40 GiB of the parent's memory into the child immediately
  - text: The child loads the snapshot back into memory to verify it
  - text: A memory leak in the snapshot code
answer: 0
reveal: |
  fork() only copies the page tables; the 40 GiB is shared. But each page the parent then writes is copied first, so the child keeps a consistent snapshot. Under a heavy write load most pages get touched, and memory approaches double. Mitigations: leave headroom, snapshot from a replica, and disable Transparent Huge Pages (Redis's own advice), because with 2 MiB pages a one-byte write copies 2 MiB instead of 4 KiB.
```

## Page replacement

When memory is full and a new page is needed, the kernel must evict one. The ideal (**OPT**, Belady's algorithm) evicts the page whose next use is furthest in the future. It's unbeatable and impossible, since it needs to know the future, so it's the yardstick. Real policies:

- **FIFO**: evict the oldest-loaded page. Simple, ignores use, and suffers **Belady's anomaly**: on some reference strings, *more* frames give *more* faults.
- **LRU**: evict the least recently used page. Good when the recent past predicts the near future. Exact LRU needs work on every access, too expensive in hardware. LRU is a **stack algorithm**, so more memory never hurts it.
- **Clock** (second chance): pages sit in a circle with a reference bit the hardware sets on access. The hand sweeps, clearing set bits and evicting the first page whose bit is already clear. A cheap LRU approximation; Linux uses a refinement with active and inactive lists.

LRU has a weakness worth knowing: a loop over data slightly bigger than memory, or one big sequential scan, evicts exactly the pages needed next. Databases use scan-resistant variants (Postgres's clock-sweep with usage counts, or LRU-K, or a small "probation" queue).

```sim
name: paging
title: Page replacement
intro: 'Feed a reference string to a replacement policy. Each column is one memory reference; each row is a physical frame. F marks a page fault.'
challenges:
  - {text: 'Find Belady''s anomaly: one more frame, more faults', metric: belady, op: '==', value: 1}
  - {text: 'Make LRU fault on every single reference', metric: faults, op: '==', value: 15, and: [{metric: algo, op: '==', value: 'lru'}, {metric: string, op: '==', value: 'loop'}]}
  - {text: 'Find a frame count where LRU matches the optimal policy on the textbook string', metric: gapToOpt, op: '==', value: 0, and: [{metric: algo, op: '==', value: 'lru'}, {metric: string, op: '==', value: 'locality'}, {metric: frames, op: '<=', value: 5}, {metric: frames, op: '>=', value: 3}]}
takeaway: |
  Optimal is the floor no real policy reaches. LRU approximates it when the past predicts the future, Clock approximates LRU cheaply, and FIFO can get worse with more memory. A loop just bigger than memory is LRU's worst case.
```

## Working sets and thrashing

A process's **working set** is the set of pages it uses over a short window. If the working sets of all running processes fit in RAM, faults are rare. If they don't, the system **thrashes**: every process keeps faulting pages back in, which evicts pages another process needs next. The CPU sits idle waiting on disk while the disk is saturated, and throughput collapses. Adding more processes (or threads with big heaps) makes it worse.

**Swap** is disk space for evicted anonymous pages (heap and stack, which have no file to be re-read from). A little swap lets the kernel move genuinely idle pages out of the way. Heavy swapping in steady state is a sign the working set doesn't fit. Many latency-sensitive services run with swap off or `vm.swappiness` low and rely on the OOM killer instead, because a swapping server is slower than a restarted one. Kubernetes historically required swap off on nodes.

```sort
prompt: Minor fault, major fault or segfault?
buckets: [Minor fault, Major fault, SIGSEGV]
items:
  - {text: 'First write to memory just returned by malloc', bucket: 0, why: 'A zeroed frame is mapped in; no disk.'}
  - {text: 'Reading a page of a memory-mapped file that isn''t in the page cache', bucket: 1, why: 'The kernel must read it from disk.'}
  - {text: 'Dereferencing a NULL pointer', bucket: 2, why: 'Page 0 is never mapped.'}
  - {text: 'A child process writes to a page shared copy-on-write with its parent', bucket: 0, why: 'The page is copied in memory.'}
  - {text: 'Touching a heap page that was swapped out an hour ago', bucket: 1, why: 'It comes back from swap.'}
  - {text: 'Writing to a string literal in read-only memory', bucket: 2, why: 'The mapping forbids writes.'}
```

```questions
- kind: check
  prompt: What does the TLB cache?
  choices:
    - text: Recent virtual-to-physical page translations
      correct: true
    - text: Recently used lines of data and instructions from main memory
      why: That's the L1/L2/L3 data cache.
    - text: Recently read disk blocks
      why: That's the page cache.
    - text: Thread scheduling decisions
      why: Unrelated.
  explanation: A TLB miss costs a page-table walk.
- kind: check
  prompt: Why is fork() fast even for a process using many gigabytes of memory?
  choices:
    - text: Memory is shared copy-on-write; a page is only copied when someone writes to it
      correct: true
    - text: The child gets no memory at all until it calls exec() and loads a new program
      why: It gets a full view of the parent's memory, shared.
    - text: The kernel compresses the parent's memory
      why: No compression is involved.
  explanation: Copying page tables for huge processes still takes measurable time, and heavy writes afterwards copy many pages.
- kind: check
  prompt: What is Belady's anomaly?
  choices:
    - text: With FIFO replacement, adding frames can increase the number of page faults
      correct: true
    - text: LRU always performs worse than FIFO when a program loops over a large array
      why: Both do badly on loops just larger than memory, but that isn't the anomaly.
    - text: The optimal policy can't be implemented
      why: True, but that's not the anomaly.
    - text: Huge pages increase TLB misses
      why: They decrease them.
  explanation: Stack algorithms such as LRU and OPT never show it.
- kind: check
  prompt: A box's CPU is mostly idle, the disk is at 100% utilisation, and vmstat shows constant swap-in and swap-out. What's happening?
  choices:
    - text: Thrashing: the working sets don't fit in RAM, so pages are evicted and faulted back in
      correct: true
    - text: A CPU-bound process is starving the others, so the rest pile up waiting in the run queue for a turn
      why: CPU is idle.
    - text: The page cache is too large
      why: The kernel would drop clean cache before swapping heavily.
    - text: Too many context switches
      why: The bottleneck is disk paging.
  explanation: Reduce the memory demand (fewer processes, smaller heaps) or add RAM.
- kind: fire
  prompt: What page size do x86-64 systems use by default?
  choices:
    - text: 4 KiB
      correct: true
    - text: 64 KiB
      why: Some ARM configurations use it, not x86-64 by default.
    - text: 1 MiB
      why: Huge pages are 2 MiB or 1 GiB.
  explanation: Huge pages are 2 MiB or 1 GiB.
- kind: fire
  prompt: Which kind of page fault needs a disk read?
  choices:
    - text: Major fault
      correct: true
    - text: Minor fault
      why: Minor faults are satisfied from memory.
    - text: Copy-on-write fault
      why: That copies a page in memory.
  explanation: Major faults read from a file or swap.
- kind: fire
  prompt: Which replacement policy is optimal but impossible to implement?
  choices:
    - text: Evict the page used furthest in the future (Belady's OPT)
      correct: true
    - text: 'LRU: evict the page that was used least recently'
      why: Implementable, approximately.
    - text: 'Clock: evict the first page found whose reference bit is clear'
      why: Clock is what kernels actually do.
  explanation: It's the yardstick for real policies.
- kind: fire
  prompt: How does Clock (second chance) decide what to evict?
  choices:
    - text: Sweep a circle of pages, clearing set reference bits, and evict the first unset one
      correct: true
    - text: Evict whichever page was loaded into memory longest ago, regardless of use
      why: That's FIFO.
    - text: Evict a random page, which is cheap and surprisingly close to LRU
      why: Clock uses the reference bit.
  explanation: A cheap approximation of LRU.
- kind: fire
  prompt: Why do huge pages help a database with a large buffer pool?
  choices:
    - text: Each TLB entry maps far more memory, so TLB misses drop
      correct: true
    - text: They make reads from disk faster because each I/O transfers 2 MiB
      why: They affect address translation, not I/O.
    - text: They prevent page faults entirely
      why: Faults still happen, just on bigger pages.
  explanation: TLB reach grows by 512× with 2 MiB pages.
```
