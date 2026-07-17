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
SOLUTION_TO_Q = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 5}  # LLM /5 solution score -> quality
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


def solution_quality(confidence, independence, solution_score):
    """Blend the user's self-assessment with the LLM's 0..5 solution grade.

    The self-assessment (how the solve *felt*) stays a co-equal signal; the LLM
    read of the code nudges it. Returns a rounded 50/50 average on the SM-2 0..5
    scale. Falls back to self-assessment alone when the score is missing.
    """
    q = quality(confidence, independence)
    if solution_score is None:
        return q
    return round((q + SOLUTION_TO_Q.get(solution_score, q)) / 2)


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


def advance_review(current, confidence, independence, today=None, grade=None,
                   solution_score=None):
    """Return the next review card state. `current` may be None (first solve).

    Pass `grade` (0..3) for approach-recall reviews. Pass `solution_score` (0..5)
    to blend the LLM's code grade with the confidence/independence self-assessment;
    otherwise confidence + independence are graded normally.
    """
    if grade is not None:
        q = recall_quality(grade)
    elif solution_score is not None:
        q = solution_quality(confidence, independence, solution_score)
    else:
        q = quality(confidence, independence)
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


# ---- drill lane -----------------------------------------------------------------
_DIFFICULTY_ORDER = {"Easy": 0, "Medium": 1, "Hard": 2, "Unknown": 3}
_PREDICTION_MISSES = {"wrong", "partial"}
_CATEGORY_ORDER = {cat: i for i, cat in enumerate(CATEGORY_ORDER)}


def build_drill_lane(
    problems,
    attempts,
    reviews,
    settings=None,
    today=None,
    enrichments=None,
    exclude_slugs=None,
):
    """Return 0..3 in-library drill candidates from local practice signal only."""
    today_d = _today(today)
    settings = settings or {}
    exclude_slugs = set(exclude_slugs or ())
    prob_by_slug = {p["slug"]: p for p in problems if _in_library(p)}
    if not prob_by_slug:
        return []

    attempts_by_slug = {}
    for a in attempts:
        attempts_by_slug.setdefault(a.get("slug"), []).append(a)
    reviews_by_slug = {r.get("slug"): r for r in reviews}
    stats = {s["category"]: s for s in topic_stats(problems, attempts)}
    mistakes = mistake_density(problems, attempts, enrichments, today=today_d)
    pred_misses = _prediction_misses_by_category(problems, attempts, enrichments)
    struggles = _recent_struggles_by_category(problems, attempts, today_d)
    latest_signal = _latest_relevant_signal_by_category(
        problems, attempts, enrichments, today_d,
    )

    has_signal = (
        any(r.get("leech") for r in reviews)
        or any(struggles.values())
        or bool(mistakes)
        or any(pred_misses.values())
    )
    if not has_signal:
        return []

    candidates = []
    for slug, p in prob_by_slug.items():
        if slug in exclude_slugs:
            continue
        cat = p.get("neetcode_category")
        review = reviews_by_slug.get(slug, {})
        problem_attempts = attempts_by_slug.get(slug, [])
        score, reason, reason_codes, signals = _drill_score(
            p, problem_attempts, review, stats.get(cat, {}), mistakes,
            pred_misses, struggles, settings,
        )
        if score <= 0:
            continue
        candidates.append((p, score, reason, reason_codes, signals,
                           int(bool(review.get("leech"))),
                           int(review.get("fail_count") or 0),
                           latest_signal.get(cat, 0)))

    candidates.sort(key=_drill_sort_key)
    out = []
    used_cats = set()
    for cand in candidates:
        if len(out) >= 3:
            break
        cat = cand[0].get("neetcode_category")
        if cat in used_cats:
            continue
        used_cats.add(cat)
        out.append(_drill_item(*cand[:5]))
    if len(out) < 3:
        have = {i["slug"] for i in out}
        for cand in candidates:
            if len(out) >= 3:
                break
            if cand[0]["slug"] not in have:
                out.append(_drill_item(*cand[:5]))
    return out


def _prediction_misses_by_category(problems, attempts, enrichments):
    cat_of = {p["slug"]: p.get("neetcode_category") for p in problems}
    attempt_by_id = {a.get("id"): a for a in attempts}
    raw = {}
    for e in enrichments or []:
        if e.get("prediction_verdict") not in _PREDICTION_MISSES:
            continue
        a = attempt_by_id.get(e.get("attempt_id"), {})
        cat = cat_of.get(a.get("slug") or e.get("slug"))
        if cat:
            raw[cat] = raw.get(cat, 0) + 1
    return raw


def _recent_struggles_by_category(problems, attempts, today):
    cutoff = int((dt.datetime.combine(today, dt.time()) - dt.timedelta(days=30)).timestamp())
    cat_of = {p["slug"]: p.get("neetcode_category") for p in problems}
    raw = {}
    for a in attempts:
        ts = a.get("solved_at")
        if ts is not None and ts < cutoff:
            continue
        if not (a.get("confidence") is not None and a.get("confidence") <= 1
                or a.get("independence") in ("hints", "solution")):
            continue
        cat = cat_of.get(a.get("slug"))
        if cat:
            raw[cat] = raw.get(cat, 0) + 1
    return raw


def _latest_relevant_signal_by_category(problems, attempts, enrichments, today):
    cutoff = int((dt.datetime.combine(today, dt.time()) - dt.timedelta(days=30)).timestamp())
    cat_of = {p["slug"]: p.get("neetcode_category") for p in problems}
    enr_by_attempt = {e.get("attempt_id"): e for e in (enrichments or [])}
    raw = {}
    for a in attempts:
        ts = a.get("solved_at") or 0
        if ts < cutoff:
            continue
        cat = cat_of.get(a.get("slug"))
        if not cat:
            continue
        e = enr_by_attempt.get(a.get("id"), {})
        tags = (e.get("user_overrides") or {}).get("tags") or e.get("mistake_tags") or []
        pred_miss = e.get("prediction_verdict") in _PREDICTION_MISSES
        struggle = (
            a.get("confidence") is not None and a.get("confidence") <= 1
            or a.get("independence") in ("hints", "solution")
        )
        if tags or pred_miss or struggle:
            raw[cat] = max(raw.get(cat, 0), ts)
    return raw


def _drill_score(p, attempts, review, stats, mistakes, pred_misses, struggles, settings):
    cat = p.get("neetcode_category")
    leech = int(bool(review.get("leech")))
    fail_count = int(review.get("fail_count") or 0)
    unattempted = 0 if attempts else 1
    weak = stats.get("weakness", 0.0)
    coverage_gap = 1 - stats.get("coverage", 0.0)
    mistake = mistakes.get(cat, 0.0)
    pred = pred_misses.get(cat, 0)
    struggle = struggles.get(cat, 0)
    leech_score = settings.get("drill_leech_weight", 3.0) * leech
    fail_score = settings.get("drill_fail_weight", 0.4) * fail_count
    mistake_score = settings.get("drill_mistake_weight", 1.8) * mistake
    pred_score = settings.get("drill_prediction_weight", 1.5) * pred
    struggle_score = settings.get("drill_struggle_weight", 1.4) * struggle
    weak_score = settings.get("drill_weakness_weight", 0.7) * weak
    breadth_score = settings.get("drill_breadth_weight", 0.5) * coverage_gap * unattempted

    score = (
        leech_score + fail_score + mistake_score + pred_score
        + struggle_score + weak_score + breadth_score
    )
    display_signals = [
        (leech_score, "Leech drill"),
        (mistake_score, "Recent mistakes"),
        (pred_score, "Prediction misses"),
        (struggle_score, "Recent struggle"),
        (weak_score + breadth_score, "Coverage gap"),
    ]
    reason = max(display_signals, key=lambda x: (x[0], x[1]))[1]
    reason_codes = _drill_reason_codes(
        leech_score, fail_score, mistake_score, pred_score, struggle_score,
        weak_score, breadth_score,
    )
    signals = _drill_signals(
        leech, fail_count, weak, coverage_gap, unattempted, mistake, pred, struggle,
    )
    return round(score, 3), reason, reason_codes, signals


def _drill_reason_codes(
    leech_score, fail_score, mistake_score, pred_score, struggle_score,
    weak_score, breadth_score,
):
    codes = []
    if leech_score > 0:
        codes.append("leech")
    if fail_score > 0 or mistake_score > 0 or struggle_score > 0:
        codes.append("recent_mistakes")
    if pred_score > 0:
        codes.append("prediction_miss")
    if weak_score > 0:
        codes.append("weak_topic")
    if breadth_score > 0:
        codes.append("unattempted_coverage")
    return codes


def _drill_signals(
    leech, fail_count, weakness, coverage_gap, unattempted, mistake, pred, struggle,
):
    signals = {}
    if leech:
        signals["leech"] = True
    if fail_count:
        signals["fail_count"] = fail_count
    if weakness:
        signals["weakness"] = round(weakness, 3)
    if mistake:
        signals["mistake_density"] = round(mistake, 3)
    if pred:
        signals["prediction_miss"] = True
        signals["prediction_misses"] = pred
    if struggle:
        signals["recent_struggles"] = struggle
    if unattempted and coverage_gap:
        signals["unattempted_coverage"] = round(coverage_gap, 3)
    return signals


def _drill_sort_key(cand):
    p, score, _reason, _reason_codes, _signals, leech, fail_count, latest_signal = cand
    difficulty = p.get("difficulty", "Unknown")
    cat = p.get("neetcode_category")
    return (-score, -leech, -fail_count,
            -latest_signal,
            _DIFFICULTY_ORDER.get(difficulty, _DIFFICULTY_ORDER["Unknown"]),
            _CATEGORY_ORDER.get(cat, len(_CATEGORY_ORDER)),
            p.get("title", p["slug"]).casefold(),
            p["slug"])


def _drill_item(p, score, reason, reason_codes, signals):
    return {
        "slug": p["slug"], "title": p.get("title", p["slug"]),
        "difficulty": p.get("difficulty", "Unknown"),
        "category": p.get("neetcode_category"), "url": p.get("url"),
        "kind": "drill", "score": round(score, 3), "reason": reason,
        "reason_codes": reason_codes, "signals": signals,
    }


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
        kind = a.get("kind")
        if kind in ("review", "recall"):
            r_done += 1
        elif kind == "drill":
            continue
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
        "drills_today": _drills_today(attempts, today_d),
    }


def _drills_today(attempts, today_d):
    return sum(
        1 for a in attempts
        if a.get("kind") == "drill"
        and a.get("solved_at")
        and dt.datetime.fromtimestamp(a["solved_at"]).date() == today_d
    )


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
