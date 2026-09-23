"""Pre-solve plans — pure functions over plain data (no I/O), like scheduler.py.

A run starts with a plan: a one-line approach and a time target, optionally a
pattern guess, a space target and edge cases. `plan_status` says how the run
began — "planned", "blank" (the user had no idea yet) or "skipped". Rows written
before plan_status existed carry only the raw fields; they read as planned when
any field is present, so older history keeps its meaning.

Everything the plan is judged by lives here so insights, the scheduler and the
API agree: the big-O normaliser, the per-component read of how the plan went,
the 0..5 plan score, and the scheduling cap a plan that didn't hold imposes.
"""
import re

PLAN_STATUSES = ("planned", "blank", "skipped")
HELD_VALUES = ("held", "tweaked", "pivoted")

_PLAN_FIELDS = ("predicted_category", "predicted_approach",
                "complexity_target_time", "complexity_target_space")
_VERDICT_VALUE = {"correct": 1.0, "partial": 0.5, "wrong": 0.0}
_APPROACH_VALUE = {"viable": 1.0, "partial": 0.5, "wrong": 0.0}
_HELD_VALUE = {"held": 1.0, "tweaked": 0.5, "pivoted": 0.0}
# The approach is the plan; the rest are how well it was specified.
_WEIGHTS = {"approach": 2, "pattern": 1, "complexity": 1, "edges": 1, "held": 1}
# Soft planning budget, as in an interview: past this, planning is slow.
PLAN_SOFT_LIMIT_SEC = 5 * 60


# ---- what kind of start was this ---------------------------------------------
def plan_status(attempt):
    """"planned" | "blank" | "skipped" | None (no plan info at all)."""
    status = attempt.get("plan_status")
    if status in PLAN_STATUSES:
        return status
    if any(attempt.get(k) for k in _PLAN_FIELDS) or planned_edge_cases(attempt):
        return "planned"
    return None


def has_plan(attempt):
    return plan_status(attempt) == "planned"


def planned_edge_cases(attempt):
    raw = attempt.get("planned_edge_cases") or []
    if isinstance(raw, str):
        raw = raw.replace("\n", ",").split(",")
    if not isinstance(raw, list):
        return []
    out, seen = [], set()
    for item in raw:
        text = str(item or "").strip()
        if text and text.lower() not in seen:
            out.append(text)
            seen.add(text.lower())
    return out


# ---- big-O ---------------------------------------------------------------------
_KEEP_WORDS = ("sqrt", "log", "min", "max")
_SUPERSCRIPTS = {"²": "^2", "³": "^3", "·": "*", "×": "*", "⋅": "*", "√": "sqrt"}


def _big_o_body(text):
    """The inside of the first O(...)/Θ(...) in `text`, or a short bare expression."""
    s = str(text)
    m = re.search(r"[OΘΩ]\s*\(", s)
    if not m:
        # A bare "n log n" is a complexity; "linear" or a sentence is not.
        s = s.strip()
        rest = re.sub("|".join(_KEEP_WORDS), " ", s.lower())
        if not s or len(s) > 24 or re.search(r"[a-z]{3,}", rest):
            return None
        return s if re.search(r"[a-z0-9]", rest) else None
    depth, start = 0, m.end() - 1
    for i in range(start, len(s)):
        if s[i] == "(":
            depth += 1
        elif s[i] == ")":
            depth -= 1
            if depth == 0:
                return s[start + 1:i]
    return None


def norm_big_o(text):
    """Canonical shape of a complexity, so notation differences don't count.

    Variables are renamed in order of appearance, which makes O(nm), O(m·n) and
    O(mA) the same shape; qualifiers and prose around the O(...) are dropped.
    Returns None for anything that isn't a complexity.
    """
    if text is None:
        return None
    body = _big_o_body(text)
    if not body:
        return None
    for k, v in _SUPERSCRIPTS.items():
        body = body.replace(k, v)
    body = body.replace("**", "^").lower()
    body = re.sub(r"[\s*]", "", body)
    tokens, i = [], 0
    while i < len(body):
        word = next((w for w in _KEEP_WORDS if body.startswith(w, i)), None)
        if word:
            tokens.append(word)
            i += len(word)
        elif body[i].isalpha():
            tokens.append(("var", body[i]))
            i += 1
        else:
            tokens.append(body[i])
            i += 1
    names, out = {}, []
    for t in tokens:
        if isinstance(t, tuple):
            names.setdefault(t[1], "abcdefghijklmnopqrstuvwxyz"[len(names) % 26])
            out.append(names[t[1]])
        else:
            out.append(t)
    shape = "".join(out)
    shape = re.sub(r"(log|sqrt)\(([a-z])\)", r"\1\2", shape)
    shape = re.sub(r"([a-z])\1+", lambda m: f"{m.group(1)}^{len(m.group(0))}", shape)
    return shape or None


def same_big_o(a, b):
    """True/False when both parse as complexities, else None."""
    na, nb = norm_big_o(a), norm_big_o(b)
    if na is None or nb is None:
        return None
    return na == nb


# ---- how the plan went ---------------------------------------------------------
def _plan_grade(enrichment):
    return (enrichment or {}).get("plan_grade") or {}


def optimal_time(enrichment, canonical=None):
    return _plan_grade(enrichment).get("optimal_time") or (canonical or {}).get("time") or None


def plan_components(attempt, enrichment=None, canonical=None):
    """Each part of the plan as 0..1, or None when it can't be judged yet."""
    grade = _plan_grade(enrichment)
    out = dict.fromkeys(_WEIGHTS)
    if not has_plan(attempt):
        return out
    out["approach"] = _APPROACH_VALUE.get(grade.get("approach_verdict"))
    if attempt.get("predicted_category"):
        verdict = grade.get("pattern_verdict")
        if verdict not in _VERDICT_VALUE:
            verdict = (enrichment or {}).get("prediction_verdict")
        out["pattern"] = _VERDICT_VALUE.get(verdict)
    hit = same_big_o(attempt.get("complexity_target_time"), optimal_time(enrichment, canonical))
    out["complexity"] = None if hit is None else float(hit)
    checks = [c for c in grade.get("edge_cases") or [] if isinstance(c, dict) and c.get("case")]
    if planned_edge_cases(attempt) and checks:
        out["edges"] = sum(1 for c in checks if c.get("covered")) / len(checks)
    out["held"] = _HELD_VALUE.get(attempt.get("plan_held"))
    return out


def plan_score(components):
    """Weighted 0..5 over whatever parts are known.

    None until the approach has been judged or the user has said whether the
    plan held: a matching time target alone says nothing about the plan.
    """
    if components.get("approach") is None and components.get("held") is None:
        return None
    known = [(k, v) for k, v in components.items() if v is not None]
    total = sum(_WEIGHTS[k] for k, _ in known)
    value = sum(_WEIGHTS[k] * v for k, v in known) / total
    return int(value * 5 + 0.5)


def plan_miss(attempt, enrichment=None, canonical=None):
    """Did this start show a planning weakness worth drilling?"""
    status = plan_status(attempt)
    if status == "blank":
        return True
    if status != "planned":
        return False
    if attempt.get("plan_held") == "pivoted":
        return True
    c = plan_components(attempt, enrichment, canonical)
    return (c["approach"] is not None and c["approach"] < 1) or c["complexity"] == 0


def quality_cap(status, held):
    """Ceiling on a solve's review quality from how its plan went.

    Finding the approach while coding means the card isn't known cold, however
    clean the final code: a pivot or an empty start rates Hard at best, a
    tweaked plan Good at best. Returns None when the plan imposes nothing.
    """
    if status == "blank" or held == "pivoted":
        return 3
    if held == "tweaked":
        return 4
    return None


# ---- the scorecard the UI renders ----------------------------------------------
def plan_review(attempt, enrichment=None, canonical=None):
    """Everything the post-solve and detail views show about a plan."""
    status = plan_status(attempt)
    grade = _plan_grade(enrichment)
    components = plan_components(attempt, enrichment, canonical)
    target_time = attempt.get("complexity_target_time") or None
    target_space = attempt.get("complexity_target_space") or None
    opt_time = optimal_time(enrichment, canonical)
    opt_space = grade.get("optimal_space") or (canonical or {}).get("space") or None
    sol_time = grade.get("solution_time") or (enrichment or {}).get("inferred_time") or None
    sol_space = grade.get("solution_space") or (enrichment or {}).get("inferred_space") or None
    return {
        "status": status,
        "approach": attempt.get("predicted_approach"),
        "pattern": attempt.get("predicted_category"),
        "target_time": target_time,
        "target_space": target_space,
        "edge_cases": planned_edge_cases(attempt),
        "plan_time_sec": attempt.get("plan_time_sec"),
        "held": attempt.get("plan_held"),
        "check_revealed": bool(attempt.get("plan_check_revealed")),
        "graded": bool(grade),
        "grading_error": (enrichment or {}).get("plan_grading_error"),
        "pattern_verdict": grade.get("pattern_verdict") or (enrichment or {}).get("prediction_verdict"),
        "approach_verdict": grade.get("approach_verdict"),
        "optimal_time": opt_time,
        "optimal_space": opt_space,
        "solution_time": sol_time,
        "solution_space": sol_space,
        "time_vs_optimal": same_big_o(target_time, opt_time),
        "space_vs_optimal": same_big_o(target_space, opt_space),
        "time_vs_solution": same_big_o(target_time, sol_time),
        "edge_checks": [c for c in grade.get("edge_cases") or [] if isinstance(c, dict)],
        "failure_case": grade.get("failure_case") or None,
        "note": grade.get("note") or None,
        "components": components,
        "score": plan_score(components),
    }


def previous_plan(attempts, enrichment_by_attempt, slug, before_ts, exclude_id=None):
    """The last time this problem was planned or explained, for comparison."""
    best = None
    for a in attempts:
        if a.get("slug") != slug or a.get("id") == exclude_id:
            continue
        if a.get("kind") == "sprint" or (a.get("solved_at") or 0) >= before_ts:
            continue
        if not (has_plan(a) or a.get("approach")):
            continue
        if best is None or (a.get("solved_at") or 0) > (best.get("solved_at") or 0):
            best = a
    if not best:
        return None
    review = plan_review(best, enrichment_by_attempt.get(best.get("id")))
    return {
        "solved_at": best.get("solved_at"),
        "kind": best.get("kind"),
        "planned": has_plan(best),
        "approach": best.get("predicted_approach") or best.get("approach"),
        "target_time": review["target_time"],
        "held": review["held"],
        "score": review["score"],
    }
