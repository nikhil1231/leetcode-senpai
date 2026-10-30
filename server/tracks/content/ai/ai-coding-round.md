---
id: ai-coding-round
category: assisted
skill: assisted
title: The AI-assisted coding round - what is actually scored
minutes: 14
summary: More companies now run a coding round where you are expected to use an AI assistant. Meta replaced one onsite coding round with one in late 2025, and Canva, Rippling and others run their own versions. The problem is bigger than a LeetCode question and usually lives in a codebase you didn't write. You're scored on four things - your approach, your control of the AI, your verification habits, and your communication - not on how much code the AI produced. Strong candidates plan before they prompt, give the AI small precise tasks, read and test everything it writes, and narrate as they go.
objectives:
  - Describe the common formats of an AI-assisted round and the bug, feature, scale shape
  - Name the four things interviewers score, and what strong and weak look like for each
  - Plan the first five minutes and the time budget across the phases
  - Recognise the behaviours that get candidates marked down even when the code works
sources:
  - ['Hello Interview: Introduction to AI-enabled coding interviews', 'https://www.hellointerview.com/learn/ai-coding/overview/introduction']
  - ["Hello Interview: Meta's AI-enabled coding interview", 'https://www.hellointerview.com/blog/meta-ai-enabled-coding']
  - ['Hello Interview: AI-enabled coding interview formats', 'https://www.hellointerview.com/learn/ai-coding/overview/interview-formats']
  - ['PracHub: The AI coding interview, a complete guide', 'https://prachub.com/resources/ai-coding-interview-guide']
---

## What the round looks like

There are three common formats. Ask your recruiter which one you'll get, which models are available, and whether the AI can edit files or only chat.

- **Structured, in the browser.** CoderPad or HackerRank, with a file tree, an editor and an AI chat panel with a fixed choice of models. In Meta's version the AI can see the files but only replies in chat, so you paste and adapt its code yourself. Candidates have reported the interview AI being noticeably less helpful than in practice, so plan for an assistant that answers only what you ask and doesn't point out bugs.
- **Open-ended, your own tools.** You share your screen and use your own editor and assistant (Cursor, Claude Code, Copilot). Your prompts, the diffs you accept and the commands you run are all visible, and some platforms record them for review.
- **Take-home plus review.** You build something with AI allowed, then defend every line in a follow-up call.

The problem is usually **one extended task in three phases**, on a multi-file codebase written by someone else:

1. **Fix a bug.** Usually not algorithmic: an off-by-one, a wrong comparison, a type mix-up, a bad assumption about ordering.
2. **Add a feature.** The core implementation, often 100 lines or more. This is where the AI earns its keep.
3. **Scale or optimise.** Larger inputs expose the naive approach; the fix may need a different algorithm or data structure. Not finishing this phase is common and acceptable if you can explain what you'd do.

Most loops keep one classic coding round without AI, so you still need to solve problems unaided.

## The four things they score

Different companies phrase it differently, but the published guides and candidate reports agree on four areas. The AI's output isn't on the list.

- **Approach.** Do you understand the problem and the code before acting? Do you break the work into steps and choose data structures deliberately?
- **Control.** Are you directing the AI, or is it directing you? You make the design decisions; the AI types. You redirect it when it drifts and reject suggestions that don't fit.
- **Verification.** Do you read what it wrote, run it, and test the boundaries? Do you catch its mistakes? Several guides call this the single strongest signal.
- **Communication.** Do you keep the interviewer in the loop: what you're about to ask the AI and why, what came back, and whether you trust it? Expect "what does this code do?" after any generation.

```sort
prompt: Strong signal or red flag?
buckets: [Strong signal, Red flag]
items:
  - {text: 'Spends the first few minutes reading the code and running the tests before opening the AI chat', bucket: 0, why: 'Opening the AI in the first two minutes signals that you reach for the tool before the problem.'}
  - {text: 'Pastes the whole problem statement into the chat and builds on whatever comes back', bucket: 1, why: 'You have handed over the approach, and the interviewer learns nothing about your judgement.'}
  - {text: 'Says "I''m going to ask it to write the overlap check for half-open ranges, then I''ll test the adjacent case"', bucket: 0, why: 'Narrating before you prompt shows the plan is yours.'}
  - {text: 'Accepts a 60-line diff because the tests went green', bucket: 1, why: 'Green visible tests are not proof. Interviewers watch for unread code.'}
  - {text: 'Rejects the AI''s suggestion to add a base class, and says why it doesn''t fit', bucket: 0, why: 'Evaluating and declining a suggestion is the clearest evidence of control.'}
  - {text: 'Goes quiet for five minutes while iterating on prompts', bucket: 1, why: 'Silence hides your reasoning, which is exactly what is being scored.'}
  - {text: 'Writes a small failing test for the bug before asking for a fix', bucket: 0, why: 'It pins down the behaviour and gives you a way to check the AI.'}
  - {text: 'Asks the AI for a complete rewrite each time a test fails', bucket: 1, why: 'Rewrites add new defects and hide the original one. Fix one thing at a time.'}
```

## The first five minutes

```incident
title: The round starts
start: s0
nodes:
  s0:
    text: 'The interviewer shares a repo with four files and a bug report: "Some users are charged twice when they retry checkout." The AI chat panel is open. What do you do first?'
    options:
      - {label: 'Read the bug report aloud, open the files, and find the checkout path', next: s1, quality: good, note: 'Understand before acting, and let the interviewer hear you do it.'}
      - {label: 'Paste the bug report into the AI and ask it to find the bug', next: bad1, quality: bad, note: 'Fast, but you have shown nothing, and you now depend on its answer.'}
  bad1:
    text: 'The AI points at a retry loop and proposes wrapping it in try/except. The interviewer asks why that would cause double charges. You are not sure; you haven''t read the code.'
    verdict: bad
  s1:
    text: 'You find `checkout()` calls `charge()` inside a retry helper. Tests exist. What next?'
    options:
      - {label: 'Run the tests to see what passes, then form a hypothesis out loud', next: s2, quality: good, note: 'Reproduce first. The result tells you where to look.'}
      - {label: 'Start editing the retry helper', next: ok1, quality: ok, note: 'You may be right, but you have no reproduction to prove the fix.'}
  ok1:
    text: 'Your change looks reasonable, but there is no test showing the double charge, so neither you nor the interviewer knows if it worked.'
    verdict: ok
  s2:
    text: 'Tests pass. You say: "I think the charge isn''t idempotent, so a retry after a timeout charges again. I''ll write a test with a charge that times out after succeeding." It fails as expected. Now?'
    options:
      - {label: 'Ask the AI for a specific change: "make charge() take an idempotency key derived from the order id, and skip if it was already used"', next: good, quality: good, note: 'A small, reviewable task that you designed.'}
      - {label: 'Ask the AI "fix the double charge bug"', next: ok2, quality: ok, note: 'It might work, but you have given away the design and will have more to review.'}
  ok2:
    text: 'The AI changes four functions, including one that wasn''t involved. You spend ten minutes reviewing and reverting part of it.'
    verdict: ok
  good:
    text: 'The diff is ten lines. You read it aloud, run your test (now passing) and the full suite, and move on with time to spare.'
    verdict: good
debrief: Read, reproduce, hypothesise out loud, then give the AI a small task you have already designed. The AI makes you faster only after you know what you want.
```

## Budgeting the hour

For a 60-minute, three-phase round, roughly: 5 minutes of orientation (read, run, ask questions), 10 to 15 on the bug, 20 to 25 on the feature, and whatever is left on scale. The most common failure is spending 30 minutes on phase 1. If you're stuck on the bug, say what you've ruled out, ask for a hint, and move on.

```order
prompt: Order a strong workflow for one change in an AI-assisted round.
items:
  - Read the relevant code and say what you think is happening
  - Write or run a test that shows the problem
  - Decide the fix yourself, and say it out loud
  - Ask the AI for that specific change, naming the file and function
  - Read the diff line by line and explain it to the interviewer
  - Run the new test and the full suite, then check one edge case by hand
explain: The AI sits in the middle of the loop, never at the start. You own the understanding before it and the verification after it.
```

```interview
say: |
  "Before I touch the AI I'm going to spend a couple of minutes reading. The bug report says back-to-back bookings are rejected, so I'll find where clashes are checked and run the tests. ... OK, `overlaps()` uses `<=` on both sides, and the spec says bookings are half-open, so a meeting ending at 10 and one starting at 10 shouldn't clash. I'll write a test for both orders, the new meeting before and after. I'm going to ask the AI to rewrite `overlaps` for half-open ranges, and then check its comparison against the rule I've just written down."
followups:
  - q: The AI's patch makes your test pass. Are you done?
    a: Not yet. I'd read the diff against the rule, run the whole suite, and test the mirror case, the new meeting ending as the old one starts, because a patch that fixes one comparison can pass a test that only covers one direction. Then I'd re-read the bug report to check I've addressed every complaint in it.
  - q: Why not let the AI find the bug itself?
    a: I can, as a second opinion once I have a hypothesis. But if I start there, I can't judge whether its answer is right, and I've skipped the part of the job you're assessing. Reading first also makes my prompts much more precise.
  - q: How would you work if the AI were unavailable for the rest of the round?
    a: The same way, just slower. The plan, the tests and the verification are mine; the AI was only typing. That's the point of keeping the design decisions on my side.
weak: |
  Opens the AI chat immediately, pastes the problem, accepts the first answer, and can't explain the code when asked. Goes silent while prompting. Asks for full rewrites when something fails. Treats green tests as proof.
strong: |
  Reads and runs before prompting, narrates a hypothesis, writes a test that captures the bug, gives the AI small and specific tasks, reads every diff aloud against the spec, rejects suggestions that don't fit, tests the boundaries the AI is likely to miss, and keeps time across the phases.
```

```questions
- kind: check
  prompt: Which of these do AI-assisted coding rounds score most directly?
  choices:
    - text: How you approach, control, verify and explain the work done with the AI
      correct: true
    - text: How many lines of working code the AI produced
      why: Output volume isn't the signal; your judgement is.
    - text: Whether you used the most capable model available
      why: Model choice barely matters to the rubric.
  explanation: The four areas are approach, control, verification and communication.
- kind: check
  prompt: The AI's patch makes the failing test pass. What's the strongest next step?
  choices:
    - text: Read the diff against the spec, run the full suite, and test the boundary the visible test doesn't cover
      correct: true
    - text: Move on to the next phase to save time
      why: Unverified patches are the most common way candidates get marked down.
    - text: Ask the AI whether its patch is correct
      why: Its own confidence isn't verification.
  explanation: Visible tests passing tells you only that the cases someone wrote down work.
- kind: check
  prompt: You're 30 minutes into a 60-minute round and still stuck on the phase 1 bug. What do you do?
  choices:
    - text: Summarise what you've ruled out, ask for a hint, and keep moving
      correct: true
    - text: Keep going until it's fixed; later phases depend on it
      why: Running out of time on phase 1 is the most common failure.
    - text: Ask the AI to rewrite the whole module
      why: A rewrite hides the bug and creates new ones.
  explanation: Time management across phases is part of the assessment.
- kind: fire
  prompt: What are the three phases of a typical AI-assisted coding round?
  choices:
    - text: Fix a bug, add a feature, then scale or optimise
      correct: true
    - text: Design, implement, deploy
      why: That's a system design shape.
    - text: Two LeetCode questions, then a code review
      why: The AI round is one extended problem.
  explanation: One problem, three phases, often on an unfamiliar codebase.
- kind: fire
  prompt: Why narrate *before* you prompt the AI rather than after?
  choices:
    - text: It shows the plan is yours and lets the interviewer follow your reasoning
      correct: true
    - text: The AI responds better when you speak
      why: The AI can't hear you.
    - text: It's required by the platform
      why: It's a scoring behaviour, not a rule.
  explanation: Say what you'll ask and why, then ask.
- kind: fire
  prompt: An interview AI won't point out a second bug you haven't asked about. Why might that be?
  choices:
    - text: Some interview assistants are configured to answer only what's asked
      correct: true
    - text: Models can't find more than one bug at a time
      why: They can; the restriction is deliberate or incidental.
    - text: The second bug is in a file it can't see
      why: Interview AIs usually see the whole project.
  explanation: Re-read the bug report and test every complaint yourself.
- kind: fire
  prompt: Which behaviour most often gets candidates marked down even when their code works?
  choices:
    - text: Being unable to explain code the AI wrote
      correct: true
    - text: Typing some code by hand
      why: That's fine; it often shows control.
    - text: Using the AI for boilerplate
      why: That's a sensible use.
  explanation: If you can't explain it, it isn't your solution.
```
