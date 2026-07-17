"""App-level configuration from environment variables.

User-level settings (username, tuning weights, goals) live per-user in the
store, not here. The LeetCode session cookie is never stored server-side — it
arrives on each request as a header and is used transiently.

V2 note: storage is **Firestore only**. There is no local JSON backend; the app
requires Firestore connectivity. For local dev, run with AUTH_MODE=local plus a
service-account key (GOOGLE_APPLICATION_CREDENTIALS) and your real DEV_UID.
"""
import os

# Auth mode: "firebase" (verify ID token + allowlist) or "local" (bypass,
# trusted caller — used for local dev against real Firestore).
AUTH_MODE = os.environ.get("AUTH_MODE", "firebase").lower()

# Comma-separated allowlist of Google emails permitted to use the app.
ALLOWED_EMAILS = [
    e.strip().lower()
    for e in os.environ.get("ALLOWED_EMAILS", "").split(",")
    if e.strip()
]

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

# ---- LLM (Gemini) ---------------------------------------------------------------
# Enrichment/coaching layer. Optional: when GEMINI_API_KEY is unset, every
# LLM-dependent feature degrades gracefully instead of erroring.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
LLM_MODEL = os.environ.get("LLM_MODEL", "gemini-2.5-flash")

# ---- Scheduler ------------------------------------------------------------------
# "fsrs" (modern, fits your review history) or "sm2" (legacy escape hatch).
SCHEDULER = os.environ.get("SCHEDULER", "fsrs").lower()

DEFAULT_SETTINGS = {
    "username": "kunde",
    "poll_interval_seconds": 20,
    "review_limit": 5,
    "new_limit": 2,
    "drill_limit": 3,
    "drill_min_signal": 0.35,
    "weakness_weight": 0.6,
    "breadth_weight": 0.4,
    "mistake_weight": 0.2,
    # Weekly goals (gamification).
    "goal_reviews_per_week": 20,
    "goal_new_per_week": 5,
    # Discover defaults.
    "discover_min_like_ratio": 0.85,
    "discover_min_votes": 500,
}


def local_mode() -> bool:
    """True when browser authentication is bypassed (AUTH_MODE=local)."""
    return AUTH_MODE == "local"


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
