---
id: inference-engines
category: inference
skill: inference
title: Serving engines - batching, the KV cache, and the tricks that make them fast
minutes: 18
summary: Serving engines such as vLLM, SGLang and TensorRT-LLM turn a GPU and a model into an API, and most of their cleverness is about two scarce things, GPU memory and decode steps. Serving is measured with time to first token, time per output token, throughput, and goodput (throughput that meets the latency target). Continuous batching keeps the GPU full. PagedAttention stores the KV cache in blocks, as an operating system stores memory in pages. Prefix caching reuses work on shared prompts. Chunked prefill and splitting prefill from decode protect latency. Speculative decoding makes several tokens per expensive step. Quantisation and splitting a model across GPUs make big models fit. Sizing is arithmetic you can do on a whiteboard.
objectives:
  - Define TTFT, TPOT, throughput and goodput, and estimate end-to-end latency from them
  - Explain continuous batching, PagedAttention, prefix caching and chunked prefill
  - Explain speculative decoding, quantisation formats, and tensor vs pipeline parallelism
  - Size the KV cache and estimate how many concurrent requests a deployment can hold
sources:
  - ['Kwon et al.: Efficient Memory Management for LLM Serving with PagedAttention (vLLM)', 'https://arxiv.org/abs/2309.06180']
  - ['Yu et al.: Orca, iteration-level scheduling for generative models', 'https://www.usenix.org/conference/osdi22/presentation/yu']
  - ['Leviathan et al.: Fast Inference from Transformers via Speculative Decoding', 'https://arxiv.org/abs/2211.17192']
  - ['Zhong et al.: DistServe, disaggregating prefill and decoding', 'https://arxiv.org/abs/2401.09670']
  - ['vLLM documentation', 'https://docs.vllm.ai/']
---

## The numbers engines are judged by

- **TTFT** (time to first token): queueing plus prefill. What a chat user feels first.
- **TPOT** (time per output token), also called **ITL** (inter-token latency): the gap between streamed tokens after the first. 30 to 50 ms feels like fast reading.
- **End-to-end latency** ≈ TTFT + TPOT × (output tokens − 1).
- **Throughput**: tokens per second per GPU, across all requests. What sets the cost per token.
- **Goodput**: throughput counting only requests that met the latency targets. Cranking the batch size up raises throughput but can wreck goodput.

```calc
title: End-to-end latency
prompt: A deployment has a TTFT of 400 ms and a TPOT of 40 ms. A request generates 301 tokens. Roughly how long until the last token arrives, in seconds?
answer: 12.4
unit: s
tolerance: 1.05
steps: |
  0.4 + 0.040 × (301 − 1) = 0.4 + 12 = **12.4 s**. Nearly all of it is decode. The levers are fewer output tokens, a smaller or quantised model, speculative decoding, or a smaller batch (lower TPOT at the cost of throughput).
```

## Continuous batching

The naive approach, **static batching**, collects a batch, runs it until every request finishes, then starts the next. Short requests sit idle waiting for long ones, and new arrivals wait for the whole batch.

**Continuous batching** (iteration-level scheduling, from the Orca paper) reschedules **every decode step**: finished requests leave, and waiting ones join. The GPU stays full, and short requests aren't held hostage by long ones. Every modern engine does this, and it's the biggest single throughput win over a naive server.

## PagedAttention: the KV cache in pages

The KV cache for each request grows by one entry per token, and you don't know in advance how long the answer will be. Early servers reserved a contiguous chunk for the maximum length per request, wasting most of it. **PagedAttention** (the idea behind vLLM) stores the cache in small fixed-size **blocks** with a table mapping each request to its blocks, just as an operating system maps virtual memory to pages. Waste drops to a few percent, so far more requests fit, and requests can **share** blocks for an identical prefix.

When memory runs out mid-generation, the engine **preempts** a request: it frees that request's blocks and recomputes or swaps them later. Frequent preemption is a sign the batch is too big for the memory.

## Prefix caching and chunked prefill

- **Prefix caching**: if many requests start with the same tokens (a system prompt, few-shot examples, a shared document), keep their KV blocks and skip prefill for that part. This is the server-side mechanism behind providers' prompt caching discounts. SGLang's RadixAttention organises cached prefixes as a tree. To benefit, **route requests that share a prefix to the same replica**.
- **Chunked prefill**: a 30,000-token prompt arriving mid-stream would freeze every other user's decode while it's processed. The engine splits long prefills into chunks and mixes them with decode steps, so TPOT stays smooth.
- **Disaggregated prefill and decode**: some large deployments run prefill and decode on **separate GPU pools**, since one is compute-bound and the other memory-bound, and transfer the KV cache between them. Each pool can be sized and tuned for its own job.

```sort
prompt: Which technique fixes each problem?
buckets: [Continuous batching, PagedAttention, Prefix caching, Chunked prefill]
items:
  - {text: 'Short requests wait for the longest one in their batch to finish', bucket: 0, why: 'Rescheduling every step lets them leave as soon as they are done.'}
  - {text: 'Memory is reserved for the maximum length, and most of it sits empty', bucket: 1, why: 'Blocks are allocated as tokens arrive.'}
  - {text: 'Every request repeats the same 3,000-token system prompt', bucket: 2, why: 'Reuse the cached KV blocks for the shared prefix.'}
  - {text: 'Streaming stutters whenever a huge document is submitted', bucket: 3, why: 'Split the long prefill so decodes keep running.'}
```

## Speculative decoding

Decode is memory-bound: each step reads all the weights for one token per request. **Speculative decoding** uses that idle arithmetic. A small, fast **draft** model (or extra prediction heads, as in Medusa and EAGLE) guesses the next few tokens. The big model then checks all of them in **one** forward pass, which costs about the same as producing one token. It keeps the guesses up to the first wrong one, plus its own correct token there.

The output is **the same as the big model alone would produce** (the acceptance rule preserves its distribution). The speed-up depends on the **acceptance rate**: predictable text such as code, JSON or quoting the context gets 2 to 3 times faster, and creative text gains less. It helps most at small batch sizes, where the GPU has spare arithmetic.

```predict
prompt: A team enables speculative decoding on a server that already runs at very large batch sizes for an offline job. What's the likely effect?
choices:
  - A large speed-up, since speculative decoding always makes decoding about three times faster
  - Little gain or even a slowdown, since big batches leave little spare arithmetic
  - Lower-quality output, since the small draft model now writes some of the tokens
  - No change at all, since speculative decoding only applies to streamed responses
answer: 1
reveal: |
  Speculative decoding spends spare compute to save memory-bound steps. At large batch sizes the GPU is already busy doing arithmetic for many requests, so checking extra draft tokens competes for that compute, and drafts add their own cost. It shines for latency-sensitive serving at small or moderate batch sizes. Output quality is unchanged either way, because the big model verifies every token.
```

## Making big models fit

- **Quantisation formats**: **FP8** (native on recent data-centre GPUs, usually near-lossless), **INT8**, and 4-bit **weight-only** schemes such as AWQ and GPTQ. **GGUF** is llama.cpp's file format, with quantisation levels like Q4_K_M. The KV cache can be quantised too, which buys concurrency.
- **Tensor parallelism (TP)**: split every layer's matrices across GPUs, which must exchange results at every layer. That needs fast links (NVLink) inside one machine. It cuts per-token latency and pools memory.
- **Pipeline parallelism (PP)**: put different layers on different GPUs or machines, and pass activations along. Less communication, so it works across machines, but adds latency per token.
- **Data parallelism**: independent replicas behind a load balancer. The way to scale throughput once one replica fits.
- **Mixture-of-experts** models activate only a few experts per token, so they compute like a small model but must still hold every expert in memory. They're often spread with **expert parallelism**.

## Sizing the KV cache

Per token, the KV cache stores a key and a value for every layer and every KV head:

`bytes per token = 2 × layers × KV heads × head dimension × bytes per number`

Llama 3 70B has 80 layers, 8 KV heads (grouped-query attention shares them between query heads) and a head dimension of 128. In 16-bit: 2 × 80 × 8 × 128 × 2 = **327,680 bytes, about 320 KB per token**.

```calc
title: How many requests fit?
prompt: Llama 3 70B in FP8 runs on two 80 GB GPUs with tensor parallelism. The weights take 70 GB, and runtime overhead takes 10 GB, leaving 80 GB (80,000,000,000 bytes) for the KV cache. At 327,680 bytes per token, how many requests of 4,096 tokens each can be in flight at once?
answer: 60
unit: requests
tolerance: 1.1
steps: |
  One request: 327,680 × 4,096 ≈ 1.34 GB. 80 GB ÷ 1.34 GB ≈ **60 concurrent requests**. Halve the context and you double it. Quantise the KV cache to FP8 and you double it again. This, not the weights, is usually what caps concurrency, which is why long-context traffic costs more per request than its token count suggests.
```

## The engines

- **vLLM**: the most widely used open-source engine, created PagedAttention, with broad model and hardware support and an OpenAI-compatible server.
- **SGLang**: strong prefix caching (RadixAttention) and fast structured output, popular for agent and multi-call workloads.
- **TensorRT-LLM** (NVIDIA): compiled, highly optimised kernels for NVIDIA GPUs, more set-up work.
- **llama.cpp** and **Ollama**: run GGUF models on laptops, desktops and CPUs. The lab lesson uses these on your own GPU.

All of them export metrics such as running and waiting requests, KV cache usage and token throughput, which are what you autoscale and alert on.

```recall
prompt: An interviewer asks, "Users say our self-hosted chat model is slow. How would you investigate?" Answer in under a minute.
points:
  - Separate TTFT from TPOT, and check queueing time, since each has different causes
  - High TTFT points to queueing, long prompts or prefill blocking; fixes include more replicas, prefix caching, chunked prefill
  - High TPOT points to batch size, model size or memory pressure and preemption; fixes include smaller batches, quantisation, speculative decoding, tensor parallelism
  - Look at engine metrics (waiting requests, KV cache usage, preemptions) and measure goodput against the latency target, not just throughput
model: |
  First I'd split "slow" into time to first token and time per output token, from the engine's metrics or our traces, because they have different causes. If TTFT is high, I'd check queue time first: requests waiting for a slot means we need more replicas or a smaller maximum context. If it's prefill itself, prefix caching for the shared system prompt and chunked prefill help, especially if long documents are stalling everyone. If TPOT is high, the batch may be too large, or the KV cache may be full and requests are being preempted, which shows in the cache usage and preemption counters. Fixes there are capping concurrency, quantising the weights or KV cache, tensor parallelism across more GPUs, or speculative decoding if batches are small. Throughout, I'd measure goodput, the share of traffic within the latency target, rather than raw throughput.
```

```questions
- kind: check
  prompt: What does goodput measure that throughput doesn't?
  choices:
    - text: Only the tokens from requests that met the latency targets
      correct: true
    - text: Only the tokens that end users rated as good quality
      why: It's about latency targets, not quality ratings.
    - text: Only the tokens whose prompts were served from the prefix cache
      why: That's the cache hit rate.
    - text: Only the output tokens, leaving out the prompt tokens
      why: That's output throughput.
  explanation: A bigger batch can raise throughput while more requests miss their targets.
- kind: check
  prompt: Why does PagedAttention let more requests fit on a GPU?
  choices:
    - text: Cache memory is allocated in small blocks as tokens arrive
      correct: true
    - text: It compresses the model weights into a 4-bit format to free space
      why: That's quantisation.
    - text: It moves the KV cache from GPU memory onto the CPU
      why: Swapping is a fallback under pressure, not the main idea.
  explanation: No more reserving space for the longest possible answer.
- kind: check
  prompt: Does speculative decoding change what the big model outputs?
  choices:
    - text: No; the big model verifies every token it keeps
      correct: true
    - text: Yes; the draft model writes some tokens, so quality drops a little
      why: Draft tokens are kept only when the big model agrees.
    - text: Yes; it raises the temperature so that more of the guesses get accepted
      why: Sampling settings are unchanged.
  explanation: It's a pure speed optimisation.
- kind: check
  prompt: Per token, how big is the 16-bit KV cache of a model with 32 layers, 8 KV heads and head dimension 128, in KB (1 KB = 1,024 bytes)?
  type: numeric
  answer: 128
  unit: KB
  tolerance: 0.05
  explanation: 2 × 32 × 8 × 128 × 2 bytes = 131,072 bytes = 128 KB. That's Llama 3 8B.
- kind: fire
  prompt: What's tensor parallelism?
  choices:
    - text: Splitting each layer's matrices across GPUs
      correct: true
    - text: Running separate copies of the model per GPU
      why: That's data parallelism.
    - text: Putting different layers on different GPUs
      why: That's pipeline parallelism.
  explanation: It needs fast links, because GPUs exchange results at every layer.
- kind: fire
  prompt: Why route requests sharing a system prompt to the same replica?
  choices:
    - text: So they hit that replica's prefix cache
      correct: true
    - text: So the replica can merge them into one combined request
      why: They stay separate requests.
    - text: So rate limits apply per prompt
      why: Rate limits are per client.
  explanation: Prefix-aware routing turns repeated prompts into skipped prefill.
- kind: fire
  prompt: What does chunked prefill protect?
  choices:
    - text: Other users' streaming speed during long prompts
      correct: true
    - text: The accuracy of the answers given to very long prompts
      why: It's a scheduling change, not a quality one.
    - text: The model weights from being preempted
      why: Weights aren't preempted.
  explanation: Long prefills are interleaved with decode steps.
- kind: fire
  prompt: What's continuous batching?
  choices:
    - text: Rescheduling the batch at every decode step
      correct: true
    - text: Collecting requests for a minute before running them
      why: That's static batching with a window.
    - text: Sending batches to a cheaper offline API
      why: That's a batch API.
  explanation: Finished requests leave and new ones join step by step.
```
