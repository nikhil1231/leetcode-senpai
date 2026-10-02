# Leetcode Senpai — engineering conventions

Personal, local-first SWE-interview prep app: FastAPI (Python) backend in `server/`,
vanilla-JS frontend in `static/`. Single user (Nikhil). **Read the code before changing
it — it is the source of truth.**

## Design invariants (do not violate)

1. **The LLM is never in the critical path** of core flows — logging solves, scheduling,
   reviews. LLM features must check `llm.enabled()` and degrade gracefully to a working
   non-LLM experience. (Deliberate exception: features that *are* conversation, e.g. an
   interviewer mode, may require the LLM — they should be cleanly unavailable without it,
   not broken.)
2. Raw user data (attempts, code, notes, transcripts) is the source of truth. LLM output
   is derived, re-generable, and versioned (the `PROMPT_VERSION` pattern).
3. Analytics and scheduling logic are pure functions over plain data — unit-testable
   without I/O, like `scheduler.py` and `insights.py`. Keep them that way.
4. Local-first, single-user, low-ceremony. No heavyweight frameworks, no frontend build
   step, no new infrastructure unless a feature truly demands it.
5. Never lose or corrupt practice history. Migrations must be backward-compatible with
   existing stored data (see the SM-2→FSRS migration in `fsrs_engine.py`). When in doubt,
   additive schema changes only.
6. Runs on Windows 10 (primary, RTX 3070) and macOS (M2 MacBook Air). Keep
   platform-specific code behind detection/config, never hard-coded.

## Working method

- Small, complete increments: one coherent improvement, with tests for pure logic and a
  real verification pass (run the server, exercise the feature) before it is done.
- Follow existing code style — terse, documented module headers, no comment noise.
- Prefer improving the effectiveness of an existing feature over adding a parallel one.
  Simplifying an unused or friction-adding feature is progress.
- The daily loop's friction budget is sacred: "open app" → "practicing the right problem"
  in seconds. Any change that taxes this loop must pay for itself.
- Stop and surface the decision (don't guess) if a change needs a secret, a new paid
  service, or a call only the user can make — spending money, deleting data, or changing
  the LeetCode account integration.

## Tests

`pytest` (see `pytest.ini`, `tests/`). Analytics and scheduling changes must keep or add
pure unit tests that run without I/O. Prefer additive, backward-compatible data changes.

## Repo topology — where changes land (read before committing)

- `~/…/leetcode` — the **real repo**. Its `origin` is GitHub
  (`github.com/nikhil1231/leetcode-senpai`); `main` is canonical. **Durable work goes
  here, on `main`.** Land a change by fast-forwarding `main` to `origin/main`, applying
  your commit, running the suite, and `git push origin main`.
- **Deploys are automatic from GitHub `main`.** `infra-deploy@leetcode-senpai.timer`
  runs `~/infra/bin/deploy` every 2 minutes: it builds an image from `main`, swaps the
  `leetcode-senpai` container (`~/infra/stacks/leetcode-senpai/`), and rolls back if
  `/api/health` doesn't come up. It's served at `https://leetcode.nikhil.ing` through
  the `cloudflared` container, behind Cloudflare Access. A commit that is only local
  is not deployed.

The `ticket-runner` service still works leetcode tickets in its own worktrees and
rebuilds `integration/leetcode-senpai`; Done tickets are merged and pushed to `main`,
which then deploys like any other commit. Don't hand-edit `integration` or the `ai/*`
branches. Nothing serves the integration branch any more: the LAN testing stack
(`~/…/leetcode-testing` on :8000, `leetcode-senpai-testing{,-sync}` units) is disabled.
