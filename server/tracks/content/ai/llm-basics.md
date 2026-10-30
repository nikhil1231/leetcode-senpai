---
id: llm-basics
category: models
skill: models
title: How LLMs behave - tokens, context and sampling
minutes: 14
summary: An LLM predicts the next token over and over, conditioned on everything in its context window. Most practical behaviour follows from that. Cost and latency scale with tokens. Long contexts are expensive and unevenly attended. Sampling settings trade determinism for diversity. The model knows nothing after its training cutoff, and nothing about your data unless you put it in the prompt. Interviewers check that you reason from these mechanics, not from magic.
objectives:
  - Explain tokens, and estimate cost and latency from token counts
  - Explain prefill vs decode, and why output tokens dominate latency
  - Explain temperature and top-p, and when to use each
  - Explain hallucination as a consequence of next-token prediction, and what reduces it
sources:
  - ['Anthropic docs: Models overview and context windows', 'https://docs.anthropic.com/en/docs/about-claude/models']
  - ['Karpathy: Intro to Large Language Models (talk)', 'https://www.youtube.com/watch?v=zjkBMFhNj_g']
  - ['Holtzman et al.: The Curious Case of Neural Text Degeneration (nucleus sampling)', 'https://arxiv.org/abs/1904.09751']
---

## Tokens

Models read and write **tokens**: sub-word pieces from a fixed vocabulary. A rough rule for English is **about 4 characters or 0.75 words per token**. Code, non-English text and unusual strings (UUIDs, base64) use far more tokens per character. Everything is metered in tokens: the context limit, price (input and output priced separately, output usually several times more), rate limits and latency.

## Prefill and decode

A request runs in two phases:

- **Prefill**: the whole prompt is processed in parallel to build the attention cache. It's fast per token, and it's what determines **time to first token**.
- **Decode**: output is generated **one token at a time**, each step attending over everything before it. It's slow per token and sequential.

So latency is roughly `TTFT + output_tokens / tokens_per_second`. **Output length is usually the biggest latency lever**: asking for a 50-token JSON answer instead of a 600-token essay can be a 10× speed-up. **Prompt caching** reuses the prefill for a repeated prefix (a long system prompt, or few-shot examples), cutting both cost and TTFT for the cached part.

```calc
title: How long will this call take?
prompt: A request has a 6,000-token prompt and generates 400 tokens. Time to first token is 0.5 s, and decode runs at 80 tokens per second. Roughly how many seconds does the whole response take?
answer: 5.5
unit: s
tolerance: 0.05
steps: |
  Total ≈ TTFT + output / decode speed = 0.5 + 400 / 80 = 0.5 + 5 = **5.5 s**. The 6,000-token prompt only affects the 0.5 s of prefill. The 400 output tokens cost ten times as much time. Streaming makes it *feel* faster, because the first words appear at 0.5 s. If you need it actually faster, cap the output, ask for a terser format, or use a smaller model.
```

## Context windows

The **context window** is the maximum number of tokens (prompt plus output) the model can attend to in one call. Nothing persists between calls: "memory" in chat apps means resending history, summarising it, or retrieving it. Long contexts cost more, add latency, and models use them unevenly. Information buried in the middle of a long context can be used less reliably than material at the start or end. Put instructions and the most relevant material where they'll be noticed, and retrieve rather than dumping everything in.

## Sampling

At each step the model outputs a probability distribution over the vocabulary, and sampling picks one token:

- **Temperature** rescales the distribution. Near **0** it's almost always the most likely token (more deterministic, good for extraction, classification and code). Higher values flatten it (more varied, good for brainstorming).
- **Top-p (nucleus)** samples only from the smallest set of tokens whose probabilities add up to p. **Top-k** keeps the k most likely tokens.
- Even at temperature 0, outputs aren't guaranteed identical across calls: batching and floating-point differences on the server cause small variations. Don't build correctness on bit-exact reproducibility.

```sort
prompt: Low temperature or higher temperature?
buckets: [Low (around 0), Higher (around 0.7 to 1)]
items:
  - {text: 'Extract invoice fields into JSON', bucket: 0, why: 'You want the single most likely, consistent answer.'}
  - {text: 'Generate 10 different taglines for a product', bucket: 1, why: 'Diversity is the point.'}
  - {text: 'Classify support tickets into 8 categories', bucket: 0, why: 'Classification wants consistency.'}
  - {text: 'Write varied synthetic user questions for an eval set', bucket: 1, why: 'Low temperature would produce near-duplicates.'}
  - {text: 'Generate a SQL query from a question', bucket: 0, why: 'Code generation benefits from determinism; sample several only if you can verify them.'}
```

## Why models hallucinate

The model is trained to produce *plausible continuations*, not to check facts. When the answer isn't well represented in its weights or context, a fluent but wrong continuation is still likely. What reduces it: **grounding** (put the source material in context, and require citations to it), allowing and rewarding "I don't know", narrower tasks, structured outputs validated in code, verification steps (a checker model or deterministic checks), and evals that measure it. Fine-tuning teaches format and style much more than it adds reliable facts.

```questions
- kind: check
  prompt: A chat feature feels slow. Responses average 900 output tokens and time to first token is 400 ms. What's the biggest lever?
  choices:
    - text: Reduce output length, for example a terser format or a token cap
      correct: true
    - text: Shorten the system prompt by 200 tokens
      why: Prompt tokens mainly affect prefill, which is already fast here.
    - text: Raise the temperature
      why: Temperature doesn't change speed.
    - text: Use a larger model
      why: Larger models usually decode more slowly.
  explanation: Decode is sequential, so output tokens dominate total latency.
- kind: check
  prompt: Roughly how many tokens is 3,000 words of English prose?
  type: numeric
  answer: 4000
  unit: tokens
  tolerance: 0.2
  explanation: At about 0.75 words per token, 3,000 words is about 4,000 tokens.
- kind: check
  prompt: What does temperature 0 give you?
  choices:
    - text: Near-greedy decoding that's highly consistent, though not guaranteed bit-identical across calls
      correct: true
    - text: Guaranteed identical output for identical input
      why: Server-side batching and numerics can still vary.
    - text: Faster responses
      why: Sampling settings don't change speed meaningfully.
  explanation: Use it for extraction and classification, but don't rely on exact reproducibility.
- kind: fire
  prompt: What does prompt caching reduce?
  choices:
    - text: Cost and time to first token for a repeated prompt prefix
      correct: true
    - text: Output token cost
      why: Caching applies to input prefixes.
    - text: Hallucinations
      why: It's an efficiency feature, not a quality one.
  explanation: Put stable content (system prompt, documents, examples) first so the prefix can be cached.
- kind: fire
  prompt: Why does a chatbot "remember" earlier messages?
  choices:
    - text: The application resends the conversation (or a summary) in each request's context
      correct: true
    - text: The model updates its weights during the chat
      why: Weights are fixed at inference time.
    - text: The provider stores a hidden memory per user inside the model
      why: Any memory is application-level context.
  explanation: Calls are stateless; continuity is the application's job.
- kind: fire
  prompt: Which approach most directly reduces hallucinated facts about your company's policies?
  choices:
    - text: Retrieve the relevant policy text into the prompt and require answers to cite it
      correct: true
    - text: Raise the temperature
      why: That increases variation, not accuracy.
    - text: Fine-tune on general web data
      why: That doesn't teach your policies.
  explanation: Grounding with citations makes answers checkable.
- kind: fire
  prompt: Which content is usually the most expensive per token?
  choices:
    - text: Output tokens
      correct: true
    - text: Cached input tokens
      why: Cached input is usually the cheapest.
    - text: System prompt tokens
      why: They're billed as ordinary input.
  explanation: Output tokens are priced several times higher than input on most APIs.
```
