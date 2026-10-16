# Learning reliability rollout

Implementation baseline: integration `54a715c`, 16 October 2026. Read-only live baseline: 205 catalog problems, 196 attempts, 65 full-problem review cards, zero Quickfire answers. `learning-baseline-2026-10-16.json` records the initial classification diff; the final reviewed taxonomy additionally corrects generic classifications such as Longest Common Prefix, Gray Code, Spiral Matrix II and Wildcard Matching.

The imported catalog has a reviewed taxonomy; fallback rules are deterministic. Categories retain pack membership, original tags and slugs. Topic introductions use curated starters or an existing non-Hard fallback, and prerequisites carry an explicit entry/import option. Hard recommendations require independent evidence from distinct structural tasks and a later success. Manual selection is unrestricted.

Coaching grades retain their original score and text. Execution, constraints, approach, complexity, clarity and optional optimisation have distinct assessment fields. Unverified objections never change an observed judge acceptance. Only the reviewed Sort Colors contract currently supports remote custom-case verification; unsupported languages, contracts or unavailable authentication remain unverified. Verification uses saved code through LeetCode Run, never Submit or local server execution. A saved-code hash guards late responses. The historical Sort Colors contradiction has a narrowly scoped, versioned correction tied to its exact code hash; the original grade and solution exposure remain.

Help is recorded when requested and carried into attempts. Server-recorded recall hints survive omitted client metadata. Solution exposure carries across retries for 24 hours; ordinary debugging before acceptance is not a retrieval failure. New approach recalls update `approach_reviews`, while full implementations use `reviews`. Legacy mixed cards retain dates and their existing review mode until a new implementation establishes clean provenance.

Skill evidence is deliberately conservative: catalog teaching tags do not demonstrate a technique. The annotation form offers explicit technique confirmation. Unknown history does not generate new skill successes. Topic displays show counts; the former mastery radar is replaced with topic evidence. Projections rebuild from raw source IDs/revisions, and recent unresolved skill observations can replace old targeting signals.

Quickfire stores transactionally rebuilt scheduling state independently of the 500-answer history view. The offline mirror retains source IDs, revisions and original timestamps; revisions and guessed flags survive replay. Immediate successes cannot compound intervals. Exposures and choices are persisted; corrective retries require the four-item gap and are limited. A filtered pool can complete, rounds default to five, and familiar trace/fill exercises prefer typed retrieval. Authored equivalent forms are supported without evaluating input expressions; unsupported forms are labelled unverified.

Six versioned lesson sequences provide worked examples, a short explanation, partial completion and reserved applications. Lessons overlay the live editor; they do not create full solves or restart its clock. Declines persist for the session. The recovery switch remains off by default for staged rollout. Enable with `LEARNING_RECOVERY=true` after reviewing the content. Reserved applications appear approximately 7 and 21 days after learning, with actual delays recorded. Delayed results are descriptive one-user observations, not causal estimates.

## Migration and rollback

Run from the integration checkout with the normal local environment configured:

```
.venv/bin/python scripts/migrate_learning.py taxonomy
.venv/bin/python scripts/migrate_learning.py taxonomy --apply
.venv/bin/python scripts/migrate_learning.py evidence --apply
.venv/bin/python scripts/migrate_learning.py quickfire --apply
```

Each step dry-runs by default. Apply writes a private, mode-0600 backup under `~/.leetcode-senpai/learning-backups`, then changes only differing records. Repeating a step is idempotent. `--restore BACKUP.json` restores that step's affected records; use it before subsequent practice writes to those same records. Source attempts, grades and timestamps are preserved; the evidence step only adds the known correction metadata. Full implementation review cards are not reset. Quickfire migration pages all source answers.

Independent switches: `LEARNING_TAXONOMY`, `LEARNING_ASSESSMENT`, `LEARNING_EVIDENCE`, `LEARNING_RECOVERY`, `LEARNING_QUICKFIRE`. Readers remain compatible when a switch is disabled. Disabling assessment skips new coach grades; disabling Quickfire retention marks new answers as practice-only. Recovery is initially disabled; the other repairs are enabled. Rollback retains additive records and source history.

## Validation and pilot limits

Run Python tests once, then browser tests sequentially. No model credentials or paid calls are used in tests. Test temporary data uses the default disk-backed `/tmp`. The executable Sort Colors regression checks all 29,523 arrays of lengths 1–9 against an independent sorting reference.

The first-release API scenarios cover an all-Medium topic, the disputed code objection, a hinted recall and an ordinary independent solve. Recovery/application tests use a controlled clock, never synthetic live success records. No live delayed outcomes exist yet; actual 7/21-day results require prospective practice.

Timing distinguishes measured, estimated, uncertain and missing data. Recall/Quickfire answer timing is prospective; missing historical time is not zero. Session coding/planning timing is recorded together once. Long resumed intervals are flagged unreliable. Quickfire feedback and abandoned-question intervals are recorded separately; hidden or resumed browser intervals are marked uncertain. Timing that cannot reach the server remains missing. Review timing quality before interpreting the per-hour ratio; idle thinking is never subtracted automatically.

Item 6 remains deferred: no available-minutes intake, workload optimiser, Java/backend curriculum or algorithm/systems allocation changes. Existing FSRS parameters, caps and weekly goals are retained.
