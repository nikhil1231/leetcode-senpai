"""FastAPI app: authenticated REST API + static frontend (V2).

Firestore-only. The LeetCode cookie arrives per-request as a header and is used
transiently. The Gemini-powered coaching layer (enrichment, hints, recall
grading, weekly reports, playbooks) runs off the critical path and degrades
gracefully when GEMINI_API_KEY is unset.
"""
import os
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
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
    weakness_weight: float | None = None
    breadth_weight: float | None = None
    mistake_weight: float | None = None
    goal_reviews_per_week: int | None = None
    goal_new_per_week: int | None = None
    discover_min_like_ratio: float | None = None
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


async def _prep_problem_bg(uid, slug):
    store = get_store(uid)
    await coach.ensure_hint_ladder(store, slug)
    await coach.ensure_canonical(store, slug)


async def _grade_recall_bg(uid, attempt_id):
    store = get_store(uid)
    attempt = store.get_attempt(attempt_id)
    if not attempt:
        return
    store.update_attempt(attempt_id, {
        "grading_status": "pending",
        "grading_started_at": int(time.time()),
        "grading_error": None,
    })
    try:
        graded, err = await coach.grade_recall(
            store, attempt["slug"], attempt.get("approach") or "",
            attempt.get("complexity_time"), attempt.get("complexity_space"),
        )
        if graded:
            store.update_attempt(attempt_id, {
                "grading_status": "ready",
                "recall_grade": graded,
                "grading_completed_at": int(time.time()),
            })
        else:
            store.update_attempt(attempt_id, {
                "grading_status": "failed",
                "grading_error": err or "grading returned no result",
                "grading_completed_at": int(time.time()),
            })
    except Exception as exc:
        store.update_attempt(attempt_id, {
            "grading_status": "failed",
            "grading_error": str(exc),
            "grading_completed_at": int(time.time()),
        })


def _latest_unviewed_recall_by_slug(store):
    out = {}
    for a in store.list_attempts():
        if a.get("kind") != "recall":
            continue
        status = a.get("grading_status")
        if status not in ("pending", "ready", "failed"):
            continue
        slug = a.get("slug")
        if not slug:
            continue
        prev = out.get(slug)
        if not prev or (a.get("solved_at") or 0) >= (prev.get("solved_at") or 0):
            out[slug] = a
    return out


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
    problems, attempts, reviews = _gather(
        store.list_problems, store.list_attempts, store.list_reviews)
    ov = scheduler.overview(problems, attempts, reviews)
    ov["newly_mastered"] = gamify.check_mastery_moments(store)
    ov["llm_enabled"] = llm.enabled()
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
    if llm.enabled():
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
        "hints_available": bool(prob.get("hint_ladder")) or llm.enabled(),
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
                "exhausted": True, "llm": llm.enabled()}
    level = min(len(ladder), s.get("hint_level", 0) + 1)
    store.update_session(s["id"], {"hint_level": level})
    return {"hint": ladder[level - 1], "level": level, "total": len(ladder),
            "exhausted": level >= len(ladder)}


@app.post("/api/poll")
async def api_poll(uid: str = Depends(auth.require_user), lc=Depends(auth.leetcode_auth)):
    store = get_store(uid)
    username = store.get_settings().get("username")
    new_ids = await poller.check_active_sessions(store, username, lc)
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
    new_state = scheduler.advance_review(current, body.confidence, body.independence)
    new_state["slug"] = slug
    store.upsert_review(slug, new_state)
    if llm.enabled():
        bg.add_task(_enrich_bg, uid, attempt_id)
    suggestion = None
    if scheduler.quality(body.confidence, body.independence) < 3:
        suggestion = _similar_suggestion(store, slug)
    return {"ok": True, "review": new_state, "similar": suggestion}


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
    if llm.enabled():
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
async def api_recall(body: RecallSubmit, bg: BackgroundTasks,
                     uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    if not store.get_problem(body.slug):
        raise HTTPException(404, "unknown problem")
    if body.confidence is not None and body.confidence not in (1, 2, 3):
        raise HTTPException(400, "confidence must be 1..3")
    is_manual = body.confidence is not None or not llm.enabled()
    if is_manual and body.confidence is None:
        raise HTTPException(400, "confidence is required when recall grading is manual")
    conf = body.confidence if body.confidence is not None else None
    indep = "solo" if body.confidence is not None else None
    status = "viewed" if is_manual else "pending"
    aid = store.add_attempt({
        "slug": body.slug, "solved_at": int(time.time()), "time_taken_sec": None,
        "runtime_percentile": None, "memory_percentile": None, "lang": None,
        "wrong_before_ac": None, "submission_id": None, "code": None,
        "confidence": conf, "independence": indep,
        "mistake_note": None, "approach": body.recall_text,
        "complexity_time": body.complexity_time, "complexity_space": body.complexity_space,
        "source": "recall", "kind": "recall", "grading_status": status,
        "recall_grade": None, "grading_error": None,
    })
    if not is_manual:
        bg.add_task(_grade_recall_bg, uid, aid)
        return {"ok": True, "attempt_id": aid, "grading_status": "pending",
                "review": None, "graded": None}

    current = store.get_review(body.slug)
    if current:
        current = {**current, "slug": body.slug}
    new_state = scheduler.advance_review(current, body.confidence, "solo")
    new_state["slug"] = body.slug
    store.upsert_review(body.slug, new_state)
    return {"ok": True, "attempt_id": aid, "review": new_state, "graded": None}


@app.get("/api/review/recall/{attempt_id}")
def api_recall_result(attempt_id: str, uid: str = Depends(auth.require_user)):
    payload = _recall_attempt_payload(get_store(uid), attempt_id)
    if not payload:
        raise HTTPException(404, "no such recall")
    return payload


@app.post("/api/review/recall/{attempt_id}/ack")
def api_recall_ack(attempt_id: str, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    attempt = store.get_attempt(attempt_id)
    if not attempt or attempt.get("kind") != "recall":
        raise HTTPException(404, "no such recall")
    if attempt.get("grading_status") != "ready" or not attempt.get("recall_grade"):
        raise HTTPException(400, "recall grade is not ready")
    slug = attempt["slug"]
    current = store.get_review(slug)
    if current:
        current = {**current, "slug": slug}
    grade = (attempt.get("recall_grade") or {}).get("grade", 0)
    new_state = scheduler.advance_review(current, None, None, grade=grade or 0)
    new_state["slug"] = slug
    store.upsert_review(slug, new_state)
    store.update_attempt(attempt_id, {
        "grading_status": "viewed",
        "confidence": grade,
        "independence": "solo",
    })
    return {"ok": True, "review": new_state}


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
    return {"report": r, "llm": llm.enabled()}


# ---- playbooks ------------------------------------------------------------------
@app.get("/api/playbook/{category}")
def api_playbook(category: str, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    pb = store.get_playbook(category)
    count = coach.category_attempt_count(store, category)
    stale = bool(pb) and (count - pb.get("attempt_count_at_generation", 0) >= 3)
    return {"playbook": pb, "attempt_count": count, "stale": stale,
            "can_generate": count > 0 and llm.enabled()}


@app.post("/api/playbook/{category}/regenerate")
async def api_playbook_regen(category: str, uid: str = Depends(auth.require_user)):
    pb = await coach.synthesize_playbook(get_store(uid), category, force=True)
    return {"playbook": pb, "llm": llm.enabled()}


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
    return get_store(uid).get_settings()


@app.post("/api/config")
def api_set_config(body: SettingsUpdate, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    store.update_settings(updates)
    return store.get_settings()


@app.get("/api/me")
def api_me(uid: str = Depends(auth.require_user)):
    return {"uid": uid, "local_mode": config.local_mode(), "llm_enabled": llm.enabled()}


# ---- static frontend ------------------------------------------------------------
@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
