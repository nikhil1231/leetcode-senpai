"""Local dev entry point (Firestore-only, V2).

The app requires Firestore. For local dev, run with auth bypassed but pointed at
your real Firestore data via a service-account key and your real UID:

    AUTH_MODE=local \
    GOOGLE_APPLICATION_CREDENTIALS=/path/key.json \
    GOOGLE_CLOUD_PROJECT=your-project \
    DEV_UID=<your-firebase-uid> \
    GEMINI_API_KEY=<optional, unlocks the coaching layer> \
    python run.py

Then open http://127.0.0.1:8000. Without GEMINI_API_KEY the app still runs; the
LLM-powered features degrade gracefully.

For convenience, if a `.env.local` file exists at the project root (KEY=VALUE
per line, `#` comments allowed), it's loaded before anything else — so you can
set the vars above once instead of retyping them. Never committed; not baked
into the Docker image (see .dockerignore / .gcloudignore).

Against the Firestore emulator instead of live data:
    AUTH_MODE=local FIRESTORE_EMULATOR_HOST=localhost:8080 \
    GOOGLE_CLOUD_PROJECT=demo python run.py
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))


def _load_dotenv_local():
    path = os.path.join(ROOT, ".env.local")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


_load_dotenv_local()
os.environ.setdefault("AUTH_MODE", "local")

import uvicorn

if __name__ == "__main__":
    uvicorn.run("server.main:app", host="127.0.0.1", port=8000, reload=True)
