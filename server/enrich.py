"""Attempt enrichment pipeline — turns raw annotation text + code into
structured, queryable signal via the LLM.

Rules (from the plan):
  * Raw text is the source of truth; everything here is derived data, stamped
    with PROMPT_VERSION so it can be cheaply re-run when prompts improve.
  * Never in the critical path: callers fire this via BackgroundTasks after the
    attempt is already saved. Any failure leaves a null/partial enrichment.
  * user_overrides (set when the user corrects a tag) always win over LLM values
    downstream — see scheduler.mistake_density and insights.

Bump PROMPT_VERSION whenever a prompt/schema changes; the sweep endpoint will
re-enrich anything older.

Plan grading (did the pre-solve plan hold up?) is its own step with its own
PLAN_PROMPT_VERSION: it runs when a solve is rated, merges into the same
enrichment doc, and survives a re-enrichment of the rest.
"""
import time

from . import coach, llm, plans

PROMPT_VERSION = 1
PLAN_PROMPT_VERSION = 1
# Enrichment fields owned by plan grading; a full re-enrichment carries them over.
PLAN_KEYS = ("plan_grade", "plan_prompt_version", "plan_grading_error")


def _prev_code(store, attempt):
    """Most recent prior accepted code for the same slug (for diff/analysis)."""
    prior = [a for a in store.attempts_for_slug(attempt["slug"])
             if a.get("code") and (a.get("solved_at") or 0) < (attempt.get("solved_at") or 0)]
    prior.sort(key=lambda a: a.get("solved_at") or 0)
    return prior[-1]["code"] if prior else None


async def enrich_attempt(store, attempt_id):
    """Run all applicable LLM tasks for one attempt and persist a single
    enrichment doc. Returns the doc (or None if nothing ran / LLM disabled)."""
    settings = store.get_settings()
    if not llm.enabled(settings):
        return None
    attempt = store.get_attempt(attempt_id)
    if not attempt:
        return None
    problem = store.get_problem(attempt["slug"]) or {}
    pctx = {
        "title": problem.get("title", attempt["slug"]),
        "difficulty": problem.get("difficulty"),
        "category": problem.get("neetcode_category"),
    }
    selected = llm.current_model(settings)
    doc = {
        "slug": attempt["slug"], "prompt_version": PROMPT_VERSION,
        "provider": selected["provider"], "model": selected["model"],
        "created_at": int(time.time()),
        "status": "ok",
    }

    # 1. Mistake classification — only when there is signal.
    note = attempt.get("mistake_note")
    indep = attempt.get("independence")
    if note or indep in ("hints", "solution"):
        mistake = await llm.extract("classify_mistake", {
            **pctx, "note": note, "approach": attempt.get("approach"), "independence": indep,
        }, settings=settings)
        if mistake:
            doc.update({
                "mistake_tags": mistake["tags"], "mistake_phase": mistake["phase"],
                "severity": mistake["severity"], "mistake_summary": mistake["summary"],
            })

    # 2. Code analysis (pattern used + complexity check + diff).
    code = attempt.get("code")
    if code:
        analysis = await llm.extract("analyze_code", {
            **pctx, "code": code, "lang": attempt.get("lang"),
            "prev_code": _prev_code(store, attempt),
            "claim_time": attempt.get("complexity_time"),
            "claim_space": attempt.get("complexity_space"),
        }, settings=settings)
        if analysis:
            doc.update({
                "pattern_used": analysis["pattern_used"],
                "inferred_time": analysis["inferred_time"],
                "inferred_space": analysis["inferred_space"],
                "complexity_verdict": analysis["complexity_verdict"],
                "diff_summary": analysis["diff_summary"],
            })

    # 3. Prediction grading (did their up-front pattern guess match?). A solve
    # that started from a plan has its guess graded with the rest of that plan.
    predicted = attempt.get("predicted_category")
    if predicted and not attempt.get("plan_status"):
        pred = await llm.extract("grade_prediction", {
            **pctx, "predicted_category": predicted,
            "predicted_approach": attempt.get("predicted_approach"),
            "pattern_used": doc.get("pattern_used"),
        }, settings=settings)
        if pred:
            doc.update({"prediction_verdict": pred["verdict"],
                        "prediction_note": pred["note"]})

    existing = store.get_enrichment(attempt_id) or {}
    doc["user_overrides"] = existing.get("user_overrides", {})
    for k in PLAN_KEYS + ("prediction_verdict", "prediction_note"):
        if k in existing and k not in doc:
            doc[k] = existing[k]
    store.upsert_enrichment(attempt_id, doc)
    return doc


def _short(items, limit=5, width=80):
    out = []
    for item in items or []:
        text = " ".join(str(item or "").split())[:width]
        if text and text.lower() not in {o.lower() for o in out}:
            out.append(text)
    return out[:limit]


def normalize_plan_grade(res):
    """The stored shape of a plan grade, from the flat model response."""
    covered = _short(res.get("edge_cases_covered"))
    missed = [c for c in _short(res.get("edge_cases_missed"))
              if c.lower() not in {x.lower() for x in covered}]
    edges = ([{"case": c, "covered": True} for c in covered]
             + [{"case": c, "covered": False} for c in missed])[:5]
    return {
        "pattern_verdict": res.get("pattern_verdict") or "unknown",
        "approach_verdict": res.get("approach_verdict") or "unknown",
        "optimal_time": (res.get("optimal_time") or "")[:60],
        "optimal_space": (res.get("optimal_space") or "")[:60],
        "solution_time": (res.get("solution_time") or "")[:60],
        "solution_space": (res.get("solution_space") or "")[:60],
        "edge_cases": edges,
        "failure_case": (res.get("failure_case") or "")[:80],
        "note": (res.get("note") or "")[:400],
    }


def _merge_enrichment(store, attempt, fields):
    """Read-modify-write, with no await between, so a concurrent full
    enrichment of the same attempt can't drop these fields or have its own
    dropped. A plan grade alone doesn't make an attempt enriched: without a
    prompt_version the sweep still runs the rest."""
    existing = store.get_enrichment(attempt["id"]) or {
        "slug": attempt["slug"], "created_at": int(time.time()),
        "user_overrides": {},
    }
    existing.pop("attempt_id", None)
    store.upsert_enrichment(attempt["id"], {**existing, **fields})
    return {**existing, **fields}


async def grade_plan(store, attempt_id):
    """Grade a solve's pre-solve plan and persist it. Returns (enrichment, error).

    Never raises. (None, None) when there is nothing to grade or no LLM; the
    solve and its schedule never wait on this.
    """
    settings = store.get_settings()
    if not llm.enabled(settings):
        return None, None
    attempt = store.get_attempt(attempt_id)
    if not attempt or not plans.has_plan(attempt):
        return None, None
    problem = store.get_problem(attempt["slug"]) or {}
    canonical = await coach.ensure_canonical(store, attempt["slug"])
    res, err = await llm.extract_or_error("grade_plan", {
        "title": problem.get("title", attempt["slug"]),
        "difficulty": problem.get("difficulty"),
        "category": problem.get("neetcode_category"),
        "canonical": ", ".join((canonical or {}).get("key_ideas", [])) or None,
        "canon_time": (canonical or {}).get("time"),
        "canon_space": (canonical or {}).get("space"),
        "predicted_category": attempt.get("predicted_category"),
        "predicted_approach": attempt.get("predicted_approach"),
        "complexity_target_time": attempt.get("complexity_target_time"),
        "complexity_target_space": attempt.get("complexity_target_space"),
        "planned_edge_cases": plans.planned_edge_cases(attempt),
        "plan_held": attempt.get("plan_held"),
        "note": attempt.get("mistake_note"),
        "failed_tests": attempt.get("failed_tests") or [],
        "code": attempt.get("code"), "lang": attempt.get("lang"),
    }, settings=settings)
    # Stamped either way, so a prompt that keeps failing isn't re-sent on every
    # sweep; the retry button re-runs it on demand.
    fields = {"plan_prompt_version": PLAN_PROMPT_VERSION}
    if not res:
        fields["plan_grading_error"] = err or "grading returned no result"
        return _merge_enrichment(store, attempt, fields), fields["plan_grading_error"]
    grade = normalize_plan_grade(res)
    fields.update({"plan_grade": grade, "plan_grading_error": None})
    if attempt.get("predicted_category") and grade["pattern_verdict"] != "unknown":
        fields["prediction_verdict"] = grade["pattern_verdict"]
        fields["prediction_note"] = grade["note"][:120]
    return _merge_enrichment(store, attempt, fields), None


def needs_plan_grade(store):
    """Rated (or dismissed) planned solves whose plan grade is missing or stale."""
    enr = {e["attempt_id"]: e for e in store.list_enrichments()}
    out = []
    for a in store.list_attempts():
        if not plans.has_plan(a) or a.get("kind") in ("sprint", "recall"):
            continue
        if a.get("confidence") is None and not a.get("annotation_dismissed_at"):
            continue  # graded when it's rated, with the user's own read of it
        if (enr.get(a["id"]) or {}).get("plan_prompt_version", 0) < PLAN_PROMPT_VERSION:
            out.append(a["id"])
    return out


def needs_enrichment(store):
    """Attempt ids whose enrichment is missing or stale (older PROMPT_VERSION)."""
    enr = {e["attempt_id"]: e for e in store.list_enrichments()}
    out = []
    for a in store.list_attempts():
        if a.get("source") == "backfill" and not a.get("mistake_note"):
            continue  # nothing to enrich on a bare backfill
        e = enr.get(a["id"])
        if not e or e.get("prompt_version", 0) < PROMPT_VERSION:
            out.append(a["id"])
    return out


async def sweep(store, limit=10):
    """Enrich up to `limit` attempts that are missing/stale. This is also the
    re-run mechanism after a prompt improvement (bump PROMPT_VERSION)."""
    settings = store.get_settings()
    if not llm.enabled(settings):
        return {"enriched": 0, "remaining": 0, "llm": False}
    ids = needs_enrichment(store)
    todo = ids[:limit]
    done = 0
    for aid in todo:
        if await enrich_attempt(store, aid):
            done += 1
    plan_ids = needs_plan_grade(store)
    for aid in plan_ids[:max(0, limit - len(todo))]:
        doc, _ = await grade_plan(store, aid)
        if doc:
            done += 1
    remaining = len(needs_enrichment(store)) + len(needs_plan_grade(store))
    return {"enriched": done, "remaining": remaining, "llm": True}


def set_override(store, attempt_id, overrides):
    """User corrects the LLM's read (e.g. fixes mistake tags). Stored under
    user_overrides, which analytics prefer."""
    e = store.get_enrichment(attempt_id) or {"slug": None, "prompt_version": PROMPT_VERSION}
    merged = {**e.get("user_overrides", {}), **overrides}
    e["user_overrides"] = merged
    store.upsert_enrichment(attempt_id, e)
    return e
