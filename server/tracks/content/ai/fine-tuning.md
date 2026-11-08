---
id: fine-tuning
category: platform
skill: platform
title: Fine-tuning - LoRA, preference tuning, and the GPUs behind it
minutes: 16
summary: 'Fine-tuning carries on training a model on your own examples to change how it behaves: format, tone, a narrow skill, or a big model''s habits copied into a small one. Full fine-tuning updates every weight and needs about 16 bytes of GPU memory per parameter. LoRA freezes the model and trains small adapter matrices, under 1% of the parameters, and QLoRA does that on a 4-bit base so it fits on one GPU. Supervised fine-tuning learns from input and output pairs, and preference tuning (DPO, RLHF) learns from better and worse answers. Training at scale spreads work across GPUs with data parallelism and sharding (FSDP, ZeRO), with regular checkpoints. Many LoRA adapters can be served on one shared base model. Evaluate against the base model, including on what you didn''t train for.'
objectives:
  - Choose between supervised fine-tuning, preference tuning and distillation for a goal
  - Explain LoRA and QLoRA, and estimate the memory full fine-tuning needs
  - Explain data parallelism, sharding (FSDP and ZeRO) and checkpointing in plain terms
  - Serve fine-tuned adapters efficiently, and evaluate a fine-tune for gains and regressions
sources:
  - ['Hu et al.: LoRA, Low-Rank Adaptation of Large Language Models', 'https://arxiv.org/abs/2106.09685']
  - ['Dettmers et al.: QLoRA, Efficient Finetuning of Quantized LLMs', 'https://arxiv.org/abs/2305.14314']
  - ['Rafailov et al.: Direct Preference Optimization', 'https://arxiv.org/abs/2305.18290']
  - ['PyTorch: Getting started with Fully Sharded Data Parallel', 'https://pytorch.org/tutorials/intermediate/FSDP_tutorial.html']
  - ['Hugging Face: PEFT documentation', 'https://huggingface.co/docs/peft']
---

## What fine-tuning is for

The choosing-models lesson put fine-tuning on the ladder after prompting, examples and retrieval. When you do climb to it, pick the kind that matches the goal:

- **Supervised fine-tuning (SFT)**: train on pairs of input and ideal output. Teaches a format, a style, a narrow task, or a domain's way of writing. Hundreds to a few thousand **high-quality** examples often do it. A thousand sloppy ones do harm.
- **Distillation**: SFT where the ideal outputs come from a large model, so a small model learns to do one job nearly as well, much cheaper and faster.
- **Preference tuning**: train on pairs of a better and a worse answer to the same input. **RLHF** trains a reward model from those preferences and optimises against it. **DPO** skips the reward model and learns from the pairs directly, which is simpler and now common.
- **Reinforcement fine-tuning** with verifiable rewards: when correctness can be checked by code (tests pass, the maths answer matches), the model can be trained on its own attempts, scored automatically.

None of these reliably add **facts** the model can cite and keep fresh. That's retrieval's job.

## Full fine-tuning and its memory bill

Training needs far more memory than serving. With the usual mixed-precision setup and the Adam optimiser, each parameter needs about **16 bytes**: 2 for the 16-bit weight, 2 for its gradient, and 12 for the optimiser's state (a 32-bit master copy of the weight and two running averages). Plus memory for activations, which grows with batch size and sequence length.

```calc
title: The memory to fully fine-tune
prompt: Full fine-tuning needs about 16 bytes per parameter before activations. How many GB is that for an 8B model?
answer: 128
unit: GB
tolerance: 1.05
steps: |
  8 billion × 16 bytes = **128 GB**, more than one 80 GB GPU, before activations. Serving the same model in BF16 needs 16 GB. That gap is why full fine-tuning means multiple GPUs and sharding, and why LoRA exists.
```

## LoRA and QLoRA

**LoRA** (low-rank adaptation) freezes the original weights. Next to some of the big weight matrices (usually in attention and the feed-forward layers), it adds two thin matrices, A and B, whose product is a low-**rank** update. Only A and B are trained.

```calc
title: How small is an adapter?
prompt: A weight matrix is 4,096 × 4,096. A LoRA adapter of rank 16 adds matrices of 4,096 × 16 and 16 × 4,096. What percentage of the original matrix's parameter count is that?
answer: 0.78
unit: '%'
tolerance: 1.05
steps: |
  Original: 4,096² ≈ 16.8 million. Adapter: 2 × 4,096 × 16 = 131,072. That's 131,072 ÷ 16,777,216 ≈ **0.78%**. Gradients and optimiser state are needed only for the adapter, so training memory is dominated by the frozen weights, which need no optimiser state at all. The adapter file is megabytes, not gigabytes.
```

**QLoRA** goes further: it keeps the frozen base model in **4-bit**, and trains LoRA adapters on top in 16-bit. A 7 or 8B model can be fine-tuned on a single 24 GB consumer GPU, and the QLoRA paper fine-tuned a 65B model on one 48 GB card. Quality is usually close to LoRA on a 16-bit base. **Rank** is the main knob: higher ranks can learn more, cost more, and overfit small datasets more easily. 8 to 64 is typical.

## Training across many GPUs

When a job needs more than one GPU:

- **Data parallelism**: every GPU holds a full copy of the model and trains on a different slice of each batch. After each step, the GPUs average their gradients (an **all-reduce**) so the copies stay identical. Simple, but each GPU must fit the whole model and optimiser state.
- **Sharding (FSDP in PyTorch, ZeRO in DeepSpeed)**: split the weights, gradients and optimiser state across the GPUs, and gather each layer's pieces only while it's being computed. Memory per GPU drops roughly in proportion to the number of GPUs, at the cost of more communication.
- **Tensor and pipeline parallelism**, from the serving lesson, are added for the largest models.
- **Checkpointing**: save the model and optimiser state regularly (every N steps) to durable storage, so a failed GPU or a preempted node costs minutes, not the run. On big clusters, hardware failures during a multi-day run are expected, not exceptional.
- **Gradient checkpointing** (a different thing, despite the name) saves memory by recomputing some activations in the backward pass instead of storing them.

```sort
prompt: Which technique answers each problem?
buckets: [Data parallelism, Sharding (FSDP or ZeRO), Checkpointing, LoRA]
items:
  - {text: 'Training takes too long on one GPU, and the model fits on each card', bucket: 0, why: 'Copies on every GPU, each on part of the batch.'}
  - {text: 'The optimiser state is too big for any single GPU', bucket: 1, why: 'Split it across the GPUs.'}
  - {text: 'A spot instance was reclaimed on day 3 of a 4-day run', bucket: 2, why: 'Resume from the last saved state.'}
  - {text: 'You have one 24 GB card and want to adapt an 8B model', bucket: 3, why: 'Train small adapters on a frozen (even 4-bit) base.'}
```

## Serving fine-tunes

- **Merge** a LoRA adapter into the base weights and serve it as a normal model. Simple, but each fine-tune is a full copy of the model in GPU memory.
- **Multi-LoRA serving**: keep **one** base model in memory and load many small adapters, choosing the adapter per request (vLLM, S-LoRA, LoRAX support this). Dozens of customers' or teams' fine-tunes can share one GPU deployment, at a small throughput cost.
- **Provider fine-tuning APIs** do the training and serving for you on their models, with less control, and the fine-tune ties you to that provider and base model version.

## Evaluate against the base

A fine-tune must beat the base model (with a good prompt) on **your** eval set, or it isn't worth maintaining. Also test what you didn't train for:

- **Catastrophic forgetting**: narrow training can degrade general abilities, such as following instructions, maths or other languages.
- **Safety regressions**: even benign fine-tuning data can weaken a model's refusals. Run safety evals.
- **Overfitting**: great on training-like inputs, worse on new ones. Hold out data, and test on fresh production samples.

Keep the training data, configuration and base model version together, like any release, so the fine-tune can be rebuilt when the base model is upgraded.

```recall
prompt: An interviewer asks, "Our support bot's answers are correct but too long and in the wrong tone. Should we fine-tune?" Answer in under a minute.
points:
  - Try the cheaper rungs first: a clearer prompt with tone rules, length limits and good examples, measured on evals
  - If prompting can't hold it, supervised fine-tuning on a few hundred to a few thousand curated ideal answers fits, since tone and format are behaviour
  - Use LoRA or a provider's fine-tuning API, and consider distilling to a smaller model for cost
  - Compare against the base model on the eval set, check general and safety regressions, and plan to redo it when the base model changes
model: |
  Maybe, but not first. Tone and length are behaviour, which is what fine-tuning is good at, but I'd first try a clearer prompt: explicit length limits, tone rules, and five varied examples of ideal replies, measured on our eval set with judges for length and tone. If that can't hold it, or it costs too many tokens, supervised fine-tuning fits: a few hundred to a couple of thousand curated ideal answers written or approved by the support team. I'd use LoRA, or the provider's fine-tuning API, and might distil into a smaller model to cut cost. Before shipping, it has to beat the prompted base model on our evals without regressions on accuracy, instruction-following or safety, and I'd keep the data and config so we can retrain when the base model is upgraded.
```

```questions
- kind: check
  prompt: Which goal suits fine-tuning best?
  choices:
    - text: A consistent house style and output format
      correct: true
    - text: Knowing this quarter's prices and current policies
      why: Facts that change belong in retrieval.
    - text: Citing the source of each claim it makes
      why: Trained-in knowledge can't be cited.
  explanation: Fine-tuning teaches behaviour, not fresh facts.
- kind: check
  prompt: What does DPO learn from?
  choices:
    - text: Pairs of a better and a worse answer to the same prompt
      correct: true
    - text: A large set of input prompts, each with no answers at all
      why: That's not enough signal for preference tuning.
    - text: A reward model that people score by hand after each step
      why: DPO's point is that it skips the reward model.
  explanation: Direct preference optimisation learns from preference pairs.
- kind: check
  prompt: How does FSDP fit a model that is too big for one GPU's training memory?
  choices:
    - text: It shards weights, gradients and optimiser state
      correct: true
    - text: It trains only a small adapter beside the frozen weights
      why: That's LoRA.
    - text: It runs every layer in 4-bit precision during training
      why: That's closer to QLoRA's base model.
  explanation: Each GPU holds a share, and layers are gathered as they run.
- kind: check
  prompt: Roughly how many GB does full fine-tuning of a 3B model need, at 16 bytes per parameter, before activations?
  type: numeric
  answer: 48
  unit: GB
  tolerance: 0.05
  explanation: 3 billion × 16 bytes = 48 GB.
- kind: fire
  prompt: What does multi-LoRA serving share?
  choices:
    - text: One base model across many adapters
      correct: true
    - text: One adapter across many base models
      why: An adapter fits one base model.
    - text: One GPU across many full fine-tuned copies
      why: That's what it avoids.
  explanation: Many small adapters, one copy of the big weights.
- kind: fire
  prompt: Why checkpoint a long training run?
  choices:
    - text: To resume after a failure or preemption
      correct: true
    - text: To make the final model more accurate on evals
      why: It's for recovery.
    - text: To reduce the GPU memory needed
      why: That's gradient checkpointing.
  explanation: Failures are expected over multi-day runs.
- kind: fire
  prompt: What's catastrophic forgetting?
  choices:
    - text: Losing general skills after narrow training
      correct: true
    - text: The model forgetting the start of a long chat
      why: That's context, not training.
    - text: A checkpoint file failing to load
      why: That's a storage failure.
  explanation: Test general abilities as well as the target task.
```
