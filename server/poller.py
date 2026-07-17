"""On-demand solve detection. Serverless-friendly: no background loop — the
frontend calls this (via /api/poll) every few seconds while a session is active.
"""
from . import leetcode


async def check_active_sessions(store, username, auth=None):
    """Poll LeetCode for any active session's accepted submission. Returns the
    list of newly-created attempt ids (each needing annotation)."""
    if not username:
        return []
    sessions = store.list_active_sessions()
    if not sessions:
        return []
    try:
        recents = await leetcode.recent_ac(username, 20, auth)
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

    aid = store.add_attempt({
        "slug": session["slug"], "solved_at": match["timestamp"],
        "time_taken_sec": time_taken,
        "runtime_percentile": details.get("runtime_percentile") if details else None,
        "memory_percentile": details.get("memory_percentile") if details else None,
        "lang": details.get("lang") if details else None,
        "wrong_before_ac": wrong, "submission_id": match["id"],
        "code": details.get("code") if details else None,
        "confidence": None, "independence": None, "mistake_note": None,
        "approach": None, "source": "auto", "kind": session.get("kind", "adhoc"),
        # carry the pre-solve prediction + hint usage from the session
        "predicted_category": session.get("predicted_category"),
        "predicted_approach": session.get("predicted_approach"),
        "hint_level_used": session.get("hint_level", 0),
        "complexity_time": None, "complexity_space": None,
    })
    store.update_session(session["id"], {"status": "completed", "attempt_id": aid})
    return aid
