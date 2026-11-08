---
id: ai-product
category: production
skill: production
title: AI features people trust - scoping, autonomy, UX and feedback
minutes: 15
summary: An AI feature succeeds or fails on product decisions as much as on models. Scope it first. Find the job, how it's done today, what a wrong answer costs and how success will be measured, and check that AI is needed at all. Set autonomy by the cost and reversibility of a mistake, from suggesting to acting alone. Design for latency and for being wrong: stream, show progress, show sources, make checking easy, and degrade gracefully. Capture feedback, mostly implicit signals like edits and retries, tied to trace IDs so it feeds the eval set. Some interview loops test exactly this by role-playing a customer with a vague idea.
objectives:
  - Scope an AI feature with a customer, from the job to a success metric, before proposing a design
  - Choose a level of autonomy from the cost and reversibility of mistakes
  - Design the experience around latency, uncertainty and failure
  - Capture explicit and implicit feedback that flows back into evals
sources:
  - ['Google PAIR: People + AI Guidebook', 'https://pair.withgoogle.com/guidebook/']
  - ['Microsoft: Guidelines for Human-AI Interaction', 'https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/']
  - ['Anthropic: Building effective agents', 'https://www.anthropic.com/engineering/building-effective-agents']
  - ['Chip Huyen: Building a generative AI platform (feedback and observability)', 'https://huyenchip.com/2024/07/25/genai-platform.html']
---

## Scope before you design

"We want an AI chatbot for our sales team" is a solution, not a problem. Before drawing any boxes, find out:

1. **The job.** What task, by whom, how often? "Reps spend 40 minutes before each call reading the account's history" is a job.
2. **Today's way.** How is it done now, and what does good look like? The current process is your baseline and often your first eval set.
3. **The cost of a wrong answer.** An awkward draft costs nothing. A wrong discount quoted to a customer costs money and trust. This sets how much checking and autonomy you can afford.
4. **The data.** Where does the knowledge live, who may see what, and how fresh is it?
5. **Success.** One measurable outcome (prep time per call, tickets resolved without a human), plus guardrail metrics that mustn't get worse.
6. **Is AI needed?** If the answer is a lookup, a filter or a rule, ship that. It's cheaper, faster and right every time.

```faded
prompt: Fill in the gaps in this opening to a customer conversation.
text: |
  Before I suggest anything, can you walk me through how your reps [[prepare|choose a model|feel about AI]] for a call today, and how long it takes? When it goes wrong, what's the [[cost|token count|latency]]: a wasted call, or a wrong quote? Where does the account history live, and can every rep see every account, or is access [[restricted|cached|streamed]]? If this worked, what [[number|prompt|model]] would you watch to know it was working? And is there part of this that's really a lookup, which a plain [[search|agent|fine-tune]] would do better?
```

## Autonomy follows the cost of a mistake

Pick the lowest level of autonomy that still delivers the value, and raise it as evals and real use earn trust:

1. **Suggest**: show an option; the person decides (autocomplete, a suggested reply).
2. **Draft for approval**: the AI prepares and the person approves or edits (an email, a refund proposal).
3. **Act with undo**: the AI acts but the action is reversible and visible (labelling tickets, archiving).
4. **Act alone**: no person in the loop. Only for cheap, reversible, well-measured actions.

```sort
prompt: What level of autonomy fits?
buckets: [Suggest, Draft for approval, Act with undo, Act alone]
items:
  - {text: 'Sending a payment to a new supplier', bucket: 1, why: 'Irreversible money movement needs a person to approve.'}
  - {text: 'Next-word completion in a code editor', bucket: 0, why: 'The user accepts or ignores each suggestion.'}
  - {text: 'Tagging incoming support tickets by product area', bucket: 3, why: 'Cheap, reversible, measurable and huge in volume.'}
  - {text: 'Moving newsletters out of the inbox into a folder', bucket: 2, why: 'Reversible, but visible enough to undo when wrong.'}
  - {text: 'Replying to a customer complaint about a billing error', bucket: 1, why: 'A wrong promise is costly; an agent edits and sends.'}
```

## Design for latency and for being wrong

- **Stream** text so the first words appear in under a second. For agents and long tasks, show **progress** ("Searching 3 sources… reading the contract…"), and move anything over about 30 seconds to a background job that notifies when done.
- **Show sources.** Citations that open the passage turn "trust me" into "check me". Make checking cheap, because people will skip it if it isn't.
- **Allow "I don't know".** A clear "I couldn't find this in the docs" with a route to a human beats a fluent guess. Avoid fake-precise confidence numbers ("87% sure"). They're rarely calibrated, and people read them as more certain than they are.
- **Fail gracefully.** The AI part must never take the core product down with it. If the model is slow or unavailable, the page still works, the feature says so plainly, and there's a manual path.
- **Set expectations** at the point of use: what it can do, what it can't, and that it can be wrong. Once, plainly, not as a wall of disclaimers.

## Feedback that flows back into evals

**Explicit** feedback (thumbs up or down, a reason) is clear but rare. Typically a few percent of users click, and mostly when annoyed or delighted. **Implicit** feedback is plentiful: did they copy the answer, edit the draft (and how much), regenerate, abandon, escalate to a human, or ask the same thing again?

```predict
prompt: Your assistant shows 88% thumbs-up. Only 3% of responses get a rating at all. Separately, 30% of drafts are heavily edited before sending. What's the best reading?
choices:
  - Quality is high; 88% approval is a strong result for a new AI feature
  - The ratings are a small, biased sample; edits say many drafts miss
  - Users who edit heavily just have strong personal style preferences
  - Remove the thumbs buttons, since so few people use them anyway
answer: 1
reveal: |
  Ratings come from a self-selected 3%. Edits are measured on every draft and directly show how far it was from what the person wanted. Read a sample of heavily edited drafts: that's error analysis handed to you for free. Keep the thumbs (they're cheap and catch extremes), but treat implicit signals as the main measure.
```

Make every signal useful by logging it **with the trace ID** of the response it refers to. Then a thumbs-down, a heavy edit or an escalation can be pulled straight into error analysis and the eval set, with the full context of what the model saw.

```interview
say: |
  "Before designing anything I'd scope it with you. Your reps spend about 40 minutes preparing for each call from CRM notes, emails and tickets, and you'd like that under 10. A wrong fact in a brief costs a credible call, but nobody acts on it automatically, so a draft that reps read is the right level of autonomy. The data is CRM, email and support tickets, and access follows account ownership, so retrieval must filter by the rep's permissions. Success is prep time per call, measured before and after, with guardrails: rep-reported errors and call outcomes mustn't get worse. My first version would be a brief generated in the background before each scheduled call, with every claim linked to its source record, a clear 'not found' section, and a thumbs and comment box. I'd log edits and clicks on sources with trace IDs. I'd pilot with ten reps for two weeks, read every brief they flag, and build the eval set from those."
followups:
  - q: The customer says, "Can't it just update the CRM itself after each call?"
    a: Later, and as a draft first. Writing to the CRM is a lasting change other people rely on, so I'd start with suggested updates the rep approves in one click. Once the approval rate and edit rate show the suggestions are reliable for a field, such as next-step dates, that field could move to act-with-undo.
  - q: How would you know the brief is accurate, not just liked?
    a: Every claim cites a source record, and an automated check confirms the cited record exists and supports the claim. A sales lead labels a weekly sample for the failure modes we find, such as stale deal stage or the wrong contact, and we track those rates. Liking is measured separately, with edits and ratings.
  - q: What if the model provider has an outage before a big call?
    a: The brief is generated ahead of time and cached, so most are ready already. If one isn't, the page shows the plain CRM summary and recent activity it would have used, so the rep is never worse off than today.
weak: |
  Starts proposing "a RAG chatbot over the CRM" in the first minute, with no question about the job, the cost of errors, permissions or how success is measured, and no plan for feedback or failure.
strong: |
  Asks about the job, today's baseline, error cost, data and access, and a success metric first. Chooses autonomy from the cost of mistakes, designs for sources, "not found" and outages, ties feedback to traces, and pilots small with the eval set built from real use.
```

```questions
- kind: check
  prompt: A customer says "we want an AI chatbot for HR policies". Best first move?
  choices:
    - text: Ask what staff ask today, how HR answers, and what a wrong answer costs
      correct: true
    - text: Propose a retrieval system over the policy documents with citations and a judge
      why: Maybe the right design, but you don't know the job, the risk or the baseline yet.
    - text: Ask which model provider and vector database the company already has contracts with
      why: Tooling questions come after the problem is understood.
  explanation: Scope the job, the baseline and the risk before designing.
- kind: check
  prompt: Which signal best measures the quality of AI-drafted emails?
  choices:
    - text: How much people edit the drafts before sending
      correct: true
    - text: The thumbs-up rate on the drafts that people chose to rate
      why: A small, self-selected sample.
    - text: How many drafts are generated per user per day across the whole team
      why: Volume shows usage, not quality.
  explanation: Edit distance is measured on every draft and shows how far it missed.
- kind: check
  prompt: An agent can issue refunds. Which design fits a new launch?
  choices:
    - text: It drafts the refund; a person approves it in one click
      correct: true
    - text: It issues refunds under £20 alone and reports a daily total to finance
      why: Possibly later, once evals and real use have earned it.
    - text: It suggests that the customer contact support to ask for a refund themselves
      why: That gives up most of the value.
  explanation: Money is costly to get wrong, so start at draft-for-approval and earn autonomy.
- kind: fire
  prompt: Why log feedback with the trace ID of the response?
  choices:
    - text: To pull the full context into evals
      correct: true
    - text: To bill each team for the feedback their users give
      why: Feedback isn't billed.
    - text: To stop users from rating the same answer twice
      why: That's a minor side use.
  explanation: A thumbs-down without the trace is a complaint; with it, it's an eval case.
- kind: fire
  prompt: Should an assistant show "87% confident" next to answers?
  choices:
    - text: Usually not; they're rarely calibrated
      correct: true
    - text: Yes, because users always want a precise number
      why: Uncalibrated precision misleads.
    - text: Yes, but only on answers that it gets wrong
      why: It can't know which ones those are.
  explanation: Prefer sources and an honest "not found" over fake-precise confidence.
- kind: fire
  prompt: A research agent takes about 3 minutes per task. Best experience?
  choices:
    - text: A background job with progress and a notification
      correct: true
    - text: A spinner on the page until the full answer is ready
      why: Three minutes of spinner gets abandoned.
    - text: A smaller model that answers within the request timeout
      why: Only if it passes the same evals.
  explanation: Long tasks move out of the request and show progress.
- kind: fire
  prompt: When is a plain search or rule better than an LLM feature?
  choices:
    - text: When the answer is a lookup or a fixed rule
      correct: true
    - text: When the users of the feature aren't technical
      why: Non-technical users benefit from both.
    - text: When the company has no model provider yet
      why: That's a procurement step, not a design reason.
  explanation: Cheaper, faster and always right beats clever.
```
