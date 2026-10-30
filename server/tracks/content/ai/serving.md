---
id: serving
category: production
skill: production
title: Serving LLMs - latency, cost and reliability
minutes: 15
summary: Production LLM features live within latency, cost and reliability budgets. The levers are model choice and routing, prompt and output length, caching (prompt prefix caching and response caching), streaming, batching for offline work, and, if you self-host, quantisation and continuous batching. Treat the model API as an unreliable, rate-limited dependency, with timeouts, retries with backoff, fallbacks and per-feature cost tracking.
objectives:
  - Estimate per-request and monthly cost from token counts and traffic
  - Cut latency and cost with routing, caching, streaming and shorter outputs
  - Make LLM calls reliable with timeouts, retries, fallbacks and rate-limit handling
  - Explain what self-hosting involves, including the KV cache, continuous batching and quantisation
sources:
  - ['vLLM: Efficient Memory Management for LLM Serving with PagedAttention', 'https://arxiv.org/abs/2309.06180']
  - ['Anthropic docs: Prompt caching', 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching']
  - ['Anthropic docs: Message Batches API', 'https://docs.anthropic.com/en/docs/build-with-claude/batch-processing']
---

## Cost arithmetic

Cost per request = input tokens × input price + output tokens × output price. Cached input is billed at a large discount, and batch APIs are typically about half price in exchange for delayed results.

```calc
title: The monthly bill
prompt: A feature makes 200,000 requests per day. Each request has 3,000 input tokens and 300 output tokens. Prices are $3 per million input tokens and $15 per million output tokens. What's the cost per **day**, in dollars, with no caching?
answer: 2700
unit: $/day
tolerance: 0.02
steps: |
  Input: 200,000 × 3,000 = 600M tokens × $3/M = **$1,800**. Output: 200,000 × 300 = 60M tokens × $15/M = **$900**. Total **$2,700 a day**, about $81k a month. If 2,500 of the 3,000 input tokens are a shared system prompt and documents, caching them at a 90% discount cuts the input cost to about $450, so the total falls to roughly $1,350 a day. Routing easy requests to a model 5× cheaper cuts it further. Always do this arithmetic before you choose a model.
```

## Latency and cost levers

- **Right-size the model**: a small, fast model handles classification, extraction and routing. Send only hard cases to the large model. A **router** (rules or a classifier) picks per request, and a **cascade** tries the cheap model first and escalates when confidence is low or validation fails.
- **Shorter outputs**: decode time dominates, so constrain the format.
- **Prompt caching**: put stable content first (system prompt, tool definitions, documents) to reuse the prefix.
- **Response caching**: cache identical, or normalised-identical, requests. Semantic caching (embedding similarity) is riskier, because near-identical questions can need different answers.
- **Streaming**: show tokens as they arrive. It doesn't reduce total time, but it improves perceived latency.
- **Parallelise** independent calls, and **batch** offline work (nightly enrichment, evals) through batch APIs.

## Reliability

LLM APIs are a remote dependency with rate limits (requests and tokens per minute), occasional overload errors, and long-tail latency.

- **Timeouts** sized to the expected output length, so a streaming response isn't cut off.
- **Retries** with exponential backoff and jitter on 429 and 5xx responses, respecting `retry-after`. Never retry indefinitely in a user-facing path.
- **Fallbacks**: a secondary model or provider, a cached or simpler answer, or **degrade gracefully** so that the product still works without the model.
- **Queue background work** so that a slow model never blocks user requests, and smooth bursts to stay under rate limits.
- **Track tokens and cost per feature and per customer**, with budgets and alerts. A runaway loop or an abusive user shows up first on the bill.

```predict
prompt: A product's "summarise this page" button calls the LLM synchronously inside the page request. One afternoon the provider returns 529 overloaded errors for 20 minutes. What should have happened, ideally?
choices:
  - The whole page fails to load until the provider recovers
  - The page loads normally, and the summary area shows "Summary unavailable, retry", or falls back to a secondary model
  - The app retries every request 50 times in a tight loop
  - Users are logged out
answer: 1
reveal: |
  The LLM should never sit in the critical path of the core page. Load the page, then fetch the summary asynchronously with a timeout. On failure, try a fallback model with bounded, jittered retries, or show a clear "unavailable" state. Tight retry loops make provider overload worse and burn your rate limit. This is the same graceful-degradation rule as for any non-essential dependency.
```

## Self-hosting

Self-hosting open-weight models can cut cost at high, steady volume, keep data in-house, and allow custom fine-tunes, at the price of running GPUs.

- **KV cache**: during decode, attention keys and values for every token so far are kept in GPU memory. Its size grows with batch size × context length, and it often limits concurrency more than the weights do. **PagedAttention** (vLLM) manages it in blocks to avoid fragmentation.
- **Continuous batching**: new requests join the batch between decode steps, instead of waiting for the whole batch to finish. This greatly improves throughput.
- **Quantisation** stores weights in 8 or 4 bits instead of 16, cutting memory and often raising speed, with some quality loss. Measure it on your evals.
- Throughput vs latency: bigger batches mean more tokens per second per GPU, but slower responses for each user.

```questions
- kind: check
  prompt: Which change cuts cost most for a feature whose requests share a 2,500-token system prompt and documents?
  choices:
    - text: Prompt caching of the shared prefix
      correct: true
    - text: Lowering temperature
      why: Temperature doesn't affect cost.
    - text: Streaming
      why: Streaming improves perceived latency, not cost.
  explanation: Cached input tokens are billed at a steep discount.
- kind: check
  prompt: What's a model cascade?
  choices:
    - text: Try a cheap model first, and escalate to a stronger one when confidence or validation fails
      correct: true
    - text: Run several models and average their outputs
      why: That's an ensemble, and costs more.
    - text: Chaining prompts in sequence
      why: That's a prompt chain.
  explanation: Most traffic is served cheaply, and only hard cases pay for the big model.
- kind: check
  prompt: The provider returns 429 Too Many Requests. Right client behaviour?
  choices:
    - text: Back off exponentially with jitter, respect retry-after, and give up after a bounded number of attempts
      correct: true
    - text: Retry immediately in a tight loop
      why: That makes the throttling worse.
    - text: Switch to a larger model
      why: Rate limits aren't solved by model size.
  explanation: Bounded, jittered backoff, plus a fallback for user-facing paths.
- kind: fire
  prompt: What does continuous batching improve in LLM serving?
  choices:
    - text: GPU throughput, by adding new requests to the running batch between decode steps
      correct: true
    - text: Model accuracy
      why: Serving optimisations don't change model quality.
    - text: Prompt caching hit rate
      why: Different mechanism.
  explanation: Requests no longer wait for the slowest sequence in a static batch.
- kind: fire
  prompt: In self-hosted serving, what usually limits concurrency on a GPU besides the weights?
  choices:
    - text: The KV cache, which grows with context length and batch size
      correct: true
    - text: The tokenizer
      why: Tokenisation is cheap.
    - text: Network bandwidth to the client
      why: Rarely the bottleneck.
  explanation: Long contexts × many users means a large KV cache.
- kind: fire
  prompt: You must enrich 2 million product descriptions by next week. Cheapest sensible approach?
  choices:
    - text: Submit them through a batch API at a discount, with a small model if your evals allow it
      correct: true
    - text: Real-time calls from a single thread
      why: Slow, and pays full price.
    - text: The largest model, synchronously
      why: Unnecessary cost for offline work.
  explanation: Offline work tolerates delay, so batch it.
- kind: fire
  prompt: What does 4-bit quantisation of a model's weights trade?
  choices:
    - text: Less memory and often faster inference, for some loss of quality
      correct: true
    - text: Higher quality for more memory
      why: It's the reverse.
    - text: Longer context for less speed
      why: Not directly.
  explanation: Validate the quality loss on your own evals.
```
