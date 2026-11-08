---
id: gpu-onramp
category: inference
skill: inference
title: What a GPU does with your prompt - weights, memory and batching
minutes: 15
summary: This is the on-ramp to the deep-dive, and it assumes nothing. A model is a large file of numbers called weights, and to answer you a GPU must hold them in its own fast memory. Reading your prompt is one big parallel calculation, limited by the GPU's arithmetic. Writing the answer happens one token at a time, and each token means reading every weight again, so it's limited by memory speed. That one fact explains most of what you pay for. Output costs more than input, providers batch many users together to share each read, long conversations eat memory in the KV cache, and smaller number formats (quantisation) make models faster.
objectives:
  - Work out how much GPU memory a model's weights need from its size and number format
  - Explain why reading the prompt is limited by compute and writing the answer by memory bandwidth
  - Explain how batching makes serving cheap, and why output tokens cost more than input
  - Explain what the KV cache is and why long contexts limit how many users fit on a GPU
sources:
  - ['Horace He: Making deep learning go brrrr from first principles', 'https://horace.io/brrr_intro.html']
  - ['Baseten: A guide to LLM inference and performance', 'https://www.baseten.co/blog/llm-transformer-inference-guide/']
  - ['Hugging Face: LLM inference optimisation', 'https://huggingface.co/docs/transformers/llm_optims']
---

## The model is a file of numbers

An LLM is mostly a huge list of numbers, the **weights** or **parameters**, learnt in training. "An 8B model" has about 8 billion of them. Each is stored in a number format, and the format sets how many bytes each takes:

- **FP16 or BF16** (16-bit floating point): 2 bytes per parameter. The usual format for serving at full quality.
- **FP8 or INT8**: 1 byte.
- **INT4** (4-bit): half a byte.

To generate text, the weights must sit in the GPU's own memory (**VRAM**, or **HBM** on data-centre cards), which is far faster than normal RAM. So the first question about any model is: does it fit?

```calc
title: Does it fit?
prompt: A 70B-parameter model is stored in BF16, at 2 bytes per parameter. How many gigabytes do the weights alone take?
answer: 140
unit: GB
tolerance: 1.1
steps: |
  70 billion × 2 bytes = **140 GB**. A top data-centre GPU (an H100) has 80 GB, so this model needs at least two GPUs, before leaving any room for the memory each conversation needs. In 4-bit it would be 35 GB and fit on one. An 8B model in BF16 is 16 GB; in 4-bit it's about 5 GB, which fits a gaming card.
```

## Two limits: arithmetic and memory speed

A GPU has thousands of small cores that do arithmetic in parallel, and very fast memory feeding them. So it has two limits:

- **Compute**: how many calculations per second. An H100 does roughly 1,000 trillion 16-bit operations a second.
- **Memory bandwidth**: how fast it can read from its memory. An H100 reads about 3.35 TB a second. A gaming RTX 3070 reads 448 GB a second.

Whichever runs out first is the **bottleneck**. Work that does lots of arithmetic on each number it reads is **compute-bound**. Work that reads lots of numbers and does a little arithmetic on each is **memory-bound**.

## Reading the prompt vs writing the answer

**Prefill** (reading your prompt): every prompt token passes through every layer, and the GPU can process them all at once. Each weight is read once and used for thousands of tokens, so this is **compute-bound**, and fast per token. It sets the **time to first token**.

**Decode** (writing the answer): the model produces one token, appends it, and runs again for the next one. Each step must read **every weight** to produce **one token** per conversation. Very little arithmetic per byte read, so decode is **memory-bound**.

```calc
title: The speed limit for one user
prompt: An 8B model in BF16 (16 GB of weights) runs on an H100, which reads memory at about 3,350 GB per second. Each decode step must read all the weights. What's the most tokens per second one conversation could get, ignoring everything else?
answer: 209
unit: tokens/s
tolerance: 1.15
steps: |
  3,350 GB/s ÷ 16 GB per token ≈ **209 tokens per second**, as a ceiling. Real systems reach maybe 60 to 80% of it. Notice that arithmetic speed doesn't appear: for one user, decode speed is set by memory bandwidth ÷ model size. That's why smaller models and smaller number formats answer faster.
```

## Batching: why serving is cheap

If one decode step reads all 16 GB of weights to make one token for one user, the GPU's arithmetic sits mostly idle. But the same read can make the next token for **many** conversations at once: load each weight once, use it for 64 users. This is **batching**, and it's the core economics of serving.

- **Throughput** (tokens per second across all users) rises with batch size, nearly in proportion at first.
- **Each user's speed** drops a little as the batch grows, because each step does more work.
- Providers run big batches, which is why a token can cost a fraction of a cent.

This also explains pricing. **Input tokens** are processed in parallel in prefill, so they're cheap. **Output tokens** each need a sequential step that holds a slot in the batch, so they cost several times more. **Batch APIs** are cheaper because the provider can fill quiet GPUs with your work whenever suits them.

```predict
prompt: A GPU serves one user at 80 tokens per second. You raise the batch to 32 users. Roughly what happens?
choices:
  - Each user still gets about 80 tokens per second, so total throughput is 32 times higher
  - Each user gets somewhat less than 80; total throughput is many times higher
  - Each user gets 80 ÷ 32 = 2.5 tokens per second, and total throughput stays flat
  - Throughput falls, because the GPU now has to switch between 32 users each step
answer: 1
reveal: |
  The weights are read once per step whatever the batch size, so 32 users share the cost of that read. Each step does more arithmetic, so it takes a bit longer and each user slows somewhat, but the total goes up many times. Eventually the arithmetic or the memory for conversations runs out, and that sets the useful batch size.
```

## The KV cache: memory per conversation

When the model writes token 500, it needs information about tokens 1 to 499. Recomputing all of that every step would be wasteful, so the server keeps it: two small arrays per token per layer, called **keys** and **values**. This store is the **KV cache**.

It grows with **every token of every conversation** in the batch. For an 8B model it's on the order of 128 KB per token, so an 8,000-token conversation needs about 1 GB. The KV cache, not the weights, usually decides how many users fit on a GPU at once. That's why long contexts cost more than their token count suggests, and why servers work hard to manage this memory (the next lesson).

## Quantisation: fewer bits per number

**Quantisation** stores weights (and sometimes the KV cache) in fewer bits: 8 or 4 instead of 16. It halves or quarters the memory, so bigger models fit, and since decode is memory-bound, it also speeds up decoding. The cost is some loss of quality, small for 8-bit and larger for aggressive 4-bit or below. Measure it on your evals, as with any model change.

```sort
prompt: Mostly limited by compute, or by memory bandwidth?
buckets: [Compute-bound, Memory-bound]
items:
  - {text: 'Processing a 20,000-token prompt', bucket: 0, why: 'Many tokens per weight read: lots of arithmetic.'}
  - {text: 'Generating an answer for a single user', bucket: 1, why: 'Every weight is read to produce one token.'}
  - {text: 'Embedding a million documents in large batches', bucket: 0, why: 'Big batches, parallel tokens: arithmetic dominates.'}
  - {text: 'A chatbot replying to one person at 3 a.m. on a quiet server', bucket: 1, why: 'Batch size of one: pure memory reads.'}
```

```faded
prompt: Fill in the gaps.
text: |
  A model's weights must fit in the GPU's [[memory|cores|disk]]. An 8B model in BF16 needs about [[#16]] GB. Reading the prompt is [[compute|memory]]-bound and sets the time to first token. Writing the answer reads every weight for each token, so it's [[memory|compute]]-bound. Serving many users at once is called [[batching|sharding|caching]], and the per-conversation memory that grows with every token is the [[KV|prompt|weight]] cache.
```

```questions
- kind: check
  prompt: Why are output tokens priced higher than input tokens?
  choices:
    - text: Each is a sequential step that holds a batch slot
      correct: true
    - text: Output tokens are longer words than input tokens
      why: Tokens are the same vocabulary either way.
    - text: Providers store output tokens permanently for training
      why: Pricing reflects compute, not storage.
    - text: Output must be checked by a separate safety model first
      why: Not the main reason, and not universal.
  explanation: Input is processed in parallel; output is one step per token.
- kind: check
  prompt: How much memory do the weights of a 13B model need in 4-bit?
  type: numeric
  answer: 6.5
  unit: GB
  tolerance: 0.1
  explanation: 13 billion × 0.5 bytes = 6.5 GB, before the KV cache and overheads.
- kind: check
  prompt: For a single user, what mostly sets decode speed?
  choices:
    - text: Memory bandwidth divided by model size in bytes
      correct: true
    - text: The GPU's arithmetic speed in operations per second
      why: For one user, arithmetic sits mostly idle.
    - text: The length of the system prompt that was sent
      why: That affects prefill, not each decode step.
  explanation: Each token needs one full read of the weights.
- kind: check
  prompt: What usually limits how many conversations fit on one GPU?
  choices:
    - text: The KV cache, which grows with every token of every conversation
      correct: true
    - text: The number of CUDA cores, since each conversation needs one of its own
      why: Cores are shared by all conversations.
    - text: The model weights, which are copied once for every conversation
      why: The weights are shared by the whole batch.
  explanation: Weights are shared; KV cache is per conversation.
- kind: fire
  prompt: What is prefill?
  choices:
    - text: Processing the whole prompt at once
      correct: true
    - text: Loading weights into GPU memory
      why: That's model loading.
    - text: Filling in the reply from a stored template
      why: Nothing to do with templates.
  explanation: Prefill sets the time to first token.
- kind: fire
  prompt: Why does batching make serving cheaper?
  choices:
    - text: One read of the weights serves many users
      correct: true
    - text: Batched requests can skip the provider's safety filters
      why: No.
    - text: Batched users share one context window
      why: Each keeps its own context.
  explanation: Decode is memory-bound, so sharing the read is nearly free throughput.
- kind: fire
  prompt: What does quantisation trade?
  choices:
    - text: Some quality for less memory and faster decode
      correct: true
    - text: Longer training time in exchange for a larger context window
      why: Unrelated.
    - text: Higher cost for more deterministic output
      why: Unrelated.
  explanation: Fewer bits per weight; measure the quality loss on your evals.
```
