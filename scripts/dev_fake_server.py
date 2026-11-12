"""Run the real API on an in-memory FakeStore seeded with a plausible history. No Firestore, no network, no LLM.

    uv run scripts/dev_fake_server.py            # http://127.0.0.1:8000

Auth is bypassed and nothing is persisted, so it is the safe thing to point `web/` (or a browser) at while
building UI. Model calls are rejected, so every LLM feature shows its non-LLM state.
"""
import os
import sys
import tempfile

os.environ.setdefault("AUTH_MODE", "local")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uvicorn  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth, config, connectivity, llm, main, poller  # noqa: E402
from server.neetcode150 import NEETCODE_150  # noqa: E402
from tests.fake_store import FakeStore  # noqa: E402

DIFFICULTY = ["Easy", "Medium", "Medium", "Hard"]


def seed(store):
    n = 0
    for category, slugs in NEETCODE_150.items():
        for i, slug in enumerate(slugs):
            n += 1
            store.upsert_problem({
                "slug": slug, "title": slug.replace("-", " ").title(), "difficulty": DIFFICULTY[(n + i) % 4],
                "neetcode_category": category, "in_library": True, "frontend_id": n,
                "packs": ["neetcode150"], "url": f"https://leetcode.com/problems/{slug}/", "similar_slugs": [],
            })


def log_history(client):
    """Solve the first few problems of each category, with a spread of confidence and independence."""
    plan = [(3, "solo"), (2, "hints"), (1, "solution"), (3, "solo"), (2, "solo")]
    k = 0
    for slugs in NEETCODE_150.values():
        for i, slug in enumerate(slugs[:4]):
            conf, ind = plan[(k + i) % len(plan)]
            res = client.post("/api/attempt/manual", json={
                "slug": slug, "time_taken_sec": 300 + 137 * ((k + i) % 7), "confidence": conf, "independence": ind,
                "approach": "Hash map" if i % 2 else "Two pointers",
                "complexity_time": "O(n)", "complexity_space": "O(n)",
            })
            client.post(f"/api/attempt/{res.json()['attempt_id']}/dismiss-annotation")   # nothing waits to be annotated
        k += 1


def build():
    store = FakeStore("dev")
    seed(store)
    for name, module in list(sys.modules.items()):   # modules import get_store by name, so patch each binding
        if name.startswith("server") and hasattr(module, "get_store"):
            module.get_store = lambda uid: store
    connectivity.online = lambda: True
    config.PRACTICE_OFFLINE_PATH = os.path.join(tempfile.mkdtemp(prefix="senpai-fake-"), "practice_offline.json")
    config.OPENROUTER_API_KEY = None
    llm._catalog_models, llm._catalog_expires = [], float("inf")

    def reject(*args, **kwargs):
        raise RuntimeError("Model calls are off in the fake dev server")
    for name in ("_raw_generate", "_raw_transcribe", "_raw_image", "_raw_look"):
        setattr(llm, name, reject)
    async def no_leetcode(*args, **kwargs):   # the real poller would ask leetcode.com about a real account
        return []
    poller.check_active_sessions = poller.sweep_untracked_solves = no_leetcode
    main.app.dependency_overrides[auth.require_user] = lambda: "dev"
    main.app.dependency_overrides[auth.leetcode_auth] = lambda: None
    log_history(TestClient(main.app))
    return main.app


if __name__ == "__main__":
    uvicorn.run(build(), host="127.0.0.1", port=int(os.environ.get("PORT", "8000")), log_level="warning")
