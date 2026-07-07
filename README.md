# LeetCode Revision (V2)

A personal tool to rebuild LeetCode skills. It auto-logs your solves, then
**coaches** them: it grows your library with community-vetted problems, trains
pattern recognition, turns every free-text note into structured signal with
Gemini, and schedules what to do next with FSRS spaced repetition + topic and
mistake weighting.

Auto-logging works by polling LeetCode's GraphQL API for your accepted
submissions — no browser extension.

### What V2 adds over V1
- **Discover engine** — import curated packs (NeetCode 150, Blind 75, Grind 75)
  or browse the whole problem set filtered to only highly-liked problems
  (like-ratio + vote thresholds). Smart expansion suggests the next great
  problem when you clear a topic.
- **Coaching layer (Gemini Flash, optional)** — classifies what went wrong,
  grades your up-front pattern predictions, generates per-problem hint ladders,
  grades from-memory recall against your own past code, writes a weekly report
  and per-topic playbooks. All off the critical path; degrades gracefully with
  no API key.
- **Pattern-recognition training** — predict the pattern before you start;
  approach-recall reviews instead of full re-solves for short-interval cards.
- **Insights** — review forecast, mastery radar (now vs 30 days ago), pace
  projection, time-to-solve trends, failure-mode breakdown, prediction accuracy.
- **Mock interviews + gamification** — weekly 3-problem timed gauntlet with a
  score trend; weekly goals, daily XP, mastery moments.
- **FSRS** scheduler (swappable back to SM-2 via `SCHEDULER=sm2`).

## Storage: Firestore only
V2 is **Firestore-only** — there is no local JSON backend. The app requires
Firestore connectivity. Migrate any old `local_data.json` with
`scripts/migrate_local_to_firestore.py` (see below).

## Architecture
```
Browser (static SPA on Firebase Hosting)
   │  Google sign-in -> ID token (Bearer)         LeetCode cookie (localStorage)
   ▼                                               sent as X-LC-* headers
Cloud Run  ── FastAPI (server/) ──► Firestore (Admin SDK, per-user data)
   │                              └► Gemini API (enrichment, off critical path)
   └── calls LeetCode GraphQL using the cookie (transient, never stored)
```
- **Firestore is locked** (`firestore.rules` deny-all); all access is through the
  backend's Admin SDK.
- **Backend verifies** the Firebase ID token and checks the email allowlist on
  every request (`server/auth.py`).
- **The LeetCode session cookie** lives only in your browser's `localStorage`,
  is sent per-request as a header, and is never persisted or logged server-side.
- **Gemini output is derived data**, never the source of truth. Raw notes/code
  are kept; enrichments are stamped with a prompt version and re-runnable.

```
server/           FastAPI backend (containerized for Cloud Run)
  main.py         routes + auth dependencies + static serving
  auth.py         Firebase token verification + email allowlist
  store.py        Firestore store (Firestore-only)
  scheduler.py    pure queue/topic/mistake logic (no I/O)
  fsrs_engine.py  FSRS review engine (behind scheduler's interface)
  llm.py          Gemini extract() abstraction + task registry
  enrich.py       per-attempt enrichment pipeline + sweep
  coach.py        hints, recall grading, weekly report, playbooks
  insights.py     pure analytics for the Insights tab
  mock.py         mock-interview assembly + scoring
  gamify.py       mastery-moment detection
  packs.py        curated list packs + tag->category mapping
  importer.py     pack import, discover, history backfill
  poller.py       on-demand solve detection
  leetcode.py     GraphQL client (cookie passed in per call)
  neetcode150.py  the backbone list (slugs by category)
  config.py       env-driven app config
static/           vanilla-JS SPA (app.js + views.js + charts.js), Firebase Auth
scripts/          migrate_local_to_firestore.py
tests/            pytest (scheduler, FSRS, discover, insights, API, llm)
```

## Run locally (Firestore-only)
```bash
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```
The app needs Firestore. For local dev, bypass browser auth but point at your
real Firestore data with a service-account key:
```bash
AUTH_MODE=local \
GOOGLE_APPLICATION_CREDENTIALS=/path/key.json \
GOOGLE_CLOUD_PROJECT=your-project \
DEV_UID=<your-firebase-uid> \
GEMINI_API_KEY=<optional — unlocks the coaching layer> \
python run.py
```
Open http://127.0.0.1:8000. Without `GEMINI_API_KEY` everything still works; the
LLM-powered features degrade gracefully. In **Settings** set your username +
`LEETCODE_SESSION` cookie; in **Discover** import a pack and backfill history.

### Migrate old local_data.json
```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/key.json GOOGLE_CLOUD_PROJECT=your-project \
DEV_UID=<your-firebase-uid> python scripts/migrate_local_to_firestore.py
```
(`--dry-run` first to preview counts. Your `local_data.json` is left as backup.)

### Tests
```bash
.venv\Scripts\python.exe -m pytest      # 56 tests, no Firestore/network needed
```

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
   python run_local_firestore.py
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
