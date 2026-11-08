---
id: llmops
category: platform
skill: platform
title: LLMOps - releasing, observing and rolling back AI changes
minutes: 16
summary: 'In an AI feature, a "release" is often not code. It''s a new prompt, model version, retrieval setting or tool description, and each can change behaviour as much as a code change. Version them together as one configuration, so every output can be traced to the setup that produced it. Ship it like code: an offline eval gate, then shadow traffic, then a canary with automatic rollback triggers on quality, errors, latency and cost. Observe with traces that have a span for every model call, retrieval and tool call, using the OpenTelemetry GenAI conventions. Set SLOs for latency and availability, and treat online quality as a measured indicator too. Watch for drift: new kinds of input, stale data, and providers changing models under you.'
objectives:
  - Version prompts, models, parameters, tools and retrieval settings together as one release
  - Run a release through an eval gate, shadow traffic and a canary with rollback triggers
  - Instrument an AI feature with traces, cost and quality signals
  - Set SLOs and error budgets for an AI service, and detect drift
sources:
  - ['OpenTelemetry: semantic conventions for generative AI', 'https://opentelemetry.io/docs/specs/semconv/gen-ai/']
  - ['Google SRE book: Service level objectives', 'https://sre.google/sre-book/service-level-objectives/']
  - ['Langfuse documentation: tracing and prompt management', 'https://langfuse.com/docs']
  - ['Chip Huyen: Building a generative AI platform', 'https://huyenchip.com/2024/07/25/genai-platform.html']
---

## A release is a configuration

The things that change an AI feature's behaviour:

- the **prompt** templates and few-shot examples,
- the **model** and its exact version, and parameters such as temperature and max tokens,
- **tool** definitions and descriptions,
- **retrieval** settings (embedding model, chunking, top-k, re-ranker),
- **guardrail** settings and thresholds.

Version them **together**, as one immutable configuration with an ID, stored in a registry or in the repository, and record that ID with every output. Then "what produced this answer?" always has an answer, outputs can be regenerated, and rollback means pointing at the previous ID. This app does a small version of it: derived LLM output is stored with its `PROMPT_VERSION`, so it can be told apart and regenerated.

Keep configurations out of code deploys where it helps. A prompt change that ships through a feature flag or a config service can be rolled out to 1% and rolled back in seconds. It still needs a review and the eval gate, like code.

## The release path

```order
prompt: Order the steps for releasing a new prompt and model version.
items:
  - Run the offline eval suite and compare it with production, per category
  - Run the new configuration in shadow on live traffic, logging but not showing its output
  - Canary it to a few percent of users, with automatic rollback triggers armed
  - Ramp up in steps while online metrics hold
  - Keep the previous configuration ready for instant rollback
explain: Each stage catches what the one before can't. Offline evals catch known failure modes, shadow catches real-traffic surprises without user impact, and the canary measures what users actually do.
```

**Shadow** traffic doubles model calls for its duration, so sample it (10% of traffic, say) and judge it offline. It's the safest way to see how a new model handles real inputs, including the weird ones no eval set has.

**Rollback triggers** should be automatic for the canary, comparing it with the control group:

```sort
prompt: Good automatic rollback trigger for a canary, or not?
buckets: [Good trigger, Poor trigger]
items:
  - {text: 'Error and refusal rate up by 2 points against control', bucket: 0, why: 'A clear, fast, comparable signal.'}
  - {text: 'p95 time to first token up by 50% against control', bucket: 0, why: 'Users feel it, and it can be measured in minutes.'}
  - {text: 'Cost per request up by 40% against control', bucket: 0, why: 'A runaway prompt or loop shows up here first.'}
  - {text: 'Online judge pass rate for a key failure mode down by 5 points', bucket: 0, why: 'A validated judge on sampled traffic is a quality signal.'}
  - {text: 'Monthly customer satisfaction survey score', bucket: 1, why: 'Far too slow and noisy to stop a canary.'}
  - {text: 'Any single bad answer reported by a user', bucket: 1, why: 'Both versions produce some bad answers; compare rates.'}
```

## Observability: traces, not logs

A single answer from an AI feature can involve a router call, a retrieval, a re-rank, three tool calls and two model calls. Logs of each in isolation can't answer "why was this answer wrong?" A **trace** can: one tree per request, with a **span** per step, holding inputs, outputs, timings, tokens and cost.

The **OpenTelemetry GenAI semantic conventions** standardise span names and attributes (`gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, the operation name, and so on), so traces work across tools. Products such as Langfuse, LangSmith, Arize Phoenix and Braintrust add prompt management, judges on traces and dataset building on top.

What to record per request: the configuration ID, model and version, token counts (including cached tokens), latency split into TTFT and total, cost, tool calls and their results, retrieved document IDs, guardrail outcomes, and user feedback joined later by trace ID. Redact PII before it's stored, and set retention limits, because prompts and outputs often contain the most sensitive data in the company.

## SLOs and error budgets

An **SLO** (service level objective) is a target for a measured indicator, over a window: "99.5% of requests succeed each month", "95% of requests get a first token within 1.5 s". The **error budget** is what the target allows to fail. When it's being spent fast, slow down releases and fix reliability.

```calc
title: The error budget
prompt: An AI feature has an availability SLO of 99.5% over a 30-day month. How many minutes of full outage does the error budget allow?
answer: 216
unit: minutes
tolerance: 1.05
steps: |
  30 days × 24 × 60 = 43,200 minutes. 0.5% of that is **216 minutes**, about 3.6 hours. A single 2-hour provider outage with no fallback spends more than half of it, which is the case for a tested fallback route.
```

For AI features, add **quality as an indicator**: the share of sampled requests that pass the validated judges for your main failure modes, tracked with a target and alerts like any other SLO. Latency and availability can be perfect while answers quietly get worse.

## Drift

- **Input drift**: users start asking about a new product, in a new language, or in a new way. Track topics and intents over time (clustering, or a classifier), and feed new clusters into error analysis.
- **Data drift**: documents behind retrieval change or go stale. Track index freshness and broken citations.
- **Model drift**: a provider updates the model behind an unpinned alias, or quietly changes behaviour. Pin versions, and run a small daily canary eval against production configurations, so a change shows up as a dip on a chart, not as a support ticket.

```recall
prompt: An interviewer asks, "How would you ship a change to the system prompt of a customer-facing assistant safely?" Answer in under a minute.
points:
  - Version the prompt with the model, parameters, tools and retrieval settings as one configuration ID, recorded with every output
  - Gate it on the offline eval suite, compared per category against production
  - Shadow then canary it behind a flag, with automatic rollback on errors, latency, cost and judged quality against control
  - Watch traces and online signals while ramping, and keep the previous configuration ready for instant rollback
model: |
  I'd treat it as a release, not a text edit. The prompt goes into a versioned configuration together with the model version, parameters, tools and retrieval settings, and every output records that configuration's ID. It has to pass the offline eval suite first, compared per category with production, and I'd read any newly failing cases. Then shadow it on a sample of live traffic and judge those outputs, then canary it to a few percent behind a flag. Automatic rollback triggers compare the canary with control: error and refusal rate, p95 latency, cost per request, and the pass rate of our validated judges. Then I'd ramp in steps while watching traces and user signals, with the old configuration one switch away.
```

```questions
- kind: check
  prompt: Why version the prompt, model and retrieval settings together?
  choices:
    - text: So each output traces to the full setup, which rolls back as one
      correct: true
    - text: So that providers can cache the configuration and charge a lower price for it
      why: Caching depends on prompt prefixes, not configuration IDs.
    - text: So the model can read the version number and adjust its own behaviour to match
      why: The model doesn't use the ID; your systems do.
  explanation: Any one of them can change behaviour, so they're released together.
- kind: check
  prompt: What does shadow traffic tell you that offline evals can't?
  choices:
    - text: How it handles real, messy inputs, with no user impact
      correct: true
    - text: How users feel about the new answers, because they are shown both versions
      why: Shadow output isn't shown to users.
    - text: The exact price the provider will charge for the new model in production
      why: You can estimate cost offline too.
  explanation: Real inputs, zero user impact.
- kind: check
  prompt: An AI feature has a 99.9% monthly availability SLO. Roughly how many minutes of outage does a 30-day month allow?
  type: numeric
  answer: 43.2
  unit: minutes
  tolerance: 0.05
  explanation: 43,200 minutes × 0.1% = 43.2 minutes.
- kind: fire
  prompt: What is a span in a trace?
  choices:
    - text: One timed step within a request
      correct: true
    - text: The time between two deploys
      why: That's a release interval.
    - text: A group of similar user questions
      why: That's a cluster.
  explanation: A trace is a tree of spans.
- kind: fire
  prompt: Best guard against a provider silently changing a model?
  choices:
    - text: Pin versions, and run a daily canary eval
      correct: true
    - text: Lower the temperature to zero
      why: The weights changed, not the sampling.
    - text: Ask the model which version it is at the start of each call
      why: Models often don't know reliably.
  explanation: Make the change show up on a chart.
- kind: fire
  prompt: Why is a monthly survey a poor canary trigger?
  choices:
    - text: Too slow and noisy to stop a rollout
      correct: true
    - text: Surveys can't measure the quality of answers at all
      why: They can, slowly.
    - text: Canaries can only use cost metrics
      why: Many signals work.
  explanation: Triggers need fast, comparable signals.
- kind: fire
  prompt: What should be done to prompts and outputs before they are stored in traces?
  choices:
    - text: Redact PII, and set retention limits
      correct: true
    - text: Translate them all into English
      why: That loses information.
    - text: Strip the system prompt to save space
      why: You need it to debug.
  explanation: Traces hold some of the most sensitive data you have.
```
