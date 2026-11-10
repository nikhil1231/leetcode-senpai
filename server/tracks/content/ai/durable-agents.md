---
id: durable-agents
category: agents
skill: agents
title: Durable orchestration, reflection and autonomy levels
minutes: 16
summary: Real agent runs last minutes to days, wait for people, and call tools with side effects, so an in-memory loop that loses everything on a crash or deploy isn't enough. Durable orchestration models the run as a graph of steps with state checkpointed after each one (LangGraph), or as a workflow whose event history is replayed (Temporal), so a run resumes where it stopped and pauses for human approval without holding a process. Side effects need idempotency keys. Reflection, where a model critiques and retries its own work, helps when there is an external check and often doesn't when there isn't. Autonomy is a dial you set from the cost of mistakes, from suggesting to acting with approval to acting alone with audits.
objectives:
  - Explain why long-running agents need durable state and what goes wrong without it
  - Describe graph-based orchestration with checkpoints, threads and interrupts (LangGraph-style)
  - Make side-effecting steps safe to retry, and keep replayed code deterministic
  - Use reflection and evaluator loops where they help, and recognise where they don't
  - Choose an autonomy level for an agent feature, and move up it with evidence
sources:
  - ['LangGraph docs: Persistence (checkpointers and threads)', 'https://langchain-ai.github.io/langgraph/concepts/persistence/']
  - ['LangGraph docs: Human-in-the-loop (interrupts)', 'https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/']
  - ['Temporal docs: What is a Temporal Workflow?', 'https://docs.temporal.io/workflows']
  - ['Shinn et al., Reflexion: Language Agents with Verbal Reinforcement Learning (2023)', 'https://arxiv.org/abs/2303.11366']
  - ['Huang et al., Large Language Models Cannot Self-Correct Reasoning Yet (2023)', 'https://arxiv.org/abs/2310.01798']
  - ['Feng, McDonald, Zhang, Levels of Autonomy for AI Agents (2025)', 'https://arxiv.org/abs/2506.12469']
---

## Why agents need durability

The agent loop in the [agents lesson](#/ai/lesson/agents) is a `for` loop in one process. That's fine for a 20-second task. Production agents look different: a research run takes 15 minutes, a coding agent an hour, an expense workflow waits two days for a manager. Over that time, processes crash, deploys restart workers, rate limits force waits, and a person has to approve a step. If the state lives only in memory, every one of those events throws the run away. You pay for the tokens again, ask the approver again and, worst, **repeat side effects** that already happened.

**Durable execution** means the run's progress is persisted as it goes, so any worker can pick it up and continue from the last completed step. Two common shapes:

- **Graphs with checkpoints** (LangGraph): the agent is a graph of **nodes** (call the model, call a tool, ask a human) joined by **edges**, some conditional ("if the model asked for a tool, go to the tool node, else finish"). A shared **state** object flows through. A **checkpointer** (in-memory, SQLite, Postgres) saves the state after every step under a **thread ID**, so you can resume, inspect history, or rewind to an earlier checkpoint and branch.
- **Workflows with event history** (Temporal, and durable-function services such as AWS Step Functions): workflow code is ordinary code, and every call to the outside world is an **activity** whose result is recorded in an event history. After a crash, the workflow code re-runs from the start, but each completed activity returns its recorded result instead of running again, so execution fast-forwards to where it stopped. Activities get timeouts and retry policies for free.

```sim
name: durable
title: What a crash costs an agent run
intro: 'An eight-step report workflow: plan, three research steps, draft, wait for human approval, email the client, log it in the CRM. Pick how the run is executed and what goes wrong.'
challenges:
  - {text: 'Send the client the report twice', metric: dupEmail, op: '==', value: 1}
  - {text: 'Survive a deploy during the approval wait without asking the approver again', metric: approvalOnce, op: '==', value: 1}
  - {text: 'Crash right after the email is sent, and still send exactly one', metric: emailOnce, op: '==', value: 1}
takeaway: |
  Checkpointing after each step saves the work, but a step that crashed after acting will act again. Record side effects with idempotency keys, and keep pending human approvals in durable state, so a restart replays history instead of repeating the world.
```

## Interrupts: waiting for people

Human approval is the most common long wait. With durable state, the agent doesn't hold a process or a thread while it waits. In LangGraph, a node calls `interrupt(payload)`: the graph saves its checkpoint and stops, the payload (the drafted email, the proposed refund) goes to a UI, and later the app resumes the same thread with the human's answer (`Command(resume=...)`). Execution continues from the interrupt with that value. Temporal does the same with **signals**: the workflow waits on a signal that may arrive days later.

Design points:

- **Show the human exactly what will happen**: the recipient, amount and diff, not "the agent wants to proceed".
- **Let them edit**, not only approve or reject. Edits are the best training and eval data you'll get.
- **Time out** into a safe default (escalate, cancel), never into "proceed".

```faded
prompt: Fill in the gaps about graph-based orchestration.
text: |
  The agent is a graph of [[nodes|prompts|threads]] connected by edges, some of them [[conditional|weighted|parallel]] on what the model returned. A [[checkpointer|tokenizer|router]] saves the state after every step, keyed by a [[thread ID|model name|API key]], so the run can resume after a crash. To wait for a person, a node calls [[interrupt|sleep|retry]], and the app later resumes the thread with the human's answer.
```

## Side effects and determinism

Resuming means some step may run twice: the process died after the step acted but before its completion was saved. Reads don't care. Writes do:

- **Idempotency keys**: derive a stable key for each side effect (run ID + step ID) and pass it to the API (`Idempotency-Key` header for payments, a message ID for email), so a retry is recognised and dropped. If the API doesn't support keys, record "about to send X" and check before sending, and accept a small window. See [retries and idempotency](#/system-design/lesson/retry-identity).
- **Model calls are not deterministic.** In a replay-based engine, a model call must be an activity, so its recorded output is reused. Calling the model directly in workflow code would produce a different answer on replay and send the workflow down a different path. The same goes for clocks and random numbers.
- **Version the graph or workflow.** A run that started under version 3 of your agent may resume after you deploy version 4. Engines provide versioning (Temporal's patching); in a graph, keep old node names working until old threads finish.

```sort
prompt: Can this step safely run twice on resume?
buckets: [Safe to repeat, Needs an idempotency key or a check]
items:
  - {text: 'Search the web for competitor pricing', bucket: 0, why: 'A read; repeating costs only money.'}
  - {text: 'Charge the customer''s card $40', bucket: 1, why: 'A second charge is a real harm.'}
  - {text: 'Ask the model to draft a summary', bucket: 0, why: 'Costly to repeat, but no external effect (record it to avoid paying twice).'}
  - {text: 'Post the release notes to the company Slack channel', bucket: 1, why: 'Duplicate posts.'}
  - {text: 'Create a Jira ticket for the bug found', bucket: 1, why: 'Duplicate tickets.'}
  - {text: 'Read the current state of a pull request', bucket: 0}
```

## Reflection

**Reflection** is a model reviewing its own output and trying again: draft, critique, revise. Variants: **Self-Refine** (the same model critiques and rewrites), **evaluator-optimiser** (a separate judging step or agent), and **Reflexion** (after a failed attempt, the agent writes a short lesson into memory and retries with it).

It works when the critique has something real to check against:

- **External feedback**: tests that fail, a compiler error, a schema validator, a search showing a claim is unsupported. Coding agents that run tests and fix failures are reflection with ground truth, and they work well.
- **Explicit criteria**: a rubric ("every claim has a citation; under 200 words; no jargon") that a judge can check item by item.

It often doesn't when the model is asked to second-guess itself with nothing new: research found that self-correction without external feedback rarely improves reasoning answers and sometimes turns right answers wrong. The model's critic shares the generator's blind spots. Each loop also adds latency and cost, so cap iterations (two or three) and measure with an eval whether the loop is earning its cost.

```predict
prompt: A team adds a "review your answer and fix any mistakes" step after a model solves maths word problems. No tools, no answer key, same model. On their eval, what's the most likely effect?
choices:
  - text: A large accuracy gain, because the model catches its own arithmetic slips
  - text: Little or no gain, and some correct answers changed to wrong ones
  - text: Accuracy reaches 100% after three rounds
  - text: The model refuses to change any answer
answer: 1
reveal: |
  Without external feedback, the critic has no new information, so it often confirms its mistakes or "fixes" right answers, which is what Huang et al. found on reasoning benchmarks. Give the loop something to check against: let it run code to verify the arithmetic, check units, or compare with an independent solution. Then reflection pays.
```

## Autonomy levels

How much an agent does without asking is a product decision, set by the **cost of a mistake** and how easily it can be undone, not by what the model can do. A practical ladder:

1. **Suggest**: the agent drafts; a human does the action (a reply suggestion, a code completion).
2. **Act with approval**: the agent prepares the exact action; a human approves each one (send this email, run this migration).
3. **Act with undo**: the agent acts at once, but every action is reversible for a while and visible (archiving email, labelling tickets).
4. **Act and report**: the agent acts within limits and reports afterwards; humans audit samples and exceptions (auto-refunds under $20).
5. **Autonomous**: no human in the loop for the task; monitoring and periodic audits only.

One academic framing (Feng, McDonald and Zhang, 2025) names the *user's* role at each level: operator, collaborator, consultant, approver, observer. Either way, autonomy can differ per action within one agent: read freely, draft freely, send with approval, never delete. Move a specific action up a level when the evidence says so (approval rate near 100%, edit rate low, mistakes cheap), and keep the ability to move it back down.

```order
prompt: Order these from least to most autonomy for the agent.
items:
  - The agent suggests a reply; the support agent writes and sends their own
  - The agent drafts the reply; the support agent approves or edits it before it sends
  - The agent sends the reply at once, with a 10-minute undo and a visible log
  - The agent resolves tickets end to end and humans audit a 5% sample weekly
explain: Each step up removes a human check from the loop, so it needs evidence that the check was rarely changing anything, plus a cheap way to catch and undo the remaining mistakes. Reversibility often matters more than accuracy when choosing the level.
```

```recall
prompt: Design how an expense-approval agent runs in production. It reads a submitted expense, checks policy, may need a manager's approval (which can take days), then pays the employee and records it in the ledger. What makes it reliable?
points:
  - Durable execution with state checkpointed per step (a graph with a checkpointer, or a workflow engine), keyed by expense or run ID
  - The manager approval is an interrupt or signal that waits in durable state without holding a process, with a timeout that escalates rather than proceeds
  - Payment and ledger writes use idempotency keys derived from run and step IDs so a resumed step can't pay twice
  - Model calls are recorded steps so replays reuse their outputs; the workflow is versioned for in-flight runs
  - Autonomy set by risk, such as auto-approving small in-policy expenses with audits and requiring approval above a threshold
model: |
  I'd run each expense as a durable workflow, a LangGraph graph with a Postgres checkpointer or a Temporal workflow, keyed by the expense ID, so state is saved after every step and any worker can resume it after a crash or deploy. Policy checking is a model call recorded as a step, so a replay reuses the verdict. If approval is needed, the run interrupts: it stores a pending approval showing the manager exactly what will be paid and why, and waits for a signal without holding any process. After a timeout it escalates to finance, never auto-approves. Paying the employee and writing the ledger entry use idempotency keys built from the run and step IDs, so a step that crashed after paying doesn't pay again. I'd version the workflow so runs started last week resume correctly after a deploy. For autonomy, small expenses that clearly pass policy are paid automatically with a weekly audit sample; anything above a threshold, or flagged, needs approval. I'd only raise that threshold once approval and audit data show the agent's calls rarely get overturned.
```

```questions
- kind: check
  prompt: An agent checkpoints its state after every step. It crashes after the "send invoice email" step sends the email but before the checkpoint is saved. What happens on resume, and how do you prevent the problem?
  choices:
    - text: It sends a second email; an idempotency key from the run and step IDs lets the provider drop it
      correct: true
    - text: Nothing is repeated, because a checkpoint is always saved before each step starts
      why: The step's completion was never recorded.
    - text: The whole run restarts from the beginning
      why: It resumes from the last saved checkpoint.
    - text: The email is unsent automatically by the provider
      why: Email can't be unsent.
  explanation: Checkpoints save progress; idempotency keys make the last step's side effects safe to repeat.
- kind: check
  prompt: In a replay-based workflow engine like Temporal, why must an LLM call be made inside an activity rather than directly in the workflow code?
  choices:
    - text: Replays re-run workflow code; an activity's recorded result is reused, a direct call would differ
      correct: true
    - text: Activities are billed at a lower price per token by most providers
      why: Pricing is the same; determinism is the issue.
    - text: Workflow code isn't allowed to make network calls, for security and sandboxing reasons
      why: The reason is deterministic replay.
    - text: Activities run on GPUs
      why: Unrelated.
  explanation: Workflow code must be deterministic; the outside world goes through activities.
- kind: check
  prompt: When is a reflection loop (draft, critique, revise) most likely to improve results?
  choices:
    - text: When the critique can check against something external, like failing tests
      correct: true
    - text: When the same model re-reads its answer with no new information
      why: Self-correction without feedback rarely helps and can hurt.
    - text: When it runs ten or more iterations
      why: Gains, if any, come in the first couple of rounds.
    - text: Always, since a second look never hurts
      why: It can change right answers to wrong ones, and it always costs latency.
  explanation: Coding agents that run tests are reflection with ground truth.
- kind: check
  prompt: Which factor should most decide an agent's autonomy level for a given action?
  choices:
    - text: The cost of a mistake and how easily it can be undone
      correct: true
    - text: How capable the underlying model is on benchmarks
      why: Benchmarks don't price the harm of this action.
    - text: How much users say they want automation
      why: Useful input, but the risk decides.
    - text: The cost of the model calls
      why: Cost matters, but not for autonomy.
  explanation: Autonomy can differ per action: read freely, send with approval, never delete.
- kind: fire
  prompt: In LangGraph, what saves the graph's state after every step?
  choices:
    - text: A checkpointer
      correct: true
    - text: The model provider
      why: Providers don't store your agent's state.
    - text: The prompt cache
      why: Caches speed up prompts; they aren't durable state.
  explanation: State is keyed by a thread ID and can be resumed or rewound.
- kind: fire
  prompt: How does a durable agent wait days for human approval?
  choices:
    - text: It saves state at an interrupt and resumes when the answer arrives
      correct: true
    - text: A worker thread sleeps in memory until the approval comes in
      why: Holding a process for days loses everything on restart.
    - text: It polls the approver every second
      why: Wasteful, and still loses state on a crash.
  explanation: No process is held while waiting.
- kind: fire
  prompt: What does Reflexion add to a retry?
  choices:
    - text: A written lesson from the failed attempt, used on the next try
      correct: true
    - text: A larger, more capable model for the second attempt
      why: Not the technique.
    - text: A human review of every attempt
      why: It's automated.
  explanation: Verbal feedback stands in for a gradient update.
- kind: fire
  prompt: An agent drafts replies and a human sends them after approving or editing. Which autonomy level is this?
  choices:
    - text: Act with approval
      correct: true
    - text: Autonomous
      why: A human checks every action.
    - text: Act with undo
      why: Nothing is sent before approval.
  explanation: Move up only with evidence that approvals rarely change anything.
- kind: fire
  prompt: What should a human-approval step do if nobody answers before the timeout?
  choices:
    - text: Fall back to a safe default such as escalating or cancelling
      correct: true
    - text: Proceed automatically, since the action was already prepared
      why: Silence isn't consent.
    - text: Retry the whole run
      why: That repeats work and asks again.
  explanation: Timeouts should never widen the agent's authority.
```
