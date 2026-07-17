"""FastAPI app: authenticated REST API + static frontend (V2).

Firestore-only. The LeetCode cookie arrives per-request as a header and is used
transiently. The LLM-powered coaching layer (enrichment, hints, recall grading,
weekly reports, playbooks) degrades gracefully when the selected provider's API
key is unset; most coaching jobs run off the critical path, while recall grading
intentionally waits so the review is scheduled immediately.
"""
import hashlib
import os
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import (auth, coach, config, enrich, gamify, importer, insights,
               leetcode, llm, mock, packs, poller, scheduler)
from .store import get_store

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(ROOT, "static")

app = FastAPI(title="LeetCode Revision V2")


# ---- request models -------------------------------------------------------------
class StartSession(BaseModel):
    slug: str
    kind: str = "adhoc"
    predicted_category: str | None = None
    predicted_approach: str | None = None


class Annotate(BaseModel):
    confidence: int
    independence: str
    mistake_note: str | None = None
    approach: str | None = None
    complexity_time: str | None = None
    complexity_space: str | None = None


class ManualAttempt(BaseModel):
    slug: str
    time_taken_sec: int | None = None
    confidence: int = 2
    independence: str = "solo"
    mistake_note: str | None = None
    approach: str | None = None
    complexity_time: str | None = None
    complexity_space: str | None = None


class RecallSubmit(BaseModel):
    slug: str
    recall_text: str
    complexity_time: str | None = None
    complexity_space: str | None = None
    confidence: int | None = None  # user's confirmed self-grade (overrides LLM)


class OverrideTags(BaseModel):
    tags: list[str]


class SettingsUpdate(BaseModel):
    username: str | None = None
    poll_interval_seconds: int | None = None
    review_limit: int | None = None
    new_limit: int | None = None
    drill_limit: int | None = None
    drill_min_signal: float | None = None
    weakness_weight: float | None = None
    breadth_weight: float | None = None
    mistake_weight: float | None = None
    goal_reviews_per_week: int | None = None
    goal_new_per_week: int | None = None
    discover_min_like_ratio: float | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    discover_min_votes: int | None = None


class ImportPack(BaseModel):
    pack: str
    fetch_metadata: bool = True


class ImportProblem(BaseModel):
    slug: str


class HistoryOpts(BaseModel):
    limit: int = 20


class SweepOpts(BaseModel):
    limit: int = 10


class FollowupGrade(BaseModel):
    question: str
    answer: str


class RecallClarify(BaseModel):
    question: str


# ---- helpers --------------------------------------------------------------------
def _problem_map(store):
    return {p["slug"]: p for p in store.list_problems()}


def _enrichment_map(store):
    return {e["attempt_id"]: e for e in store.list_enrichments()}


def _gather(*fns):
    """Run independent (blocking Firestore) reads concurrently, preserving order.

    The dashboard endpoints each pull several whole collections; issued serially
    that's a chain of round-trips. Fanning them out across a small threadpool
    collapses the chain to roughly the single slowest read.
    """
    with ThreadPoolExecutor(max_workers=len(fns)) as ex:
        return [f.result() for f in [ex.submit(fn) for fn in fns]]


def _effective_tags(e):
    return (e.get("user_overrides") or {}).get("tags") or e.get("mistake_tags") or []


# Only auto-prompt to annotate freshly-solved problems. Older un-annotated
# attempts (e.g. the modal was dismissed, or solved days ago) are left alone so
# the "Solved!" modal doesn't nag on every page load — they stay in History and
# can still be annotated from there.
PENDING_MAX_AGE_SEC = 12 * 3600

# Auto-grade only genuinely fresh solves; older un-graded solves can still be
# graded on demand from the modal.
RECENT_SOLVE_WINDOW_SEC = 120
# Bump to re-generate stored solution grades after a prompt/schema change.
SOLUTION_PROMPT_VERSION = 1


def _pending(store):
    pm = _problem_map(store)
    cutoff = time.time() - PENDING_MAX_AGE_SEC
    out = []
    for a in store.list_attempts():
        if a.get("kind") == "recall" or a.get("source") == "recall":
            continue
        if a.get("confidence") is not None or a.get("source") == "backfill":
            continue
        if (a.get("solved_at") or 0) < cutoff:
            continue
        p = pm.get(a["slug"], {})
        out.append({
            **a, "title": p.get("title", a["slug"]),
            "frontend_id": p.get("frontend_id"), "difficulty": p.get("difficulty"),
            "neetcode_category": p.get("neetcode_category"), "url": p.get("url"),
        })
    out.sort(key=lambda a: a.get("solved_at") or 0, reverse=True)
    return out


async def _enrich_bg(uid, attempt_id):
    await enrich.enrich_attempt(get_store(uid), attempt_id)


async def _grade_solution(store, attempt):
    """Grade an attempt's code and persist the result. Returns the response dict
    the modal expects: {grading_status, graded, grading_error}. Never raises."""
    code = attempt.get("code")
    if not code:
        store.update_attempt(attempt["id"], {"solution_grading_status": "skipped"})
        return {"grading_status": "skipped", "graded": None, "grading_error": None}
    try:
        graded, err = await coach.grade_solution(
            store, attempt["slug"], code, attempt.get("lang"),
            attempt.get("complexity_time"), attempt.get("complexity_space"),
        )
    except Exception as exc:  # defensive; coach already swallows LLM errors
        graded, err = None, str(exc)
    if not graded:
        store.update_attempt(attempt["id"], {
            "solution_grading_status": "failed",
            "solution_grading_error": err or "grading returned no result",
        })
        return {"grading_status": "failed", "graded": None,
                "grading_error": err or "grading returned no result"}
    store.update_attempt(attempt["id"], {
        "solution_grade": {**graded, "prompt_version": SOLUTION_PROMPT_VERSION},
        "solution_grading_status": "viewed", "solution_grading_error": None,
    })
    return {"grading_status": "viewed", "graded": graded, "grading_error": None}


async def _grade_solution_bg(uid, attempt_id):
    store = get_store(uid)
    attempt = store.get_attempt(attempt_id)
    if attempt:
        await _grade_solution(store, attempt)


async def _prep_problem_bg(uid, slug):
    store = get_store(uid)
    await coach.ensure_hint_ladder(store, slug)
    await coach.ensure_canonical(store, slug)


def _latest_unviewed_recall_by_slug(store):
    latest = {}
    for a in store.list_attempts():
        if a.get("kind") != "recall":
            continue
        slug = a.get("slug")
        if not slug:
            continue
        prev = latest.get(slug)
        if not prev or (a.get("solved_at") or 0) >= (prev.get("solved_at") or 0):
            latest[slug] = a
    return {
        slug: attempt for slug, attempt in latest.items()
        if attempt.get("grading_status") in ("pending", "ready", "failed")
    }


def _with_recall_state(queue, store):
    pending = _latest_unviewed_recall_by_slug(store)
    for item in queue.get("reviews", []):
        if item.get("mode") != "recall":
            continue
        attempt = pending.get(item["slug"])
        if not attempt:
            continue
        item["recall_attempt_id"] = attempt.get("id")
        item["grading_status"] = attempt.get("grading_status")
    return queue


def _recall_attempt_payload(store, attempt_id):
    attempt = store.get_attempt(attempt_id)
    if not attempt or attempt.get("kind") != "recall":
        return None
    prob = store.get_problem(attempt["slug"]) or {}
    return {
        **attempt,
        "title": prob.get("title", attempt["slug"]),
        "difficulty": prob.get("difficulty"),
        "category": prob.get("neetcode_category"),
        "url": prob.get("url"),
    }


# ---- dashboard ------------------------------------------------------------------
@app.get("/api/overview")
def api_overview(uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    problems, attempts, reviews, settings = _gather(
        store.list_problems, store.list_attempts, store.list_reviews, store.get_settings)
    ov = scheduler.overview(problems, attempts, reviews)
    ov["newly_mastered"] = gamify.check_mastery_moments(store)
    selected = llm.current_model(settings)
    ov["llm_enabled"] = selected["enabled"]
    ov["llm_provider"] = selected["provider"]
    ov["llm_model"] = selected["model"]
    return ov


@app.get("/api/today")
def api_today(uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    problems, attempts, reviews, enrichments, settings = _gather(
        store.list_problems, store.list_attempts, store.list_reviews,
        store.list_enrichments, store.get_settings)
    queue = scheduler.build_daily_queue(
        problems, attempts, reviews, settings, enrichments=enrichments,
    )
    exclude_slugs = {
        item["slug"] for item in queue.get("reviews", []) + queue.get("new", [])
        if item.get("slug")
    }
    active = store.latest_active_session()
    if active and active.get("slug"):
        exclude_slugs.add(active["slug"])
    for item in _pending(store):
        if item.get("slug"):
            exclude_slugs.add(item["slug"])
    queue["drills"] = scheduler.build_drill_lane(
        problems, attempts, reviews, settings, enrichments=enrichments,
        exclude_slugs=exclude_slugs,
    )
    return _with_recall_state(queue, store)


@app.get("/api/topics")
def api_topics(uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    return scheduler.topic_stats(store.list_problems(), store.list_attempts())


@app.get("/api/insights")
def api_insights(uid: str = Depends(auth.require_user)):
    return insights.build(get_store(uid))


# ---- sessions -------------------------------------------------------------------
@app.post("/api/session/start")
def api_session_start(body: StartSession, bg: BackgroundTasks,
                      uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    prob = store.get_problem(body.slug)
    if not prob:
        raise HTTPException(404, "unknown problem")
    store.cancel_active_sessions()
    started = int(time.time())
    sid = store.add_session({
        "slug": body.slug, "started_at": started, "status": "active",
        "kind": body.kind, "attempt_id": None, "hint_level": 0,
        "predicted_category": body.predicted_category,
        "predicted_approach": body.predicted_approach,
    })
    if llm.enabled(store.get_settings()):
        bg.add_task(_prep_problem_bg, uid, body.slug)
    return {"session_id": sid, "slug": body.slug, "url": prob["url"], "started_at": started}


@app.get("/api/session/active")
def api_session_active(uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    s = store.latest_active_session()
    if not s:
        return {"active": None}
    prob = store.get_problem(s["slug"]) or {}
    return {"active": {
        "session_id": s["id"], "slug": s["slug"], "started_at": s["started_at"],
        "kind": s.get("kind"), "elapsed_sec": int(time.time()) - s["started_at"],
        "title": prob.get("title", s["slug"]), "url": prob.get("url"),
        "hint_level": s.get("hint_level", 0),
        "hints_available": bool(prob.get("hint_ladder")) or llm.enabled(store.get_settings()),
    }}


@app.post("/api/session/cancel")
def api_session_cancel(uid: str = Depends(auth.require_user)):
    get_store(uid).cancel_active_sessions()
    return {"ok": True}


@app.post("/api/session/hint")
async def api_session_hint(uid: str = Depends(auth.require_user)):
    """Reveal the next hint rung for the active session."""
    store = get_store(uid)
    s = store.latest_active_session()
    if not s:
        raise HTTPException(400, "no active session")
    ladder = await coach.ensure_hint_ladder(store, s["slug"])
    if not ladder:
        return {"hint": None, "level": s.get("hint_level", 0),
                "exhausted": True, "llm": llm.enabled(store.get_settings())}
    level = min(len(ladder), s.get("hint_level", 0) + 1)
    store.update_session(s["id"], {"hint_level": level})
    return {"hint": ladder[level - 1], "level": level, "total": len(ladder),
            "exhausted": level >= len(ladder)}


@app.post("/api/poll")
async def api_poll(bg: BackgroundTasks, uid: str = Depends(auth.require_user),
                   lc=Depends(auth.leetcode_auth)):
    store = get_store(uid)
    username = store.get_settings().get("username")
    new_ids = await poller.check_active_sessions(store, username, lc)
    # Kick off solution grading for freshly-detected solves, off the critical
    # path. Only genuinely recent solves with code are auto-graded; the submission
    # dedup in the poller guarantees each solve is graded at most once.
    if llm.enabled():
        now = time.time()
        for aid in new_ids:
            a = store.get_attempt(aid)
            if (a and a.get("code")
                    and (a.get("solved_at") or 0) >= now - RECENT_SOLVE_WINDOW_SEC):
                bg.add_task(_grade_solution_bg, uid, aid)
    return {"new_attempts": new_ids, "pending": _pending(store)}


@app.get("/api/pending")
def api_pending(uid: str = Depends(auth.require_user)):
    return {"pending": _pending(get_store(uid))}


# ---- attempts -------------------------------------------------------------------
def _similar_suggestion(store, slug):
    """First not-yet-in-library similar problem, for a struggled solve."""
    p = store.get_problem(slug) or {}
    for sim in p.get("similar_slugs", []) or []:
        sp = store.get_problem(sim)
        if not sp or not scheduler._in_library(sp):
            return {"slug": sim, "title": (sp or {}).get("title", sim)}
    return None


@app.post("/api/attempt/{attempt_id}/annotate")
def api_annotate(attempt_id: str, body: Annotate, bg: BackgroundTasks,
                 uid: str = Depends(auth.require_user)):
    if body.confidence not in (1, 2, 3):
        raise HTTPException(400, "confidence must be 1..3")
    if body.independence not in ("solo", "hints", "solution"):
        raise HTTPException(400, "bad independence")
    store = get_store(uid)
    attempt = store.get_attempt(attempt_id)
    if not attempt:
        raise HTTPException(404, "no such attempt")
    store.update_attempt(attempt_id, {
        "confidence": body.confidence, "independence": body.independence,
        "mistake_note": body.mistake_note, "approach": body.approach,
        "complexity_time": body.complexity_time, "complexity_space": body.complexity_space,
    })
    slug = attempt["slug"]
    current = store.get_review(slug)
    if current:
        current = {**current, "slug": slug}
    # Fold the LLM's /5 solution grade into scheduling when it's already landed;
    # otherwise schedule on the self-assessment alone (LLM never blocks scheduling).
    graded = attempt.get("solution_grade") or {}
    solution_score = graded.get("score") if graded else None
    new_state = scheduler.advance_review(
        current, body.confidence, body.independence, solution_score=solution_score)
    new_state["slug"] = slug
    store.upsert_review(slug, new_state)
    if llm.enabled(store.get_settings()):
        bg.add_task(_enrich_bg, uid, attempt_id)
    suggestion = None
    if scheduler.quality(body.confidence, body.independence) < 3:
        suggestion = _similar_suggestion(store, slug)
    return {"ok": True, "review": new_state, "similar": suggestion}


@app.post("/api/attempt/{attempt_id}/grade-solution")
async def api_grade_solution(attempt_id: str, uid: str = Depends(auth.require_user)):
    """On-demand solution grading — used by the modal to grade a solve that wasn't
    auto-graded (stale) or to retry after a failure. Awaits the LLM synchronously
    like recall grading so the modal can render the result immediately."""
    store = get_store(uid)
    attempt = store.get_attempt(attempt_id)
    if not attempt:
        raise HTTPException(404, "no such attempt")
    result = await _grade_solution(store, attempt)
    return {"ok": True, **result}


@app.post("/api/attempt/manual")
def api_manual(body: ManualAttempt, bg: BackgroundTasks, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    if not store.get_problem(body.slug):
        raise HTTPException(404, "unknown problem")
    aid = store.add_attempt({
        "slug": body.slug, "solved_at": int(time.time()),
        "time_taken_sec": body.time_taken_sec, "runtime_percentile": None,
        "memory_percentile": None, "lang": None, "wrong_before_ac": None,
        "submission_id": None, "code": None,
        "confidence": body.confidence, "independence": body.independence,
        "mistake_note": body.mistake_note, "approach": body.approach,
        "complexity_time": body.complexity_time, "complexity_space": body.complexity_space,
        "source": "manual", "kind": "adhoc",
    })
    current = store.get_review(body.slug)
    if current:
        current = {**current, "slug": body.slug}
    new_state = scheduler.advance_review(current, body.confidence, body.independence)
    new_state["slug"] = body.slug
    store.upsert_review(body.slug, new_state)
    if llm.enabled(store.get_settings()):
        bg.add_task(_enrich_bg, uid, aid)
    return {"ok": True, "attempt_id": aid, "review": new_state}


@app.post("/api/attempt/{attempt_id}/override")
def api_override(attempt_id: str, body: OverrideTags, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    if not store.get_attempt(attempt_id):
        raise HTTPException(404, "no such attempt")
    e = enrich.set_override(store, attempt_id, {"tags": body.tags})
    return {"ok": True, "enrichment": e}


@app.get("/api/attempt/{attempt_id}")
def api_attempt(attempt_id: str, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    a = store.get_attempt(attempt_id)
    if not a:
        raise HTTPException(404, "no such attempt")
    prob = store.get_problem(a["slug"]) or {}
    return {**a, "title": prob.get("title"), "difficulty": prob.get("difficulty"),
            "neetcode_category": prob.get("neetcode_category"), "url": prob.get("url"),
            "enrichment": store.get_enrichment(attempt_id)}


@app.get("/api/history")
def api_history(limit: int = 50, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    pm = _problem_map(store)
    em = _enrichment_map(store)
    rows = sorted(store.list_attempts(),
                  key=lambda a: (a.get("solved_at") or 0), reverse=True)[:limit]
    out = []
    for a in rows:
        p = pm.get(a["slug"], {})
        e = em.get(a.get("id"), {})
        out.append({
            "id": a.get("id"), "slug": a["slug"], "solved_at": a.get("solved_at"),
            "time_taken_sec": a.get("time_taken_sec"),
            "runtime_percentile": a.get("runtime_percentile"), "lang": a.get("lang"),
            "confidence": a.get("confidence"), "independence": a.get("independence"),
            "mistake_note": a.get("mistake_note"), "kind": a.get("kind"),
            "source": a.get("source"), "title": p.get("title", a["slug"]),
            "difficulty": p.get("difficulty"), "neetcode_category": p.get("neetcode_category"),
            "url": p.get("url"), "has_code": bool(a.get("code")),
            "mistake_tags": _effective_tags(e),
            "pattern_used": e.get("pattern_used"),
            "predicted_category": a.get("predicted_category"),
            "prediction_verdict": e.get("prediction_verdict"),
        })
    return out


# ---- recall reviews -------------------------------------------------------------
@app.post("/api/review/recall")
async def api_recall(body: RecallSubmit, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    if not store.get_problem(body.slug):
        raise HTTPException(404, "unknown problem")
    if body.confidence is not None and body.confidence not in (1, 2, 3):
        raise HTTPException(400, "confidence must be 1..3")
    is_manual = body.confidence is not None or not llm.enabled(store.get_settings())
    if is_manual and body.confidence is None:
        raise HTTPException(400, "confidence is required when recall grading is manual")
    conf = body.confidence if body.confidence is not None else None
    indep = "solo" if body.confidence is not None else None
    status = "viewed" if is_manual else "pending"
    now = int(time.time())
    aid = store.add_attempt({
        "slug": body.slug, "solved_at": now, "time_taken_sec": None,
        "runtime_percentile": None, "memory_percentile": None, "lang": None,
        "wrong_before_ac": None, "submission_id": None, "code": None,
        "confidence": conf, "independence": indep,
        "mistake_note": None, "approach": body.recall_text,
        "complexity_time": body.complexity_time, "complexity_space": body.complexity_space,
        "source": "recall", "kind": "recall", "grading_status": status,
        "recall_grade": None, "grading_error": None,
    })
    if not is_manual:
        store.update_attempt(aid, {"grading_started_at": now})
        try:
            graded, err = await coach.grade_recall(
                store, body.slug, body.recall_text,
                body.complexity_time, body.complexity_space,
            )
        except Exception as exc:
            graded, err = None, str(exc)
        if not graded:
            store.update_attempt(aid, {
                "grading_status": "failed",
                "grading_error": err or "grading returned no result",
                "grading_completed_at": int(time.time()),
            })
            return {"ok": True, "attempt_id": aid, "grading_status": "failed",
                    "review": None, "graded": None,
                    "grading_error": err or "grading returned no result"}

        current = store.get_review(body.slug)
        if current:
            current = {**current, "slug": body.slug}
        grade = (graded or {}).get("grade", 0)
        new_state = scheduler.advance_review(current, None, None, grade=grade or 0)
        new_state["slug"] = body.slug
        store.upsert_review(body.slug, new_state)
        store.update_attempt(aid, {
            "grading_status": "viewed",
            "recall_grade": graded,
            "grading_error": None,
            "grading_completed_at": int(time.time()),
            "confidence": grade,
            "independence": "solo",
        })
        return {"ok": True, "attempt_id": aid, "grading_status": "viewed",
                "review": new_state, "graded": graded}

    current = store.get_review(body.slug)
    if current:
        current = {**current, "slug": body.slug}
    new_state = scheduler.advance_review(current, body.confidence, "solo")
    new_state["slug"] = body.slug
    store.upsert_review(body.slug, new_state)
    return {"ok": True, "attempt_id": aid, "grading_status": "viewed",
            "review": new_state, "graded": None}


@app.get("/api/review/recall/{attempt_id}")
def api_recall_result(attempt_id: str, uid: str = Depends(auth.require_user)):
    payload = _recall_attempt_payload(get_store(uid), attempt_id)
    if not payload:
        raise HTTPException(404, "no such recall")
    return payload


@app.post("/api/review/recall/{attempt_id}/clarify")
async def api_recall_clarify(attempt_id: str, body: RecallClarify,
                             uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    attempt = store.get_attempt(attempt_id)
    if not attempt or attempt.get("kind") != "recall":
        raise HTTPException(404, "no such recall")
    if attempt.get("grading_status") not in ("ready", "viewed") or not attempt.get("recall_grade"):
        raise HTTPException(400, "recall grade is not ready")
    if not llm.enabled():
        raise HTTPException(400, "Recall clarification is unavailable without Gemini.")
    question = body.question.strip()
    if not question:
        raise HTTPException(400, "question is required")
    result = await coach.clarify_recall(store, attempt, question)
    if not result or not result.get("reply"):
        raise HTTPException(400, "Recall clarification is unavailable.")
    return {"reply": result["reply"]}


# ---- problems + discover --------------------------------------------------------
@app.get("/api/problems")
def api_problems(search: str = "", category: str = "", uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    reviews = {r["slug"]: r for r in store.list_reviews()}
    counts = {}
    for a in store.list_attempts():
        counts[a["slug"]] = counts.get(a["slug"], 0) + 1
    out = []
    for p in store.list_problems():
        if not scheduler._in_library(p):
            continue
        if search and search.lower() not in p.get("title", "").lower():
            continue
        if category and p.get("neetcode_category") != category:
            continue
        r = reviews.get(p["slug"], {})
        out.append({**p, "attempt_count": counts.get(p["slug"], 0),
                    "due_date": r.get("due_date"), "leech": r.get("leech")})
    out.sort(key=lambda p: p.get("frontend_id") or 9999)
    return out


@app.get("/api/problem/{slug}/recall-context")
async def api_recall_context(slug: str, uid: str = Depends(auth.require_user),
                             lc=Depends(auth.leetcode_auth)):
    store = get_store(uid)
    p = store.get_problem(slug)
    if not p:
        raise HTTPException(404, "unknown problem")
    if not p.get("content_html"):
        try:
            meta = await leetcode.question(slug, lc)
        except Exception:
            meta = None
        if meta and meta.get("content_html"):
            store.upsert_problem({
                "slug": slug,
                "content_html": meta.get("content_html"),
                "frontend_id": meta.get("frontend_id") or p.get("frontend_id"),
                "title": meta.get("title") or p.get("title"),
                "difficulty": meta.get("difficulty") or p.get("difficulty"),
                "leetcode_tags": meta.get("tags") or p.get("leetcode_tags", []),
                "likes": meta.get("likes"),
                "dislikes": meta.get("dislikes"),
                "like_ratio": meta.get("like_ratio"),
                "ac_rate": meta.get("ac_rate"),
                "paid_only": meta.get("paid_only"),
                "similar_slugs": meta.get("similar_slugs") or p.get("similar_slugs", []),
            })
            p = store.get_problem(slug) or p
    return {
        "slug": slug,
        "title": p.get("title", slug),
        "difficulty": p.get("difficulty"),
        "url": p.get("url") or f"https://leetcode.com/problems/{slug}/",
        "category": p.get("neetcode_category"),
        "content_html": p.get("content_html"),
    }


@app.get("/api/packs")
def api_packs(uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    have = {}
    for p in store.list_problems():
        for name in p.get("packs", []) or []:
            have[name] = have.get(name, 0) + 1
    out = []
    for name in packs.pack_names():
        pk = packs.get_pack(name)
        out.append({"name": name, "label": pk["label"], "total": len(pk["slugs"]),
                    "imported": have.get(name, 0)})
    return out


@app.get("/api/discover")
async def api_discover(topic: str = "", difficulty: str = "",
                       uid: str = Depends(auth.require_user), lc=Depends(auth.leetcode_auth)):
    store = get_store(uid)
    s = store.get_settings()
    return await importer.discover(
        store, lc, topic=topic or None, difficulty=difficulty or None,
        min_like_ratio=s.get("discover_min_like_ratio", 0.85),
        min_votes=s.get("discover_min_votes", 500),
    )


@app.post("/api/import/pack")
async def api_import_pack(body: ImportPack, uid: str = Depends(auth.require_user),
                          lc=Depends(auth.leetcode_auth)):
    return await importer.import_pack(get_store(uid), body.pack, lc, fetch_metadata=body.fetch_metadata)


@app.post("/api/import/problem")
async def api_import_problem(body: ImportProblem, uid: str = Depends(auth.require_user),
                             lc=Depends(auth.leetcode_auth)):
    return await importer.import_problem(get_store(uid), body.slug, lc)


@app.post("/api/import/history")
async def api_import_history(body: HistoryOpts, uid: str = Depends(auth.require_user),
                             lc=Depends(auth.leetcode_auth)):
    store = get_store(uid)
    username = store.get_settings().get("username")
    return await importer.backfill_history(store, username, lc, limit=body.limit)


# ---- enrichment sweep -----------------------------------------------------------
@app.post("/api/enrich/sweep")
async def api_enrich_sweep(body: SweepOpts, uid: str = Depends(auth.require_user)):
    return await enrich.sweep(get_store(uid), limit=body.limit)


# ---- weekly coach report --------------------------------------------------------
@app.get("/api/report/latest")
def api_report_latest(uid: str = Depends(auth.require_user)):
    return {"report": get_store(uid).latest_report()}


@app.post("/api/report/weekly")
async def api_report_weekly(uid: str = Depends(auth.require_user)):
    r = await coach.weekly_report(get_store(uid), force=True)
    store = get_store(uid)
    return {"report": r, "llm": llm.enabled(store.get_settings())}


# ---- playbooks ------------------------------------------------------------------
@app.get("/api/playbook/{category}")
def api_playbook(category: str, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    pb = store.get_playbook(category)
    count = coach.category_attempt_count(store, category)
    stale = bool(pb) and (count - pb.get("attempt_count_at_generation", 0) >= 3)
    return {"playbook": pb, "attempt_count": count, "stale": stale,
            "can_generate": count > 0 and llm.enabled(store.get_settings())}


@app.post("/api/playbook/{category}/regenerate")
async def api_playbook_regen(category: str, uid: str = Depends(auth.require_user)):
    pb = await coach.synthesize_playbook(get_store(uid), category, force=True)
    store = get_store(uid)
    return {"playbook": pb, "llm": llm.enabled(store.get_settings())}


# ---- follow-ups -----------------------------------------------------------------
@app.get("/api/problem/{slug}/followups")
async def api_followups(slug: str, uid: str = Depends(auth.require_user)):
    return {"followups": await coach.ensure_followups(get_store(uid), slug)}


@app.post("/api/problem/{slug}/followup/grade")
async def api_followup_grade(slug: str, body: FollowupGrade,
                             uid: str = Depends(auth.require_user)):
    return {"result": await coach.grade_followup(get_store(uid), slug, body.question, body.answer)}


# ---- mock interviews ------------------------------------------------------------
@app.get("/api/mock/status")
def api_mock_status(uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    active = next((m for m in store.list_mocks() if m.get("status") == "active"), None)
    return {"active": active, "taken_this_week": mock.taken_this_week(store)}


@app.post("/api/mock/start")
def api_mock_start(uid: str = Depends(auth.require_user)):
    return mock.start(get_store(uid))


@app.post("/api/mock/{mock_id}/finish")
def api_mock_finish(mock_id: str, uid: str = Depends(auth.require_user)):
    res = mock.finish(get_store(uid), mock_id)
    if not res:
        raise HTTPException(404, "no such mock")
    return res


@app.get("/api/mock/list")
def api_mock_list(uid: str = Depends(auth.require_user)):
    return get_store(uid).list_mocks()


# ---- settings -------------------------------------------------------------------
@app.get("/api/config")
def api_get_config(uid: str = Depends(auth.require_user)):
    settings = get_store(uid).get_settings()
    selected = llm.current_model(settings)
    return {
        **settings,
        "llm_enabled": selected["enabled"],
        "llm_options": config.LLM_OPTIONS,
    }


@app.post("/api/config")
def api_set_config(body: SettingsUpdate, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    provider = updates.get("llm_provider")
    model = updates.get("llm_model")
    if provider is not None:
        provider = provider.lower()
        if provider not in config.LLM_OPTIONS:
            raise HTTPException(400, "unsupported LLM provider")
        updates["llm_provider"] = provider
    effective_provider = provider or store.get_settings().get("llm_provider")
    if provider is not None and model is None:
        current_model = store.get_settings().get("llm_model")
        if current_model not in config.LLM_OPTIONS[provider]:
            updates["llm_model"] = config.LLM_OPTIONS[provider][0]
    if model is not None and model not in config.LLM_OPTIONS.get(effective_provider, []):
        raise HTTPException(400, "unsupported model for provider")
    store.update_settings(updates)
    return store.get_settings()


@app.get("/api/me")
def api_me(uid: str = Depends(auth.require_user)):
    settings = get_store(uid).get_settings()
    selected = llm.current_model(settings)
    return {"uid": uid, "local_mode": config.local_mode(), "llm_enabled": selected["enabled"],
            "llm_provider": selected["provider"], "llm_model": selected["model"]}


# ---- static frontend ------------------------------------------------------------
_VERSIONED_ASSETS = ("style.css", "charts.js", "app.js", "views.js")


def asset_version():
    h = hashlib.sha1()
    for name in _VERSIONED_ASSETS:
        try:
            with open(os.path.join(STATIC_DIR, name), "rb") as fh:
                h.update(fh.read())
        except OSError:
            continue
    return h.hexdigest()[:8]


@app.get("/")
def index():
    with open(os.path.join(STATIC_DIR, "index.html"), encoding="utf-8") as fh:
        html = fh.read()
    return HTMLResponse(html.replace("__ASSET_VER__", asset_version()))


app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
