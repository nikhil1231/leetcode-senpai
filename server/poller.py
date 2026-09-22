"""On-demand solve detection. Serverless-friendly: no background loop — the
frontend calls this (via /api/poll) every few seconds while a session is active,
and once on load to catch solves done outside the app entirely.

Two passes over the same public feed of accepted submissions:
`check_active_sessions` matches an AC to a session the user started here, so the
solve carries a clock, a prediction and hint usage; `sweep_untracked_solves`
picks up everything else, which is how a contest or random-browse solve reaches
history at all.
"""
import time

from . import config, importer, leetcode

# How many recent ACs to look at per pass. LeetCode's feed is short anyway.
RECENT_LIMIT = 20

# Where the sweep starts on a fresh install (or after the watermark is cleared).
# Bounded by the annotate window: a solve too old to prompt for would be logged
# without a rating, which teaches the scheduler nothing.
SWEEP_LOOKBACK_SEC = config.PENDING_MAX_AGE_SEC

# Settings key holding the newest AC timestamp the sweep has already considered.
WATERMARK_KEY = "last_solve_sweep_ts"


async def check_active_sessions(store, username, auth=None):
    """Poll LeetCode for any active session's accepted submission. Returns the
    list of newly-created attempt ids (each needing annotation)."""
    if not username:
        return []
    sessions = store.list_active_sessions()
    if not sessions:
        return []
    try:
        recents = await leetcode.recent_ac(username, RECENT_LIMIT, auth)
    except Exception:
        return []

    new_ids = []
    for s in sessions:
        match = next(
            (r for r in recents
             if r["titleSlug"] == s["slug"] and r["timestamp"] >= s["started_at"]),
            None,
        )
        if not match:
            continue
        aid = await _record_solve(store, s, match, auth)
        if aid:
            new_ids.append(aid)
    return new_ids


async def _record_solve(store, session, match, auth):
    dup = store.find_attempt_by_submission(match["id"])
    if dup:
        store.update_session(session["id"], {"status": "completed", "attempt_id": dup["id"]})
        return None

    paused_sec = session.get("paused_sec", 0) or 0
    paused_at = session.get("paused_at")
    if paused_at:
        paused_sec += max(0, match["timestamp"] - paused_at)
    time_taken = max(0, match["timestamp"] - session["started_at"] - paused_sec)
    details = None
    wrong = None
    try:
        details = await leetcode.submission_details(match["id"], auth)
    except Exception:
        details = None
    try:
        wrong = await leetcode.wrong_attempts_between(
            session["slug"], session["started_at"], match["timestamp"], auth
        )
    except Exception:
        wrong = None

    code = details.get("code") if details else None
    aid = store.add_attempt({
        "slug": session["slug"], "solved_at": match["timestamp"],
        "time_taken_sec": time_taken,
        "runtime_percentile": details.get("runtime_percentile") if details else None,
        "memory_percentile": details.get("memory_percentile") if details else None,
        "lang": details.get("lang") if details else None,
        "wrong_before_ac": wrong, "submission_id": match["id"],
        "code": code,
        "confidence": None, "independence": None, "mistake_note": None,
        "approach": None, "source": "auto", "kind": session.get("kind", "adhoc"),
        # carry the pre-solve prediction + hint usage from the session
        "predicted_category": session.get("predicted_category"),
        "predicted_approach": session.get("predicted_approach"),
        "complexity_target_time": session.get("complexity_target_time"),
        "complexity_target_space": session.get("complexity_target_space"),
        "planned_edge_cases": session.get("planned_edge_cases", []),
        "hint_level_used": session.get("hint_level", 0),
        "complexity_time": None, "complexity_space": None,
        "solution_grading_status": None,
    })
    store.update_session(session["id"], {"status": "completed", "attempt_id": aid})
    return aid


async def sweep_untracked_solves(store, username, auth=None):
    """Log accepted submissions with no attempt behind them — problems solved
    outside a tracked session. Returns the list of newly-created attempt ids.

    A watermark over the newest AC seen keeps this from re-walking the same feed
    (and from dumping months of history into the annotate queue on first run);
    submission ids are still checked, so the watermark is an optimisation, never
    the thing standing between you and a duplicate attempt.
    """
    if not username:
        return []
    settings = store.get_settings()
    floor = settings.get(WATERMARK_KEY) or int(time.time()) - SWEEP_LOOKBACK_SEC
    try:
        recents = await leetcode.recent_ac(username, RECENT_LIMIT, auth)
    except Exception:
        return []
    if not recents:
        return []

    # A live session's slug belongs to check_active_sessions, which records the
    # same submission with its timing. Leave it for that pass.
    live = {s["slug"] for s in store.list_active_sessions()}
    seen = {a.get("submission_id") for a in store.list_attempts()
            if a.get("submission_id") is not None}

    new_ids = []
    watermark = floor
    for r in sorted(recents, key=lambda r: r["timestamp"]):
        watermark = max(watermark, r["timestamp"])
        if r["timestamp"] < floor or r["id"] in seen or r["titleSlug"] in live:
            continue
        new_ids.append(await _record_untracked(store, r, auth))
    # Only on a move. During a live session this runs every few seconds, and a
    # settings write per tick would be a Firestore round-trip and a cache
    # invalidation each time — enough to make every open tab redraw on a timer.
    if watermark > floor:
        store.update_settings({WATERMARK_KEY: watermark})
    return new_ids


async def _record_untracked(store, match, auth):
    """Log a solve we have no session for.

    An unknown problem is imported on demand but deliberately left out of the
    library: a contest or random-browse solve belongs in history without
    volunteering itself for the daily queue, the drill lane or sprint rounds.
    Adding it to a pack later is a one-click decision that keeps this history.
    """
    slug = match["titleSlug"]
    if not store.get_problem(slug):
        try:
            await importer.import_problem(store, slug, auth, pack_name=None)
        except Exception:
            pass  # metadata is a nicety; the solve itself is the record
    try:
        details = await leetcode.submission_details(match["id"], auth)
    except Exception:
        details = None
    return store.add_attempt({
        "slug": slug, "solved_at": match["timestamp"],
        # No session means no clock. Everything else the submission knows about
        # itself still lands, including the code, so grading stays available.
        "time_taken_sec": None,
        "runtime_percentile": details.get("runtime_percentile") if details else None,
        "memory_percentile": details.get("memory_percentile") if details else None,
        "lang": details.get("lang") if details else None,
        "wrong_before_ac": None, "submission_id": match["id"],
        "code": details.get("code") if details else None,
        "confidence": None, "independence": None, "mistake_note": None,
        "approach": None, "source": "detected", "kind": "adhoc",
        "complexity_time": None, "complexity_space": None,
        "solution_grading_status": None,
    })
