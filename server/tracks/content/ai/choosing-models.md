---
id: choosing-models
category: models
skill: models
title: Choosing a model - size, reasoning, open weights and fine-tuning
minutes: 15
summary: '"Which model would you use, and why?" comes up in almost every AI interview. A good answer doesn''t name a favourite. It names the trade: quality against cost and latency, measured on your own eval set rather than a leaderboard. Reasoning models think before they answer, which helps multi-step problems and costs output tokens and seconds. Open-weight models buy control and cheap volume at the price of running GPUs. Fine-tuning changes behaviour, not knowledge, and comes after prompting and retrieval have run out. A model is a dependency: pin it, and treat an upgrade as a migration you test.'
objectives:
  - Choose a model size for a task from its difficulty, volume and latency budget
  - Explain what reasoning models do differently, and when the extra tokens pay off
  - Weigh an API model against an open-weight model you host
  - Place fine-tuning on the ladder of prompting, examples, retrieval and training, and treat model upgrades as migrations
sources:
  - ['Anthropic docs: Choosing a model', 'https://docs.anthropic.com/en/docs/about-claude/models/choosing-a-model']
  - ['Anthropic docs: Extended thinking', 'https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking']
  - ['OpenAI docs: Reasoning models', 'https://platform.openai.com/docs/guides/reasoning']
  - ['Hamel Husain: Is fine-tuning still valuable?', 'https://hamel.dev/blog/posts/fine_tuning_valuable.html']
---

## Size is a cost and latency decision

Most providers sell a family: a large frontier model, a mid-sized one, and a small fast one. The price gap between the largest and smallest is often **10 to 30 times** per token, and the small one usually answers several times faster. The question is never "which is best?" but "what's the cheapest model that passes my evals for this task?"

- **Small models** are good at narrow, well-specified work: classification, extraction into a schema, routing, short rewrites, simple tool calls. At high volume they're the default.
- **Large models** earn their price on open-ended reasoning, long or messy context, subtle instructions, writing that must be good, and agents that plan over many steps.
- **Mixing** is normal. A small model routes or drafts, and the large one handles the hard cases (a *cascade*, covered in the serving lesson). One feature can use three models.

Decide per task, not per product. "We use model X" is a smell. "Ticket triage runs on the small model at 98% agreement with humans; the reply drafter needs the large one" is an answer.

## Reasoning models

A **reasoning model** (or a model in thinking mode) generates a long hidden chain of reasoning before its answer. Those thinking tokens are billed, usually at the output rate, and they take time to generate. Most APIs let you set a **budget or effort level**.

They help most where a person would need scratch paper: multi-step maths, tricky code, planning, puzzles with constraints, and judging subtle cases. They help least where the answer is a lookup or a format change: extraction, classification, short chat replies, anything with a tight latency budget. You don't need to tell a reasoning model to "think step by step". It already does, and long instructions about *how* to think can make it worse. Give it the goal, the constraints and the output format.

```calc
title: The price of thinking
prompt: A feature handles 100,000 requests a day, each with 1,500 input tokens and 300 output tokens. The model costs $3 per million input tokens and $15 per million output tokens. Turning on thinking adds about 2,000 thinking tokens per request, billed as output. What is the daily cost with thinking on, in dollars?
answer: 3900
unit: $
tolerance: 1.1
steps: |
  Without thinking, per request: 1,500 × $3/M + 300 × $15/M = $0.0045 + $0.0045 = $0.009. That's **$900 a day**.

  Thinking adds 2,000 × $15/M = $0.03 per request, which is $3,000 a day. Total: **$3,900 a day**, more than four times the cost, plus several seconds of latency per request. Worth it only if your evals show it fixes failures that matter, and often only for the subset of requests a router marks as hard.
```

```sort
prompt: Thinking on, or off?
buckets: [Thinking on, Thinking off]
items:
  - {text: 'Finding the bug in a 300-line concurrency change', bucket: 0, why: 'Multi-step reasoning over subtle code is where thinking helps most.'}
  - {text: 'Tagging 2 million product reviews by sentiment', bucket: 1, why: 'A simple task at huge volume; thinking multiplies cost for no gain.'}
  - {text: 'Planning a migration across 40 files with ordering constraints', bucket: 0, why: 'Planning with constraints benefits from scratch work.'}
  - {text: 'Autocomplete suggestions while the user types', bucket: 1, why: 'The latency budget is tens of milliseconds.'}
  - {text: 'Pulling the invoice number and total out of an email', bucket: 1, why: 'Extraction is pattern matching, not reasoning.'}
  - {text: 'Grading whether an answer follows a 6-rule policy', bucket: 0, why: 'Judging subtle compliance is a reasoning task, and judges run offline.'}
```

## Your evals, not the leaderboard

Public benchmarks tell you roughly which tier a model is in. They don't tell you how it does on **your** inputs: benchmarks leak into training data, saturate, and test tasks unlike yours. The method is simple. Shortlist two or three candidates, run them on your eval set, and compare **quality per category, cost per request and p95 latency** side by side.

```predict
prompt: A new model tops a public leaderboard by 6 points. On your 300-case support eval it scores 1 point higher than your current model, costs twice as much, and is 40% slower. What do you do?
choices:
  - Switch, because the leaderboard gap shows it is the stronger model overall
  - Keep the current model, and look at the cases the new one fixes to see if they matter
  - Switch only for traffic that arrives outside business hours
  - Run the leaderboard's own benchmark on your traffic to settle it
answer: 1
reveal: |
  Your eval is the decision-maker; the leaderboard measured something else. One point on 300 cases is three cases, inside noise. Read them: if the new model fixes a high-stakes category (refund policy, safety), routing just that category to it may be worth the cost. Otherwise you'd double the bill and slow every user for nothing measurable.
```

## API or open weights

| | API model | Open-weight model you host |
|---|---|---|
| Quality | Usually the frontier | Close behind, depending on size |
| Cost | Per token, zero idle cost | Per GPU-hour; cheap only at high, steady volume |
| Data | Leaves your network (check retention terms) | Stays in your network |
| Control | Provider updates and deprecates | You pin weights forever, and can fine-tune |
| Work | An HTTP call | GPUs, serving, scaling, upgrades, on-call |

Hosted open-weight models (a provider runs them for you) sit in between. Start with an API unless a hard constraint (data residency, a fine-tune you need, unit cost at very high volume) says otherwise. The *Under the hood* deep-dive covers what hosting involves.

## The adaptation ladder

When a model isn't good enough at a task, climb one rung at a time, measuring with evals at each step:

```order
prompt: Order the rungs from cheapest and first to try, to most expensive and last.
items:
  - Rewrite the prompt with clearer instructions and an output contract
  - Add a few varied examples of hard cases
  - Retrieve the knowledge it lacks (RAG or tools)
  - Fine-tune on a few thousand examples of the behaviour you want
  - Train or heavily continue-train a model of your own
explain: Each rung costs more to build and to maintain. Most problems are fixed on the first three. Fine-tuning comes after prompting and retrieval have run out, and never to teach facts that change.
```

**Fine-tuning** teaches behaviour: a format, a tone, a narrow skill, or the habits of a large model copied into a small one (*distillation*), which can cut cost and latency a lot. It's poor at adding knowledge: facts learnt in training can't be cited, go stale, and still get hallucinated. It also has a running cost. When the base model is upgraded, your fine-tune doesn't come with it.

## A model is a dependency

- **Pin versions.** An alias like "latest" means the provider can change your product's behaviour on a Tuesday.
- **Upgrades are migrations.** Run the eval suite, compare per category, read the new failures, and adjust prompts. Prompts tuned for one model often over- or under-steer the next.
- **Plan for deprecation.** Providers retire models on a schedule. Keep the model ID in config, keep a thin wrapper around the client, and keep a tested fallback model.
- **Multimodal input** (images, PDFs, audio) is priced in tokens too. A page image can cost as much as a page of text or more, so measure before sending every page of every document.

```recall
prompt: An interviewer asks, "For our support bot, which model would you use, and why?" Answer in under a minute.
points:
  - It depends on the task, so split the product into tasks (routing, retrieval answers, actions, summaries) and choose per task
  - Shortlist candidates by tier and decide on your own eval set, comparing quality per category, cost and p95 latency, not leaderboards
  - Use a small model where it passes (routing, classification) and a larger or reasoning model only for hard cases, possibly via a cascade
  - Pin versions, keep a fallback model, and treat upgrades as migrations tested by the eval suite
model: |
  I wouldn't pick one model for the whole bot. I'd split it into tasks: intent routing, answering from retrieved articles, account lookups with tools, and conversation summaries for escalation. For each, I'd shortlist two or three models across tiers and run them on our eval set, comparing quality per category, cost per conversation and p95 latency. I'd expect routing and summaries to pass on a small model, and grounded answers to need a mid or large one. Reasoning mode only if the evals show it fixes multi-step cases that matter, and only for those requests. Then I'd pin the versions, keep a tested fallback model at a different provider, and rerun the suite before any upgrade.
```

```questions
- kind: check
  prompt: Which task gains most from a reasoning model?
  choices:
    - text: Planning a schema migration with ordering constraints
      correct: true
    - text: Extracting names and dates from 50,000 contracts into a fixed schema
      why: Extraction is pattern matching at volume; thinking adds cost without much gain.
    - text: Suggesting the next word while a user types in a search box
      why: A latency budget of milliseconds rules out long thinking.
    - text: Labelling each support ticket with one of six product areas
      why: Simple classification passes on a small model.
  explanation: Thinking helps where a person would need scratch paper.
- kind: check
  prompt: Your team wants the model to know this week's prices and stock levels. Fine-tuning or retrieval?
  choices:
    - text: Retrieval or a tool call, because the facts change and answers should be checkable
      correct: true
    - text: Fine-tuning every week, because facts learnt in training are recalled more reliably
      why: Trained-in facts go stale, can't be cited, and are still hallucinated.
    - text: Fine-tuning once, then telling the model in the prompt to estimate the changes
      why: That invites the model to invent numbers.
  explanation: Use retrieval for knowledge that changes and fine-tuning for behaviour.
- kind: check
  prompt: A provider will retire your model in 90 days. What should already be in place?
  choices:
    - text: The model ID in config, and an eval suite to test a replacement
      correct: true
    - text: A fine-tuned copy of the model, so the provider can't retire your version of it
      why: Fine-tunes are usually retired along with their base model.
    - text: A prompt that asks the model to keep its current behaviour after updates
      why: The model can't control which weights serve it.
  explanation: A retirement should be an eval run and a config change, not a rewrite.
- kind: fire
  prompt: How are a reasoning model's thinking tokens usually billed?
  choices:
    - text: As output tokens
      correct: true
    - text: Not at all, since they are hidden
      why: You pay for them even when you can't see them.
    - text: As cached input tokens
      why: They're generated, not read.
  explanation: Thinking is generation, so it costs output-token prices and time.
- kind: fire
  prompt: What's the strongest reason to start with an API model rather than host one?
  choices:
    - text: No idle cost and no GPUs to run
      correct: true
    - text: API models never change their behaviour
      why: Providers update and retire models.
    - text: Hosted weights can't be fine-tuned
      why: Open weights are the easy ones to fine-tune.
  explanation: Hosting pays off at high, steady volume or under hard data constraints.
- kind: fire
  prompt: What is distillation?
  choices:
    - text: Training a small model on a large model's outputs
      correct: true
    - text: Compressing a prompt so that it fits in a smaller context window
      why: That's prompt compression.
    - text: Removing training data that leaked from public benchmarks
      why: That's decontamination.
  explanation: Distillation trades a training run for cheaper, faster inference on a narrow task.
- kind: fire
  prompt: What should decide between two candidate models?
  choices:
    - text: Your eval set: quality, cost and latency side by side
      correct: true
    - text: The public leaderboard, which has far more test cases than yours
      why: Benchmarks test other tasks and leak into training data.
    - text: Whichever one the provider recommends for the use case
      why: The provider doesn't know your inputs.
  explanation: A leaderboard places a model in a tier; your evals decide.
```
