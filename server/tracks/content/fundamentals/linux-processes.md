---
id: linux-processes
category: systems
skill: systems
title: Linux processes, memory and files
minutes: 15
summary: Production debugging questions come down to a few Linux ideas. Processes and their lifecycle (fork, exec, signals, zombies), virtual memory (RSS vs virtual size, page cache, swap, the OOM killer and cgroup limits), file descriptors and their limits, and how to read load, CPU and I/O. Knowing which tool answers which question is what interviewers look for.
objectives:
  - Explain fork/exec, signals (SIGTERM vs SIGKILL), zombies and PID 1 in containers
  - Read memory numbers correctly, including page cache, RSS and the OOM killer
  - Diagnose "too many open files" and descriptor leaks
  - Pick the right tool for CPU, memory, disk, network and syscall questions
sources:
  - ['Brendan Gregg: Linux Performance Analysis in 60 seconds', 'https://www.brendangregg.com/Articles/Netflix_Linux_Perf_Analysis_60s.pdf']
  - ['man7: signal(7)', 'https://man7.org/linux/man-pages/man7/signal.7.html']
  - ['Kernel docs: cgroup v2 memory', 'https://docs.kernel.org/admin-guide/cgroup-v2.html']
---

## Processes and signals

A process is created by `fork()` (a copy of the parent, with copy-on-write memory) and usually becomes a different program with `exec()`. When a child exits, it stays a **zombie** (an exit status and nothing else) until its parent `wait()`s for it. If the parent dies first, the orphan is re-parented to PID 1, which is expected to reap it.

Signals are how the system asks a process to do something:

- **SIGTERM** (15): "please shut down." Catchable, so a process can drain requests, flush and exit cleanly. Kubernetes and `docker stop` send it first.
- **SIGKILL** (9): immediate, uncatchable. Sent after the grace period, and by the OOM killer.
- **SIGINT** (Ctrl-C), **SIGHUP** (often means "reload config"), **SIGCHLD** (a child changed state).

**PID 1 in a container is special.** The kernel doesn't apply default signal actions to PID 1, so an app that doesn't install a SIGTERM handler simply ignores it and gets SIGKILLed after the grace period. And a shell running as PID 1 (`CMD npm start` through `sh -c`) may not forward signals to the app. Use exec-form `CMD ["node", "server.js"]`, or a tiny init such as `tini` (`docker run --init`).

## Memory

Each process sees its own **virtual address space**. The numbers in `top` and `ps` mean different things:

- **VSZ/VIRT**: everything mapped, including untouched reservations. Often huge and usually meaningless.
- **RSS/RES**: pages actually resident in RAM, including shared libraries counted in every process.
- **Page cache**: free RAM the kernel uses to cache file contents. `free -h` shows it under buff/cache, and **available** is the number that matters. "Linux ate my RAM" is the page cache doing its job.

When memory runs out, the **OOM killer** picks a process (by `oom_score`) and SIGKILLs it, which you'll see in `dmesg`. In containers the limit is the **cgroup** memory limit: exceed it and the container is OOM-killed (Kubernetes shows `OOMKilled`, exit code 137 = 128 + 9), even if the node has free memory. JVMs and other runtimes need to be told about the container limit (`-XX:MaxRAMPercentage`). Modern JVMs read the cgroup, but heap plus off-heap plus thread stacks must still fit.

```predict
prompt: A Java pod has a 2 GiB memory limit and `-Xmx2g`. Under load it's restarted repeatedly, with exit code 137 and no Java OutOfMemoryError in the logs. Why?
choices:
  - A bug in the JVM's garbage collector
  - Heap plus metaspace, thread stacks and direct buffers exceeds the 2 GiB cgroup limit, so the kernel kills it
  - The liveness probe is failing
  - Exit code 137 means the application called System.exit(137)
answer: 1
reveal: |
  137 = 128 + 9: the process received SIGKILL. With no Java OOM error, the JVM never ran out of *heap*; the kernel killed the whole process for exceeding the cgroup limit. The heap alone can use the full 2 GiB, and the JVM needs a few hundred MB more outside it. Set the heap to about 70-75% of the limit (`-XX:MaxRAMPercentage=75`) and check `kubectl describe pod` for `OOMKilled`. A failing liveness probe also kills with SIGKILL after SIGTERM, but the pod events would say so.
```

## File descriptors

Everything open (files, sockets, pipes) is a **file descriptor**, and each process has a limit (`ulimit -n`, often 1024 by default; check `/proc/<pid>/limits`). "Too many open files" (EMFILE) usually means a leak: sockets or files opened and never closed, or HTTP clients created per request. Count them with `ls /proc/<pid>/fd | wc -l` or `lsof -p <pid>`. A count that keeps climbing is a leak. A count that's high but stable means you need a higher limit.

A deleted file that's still open keeps its disk space, so `df` says the disk is full while `du` can't find the space. `lsof | grep deleted` shows the culprit. Restart it, or truncate through `/proc/<pid>/fd/<n>`.

## Reading a slow box

**Load average** counts runnable tasks *plus tasks in uninterruptible sleep* (usually disk I/O), so high load with idle CPUs points at I/O. A first-minute checklist:

| Question | Tool |
|---|---|
| Load and its trend | `uptime` |
| CPU saturation, run queue, swapping | `vmstat 1` |
| Per-CPU imbalance (one hot core) | `mpstat -P ALL 1` |
| Which process | `top` / `pidstat 1` |
| Disk latency and utilisation | `iostat -xz 1` |
| Memory and page cache | `free -h` |
| Network throughput, errors and retransmits | `sar -n DEV,TCP,ETCP 1`, `ss -s` |
| Kernel messages (OOM, disk errors) | `dmesg -T` |
| What syscalls a process is stuck in | `strace -p <pid>` (slows it down) |
| Where CPU time goes in code | `perf top`, flame graphs |

```recall
prompt: A pod shuts down during each deploy and drops in-flight requests. Explain what Kubernetes sends, and what the app and the container image must do to shut down gracefully.
points:
  - Kubernetes sends SIGTERM, waits terminationGracePeriodSeconds (default 30 s), then SIGKILL
  - The app must handle SIGTERM by stopping new work, draining in-flight requests and closing connections before exiting
  - If the app runs as PID 1 or behind a shell, signals may be ignored or not forwarded; use exec-form CMD or an init like tini
  - Endpoint removal is asynchronous, so a short preStop delay or keeping the listener open briefly avoids new requests hitting a closing pod
model: |
  On deletion, the kubelet sends SIGTERM to the container's PID 1, waits the grace period (30 s by default), then SIGKILLs. So the app needs a SIGTERM handler: fail readiness, stop accepting new connections, finish in-flight requests, and close database connections. Two traps. First, if the process is PID 1 without a handler, or is started through `sh -c`, the signal may be ignored or never reach the app, so use exec-form CMD or tini. Second, the pod is removed from Service endpoints at the same time as SIGTERM, not before it, so for a few seconds new traffic can still arrive. A `preStop` sleep of a few seconds, or draining slowly, covers that.
```

```questions
- kind: check
  prompt: What does exit code 137 from a container usually mean?
  choices:
    - text: The process was killed with SIGKILL, often by the OOM killer or after a grace period
      correct: true
    - text: The image failed to pull
      why: Pull failures show as ErrImagePull, before any process runs.
    - text: A segmentation fault
      why: That's SIGSEGV, exit code 139.
    - text: The process exited normally with an error
      why: Codes above 128 mean "killed by signal (code minus 128)".
  explanation: 128 + 9 = 137, and signal 9 is SIGKILL.
- kind: check
  prompt: "`free -h` shows 300 MB free but 6 GB available on an 8 GB box. Is memory a problem?"
  choices:
    - text: Probably not; most of the used memory is reclaimable page cache
      correct: true
    - text: Yes, the box is nearly out of memory
      why: The available column counts reclaimable cache.
    - text: Yes, swap will be used immediately
      why: The kernel drops clean cache before it swaps.
  explanation: Judge memory pressure by available memory, swap activity and OOM events, not by "free".
- kind: check
  prompt: Load average is 16 on an 8-core box, but CPU usage is only 20%. What's the likeliest explanation?
  choices:
    - text: Many tasks are blocked in uninterruptible I/O wait, which counts toward load
      correct: true
    - text: The CPUs are saturated
      why: CPU is 80% idle.
    - text: Load average only counts network connections
      why: It counts runnable tasks plus tasks in uninterruptible sleep.
  explanation: On Linux, load includes D-state tasks, so check iostat for disk latency.
- kind: fire
  prompt: A container ignores SIGTERM and is killed after 30 seconds on every deploy. What's the most likely cause?
  choices:
    - text: The app runs as PID 1 with no SIGTERM handler, or behind a shell that doesn't forward signals
      correct: true
    - text: SIGTERM is blocked by the kernel in containers
      why: It's delivered, but PID 1 gets no default action.
    - text: The grace period is too long
      why: The length doesn't explain the signal being ignored.
  explanation: Use exec-form CMD, handle SIGTERM, or run with an init such as tini.
- kind: fire
  prompt: "`df` says the disk is 100% full but `du` finds only half of it. Likely cause?"
  choices:
    - text: A process is holding a deleted file open
      correct: true
    - text: du is broken on ext4
      why: du only counts files that still have names.
    - text: The filesystem is corrupt
      why: Possible, but the open-deleted file is far more common.
  explanation: Find it with `lsof | grep deleted`, then restart the process or truncate the file.
- kind: fire
  prompt: Which tool shows the system calls a running process is making?
  choices:
    - text: strace -p <pid>
      correct: true
    - text: iostat
      why: iostat reports device statistics.
    - text: vmstat
      why: vmstat summarises the whole system.
  explanation: strace attaches with ptrace, which is useful but slows the process down.
- kind: fire
  prompt: A service fails with "Too many open files" and its descriptor count climbs steadily. Best first fix?
  choices:
    - text: Find and fix the leak, such as connections or files that are never closed
      correct: true
    - text: Raise ulimit -n to a million
      why: That only delays a steady leak.
    - text: Restart the service nightly
      why: That hides the bug.
  explanation: A climbing count is a leak; a high but stable count is a limit problem.
```
