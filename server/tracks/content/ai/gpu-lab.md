---
id: gpu-lab
category: inference
skill: inference
title: 'Lab: serve a model on your own GPU and measure it'
minutes: 60
summary: 'An hour on your own hardware turns the last two lessons from facts into experience, and gives you an honest answer to "have you ever served a model yourself?" On an 8 GB RTX 3070 (or an M-series Mac), you predict the speed limit from memory bandwidth, then measure prefill and decode speed with llama.cpp or Ollama. You watch a model that doesn''t fit fall off a cliff, see the KV cache eat memory as the context grows, and see throughput rise while each user slows as concurrency goes up. Write the numbers down: they''re the interview story.'
objectives:
  - Predict a model's decode ceiling on your GPU from memory bandwidth and file size, then measure it
  - Measure prefill and decode speed separately, and see how prompt length affects time to first token
  - Observe what happens when weights or the KV cache don't fit in GPU memory
  - Measure throughput against per-user speed as concurrency rises, and tell it as a story
sources:
  - ['llama.cpp: llama-bench and llama-server', 'https://github.com/ggml-org/llama.cpp']
  - ['Ollama documentation', 'https://github.com/ollama/ollama/tree/main/docs']
  - ['vLLM: installation (Linux, or WSL2 on Windows)', 'https://docs.vllm.ai/en/latest/getting_started/installation/']
---

## Set-up (about 10 minutes)

This lab runs on your machine, not in the browser. Do the steps, then answer the activities here with your own numbers.

- **Windows with the RTX 3070**: install a recent NVIDIA driver, then **Ollama** (a Windows installer) or a prebuilt **llama.cpp** release with CUDA. `nvidia-smi` in a terminal shows the GPU and its memory.
- **M2 MacBook Air**: install Ollama or llama.cpp (`brew install llama.cpp`). It uses the GPU through Metal, and memory is shared with the system, so close big apps first.
- **Optional, for the concurrency step with vLLM**: vLLM needs Linux, which on Windows means WSL2 with the CUDA driver for WSL. Skip it if you'd rather: llama.cpp's server covers the same idea.

Download an 8B model at two quantisation levels, for example a GGUF of Llama 3.1 8B Instruct in **Q4_K_M** (about 4.9 GB) and **Q8_0** (about 8.5 GB). With Ollama: `ollama pull llama3.1:8b` gets the 4-bit build, and `ollama pull llama3.1:8b-instruct-q8_0` the 8-bit one.

Keep a notes file with a row per experiment: model, quantisation, context, concurrency, prompt tokens per second, generation tokens per second, GPU memory used.

## Step 1: predict, then measure decode

Before running anything, work out the ceiling.

```calc
title: Your card's speed limit
prompt: An RTX 3070 reads memory at 448 GB/s. The Q4_K_M file of an 8B model is about 4.9 GB, and each decode step reads roughly all of it. What's the decode ceiling for a single user, in tokens per second?
answer: 91
unit: tokens/s
tolerance: 1.1
steps: |
  448 ÷ 4.9 ≈ **91 tokens per second** as a ceiling. Expect to measure 60 to 75% of it. On an M2 Air, the unified memory reads at about 100 GB/s, so the ceiling is about 20 tokens per second: the same model, a quarter of the speed, purely from bandwidth.
```

Now measure. With llama.cpp: `llama-bench -m llama-3.1-8b-q4_k_m.gguf -ngl 99` prints **pp512** (prompt processing, tokens per second on a 512-token prompt) and **tg128** (text generation, tokens per second over 128 tokens). `-ngl 99` puts every layer on the GPU. With Ollama: `ollama run llama3.1:8b --verbose`, ask something, and read **prompt eval rate** and **eval rate** at the end.

Compare tg128 or eval rate with your prediction. Then look at pp512: it should be many times higher than decode, because prefill is compute-bound and processes tokens in parallel.

## Step 2: prompt length and time to first token

Run the same question twice: once on its own, and once after pasting in a long document (a few thousand words). Note the prompt evaluation time in each case. Time to first token grows with the prompt. Decode speed barely changes at first, then dips slightly as each step attends over more tokens.

## Step 3: the model that doesn't fit

```predict
prompt: The Q8_0 file is about 8.5 GB and your card has 8 GB, part of which Windows and the display already use. When you run it with every layer requested on the GPU, what do you expect?
choices:
  - About half the Q4 speed, because the file is roughly twice the size
  - It loads with some layers on the CPU, and decode drops to a fraction of Q4
  - Exactly the same speed, because 8-bit numbers are simpler to compute
  - It refuses to start, since GPU memory can never be shared with the CPU
answer: 1
reveal: |
  Ollama and llama.cpp offload the layers that don't fit to the CPU, whose memory is many times slower (dual-channel DDR4 is about 50 GB/s against the GPU's 448). Every decode step now waits on the slowest part, so the speed falls off a cliff, often to a few tokens per second. Fitting in GPU memory isn't a nicety, it's the whole game, which is why 4-bit quantisation is so popular on consumer cards. (If it fits on your Mac's unified memory, you'll see roughly the halving the first option predicts.)
```

Run it and record what you get. In Ollama, `ollama ps` shows how much of the model is on the GPU versus the CPU.

## Step 4: the KV cache eats memory

Back on the Q4 model, watch GPU memory with `nvidia-smi -l 1` in another terminal (on the Mac, Activity Monitor's memory tab). Start the model with a small context, then a large one. With llama.cpp's server, `-c 2048` and then `-c 32768`. In Ollama, `/set parameter num_ctx 32768` inside a session. Memory used jumps with the context size even before you type anything, because the server reserves KV cache for it. Push the context higher until it no longer fits and layers move to the CPU.

## Step 5: concurrency (optional, 15 minutes)

Start `llama-server -m llama-3.1-8b-q4_k_m.gguf -ngl 99 -c 16384 --parallel 4`, which splits the context into four slots. Send one request, then four at once (a small script that fires four HTTP requests, or four terminals). Record each request's tokens per second, and the total.

With vLLM in WSL2, use a small model that fits in 8 GB, such as a 3B instruct model, and its serving benchmark (`vllm bench serve`) at several request rates.

You should see total throughput rise well above the single-user figure while each user's speed drops. That's batching, measured on your own desk.

```order
prompt: Order what you saw from fastest to slowest decode, for one user.
items:
  - Q4 model, fully on the GPU, short context
  - Q4 model, fully on the GPU, very long prompt
  - Q4 model, one of four users decoding at once
  - Q8 model, partly offloaded to the CPU
explain: Bandwidth sets the order. A long context adds attention work per step, sharing the GPU with three others slows each user, and offloading to slow CPU memory is a cliff. If your numbers disagree, look for why, such as other apps using the GPU, or thermal throttling on the laptop.
```

## Tell it as a story

```recall
prompt: Tell an interviewer about serving a model yourself, using your own numbers, in under a minute.
points:
  - What you ran and on what (the model, quantisation, GPU and its memory bandwidth)
  - Your prediction from bandwidth ÷ model size, and the measured decode and prefill speeds
  - What broke the model's speed (offloading when it didn't fit, the KV cache growing with context)
  - Batching: throughput rose with concurrency while each user's speed fell, and what that means for serving costs
model: |
  I served Llama 3.1 8B on my RTX 3070, which has 8 GB at 448 GB/s. I predicted decode from bandwidth divided by model size: about 90 tokens per second for the 4.9 GB 4-bit build. I measured [your figure], and prefill ran at [your figure], many times faster, because it's compute-bound. The 8-bit build didn't fit, layers spilled to the CPU, and decode collapsed to [your figure], which made it obvious why quantisation matters on small cards. Raising the context to 32k reserved [your figure] GB of KV cache before I'd typed anything. With four parallel requests, total throughput rose to [your figure] while each user dropped to [your figure], which is batching, and it's why providers can sell tokens so cheaply.
```

```questions
- kind: check
  prompt: In llama-bench output, what are pp512 and tg128?
  choices:
    - text: Prompt processing and text generation speeds
      correct: true
    - text: Peak power and the GPU temperature limit
      why: llama-bench measures tokens per second.
    - text: The parameter count and the context size that were used
      why: Those are inputs, not results.
  explanation: pp is prefill speed; tg is decode speed.
- kind: check
  prompt: Why does a model that spills a few layers to the CPU slow down so much?
  choices:
    - text: Every decode step waits on the much slower CPU memory
      correct: true
    - text: The CPU has to run a different, slower version of the model
      why: It runs the same layers, just from slower memory.
    - text: The GPU switches off whenever any part of a model is offloaded
      why: The GPU keeps running its layers.
  explanation: A step is only as fast as its slowest part.
- kind: check
  prompt: Your M2 Air's memory reads at about 100 GB/s. Roughly what's its decode ceiling for a 4.9 GB model, in tokens per second?
  type: numeric
  answer: 20
  unit: tokens/s
  tolerance: 0.15
  explanation: 100 ÷ 4.9 ≈ 20 tokens per second.
- kind: fire
  prompt: Why does GPU memory jump when you raise the context size?
  choices:
    - text: The server reserves KV cache for it
      correct: true
    - text: The weights are reloaded at higher precision
      why: Weights don't change with context.
    - text: A larger model is downloaded automatically
      why: The model file is the same.
  explanation: KV cache memory grows with the context the server allows.
- kind: fire
  prompt: With four requests at once, what happens to total throughput?
  choices:
    - text: It rises, while each user slows
      correct: true
    - text: It falls to a quarter of one user's
      why: Batching shares the weight reads.
    - text: It stays exactly the same
      why: The reads are shared, so totals rise.
  explanation: That's batching.
- kind: fire
  prompt: What does -ngl 99 do in llama.cpp?
  choices:
    - text: Puts every layer on the GPU
      correct: true
    - text: Limits generation to 99 tokens
      why: That's -n.
    - text: Sets the context to 99k tokens
      why: That's -c.
  explanation: Number of GPU layers; 99 means all of them for most models.
```
