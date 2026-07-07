"""Weekly mock-interview mode.

Assembles a 3-problem gauntlet (one due review, one new from a strong topic, one
new from a weak topic), runs under a single 60-minute timer with hints disabled,
and scores the set once. Sessions are ordinary sessions tagged kind="mock"; the
score is computed from the mock's attempts on finish.
"""
import datetime as dt
import time

from . import scheduler

MOCK_DURATION_SEC = 60 * 60


def _in_library(p):
    return scheduler._in_library(p)


def assemble(store, today=None):
    """Pick 3 problems: a due review, a new-from-strong-topic, a new-from-weak."""
    today = today or dt.date.today()
    problems = store.list_problems()
    attempts = store.list_attempts()
    reviews = store.list_reviews()
    pm = {p["slug"]: p for p in problems}
    attempted = {a["slug"] for a in attempts}
    stats = scheduler.topic_stats(problems, attempts)  # weakest first
    picks = []

    # 1. a due (or any) review card
    iso = today.isoformat()
    due = [r for r in reviews if r.get("due_date") and r["due_date"] <= iso]
    due.sort(key=lambda r: r["due_date"])
    pool = due or reviews
    for r in pool:
        if r["slug"] in pm:
            picks.append(_item(pm[r["slug"]], "review"))
            break

    def _new_from(cat):
        for p in problems:
            if (p.get("neetcode_category") == cat and _in_library(p)
                    and p["slug"] not in attempted
                    and p["slug"] not in {x["slug"] for x in picks}):
                return _item(p, "new")
        return None

    # 2. new from strongest topic, 3. new from weakest topic
    if stats:
        strong = _new_from(stats[-1]["category"])
        if strong:
            picks.append(strong)
        weak = _new_from(stats[0]["category"])
        if weak:
            picks.append(weak)

    # backfill to 3 with any unattempted library problems
    if len(picks) < 3:
        have = {x["slug"] for x in picks}
        for p in problems:
            if len(picks) >= 3:
                break
            if _in_library(p) and p["slug"] not in attempted and p["slug"] not in have:
                picks.append(_item(p, "new"))
                have.add(p["slug"])
    return picks[:3]


def _item(p, role):
    return {"slug": p["slug"], "title": p.get("title", p["slug"]),
            "difficulty": p.get("difficulty", "Unknown"),
            "category": p.get("neetcode_category"), "url": p.get("url"), "role": role}


def start(store, today=None):
    picks = assemble(store, today)
    now = int(time.time())
    doc = {"problems": picks, "started_at": now, "duration_sec": MOCK_DURATION_SEC,
           "status": "active", "score": None, "finished_at": None}
    mid = store.add_mock(doc)
    return {"id": mid, **doc}


_INDEP_FACTOR = {"solo": 1.0, "hints": 0.55, "solution": 0.2}


def score(store, mock):
    """0..100 from solved/independence across the 3 problems within the window."""
    start_ts = mock["started_at"]
    end_ts = start_ts + mock.get("duration_sec", MOCK_DURATION_SEC)
    slugs = {p["slug"] for p in mock["problems"]}
    n = len(mock["problems"]) or 1
    per = 100.0 / n
    best = {}
    for a in store.list_attempts():
        if a["slug"] not in slugs:
            continue
        ts = a.get("solved_at") or 0
        if not (start_ts <= ts <= end_ts + 5):
            continue
        factor = _INDEP_FACTOR.get(a.get("independence"), 0.7)
        best[a["slug"]] = max(best.get(a["slug"], 0.0), factor)
    total = sum(per * f for f in best.values())
    return round(total), len(best)


def finish(store, mock_id):
    mock = store.get_mock(mock_id)
    if not mock:
        return None
    sc, solved = score(store, mock)
    store.update_mock(mock_id, {"status": "finished", "score": sc,
                                "finished_at": int(time.time()), "solved_count": solved})
    return {**mock, "id": mock_id, "status": "finished", "score": sc, "solved_count": solved}


def taken_this_week(store, today=None):
    today = today or dt.date.today()
    yw = today.isocalendar()[:2]
    for m in store.list_mocks():
        ts = m.get("started_at")
        if ts and dt.datetime.fromtimestamp(ts).date().isocalendar()[:2] == yw:
            return True
    return False
