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


def _as_list(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _tags_of(enrichment):
    return (_as_list((enrichment.get("user_overrides") or {}).get("tags"))
            or _as_list(enrichment.get("mistake_tags")))


def _norm_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _norm_complexity(value):
    text = _norm_text(value)
    return text.lower().replace(" ", "") if text else None


def _planned_edge_cases(attempt):
    raw = attempt.get("planned_edge_cases") or []
    if isinstance(raw, str):
        raw = raw.replace("\n", ",").split(",")
    if not isinstance(raw, list):
        return []
    out = []
    seen = set()
    for item in raw:
        text = _norm_text(item)
        key = text.lower() if text else None
        if key and key not in seen:
            out.append(text)
            seen.add(key)
    return out


def _edge_case_signal(attempt, enrichment):
    enrichment = enrichment or {}
    tags = [
        str(t).lower()
        for t in (
            _as_list(enrichment.get("mistake_tags"))
            + _as_list((enrichment.get("user_overrides") or {}).get("tags"))
        )
    ]
    if "edge_case" in tags:
        return True
    text = " ".join(str(v or "").lower() for v in (
        attempt.get("mistake_note"),
        (enrichment or {}).get("mistake_summary"),
    ))
    return any(token in text for token in ("edge case", "edge-case", "edge_case"))


def _hit_summary(label, target, actual, hit):
    if not target and not actual:
        return f"{label} unknown"
    if not target:
        return f"{label} target unknown; inferred {actual}"
    if not actual:
        return f"{label} target {target}; inferred unknown"
    return f"{label} target {target} vs inferred {actual}: {'hit' if hit else 'miss'}"


def reconcile_plan(attempt, enrichment=None):
    """Compare a pre-solve plan with derived attempt data.

    Edge-case status is intentionally simple: planned cases plus any explicit
    edge_case mistake signal means missed; planned cases with no such signal
    means caught; missing planned cases remain unknown.
    """
    enrichment = enrichment or {}
    target_time = _norm_text(attempt.get("complexity_target_time"))
    target_space = _norm_text(attempt.get("complexity_target_space"))
    inferred_time = _norm_text(enrichment.get("inferred_time"))
    inferred_space = _norm_text(enrichment.get("inferred_space"))
    time_hit = (_norm_complexity(target_time) == _norm_complexity(inferred_time)
                if target_time and inferred_time else None)
    space_hit = (_norm_complexity(target_space) == _norm_complexity(inferred_space)
                 if target_space and inferred_space else None)
    planned = _planned_edge_cases(attempt)
    edge_status = "unknown"
    if planned:
        edge_status = "missed" if _edge_case_signal(attempt, enrichment) else "caught"
    edge_summary = (
        "No planned edge cases recorded."
        if not planned else
        ("Planned edge cases were linked to an edge-case mistake."
         if edge_status == "missed" else
         "Planned edge cases had no edge-case mistake signal.")
    )
    return {
        "complexity_time_hit": time_hit,
        "complexity_space_hit": space_hit,
        "target_time": target_time,
        "inferred_time": inferred_time,
        "target_space": target_space,
        "inferred_space": inferred_space,
        "planned_edge_cases": planned,
        "edge_case_status": edge_status,
        "complexity_summary": "; ".join((
            _hit_summary("time", target_time, inferred_time, time_hit),
            _hit_summary("space", target_space, inferred_space, space_hit),
        )),
        "edge_case_summary": edge_summary,
    }


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
    library = {p["slug"] for p in problems if scheduler._in_library(p)}
    total = len(library)
    first_solves = {}
    for a in scheduler._solved_attempts(attempts):
        if a["slug"] not in library or a.get("kind") == "recall" or a.get("source") == "recall":
            continue
        ts = a.get("solved_at") or 0
        first_solves[a["slug"]] = min(first_solves.get(a["slug"], ts), ts)
    solved = len(first_solves)
    remaining = max(0, total - solved)
    cutoff = int((dt.datetime.combine(today, dt.time()) - dt.timedelta(days=window_days)).timestamp())
    recent_new = sum(ts >= cutoff for ts in first_solves.values())
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


def failure_mode_attempts(tag, problems, attempts, enrichments):
    """Attempts annotated with a specific effective mistake tag, newest first."""
    prob_by_slug = {p.get("slug"): p for p in problems if p.get("slug")}
    attempt_by_id = {a.get("id"): a for a in attempts if a.get("id")}
    rows = []
    for e in enrichments:
        if tag not in _tags_of(e):
            continue
        a = attempt_by_id.get(e.get("attempt_id"))
        if not a:
            continue
        p = prob_by_slug.get(a.get("slug"))
        if not p or p.get("in_library") is not True:
            continue
        rows.append({
            "id": a.get("id"),
            "slug": a.get("slug"),
            "solved_at": a.get("solved_at"),
            "kind": a.get("kind"),
            "source": a.get("source"),
            "time_taken_sec": a.get("time_taken_sec"),
            "confidence": a.get("confidence"),
            "independence": a.get("independence"),
            "mistake_note": a.get("mistake_note"),
            "mistake_tags": _tags_of(e),
            "title": p.get("title", a.get("slug")),
            "difficulty": p.get("difficulty"),
            "category": p.get("neetcode_category"),
            "url": p.get("url"),
        })
    rows.sort(key=lambda r: r.get("solved_at") or 0, reverse=True)
    return rows


# ---- prediction accuracy --------------------------------------------------------
def prediction_accuracy(problems, attempts, enrichments):
    """Per category: correct / partial / wrong counts from prediction verdicts."""
    cat_of = {p["slug"]: p.get("neetcode_category") for p in problems}
    attempt_cat = {a["id"]: cat_of.get(a["slug"]) for a in attempts}
    attempt_kind = {a["id"]: a.get("kind") or "unknown" for a in attempts}
    enrichment_by_attempt = {e.get("attempt_id"): e for e in enrichments}
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
    plan_quality = plan_quality_metrics(attempts, enrichment_by_attempt)
    return {"by_category": out, "overall_correct_rate": overall, "graded": graded,
            "by_kind": by_kind, "sprint_graded": sum(by_kind.get("sprint", {}).values()),
            "plan_quality": plan_quality}


def _rate(hits, compared):
    return round(hits / compared, 3) if compared else None


def plan_quality_metrics(attempts, enrichment_by_attempt):
    time_compared = time_hits = 0
    space_compared = space_hits = 0
    edge = {"planned": 0, "caught": 0, "missed": 0, "unknown": 0}
    for a in attempts:
        rec = reconcile_plan(a, enrichment_by_attempt.get(a.get("id")))
        if rec["complexity_time_hit"] is not None:
            time_compared += 1
            time_hits += 1 if rec["complexity_time_hit"] else 0
        if rec["complexity_space_hit"] is not None:
            space_compared += 1
            space_hits += 1 if rec["complexity_space_hit"] else 0
        planned_count = len(rec["planned_edge_cases"])
        if planned_count:
            edge["planned"] += planned_count
            edge[rec["edge_case_status"]] += 1
    total_compared = time_compared + space_compared
    total_hits = time_hits + space_hits
    return {
        "complexity": {
            "time_compared": time_compared,
            "time_hits": time_hits,
            "time_misses": time_compared - time_hits,
            "time_hit_rate": _rate(time_hits, time_compared),
            "space_compared": space_compared,
            "space_hits": space_hits,
            "space_misses": space_compared - space_hits,
            "space_hit_rate": _rate(space_hits, space_compared),
            "compared": total_compared,
            "hits": total_hits,
            "misses": total_compared - total_hits,
            "hit_rate": _rate(total_hits, total_compared),
        },
        "edge_cases": edge,
    }


# ---- confidence calibration -----------------------------------------------------
def confidence_calibration(problems, attempts, reviews=None):
    """Compare self-assessed solve quality with stored objective grades by topic."""
    min_graded = 3
    cat_of = {p["slug"]: p.get("neetcode_category") for p in problems}
    title_of = {p["slug"]: p.get("title") or p["slug"] for p in problems}
    by_cat = {}
    latest_self_by_slug = {}
    included = 0
    for a in scheduler._solved_attempts(attempts):
        slug = a.get("slug")
        cat = cat_of.get(slug)
        if not cat or a.get("solved_at") is None:
            continue
        if a.get("confidence") is None or a.get("independence") is None:
            continue

        self_q = scheduler.quality(a.get("confidence"), a.get("independence"))
        prev = latest_self_by_slug.get(slug)
        if prev is None or (a.get("solved_at") or 0) > prev["solved_at"]:
            latest_self_by_slug[slug] = {
                "self_quality": self_q,
                "solved_at": a.get("solved_at") or 0,
            }
        objective = []
        solution_grade = a.get("solution_grade") or {}
        if solution_grade.get("score") in scheduler.SOLUTION_TO_Q:
            objective.append(scheduler.SOLUTION_TO_Q[solution_grade["score"]])
        recall_grade = a.get("recall_grade") or {}
        if recall_grade.get("grade") is not None:
            objective.append(scheduler.recall_quality(recall_grade["grade"]))
        if not objective:
            continue

        objective_q = sum(objective) / len(objective)
        row = by_cat.setdefault(cat, {"self": [], "objective": [], "examples": []})
        row["self"].append(self_q)
        row["objective"].append(objective_q)
        example_objective = None
        example_source = None
        if a.get("kind") == "recall" and recall_grade.get("grade") is not None:
            example_objective = scheduler.recall_quality(recall_grade["grade"])
            example_source = "recall_grade"
        elif solution_grade.get("score") in scheduler.SOLUTION_TO_Q:
            example_objective = scheduler.SOLUTION_TO_Q[solution_grade["score"]]
            example_source = "solution_grade"
        elif recall_grade.get("grade") is not None:
            example_objective = scheduler.recall_quality(recall_grade["grade"])
            example_source = "recall_grade"
        if example_source is not None:
            gap = round(self_q - example_objective, 2)
            if gap > 0:
                row["examples"].append({
                    "slug": slug,
                    "title": title_of.get(slug, slug),
                    "self_quality": round(self_q, 2),
                    "objective_quality": round(example_objective, 2),
                    "gap": gap,
                    "source": example_source,
                    "solved_at": a.get("solved_at") or 0,
                })
        included += 1

    for r in reviews or []:
        slug = r.get("slug")
        cat = cat_of.get(slug)
        if not cat:
            continue
        fail_count = r.get("fail_count") or 0
        if fail_count <= 0:
            continue
        row = by_cat.setdefault(cat, {"self": [], "objective": [], "examples": []})
        review_q = 1 if r.get("leech") == 1 else 2
        row["objective"].extend([review_q] * fail_count)
        row["review_failures"] = row.get("review_failures", 0) + fail_count
        row["leech_count"] = row.get("leech_count", 0) + (1 if r.get("leech") == 1 else 0)
        latest_self = latest_self_by_slug.get(slug)
        if latest_self:
            gap = round(latest_self["self_quality"] - review_q, 2)
            if gap > 0:
                row["examples"].append({
                    "slug": slug,
                    "title": title_of.get(slug, slug),
                    "self_quality": round(latest_self["self_quality"], 2),
                    "objective_quality": round(review_q, 2),
                    "gap": gap,
                    "source": "review_failure",
                    "solved_at": latest_self["solved_at"],
                })

    rows = []
    for cat, values in by_cat.items():
        if not values["self"] or not values["objective"]:
            continue
        self_q = round(sum(values["self"]) / len(values["self"]), 2)
        objective_q = round(sum(values["objective"]) / len(values["objective"]), 2)
        gap = round(self_q - objective_q, 2)
        examples = sorted(
            values.get("examples", []),
            key=lambda e: (-e["gap"], -e["solved_at"], e["slug"]),
        )
        examples = [{k: e[k] for k in (
            "slug", "title", "self_quality", "objective_quality", "gap", "source"
        )} for e in examples[:3]]
        overconfident = gap >= 1.0
        row = {
            "category": cat,
            "self_quality": self_q,
            "objective_quality": objective_q,
            "gap": gap,
            "graded_attempts": len(values["self"]),
            "review_failures": values.get("review_failures", 0),
            "leech_count": values.get("leech_count", 0),
            "overconfident": overconfident,
        }
        if overconfident:
            row["examples"] = examples
        rows.append(row)
    rows.sort(key=lambda r: (-r["gap"], r["category"]))
    status = "ok" if included >= min_graded else "not_enough_data"
    most_overrated = None
    if status == "ok":
        most_overrated = next((r for r in rows if r["overconfident"]), None)
    return {
        "status": status,
        "graded_attempts": included,
        "min_graded_attempts": min_graded,
        "most_overrated_topic": most_overrated,
        "categories": rows,
    }


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
        "confidence_calibration": confidence_calibration(problems, attempts, reviews),
        "mock_trend": mock_score_trend(mocks),
    }
