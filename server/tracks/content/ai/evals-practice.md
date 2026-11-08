---
id: evals-practice
category: evaluation
skill: evaluation
title: Evals in practice - error analysis, judges you can trust, and agents
minutes: 17
summary: Most candidates can say "we'd use evals". Few can say how they'd find out what to measure, or why anyone should believe the numbers. Start with error analysis. Read real traces, note what went wrong in each, group the notes into failure modes, and count them. Then build an evaluator for each failure mode that matters, using code where you can and a binary LLM judge where you can't. Measure the judge against human labels with true positive and true negative rates, not accuracy. Agents need outcome checks on the final state, trajectory checks on the steps, and several runs per task, because one success doesn't make a reliable agent.
objectives:
  - Run an error analysis loop from raw traces to counted failure modes
  - Build an LLM judge for one failure mode and validate it with TPR and TNR on held-out labels
  - Evaluate an agent on outcomes, trajectories and reliability across repeated runs
  - Keep eval datasets honest with held-out splits, real traffic and structured synthetic data
sources:
  - ['Hamel Husain and Shreya Shankar: LLM evals FAQ', 'https://hamel.dev/blog/posts/evals-faq/']
  - ['Hamel Husain: Using LLM-as-a-judge you can trust', 'https://hamel.dev/blog/posts/llm-judge/']
  - ['Shankar et al.: Who Validates the Validators? (aligning LLM judges with people)', 'https://arxiv.org/abs/2404.12272']
  - ['Sierra: tau-bench and pass^k', 'https://arxiv.org/abs/2406.12045']
---

## Error analysis comes first

Generic metrics chosen up front ("helpfulness", "coherence", a 1 to 10 quality score) usually measure the wrong thing. They go up while users still complain. The failure modes that matter are specific to your product, and you find them by **reading**.

```order
prompt: Order the error analysis loop.
items:
  - Sample 50 to 100 real traces (input, retrieved context, tool calls, output)
  - For each failing trace, write a short note on the first thing that went wrong
  - Group the notes into a handful of named failure modes
  - Count how often each failure mode occurs, and rank them
  - Fix the top one, or build an evaluator for it if it will keep coming back
explain: This is open coding then axial coding, borrowed from qualitative research. Note the first error in each trace, because later errors often cascade from it. Stop reading when new traces stop producing new kinds of failure.
```

Two habits make it work. **One domain expert owns the labels**: a support lead for a support bot, a lawyer for a contracts tool. Committees produce mushy criteria. And **look at the whole trace**, not just the final answer. "Wrong refund policy" might be a retrieval failure, a stale document or a prompt problem, and only the trace says which.

Not every failure mode needs an evaluator. If the fix is obvious (a missing instruction, a bug in a tool), fix it and move on. Build evaluators for failures that are frequent, costly, and likely to come back when someone changes a prompt or a model.

## Evaluators: code first, then judges

For each failure mode worth tracking, use the cheapest reliable check:

- **Code-based assertions** where the failure is mechanical: the JSON parses, the cited passage ID exists, no phone numbers in the output, the SQL returns the reference rows, the reply is under 150 words.
- **An LLM judge** where it needs judgement: "Does the reply promise anything the policy doesn't allow?" One judge per failure mode, with a **binary** verdict, a short reason first, and a few labelled pass and fail examples in its prompt.

A judge is a model you've built, so it needs its own test. Have the domain expert label 100 to 200 traces for that failure mode. Split them: a few go into the judge prompt as examples, some are a dev set you iterate on, and the rest are a **held-out test set** you look at once.

Report two numbers, not accuracy:

- **TPR** (true positive rate): of the traces the expert marked as failures, what fraction did the judge catch?
- **TNR** (true negative rate): of the traces the expert marked as fine, what fraction did the judge pass?

Accuracy hides the failure you care about. If 5% of traces fail, a judge that always says "pass" is 95% accurate and useless.

```calc
title: What the judge's number really means
prompt: On held-out labels your judge has a TPR of 75% and a TNR of 90%. On 1,000 production traces it flags 22% as failures. Correcting for the judge's errors, what's the estimated true failure rate, in percent? Use true rate = (flagged + TNR − 1) / (TPR + TNR − 1).
answer: 18.5
unit: '%'
tolerance: 1.1
steps: |
  (0.22 + 0.90 − 1) / (0.75 + 0.90 − 1) = 0.12 / 0.65 ≈ **18.5%**. The judge over-reports here, because its 10% false-positive rate on the many passing traces adds more false flags than it misses. Raw judge scores are biased in a direction you can work out, so correct them, and add a confidence interval when deciding between two versions.
```

```incident
title: The judge says it's better
start: s0
nodes:
  s0:
    text: 'After a prompt change, your "helpfulness" judge score rises from 78% to 86%. Two weeks later, support leads say replies have got worse: longer, and padded with caveats. What do you check first?'
    options:
      - {label: 'Read a sample of the traces the judge now passes but used to fail', next: s1, quality: good, note: 'Look at the data the number is made of.'}
      - {label: 'Switch the judge to a larger model, which should judge better', next: bad1, quality: bad, note: 'A bigger judge can share the same bias.'}
  bad1:
    text: 'The larger judge also scores the new prompt higher. The complaints continue.'
    verdict: bad
  s1:
    text: 'The new replies are 60% longer. The judge rewards length: verbosity bias. It was never validated against the support leads'' labels.'
    options:
      - {label: 'Replace it with binary judges for named failure modes, validated with TPR and TNR on expert labels', next: good, quality: good, note: 'Specific criteria, measured against people.'}
      - {label: 'Add "ignore length" to the judge prompt', next: okay, quality: ok, note: 'Might help, but you still do not know whether the judge agrees with the experts.'}
  okay:
    text: 'Scores move a little. Nobody can say whether the judge is right now either.'
    verdict: ok
  good:
    text: 'The new judges show the change fixed tone but added unsupported caveats in 14% of replies. You fix the prompt with numbers you trust.'
    verdict: good
debrief: An unvalidated judge measures its own taste. Name the failure modes from error analysis, judge each one binarily, and check every judge against expert labels before believing it.
```

## Evaluating agents

An agent's final message isn't the whole story. Check three things:

- **Outcome**: is the world in the right state? Check the database, the ticket, the file system, not what the agent *says* it did. "Refund issued" means nothing if no refund row exists.
- **Trajectory**: did it use the right tools in a sensible order, avoid needless steps, and stay within its permissions? An agent that succeeds after 40 tool calls, or after trying to delete something, isn't passing.
- **Reliability**: agents are non-deterministic, so run each task several times. **pass@k** (succeeded at least once in k tries) suits tasks where a human picks the best attempt. **pass^k** (succeeded every time in k tries) is what matters for anything customers rely on.

```calc
title: One run isn't a reliable agent
prompt: An agent succeeds on a task 90% of the time, independently per run. What's its pass^3, the chance it succeeds on all three of three runs, in percent?
answer: 72.9
unit: '%'
tolerance: 1.05
steps: |
  0.9 × 0.9 × 0.9 = **0.729, or about 73%**. Its pass@3 (at least one success) is 1 − 0.1³ = 99.9%. The same agent looks nearly perfect or quite flaky depending on which you report. Customers experience pass^k: a bot that's right 90% of the time fails roughly one conversation in ten.
```

```sort
prompt: Which kind of check catches each problem?
buckets: [Outcome check, Trajectory check, Repeated runs]
items:
  - {text: 'The agent says it cancelled the subscription, but billing still shows it active', bucket: 0, why: 'Only checking the real state catches a false claim.'}
  - {text: 'It reaches the right answer after calling the search tool 25 times', bucket: 1, why: 'The outcome is fine; the path costs 10 times too much.'}
  - {text: 'It passes the booking task on Monday and fails the same task on Tuesday', bucket: 2, why: 'Non-determinism shows up only across runs.'}
  - {text: 'It tried to run a delete command before choosing the safe one', bucket: 1, why: 'An unsafe step matters even if the end state is right.'}
  - {text: 'The pull request it opened has failing tests', bucket: 0, why: 'Run the tests on the result, whatever the agent reports.'}
```

## Datasets that stay honest

- **Real traffic first.** Sample production traces into the dataset, especially failures and escalations, and refresh the sample as usage changes.
- **Structured synthetic data** fills gaps before launch. Don't ask a model for "100 test questions", which gives you 100 similar ones. Define dimensions (user type × intent × difficulty, say), generate combinations of them, then write or generate one input per combination, and discard the unrealistic ones.
- **Held-out sets** stay untouched while you tune, so you can check that improvements generalise.
- **Version the dataset** with the prompt and model, so a score always means "this system on these cases".

**Evals and guardrails are different jobs.** A guardrail runs inline on every request and blocks or repairs output, so it must be fast and cheap. An evaluator usually runs offline or on a sample, and can be slow and thorough. The same check can be both, but decide which job it's doing.

```recall
prompt: An interviewer asks, "Your LLM judge says 92% of answers are good. Should we trust that number?" Answer in under a minute.
points:
  - Not until the judge itself is validated against expert human labels on a held-out set
  - Report TPR and TNR rather than accuracy, since failures are rare and accuracy hides them
  - Prefer binary judges per named failure mode from error analysis over one vague quality score
  - Watch for known biases such as verbosity, position and self-preference, correct the raw rate for judge error, and add confidence intervals
model: |
  Not yet. A judge is a model, so it needs its own test. I'd have a domain expert label 100 to 200 traces, keep a held-out portion, and measure the judge's true positive rate (failures it catches) and true negative rate (passes it confirms). Accuracy can look great while the judge misses most real failures, because they're rare. I'd also want the judge to be checking a specific failure mode we found in error analysis, with a binary verdict, not a general 1 to 10 quality score, which drifts towards rewarding long answers. With TPR and TNR known, I can correct the 92% for the judge's errors and put an interval on it. Then I'd trust it for comparing versions, and keep re-checking it against fresh labels.
```

```questions
- kind: check
  prompt: Why report a judge's TPR and TNR instead of its accuracy?
  choices:
    - text: Failures are rare, so a judge that misses most can still look accurate
      correct: true
    - text: Accuracy can only be computed for judges that give scores on a 1 to 10 scale
      why: Accuracy works for binary verdicts too; it's just misleading here.
    - text: TPR and TNR are cheaper to compute because they need fewer human labels
      why: They need the same labels, split by class.
    - text: Providers bill judge calls differently depending on which metric you report
      why: Billing has nothing to do with it.
  explanation: With a 5% failure rate, "always pass" is 95% accurate and catches nothing.
- kind: check
  prompt: In error analysis, which error do you note for each failing trace?
  choices:
    - text: The first thing that went wrong
      correct: true
    - text: The last error, since it's the one the user saw
      why: Later errors often cascade from the first.
    - text: Every error, each weighted by how bad it looks
      why: Too slow, and the cascade inflates the counts.
  explanation: Fixing the upstream error often removes the downstream ones.
- kind: check
  prompt: An agent's final message says "I've issued the refund." How should the eval check it?
  choices:
    - text: Query the payments system for the refund row
      correct: true
    - text: Ask a judge model whether the message sounds confident and complete
      why: That grades the claim, not the outcome.
    - text: Search the trace for the word "refund" in a tool call name
      why: Calling a tool doesn't mean it succeeded.
  explanation: Outcome checks look at the state of the world, not the agent's account of it.
- kind: check
  prompt: Your support bot will be used by customers. Which agent metric matters most?
  choices:
    - text: pass^k, succeeding on every one of k runs
      correct: true
    - text: pass@k, succeeding at least once in k runs
      why: That suits tasks where a person chooses the best of several attempts.
    - text: The single best run on each task in the suite
      why: Customers don't get your best run, they get a random one.
  explanation: Reliability is what customers experience.
- kind: fire
  prompt: Who should own the labels for a contracts-review tool's evals?
  choices:
    - text: One domain expert, like a lawyer
      correct: true
    - text: A committee that votes on each trace
      why: Committees blur criteria.
    - text: The model that wrote the outputs
      why: It can't grade itself reliably.
  explanation: One expert with clear criteria gives consistent labels.
- kind: fire
  prompt: Best way to generate synthetic eval inputs before launch?
  choices:
    - text: Combine dimensions, then write one input per combination
      correct: true
    - text: Ask a model for 100 varied, realistic test questions in one call
      why: You get 100 near-identical questions.
    - text: Copy questions from a public benchmark in the same domain
      why: They don't reflect your users.
  explanation: Dimensions (user type, intent, difficulty) force the coverage you need.
- kind: fire
  prompt: What separates a guardrail from an evaluator?
  choices:
    - text: A guardrail runs inline and blocks; an evaluator measures
      correct: true
    - text: Guardrails use code and evaluators always use an LLM judge
      why: Either can use either.
    - text: Evaluators run only in CI and are never used on production traffic
      why: Sampled production traffic is evaluated all the time.
  explanation: Same check, different job: speed and cost matter inline.
- kind: fire
  prompt: When should a failure mode get its own evaluator instead of a quick fix?
  choices:
    - text: When it's frequent or costly, and will come back
      correct: true
    - text: Whenever error analysis finds it at least once
      why: Obvious one-off bugs should just be fixed.
    - text: Only when a code-based check for it is impossible to write
      why: Code-based evaluators are evaluators too.
  explanation: Evaluators are regression tests for failures that will recur.
```
