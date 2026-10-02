"""On-demand solve detection. Serverless-friendly: no background loop — the
frontend calls this (via /api/poll) whenever the tab regains focus, which is when
a solve done in LeetCode's tab comes back, and once on load to catch solves done
outside the app entirely.

Two passes over the same public feed of accepted submissions:
`check_active_sessions` matches an AC to a session the user started here, so the
solve carries a clock, a prediction and hint usage; `sweep_untracked_solves`
picks up everything else, which is how a contest or random-browse solve reaches
history at all.

The sweep also folds a *better* submission into the solve it improves on rather
than logging it twice — see `_same_sitting`. AC'ing something suboptimal and
then carrying on until it's clean is one piece of practice, not two.
"""
import time

from . import config, importer, leetcode, plans, recording

# How many recent ACs to look at per pass. LeetCode's feed is short anyway.
RECENT_LIMIT = 20

# Where the sweep starts on a fresh install (or after the watermark is cleared).
# Bounded by the annotate window: a solve too old to prompt for would be logged
# without a rating, which teaches the scheduler nothing.
SWEEP_LOOKBACK_SEC = config.PENDING_MAX_AGE_SEC

# Settings key holding the newest AC timestamp the sweep has already considered.
WATERMARK_KEY = "last_solve_sweep_ts"

# How far either side of a logged solve another AC for the same problem still
# counts as the same sitting. Long enough to cover an AC, a coffee, and a rewrite;
# short enough that tonight's re-solve of this morning's problem is its own attempt.
SAME_SITTING_SEC = 2 * 3600


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
        if s.get("kind") == "optimize":
            # Finished on LeetCode's page: still an improvement, not a new solve.
            prior = store.get_attempt(s.get("optimizes"))
            if prior and match["id"] != prior.get("submission_id"):
                aid = await _record_supersede(store, prior, match, auth)
                store.update_attempt(aid, _optimize_fields(prior, s, match["timestamp"]))
                store.update_session(s["id"], {"status": "completed", "attempt_id": aid})
                new_ids.append(aid)
            continue
        aid = await _record_solve(store, s, match, auth)
        if aid:
            new_ids.append(aid)
    return new_ids


# What a run's pre-solve plan (and how it was run) hands to the solve it produces.
_PLAN_CARRY = ("predicted_category", "predicted_approach", "complexity_target_time",
               "complexity_target_space", "planned_edge_cases", "plan_status",
               "plan_time_sec", "plan_check_revealed", "interview")


def _plan_fields(session):
    out = {k: session.get(k) for k in _PLAN_CARRY}
    out["planned_edge_cases"] = session.get("planned_edge_cases", [])
    return out


def _editor_extra(store, session):
    """An editor run that was finished on LeetCode's own site — a judge error, no
    cookie — still has its recording. Link it, so the process review sees it."""
    if session.get("surface") != "editor":
        return {}
    rec = store.get_recording(session["id"])
    if not rec:
        return {}
    return {"via": "editor", "finished_on": "leetcode", "recording_id": session["id"],
            "recording": recording.summary(recording.parse(rec.get("events")))}


async def _record_solve(store, session, match, auth, known=None):
    """Log a session's AC. `known` carries what the caller already holds —
    details, wrong count, failed tests, extra fields — instead of asking LeetCode."""
    extra = known["extra"] if known else _editor_extra(store, session)
    dup = store.find_attempt_by_submission(match["id"])
    if dup:
        # Logged already (an overlapping poll got there first). The row still
        # takes this run's plan if it has none — otherwise the plan is lost.
        if plans.plan_status(session) and not plans.plan_status(dup):
            store.update_attempt(dup["id"], _plan_fields(session))
        # The editor's own account of its AC outranks the feed's.
        if known or (extra and not dup.get("recording_id")):
            store.update_attempt(dup["id"], extra)
        store.update_session(session["id"], {"status": "completed", "attempt_id": dup["id"]})
        return None

    time_taken = run_clock(session, match["timestamp"])
    if known:
        details, wrong, failed_tests = known["details"], known["wrong"], known["failed_tests"]
    else:
        details, wrong, failed_tests = await _fetch_solve_facts(session, match, auth)

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
        # carry the pre-solve plan + hint usage from the session
        **_plan_fields(session),
        "failed_tests": failed_tests,
        "hint_level_used": session.get("hint_level", 0),
        "gave_up": bool(session.get("gave_up")),
        "complexity_time": None, "complexity_space": None,
        "solution_grading_status": None,
        **extra,
    })
    store.update_session(session["id"], {"status": "completed", "attempt_id": aid})
    return aid


async def _fetch_solve_facts(session, match, auth):
    """What LeetCode can say about an AC seen in the feed: (details, wrong, failed)."""
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
    failed_tests = await _failed_tests(
        session["slug"], session["started_at"], match["timestamp"], wrong, auth)
    return details, wrong, failed_tests


async def record_editor_solve(store, session, sub, code, events):
    """Log an AC judged from the in-app editor; returns the attempt id.

    Everything the feed-driven path asks LeetCode for afterwards is already in
    hand — the verdict, the code, and this session's own failed submits — so
    this makes no calls. The feed will show the same AC later; its submission id
    is what keeps that from becoming a second solve.
    """
    summary = recording.summary(events)
    known = {
        "details": {"runtime_percentile": sub.get("runtime_percentile"),
                    "memory_percentile": sub.get("memory_percentile"),
                    "lang": leetcode.EDITOR_LANG, "code": code},
        "wrong": summary["failed_submits"],
        "failed_tests": recording.failed_tests(events),
        "extra": {"via": "editor", "finished_on": None, "recording": summary,
                  "recording_id": session["id"]},
    }
    match = {"id": sub["submission_id"], "titleSlug": session["slug"],
             "timestamp": sub["finished_at"]}
    aid = await _record_solve(store, session, match, None, known)
    if aid is None:
        dup = store.find_attempt_by_submission(sub["submission_id"])
        aid = dup["id"] if dup else None
    return aid


async def _failed_tests(slug, start_ts, end_ts, wrong, auth):
    """The inputs that broke the wrong submissions before this AC, when there
    were any. It's what tells a plan grade which edge case actually bit.
    A nicety on top of detection: any failure here is just an empty list."""
    if not wrong:
        return []
    try:
        return await leetcode.failed_tests_between(slug, start_ts, end_ts, auth) or []
    except Exception:
        return []


# ---- same-sitting folding ---------------------------------------------------
# Derived rows (recalls, sprints, backfills) aren't sittings anything folds into.
_NOT_A_SITTING = ("recall", "sprint")


def _latest_solve(store, slug):
    """The most recent real solve on record for `slug`, or None."""
    best = None
    for a in store.attempts_for_slug(slug):
        if a.get("kind") in _NOT_A_SITTING or a.get("source") in _NOT_A_SITTING:
            continue
        if a.get("source") == "backfill":
            continue
        if best is None or (a.get("solved_at") or 0) >= (best.get("solved_at") or 0):
            best = a
    return best


def _same_sitting(store, slug, ts):
    """Decide whether this AC belongs to a solve already on record.

    Returns `(attempt, is_better)`. `attempt` is the row this AC is part of;
    `is_better` says whether it should take that row over (a later, cleaner
    submission) or is merely already represented by it (an earlier AC the sweep
    is only now catching up with — logging it would invent a second solve out of
    the same sitting, and with it a second review advance the card never earned).

    A later AC only continues a sitting while the solve is still sitting unrated
    in the annotate queue: rating it is the user saying they're done with it, so
    anything after that is a genuine re-solve and gets its own row.
    """
    prior = _latest_solve(store, slug)
    if not prior:
        return None, False
    solved_at = prior.get("solved_at") or 0
    if abs(ts - solved_at) > SAME_SITTING_SEC:
        return None, False
    if ts < solved_at:
        return prior, False
    if prior.get("confidence") is not None or prior.get("annotation_dismissed_at"):
        return None, False
    return prior, True


async def _record_supersede(store, prior, match, auth):
    """Take a better submission over the solve it improves on, in place.

    The row keeps its identity — its session clock, its prediction, its place in
    the annotate queue — and gains the submission that actually represents the
    work. What the first AC cost is kept alongside rather than overwritten: "AC
    in 9 minutes, clean in 24" is the interesting shape of that sitting, and
    invariant 5 says the history it already holds doesn't get thrown away.
    """
    slug = prior["slug"]
    prev_ts = prior.get("solved_at") or match["timestamp"]
    try:
        details = await leetcode.submission_details(match["id"], auth)
    except Exception:
        details = None
    extra = None
    if prior.get("wrong_before_ac") is not None:
        try:
            extra = await leetcode.wrong_attempts_between(
                slug, prev_ts, match["timestamp"], auth)
        except Exception:
            extra = None
    store.update_attempt(prior["id"], _supersede_fields(prior, match, details, extra))
    return prior["id"]


def _supersede_fields(prior, match, details, extra_wrong):
    """What a better submission changes on the solve it takes over."""
    prev_ts = prior.get("solved_at") or match["timestamp"]
    elapsed = max(0, match["timestamp"] - prev_ts)
    fields = {
        "submission_id": match["id"], "solved_at": match["timestamp"],
        # Percentiles and code describe a submission, so they move with it. When
        # the details lookup fails they go blank rather than keep describing the
        # code this one replaced — grading degrades to unavailable, not to wrong.
        "runtime_percentile": details.get("runtime_percentile") if details else None,
        "memory_percentile": details.get("memory_percentile") if details else None,
        "code": details.get("code") if details else None,
        "lang": (details.get("lang") if details else None) or prior.get("lang"),
        # Any stored grade was of code that no longer exists here.
        "solution_grade": None, "solution_grading_status": None,
        "solution_grading_error": None,
        "resubmissions": (prior.get("resubmissions") or 0) + 1,
        # Set once, on the first improvement, and carried from there.
        "first_ac_at": prior.get("first_ac_at") or prev_ts,
        "first_ac_time_taken_sec": (
            prior.get("first_ac_time_taken_sec") if prior.get("first_ac_at")
            else prior.get("time_taken_sec")),
    }
    # The session is over by now, so it can't be paused: the gap between the two
    # ACs is wall-clock time spent on the problem, and belongs on the clock.
    if prior.get("time_taken_sec") is not None:
        fields["time_taken_sec"] = prior["time_taken_sec"] + elapsed
    # Same for anything that failed on the way to the better version.
    if prior.get("wrong_before_ac") is not None and extra_wrong:
        fields["wrong_before_ac"] = prior["wrong_before_ac"] + extra_wrong
    return fields


async def record_editor_improvement(store, session, sub, code, events):
    """An Accepted from an optimize run — "Keep optimizing" on a solve still
    waiting for its rating — taken over the solve it improves on, exactly as the
    sweep takes over a better submission seen in the feed. Returns the attempt id."""
    prior = store.get_attempt(session.get("optimizes"))
    if not prior:
        store.update_session(session["id"], {"status": "completed"})
        return None
    match = {"id": sub["submission_id"], "timestamp": sub["finished_at"]}
    details = {"code": code, "lang": leetcode.EDITOR_LANG,
               "runtime_percentile": sub.get("runtime_percentile"),
               "memory_percentile": sub.get("memory_percentile")}
    fields = _supersede_fields(prior, match, details,
                               recording.summary(events)["failed_submits"])
    fields.update(_optimize_fields(prior, session, sub["finished_at"]))
    store.update_attempt(prior["id"], fields)
    store.update_session(session["id"], {"status": "completed", "attempt_id": prior["id"]})
    return prior["id"]


def _optimize_fields(prior, session, at):
    """The optimize run's recording, where the percentiles started from, and the
    solve's clock as the run carried it on to the better Accepted at `at`."""
    fields = {
        "optimize_recording_ids": (prior.get("optimize_recording_ids") or []) + [session["id"]],
        "before_optimize": prior.get("before_optimize") or {
            "runtime_percentile": prior.get("runtime_percentile"),
            "memory_percentile": prior.get("memory_percentile")},
    }
    # A run started before the clock was carried keeps the supersede's wall-clock gap.
    if session.get("elapsed_base_sec") is not None:
        fields["time_taken_sec"] = run_clock(session, at)
    return fields


def run_clock(session, at):
    """A run's clock at `at`: wall time since it started, less its pauses, on top
    of any time it carried in — an optimize run picks up where its solve stopped."""
    paused_sec = session.get("paused_sec", 0) or 0
    paused_at = session.get("paused_at")
    if paused_at:
        paused_sec += max(0, at - paused_at)
    return (session.get("elapsed_base_sec") or 0) + max(0, at - session["started_at"] - paused_sec)


async def sweep_untracked_solves(store, username, auth=None):
    """Log accepted submissions with no attempt behind them — problems solved
    outside a tracked session. Returns the list of attempt ids the pass touched:
    newly-created ones, plus any existing row a better submission was folded into.

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
        prior, better = _same_sitting(store, r["titleSlug"], r["timestamp"])
        if prior and not better:
            continue  # the solve on record already speaks for this submission
        if prior:
            new_ids.append(await _record_supersede(store, prior, r, auth))
        else:
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
