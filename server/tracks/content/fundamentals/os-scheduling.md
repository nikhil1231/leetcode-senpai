---
id: os-scheduling
category: systems
skill: systems
title: 'Processes, threads and CPU scheduling'
minutes: 15
summary: The kernel shares CPUs between runnable threads by switching between them, and each switch costs time and cache warmth. Scheduling policies trade throughput, waiting time and response time against each other. FCFS suffers the convoy effect, shortest-job-first minimises waiting but needs foresight and starves long jobs, round robin gives fair response at the price of switches, and a multi-level feedback queue approximates SJF without knowing job lengths. Linux uses a fair scheduler (CFS, replaced by EEVDF in 6.6). Priority inversion, starvation and affinity are the follow-up questions.
objectives:
  - Distinguish processes from threads, and name the states a thread moves through
  - Explain what a context switch costs, directly and through caches
  - Compare FCFS, SJF, SRTF, round robin and MLFQ on waiting and response time
  - Describe how Linux's fair scheduler and nice values work
  - Explain starvation, aging and priority inversion, and how priority inheritance fixes it
sources:
  - ['Arpaci-Dusseau, Operating Systems: Three Easy Pieces, chapters 7 to 9 (scheduling)', 'https://pages.cs.wisc.edu/~remzi/OSTEP/']
  - ['Linux kernel docs: CFS scheduler', 'https://docs.kernel.org/scheduler/sched-design-CFS.html']
  - ['Linux kernel docs: EEVDF scheduler', 'https://docs.kernel.org/scheduler/sched-eevdf.html']
  - ['Glenn Reeves, What really happened on Mars? (Pathfinder priority inversion)', 'https://www.cs.cornell.edu/courses/cs614/1999sp/papers/pathfinder.html']
---

## Processes and threads

A **process** is a running program with its own address space, open files and credentials. A **thread** is a sequence of execution inside a process: its own registers, program counter and stack, sharing the address space with its siblings. Threads are cheap to create and communicate through shared memory (with all the synchronisation that implies, see [locks and deadlock](#/fundamentals/lesson/os-concurrency)); processes are isolated, so a crash or memory corruption stays contained. Linux schedules threads (it calls both "tasks").

A thread moves between a few states:

- **Running** on a CPU.
- **Ready** (runnable): could run, waiting for a CPU. The run queue.
- **Blocked** (sleeping): waiting for I/O, a lock, a timer or a signal. It won't run until the event arrives.
- **New** and **terminated** at either end (a terminated process stays a zombie until reaped, see [Linux processes](#/fundamentals/lesson/linux-processes)).

```sort
prompt: Which state is the thread in?
buckets: [Running, Ready, Blocked]
items:
  - {text: 'Waiting for read() on a socket with no data yet', bucket: 2, why: 'It is waiting for an event, not for a CPU.'}
  - {text: 'Its time slice ran out and another thread took the CPU', bucket: 1, why: 'It could run, but the CPU is busy.'}
  - {text: 'Executing a tight loop computing a hash', bucket: 0, why: 'On a CPU now.'}
  - {text: 'Waiting to acquire a mutex held by another thread', bucket: 2, why: 'Blocked on a lock (unless it spins).'}
  - {text: 'Just woken because its disk read completed', bucket: 1, why: 'Runnable again; it still has to be picked.'}
  - {text: 'Inside sleep(1)', bucket: 2, why: 'Waiting on a timer.'}
```

## Context switches

Switching from one thread to another saves the registers and kernel state of one and restores the other. Between processes it also switches the address space, which can flush the TLB (see [virtual memory](#/fundamentals/lesson/os-memory)). The direct cost is a few microseconds; the bigger cost is indirect: the new thread finds the CPU caches full of someone else's data.

Switches happen **voluntarily** (the thread blocks on I/O or a lock) or **involuntarily** (the scheduler preempts it because its slice is up or a higher-priority thread woke). On Linux, `pidstat -w` shows both per process; thousands of involuntary switches per second on a busy service usually mean more runnable threads than cores.

**Preemptive** schedulers (every modern OS) can take the CPU away using a timer interrupt. **Cooperative** scheduling only switches when the running task yields, which is how event loops and many green-thread runtimes work: one task that never yields freezes everything.

## Scheduling policies

What you optimise for:

- **Turnaround time**: arrival to completion. Batch work.
- **Waiting time**: time spent ready but not running.
- **Response time**: arrival to *first* run. What makes an interactive system feel fast.
- **Throughput and fairness**, and not wasting the CPU on switching.

The classic policies:

- **FCFS** (first come, first served): simple, no preemption. One long job ahead of short ones makes them all wait: the **convoy effect**.
- **SJF** (shortest job first): run the shortest waiting job. Provably minimises average waiting time among non-preemptive policies, but you rarely know job lengths, and long jobs can **starve**.
- **SRTF** (shortest remaining time first): preemptive SJF. Lowest average waiting time of all, same caveats.
- **Round robin**: each thread gets a **quantum** in turn. Good response time. Too small a quantum and switching overhead dominates; too large and it degenerates into FCFS.
- **MLFQ** (multi-level feedback queue): several priority levels. New jobs start at the top with a short quantum; a job that uses its whole quantum drops a level; a periodic **boost** lifts everything back to stop starvation. Short and interactive jobs stay at the top, so it behaves like SJF without knowing lengths.

```sim
name: cpusched
title: A CPU scheduler
intro: 'Choose a workload and a policy. Each bar is one job; green is running, red is ready but waiting. Add a context-switch cost to see what preemption costs.'
challenges:
  - {text: 'See the convoy effect: average wait above 15 ms under FCFS', metric: avgWait, op: '>', value: 15, and: [{metric: algo, op: '==', value: 'fcfs'}]}
  - {text: 'Get the average wait under 4 ms on the convoy workload', metric: avgWait, op: '<', value: 4, and: [{metric: load, op: '==', value: 'convoy'}]}
  - {text: 'Make round robin spend over 20% of the CPU on context switches', metric: overhead, op: '>', value: 0.2, and: [{metric: algo, op: '==', value: 'rr'}]}
takeaway: |
  No policy wins everything. SRTF minimises waiting but needs to know the future; round robin gives good response time at the cost of switches; MLFQ learns which jobs are short by watching them. Real schedulers blend fairness, priorities and cache affinity.
```

```calc
title: Waiting time under FCFS
prompt: Three jobs arrive at time 0 in the order A (24 ms), B (3 ms), C (3 ms). Under FCFS, what is the average waiting time in ms?
answer: 17
unit: ms
tolerance: 1.05
steps: |
  A waits 0, B waits 24 (behind A), C waits 27 (behind A and B). (0 + 24 + 27) / 3 = **17 ms**.

  Run them shortest first (B, C, A) and the waits are 0, 3 and 6: an average of 3 ms. Same work, same CPU, nearly six times less waiting. That gap is the convoy effect.
```

## How Linux does it

Since 2007 Linux's normal scheduler was **CFS** (the Completely Fair Scheduler). Each runnable task accumulates **virtual runtime**, weighted by its priority; the scheduler always runs the task with the least, kept in a red-black tree. A task that sleeps a lot (interactive) has little vruntime and runs promptly when it wakes. Linux 6.6 (2023) replaced CFS with **EEVDF** (earliest eligible virtual deadline first), which keeps the fairness and gives latency-sensitive tasks better guarantees.

- **nice** values, from −20 (favoured) to 19, scale a task's weight: each step is roughly 10% more or less CPU relative to others under contention. They don't matter when there's spare CPU.
- **Real-time classes** (`SCHED_FIFO`, `SCHED_RR`) always run before normal tasks. A runaway real-time task can starve the whole box.
- **Multi-core**: each CPU has its own run queue, and the kernel balances load between them while trying to keep a task on the CPU whose caches it warmed (**affinity**). `taskset` and cgroup `cpuset` pin tasks; cgroup CPU **quotas** (Kubernetes CPU limits) throttle a container once it spends its quota in each 100 ms period, which shows up as latency spikes even on an idle node.

## Starvation and priority inversion

**Starvation**: a runnable task never gets the CPU because others always outrank it. The fix is **aging**: raise a task's priority the longer it waits (MLFQ's boost is a form of this).

**Priority inversion**: a low-priority task holds a lock that a high-priority task needs, and a medium-priority task, which needs neither, keeps preempting the low one. The high-priority task waits on the medium one indefinitely. In 1997 this reset the Mars Pathfinder lander repeatedly, until engineers enabled **priority inheritance** remotely: while a task holds a lock that a higher-priority task wants, it temporarily runs at that higher priority, finishes, and releases the lock.

```timeline
title: Priority inversion on one CPU
lanes: [Low, Medium, High, Lock]
state: {Lock: free, Running: Low}
steps:
  - {lane: Low, to: Lock, text: 'Low acquires the bus lock', set: {Lock: 'held by Low'}}
  - {lane: High, to: Lock, text: 'High wakes and tries the lock: blocked', set: {Running: Low}}
  - {lane: Medium, to: Medium, text: 'Medium wakes; it outranks Low, so it preempts Low', set: {Running: Medium}}
  - {lane: Medium, to: Medium, text: 'Medium runs for a long time. Low can''t run, so it can''t release the lock'}
  - {lane: High, to: High, text: 'A watchdog sees High missed its deadline and resets the system'}
find:
  prompt: At which step does the inversion begin, where a lower-priority task effectively blocks High?
  answer: 2
  explain: Once Medium preempts Low, High is waiting on Medium, a task it outranks and doesn't depend on. With priority inheritance, Low would have run at High's priority from step 1, so Medium couldn't preempt it.
```

```questions
- kind: check
  prompt: Which scheduling policy minimises average waiting time when job lengths are known and preemption is allowed?
  choices:
    - text: Shortest remaining time first
      correct: true
    - text: Round robin with a small quantum
      why: Good response time, but more waiting overall for equal jobs.
    - text: First come, first served
      why: Suffers the convoy effect.
    - text: Multi-level feedback queue
      why: It approximates SJF without knowing lengths.
  explanation: Always running the job closest to finishing minimises the sum of waits, at the risk of starving long jobs.
- kind: check
  prompt: A service's Kubernetes pod has a CPU limit of 1 core and shows p99 latency spikes, while the node's CPUs are mostly idle. A likely cause?
  choices:
    - text: CFS throttling: the pod uses its CPU quota early in each 100 ms period, then is paused
      correct: true
    - text: The node's scheduler is starving the pod in favour of other pods with higher CPU requests
      why: The node is idle; nothing else is competing.
    - text: Too few context switches
      why: That isn't a cause of latency spikes.
    - text: Priority inversion in the kernel
      why: Possible but unlikely; throttling is the common culprit.
  explanation: Check container_cpu_cfs_throttled_periods_total; raise or remove the limit, or reduce bursts.
- kind: check
  prompt: In MLFQ, what happens to a job that uses its entire quantum?
  choices:
    - text: It moves down to a lower-priority queue
      correct: true
    - text: It moves up, because it is making progress
      why: Using the whole slice suggests a long, CPU-bound job.
    - text: It is killed
      why: It just loses priority.
    - text: Nothing; it stays where it is
      why: Demotion is how MLFQ learns.
  explanation: Jobs that block early (interactive ones) keep high priority; a periodic boost prevents starvation.
- kind: check
  prompt: How does priority inheritance fix priority inversion?
  choices:
    - text: The lock holder temporarily runs at the waiting task's high priority until it unlocks
      correct: true
    - text: The high-priority task forcibly takes the lock from the low-priority holder and continues
      why: That would break the critical section.
    - text: Medium-priority tasks are suspended whenever any lock is held
      why: Too blunt; it only boosts the lock holder.
  explanation: The lock holder can't be preempted by medium-priority work, so it finishes and releases quickly.
- kind: fire
  prompt: What is the convoy effect?
  choices:
    - text: Short jobs waiting behind one long job under FCFS
      correct: true
    - text: Threads migrating between CPUs together in a group
      why: Not a scheduling term for that.
    - text: Too many context switches under round robin
      why: That's switching overhead.
  explanation: SJF or preemption fixes it.
- kind: fire
  prompt: Which state is a thread in while waiting for disk I/O?
  choices:
    - text: Blocked
      correct: true
    - text: Ready
      why: Ready means it could run now.
    - text: Running
      why: It isn't on a CPU.
  explanation: It becomes ready when the I/O completes.
- kind: fire
  prompt: What does a nice value of 19 mean?
  choices:
    - text: The lowest normal priority; it gets the least CPU under contention
      correct: true
    - text: The highest priority; it preempts every other normal task on the CPU
      why: That's −20.
    - text: It runs in the real-time class, ahead of all normal tasks
      why: Real-time is a separate class.
  explanation: Each nice step is roughly a 10% change in relative CPU share.
- kind: fire
  prompt: What replaced CFS as Linux's default scheduler in kernel 6.6?
  choices:
    - text: EEVDF
      correct: true
    - text: The O(1) scheduler
      why: That came before CFS.
    - text: SCHED_FIFO
      why: A real-time policy, not the default.
  explanation: Earliest eligible virtual deadline first.
- kind: fire
  prompt: What's the main indirect cost of a context switch?
  choices:
    - text: Cold CPU caches and TLB for the incoming thread
      correct: true
    - text: Writing the outgoing thread's whole memory out to disk
      why: That's swapping, not switching.
    - text: Recompiling the program
      why: Nothing is recompiled.
  explanation: Saving registers is cheap; refilling caches is not.
```
