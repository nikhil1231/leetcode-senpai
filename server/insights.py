"""Analytics — pure functions over plain data (like scheduler.py, no I/O).

Everything the Insights tab renders is computed here so it's unit-testable. The
thin `build(store, today)` aggregator loads from the store and calls the pure
functions.
"""
import datetime as dt

from .neetcode150 import CATEGORY_ORDER
from . import scheduler


def _today(today=None):
    return today or dt.date.today()


def _iso(d):
    return d.isoformat()


def _median(xs):
    if not xs:
        return None
    s = sorted(xs)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2


def _tags_of(enrichment):
    return (enrichment.get("user_overrides") or {}).get("tags") or enrichment.get("mistake_tags") or []


# ---- review forecast ------------------------------------------------------------
def review_forecast(reviews, days=30, today=None):
    """Due-card counts for each of the next `days` days (index 0 = overdue+today)."""
    today = _today(today)
    buckets = [0] * days
    overdue = 0
    for r in reviews:
        due = r.get("due_date")
        if not due:
            continue
        try:
            d = dt.date.fromisoformat(due)
        except ValueError:
            continue
        delta = (d - today).days
        if delta < 0:
            overdue += 1
        elif delta < days:
            buckets[delta] += 1
    return {"start": _iso(today), "days": days, "counts": buckets, "overdue": overdue}


# ---- mastery now vs. past -------------------------------------------------------
def mastery_radar(problems, attempts, days=30, today=None):
    """Current mastery per category with a ghost overlay of `days` ago."""
    today = _today(today)
    cutoff = int((dt.datetime.combine(today, dt.time()) - dt.timedelta(days=days)).timestamp())
    now_stats = {s["category"]: s for s in scheduler.topic_stats(problems, attempts)}
    past_attempts = [a for a in attempts if (a.get("solved_at") or 0) <= cutoff]
    past_stats = {s["category"]: s for s in scheduler.topic_stats(problems, past_attempts)}
    cats = [c for c in CATEGORY_ORDER if c in now_stats]
    return [{
        "category": c,
        "mastery": now_stats[c]["mastery"],
        "mastery_past": past_stats.get(c, {}).get("mastery", 0.0),
        "coverage": now_stats[c]["coverage"],
    } for c in cats]


# ---- time-to-solve trend --------------------------------------------------------
def time_to_solve_trend(problems, attempts, today=None):
    """Weekly median solve time (minutes) per difficulty."""
    diff_of = {p["slug"]: p.get("difficulty", "Unknown") for p in problems}
    by_diff_week = {}
    for a in scheduler._solved_attempts(attempts):
        t = a.get("time_taken_sec")
        ts = a.get("solved_at")
        if not t or not ts:
            continue
        diff = diff_of.get(a["slug"], "Unknown")
        d = dt.datetime.fromtimestamp(ts).date()
        y, w, _ = d.isocalendar()
        key = f"{y}-W{w:02d}"
        by_diff_week.setdefault(diff, {}).setdefault(key, []).append(t / 60.0)
    out = {}
    for diff, weeks in by_diff_week.items():
        series = [{"week": k, "median_min": round(_median(v), 1), "n": len(v)}
                  for k, v in sorted(weeks.items())]
        out[diff] = series
    return out


# ---- pace projection ------------------------------------------------------------
def pace_projection(problems, attempts, today=None, window_days=14):
    """Project library-completion date from the recent new-solve rate."""
    today = _today(today)
    total = sum(1 for p in problems if scheduler._in_library(p))
    solved_attempts = scheduler._solved_attempts(attempts)
    solved = len({a["slug"] for a in solved_attempts})
    remaining = max(0, total - solved)
    cutoff = int((dt.datetime.combine(today, dt.time()) - dt.timedelta(days=window_days)).timestamp())
    recent_new = len({a["slug"] for a in solved_attempts
                      if (a.get("solved_at") or 0) >= cutoff})
    rate = recent_new / window_days  # problems/day
    if rate <= 0 or remaining == 0:
        eta = None
        days_left = None
    else:
        days_left = int(remaining / rate + 0.5)
        eta = _iso(today + dt.timedelta(days=days_left))
    return {"total": total, "solved": solved, "remaining": remaining,
            "rate_per_week": round(rate * 7, 1), "eta": eta, "days_left": days_left}


# ---- failure-mode breakdown -----------------------------------------------------
def failure_modes(enrichments, days=None, attempts=None, today=None):
    """Count of each mistake tag (overrides win). Optionally windowed by days."""
    keep = None
    if days is not None and attempts is not None:
        today = _today(today)
        cutoff = int((dt.datetime.combine(today, dt.time()) - dt.timedelta(days=days)).timestamp())
        keep = {a["id"] for a in scheduler._solved_attempts(attempts)
                if (a.get("solved_at") or 0) >= cutoff}
    counts = {}
    for e in enrichments:
        if keep is not None and e.get("attempt_id") not in keep:
            continue
        for t in _tags_of(e):
            counts[t] = counts.get(t, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: kv[1], reverse=True))


# ---- prediction accuracy --------------------------------------------------------
def prediction_accuracy(problems, attempts, enrichments):
    """Per category: correct / partial / wrong counts from prediction verdicts."""
    cat_of = {p["slug"]: p.get("neetcode_category") for p in problems}
    attempt_cat = {a["id"]: cat_of.get(a["slug"]) for a in attempts}
    attempt_kind = {a["id"]: a.get("kind") or "unknown" for a in attempts}
    out = {}
    by_kind = {}
    total = {"correct": 0, "partial": 0, "wrong": 0}
    for e in enrichments:
        v = e.get("prediction_verdict")
        if v not in ("correct", "partial", "wrong"):
            continue
        cat = attempt_cat.get(e.get("attempt_id"))
        if not cat:
            continue
        row = out.setdefault(cat, {"correct": 0, "partial": 0, "wrong": 0})
        row[v] += 1
        total[v] += 1
        kind = attempt_kind.get(e.get("attempt_id"), "unknown")
        kind_row = by_kind.setdefault(kind, {"correct": 0, "partial": 0, "wrong": 0})
        kind_row[v] += 1
    graded = sum(total.values())
    overall = round(total["correct"] / graded, 3) if graded else None
    return {"by_category": out, "overall_correct_rate": overall, "graded": graded,
            "by_kind": by_kind, "sprint_graded": sum(by_kind.get("sprint", {}).values())}


# ---- mock score trend -----------------------------------------------------------
def mock_score_trend(mocks):
    done = [m for m in mocks if m.get("score") is not None and m.get("finished_at")]
    done.sort(key=lambda m: m["finished_at"])
    return [{"date": _iso(dt.datetime.fromtimestamp(m["finished_at"]).date()),
             "score": m["score"]} for m in done]


# ---- aggregator -----------------------------------------------------------------
def build(store, today=None):
    problems = store.list_problems()
    attempts = store.list_attempts()
    reviews = store.list_reviews()
    enrichments = store.list_enrichments()
    mocks = store.list_mocks()
    return {
        "forecast": review_forecast(reviews, today=today),
        "mastery_radar": mastery_radar(problems, attempts, today=today),
        "time_trend": time_to_solve_trend(problems, attempts, today=today),
        "pace": pace_projection(problems, attempts, today=today),
        "failure_modes": failure_modes(enrichments, days=30, attempts=attempts, today=today),
        "failure_modes_all": failure_modes(enrichments),
        "prediction_accuracy": prediction_accuracy(problems, attempts, enrichments),
        "mock_trend": mock_score_trend(mocks),
    }
