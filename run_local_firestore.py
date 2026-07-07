"""Local entry point that talks to the REAL Firestore backend, with browser
auth bypassed. Use this to work on your actual data without deploying.

Required env vars:
    GOOGLE_APPLICATION_CREDENTIALS   path to a service account key JSON file
    DEV_UID                          your existing Firebase UID (so this reads
                                      the same users/{uid} data as Cloud Run)

Optional:
    GOOGLE_CLOUD_PROJECT             defaults to "leetcode-senpai"

    $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\to\\key.json"
    $env:DEV_UID = "<your-firebase-uid>"
    python run_local_firestore.py
Then open http://127.0.0.1:8000

Binds to loopback only. Never expose this profile via port forwarding —
auth is bypassed, so anything that can reach it can read/write your data.
"""
import os

os.environ["STORE_BACKEND"] = "firestore"
os.environ["AUTH_MODE"] = "local"
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "leetcode-senpai")

if not os.environ.get("DEV_UID"):
    raise SystemExit("DEV_UID is required (your Firebase UID) - set it and re-run.")
if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
    raise SystemExit(
        "GOOGLE_APPLICATION_CREDENTIALS is required (path to a service account key JSON file)."
    )

import uvicorn

if __name__ == "__main__":
    uvicorn.run("server.main:app", host="127.0.0.1", port=8000, reload=True)
