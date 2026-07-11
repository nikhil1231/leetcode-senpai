"""Scheduling brain — pure functions over plain Python data (no I/O).

Callers load problems / attempts / reviews / enrichments from the store, pass
them in, and persist whatever comes back. This keeps the spaced-repetition +
topic-weighting logic trivially unit-testable.

The review engine (advance_review / seed_review) dispatches on config.SCHEDULER
so SM-2 and FSRS share one interface; see fsrs_engine.py for the FSRS side.
"""
import datetime as dt

from . import config
from .neetcode150 import CATEGORY_ORDER

CONF_TO_Q = {1: 3, 2: 4, 3: 5}  # low / medium / high on SM-2's 0..5 scale
RECALL_TO_Q = {0: 1, 1: 3, 2: 4, 3: 5}  # recall grade -> quality
RECALL_INTERVAL_CAP = 21  # cards shorter than this are reviewed by recall, not full solve


def _today(today=None):
    return today or dt.date.today()


def _iso(d):
    return d.isoformat()


def _in_library(p):
    """A problem the user has added to their library (any pack) vs. a
    discover-cached candidate they've only browsed."""
    if "in_library" in p:
        return bool(p["in_library"])
    if p.get("packs"):
        return True
    return bool(p.get("in_neetcode150", True))


# ---- confidence / grade ---------------------------------------------------------
def quality(confidence, independence):
    if independence == "solution":
        return 1  # read the solution => failed recall, reset the card
    q = CONF_TO_Q.get(confidence, 4)
    if independence == "hints":
        q = min(q, 3)
    return q


def recall_quality(grade):
    """Map a 0..3 approach-recall grade to SM-2/FSRS quality."""
    return RECALL_TO_Q.get(grade, 4)


# ---- SM-2 -----------------------------------------------------------------------
def seed_review(slug, today=None):
    """Neutral review card for a backfilled solve with no annotation."""
    if config.SCHEDULER == "fsrs":
        from . import fsrs_engine
        return fsrs_engine.seed_review(slug, today=_today(today))
    today = _today(today)
    return {
        "slug": slug, "reps": 1, "ease": 2.5, "interval_days": 3,
        "due_date": _iso(today + dt.timedelta(days=3)),
        "last_reviewed": _iso(today), "fail_count": 0, "leech": 0,
    }


def advance_review(current, confidence, independence, today=None, grade=None):
    """Return the next review card state. `current` may be None (first solve).

    Pass `grade` (0..3) for approach-recall reviews; otherwise confidence +
    independence are graded normally.
    """
    q = recall_quality(grade) if grade is not None else quality(confidence, independence)
    if config.SCHEDULER == "fsrs":
        from . import fsrs_engine
        return fsrs_engine.advance_review(current, q, today=_today(today))
    return _advance_sm2(current, q, today=_today(today))


def _advance_sm2(current, q, today):
    reps = current["reps"] if current else 0
    ease = current["ease"] if current else 2.5
    interval = current["interval_days"] if current else 0
    fail_count = current["fail_count"] if current else 0

    if q < 3:
        reps = 0
        interval = 1
        fail_count += 1
    else:
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = max(1, round(interval * ease))
        reps += 1

    ease = max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
    leech = 1 if fail_count >= 3 else 0
    return {
        "slug": current["slug"] if current else None,
        "reps": reps, "ease": round(ease, 4), "interval_days": interval,
        "due_date": _iso(today + dt.timedelta(days=interval)),
        "last_reviewed": _iso(today), "fail_count": fail_count, "leech": leech,
        "quality": q,
    }


# ---- topic stats ----------------------------------------------------------------
def _mean(xs, default):
    return sum(xs) / len(xs) if xs else default


def topic_stats(problems, attempts):
    """Per NeetCode category: coverage, avg confidence, independence rate,
    avg % beaten, mastery/weakness. Ordered weakest first."""
    by_cat = {}
    for p in problems:
        if not _in_library(p):
            continue
        c = by_cat.setdefault(
            p["neetcode_category"],
            {"total": 0, "solved": set(), "confs": [], "indep": [], "rt": []},
        )
        c["total"] += 1

    cat_of = {p["slug"]: p["neetcode_category"] for p in problems}
    for a in attempts:
        cat = cat_of.get(a["slug"])
        c = by_cat.get(cat)
        if not c:
            continue
        c["solved"].add(a["slug"])
        if a.get("confidence") is not None:
            c["confs"].append(a["confidence"])
        if a.get("independence"):
            c["indep"].append(1.0 if a["independence"] == "solo" else 0.0)
        if a.get("runtime_percentile") is not None:
            c["rt"].append(a["runtime_percentile"])

    out = []
    for cat in CATEGORY_ORDER:
        c = by_cat.get(cat)
        if not c:
            continue
        total = c["total"]
        solved = len(c["solved"])
        coverage = solved / total if total else 0.0
        avg_conf = _mean(c["confs"], 2.0)
        independence = _mean(c["indep"], 0.5)
        avg_rt = _mean(c["rt"], None)
        conf_norm = (avg_conf - 1) / 2
        mastery = 0.5 * conf_norm + 0.5 * independence if solved else 0.0
        out.append({
            "category": cat, "total": total, "solved": solved,
            "coverage": round(coverage, 3),
            "avg_confidence": round(avg_conf, 2) if c["confs"] else None,
            "independence_rate": round(independence, 2) if c["indep"] else None,
            "avg_runtime_percentile": round(avg_rt, 1) if avg_rt is not None else None,
            "mastery": round(mastery, 3), "weakness": round(1.0 - mastery, 3),
        })
    out.sort(key=lambda x: (x["weakness"], 1 - x["coverage"]), reverse=True)
    return out


def _difficulty_gate(solved_in_cat):
    if solved_in_cat == 0:
        return {"Easy", "Unknown"}
    if solved_in_cat < 3:
        return {"Easy", "Medium", "Unknown"}
    return {"Easy", "Medium", "Hard", "Unknown"}


# ---- mistake density (Phase 4 mistake-driven selection) -------------------------
_SEVERITY_DEFAULT = 2


def mistake_density(problems, attempts, enrichments, days=30, today=None):
    """Per category: normalized weight of recent structured mistakes.

    Uses user_overrides.tags when present, else the LLM's mistake_tags.
    """
    today = _today(today)
    cutoff = int((dt.datetime.combine(today, dt.time()) - dt.timedelta(days=days)).timestamp())
    cat_of = {p["slug"]: p["neetcode_category"] for p in problems}
    enr_by_attempt = {e.get("attempt_id"): e for e in (enrichments or [])}
    raw = {}
    for a in attempts:
        if (a.get("solved_at") or 0) < cutoff:
            continue
        cat = cat_of.get(a["slug"])
        if not cat:
            continue
        e = enr_by_attempt.get(a.get("id"))
        if not e:
            continue
        tags = (e.get("user_overrides") or {}).get("tags") or e.get("mistake_tags") or []
        if not tags:
            continue
        sev = e.get("severity") or _SEVERITY_DEFAULT
        raw[cat] = raw.get(cat, 0.0) + len(tags) * sev
    if not raw:
        return {}
    peak = max(raw.values())
    return {cat: round(v / peak, 3) for cat, v in raw.items()}


# ---- daily queue ----------------------------------------------------------------
def build_daily_queue(problems, attempts, reviews, settings, today=None, enrichments=None):
    today_d = _today(today)
    today = _iso(today_d)
    review_limit = settings.get("review_limit", 5)
    new_limit = settings.get("new_limit", 2)
    w_weak = settings.get("weakness_weight", 0.6)
    w_breadth = settings.get("breadth_weight", 0.4)
    w_mistake = settings.get("mistake_weight", 0.2)

    prob_by_slug = {p["slug"]: p for p in problems}
    stats = {s["category"]: s for s in topic_stats(problems, attempts)}
    mistakes = mistake_density(problems, attempts, enrichments, today=today_d)
    attempted = {a["slug"] for a in attempts}
    solved_per_cat = {}
    for slug in attempted:
        cat = prob_by_slug.get(slug, {}).get("neetcode_category")
        if cat:
            solved_per_cat[cat] = solved_per_cat.get(cat, 0) + 1

    # Reviews due today or earlier (leeches first, then oldest due).
    due = [r for r in reviews if r.get("due_date") and r["due_date"] <= today]
    due.sort(key=lambda r: (not r.get("leech"), r["due_date"]))
    reviews_out = []
    for r in due[:review_limit]:
        p = prob_by_slug.get(r["slug"], {})
        interval = r.get("interval_days") or 0
        leech = bool(r.get("leech"))
        mode = "full" if (leech or interval >= RECALL_INTERVAL_CAP) else "recall"
        reviews_out.append({
            "slug": r["slug"], "title": p.get("title", r["slug"]),
            "difficulty": p.get("difficulty", "Unknown"),
            "category": p.get("neetcode_category"), "url": p.get("url"),
            "kind": "review", "mode": mode, "due_date": r["due_date"],
            "interval_days": interval, "leech": leech,
            "reason": "Leech - full re-solve" if leech else (
                "Quick recall" if mode == "recall" else "Full re-solve"),
        })

    # Score unattempted candidates by topic weakness + breadth + mistake density.
    scored = []
    for p in problems:
        if p["slug"] in attempted or not _in_library(p):
            continue
        cat = p["neetcode_category"]
        st = stats.get(cat, {})
        gate = _difficulty_gate(solved_per_cat.get(cat, 0))
        if p.get("difficulty", "Unknown") not in gate:
            continue
        score = (w_weak * st.get("weakness", 1.0)
                 + w_breadth * (1 - st.get("coverage", 0.0))
                 + w_mistake * mistakes.get(cat, 0.0))
        scored.append((score, p, cat))
    scored.sort(key=lambda x: x[0], reverse=True)

    new_out = []
    used_cats = set()
    for score, p, cat in scored:  # first pass prefers category variety
        if len(new_out) >= new_limit:
            break
        if cat in used_cats:
            continue
        used_cats.add(cat)
        new_out.append(_new_item(p, cat, score))
    if len(new_out) < new_limit:  # backfill if variety left us short
        have = {i["slug"] for i in new_out}
        for score, p, cat in scored:
            if len(new_out) >= new_limit:
                break
            if p["slug"] not in have:
                new_out.append(_new_item(p, cat, score))

    expansion = _expansion(problems, stats, solved_per_cat, attempted)
    goal = _goal_progress(attempts, settings, today_d)
    return {"reviews": reviews_out, "new": new_out, "expansion": expansion,
            "goal": goal, "date": today}


def _new_item(p, cat, score):
    return {
        "slug": p["slug"], "title": p["title"], "difficulty": p.get("difficulty", "Unknown"),
        "category": cat, "url": p.get("url"), "kind": "new",
        "reason": f"Weak topic: {cat}", "score": round(score, 3),
    }


def _expansion(problems, stats, solved_per_cat, attempted):
    """Suggest highly-rated, not-yet-imported problems for categories the user
    has exhausted or nearly mastered. Returns up to 2 candidates per such cat."""
    # Categories whose in-library unattempted pool is empty, or mastery high.
    lib = [p for p in problems if _in_library(p)]
    unattempted_by_cat = {}
    for p in lib:
        if p["slug"] in attempted:
            continue
        unattempted_by_cat.setdefault(p["neetcode_category"], 0)
        unattempted_by_cat[p["neetcode_category"]] += 1

    candidates_by_cat = {}
    for p in problems:
        if _in_library(p) or p["slug"] in attempted:
            continue
        candidates_by_cat.setdefault(p["neetcode_category"], []).append(p)

    out = []
    for cat, cands in candidates_by_cat.items():
        st = stats.get(cat, {})
        exhausted = unattempted_by_cat.get(cat, 0) == 0
        mastered = st.get("mastery", 0) >= 0.75 and st.get("coverage", 0) >= 0.999
        if not (exhausted or mastered):
            continue
        cands.sort(key=lambda p: p.get("like_ratio") or 0, reverse=True)
        for p in cands[:2]:
            out.append({
                "slug": p["slug"], "title": p.get("title", p["slug"]),
                "difficulty": p.get("difficulty", "Unknown"), "category": cat,
                "url": p.get("url"), "like_ratio": p.get("like_ratio"),
                "reason": "Topic exhausted" if exhausted else "Topic mastered — go deeper",
            })
    return out


def _goal_progress(attempts, settings, today_d):
    """Reviews + new solved this ISO week vs. weekly goals."""
    year, week, _ = today_d.isocalendar()
    r_done = n_done = 0
    for a in attempts:
        ts = a.get("solved_at")
        if not ts:
            continue
        d = dt.datetime.fromtimestamp(ts).date()
        if d.isocalendar()[:2] != (year, week):
            continue
        if a.get("kind") == "recall" and a.get("grading_status") in ("pending", "ready", "failed"):
            continue
        if a.get("kind") in ("review", "recall"):
            r_done += 1
        else:
            n_done += 1
    return {
        "reviews_done": r_done, "reviews_goal": settings.get("goal_reviews_per_week", 20),
        "new_done": n_done, "new_goal": settings.get("goal_new_per_week", 5),
    }


# ---- overview -------------------------------------------------------------------
def overview(problems, attempts, reviews, today=None):
    today_d = _today(today)
    total_problems = sum(1 for p in problems if _in_library(p))
    solved = len({a["slug"] for a in attempts})
    due = sum(1 for r in reviews if r.get("due_date") and r["due_date"] <= _iso(today_d))
    leeches = sum(1 for r in reviews if r.get("leech"))
    dates = {
        dt.datetime.fromtimestamp(a["solved_at"]).date()
        for a in attempts if a.get("solved_at")
    }
    return {
        "total_problems": total_problems, "solved": solved,
        "total_attempts": len(attempts), "due_reviews": due,
        "leeches": leeches, "streak": _streak(dates, today_d),
        "xp_today": _xp_today(attempts, today_d),
    }


def _xp_today(attempts, today_d):
    xp = 0
    for a in attempts:
        ts = a.get("solved_at")
        if not ts or dt.datetime.fromtimestamp(ts).date() != today_d:
            continue
        kind = a.get("kind")
        if kind == "recall" and a.get("grading_status") in ("pending", "ready", "failed"):
            continue
        xp += 5 if kind == "recall" else (20 if a.get("source") in ("auto", "manual") and kind != "review" else 10)
    return xp


def _streak(date_set, today):
    if not date_set:
        return 0
    day = today if today in date_set else today - dt.timedelta(days=1)
    if day not in date_set:
        return 0
    count = 0
    while day in date_set:
        count += 1
        day -= dt.timedelta(days=1)
    return count
