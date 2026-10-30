---
id: python-runtime
category: languages
skill: languages
title: How Python runs - the GIL, asyncio and memory
minutes: 15
summary: CPython runs one thread's bytecode at a time under the GIL, so threads help I/O-bound work and processes help CPU-bound work. Free-threaded builds (3.13+) are changing that, but slowly. asyncio is cooperative concurrency on one thread, where one blocking call stalls everything. Memory is reference-counted with a cycle collector. Interviewers probe when to use threads vs processes vs async, the event loop's failure modes, and classic language traps.
objectives:
  - Choose threads, processes or asyncio for a given workload and say why
  - Explain how one blocking call freezes an asyncio service, and how to offload it
  - Explain reference counting, the cycle collector, and what leaks anyway
  - Spot common traps such as mutable defaults, late-binding closures and is vs ==
sources:
  - ['Python docs: asyncio', 'https://docs.python.org/3/library/asyncio.html']
  - ['PEP 703: Making the GIL optional', 'https://peps.python.org/pep-0703/']
  - ['Python docs: gc module', 'https://docs.python.org/3/library/gc.html']
---

## The GIL

CPython's **Global Interpreter Lock** lets only one thread execute Python bytecode at a time. A thread releases it when it blocks on I/O, sleeps, or calls C code that releases it (NumPy, hashlib, compression), and the interpreter also switches threads every few milliseconds.

So:

- **I/O-bound** (HTTP calls, database queries): threads work well, because waiting releases the GIL.
- **CPU-bound pure Python** (parsing, number crunching in loops): threads give no speed-up. Use `multiprocessing` / `ProcessPoolExecutor` (separate interpreters, pickled arguments) or push the hot loop into C or NumPy.
- **Free-threaded CPython** (3.13+, a separate `python3.13t` build) removes the GIL, at some single-thread cost. Treat it as emerging, not the default.

The GIL doesn't make your code thread-safe. `x += 1` on a shared int is several bytecodes, and a thread switch can land between them.

```sort
prompt: Which tool fits each workload best?
buckets: [Threads or asyncio, Processes]
items:
  - {text: 'Calling 200 slow third-party APIs and merging the results', bucket: 0, why: 'Almost all the time is spent waiting on the network, which releases the GIL.'}
  - {text: 'Resizing 10,000 images with a pure-Python library', bucket: 1, why: 'CPU-bound Python holds the GIL; separate processes use every core.'}
  - {text: 'Serving 5,000 idle websocket connections', bucket: 0, why: 'asyncio handles many idle connections cheaply on one thread.'}
  - {text: 'Computing a big pandas groupby', bucket: 0, why: 'Trick: the heavy work runs in C, so a thread is fine. Measure before you add processes, which pay to pickle the data.'}
  - {text: 'Running a Monte Carlo simulation in plain Python loops', bucket: 1, why: 'Pure-Python CPU work wants processes, or vectorising with NumPy.'}
```

## asyncio

`asyncio` runs coroutines on a single-threaded **event loop**. A coroutine runs until it reaches an `await` that would block, then the loop runs something else. That makes it cheap (thousands of concurrent connections, no thread stacks), but the model is cooperative: **any code that blocks without awaiting freezes every request on that loop.**

Common blockers are `requests.get`, `time.sleep`, a synchronous database driver, heavy JSON parsing, and CPU loops. Fixes: use async libraries (`httpx.AsyncClient`, `asyncpg`), or offload the call with `await asyncio.to_thread(fn)` (or `loop.run_in_executor` with a process pool for CPU work).

Other things to know:

- `asyncio.gather` runs awaitables concurrently. Without `return_exceptions=True`, the first failure propagates, but the other tasks keep running.
- `asyncio.TaskGroup` (3.11+) gives structured concurrency: if one task fails, the others are cancelled.
- Keep a reference to tasks from `create_task`. The loop only holds a weak reference, so an unreferenced task can be garbage-collected mid-flight.
- Limit concurrency with an `asyncio.Semaphore`. Unbounded `gather` over 10,000 URLs opens 10,000 sockets.

```bug
title: An async endpoint
prompt: Under load, every request to this FastAPI service gets slow at once, not just this endpoint. Which lines cause it?
lang: python
code: |
  @app.get("/report/{user_id}")
  async def report(user_id: int):
      user = await db.fetch_user(user_id)
      prices = requests.get(PRICING_URL, timeout=5).json()
      rows = await db.fetch_orders(user_id)
      summary = build_summary(rows, prices)   # ~300 ms of pure-Python CPU
      return summary
bug: [4, 6]
explain: |
  **Line 4**: `requests.get` is synchronous, so it blocks the event loop for the whole HTTP call, and no other request makes progress. Use `httpx.AsyncClient` and `await` it. **Line 6**: 300 ms of CPU work on the loop thread blocks it too. Offload it with `await asyncio.to_thread(build_summary, rows, prices)` (or a process pool if it's heavy and pure Python). Alternatively, declare the endpoint with plain `def`, and FastAPI runs it in a thread pool, which suits blocking code.
```

## Memory

CPython frees most objects as soon as their **reference count** reaches zero, which is predictable and immediate. Reference cycles (a parent pointing to a child that points back) never reach zero, so a generational **cycle collector** finds them periodically.

Things that still leak in long-running services: ever-growing module-level caches or dicts, `functools.lru_cache` on methods (it holds `self`), closures capturing large objects, and listeners registered and never removed. Use `tracemalloc` to find where the memory was allocated.

## Language traps interviewers like

- **Mutable default arguments** are created once at definition time: `def f(x, acc=[])` shares one list across calls. Use `acc=None`.
- **Late-binding closures**: `[lambda: i for i in range(3)]` all return 2, because each lambda looks `i` up when it's called. Bind it with `lambda i=i: i`.
- **`is` vs `==`**: `is` compares identity. Small ints and some strings are cached, so `is` can look right in tests and fail in production.
- **Shallow copies**: `list(a)` or `a.copy()` copies the outer list only, so nested lists are still shared.

```questions
- kind: check
  prompt: A pure-Python CPU-bound function runs 4x slower than you need. Which change can use all 8 cores in standard CPython?
  choices:
    - text: Run it in a ProcessPoolExecutor
      correct: true
    - text: Run it in a ThreadPoolExecutor with 8 threads
      why: The GIL lets only one thread run Python bytecode at a time.
    - text: Make it an async function
      why: asyncio is single-threaded and doesn't speed up CPU work.
    - text: Call gc.disable()
      why: That may help a little, but it won't use more cores.
  explanation: Separate processes each have their own interpreter and GIL.
- kind: check
  prompt: What happens if an asyncio handler calls time.sleep(2)?
  choices:
    - text: The whole event loop stalls for 2 seconds, so every other request waits too
      correct: true
    - text: Only that request waits; the others continue
      why: That's what await asyncio.sleep(2) would do.
    - text: Python raises a RuntimeError
      why: Nothing stops you calling blocking functions.
  explanation: Blocking calls never yield to the loop. Use await asyncio.sleep, or move blocking work to a thread.
- kind: check
  prompt: What does `def add(item, bucket=[]): bucket.append(item); return bucket` return on the second call `add(2)`, after a first `add(1)`?
  choices:
    - text: '[1, 2]'
      correct: true
    - text: '[2]'
      why: The default list is created once, at definition time, and reused.
    - text: An error
      why: It's legal and runs.
  explanation: Use a None default and create the list inside the function.
- kind: fire
  prompt: Which Python 3.11+ construct cancels sibling tasks when one fails?
  choices:
    - text: asyncio.TaskGroup
      correct: true
    - text: asyncio.gather with default arguments
      why: gather propagates the first error but leaves the other tasks running.
    - text: asyncio.wait with FIRST_COMPLETED
      why: That returns early but doesn't cancel the rest for you.
  explanation: TaskGroup provides structured concurrency.
- kind: fire
  prompt: What does CPython use to reclaim reference cycles?
  choices:
    - text: A generational cycle-detecting garbage collector
      correct: true
    - text: Reference counting alone
      why: Cycles never reach a count of zero.
    - text: A copying mark-compact collector like the JVM's
      why: CPython doesn't move objects.
  explanation: Reference counting frees most objects at once, and the gc module collects cycles.
- kind: fire
  prompt: You fire `asyncio.create_task(send_email())` and never store the result. What's the risk?
  choices:
    - text: The task can be garbage-collected before it finishes, because the loop keeps only a weak reference
      correct: true
    - text: The task runs twice
      why: It runs at most once.
    - text: The call blocks until the email is sent
      why: create_task schedules and returns immediately.
  explanation: Keep a strong reference (for example a set of background tasks) until the task is done.
- kind: fire
  prompt: Which tool shows where a long-running Python service allocated the memory that keeps growing?
  choices:
    - text: tracemalloc
      correct: true
    - text: cProfile
      why: cProfile measures time, not memory.
    - text: dis
      why: dis disassembles bytecode.
  explanation: Compare tracemalloc snapshots over time to find the growing allocation sites.
```
