"""App-level configuration from environment variables.

User-level settings (username, tuning weights, goals) live per-user in the
store, not here. The LeetCode session cookie and CSRF token are stored per-user
in Firestore and shared by every device.

V2 note: storage is **Firestore only**. There is no local JSON backend; the app
requires Firestore connectivity. For local dev, run with AUTH_MODE=local plus a
service-account key (GOOGLE_APPLICATION_CREDENTIALS) and your real DEV_UID.
"""
import os

# Auth mode: "firebase" (verify ID token + allowlist), "access" (verify the
# Cloudflare Access assertion the edge attaches — the tunnelled deployment), or
# "local" (bypass, trusted caller — used for local dev against real Firestore).
AUTH_MODE = os.environ.get("AUTH_MODE", "firebase").lower()

# Comma-separated allowlist of Google emails permitted to use the app.
ALLOWED_EMAILS = [
    e.strip().lower()
    for e in os.environ.get("ALLOWED_EMAILS", "").split(",")
    if e.strip()
]

# ---- Cloudflare Access ----------------------------------------------------------
# Set when the app is reached through a Cloudflare Tunnel with an Access policy
# in front of it. The team domain and audience tag together identify which
# application's assertions to trust; leave either unset and nothing is enforced.
ACCESS_TEAM_DOMAIN = (os.environ.get("ACCESS_TEAM_DOMAIN") or "").strip().lower()
ACCESS_AUD = (os.environ.get("ACCESS_AUD") or "").strip()

# The Firebase uid whose Firestore data a verified Access caller reads and
# writes. Single-user app: a verified, allow-listed email *is* this account.
# Defaults to DEV_UID so one variable covers both non-Firebase modes.
# Cloudflare Access service tokens allowed to act as the owner, by client id (the JWT's
# common_name), comma-separated: phone shortcuts and scripts that cannot sign in.
ACCESS_SERVICE_TOKENS = {t.strip() for t in os.environ.get("ACCESS_SERVICE_TOKENS", "").split(",") if t.strip()}
ACCESS_UID = os.environ.get("ACCESS_UID") or os.environ.get("DEV_UID", "local-dev")

# GCP project (set automatically on Cloud Run; needed for Firestore).
GCP_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT")

# Path to a service account key JSON file. When set, Firebase Admin (and thus
# Firestore) authenticates with it explicitly instead of relying on ambient
# credentials. Required for AUTH_MODE=local; on Cloud Run leave unset and the
# service's attached identity is used instead.
GOOGLE_APPLICATION_CREDENTIALS = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")

# UID used when AUTH_MODE=local. Set this to your real Firebase UID so the app
# reads/writes your existing users/{uid} data.
DEV_UID = os.environ.get("DEV_UID", "local-dev")

# Quickfire results made while Firestore is unreachable wait here until they
# sync (see practice_offline.py). Outside the checkout, so a deploy's hard reset
# or clean can never take unsynced answers with it.
PRACTICE_OFFLINE_PATH = os.environ.get("PRACTICE_OFFLINE_PATH") or os.path.join(
    os.path.expanduser("~"), ".leetcode-senpai", "practice_offline.json")

# ---- LLM -----------------------------------------------------------------------
# Enrichment/coaching layer. Optional: when the OpenRouter API key is
# unset, every LLM-dependent feature degrades gracefully instead of erroring.
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
LLM_PROVIDER = "openrouter"
# OpenRouter model IDs include the model vendor (e.g. openai/ or google/).
LLM_MODEL = os.environ.get("LLM_MODEL", "openai/gpt-5.6-luna").strip()
# Re-transcribes dictated answers before grading. Scribe v2 led a 2026-10 bake-off on spoken
# DSA answers: ~1.5% WER, 1.2-2.1s a clip, ~$0.21/hour. gpt-4o-mini-transcribe was a touch
# more accurate but often took 4-6s; Nova-3 was fastest but misheard Dijkstra, Kadane, deque.
# OpenRouter takes no keyterm hints for any STT model yet.
STT_MODEL = os.environ.get("STT_MODEL", "elevenlabs/scribe-v2").strip()
# The conversational tutor talks every turn, so it runs on a cheap model by default
# (~$0.001 a turn). Never an Anthropic model through OpenRouter (see CLAUDE.md).
TUTOR_MODEL = os.environ.get("TUTOR_MODEL", "openai/gpt-6-luna").strip()

# The Telegram drip (server/drip). Only the process with a bot token runs it, so set the token
# in one place (the box). TELEGRAM_CHAT_ID is the one chat it serves; /start tells you yours.
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
TELEGRAM_API = os.environ.get("TELEGRAM_API", "https://api.telegram.org").rstrip("/")
DRIP_PER_DAY = int(os.environ.get("DRIP_PER_DAY", "6"))
DRIP_WINDOW = os.environ.get("DRIP_WINDOW", "08:30-22:30").strip()


# ---- Scheduler ------------------------------------------------------------------
# "fsrs" (modern, fits your review history) or "sm2" (legacy escape hatch).
SCHEDULER = os.environ.get("SCHEDULER", "fsrs").lower()

# Only auto-prompt to annotate freshly-solved problems. Older un-annotated
# attempts (the modal was dismissed, or the solve was days ago) are left alone so
# the "Solved!" modal doesn't nag on every page load. It also bounds how far back
# the untracked-solve sweep looks on its first run: a solve it can't prompt for
# is a solve it would log unrated, which is worse than not logging it.
PENDING_MAX_AGE_SEC = 12 * 3600

# Interview mode in the in-app editor: a plain editor and this many Runs, so the
# code gets traced by hand the way a whiteboard or shared doc makes you. Mocks
# always run this way.
INTERVIEW_RUN_LIMIT = 2

# Interview pace: roughly what a solve of each difficulty gets in a real round.
# The run clock turns amber past it, and the process review reads the solve
# against it. (The plan's "time target" is a big-O, not minutes.)
SOLVE_PAR_SEC = {"Easy": 15 * 60, "Medium": 25 * 60, "Hard": 40 * 60}

# Job Scout owns the career target and career context; Senpai reads it, read-only.
# Unset JOB_SCOUT_URL (e.g. on a laptop) and Senpai keeps the locally saved target.
JOB_SCOUT_URL = os.environ.get("JOB_SCOUT_URL", "").rstrip("/")
JOB_SCOUT_TOKEN = os.environ.get("JOB_SCOUT_TOKEN", "")
JOB_SCOUT_PUBLIC_URL = os.environ.get("JOB_SCOUT_PUBLIC_URL", "https://jobs.nikhil.ing").rstrip("/")

# Services on the box (a Telegram bot, the Threads card, …) call /api/knowledge without a
# browser sign-in: "name:token,name2:token2". A token acts as the owner (ACCESS_UID) and its
# name becomes the source of what it records. Unset: browser sign-in only.
KNOWLEDGE_SOURCE_TOKENS = {
    name.strip(): token.strip()
    for name, token in (pair.split(":", 1) for pair in os.environ.get("KNOWLEDGE_SOURCE_TOKENS", "").split(",") if ":" in pair)
    if name.strip() and token.strip()}

SENPAI_CHARTER = """Teach me, don't just assign work. Prefer retrieval and explanation before more volume.
Diagnose before prescribing remedial work; an untouched topic is unknown, not weak.
Use my real projects as context when it helps. Keep advice to one change at a time.
Respect interview mode: no hints there unless I ask, and record any help as assistance."""

DEFAULT_SETTINGS = {
    "target_job": "",
    # Where target_job came from: "local" (typed here) or "job_scout" (a synced copy).
    "target_job_source": "local",
    "senpai_charter": SENPAI_CHARTER,
    "senpai_weekly_minutes": 420,
    "senpai_session_minutes": 60,
    "senpai_mode": "mixed",
    "senpai_depth": "balanced",
    "senpai_focus_note": "",
    "senpai_weekly_day": 7,  # ISO weekday of the weekly review (7 = Sunday)
    "senpai_learning_rate": 0.5,
    "senpai_max_weekly_shift": 0.10,
    "senpai_max_focus": 3,
    "senpai_focus_cooldown_days": 7,
    "senpai_min_evidence_weeks": 2,
    "daily_coach_enabled": True,
    "daily_coach_timezone": "UTC",
    "daily_coach_time": "00:05",
    "username": "kunde",
    "poll_interval_seconds": 20,
    "review_limit": 5,
    "new_limit": 2,
    "drill_limit": 3,
    "drill_min_signal": 0.35,
    # Days a problem stays off the drill / sprint lane after it's been practiced
    # there, so a just-completed rep doesn't immediately re-serve.
    "drill_cooldown_days": 7,
    "sprint_cooldown_days": 7,
    "weakness_weight": 0.6,
    "breadth_weight": 0.4,
    "mistake_weight": 0.2,
    # Weekly goals (gamification).
    "goal_reviews_per_week": 20,
    "goal_new_per_week": 5,
    # Discover defaults.
    "discover_min_like_ratio": 0.85,
    "discover_min_votes": 500,
    # LLM provider/model selection. API keys still come from environment vars.
    "llm_provider": LLM_PROVIDER,
    "llm_model": LLM_MODEL,
}


def local_mode() -> bool:
    """True when browser authentication is bypassed (AUTH_MODE=local)."""
    return AUTH_MODE == "local"


def access_mode() -> bool:
    """True when Cloudflare Access assertions authenticate every request."""
    return AUTH_MODE == "access"


def signin_required() -> bool:
    """True when the page must render its own Google sign-in gate.

    Local mode has no gate, and under Access the edge has already signed the
    caller in before the request reaches us — a second gate would just be a
    second login.
    """
    return not (local_mode() or access_mode())


def init_firebase_admin():
    """Idempotently initialize the Firebase Admin SDK.

    Uses GOOGLE_APPLICATION_CREDENTIALS as an explicit service account key
    file when set (local runs); otherwise falls back to the ambient
    credentials Cloud Run provides.
    """
    import firebase_admin
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass
    cred = None
    if GOOGLE_APPLICATION_CREDENTIALS:
        from firebase_admin import credentials
        cred = credentials.Certificate(GOOGLE_APPLICATION_CREDENTIALS)
    options = {"projectId": GCP_PROJECT} if GCP_PROJECT else None
    try:
        return firebase_admin.initialize_app(cred, options)
    except ValueError:
        return firebase_admin.get_app()

# Rollback keeps additive readers and stored evidence. All switches default on;
# set LEARNING_<NAME>=false to disable one.
LEARNING_FEATURES = {
    name: os.environ.get('LEARNING_' + name.upper(), default).lower() == 'true'
    for name, default in [('taxonomy', 'true'), ('assessment', 'true'),
        ('evidence', 'true'), ('recovery', 'true'), ('quickfire', 'true')]
}
