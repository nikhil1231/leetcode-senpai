# Leetcode Senpai (V2)

A personal tool to rebuild LeetCode skills. It auto-logs your solves, then
**coaches** them: it grows your library with community-vetted problems, trains
pattern recognition, turns every free-text note into structured signal with
an LLM coach, and schedules what to do next with FSRS spaced repetition + topic and
mistake weighting.

Auto-logging works by polling LeetCode's GraphQL API for your accepted
submissions — no browser extension.

### What V2 adds over V1
- **Discover engine** — import curated packs (NeetCode 150, Blind 75, Grind 75)
  or browse the whole problem set filtered to only highly-liked problems
  (like-ratio + vote thresholds). Smart expansion suggests the next great
  problem when you clear a topic.
- **Coaching layer (OpenAI GPT-5.6 Luna by default, Gemini optional)** — classifies what went wrong,
  generates per-problem hint ladders, grades from-memory recall against your own
  past code, writes a weekly report and per-topic playbooks. All off the
  critical path; degrades gracefully with no API key.
- **Pattern-recognition training**: pattern sprints and approach-recall reviews
  instead of full re-solves for short-interval cards.
- **Insights** — review forecast, mastery radar (now vs 30 days ago), pace
  projection, time-to-solve trends, failure-mode breakdown, mock score trend.
- **Mock interviews + gamification** — weekly 3-problem timed gauntlet with a
  score trend; weekly goals, daily XP, mastery moments.
- **FSRS** scheduler (swappable back to SM-2 via `SCHEDULER=sm2`).

## Senpai (learning planner and teacher)

**Senpai** owns learning evidence, curriculum sequencing, practice sessions, teaching interventions and
learning-time allocation. **Job Scout** owns the career target, experience evidence, job requirements, employer
research, applications and interview context. Senpai reads Job Scout's bounded brief
(`GET /api/senpai/context`, see the Job Scout README) and never writes career records. Code: `server/senpai/`.

- **Career target** — synced from Job Scout (Settings there → Career target) and mirrored into
  `settings.target_job` with `target_job_source: job_scout`; editing it here is refused while synced. Without
  `JOB_SCOUT_URL`/`JOB_SCOUT_TOKEN` (e.g. on a laptop) the target typed in Settings is used. A Job Scout outage
  keeps the last good copy.
- **Plan** (`senpai/plan`, every revision in `senpai_plans`) — weekly minutes, an allocation across Coding (DSA),
  System design, Behavioural and Role stack (the last two are outside the app), protected minimums, at most a
  few focus capabilities, objectives (some protected), and temporary, expiring overlays such as an imminent
  interview. Focus nudges the Today queue's new-problem choice.
- **Authority** (`server/senpai/policy.py`, pure) — automatic: activity selection, sessions, checkpoints, small
  focus changes, interview overlays within limits, and allocation moves damped by a learning rate × confidence,
  capped per ISO week and floored at protected minimums. Needs approval: undamped allocation changes, protected
  objectives, time commitments, protections and Senpai's own limits. Market signals become a focus only after
  persisting for N weeks *with fresh postings* — the same vacancies seen again are not new evidence. Limits live in
  Settings → Senpai's limits; the Charter there shapes teaching style but grants no permissions.
- **Capabilities** — status per DSA skill and system-design category from recorded evidence only: untested,
  practised (solved, technique unconfirmed), stale, needs a check, overdue, developing, demonstrated. Inactivity is
  unknown, never weakness; CV claims, job fit and model interpretations are never mastery.
- **Sessions** — assembled each day (and on demand) from existing material: due reviews, new problems,
  application checks, recovery lessons, Quickfire, system-design lessons and checks, design cases. The budget is
  split by the effective allocation; retention checks come first; stale/untested capabilities get a quick
  diagnostic before remedial work. Modes: mixed, retrieval, learn, interview (unassisted, capped runs). No fixed
  recipe. Shown on Today and in the Senpai tab; blocks tick off from recorded evidence.
- **Daily** — the scheduled review (below) now also receives the plan, capability statuses, earlier advice with
  outcomes and the charter. Its one adjustment becomes a tracked intervention (targets + intended outcome); up to
  two plan changes go through policy; tomorrow's session is prepared. Regeneration never re-executes changes.
- **Weekly** (configurable day) — sync Job Scout, add interview overlays, update sustained signals, and (with the
  model) propose explained, validated plan changes and up to two questions only you can answer.
- **Teaching** — "Teach me" on any capability: diagnose, explain, scaffold, use your projects as context; modes
  learn / independent (conceptual hints) / interview (clarifications). Bounded tools (find resources, inspect
  evidence, schedule a checkpoint, propose a focus). Help is logged and recorded as assistance on a run in
  progress; generated exercises are labelled unvalidated and never count as evidence. Needs the model.
- **Follow-through** — each intervention records whether it was tried (from evidence) and, after its check date,
  whether it helped; ineffective advice is fed back so it is revised, not repeated.
- **History** — every decision (`senpai_decisions`) with rationale, evidence ids, plan revisions and follow-up;
  a Markdown snapshot is rendered from the structured state (`GET /api/senpai/snapshot.md`).

API: `/api/senpai` (overview), `/today`, `/session`, `/changes`, `/proposals/{id}/approve|reject`,
`/questions/{id}`, `/interventions/{id}`, `/checkpoints`, `/capabilities/{id}`, `/teach`, `/sync`, `/weekly`,
`/history`, `/snapshot.md`; daily reviews at `/api/senpai/daily` (and the old `/api/coach/daily`).

### Daily review

Senpai reviews the previous completed local day at the configured time (default 00:05 in your timezone),
including up to 13 preceding days for trend context; the browser need not be open, the server must be running.
After downtime it checks the latest eligible day rather than bursting historical calls. Manual generation can
review a selected day or a labelled partial-day preview of today. Only process metadata enters the prompt —
never raw code, answer text, chat transcripts or assessment rubrics. Imported historical solves are not new
practice; repeated assessments are not additional practice. Evidence is capped at 240 records. Missing goals,
missing model keys, empty days and provider errors produce explicit states, not invented reviews. Reviews live at
`users/{uid}/daily_reviews`.

## Storage: Firestore only
V2 is **Firestore-only** — there is no local JSON backend. The app requires
Firestore connectivity. Migrate any old `local_data.json` with
`scripts/migrate_local_to_firestore.py` (see below).

## Architecture
```
Browser (static SPA on Firebase Hosting)
   │  Google sign-in -> ID token (Bearer)
   ▼
Cloud Run  ── FastAPI (server/) ──► Firestore (Admin SDK, per-user data)
   │                              └► LLM API (enrichment, off critical path)
   └── calls LeetCode GraphQL using the stored cookie
```
- **Firestore is locked** (`firestore.rules` deny-all); all access is through the
  backend's Admin SDK.
- **Backend verifies** the Firebase ID token and checks the email allowlist on
  every request (`server/auth.py`).
- **The LeetCode session cookie and csrftoken** are saved on your Firestore user
  document, so every signed-in device shares them. Saving from any device
  overwrites the previous pair (last write wins); the values are never returned
  to the browser or logged.
- **LLM output is derived data**, never the source of truth. Raw notes/code
  are kept; enrichments are stamped with a prompt version and re-runnable.

```
server/           FastAPI backend (containerized for Cloud Run)
  main.py         routes + auth dependencies + static serving
  auth.py         Firebase token verification + email allowlist
  store.py        Firestore store (Firestore-only)
  scheduler.py    pure queue/topic/mistake logic (no I/O)
  fsrs_engine.py  FSRS review engine (behind scheduler's interface)
  llm.py          provider-swappable extract() abstraction + task registry
  enrich.py       per-attempt enrichment pipeline + sweep
  coach.py        hints, recall grading, weekly report, playbooks
  insights.py     pure analytics for the Insights tab
  mock.py         mock-interview assembly + scoring
  gamify.py       mastery-moment detection
  packs.py        curated list packs + tag->category mapping
  importer.py     pack import, discover, history backfill
  poller.py       on-demand solve detection
  recording.py    pure change log of an in-app editor solve (deltas + checkpoints)
  leetcode.py     GraphQL client + run/submit judging (cookie passed in per call)
  neetcode150.py  the backbone list (slugs by category)
  config.py       env-driven app config
static/           vanilla-JS SPA (app.js + views.js + charts.js), Firebase Auth
  editor.js       in-app editor: Run/Submit via the server, 10s change log
  vendor/         CodeMirror bundle, rebuilt only by scripts/vendor_editor.sh
scripts/          migrate_local_to_firestore.py
tests/            pytest (scheduler, FSRS, discover, insights, API, llm)
```

## Run locally (Firestore-only)
Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run:

```bash
uv sync --locked
uv run run.py
```

`uv run` manages the project environment automatically; no activation is needed.
If the requested port is busy, local startup tries successive ports (8001, 8002,
and so on) and prints the selected URL. This also works with auto-reload and
`run_local_firestore.py`.

Python 3.12 is the default (`.python-version`). Dependencies live in
`pyproject.toml`, with exact resolutions committed in `uv.lock`. Test tools are
in the dev group; use `uv sync --locked --no-dev` for a runtime-only environment.
Use `uv add <package>` (or `uv add --dev <package>`) to update dependencies and
commit both files.

The app needs Firestore. For local dev, bypass browser auth but point at your
real Firestore data with a service-account key:
```bash
AUTH_MODE=local \
GOOGLE_APPLICATION_CREDENTIALS=/path/key.json \
GOOGLE_CLOUD_PROJECT=your-project \
DEV_UID=<your-firebase-uid> \
OPENROUTER_API_KEY=<optional — unlocks the coaching layer> \
LLM_PROVIDER=openrouter \
LLM_MODEL=openai/gpt-5.6-luna \
uv run run.py
```
Open http://127.0.0.1:8000. Without the selected provider's API key everything still works; the
LLM-powered features degrade gracefully. In **Settings** set your username,
coach provider/model, and
`LEETCODE_SESSION` cookie; in **Discover** import a pack and backfill history.

### OpenRouter coaching

Set `OPENROUTER_API_KEY` in the runtime environment (`.env.local` for local
runs and Docker Compose). The default model is `openai/gpt-5.6-luna`; override
it with `LLM_MODEL` or choose a model in **Settings → Coach model**.
The picker fetches OpenRouter's current text models with structured-output
support and caches the list for ten minutes. You can also enter a
`vendor/model` ID directly, including when the catalog is unavailable.
A model must support strict JSON schema output to run coaching tasks.

All coaching requests use OpenRouter. Existing saved OpenAI and Gemini
choices are read as `openai/<model>` and `google/<model>` respectively;
practice history is unchanged. Direct OpenAI/Gemini API keys are no longer
used. Configure the OpenRouter key before deploying this migration.
Without it, coaching is disabled while core practice features still work.

API details: [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

### Run on startup

Docker makes the app package portable, but each operating system still needs a
local supervisor to start it after a restart.

#### Windows Task Scheduler

This is the simplest Windows-native option and does not require Docker Desktop.

```powershell
uv sync --locked
.\scripts\install-windows-startup-task.ps1
```

If Windows denies scheduled-task creation, the installer falls back to a
per-user Startup folder shortcut.

The default trigger is logon. To install a true machine startup trigger instead,
run PowerShell as Administrator and pass `-AtStartup`:

```powershell
.\scripts\install-windows-startup-task.ps1 -AtStartup
```

Logs are written to `logs/`. Remove the task with:

```powershell
.\scripts\uninstall-windows-startup-task.ps1
```

#### Docker Compose

The repo also includes a `Dockerfile` for the app image and `docker-compose.yml`
for Docker supervision.

1. Keep app secrets in `.env.local` as above (`GOOGLE_CLOUD_PROJECT`, `DEV_UID`,
   optional `OPENROUTER_API_KEY` and `LLM_MODEL`).
2. Copy `.env.example` to `.env` and set `FIREBASE_SERVICE_ACCOUNT_JSON` to the
   host path of your Firebase service-account key.
3. Start it:
   ```powershell
   docker compose up -d --build
   ```
4. Open http://127.0.0.1:8000.

Because the Compose service uses `restart: unless-stopped`, Docker will bring it
back after a restart as long as the Docker daemon is running. On Windows that
means Docker Desktop must be running and configured to start when you log in.
Stop it intentionally with:
```powershell
docker compose down
```

### Migrate old local_data.json
```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/key.json GOOGLE_CLOUD_PROJECT=your-project \
DEV_UID=<your-firebase-uid> uv run scripts/migrate_local_to_firestore.py
```
(`--dry-run` first to preview counts. Your `local_data.json` is left as backup.)

### Tests
```bash
uv run --locked pytest                 # no Firestore/network needed
node --test tests/test_frontend.cjs       # UI flow regressions; no npm install needed
node --test tests/test_practice_frontend.cjs # Quickfire interactions
```

## Quickfire

The **Quickfire** tab (called Light practice in code, routes, and storage) is a stream of short exercises: breaking inputs, state
prediction, missing code, and approach choices. Clicking a kind of question (or
Mixed, optionally narrowed to a topic) starts a run with no fixed length. Each
answer is graded and explained as soon as it is submitted. Keys: `1`–`4` answer a
choice, `Enter` checks a typed answer and moves to the next question,
`Shift+Enter` adds a line, `Esc` stops. `server/practice_queue.py` picks each next
question: misses (including revealed answers) come back after a few others, new
questions lean toward topics you miss more, and correct answers return after 1, 3,
9… days.
The library contains 202 authored templates: 24 breaking-input exercises, 47 state
traces, 62 missing-code questions, and 69 approach choices, across all 18 topics.
Fifty-four templates generate visibly different numerical variations; the remaining
148 have fixed prompts (choice order is shuffled). Snippets use Python.

Questions and grading require no LLM calls. Counterexamples are evaluated by fixed
implementations, never by executing submitted code. Answers and reveals are saved
separately in `users/{uid}/light_practice`; each category shows how many questions
are waiting to be revisited. They do not advance FSRS or affect solve counts or mastery.
Core templates live in `server/practice.py`, additional authored choices in
`server/practice_bank.py`, and additional computed exercises in
`server/practice_generated.py`. All content was authored directly during development;
there is no runtime model generation. Tests execute the displayed trace code,
compare bug graders to the displayed implementations and independent references,
and check filled solutions against brute-force or structural expectations; for newer
missing-code questions, every distractor must also fail that check.
Retain versioned question semantics when changing templates so existing question
IDs can still be graded consistently.

## (Legacy) run locally against real Firestore data

Same Firestore data as the deployed app, but running on your machine with
auth bypassed. Needs a service account key instead of Google sign-in:

1. In the Firebase console: **Project settings → Service accounts → Generate
   new private key**. Save the JSON file somewhere outside the repo (it's
   gitignored, but keep it out anyway).
2. Find your Firebase UID (Firebase console → Authentication → Users, or from
   `/api/me` when signed in on the deployed app).
3. Run:
   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\key.json"
   $env:DEV_UID = "<your-firebase-uid>"
   uv run run_local_firestore.py
   ```

This binds to `127.0.0.1` only — don't port-forward it, since auth is
bypassed for whoever can reach it.

## Daily workflow (auto-fill)
1. **Today** tab shows reviews due + new problems from your weakest topics.
2. Click **Start** — it opens the LeetCode tab and starts a timer.
3. Solve it. On Accepted, the app detects it within a few seconds, stops the
   timer, and pops a quick form: confidence (Low/Med/High), how it went
   (solo / hints / read solution), optional notes.
4. That feeds the spaced-repetition schedule and topic stats.

## Where it runs

Two deployments, and they authenticate differently:

- **The laptop**, at `https://leetcode.nikhil.ing`. A Cloudflare Tunnel dials
  out from the box, with Cloudflare Access doing Google sign-in at the edge; the
  app verifies Access's signed assertion itself (`AUTH_MODE=access`) and renders
  no login page of its own. Pushing to `main` deploys it within two minutes.
  See `deploy/README.md`.
- **Cloud Run + Firebase Hosting**, which verifies a Firebase ID token against
  the email allowlist (`AUTH_MODE=firebase`). Set up below.

## Deploy to Firebase

**One-time prerequisites**
1. Create a Firebase project (console.firebase.google.com). Note the **project ID**.
2. Upgrade it to the **Blaze** plan (pay-as-you-go). Cloud Run + Firestore need
   it; the free tier covers a single user at ~$0/month. Requires a card on file.
3. Enable **Firestore** (Native mode) and **Authentication → Google** provider.
4. Add a **Web app** in Project settings; copy its config into
   `static/firebase-config.js` (apiKey, authDomain, projectId, appId).
5. Install tools: `npm i -g firebase-tools`, then `firebase login`.
6. `firebase use --add <your-project-id>`.

**Set your allowlist + deploy the backend (Cloud Run)**
```bash
# Build & deploy the container. Region must match firebase.json (us-central1).
gcloud run deploy leetcode-revision \
  --source . --region us-central1 --allow-unauthenticated \
  --set-env-vars "STORE_BACKEND=firestore,ALLOWED_EMAILS=nikhilkunde1231@gmail.com"
```
(`--allow-unauthenticated` lets the browser reach it; the app enforces auth
itself via the Firebase token + allowlist. Cloud Run's service account has
Firestore access by default.)

**Deploy hosting + rules**
```bash
firebase deploy --only hosting,firestore:rules
```
Your app is now at `https://<project-id>.web.app`. Sign in with your Google
account; only allow-listed emails get through.

### Notes
- `firebase.json` rewrites `/api/**` to the Cloud Run service `leetcode-revision`
  in `us-central1` — keep the region/serviceId in sync if you change them.
- To rotate access, edit `ALLOWED_EMAILS` and redeploy the Cloud Run service.
- The GraphQL endpoint is unofficial; if LeetCode changes it, the queries in
  `server/leetcode.py` are the only thing to adjust.
- Want an extra bot-shield? Enable **Firebase App Check** and verify the token in
  `server/auth.py` — optional for a single user.


### Quickfire offline

Quickfire works without internet as long as the server runs locally with
`AUTH_MODE=local` (Firebase and Cloudflare Access sign-in need the network). Answers are
mirrored to `~/.leetcode-senpai/practice_offline.json` (`PRACTICE_OFFLINE_PATH`
overrides it). When Firestore is unreachable, reads come from that mirror and new
answers or guess marks are queued there. They replay once Firestore answers again: on
the next Quickfire request, or at server start. Replays are idempotent: if an answer is
already on the server, the server's copy wins, as with any retry. A queued write is
removed only after Firestore confirms it. `server/connectivity.py` probes reachability
(a cached TCP connect), so while offline every other API returns a fast 503 rather than
hanging on Firestore retries.

### Quickfire learning controls

Choose an endless stream or a five-/ten-question round, with adaptive, foundation,
standard, or stretch difficulty. Counterexample checks allow retries without
revealing the solution; a successful retry is saved as assisted. Enable “Recall first”
to hide choices before seeing a question. “Answer from memory”
supports trace states (JSON/Python literals) and missing code (matching parsed
structure, not arbitrary equivalent algorithms). No submitted code is executed.

Eight core choice templates have authored distractor feedback; other templates
retain their existing explanations. Twelve curated concept families link different
question formats, guide skill-level selection, and suggest full LeetCode problems
after two unassisted reps. “I guessed” preserves correctness but brings the skill
back sooner. Expandable value tables, completed snippets, and an end-of-round
takeaway provide optional review. Topic panels can launch a Quickfire warm-up.
These features make no LLM calls and do not alter full-solve mastery or FSRS.

An unfinished round can be resumed after refreshing the same browser tab. Its
question, draft, filters, and tally are kept in account-scoped session storage for
up to 24 hours. Resume checks the server's saved answer before retrying an
interrupted submission, so an answer is counted only once. Stopping, finishing,
discarding, or starting a new round clears the checkpoint. Practice still works
when browser storage is unavailable; only refresh recovery is disabled.

### System Design

Choose System Design from the switcher in the top-left app title. It has its own
navigation, separate from the LeetCode workspace (`/#/system-design`).
The section provides three authored cases: a read-heavy link service,
reliable asynchronous jobs, and reservations without double booking. Choose learning
or interview mode, save a structured design, and sketch connections with `A -> B`.
A case brief lets you choose guided or interview practice, time, and target depth.
The design workspace groups your answer into Scope, Architecture, and Trade-offs,
with the brief, coach, and feedback in a companion panel. Drafts are saved to
account-scoped Firestore records; pending edits are also retained
in the browser tab. Conflicting versions require an explicit choice before saving.

Six short lessons and twelve deterministic exercises support targeted repairs and
delayed checks. Revealed answers and lesson-assisted attempts remain marked as
assisted. Evidence summaries describe observed work, not mastery or hiring scores.

Coaching uses the existing OpenRouter key. `SD_TUTOR_MODEL` defaults to
`openai/gpt-6.1-sol` with medium reasoning; `SD_ASSESSOR_MODEL` defaults to
`openai/gpt-6-astra` with high reasoning. Full assessments run on an immutable copy
of the design and case contract. Feedback records the actual model and quotes the
saved answer; retries reuse that snapshot. These model defaults require evaluation
on representative candidate answers before treating assessment quality as validated.
Without coaching configured, saved designs, lessons, and exercises still work.

Assessment jobs run within the web process. After a restart, a pending job can be
retried after three minutes; no separate durable worker is required for this release.
System Design storage requires the server's normal Firestore connectivity.

### System Design curriculum and Quickfire

**Curriculum** is the learning map: eight categories, 32 ordered lessons, and
individual learning objectives with recorded check results. Prerequisites suggest
an order without locking topics. **Lessons** offers the same searchable course;
every lesson has a worked example, trade-off, misconception, further reading, and
three authored knowledge checks. Mark it read and attempt all three checks to
complete it. A perfect check is recorded separately; retakes retain their history.
The original six repair lessons now link into this course. Historical lesson
openings remain exposure, without invented completion or scores.

**System Design Quickfire** contains another 96 authored multiple-choice questions,
separate from the 96 lesson checks. Choose category, topic, beginner/standard/mixed
difficulty, adaptive/mistakes/learned practice, and five, ten, or continuous rounds.
Keys 1–3 select a choice, Enter checks/continues, and Escape stops. Reveals and
“I guessed” are recorded. Grading makes no model calls.

Lesson checks schedule separate application questions for later review. Review
state is per question/concept rather than the six broad design-assessment skills.
Misses, guesses, reveals, and supported work return sooner; clean answers on later
days extend the interval. Same-day feedback exposure marks repeat questions as
supported. Reading a related lesson also marks Quickfire within 24 hours as
supported. An unfinished Quickfire round and selected answer can be recovered
after refreshing the same tab for up to 24 hours; the server's saved answer wins
when a submission response was interrupted. Browser storage is optional.

**Your progress** shows course coverage, latest/best lesson scores, accuracy with
sample counts, supported attempts, due reviews, recent answer explanations, and
the existing full-design observations. Accuracy counts the first independent
answer per question per UTC day; guessed responses count as uncertain. Topic
strength/weakness labels require at least three independent attempts and use the
latest five. Unknown topics remain unassessed. Quiz completion is not a claim of
full-design mastery. The daily process coach receives activity metadata once per
answer, without raw answer text or explanations.

Learning records share the account-scoped `system_design` collection, using
`course_lesson`, `quiz`, and `quickfire` record kinds. Started quizzes/questions
retain immutable grading contracts and stable choice IDs. Submission retries
reuse the same result. No migration or model key is needed. New profiles default
to foundation depth; saved profile choices are preserved. The System Design
sidebar chip shows its own tutor and assessor configurations; saved AI feedback
continues to identify the model that produced it.

Relevant regression checks:

```bash
uv run --locked pytest tests/test_system_design.py tests/test_system_design_learning.py tests/test_daily_coach.py
node --test tests/test_sections_frontend.cjs tests/test_system_design_learning_frontend.cjs
```
