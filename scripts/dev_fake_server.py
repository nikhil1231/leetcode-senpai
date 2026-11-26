"""Run the real API on an in-memory FakeStore seeded with a plausible history. No Firestore, no network, no LLM.

    uv run scripts/dev_fake_server.py            # http://127.0.0.1:8000
    FAKE_CHAT=1 uv run scripts/dev_fake_server.py   # chats answer with canned replies, streamed slowly
    CONCURRENCY_JSON='/tmp/q_*.json' uv run scripts/dev_fake_server.py   # with generated concurrency questions

Auth is bypassed and nothing is persisted, so it is the safe thing to point `web/` (or a browser) at while
building UI. Model calls are rejected, so every LLM feature shows its non-LLM state. With FAKE_CHAT the plain chats
(page coach, tutor) answer with a canned reply instead, never touching the network, to build and check chat UI.
"""
import asyncio
import os
import sys
import tempfile

os.environ.setdefault("AUTH_MODE", "local")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uvicorn  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import auth, config, connectivity, llm, main, packs, poller  # noqa: E402
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
    for name in ("concurrency", "sql"):   # practice for the Fundamentals lessons
        for slug, category in packs.get_pack(name)["category_map"].items():
            n += 1
            store.upsert_problem({
                "slug": slug, "title": slug.replace("-", " ").title(), "difficulty": DIFFICULTY[n % 2],
                "neetcode_category": category, "in_library": True, "frontend_id": n,
                "packs": [name], "url": f"https://leetcode.com/problems/{slug}/", "similar_slugs": [],
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


TUTOR_REPLY = """Good start.<private>He has the miss storm but not the fix.</private> When every key changes at once, **every read misses** and goes to the database together.

- The cache is cold for all keys at the same moment.
- The database sees the whole read load, not the usual 5%.

[[note knows mass misses]]Here is the picture:

```diagram
title: Cold cache
nodes:
  - {id: app, label: App, at: [0, 0]}
  - {id: db, label: Database, at: [2, 0]}
edges:
  - [app, db, every read]
```

What would you do to stop the stampede? Try this one.
[[activity b1]]"""
COACH_REPLY = """`exp >>= 1` halves the exponent, so each loop **consumes one bit**. Your `exp -= 1` only removes one multiplication.

```python
while exp:
    if exp & 1:
        result *= base
    base *= base
    exp >>= 1
```

That is why it runs in O(log n) rather than O(n)."""


def fake_reply(messages):
    """The tutor's prompt asks for <private> notes and markers; every other chat gets a plain reply."""
    return TUTOR_REPLY if "<private>" in messages[0]["content"] else COACH_REPLY


async def fake_stream(model, messages, options=None):
    text = fake_reply(messages)
    for i in range(0, len(text), 6):
        await asyncio.sleep(0.03)
        yield {"text": text[i:i + 6]}
    yield {"model": "fake/chat", "usage": {}}


def build():
    store = FakeStore("dev")
    seed(store)
    if os.environ.get("CAREER_JSON"):   # a Job Scout /api/senpai/context export, for the Experience pages
        import json, time
        ctx = json.load(open(os.environ["CAREER_JSON"]))
        store.put_senpai("senpai_career", "material", {k: ctx.get(k) or [] for k in ("stories", "questions", "general_answers", "applications")}
                         | {"fetched_at": time.time()})
    if os.environ.get("CONCURRENCY_JSON"):   # a glob of generated questions (one JSON each) for the custom concurrency list
        import glob, json
        from server.concurrency import queue as concurrency_queue
        for path in sorted(glob.glob(os.environ["CONCURRENCY_JSON"])):
            q = json.load(open(path))
            store.put_track_record(concurrency_queue.QK, q["id"], q)
    for name, module in list(sys.modules.items()):   # modules import get_store by name, so patch each binding
        if name.startswith("server") and hasattr(module, "get_store"):
            module.get_store = lambda uid: store
    connectivity.online = lambda: True
    config.PRACTICE_OFFLINE_PATH = os.path.join(tempfile.mkdtemp(prefix="senpai-fake-"), "practice_offline.json")
    config.OPENROUTER_API_KEY = None
    # A small offline catalog, so Settings > AI models has something to offer without calling OpenRouter.
    llm._catalog, llm._catalog_expires = [
        {"id": m, "supported_parameters": ["structured_outputs"],
         "architecture": {"input_modalities": ["text", "image"], "output_modalities": out}}
        for m, out in (("openai/gpt-6.1-terra", ["text"]), ("openai/gpt-6-luna", ["text"]), ("openai/gpt-6.1-sol", ["text"]),
                       ("deepseek/deepseek-v4.1-flash", ["text"]), ("google/gemini-nano-banana-2.1", ["image", "text"]))], float("inf")

    def reject(*args, **kwargs):
        raise RuntimeError("Model calls are off in the fake dev server")
    for name in ("_raw_generate", "_raw_transcribe", "_raw_image", "_raw_look"):
        setattr(llm, name, reject)
    if os.environ.get("FAKE_CHAT"):
        config.OPENROUTER_API_KEY = "fake"
        llm._raw_chat = lambda model, messages, options=None: {"content": fake_reply(messages), "model": "fake/chat", "usage": {}}
        llm._raw_chat_stream = fake_stream
    else:
        llm._raw_chat = reject

    async def no_leetcode(*args, **kwargs):   # the real poller would ask leetcode.com about a real account
        return []
    poller.check_active_sessions = poller.sweep_untracked_solves = no_leetcode
    main.app.dependency_overrides[auth.require_user] = lambda: "dev"
    main.app.dependency_overrides[auth.leetcode_auth] = lambda: None
    log_history(TestClient(main.app))
    return main.app


if __name__ == "__main__":
    uvicorn.run(build(), host="127.0.0.1", port=int(os.environ.get("PORT", "8000")), log_level="warning")
