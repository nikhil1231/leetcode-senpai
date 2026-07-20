"""Per-user data access — **Firestore only** (V2).

There is no local JSON backend anymore; the app requires Firestore. Data is tiny
(one user, a few hundred problems/attempts), so we just load/scan in Python
rather than pushing work into query engines.

Collections:
  problems/{slug}                      global problem catalog
  users/{uid}/attempts/{id}            solve/recall/mock attempts
  users/{uid}/reviews/{slug}           spaced-repetition cards
  users/{uid}/sessions/{id}            active/finished solve sessions
  users/{uid}/enrichments/{attempt_id} LLM-derived structure (never source of truth)
  users/{uid}/reports/{iso_week}       weekly coach reports
  users/{uid}/playbooks/{category}     synthesized per-category cheat sheets
  users/{uid}/mocks/{id}               mock-interview sets + scores
  users/{uid} (doc)                    { settings: {...}, flags: {...} }
"""
import threading
import time as _time

from . import config

_firestore_app = None

# ---- single-flight snapshot cache -----------------------------------------------
# Every endpoint re-streams whole collections (problems/attempts/reviews/…), and
# the dashboard fires ~7 of them concurrently at page load. Each `.stream()` is a
# 200–450ms round-trip to live Firestore, so those bursts stacked up to multi-
# second loads. Data is tiny and single-user, so we cache the whole-collection
# reads for a few seconds.
#
# Crucially this is *single-flight*: because the startup requests all fire at
# once, a plain TTL cache would let every one of them miss and fetch in parallel
# (no benefit). Instead the first caller to need a key fetches while the rest
# block on a per-key lock and then read the warm entry. Writes invalidate the
# affected key so reads never serve stale data past a mutation.
_CACHE_TTL = 5.0
_cache = {}            # key -> (expires_at, value)
_cache_locks = {}      # key -> Lock
_cache_guard = threading.Lock()


def _cache_lock_for(key):
    with _cache_guard:
        lk = _cache_locks.get(key)
        if lk is None:
            lk = _cache_locks[key] = threading.Lock()
        return lk


def _cached(key, loader):
    now = _time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    with _cache_lock_for(key):
        # Re-check: another thread may have populated it while we waited.
        hit = _cache.get(key)
        now = _time.time()
        if hit and hit[0] > now:
            return hit[1]
        value = loader()
        _cache[key] = (now + _CACHE_TTL, value)
        return value


def _invalidate(key):
    _cache.pop(key, None)


def get_store(uid):
    """Return the per-user Firestore store. Firestore is the only backend."""
    return FirestoreStore(uid)


def _firestore_client():
    global _firestore_app
    from firebase_admin import firestore
    if _firestore_app is None:
        _firestore_app = config.init_firebase_admin()
    return firestore.client()


class FirestoreStore:
    def __init__(self, uid):
        self.uid = uid
        self.db = _firestore_client()

    def _user_ref(self):
        return self.db.collection("users").document(self.uid)

    # ---- problems (global) --------------------------------------------------
    def list_problems(self):
        # Global catalog; cache key is not per-user.
        cached = _cached(
            ("problems",),
            lambda: [d.to_dict() for d in self.db.collection("problems").stream()],
        )
        return list(cached)

    def get_problem(self, slug):
        snap = self.db.collection("problems").document(slug).get()
        return snap.to_dict() if snap.exists else None

    def upsert_problem(self, doc):
        self.db.collection("problems").document(doc["slug"]).set(doc, merge=True)
        _invalidate(("problems",))

    def delete_problem(self, slug):
        self.db.collection("problems").document(slug).delete()
        _invalidate(("problems",))

    # ---- attempts -----------------------------------------------------------
    def _attempts(self):
        return self._user_ref().collection("attempts")

    def list_attempts(self):
        def load():
            out = []
            for d in self._attempts().stream():
                item = d.to_dict()
                item["id"] = d.id
                out.append(item)
            return out
        return list(_cached(("attempts", self.uid), load))

    def get_attempt(self, aid):
        snap = self._attempts().document(aid).get()
        if not snap.exists:
            return None
        item = snap.to_dict()
        item["id"] = snap.id
        return item

    def add_attempt(self, doc):
        ref = self._attempts().document()
        ref.set(doc)
        _invalidate(("attempts", self.uid))
        return ref.id

    def update_attempt(self, aid, fields):
        self._attempts().document(aid).update(fields)
        _invalidate(("attempts", self.uid))

    def find_attempt_by_submission(self, submission_id):
        q = self._attempts().where("submission_id", "==", submission_id).limit(1)
        for d in q.stream():
            item = d.to_dict()
            item["id"] = d.id
            return item
        return None

    def attempts_for_slug(self, slug):
        out = []
        for d in self._attempts().where("slug", "==", slug).stream():
            item = d.to_dict()
            item["id"] = d.id
            out.append(item)
        out.sort(key=lambda a: a.get("solved_at") or 0)
        return out

    # ---- reviews ------------------------------------------------------------
    def _reviews(self):
        return self._user_ref().collection("reviews")

    def list_reviews(self):
        cached = _cached(
            ("reviews", self.uid),
            lambda: [d.to_dict() for d in self._reviews().stream()],
        )
        return list(cached)

    def get_review(self, slug):
        snap = self._reviews().document(slug).get()
        return snap.to_dict() if snap.exists else None

    def upsert_review(self, slug, doc):
        self._reviews().document(slug).set({**doc, "slug": slug})
        _invalidate(("reviews", self.uid))

    def delete_review(self, slug):
        self._reviews().document(slug).delete()
        _invalidate(("reviews", self.uid))

    # ---- sessions -----------------------------------------------------------
    def _sessions(self):
        return self._user_ref().collection("sessions")

    def get_session(self, sid):
        snap = self._sessions().document(sid).get()
        if not snap.exists:
            return None
        item = snap.to_dict()
        item["id"] = snap.id
        return item

    def list_active_sessions(self):
        out = []
        for d in self._sessions().where("status", "==", "active").stream():
            item = d.to_dict()
            item["id"] = d.id
            out.append(item)
        return out

    def latest_active_session(self):
        active = self.list_active_sessions()
        active.sort(key=lambda s: s.get("started_at", 0), reverse=True)
        return active[0] if active else None

    def add_session(self, doc):
        ref = self._sessions().document()
        ref.set(doc)
        return ref.id

    def update_session(self, sid, fields):
        self._sessions().document(sid).update(fields)

    def cancel_active_sessions(self, slug=None):
        cancelled = 0
        for d in self._sessions().where("status", "==", "active").stream():
            if slug and d.to_dict().get("slug") != slug:
                continue
            d.reference.update({"status": "cancelled"})
            cancelled += 1
        return cancelled

    # ---- enrichments (LLM-derived) ------------------------------------------
    def _enrichments(self):
        return self._user_ref().collection("enrichments")

    def get_enrichment(self, attempt_id):
        snap = self._enrichments().document(attempt_id).get()
        return snap.to_dict() if snap.exists else None

    def upsert_enrichment(self, attempt_id, doc):
        self._enrichments().document(attempt_id).set({**doc, "attempt_id": attempt_id})
        _invalidate(("enrichments", self.uid))

    def list_enrichments(self):
        cached = _cached(
            ("enrichments", self.uid),
            lambda: [d.to_dict() for d in self._enrichments().stream()],
        )
        return list(cached)

    # ---- reports (weekly coach) ---------------------------------------------
    def _reports(self):
        return self._user_ref().collection("reports")

    def get_report(self, iso_week):
        snap = self._reports().document(iso_week).get()
        return snap.to_dict() if snap.exists else None

    def upsert_report(self, iso_week, doc):
        self._reports().document(iso_week).set({**doc, "iso_week": iso_week})

    def latest_report(self):
        reports = [d.to_dict() for d in self._reports().stream()]
        reports.sort(key=lambda r: r.get("iso_week", ""), reverse=True)
        return reports[0] if reports else None

    # ---- playbooks (per-category cheat sheets) ------------------------------
    def _playbooks(self):
        return self._user_ref().collection("playbooks")

    def get_playbook(self, category):
        snap = self._playbooks().document(_slugify(category)).get()
        return snap.to_dict() if snap.exists else None

    def upsert_playbook(self, category, doc):
        self._playbooks().document(_slugify(category)).set({**doc, "category": category})

    # ---- mocks --------------------------------------------------------------
    def _mocks(self):
        return self._user_ref().collection("mocks")

    def get_mock(self, mid):
        snap = self._mocks().document(mid).get()
        if not snap.exists:
            return None
        item = snap.to_dict()
        item["id"] = snap.id
        return item

    def add_mock(self, doc):
        ref = self._mocks().document()
        ref.set(doc)
        return ref.id

    def update_mock(self, mid, fields):
        self._mocks().document(mid).update(fields)

    def list_mocks(self):
        out = []
        for d in self._mocks().stream():
            item = d.to_dict()
            item["id"] = d.id
            out.append(item)
        out.sort(key=lambda m: m.get("started_at") or 0, reverse=True)
        return out

    # ---- settings + flags ---------------------------------------------------
    def _user_doc(self):
        # settings and flags live on the same user doc and are both read on most
        # page loads; cache the single fetch so we don't round-trip twice.
        return _cached(
            ("userdoc", self.uid),
            lambda: (self._user_ref().get().to_dict() or {}),
        )

    def get_settings(self):
        stored = self._user_doc().get("settings", {})
        return {**config.DEFAULT_SETTINGS, **stored}

    def update_settings(self, fields):
        current = self._user_doc().get("settings", {})
        self._user_ref().set({"settings": {**current, **fields}}, merge=True)
        _invalidate(("userdoc", self.uid))

    def get_flags(self):
        return dict(self._user_doc().get("flags", {}))

    def set_flag(self, key, value):
        current = self._user_doc().get("flags", {})
        self._user_ref().set({"flags": {**current, key: value}}, merge=True)
        _invalidate(("userdoc", self.uid))


def _slugify(text):
    return "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-")
