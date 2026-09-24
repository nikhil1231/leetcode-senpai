"""App-level configuration from environment variables.

User-level settings (username, tuning weights, goals) live per-user in the
store, not here. The LeetCode session cookie is never stored server-side — it
arrives on each request as a header and is used transiently.

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
# Enrichment/coaching layer. Optional: when the selected provider's API key is
# unset, every LLM-dependent feature degrades gracefully instead of erroring.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai").lower()
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-5.6-luna")

LLM_OPTIONS = {
    "openai": [
        "gpt-5.6-luna",
        "gpt-5.6-terra",
        "gpt-5.6-sol",
    ],
    "gemini": [
        "gemini-3.5-flash",
        "gemini-3.1-pro-preview",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
    ],
}

# ---- Scheduler ------------------------------------------------------------------
# "fsrs" (modern, fits your review history) or "sm2" (legacy escape hatch).
SCHEDULER = os.environ.get("SCHEDULER", "fsrs").lower()

# Only auto-prompt to annotate freshly-solved problems. Older un-annotated
# attempts (the modal was dismissed, or the solve was days ago) are left alone so
# the "Solved!" modal doesn't nag on every page load. It also bounds how far back
# the untracked-solve sweep looks on its first run: a solve it can't prompt for
# is a solve it would log unrated, which is worse than not logging it.
PENDING_MAX_AGE_SEC = 12 * 3600

DEFAULT_SETTINGS = {
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
