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
"""
import time

from . import llm

PROMPT_VERSION = 1


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

    # 3. Prediction grading (did their up-front pattern guess match?).
    predicted = attempt.get("predicted_category")
    if predicted:
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
    store.upsert_enrichment(attempt_id, doc)
    return doc


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
    return {"enriched": done, "remaining": max(0, len(ids) - done), "llm": True}


def set_override(store, attempt_id, overrides):
    """User corrects the LLM's read (e.g. fixes mistake tags). Stored under
    user_overrides, which analytics prefer."""
    e = store.get_enrichment(attempt_id) or {"slug": None, "prompt_version": PROMPT_VERSION}
    merged = {**e.get("user_overrides", {}), **overrides}
    e["user_overrides"] = merged
    store.upsert_enrichment(attempt_id, e)
    return e
