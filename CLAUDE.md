# Leetcode Senpai — engineering conventions

Personal, local-first SWE-interview prep app: FastAPI (Python) API in `server/`,
Next.js + React + TypeScript frontend in `web/`. Single user (Nikhil). **Read the code before changing
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
4. Never lose or corrupt practice history. Migrations must be backward-compatible with
   existing stored data (see the SM-2→FSRS migration in `fsrs_engine.py`). When in doubt,
   additive schema changes only.
5. Runs on Windows 10 (primary, RTX 3070) and macOS (M2 MacBook Air). Keep
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

## UI

`docs/design-system.md` has the rules (type floor, widths, states, the single "Do this next" recommendation from
`server/next_up.py`). `tests/test_ui_audit.py` enforces what can be checked statically. Ctrl/Cmd-K is the command
palette (`web/src/components/Palette.tsx`, index from `/api/search-index`); a new page or lesson type should appear in it.

## Frontend (`web/`)

Next.js (App Router) + React + TypeScript. `npm run dev` (with the API on :8000, e.g. `scripts/dev_fake_server.py` for
seeded fake data), `npm test` (vitest, plus the pure-module tests under `tests/legacy/`), `npm run typecheck`.
- `src/app/(app)/` the app (one shell for every page), `src/app/(standalone)/` feed, wall and walk (own root layout, no shell).
- `src/features/<area>/` one folder per area; `src/components/` shared UI (Modal, Charts, ReadinessCard, SectionHome...);
  `src/lib/` the API client, stores (`run-store`, `flow-store`, `ui-store`), formatting.
- Server state is TanStack Query (the `/api/rev` watcher invalidates it when anything is written); UI state is zustand.
- `src/styles/` is the app's CSS, loaded in `src/app/(app)/layout.tsx`. Pages use its class names; keep them.
- `src/legacy/` is imperative code carried over from the old vanilla-JS frontend (System Design, the course tracks, the
  tutor, the simulators). It runs behind `src/legacy/bridge.ts`, which supplies the globals it was written against.
  Converting a module means giving it a component and deleting its use of `window.*`, nothing else. New UI is components.
- `/api/*` is forwarded to the API by `next.config.ts` (`API_URL`, fixed at build time in the image).

## Writing (UI copy, lessons, overviews and prompts)

Plain, warm and specific: how a friendly senior engineer explains something at a colleague's desk. The tutor's
voice (`server/voice.py`) follows the same rules; keep the two in step.
- Say it directly, in full sentences. No slogans or mantras ("bytes here, facts there", "add with a default, never
  reuse, remove last"), and no one-line paragraphs written for effect.
- No dramatic set-ups or reveals: "here's the thing / the fun bit / the opinion", "the one X that decides Y",
  "That's the whole problem.", a rhetorical question answered in the next line, "X pulls in opposite directions".
- No hype or selling: don't say how important a topic is or that it will pay you back at work.
- No cheeky or gamey verdicts ("You called it", "Most people miss this one", "Nailed it"). Verdicts say the word:
  "Correct", "Not quite".
- Don't narrate the process ("let me set the scene", "stop for one question where it matters").
- Encouraging, not flattering: name what was right. Define a term the first time it appears. Prefer a concrete case
  (a Ripple situation, a number) to an abstraction. British English, contractions are fine, no em dashes.
- A check must test what the page taught: not one item per bucket, and no answer the page never mentioned.

## Model spend (OpenRouter)

- **Never use Anthropic models (`anthropic/…`) through OpenRouter.** They are far too
  expensive for this app. `llm.forbidden_model` enforces it: such a setting falls back to the
  default and the transport refuses the call. Two exceptions, Nikhil's decisions (2026-11-12),
  both in `llm.ANTHROPIC_EXCEPTIONS`: the podcast's fallback scriptwriter (`server/podcast_drama.py`),
  used only when the scheduled Claude Code job did not write the day's episode (~$0.20 an episode);
  and the tutor's voice when `TUTOR_MODEL` is set to one (a Claude Sonnet trial on the LAN copy; the
  default stays DeepSeek). The tutor's prompt is built to cache (`session.prompt`, `llm.cache_marks`).
- Paid model calls are for the app's runtime features only. One-off content work (drafting,
  linking, mapping, rewriting lessons) is done by the agent in its own session, not scripted
  through OpenRouter; scripts that need answers export prompts and import the agent's answers
  (see `scripts/generate_knowledge_points.py`). The OpenRouter balance is shared with Kimi.

## Tests

`pytest` (see `pytest.ini`, `tests/`). Analytics and scheduling changes must keep or add
pure unit tests that run without I/O. Prefer additive, backward-compatible data changes.

## Repo topology — where changes land (read before committing)

- `~/…/leetcode` — the **real repo** (two services: the API in `server/`, the web app in `web/`, each its own image). Its `origin` is GitHub
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
