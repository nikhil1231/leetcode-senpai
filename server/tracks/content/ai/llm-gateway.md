---
id: llm-gateway
category: platform
skill: platform
title: LLM gateways - one door to every model
minutes: 16
summary: 'Once several teams call models, a company needs one front door: an LLM gateway. It gives every team the same API and keeps provider keys out of their code. It routes model aliases to providers and regions, falls back when one is throttled or down, enforces quotas in tokens as well as requests, attributes cost to teams and features, and is the place to put caching, logging with PII redaction, guardrails and model policy. It sits on every request, so it has to be fast and highly available, and stream without buffering. Build it, buy it (LiteLLM, Portkey, Envoy AI Gateway, cloud offerings), or both. This app''s own model policy is a gateway in miniature.'
objectives:
  - Explain what an LLM gateway centralises, and why teams shouldn't call providers directly
  - Design routing, fallbacks and retries that are safe for streamed, non-idempotent calls
  - Enforce per-team quotas in tokens, and attribute cost to teams and features
  - Decide what belongs in the gateway (caching, logging, guardrails, policy) and how to keep it off the critical path's failure list
sources:
  - ['LiteLLM proxy documentation', 'https://docs.litellm.ai/docs/simple_proxy']
  - ['Envoy AI Gateway', 'https://aigateway.envoyproxy.io/']
  - ['Chip Huyen: Building a generative AI platform', 'https://huyenchip.com/2024/07/25/genai-platform.html']
  - ['OpenTelemetry: semantic conventions for generative AI', 'https://opentelemetry.io/docs/specs/semconv/gen-ai/']
---

## Why one front door

Without a gateway, every team embeds provider keys, writes its own retries, picks models without review, and nobody can answer "what did we spend on AI last month, and on what?" A gateway is a reverse proxy that speaks LLM:

- **One API** for every model, usually OpenAI-compatible, so switching provider is a config change.
- **Keys and auth**: provider keys live in the gateway. Teams get their own **virtual keys**, which can be scoped, rotated and revoked.
- **Routing**: model **aliases** (`chat-large`, `embed-default`) map to a provider, model version and region, and change without code changes.
- **Reliability**: retries, fallbacks to another provider or region, load-balancing across deployments, circuit breakers.
- **Quotas and cost**: per-team limits, budgets, and every request tagged with team, feature and user, priced at the time.
- **Policy**: which models each team may use, data residency (EU traffic stays on EU endpoints), maximum tokens.
- **Observability**: a trace per call, with tokens, latency and cost, and PII redacted from logs.
- **Guardrails and caching**: shared hooks, so every team gets moderation and caching without building them.

This app has one in miniature. `llm.forbidden_model` refuses models that are too expensive, falls back to a default, and the transport refuses the call. That's model policy, enforced in the one place every call goes through.

## Routing, fallbacks and streaming

```arch
title: An LLM gateway
nodes:
  - {id: apps, label: 'Team services (virtual keys)', kind: client, x: 0, y: 1}
  - {id: gw, label: 'Gateway (auth, quota, route)', kind: service, x: 1, y: 1}
  - {id: rl, label: 'Token counters (Redis)', kind: db, x: 1, y: 0}
  - {id: a, label: 'Provider A (primary)', kind: external, x: 2, y: 0}
  - {id: b, label: 'Provider B (fallback)', kind: external, x: 2, y: 1}
  - {id: self, label: 'Self-hosted pool', kind: service, x: 2, y: 2}
  - {id: obs, label: 'Traces, cost, audit', kind: storage, x: 1, y: 2}
edges:
  - [apps, gw, 'request + key']
  - [gw, rl, 'reserve tokens']
  - [gw, a, 'chat-large']
  - [gw, b, 'on 429 / 5xx']
  - [gw, self, 'embed-default']
  - [gw, obs, 'every call']
caption: Aliases decouple what teams ask for from where it runs. The gateway reserves quota before calling and reconciles after.
```

- **Retry what's safe**: 429 (respecting `retry-after`), 5xx and connection errors, with backoff and jitter, and a total time budget. Don't retry timeouts on calls with side effects (an agent's tool step) without idempotency.
- **Fall back before the first token, not after**: once tokens have streamed to the client, switching providers mid-answer produces a stitched-together reply. Fall back on errors before streaming starts. After that, fail the stream cleanly, and let the client decide.
- **Fallbacks need their own evals**: provider B's model behaves differently. Test fallback routes like any other model, or a fallback "succeeds" with worse answers nobody measured.
- **Stream without buffering**: pass server-sent events through as they arrive. Buffering the response to count tokens destroys time to first token.
- **Propagate cancellation**: when a client disconnects, cancel the upstream request. Otherwise you pay for thousands of tokens nobody reads.

## Quotas in tokens, not just requests

A request limit treats "hello" and a 100,000-token document the same. Providers limit **tokens per minute (TPM)** as well as **requests per minute (RPM)**, and so should you, per team:

1. **Estimate** the input tokens before the call (a tokenizer, or characters ÷ 4) and **reserve** them plus the request's `max_tokens` from the team's budget.
2. **Call** the provider.
3. **Reconcile** with the real usage from the response, returning what wasn't used.

Reserving `max_tokens` up front is conservative but safe: a team can't burst past its limit with long answers. Teams that set `max_tokens` sensibly get more requests through.

```calc
title: How many requests does a quota allow?
prompt: A team has 2,000,000 tokens per minute. Its requests average 3,000 input tokens, and the gateway reserves max_tokens of 500 for output. How many requests per minute can it make before the reservation limit is hit?
answer: 571
unit: requests/min
tolerance: 1.05
steps: |
  Each request reserves 3,000 + 500 = 3,500 tokens. 2,000,000 ÷ 3,500 ≈ **571 requests per minute**. If the team's real outputs average 150 tokens, reconciliation returns most of each output reservation, but at peak, in-flight reservations are what count. Setting max_tokens close to real needs raises capacity for free.
```

```incident
title: Two o'clock, everyone's down
start: s0
nodes:
  s0:
    text: 'At 14:00 every AI feature in the company starts returning 429s from the primary provider. The support bot, the code assistant and search are all degraded. What do you check first?'
    options:
      - {label: 'Per-team token usage in the gateway over the last 30 minutes', next: s1, quality: good, note: 'A shared provider limit is exhausted by someone. Find who.'}
      - {label: 'Raise the retry count so requests eventually get through', next: bad1, quality: bad, note: 'More retries against an exhausted limit make it worse.'}
  bad1:
    text: 'Retries triple the request rate. The provider starts rejecting the whole organisation for longer.'
    verdict: bad
  s1:
    text: 'A data team started a backfill at 14:00: 40 million tokens a minute through the same organisation-wide provider quota as the interactive features.'
    options:
      - {label: 'Throttle the backfill to its team quota now; then give batch work a lower priority class, its own limit, and the batch API', next: good, quality: good, note: 'Isolate tenants and separate batch from interactive traffic.'}
      - {label: 'Ask the data team to run backfills at night', next: okay, quality: ok, note: 'Helps this time, but nothing stops the next team.'}
  okay:
    text: 'It holds until another team runs an evaluation sweep at lunchtime.'
    verdict: ok
  good:
    text: 'Interactive traffic recovers in minutes. Backfills now go to the batch API at half price, and per-team quotas mean one team can no longer take everyone down.'
    verdict: good
debrief: A shared upstream limit is a shared failure domain. Per-team token quotas, priority classes, and keeping batch work off the interactive path are what a gateway is for.
```

## Cost attribution

Price every request when it completes: input, cached input and output tokens at that model's rates, tagged with **team, feature, environment and user**. That makes cost a dashboard, not an end-of-month surprise: cost per feature per day, cost per conversation, top spenders, and **anomaly alerts** (a feature's cost tripling overnight usually means a loop or a prompt that grew). Budgets per team can warn at 80% and block or downgrade at 100%.

## Caching and guardrails

- **Exact caching**: the same model, prompt and parameters return the stored answer. Safe, but hit rates are low except for repeated jobs.
- **Semantic caching**: return a stored answer for a *similar* prompt, found by embeddings. Risky: "cancel my order" and "don't cancel my order" can be close, and answers can leak between users. Use it only for shared, non-personal content, with a strict similarity threshold and per-tenant keys.
- **Provider prompt caching** is different and usually the best saving: structure prompts with stable prefixes first, and the provider discounts them.
- **Guardrails** (moderation, PII detection, schema checks) can run in the gateway as shared hooks, but they add latency to every call. Run cheap ones inline and expensive ones asynchronously or per-feature.

## Build or buy

Off-the-shelf options include **LiteLLM** (open-source proxy), **Portkey**, **Envoy AI Gateway** and **Kong**, and cloud services from the large providers. Buy (or adopt open source) for the commodity parts: provider adapters, key management, basic routing and logging. Build the parts that encode your company: policy, cost attribution to your org chart, and integration with your identity and observability stacks.

Whatever you choose, the gateway is now **on every AI request**, so it needs the care of any critical proxy: several replicas across zones, a latency budget of a few milliseconds, load tests, and a decision on **failing open or closed**. If the quota store is down, do you let traffic through unmetered, or block it? Usually: fail open with a local fallback limit, alert loudly, and never fail closed on the path to a customer.

```questions
- kind: check
  prompt: Why should teams use virtual keys instead of provider keys?
  choices:
    - text: The gateway can scope, rotate and revoke them per team
      correct: true
    - text: Virtual keys get lower prices from the model providers
      why: Prices come from the provider contract, not the key.
    - text: Provider keys stop working when called from containers
      why: They work anywhere, which is part of the risk.
    - text: Virtual keys encrypt the prompts so providers can't read them
      why: Providers still see prompts; keys are about access control.
  explanation: Real provider keys stay in one place.
- kind: check
  prompt: The primary provider fails after 200 tokens have streamed to the user. What should the gateway do?
  choices:
    - text: End the stream with an error; fall back only before it starts
      correct: true
    - text: Send the same request to the fallback and stream its answer on from there
      why: The user would get two different answers stitched together.
    - text: Retry the primary five times, then resume streaming where it stopped
      why: A new call can't continue the old one's tokens.
  explanation: Fallbacks are for failures before the first token.
- kind: check
  prompt: Why reserve max_tokens against the quota before a call?
  choices:
    - text: So long outputs can't push a team past its limit mid-flight
      correct: true
    - text: Providers bill the full max_tokens even when output is short
      why: They bill actual usage.
    - text: So the model is forced to write exactly max_tokens of output
      why: max_tokens is a ceiling, not a target.
  explanation: Reserve, call, then reconcile with real usage.
- kind: fire
  prompt: What's the risk of semantic caching?
  choices:
    - text: Similar prompts can need different answers
      correct: true
    - text: It's usually slower than calling the model itself
      why: Usually faster.
    - text: It only works for exact repeats
      why: That's exact caching.
  explanation: "Cancel" and "don't cancel" can embed closely.
- kind: fire
  prompt: A client disconnects mid-stream. What should the gateway do?
  choices:
    - text: Cancel the upstream call
      correct: true
    - text: Finish it and cache the result
      why: You pay for tokens nobody reads.
    - text: Retry it on another provider
      why: Nobody is waiting for it.
  explanation: Propagate cancellation to save tokens.
- kind: fire
  prompt: Why do fallback routes need their own evals?
  choices:
    - text: The fallback model behaves differently
      correct: true
    - text: Fallback providers bill at higher rates than primaries
      why: Cost isn't the quality question.
    - text: Providers forbid untested fallbacks
      why: They don't.
  explanation: A fallback that works but answers worse needs measuring.
- kind: fire
  prompt: The gateway's quota store goes down. Usual choice?
  choices:
    - text: Fail open with a local limit, and alert
      correct: true
    - text: Fail closed and block all AI traffic until it's back
      why: That takes every feature down.
    - text: Disable logging until it recovers
      why: Unrelated to quotas.
  explanation: Don't turn a metering outage into a product outage.
```
