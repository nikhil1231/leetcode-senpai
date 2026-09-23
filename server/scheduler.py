"""Scheduling brain — pure functions over plain Python data (no I/O).

Callers load problems / attempts / reviews / enrichments from the store, pass
them in, and persist whatever comes back. This keeps the spaced-repetition +
topic-weighting logic trivially unit-testable.

The review engine (advance_review / seed_review) dispatches on config.SCHEDULER
so SM-2 and FSRS share one interface; see fsrs_engine.py for the FSRS side.
"""
import datetime as dt

from . import config, plans
from .neetcode150 import CATEGORY_FAMILIES, CATEGORY_ORDER, FAMILY_ORDER

CONF_TO_Q = {1: 3, 2: 4, 3: 5}  # low / medium / high on SM-2's 0..5 scale
RECALL_TO_Q = {0: 1, 1: 3, 2: 4, 3: 5}  # recall grade -> quality
SOLUTION_TO_Q = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 5}  # LLM /5 solution score -> quality
RECALL_INTERVAL_CAP = 21  # cards shorter than this are reviewed by recall, not full solve
REVIEW_DUE_WINDOW_DAYS = 7  # a card stays "due" for this long before it counts as overdue


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


def _is_sprint_attempt(a):
    return a.get("kind") == "sprint"


def _solved_attempts(attempts):
    return [a for a in attempts if not _is_sprint_attempt(a)]


def _recently_attempted_slugs(attempts, today, days):
    """Slugs with an attempt in the last `days` — a cooldown so drills and sprint
    rounds don't re-serve a problem the moment it's been practiced."""
    if days <= 0:
        return set()
    cutoff = int((dt.datetime.combine(today, dt.time())
                  - dt.timedelta(days=days)).timestamp())
    recent = set()
    for a in attempts:
        ts = a.get("solved_at")
        if ts is not None and ts >= cutoff and a.get("slug"):
            recent.add(a["slug"])
    return recent


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
    blended = round((q + SOLUTION_TO_Q.get(solution_score, q)) / 2)
    # Correct code cannot demonstrate independent recall when help was needed.
    return min(q, blended) if independence in ("hints", "solution") else blended


# ---- SM-2 -----------------------------------------------------------------------
# Where a card keeps the state it was advanced from, so a second grade on the
# same day can replace that advance instead of compounding it.
PRIOR_CARD_KEY = "prior_card"


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
                   solution_score=None, plan_cap=None):
    """Return the next review card state. `current` may be None (first solve).

    Pass `grade` (0..3) for approach-recall reviews. Pass `solution_score` (0..5)
    to blend the LLM's code grade with the confidence/independence self-assessment;
    otherwise confidence + independence are graded normally. `plan_cap` (see
    plans.quality_cap) is a ceiling from a pre-solve plan that didn't hold.

    A card moves once per day. Grading the same problem again today — a second
    solve after a better submission, a recall on top of a solve — replaces that
    day's advance rather than stacking another on top of it, so a problem you
    revisited never ends up scheduled further out than one you nailed first time.
    The last rating of the day is the one that stands.
    """
    if grade is not None:
        q = recall_quality(grade)
    elif solution_score is not None:
        q = solution_quality(confidence, independence, solution_score)
    else:
        q = quality(confidence, independence)
    if grade is None and plan_cap is not None:
        q = min(q, plan_cap)
    today_d = _today(today)
    prior = _rewind_todays_advance(current, today_d)
    if config.SCHEDULER == "fsrs":
        from . import fsrs_engine
        out = fsrs_engine.advance_review(prior, q, today=today_d)
    else:
        out = _advance_sm2(prior, q, today=today_d)
    # What this advance was computed from, so the next one today can redo it.
    # Stripped of its own snapshot, which keeps the nesting one deep.
    out[PRIOR_CARD_KEY] = (
        {k: v for k, v in prior.items() if k != PRIOR_CARD_KEY} if prior else None)
    return out


def _rewind_todays_advance(current, today_d):
    """The card as it stood before today, if it has already moved today.

    Cards written before this snapshot existed don't carry one, so they keep the
    old stacking behaviour rather than being reset to a first review — a missing
    snapshot means "unknown", never "there was nothing here".
    """
    if not current or current.get("last_reviewed") != _iso(today_d):
        return current
    if PRIOR_CARD_KEY not in current:
        return current
    return current[PRIOR_CARD_KEY]


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


def topic_stats(problems, attempts, enrichments=None):
    """Per NeetCode category: coverage, avg confidence, independence rate,
    avg % beaten, mastery/weakness. Ordered weakest first."""
    by_cat = {}
    for p in problems:
        if not _in_library(p):
            continue
        c = by_cat.setdefault(
            p["neetcode_category"],
            {"total": 0, "solved": set(), "confs": [], "indep": [], "rt": [],
             "sprint_reps": 0, "sprint_correct": 0, "sprint_partial": 0,
             "sprint_wrong": 0},
        )
        c["total"] += 1

    # Only library problems count toward a topic, the same set `total` counts —
    # else solving a browsed Discover candidate reads as 6/20 over a list of 5.
    cat_of = {p["slug"]: p["neetcode_category"] for p in problems if _in_library(p)}
    enr_by_attempt = {e.get("attempt_id"): e for e in (enrichments or [])}
    for a in attempts:
        cat = cat_of.get(a["slug"])
        c = by_cat.get(cat)
        if not c:
            continue
        if _is_sprint_attempt(a):
            c["sprint_reps"] += 1
            verdict = (enr_by_attempt.get(a.get("id")) or {}).get("prediction_verdict")
            if verdict == "correct":
                c["sprint_correct"] += 1
            elif verdict == "partial":
                c["sprint_partial"] += 1
            elif verdict == "wrong":
                c["sprint_wrong"] += 1
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
        row = {
            "category": cat, "total": total, "solved": solved,
            "coverage": round(coverage, 3),
            "avg_confidence": round(avg_conf, 2) if c["confs"] else None,
            "independence_rate": round(independence, 2) if c["indep"] else None,
            "avg_runtime_percentile": round(avg_rt, 1) if avg_rt is not None else None,
            "mastery": round(mastery, 3), "weakness": round(1.0 - mastery, 3),
        }
        if c["sprint_reps"]:
            graded = c["sprint_correct"] + c["sprint_partial"] + c["sprint_wrong"]
            row.update({
                "sprint_reps": c["sprint_reps"],
                "sprint_correct": c["sprint_correct"],
                "sprint_partial": c["sprint_partial"],
                "sprint_wrong": c["sprint_wrong"],
                "sprint_accuracy": (
                    round(c["sprint_correct"] / graded, 3) if graded else None
                ),
            })
        out.append(row)
    out.sort(key=lambda x: (x["weakness"], 1 - x["coverage"]), reverse=True)
    return out


def topic_tree(problems, attempts, enrichments=None):
    """topic_stats grouped into curriculum families, in learning order.

    The Topics map renders this: one section per family, topics inside it in
    CATEGORY_ORDER (not weakest-first) so the view is a stable map of where you
    are rather than a re-shuffling list of failures.

    Family `coverage` is solved/total across the family. Family `mastery` is a
    solved-weighted mean of its topics' mastery — i.e. the quality of the work
    you have actually done, with breadth reported separately by coverage.
    """
    rows = {s["category"]: s for s in topic_stats(problems, attempts, enrichments)}
    families = []
    for family in FAMILY_ORDER:
        topics = [rows[c] for c in CATEGORY_FAMILIES[family] if c in rows]
        if not topics:
            continue
        total = sum(t["total"] for t in topics)
        solved = sum(t["solved"] for t in topics)
        weighted = sum(t["mastery"] * t["solved"] for t in topics)
        mastery = weighted / solved if solved else 0.0
        families.append({
            "family": family,
            "total": total,
            "solved": solved,
            "coverage": round(solved / total, 3) if total else 0.0,
            "mastery": round(mastery, 3),
            "weakness": round(1.0 - mastery, 3),
            "topics": topics,
        })
    return families


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
    for a in _solved_attempts(attempts):
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

    solved = _solved_attempts(attempts)
    # Don't put a problem straight back on the drill treadmill: once it's been
    # drilled, cool it down for a few days. Struggles on *real* solves still feed
    # the lane — this only debounces reps served through the drill flow itself.
    exclude_slugs |= _recently_attempted_slugs(
        [a for a in solved if a.get("kind") == "drill"],
        today_d, settings.get("drill_cooldown_days", 7))
    attempts_by_slug = {}
    for a in solved:
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


def build_sprint_round(
    problems,
    attempts,
    reviews,
    settings=None,
    today=None,
    enrichments=None,
    exclude_slugs=None,
):
    """Return statement-only sprint reps from in-library problems.

    Unlike the focused drill lane, sprint rounds always backfill from the
    imported library when local weakness signal is sparse or absent.
    """
    today_d = _today(today)
    settings = settings or {}
    exclude_slugs = set(exclude_slugs or ())
    limit = settings.get("sprint_round_size", 30)
    if limit <= 0:
        return []

    prob_by_slug = {p["slug"]: p for p in problems if _in_library(p)}
    if not prob_by_slug:
        return []

    # Once a rep has been done (and graded) it drops out of the pool until the
    # cooldown lapses, so a fresh round doesn't re-serve just-answered reps.
    sprint_attempts = [a for a in attempts if _is_sprint_attempt(a)]
    exclude_slugs |= _recently_attempted_slugs(
        sprint_attempts, today_d, settings.get("sprint_cooldown_days", 7))
    attempts_by_slug = {}
    for a in _solved_attempts(attempts):
        attempts_by_slug.setdefault(a.get("slug"), []).append(a)
    reviews_by_slug = {r.get("slug"): r for r in reviews}
    stats = {s["category"]: s for s in topic_stats(problems, attempts)}
    mistakes = mistake_density(problems, attempts, enrichments, today=today_d)
    pred_misses = _prediction_misses_by_category(problems, attempts, enrichments)
    struggles = _recent_struggles_by_category(problems, attempts, today_d)

    candidates = []
    for slug, p in prob_by_slug.items():
        if slug in exclude_slugs:
            continue
        cat = p.get("neetcode_category")
        score, reason, reason_codes, signals = _sprint_score(
            p, attempts_by_slug.get(slug, []), reviews_by_slug.get(slug, {}),
            stats.get(cat, {}), mistakes, pred_misses, struggles, settings,
        )
        candidates.append((p, score, reason, reason_codes, signals))

    candidates.sort(key=_sprint_sort_key)
    return [_sprint_item(*cand) for cand in candidates[:limit]]


def _is_plan_miss(a, e):
    """A wrong pattern guess, or a pre-solve plan that showed a weakness."""
    return e.get("prediction_verdict") in _PREDICTION_MISSES or plans.plan_miss(a, e)


def _prediction_misses_by_category(problems, attempts, enrichments):
    """Per category, how many starts showed a planning miss: a wrong pattern
    guess (sprints included), a blank start, a pivot, or a plan whose approach
    or time target the grade marked short. One per attempt, however many."""
    cat_of = {p["slug"]: p.get("neetcode_category") for p in problems}
    attempt_by_id = {a.get("id"): a for a in attempts}
    enr_by_attempt = {e.get("attempt_id"): e for e in (enrichments or [])}
    raw = {}
    for aid in set(attempt_by_id) | set(enr_by_attempt):
        a = attempt_by_id.get(aid, {})
        e = enr_by_attempt.get(aid, {})
        if not _is_plan_miss(a, e):
            continue
        cat = cat_of.get(a.get("slug") or e.get("slug"))
        if cat:
            raw[cat] = raw.get(cat, 0) + 1
    return raw


def _sprint_score(p, attempts, review, stats, mistakes, pred_misses, struggles, settings):
    cat = p.get("neetcode_category")
    leech = int(bool(review.get("leech")))
    fail_count = int(review.get("fail_count") or 0)
    unattempted = 0 if attempts else 1
    weak = stats.get("weakness", 0.0) if stats.get("solved", 0) else 0.0
    coverage_gap = 1 - stats.get("coverage", 0.0)
    mistake = mistakes.get(cat, 0.0)
    pred = pred_misses.get(cat, 0)
    struggle = struggles.get(cat, 0)

    leech_score = settings.get("sprint_leech_weight", 3.0) * leech
    fail_score = settings.get("sprint_fail_weight", 0.45) * fail_count
    mistake_score = settings.get("sprint_mistake_weight", 2.0) * mistake
    pred_score = settings.get("sprint_prediction_weight", 1.6) * pred
    struggle_score = settings.get("sprint_struggle_weight", 1.5) * struggle
    weak_score = settings.get("sprint_weakness_weight", 0.8) * weak
    breadth_score = settings.get("sprint_breadth_weight", 0.35) * coverage_gap
    unattempted_score = settings.get("sprint_unattempted_weight", 0.2) * unattempted
    base_score = settings.get("sprint_broad_weight", 0.05)

    score = (
        base_score + leech_score + fail_score + mistake_score + pred_score
        + struggle_score + weak_score + breadth_score + unattempted_score
    )
    reason_scores = [
        (leech_score, "Leech review state"),
        (fail_score, "Repeated review failures"),
        (mistake_score, "Recent mistake density"),
        (pred_score, "Plan misses"),
        (struggle_score, "Recent low-confidence solve"),
        (weak_score, "Weak topic"),
        (breadth_score + unattempted_score + base_score, "Broad coverage"),
    ]
    reason = max(reason_scores, key=lambda x: (x[0], x[1]))[1]
    reason_codes = _sprint_reason_codes(
        leech_score, fail_score, mistake_score, pred_score, struggle_score,
        weak_score, breadth_score, unattempted_score,
    )
    signals = _sprint_signals(
        leech, fail_count, weak, coverage_gap, unattempted, mistake, pred, struggle,
    )
    return round(score, 3), reason, reason_codes, signals


def _sprint_reason_codes(
    leech_score, fail_score, mistake_score, pred_score, struggle_score,
    weak_score, breadth_score, unattempted_score,
):
    codes = []
    if leech_score > 0:
        codes.append("leech")
    if fail_score > 0:
        codes.append("fail_count")
    if mistake_score > 0:
        codes.append("recent_mistakes")
    if pred_score > 0:
        codes.append("prediction_miss")
    if struggle_score > 0:
        codes.append("recent_struggle")
    if weak_score > 0:
        codes.append("weak_topic")
    if breadth_score > 0 or unattempted_score > 0:
        codes.append("broad_coverage")
    if not codes:
        codes.append("broad_coverage")
    return codes


def _sprint_signals(
    leech, fail_count, weakness, coverage_gap, unattempted, mistake, pred, struggle,
):
    signals = {}
    if leech:
        signals["leech"] = True
    if fail_count:
        signals["fail_count"] = fail_count
    if weakness:
        signals["weakness"] = round(weakness, 3)
    if coverage_gap:
        signals["coverage_gap"] = round(coverage_gap, 3)
    if unattempted:
        signals["unattempted"] = True
    if mistake:
        signals["mistake_density"] = round(mistake, 3)
    if pred:
        signals["prediction_miss"] = True
        signals["prediction_misses"] = pred
    if struggle:
        signals["recent_struggles"] = struggle
    return signals


def _sprint_sort_key(cand):
    p, score, _reason, _reason_codes, _signals = cand
    difficulty = p.get("difficulty", "Unknown")
    cat = p.get("neetcode_category")
    return (-score,
            _CATEGORY_ORDER.get(cat, len(_CATEGORY_ORDER)),
            _DIFFICULTY_ORDER.get(difficulty, _DIFFICULTY_ORDER["Unknown"]),
            p.get("title", p["slug"]).casefold(),
            p["slug"])


def _sprint_item(p, score, reason, reason_codes, signals):
    return {
        "slug": p["slug"], "title": p.get("title", p["slug"]),
        "difficulty": p.get("difficulty", "Unknown"),
        "category": p.get("neetcode_category"), "url": p.get("url"),
        "kind": "sprint", "score": round(score, 3), "reason": reason,
        "reason_codes": reason_codes, "signals": signals,
    }


def _is_struggle(a):
    """Low confidence, needed help, or sat down with no idea / had to pivot."""
    return (a.get("confidence") is not None and a.get("confidence") <= 1
            or a.get("independence") in ("hints", "solution")
            or a.get("plan_status") == "blank"
            or a.get("plan_held") == "pivoted")


def _recent_struggles_by_category(problems, attempts, today):
    cutoff = int((dt.datetime.combine(today, dt.time()) - dt.timedelta(days=30)).timestamp())
    cat_of = {p["slug"]: p.get("neetcode_category") for p in problems}
    raw = {}
    for a in _solved_attempts(attempts):
        ts = a.get("solved_at")
        if ts is not None and ts < cutoff:
            continue
        if not _is_struggle(a):
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
    for a in _solved_attempts(attempts):
        ts = a.get("solved_at") or 0
        if ts < cutoff:
            continue
        cat = cat_of.get(a.get("slug"))
        if not cat:
            continue
        e = enr_by_attempt.get(a.get("id"), {})
        tags = (e.get("user_overrides") or {}).get("tags") or e.get("mistake_tags") or []
        if tags or _is_plan_miss(a, e) or _is_struggle(a):
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
        (pred_score, "Plan misses"),
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


# ---- review board ---------------------------------------------------------------
# Segment order is the order they are shown: what is late first, then what is
# waiting, then what is coming.
REVIEW_SEGMENTS = (
    ("overdue", "Overdue"),
    ("due", "Due now"),
    ("soon", "Next 3 days"),
    ("week", "Later this week"),
    ("later", "Upcoming"),
)


def review_bucket(days_late, due_window_days=REVIEW_DUE_WINDOW_DAYS):
    """Which segment a card belongs to. `days_late` is today minus its due date.

    A card stays in "due" for a whole week after its due date rather than going
    overdue the next morning: the schedule is a target, not a deadline, and a
    board where one slipped day turns everything red stops carrying signal.
    """
    if days_late > due_window_days:
        return "overdue"
    if days_late >= 0:
        return "due"
    days_out = -days_late
    if days_out <= 3:
        return "soon"
    if days_out <= 7:
        return "week"
    return "later"


def review_card(review, problem, days_late):
    """One review rendered for the board. Mirrors build_daily_queue's review items
    so the same row renderer handles both."""
    interval = review.get("interval_days") or 0
    leech = bool(review.get("leech"))
    mode = "full" if (leech or interval >= RECALL_INTERVAL_CAP) else "recall"
    return {
        "slug": review["slug"],
        "title": problem.get("title", review["slug"]),
        "difficulty": problem.get("difficulty", "Unknown"),
        "category": problem.get("neetcode_category"),
        "url": problem.get("url"),
        "kind": "review",
        "mode": mode,
        "due_date": review.get("due_date"),
        "interval_days": interval,
        "leech": leech,
        "days_late": days_late,
        "reason": "Leech - full re-solve" if leech else (
            "Quick recall" if mode == "recall" else "Full re-solve"),
    }


def review_schedule(problems, reviews, today=None, due_window_days=REVIEW_DUE_WINDOW_DAYS):
    """Every scheduled review, grouped into time segments.

    build_daily_queue caps a day's reviews at `review_limit`, which is the right
    thing for the day's work but makes the board look like it only ever holds
    five cards. This is the whole board: pure over plain data, no I/O.

    Empty segments are dropped. Within a segment, leeches come first, then the
    oldest due date — the same priority build_daily_queue applies.
    """
    today_d = _today(today)
    prob_by_slug = {p["slug"]: p for p in problems}
    grouped = {key: [] for key, _ in REVIEW_SEGMENTS}
    for r in reviews:
        due = r.get("due_date")
        if not due or not r.get("slug"):
            continue
        if not _in_library(prob_by_slug.get(r["slug"], {})):
            continue
        try:
            days_late = (today_d - dt.date.fromisoformat(due)).days
        except (TypeError, ValueError):
            continue
        bucket = review_bucket(days_late, due_window_days)
        grouped[bucket].append(
            review_card(r, prob_by_slug.get(r["slug"], {}), days_late))

    out = []
    for key, label in REVIEW_SEGMENTS:
        items = grouped[key]
        if not items:
            continue
        items.sort(key=lambda c: (not c["leech"], c["due_date"]))
        out.append({"key": key, "label": label, "count": len(items), "items": items})
    return out


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
    solved_attempts = _solved_attempts(attempts)
    attempted = {a["slug"] for a in solved_attempts}
    solved_per_cat = {}
    for slug in attempted:
        cat = prob_by_slug.get(slug, {}).get("neetcode_category")
        if cat:
            solved_per_cat[cat] = solved_per_cat.get(cat, 0) + 1

    # Reviews due today or earlier (leeches first, then oldest due). A card for
    # a problem outside the library — a solve detected from an untracked session
    # — keeps its history but stays off the queue until the problem is imported.
    due = [r for r in reviews
           if r.get("due_date") and r["due_date"] <= today
           and _in_library(prob_by_slug.get(r["slug"], {}))]
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
        "reason": "Weak topic", "score": round(score, 3),
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
        if kind == "sprint":
            continue
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
    solved_attempts = _solved_attempts(attempts)
    solved = len({a["slug"] for a in solved_attempts})
    due = sum(1 for r in reviews if r.get("due_date") and r["due_date"] <= _iso(today_d))
    leeches = sum(1 for r in reviews if r.get("leech"))
    dates = {
        dt.datetime.fromtimestamp(a["solved_at"]).date()
        for a in solved_attempts if a.get("solved_at")
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
        if kind == "sprint":
            continue
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
