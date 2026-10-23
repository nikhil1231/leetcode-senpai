---
id: observability
category: reliability
skill: operations
title: Metrics, logs, traces and actionable alerts
minutes: 16
summary: You can't fix what you can't see, and you can't see a distributed system by reading one server's logs. Metrics tell you that something is wrong and how widespread it is, traces show where a request spent its time, and logs and events explain what happened. Alert on user-visible symptoms against SLOs, keep metric cardinality bounded, and correlate everything with request IDs.
objectives:
  - Choose between metrics, logs, traces and wide events for a question, and instrument the golden signals
  - Correlate a request across services with trace context and structured logs, and choose a sampling strategy
  - Control metric cardinality and telemetry cost
  - Write alerts that page on symptoms, carry context and lead to action, and debug an incident with them
sources:
  - ['Google SRE Book: Monitoring distributed systems', 'https://sre.google/sre-book/monitoring-distributed-systems/']
  - ['OpenTelemetry: Observability primer', 'https://opentelemetry.io/docs/concepts/observability-primer/']
  - ['W3C Trace Context', 'https://www.w3.org/TR/trace-context/']
---

> [!story] Green dashboards, angry customers
> An outage report from a payments company: for 50 minutes, about 8% of card payments failed for customers of one bank. Every dashboard was green — average latency was normal, the overall error rate barely moved, CPU was fine. The alerts were on host metrics and global averages, so a problem confined to one bank's BIN range was invisible. Support tickets found it first. The fix wasn't more dashboards; it was being able to slice errors by the dimensions that matter, and alerting on what customers experience.

## Three (and a half) kinds of telemetry

| Signal | What it is | Answers | Cost profile |
|---|---|---|---|
| **Metrics** | Numeric time series, aggregated (counters, gauges, histograms) with labels | *Is something wrong? How bad, how widespread, since when?* | Cheap per data point; cost grows with label cardinality |
| **Logs** | Timestamped records of discrete events, ideally structured (JSON) | *What exactly happened in this request or process?* | Grows with volume; expensive to index everything |
| **Traces** | A request's path across services as a tree of timed spans | *Where did the time go? Which dependency failed?* | Usually sampled |
| **Wide events** | One rich structured event per request with many fields (user, tenant, endpoint, version, region…) | *Which slice is affected?* — arbitrary high-cardinality slicing | Columnar stores make it feasible |

```sort
prompt: Which signal answers each question fastest?
buckets: [Metrics, Logs, Traces]
items:
  - {text: 'Has the checkout error rate risen in the last 10 minutes?', bucket: 0, why: 'An aggregated rate over time — exactly what metrics are for.'}
  - {text: 'Why did this particular order (id 88123) fail validation?', bucket: 1, why: 'A specific event with its details: find it by order ID in structured logs.'}
  - {text: 'Checkout p99 doubled — which downstream call is responsible?', bucket: 2, why: 'A trace breaks the request into spans across services and shows where the time went.'}
  - {text: 'How many requests per second does each region serve?', bucket: 0, why: 'A rate broken down by a low-cardinality label.'}
  - {text: 'What arguments did the failing job run with?', bucket: 1, why: 'Event details belong in logs.'}
  - {text: 'Why is this one slow request slow when the median is fine?', bucket: 2, why: "Find a trace for a slow request and inspect its span timings."}
```

## What to measure: the golden signals

For every user-facing service, Google's SRE book recommends the **four golden signals**: **latency** (as a distribution; separate successful from failed requests), **traffic** (requests/s), **errors** (rate, including "succeeded with wrong content"), and **saturation** (how full the constrained resource is — queue depth, pool usage, memory). The RED method (rate, errors, duration) covers services; USE (utilisation, saturation, errors) covers resources.

Use **histograms** for latency so you can compute percentiles across instances. You can't average p99s.

## Following one request

- Generate a **trace ID** at the edge and propagate it in headers (the W3C `traceparent` header) through every hop, queue message and async job.
- Write **structured logs** with the trace ID, request ID, user or tenant, and key fields, so you can pivot from a trace to its logs and back.
- **Sampling:** keeping every trace is expensive. **Head sampling** (decide at the start, e.g. 1%) is cheap but usually misses the rare slow or failed requests you care about. **Tail sampling** (decide after the request completes, keeping all errors and slow ones plus a small sample of the rest) keeps the interesting ones at the cost of buffering spans.

```predict
prompt: Traces are head-sampled at 1%. A bug causes 0.05% of checkouts to fail after 9 seconds. Engineers search the tracing system for an example and find almost nothing. Why, and what fixes it?
choices:
  - The tracing system is broken
  - With 1% head sampling, only about 1 in 2,000 failing requests is traced; tail-based sampling that keeps all errors and slow requests would capture them
  - Failed requests can't be traced
  - Traces only record successful requests
answer: 1
reveal: |
  Head sampling decides before anyone knows the request will be interesting, so rare failures are sampled at the same 1% as everything else. Tail sampling — buffer spans, then keep every trace with an error or high latency plus a baseline sample — is how teams make sure the traces they actually need exist.
```

## Cardinality: the hidden cost

Each unique combination of label values on a metric is a separate time series. Labels with unbounded values — user ID, request ID, full URL, error message text — explode the series count, the bill and query times.

```calc
title: How many time series?
prompt: A metric `http_requests_total` has labels **service** (40 values), **endpoint** (25 per service, on average), **status_code** (8), **region** (6) and **pod** (30 per service). Roughly how many **million** time series does it create?
answer: 1.44
unit: million series
tolerance: 1.05
steps: |
  Per service: 25 endpoints × 8 statuses × 6 regions × 30 pods = 36,000; × 40 services = **1.44 million** series for one metric. Adding `user_id` with 1M values would make it impossible. Keep metric labels to low-cardinality dimensions you'll aggregate by, drop or aggregate `pod` where you don't need it, and put high-cardinality detail (user, tenant, order) in traces, logs or wide events.
```

## Alerts that deserve to wake someone

A good page is **urgent, user-impacting, actionable and novel**. Practices:

- **Page on symptoms, not causes:** "checkout error rate above SLO burn rate", not "CPU > 80%" (high CPU without user impact isn't urgent; user impact with low CPU still is).
- **Use SLO burn-rate alerts** with multiple windows (fast and slow burns).
- **Include context:** what's affected, the dashboard link, recent deploys, and a **runbook** with first steps.
- **Route to an owner,** and delete alerts that nobody acts on — alert fatigue makes people ignore the real ones.
- **Cause-based signals** (disk filling, certificate expiring) can be tickets or warnings, unless they predict imminent user impact.

```bug
title: Review the alerting rules
prompt: Which of these alerts are noise or blind spots?
lang: yaml
code: |
  - alert: HighCPU
    expr: avg(cpu_usage) > 0.8
    for: 1m
    severity: page
  - alert: CheckoutErrorBudgetBurn
    expr: checkout_error_ratio[1h] > 14.4 * 0.001 and checkout_error_ratio[5m] > 14.4 * 0.001
    severity: page
    runbook: https://runbooks/checkout-errors
  - alert: AnyErrorLogged
    expr: rate(log_lines{level="error"}[1m]) > 0
    severity: page
bug: [2, 4, 10]
explain: |
  **Lines 2 and 4:** paging on average CPU after one minute pages for harmless spikes (batch jobs, GC) and misses user impact with low CPU. Make it a dashboard or ticket signal, not a page. **Line 10:** paging on *any* error log line guarantees alert fatigue — every service logs some errors all the time. The burn-rate alert (lines 5–8) is the good one: it pages on user-visible error-budget consumption over two windows, with a runbook.
```

```incident
title: p99 latency doubled
intro: |
  14:10. The checkout SLO burn-rate alert fires: p99 latency went from 400 ms to 1.9 s about ten minutes ago. Error rate is flat. Traffic is normal. There was a deploy of the pricing service at 13:58.
start: s1
nodes:
  s1:
    text: Where do you look first?
    options:
      - {label: 'Open slow checkout traces from the last 15 minutes and see which span grew', next: s2, quality: good, note: 'Traces localise latency fastest.'}
      - {label: 'SSH into a checkout pod and tail its logs', next: s1b, quality: ok, note: 'One pod of many, and logs rarely show where time went across services.'}
      - {label: 'Restart all checkout pods', next: bad1, quality: bad, note: 'Acting before diagnosing — and checkout might not even be the problem.'}
  s1b:
    text: The logs show normal requests with high total duration, but not why. You need the cross-service view.
    options:
      - {label: 'Open slow traces', next: s2, quality: good}
  bad1:
    text: The restart takes 5 minutes, adds cold-start latency, and p99 is still 1.9 s afterwards.
    options:
      - {label: 'Open slow traces', next: s2, quality: good}
  s2:
    text: In slow traces, the `pricing.GetQuote` span grew from 30 ms to 1.4 s. Pricing's metrics show its database query p99 jumped at 13:59.
    options:
      - {label: 'Roll back the 13:58 pricing deploy, then investigate the query change', next: s3, quality: good, note: 'The correlation with the deploy is strong, and rollback is the fastest mitigation.'}
      - {label: 'Scale the pricing service out to more pods', next: s3b, quality: ok, note: 'It might help slightly, but if the new query is slow, more pods just run more slow queries.'}
  s3b:
    text: Database CPU climbs higher and p99 improves only to 1.6 s.
    options:
      - {label: 'Roll back the deploy', next: s3, quality: good}
  s3:
    text: After rollback, p99 returns to 420 ms within 3 minutes. The diff shows a new query that dropped a filter on an indexed column. What follow-up matters most?
    options:
      - {label: 'Add the pricing query latency SLO to the canary analysis so deploys like this auto-roll back', next: done, quality: good}
      - {label: 'Add a CPU alert on the pricing database', next: done2, quality: ok}
  done:
    text: The next regression of this kind is caught during a 5% canary and rolled back before most users see it.
    verdict: good
  done2:
    text: Helpful context, but it alerts on a cause rather than the user-visible symptom, and it wouldn't stop the bad deploy reaching everyone.
    verdict: ok
debrief: |
  Symptom alert → traces to localise → metrics to confirm → correlate with changes → mitigate first (roll back), investigate second → improve detection so the deploy pipeline catches it next time.
```

```interview
say: |
  "Every service emits RED metrics as histograms with low-cardinality labels — service, endpoint, status, region — and uses OpenTelemetry to propagate trace context through HTTP and queue messages. Logs are structured JSON with trace and request IDs. Traces are tail-sampled so every error and slow request is kept. Pages fire only on SLO burn rates for user-facing symptoms, with runbooks and owners. Tenant- and user-level questions go to wide events in a columnar store, not metric labels."
followups:
  - q: Why not put user_id on your metrics?
    a: Each unique label value creates a series. Millions of users means millions of series, which costs money and kills query performance. Use traces, logs or wide events for per-user debugging.
  - q: Head or tail sampling?
    a: Head sampling is cheap but samples errors at the same low rate as successes. Tail sampling keeps the interesting traces (errors, slow requests) by deciding after completion, at the cost of buffering.
  - q: What makes a good alert?
    a: It reflects user impact, is urgent, has a clear first action and a runbook, goes to an owner, and rarely fires falsely. Everything else belongs on a dashboard or in a ticket.
weak: |
  "We'll add logging and set up CPU alerts." No correlation across services, no symptom-based alerting, unbounded labels.
strong: |
  Golden signals as histograms, traces with propagated context and tail sampling, structured correlated logs, bounded cardinality with high-cardinality detail in events, and SLO burn-rate alerts with runbooks.
```

```recall
prompt: Explain how you would find out why checkout became slow in a system of 15 microservices, naming which telemetry you'd use at each step.
points:
  - A symptom-based metric or SLO alert shows checkout latency rising, and how widespread it is
  - Traces of slow requests (enabled by propagated trace IDs) show which service or span contributes the extra time
  - Metrics for that service and its resources confirm saturation or errors and when they started
  - Structured logs correlated by trace or request ID explain specific failures, plus correlation with recent deploys or changes
model: |
  The checkout latency SLO alert (from histogram metrics) tells me something's wrong and when it began. I'd open traces of slow checkouts — possible because every service propagates the trace context — and compare span durations with normal ones to find which downstream call grew. Then I'd look at that service's RED and USE metrics to see whether it's saturated, erroring, or slowed by its own dependency, and when it changed. Its structured logs, filtered by the trace IDs of slow requests, give the specifics. Finally I'd line the start time up against deploys and config changes, mitigate by rolling back, and investigate the root cause afterwards.
```

```questions
- kind: check
  prompt: Which telemetry best shows where a slow request spent its time across six services?
  choices:
    - text: A distributed trace with spans per service call
      correct: true
    - text: Average latency metric for the edge
      why: It shows that latency rose, not where.
    - text: CPU metrics for each host
      why: CPU doesn't show request paths.
    - text: The edge server's access log
      why: It records the total time only.
  explanation: Traces break one request into timed spans across services, which localises latency directly.
- kind: check
  type: numeric
  prompt: A metric has labels endpoint (50 values), status (6) and region (4). How many time series does it create?
  answer: 1200
  unit: series
  tolerance: 0.01
  explanation: 50 × 6 × 4 = 1,200. Add a label with 100k values and it becomes 120 million — keep labels low-cardinality.
- kind: check
  type: multi
  prompt: Which are the four golden signals? Select all that apply.
  choices:
    - text: Latency
      correct: true
    - text: Traffic
      correct: true
    - text: Errors
      correct: true
    - text: Saturation
      correct: true
    - text: Lines of code deployed
      why: That's not a service health signal.
  explanation: Latency, traffic, errors and saturation describe a service's health from its users' and resources' perspectives.
- kind: check
  prompt: Which alert is most appropriate to page an on-call engineer at 3 a.m.?
  choices:
    - text: The checkout error budget is burning 14× faster than sustainable over both the last hour and the last 5 minutes
      correct: true
    - text: Average CPU above 80% for one minute
      why: Often harmless and not user-visible.
    - text: Any error line appears in the logs
      why: That fires constantly and trains people to ignore pages.
    - text: Disk usage at 60%
      why: Not urgent. Make it a ticket.
  explanation: Page on urgent, user-visible symptoms tied to SLOs. Causes and slow trends are tickets or dashboard items.
- kind: fire
  prompt: Traces are head-sampled at 0.5%, and engineers can't find traces for a rare failure. What's the best fix?
  choices:
    - text: Tail-based sampling that keeps all error and slow traces plus a small baseline sample
      correct: true
    - text: Sample 100% of traces forever
      why: That's very expensive at scale and usually unnecessary.
    - text: Turn tracing off and use logs only
      why: That loses the cross-service view.
    - text: Average the traces
      why: Traces aren't averaged.
  explanation: Decide what to keep after you know a request was interesting.
- kind: fire
  prompt: Why can't you average p99 latencies across 50 instances to get the fleet-wide p99?
  choices:
    - text: Percentiles don't combine by averaging; you need the merged distribution (histograms) to compute a fleet percentile
      correct: true
    - text: Averaging is too slow
      why: It's fast. It's just wrong.
    - text: p99 is always the same on every instance
      why: It varies between instances.
    - text: You can, if instances have equal traffic
      why: Even then, the average of p99s isn't the p99 of the combined data.
  explanation: Record latency as histograms and aggregate the buckets, then compute percentiles from the merged distribution.
- kind: fire
  prompt: What lets you follow one request through an API, a queue and an asynchronous worker?
  choices:
    - text: Propagating a trace ID (e.g. W3C traceparent) in HTTP headers and message metadata, and logging it everywhere
      correct: true
    - text: Matching timestamps across logs
      why: Timestamps are ambiguous with concurrent requests and clock skew.
    - text: Using the same hostname
      why: Requests cross many hosts.
    - text: Increasing log verbosity
      why: More logs without correlation IDs don't connect anything.
  explanation: Context propagation across every hop, including async boundaries, is what makes correlation possible.
- kind: fire
  level: advanced
  prompt: Errors affect only customers of one partner bank, and global error rates barely move. Which capability finds this fastest?
  choices:
    - text: Slicing errors by high-cardinality dimensions (bank, BIN range, tenant) using wide events or traces
      correct: true
    - text: A global average error-rate dashboard
      why: A small slice disappears inside the average.
    - text: Host CPU graphs
      why: CPU says nothing about which customers are affected.
    - text: Uptime pings
      why: The service is up. It's failing for a subset.
  explanation: Partial outages hide in aggregates. You need to break down by the dimensions that define your customers.
- kind: fire
  type: multi
  prompt: What should a good page include? Select all that apply.
  choices:
    - text: What user-facing symptom is affected, and how badly
      correct: true
    - text: A link to the relevant dashboard and recent changes
      correct: true
    - text: A runbook with first diagnostic and mitigation steps
      correct: true
    - text: The owning team or escalation path
      correct: true
    - text: Only the metric name, with no context
      why: That forces responders to start from nothing at 3 a.m.
  explanation: Pages should make the first five minutes of response obvious.
```
