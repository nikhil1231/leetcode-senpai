"""Quickfire results that survive losing the internet.

Firestore stays the source of truth. A local JSON file mirrors each user's
results and holds the writes Firestore has not accepted yet ("pending"): an
answer to create, or a guess mark to apply. Offline, reads come from the mirror
and writes land in it; once Firestore answers again the pending writes replay.

Replay is safe to repeat. Answers are created once per question id and a retry
returns the first saved result, so an answer that reached the server before its
reply was lost settles to that copy; a guess mark only ever sets a flag. A
pending write leaves the file only after Firestore confirms it.
"""
import concurrent.futures
import copy
import json
import logging
import os
import threading
import time

from . import config, connectivity

log = logging.getLogger(__name__)

REMOTE_TIMEOUT = 4.0
LIST_LIMIT = 500
GUESS_ERROR = "Only a saved correct answer can be marked as guessed"

_lock = threading.RLock()
_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="practice-remote")
_flushing = set()


class Offline(Exception):
    pass


# ---- pure merge rules -----------------------------------------------------------
def empty():
    return {"results": {}, "pending": {}}


def settle(local, saved):
    """The result to keep once the server has an answer, and any write still owed.

    A guess marked locally survives a server copy that lacks it.
    """
    if local and local.get("guessed") and not saved.get("guessed"):
        return {**saved, "guessed": True}, "guess"
    return saved, None


def merge_remote(user, docs):
    """Fold a server listing into the mirror without dropping pending writes."""
    results, pending = dict(user["results"]), dict(user["pending"])
    for doc in docs:
        qid = doc.get("question_id")
        if not qid:
            continue
        if qid in pending:
            results[qid], op = settle(results.get(qid), doc)
            if op:
                pending[qid] = op
            else:
                pending.pop(qid)
        else:
            results[qid] = doc
    return {"results": results, "pending": pending}


def view(user):
    return sorted(user["results"].values(), key=lambda r: r.get("answered_at") or 0,
                  reverse=True)[:LIST_LIMIT]


def guess_locally(user, qid):
    result = user["results"].get(qid)
    if not result or not result.get("correct") or result.get("revealed"):
        raise ValueError(GUESS_ERROR)
    user["results"][qid] = {**result, "guessed": True}
    return dict(user["results"][qid])


# ---- file -----------------------------------------------------------------------
def _path():
    return config.PRACTICE_OFFLINE_PATH


def _read_all():
    try:
        with open(_path(), encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict) and isinstance(data.get("users"), dict):
            return data
        raise ValueError("unexpected shape")
    except FileNotFoundError:
        return {"version": 1, "users": {}}
    except ValueError:
        # Never overwrite something we cannot read: set it aside for recovery.
        aside = f"{_path()}.unreadable-{int(time.time())}"
        os.replace(_path(), aside)
        log.warning("Unreadable offline practice file moved to %s", aside)
        return {"version": 1, "users": {}}


def _write_all(data):
    path = _path()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, default=str)
    os.replace(tmp, path)


class _User:
    """Load-modify-write of one user's slice, under the module lock."""

    def __init__(self, uid):
        self.uid = uid

    def __enter__(self):
        _lock.acquire()
        try:
            self.data = _read_all()
            self.state = copy.deepcopy(self.data["users"].get(self.uid) or empty())
            self.before = copy.deepcopy(self.state)
            return self.state
        except BaseException:
            _lock.release()
            raise

    def __exit__(self, exc_type, *_):
        try:
            if exc_type is None and self.state != self.before:
                self.data["users"][self.uid] = self.state
                _write_all(self.data)
        finally:
            _lock.release()


# ---- store ----------------------------------------------------------------------
def _call(fn, *args):
    """Run a Firestore call with a hard deadline; any failure but ValueError is Offline."""
    if not connectivity.online():
        raise Offline()
    future = _pool.submit(fn, *args)
    try:
        return future.result(timeout=REMOTE_TIMEOUT)
    except ValueError:
        raise
    except Exception as exc:
        log.info("Firestore unreachable for Quickfire: %r", exc)
        connectivity.mark_offline()
        raise Offline() from exc


class OfflinePractice:
    """The four light-practice store methods, answered locally when offline."""

    def __init__(self, remote, uid):
        self.remote, self.uid = remote, uid

    def list_light_practice(self):
        try:
            docs = _call(self.remote.list_light_practice)
        except Offline:
            docs = None
        with _User(self.uid) as user:
            if docs is not None:
                user.update(merge_remote(user, docs))
            pending, results = bool(user["pending"]), view(user)
        if docs is not None and pending:
            self.flush_in_background()
        return results

    def get_light_practice(self, qid):
        with _User(self.uid) as user:
            if qid in user["pending"]:
                return dict(user["results"][qid])
        try:
            doc = _call(self.remote.get_light_practice, qid)
        except Offline:
            with _User(self.uid) as user:
                local = user["results"].get(qid)
            return dict(local) if local else None
        with _User(self.uid) as user:
            if qid in user["pending"]:
                return dict(user["results"][qid])
            if doc:
                user["results"][qid] = doc
            else:
                user["results"].pop(qid, None)
        return doc

    def save_light_practice(self, qid, result):
        with _User(self.uid) as user:
            if qid in user["results"]:
                return dict(user["results"][qid])
        try:
            saved = _call(self.remote.save_light_practice, qid, result)
        except Offline:
            with _User(self.uid) as user:
                if qid not in user["results"]:
                    user["results"][qid] = dict(result)
                    user["pending"][qid] = "create"
                return dict(user["results"][qid])
        with _User(self.uid) as user:
            if qid not in user["pending"]:
                user["results"][qid] = saved
        return saved

    def mark_light_practice_guess(self, qid):
        with _User(self.uid) as user:
            if user["pending"].get(qid) == "create":
                return guess_locally(user, qid)  # the create will carry it
        try:
            updated = _call(self.remote.mark_light_practice_guess, qid)
        except Offline:
            with _User(self.uid) as user:
                result = guess_locally(user, qid)
                user["pending"].setdefault(qid, "guess")
            return result
        with _User(self.uid) as user:
            if qid not in user["pending"]:
                user["results"][qid] = updated
        return updated

    def sync_status(self):
        with _User(self.uid) as user:
            unsynced = len(user["pending"])
        return {"offline": not connectivity.online(), "unsynced": unsynced}

    def flush(self):
        """Replay pending writes in order; stop at the first network failure."""
        with _User(self.uid) as user:
            queue = [(qid, op, copy.deepcopy(user["results"].get(qid)))
                     for qid, op in user["pending"].items()]
        for qid, op, local in queue:
            try:
                saved = (_call(self.remote.save_light_practice, qid, local) if op == "create"
                         else _call(self.remote.mark_light_practice_guess, qid))
            except ValueError:
                saved = None  # the server copy cannot take the guess; it stands as is
            except Offline:
                return
            with _User(self.uid) as user:
                if user["pending"].get(qid) != op:
                    continue
                del user["pending"][qid]
                if saved:
                    user["results"][qid], again = settle(user["results"].get(qid), saved)
                    if again:
                        user["pending"][qid] = again

    def flush_in_background(self):
        with _lock:
            if self.uid in _flushing:
                return
            _flushing.add(self.uid)

        def run():
            try:
                self.flush()
            finally:
                with _lock:
                    _flushing.discard(self.uid)
        threading.Thread(target=run, daemon=True).start()
