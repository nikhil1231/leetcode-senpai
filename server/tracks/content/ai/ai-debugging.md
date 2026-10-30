---
id: ai-debugging
category: assisted
skill: assisted
title: Debugging with an AI pair - prompts, diffs and the mistakes to catch
minutes: 15
summary: The classic "here's a bug, fix it using AI" task tests whether you can stay the engineer while the AI types. Reproduce the bug yourself, localise it, and form a hypothesis. Then give the AI a precise, bounded task with the right context. Review its diff against the spec, not against the test it was shown. AI patches fail in predictable ways - fixing the symptom, special-casing the test, swallowing exceptions, editing the test, getting one side of a boundary wrong, or touching unrelated code - and catching one of these out loud is the strongest signal you can give.
objectives:
  - Run the reproduce, localise, hypothesise, fix, verify loop with the AI in the middle
  - Write prompts that are specific, bounded and give the AI the context it needs
  - Review an AI-generated diff and spot the common failure patterns
  - Know when to stop prompting and write the code yourself
sources:
  - ['PracHub: The AI coding interview, a complete guide', 'https://prachub.com/resources/ai-coding-interview-guide']
  - ['Hello Interview: Introduction to AI-enabled coding interviews', 'https://www.hellointerview.com/learn/ai-coding/overview/introduction']
  - ['Anthropic: Claude Code best practices', 'https://www.anthropic.com/engineering/claude-code-best-practices']
---

## The loop, with the AI in the middle

1. **Reproduce.** Run the failing test or the steps in the report. If there's no test, write the smallest input that shows the bug. Predict the output before you run it.
2. **Localise.** Trace the call path from the symptom to the code. Asking the AI to explain an unfamiliar module is fine, but check its summary against the code: a confident wrong summary sends you to the wrong file.
3. **Hypothesise out loud.** "Three attempts produced two calls, so I think the range is off by one."
4. **Fix, small.** Ask for one change you have already decided on, or type it yourself if it's one line.
5. **Verify.** Your new test, the full suite, then the edge the visible tests don't cover. Re-read the bug report: did you fix *every* complaint?

## Prompts that keep you in control

A good prompt names the file and function, states the expected behaviour (ideally as a test), gives the constraint, and asks for a small, reviewable change.

```sort
prompt: Would you send this prompt in an interview?
buckets: [Good prompt, Weak prompt]
items:
  - {text: '"fix it"', bucket: 1, why: 'No file, no behaviour, no constraint. You''ll get a large diff to review, aimed at whatever it guessed.'}
  - {text: '"In rooms.py, make overlaps() treat bookings as half-open [start, end) in both directions. Don''t change anything else."', bucket: 0, why: 'Names the function, the rule and the scope.'}
  - {text: '"Here''s the whole problem statement. Solve it."', bucket: 1, why: 'Hands over the approach and produces code you didn''t design.'}
  - {text: '"Write a test that fails if free_slots() assumes bookings are sorted by start."', bucket: 0, why: 'Asking for a test that pins down a boundary is a great use of the AI.'}
  - {text: '"Explain what retry() does with attempts=3, step by step."', bucket: 0, why: 'Using the AI to read faster is fine, as long as you check the explanation against the code.'}
  - {text: '"That didn''t work, rewrite the whole file."', bucket: 1, why: 'Rewrites hide the original bug and add new ones. Say what failed and ask for one change.'}
```

Give context deliberately: the failing test output, the relevant function, the spec line it violates. In your own editor with an agent, point it at the files rather than letting it search the whole repo, and ask for a plan before edits on anything bigger than a few lines.

## How AI patches go wrong

These come up again and again. Name them when you see them; it's exactly what the interviewer hopes to hear.

- **Symptom fix.** It handles the case in the failing test, but not the cause, so a sibling case still fails.
- **One side of a boundary.** It flips one comparison of two (`<` vs `<=`), and the test only covers that side.
- **Swallowing the error.** It wraps the failure in `try/except` and returns a default, so the bug becomes silent.
- **Special-casing the test.** `if items == []: return 0`, or a hard-coded value that matches the fixture.
- **Editing the test.** It "fixes" the assertion, not the code.
- **Scope creep.** It reformats, renames or refactors code that wasn't involved, so the real change is hard to see.
- **Invented API.** It calls a method or option that doesn't exist in this codebase or library version.
- **Unjustified optimisation.** It's faster, but there's no argument that it's still correct.

```bug
title: The AI's fix for "orders over £100 get no free shipping"
prompt: The bug report says orders of exactly £100 or more should ship free. The AI proposed this patch, and the failing test (an order of £100.00) now passes. Which lines would you push back on?
lang: python
code: |
  def shipping(order):
      try:
          total = sum(item.price * item.qty for item in order.items)
      except Exception:
          return 0
      if total == 100:
          return 0
      if total > 100:
          return 0
      return 4.99 if order.country == 'UK' else 12.50
bug: [4, 5, 6]
explain: |
  **Lines 4 and 5** swallow every error and return free shipping, so a malformed order now ships free silently. That's the error-swallowing pattern; let it raise. **Line 6** special-cases the exact value in the failing test instead of fixing the comparison. Together with line 8 it works, but it's a symptom fix: the real change is `total >= 100`. Also worth saying: money as floats (`4.99`) is a separate risk, but it isn't what this bug report is about, so note it rather than fixing it now.
fix: |
  def shipping(order):
      total = sum(item.price * item.qty for item in order.items)
      if total >= 100:
          return 0
      return 4.99 if order.country == 'UK' else 12.50
```

```predict
prompt: You asked the AI to fix a flaky date-parsing bug. It replies "Fixed! I ran the tests and they all pass now." In this interview the AI can only chat; it can't execute code. What does that tell you?
choices:
  - The fix is verified, so move on
  - The claim is invented; run the tests yourself before believing any part of the answer
  - The AI must have hidden tool access
  - Ask it to run them again to be sure
answer: 1
reveal: |
  A chat-only assistant can't run anything, so "I ran the tests" is a fluent fabrication. The code may still be right, but the claim is worth nothing. This is the general rule: the AI's report of verification is never verification. Only checks *you* ran count, and in the walkthrough, report only checks you actually executed. Saying "it claimed the tests pass, but it can't run code, so I ran them" is a good moment to narrate.
```

## When to stop prompting

If two prompts haven't got you closer, stop. Either your hypothesis is wrong (go back to reproducing) or the change is small enough to type yourself. A one-line fix typed by hand while explaining it is a strong signal, not a failure to use the tool. Long prompt-and-retry loops are a common way to lose a round.

```recall
prompt: The interviewer says, "Here's a bug report and a repo. Fix it, using the AI however you like. Talk me through how you'll work." Answer in under a minute.
points:
  - Read the report and the relevant code first, and reproduce the bug with a test or a minimal input
  - Form and say a hypothesis before prompting
  - Give the AI a small, specific task with context (file, function, expected behaviour, constraints)
  - Review the diff line by line against the spec, watching for symptom fixes, swallowed errors, edited tests and scope creep
  - Verify with the new test, the full suite, the uncovered edge cases, and every complaint in the report
model: |
  First I'd read the bug report and find the code path it describes, then reproduce it: run the tests, and if nothing fails, write the smallest failing test. Then I'd say my hypothesis out loud before involving the AI. I'd use the AI for specific, bounded work: explaining an unfamiliar function (which I'd check against the code), writing a test for a boundary, or making a change I've already decided on, naming the file, the function and the expected behaviour. I'd read every diff line by line against the spec, looking for the usual problems: a symptom fix, one side of a boundary, a swallowed exception, an edited test, or unrelated changes. Then I'd verify: my test, the full suite, the edge cases the tests don't cover, and every point in the bug report, before moving on.
```

```questions
- kind: check
  prompt: Which prompt gives you the most control in a debugging task?
  choices:
    - text: '"In retry.py, the loop calls fn one time too few when attempts=3. Change only the range so fn is called exactly attempts times."'
      correct: true
    - text: '"The retry tests fail. Fix retry.py."'
      why: It works sometimes, but the design decision and the scope are now the AI's.
    - text: '"Rewrite retry.py to be more robust."'
      why: Unbounded; you'll get a large diff that hides the real fix.
  explanation: Name the file, the behaviour and the scope.
- kind: check
  prompt: The AI fixes a failing test by wrapping the call in try/except and returning an empty list. What's the problem?
  choices:
    - text: The failure is now silent; the root cause is hidden, not fixed
      correct: true
    - text: try/except is slow in Python
      why: Performance isn't the concern here.
    - text: Nothing, as long as the tests pass
      why: Passing tests can hide a swallowed bug.
  explanation: Error-swallowing is one of the most common AI patch failures.
- kind: check
  prompt: The AI explains an unfamiliar module, and its summary says function A calls B. What should you do before relying on it?
  choices:
    - text: Check the summary against the code, at least for the parts you'll act on
      correct: true
    - text: Nothing; summaries are reliable
      why: Confident wrong summaries are common in unfamiliar code.
    - text: Ask a second model
      why: Two models can share the same mistake; the code is the source of truth.
  explanation: Use the AI to read faster, and verify what you act on.
- kind: fire
  prompt: Name the AI patch failure where the fix matches only the exact value in the failing test.
  choices:
    - text: Special-casing the test
      correct: true
    - text: Scope creep
      why: That's changing unrelated code.
    - text: Error swallowing
      why: That's hiding failures behind try/except.
  explanation: Look for literals that match the fixture.
- kind: fire
  prompt: After two prompts that haven't helped, what's usually best?
  choices:
    - text: Stop; revisit the hypothesis or type the small fix yourself
      correct: true
    - text: Ask for a full rewrite
      why: Rewrites compound the problem.
    - text: Switch to a bigger model and repeat the prompt
      why: The problem is usually the hypothesis or the prompt, not the model.
  explanation: Long prompt-retry loops lose rounds.
- kind: fire
  prompt: The AI says it ran the tests. It's a chat-only assistant. What's true?
  choices:
    - text: The claim is fabricated; only tests you run count as verification
      correct: true
    - text: It ran them in its sandbox
      why: A chat-only assistant has no way to execute code.
    - text: The tests pass if it says so
      why: Its report of verification is never verification.
  explanation: Report only checks you executed.
- kind: fire
  prompt: What's the first step when you're handed a bug report in an AI-assisted round?
  choices:
    - text: Reproduce it with a test or minimal input
      correct: true
    - text: Paste it into the AI
      why: You need to understand it first to judge any answer.
    - text: Refactor the module so it's easier to debug
      why: Refactoring before reproducing changes the thing you're debugging.
  explanation: Reproduce, then localise and hypothesise.
```
