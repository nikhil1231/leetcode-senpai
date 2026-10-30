---
id: ai-workflow
category: assisted
skill: assisted
title: Your AI workflow - context, agents and judgement
minutes: 12
summary: '"How do you use AI in your day-to-day work?" is now a standard question, and in rounds where you bring your own tools, your workflow is on screen. A strong answer is specific and shows judgement. Say what you delegate and what you keep. Say how you give the agent context - project instruction files, pointing it at the right files, a failing test as the spec. Describe the guardrails: plan first, small diffs, permissions and sandboxes, reviewing every change. Say how you know it helped. Vague enthusiasm and "I just let it write everything" both land badly.'
objectives:
  - Explain which work you delegate to an AI agent, which you do yourself, and why
  - Describe how you give an agent context and keep its changes small and reviewable
  - Name the guardrails for running coding agents, from permissions to review
  - Answer "how do you use AI?" with a specific, credible example
sources:
  - ['Anthropic: Claude Code best practices', 'https://www.anthropic.com/engineering/claude-code-best-practices']
  - ['Anthropic: Effective context engineering for AI agents', 'https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents']
  - ['Hello Interview: AI-enabled coding interview formats', 'https://www.hellointerview.com/learn/ai-coding/overview/interview-formats']
---

## What to delegate

The useful question is how easy it is to check the work, and how costly it is to get wrong.

```sort
prompt: How would you handle each task with a coding agent?
buckets: [Delegate it and review the diff, Do it myself and use AI to check or speed up, Keep it entirely mine]
items:
  - {text: 'Add tests for an existing, well-specified function', bucket: 0, why: 'Easy to check by reading and running; low risk.'}
  - {text: 'Migrate 40 call sites to a renamed API', bucket: 0, why: 'Mechanical, and the compiler and tests verify most of it.'}
  - {text: 'Choose between a queue and a cron job for a new pipeline', bucket: 2, why: 'A design decision with trade-offs you will be accountable for. The AI can list options; the call is yours.'}
  - {text: 'Fix a concurrency bug in the payments ledger', bucket: 1, why: 'High stakes and subtle. Reason it through yourself; use the AI to review your fix or write a stress test.'}
  - {text: 'Scaffold a new CLI with argument parsing and help text', bucket: 0, why: 'Boilerplate with an obvious check: run it.'}
  - {text: 'Decide what to tell a customer about a data incident', bucket: 2, why: 'Judgement, accountability and context the model doesn''t have.'}
```

## Context is the job

An agent only knows what's in its context window. Most bad AI output comes from missing or noisy context, not from a weak model.

- **Project instructions** (a `CLAUDE.md`, `AGENTS.md` or rules file): build and test commands, conventions, things never to touch. Short and specific beats long and generic.
- **Point, don't search.** Name the files and functions involved. Paste the failing test output or stack trace.
- **A test as the spec.** A failing test is the most precise prompt there is, and it's also the check.
- **Plan, then act.** For anything beyond a few lines, ask for a plan first, correct it, then let it edit. Plans are cheap to review; diffs aren't.
- **Fresh context for new tasks.** Long sessions accumulate stale context; start over or summarise. Sub-agents can do side research and return only a summary.

## Guardrails

- **Small diffs**, committed often, so any change is easy to review and revert.
- **Permissions**: read-only by default; approve commands that change things; no production credentials in the agent's environment; sandboxes or containers for autonomous runs.
- **Untrusted input**: an agent that reads issues, web pages or dependency code can be prompt-injected. Don't give the same agent private data, untrusted content and a way to send data out.
- **Review like a colleague's PR**: you're the author of record. If you can't explain a line, it doesn't ship.
- **Measure**: did it actually save time, and did defect rates change? "It feels faster" is a weak answer.

```faded
prompt: Fill in the gaps in this answer to "How do you make sure AI-written code is correct?"
text: |
  I treat the agent like a fast junior pair. Before it edits, I ask for a [[plan]] and correct it. I give it a failing [[test]] as the spec where I can, so the same thing that defines done also checks it. I keep changes [[small]] so every diff is reviewable, and I read each one as if a colleague had sent it, because I'm the author of record. I run the tests [[myself]] rather than trusting its report, and for anything risky, like concurrency or money, I write the core logic myself and use the AI to [[review]] it.
```

## Answering the question

```interview
say: |
  "Day to day I use Claude Code in the terminal. The repo has an instructions file with the test commands and our conventions, so it doesn't guess. I delegate well-specified work that's easy to check: tests for existing code, mechanical migrations, scaffolding, and first drafts of scripts. For anything bigger I ask for a plan first and correct it before it edits. I keep diffs small and review each one like a PR. Design decisions and subtle code, like concurrency or anything touching money, I do myself, and use the AI as a reviewer or to write stress tests. A concrete example: I moved a service's stored records to a new format with an agent doing the mechanical parts. I wrote the migration rules and the backward-compatibility tests against real stored data first, so every change it made was checked. The biggest lesson was that the quality of the output tracks the quality of the context I give it."
followups:
  - q: Has an AI tool ever caused a problem for you?
    a: 'Give a real one, briefly: for example, an agent "fixed" a failing test by loosening the assertion, and I caught it in review. What changed afterwards: a rule in the instructions file that tests are never edited to pass, and reviewing test diffs first.'
  - q: How do you stop an agent doing something dangerous?
    a: Least privilege. It runs without production credentials, destructive commands need my approval, and autonomous runs happen in a container or worktree. Prompt instructions aren't a security boundary, so the limits live in configuration.
  - q: Do you worry about skills atrophying?
    a: I keep the hard parts mine on purpose (design, debugging subtle issues, and reviewing everything), and I still practise solving problems without AI. The tool speeds up typing; the judgement has to stay sharp.
weak: |
  "I use ChatGPT for everything, it's amazing." No specifics, no example, no review process, no sense of where it fails, or the opposite: "I don't really trust it, so I don't use it."
strong: |
  Names the tools and a concrete workflow, says what is delegated and what is kept and why, describes how context is provided, describes the guardrails (plan first, small diffs, review, permissions), gives a real example with an outcome, and admits a failure mode and what changed because of it.
```

Use your own example, not this one. Pick something you really shipped, and know the numbers.

```questions
- kind: check
  prompt: What's the most useful single input for getting an AI agent to fix a bug correctly?
  choices:
    - text: A failing test that captures the expected behaviour, plus the relevant files
      correct: true
    - text: A longer system prompt with general coding advice
      why: Generic advice adds noise; specific context helps.
    - text: Access to the whole repository so it can search
      why: Searching without direction often finds the wrong code.
  explanation: A failing test is both the spec and the check.
- kind: check
  prompt: Which task is the weakest candidate for full delegation to an agent?
  choices:
    - text: Fixing a subtle race condition in a payments ledger
      correct: true
    - text: Adding unit tests for a pure function
      why: Easy to check, low risk.
    - text: Renaming an API across many call sites
      why: Mechanical, and verified by tests and the compiler.
  explanation: High-stakes subtle logic stays yours; the AI can review it.
- kind: check
  prompt: How should you stop a coding agent from running destructive commands?
  choices:
    - text: Configure its permissions so those commands need approval, and keep credentials out of its environment
      correct: true
    - text: Tell it in the prompt never to run them
      why: Instructions can be ignored or overridden by injected content.
    - text: Use a more capable model
      why: Capability isn't a permission boundary.
  explanation: Limits belong in configuration, not in the prompt.
- kind: fire
  prompt: Why ask an agent for a plan before letting it edit?
  choices:
    - text: Plans are cheap to review and correct; large diffs aren't
      correct: true
    - text: It makes the model run faster
      why: It adds a step.
    - text: Agents can't edit without a plan
      why: They can; the plan is for you.
  explanation: Correct the approach before the code exists.
- kind: fire
  prompt: What belongs in a project instructions file such as CLAUDE.md or AGENTS.md?
  choices:
    - text: Build and test commands, conventions, and things never to touch
      correct: true
    - text: The full design history of the project
      why: Too long; it dilutes the useful instructions.
    - text: API keys so the agent can deploy
      why: Never put secrets in context.
  explanation: Short, specific and operational.
- kind: fire
  prompt: What's the weakest answer to "How do you use AI in your work?"
  choices:
    - text: General enthusiasm with no example, process or failure mode
      correct: true
    - text: A specific workflow with a real example and a lesson learned
      why: That's the strong answer.
    - text: Saying which tasks you keep for yourself and why
      why: That shows judgement.
  explanation: Specifics and judgement are what land.
```
