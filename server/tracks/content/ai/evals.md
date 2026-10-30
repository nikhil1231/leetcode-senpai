---
id: evals
category: evaluation
skill: evaluation
title: Evals - measuring LLM quality
minutes: 15
summary: Without evals, every prompt or model change is a guess. An eval is a dataset of representative inputs plus a way to score outputs, run automatically on every change. Prefer deterministic checks where possible. Use LLM-as-judge with a clear rubric, calibrated against human labels, where it isn't. Track quality alongside cost and latency, and add production failures to the set. Interviewers want to hear how you'd know your system works.
objectives:
  - Build an eval set from real traffic and failure cases, sized and split sensibly
  - Choose scoring methods, from exact match to rubric-based LLM judges, and know their biases
  - Use evals in CI as regression tests, and online with production signals
  - Explain trade-offs between quality, cost and latency
sources:
  - ['Hamel Husain: Your AI product needs evals', 'https://hamel.dev/blog/posts/evals/']
  - ['Zheng et al.: Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena', 'https://arxiv.org/abs/2306.05685']
  - ['Anthropic docs: Create strong empirical evaluations', 'https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests']
---

## What an eval is

An eval is **inputs + expected behaviour + a scorer**, run automatically:

- **Inputs** come from real or realistic traffic: common cases, edge cases, adversarial cases, and every production failure you've seen. Start with 50 to 100 good cases, not 10,000 synthetic ones.
- **Expected behaviour** may be an exact answer, a reference answer, a set of required facts, or a rubric ("cites a source, doesn't promise refunds, under 120 words").
- A **scorer** turns the output into a number or a pass/fail.

Look at the data. Reading 50 real outputs and categorising the failures ("wrong policy", "too verbose", "ignored the tool result") tells you what to measure. Generic metrics chosen up front usually measure the wrong thing.

## Scoring methods

```sort
prompt: What's the best scorer for each check?
buckets: [Deterministic code check, LLM judge with rubric, Human review]
items:
  - {text: 'The output is valid JSON matching the schema', bucket: 0, why: 'Parse and validate it; no model needed.'}
  - {text: 'The SQL query returns the same rows as the reference query', bucket: 0, why: 'Execute both and compare results.'}
  - {text: 'The answer is polite, concise and doesn''t promise a refund', bucket: 1, why: 'Subjective, but expressible as a rubric a judge model can apply.'}
  - {text: 'Every claim in the answer is supported by the retrieved passages', bucket: 1, why: 'Faithfulness checks are a common judge task.'}
  - {text: 'Calibrating the judge itself on a sample of 100 outputs', bucket: 2, why: 'You need human labels to know whether the judge agrees with people.'}
```

**LLM-as-judge** works well when it gets a specific rubric, scores one criterion at a time, and gives a reason before its verdict. Known biases: **position bias** (prefers the first of two answers, so swap the order and average), **verbosity bias** (prefers longer answers), and **self-preference** (prefers outputs from its own model family). Binary pass/fail per criterion is usually more reliable than a 1 to 10 score. Measure agreement with human labels before you trust it.

## Evals in the development loop

- **Offline, in CI**: run the suite on every prompt, model or retrieval change. Compare against the baseline, per category, not just in aggregate. A change that lifts the average can still break refunds.
- **Track cost and latency per case** next to quality. A 2% quality gain for 3× the cost or latency may not be worth it.
- **Online**: production signals such as thumbs up or down, edits, retries, escalations to humans, and task completion. A/B test larger changes. Sample production traffic for judge or human review.
- **Close the loop**: every production failure becomes a new eval case, so it can't come back silently.

```predict
prompt: You swap to a cheaper model. On your 400-case eval set the overall pass rate drops from 91% to 90%. What do you do?
choices:
  - Ship it; one point is noise
  - Break the results down by category, and read the newly failing cases before deciding
  - Reject it; any drop is unacceptable
  - Increase the eval set to 10,000 synthetic cases first
answer: 1
reveal: |
  Aggregates hide concentrated regressions. The 1-point drop might be spread thinly as noise, or it might be refunds going from 95% to 60% while easy categories improve. With 400 cases, one point is four cases, so read them. Also compare cost and latency: if the cheap model is 5× cheaper and the failures are minor style issues, shipping may be right. If they're all in a high-stakes category, it isn't. Decide on the breakdown, not the headline.
```

## Common pitfalls

- **Overfitting to the eval set**: tuning prompts until a small set passes. Keep a held-out set.
- **Synthetic-only data**: generated questions are cleaner than real users. Mix in real traffic.
- **Measuring only the final answer for agents**: also check trajectories (right tools, no unnecessary steps, no unsafe actions).
- **No baseline**: always compare against the current production configuration on the same cases.

```recall
prompt: An interviewer asks, "How would you evaluate an LLM feature that summarises customer calls for support agents?" Outline your approach.
points:
  - Build a dataset of real calls (diverse and tricky ones included), with reference summaries or required facts, and read outputs to find failure modes
  - Define criteria such as factual accuracy (no invented details), coverage of key facts and action items, length and format
  - Score with deterministic checks where possible, plus an LLM judge with a rubric per criterion, calibrated against human labels
  - Run it as a regression suite on every change, track cost and latency, and add online signals (agent edits and ratings), feeding failures back into the set
model: |
  I'd start with 100 real calls covering easy, messy and edge cases (escalations, multiple issues, poor transcription), and read the current outputs to see how they fail. Criteria: no hallucinated details (customer name, amounts, promises), coverage of the issue, resolution and action items, and the required format and length. Format and length are deterministic checks. Accuracy and coverage use an LLM judge with a rubric per criterion and binary verdicts, which I'd calibrate against my own labels on a sample. It runs in CI on every prompt or model change, with per-category breakdowns and cost and latency alongside. In production I'd watch how much agents edit the summaries and their ratings, sample outputs for review, and add every failure to the eval set.
```

```questions
- kind: check
  prompt: What's the best first step when you set up evals for a new LLM feature?
  choices:
    - text: Collect real or realistic inputs and read the outputs to find how the system actually fails
      correct: true
    - text: Pick standard metrics like BLEU and ROUGE
      why: Generic metrics rarely match product quality.
    - text: Generate 10,000 synthetic test cases
      why: Volume before understanding measures the wrong things.
  explanation: Error analysis tells you what to measure.
- kind: check
  prompt: An LLM judge compares two answers and prefers whichever is shown first. What's the mitigation?
  choices:
    - text: Run both orderings and combine the verdicts
      correct: true
    - text: Always put your preferred answer first
      why: That bakes in the bias.
    - text: Use a higher temperature
      why: That adds noise without removing bias.
  explanation: This is position bias; swapping and averaging cancels it out.
- kind: check
  prompt: Which check should NOT use an LLM judge?
  choices:
    - text: Whether the output parses as valid JSON for the schema
      correct: true
    - text: Whether the tone is professional
      why: That's subjective and suits a judge.
    - text: Whether claims are supported by the context
      why: A common judge task.
  explanation: Use deterministic code wherever it can decide.
- kind: fire
  prompt: Why break eval results down by category?
  choices:
    - text: A small aggregate change can hide a large regression in one important category
      correct: true
    - text: Providers require it
      why: They don't.
    - text: It makes the suite run faster
      why: It doesn't.
  explanation: Aggregate scores hide concentrated failures.
- kind: fire
  prompt: A production failure is reported and fixed. What else should happen?
  choices:
    - text: Add it to the eval set, so that a regression is caught automatically
      correct: true
    - text: Nothing; it's fixed
      why: Without a test, it can return silently.
    - text: Retrain the model
      why: Rarely the right response to one failure.
  explanation: Evals grow from real failures.
- kind: fire
  prompt: Which judge output format is usually more reliable?
  choices:
    - text: Binary pass or fail per specific criterion, with a reason first
      correct: true
    - text: A single 1 to 10 overall score
      why: Fine-grained overall scores are noisy and poorly calibrated.
    - text: A score with no explanation, to save tokens
      why: Reasoning first tends to improve judgments.
  explanation: Narrow, binary criteria agree better with humans.
- kind: fire
  prompt: For an agent, what should evals check beyond the final answer?
  choices:
    - text: The trajectory, meaning the right tools, sensible steps and no unsafe actions
      correct: true
    - text: Only the token count
      why: Cost matters, but so does behaviour.
    - text: Nothing else; the final answer is all that matters
      why: Agents can reach right answers through unsafe or wasteful paths.
  explanation: Score the process as well as the outcome.
```
