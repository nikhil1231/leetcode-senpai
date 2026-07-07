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
from . import config

_firestore_app = None


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
        return [d.to_dict() for d in self.db.collection("problems").stream()]

    def get_problem(self, slug):
        snap = self.db.collection("problems").document(slug).get()
        return snap.to_dict() if snap.exists else None

    def upsert_problem(self, doc):
        self.db.collection("problems").document(doc["slug"]).set(doc, merge=True)

    # ---- attempts -----------------------------------------------------------
    def _attempts(self):
        return self._user_ref().collection("attempts")

    def list_attempts(self):
        out = []
        for d in self._attempts().stream():
            item = d.to_dict()
            item["id"] = d.id
            out.append(item)
        return out

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
        return ref.id

    def update_attempt(self, aid, fields):
        self._attempts().document(aid).update(fields)

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
        return [d.to_dict() for d in self._reviews().stream()]

    def get_review(self, slug):
        snap = self._reviews().document(slug).get()
        return snap.to_dict() if snap.exists else None

    def upsert_review(self, slug, doc):
        self._reviews().document(slug).set({**doc, "slug": slug})

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

    def cancel_active_sessions(self):
        for d in self._sessions().where("status", "==", "active").stream():
            d.reference.update({"status": "cancelled"})

    # ---- enrichments (LLM-derived) ------------------------------------------
    def _enrichments(self):
        return self._user_ref().collection("enrichments")

    def get_enrichment(self, attempt_id):
        snap = self._enrichments().document(attempt_id).get()
        return snap.to_dict() if snap.exists else None

    def upsert_enrichment(self, attempt_id, doc):
        self._enrichments().document(attempt_id).set({**doc, "attempt_id": attempt_id})

    def list_enrichments(self):
        return [d.to_dict() for d in self._enrichments().stream()]

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
    def get_settings(self):
        snap = self._user_ref().get()
        stored = (snap.to_dict() or {}).get("settings", {}) if snap.exists else {}
        return {**config.DEFAULT_SETTINGS, **stored}

    def update_settings(self, fields):
        snap = self._user_ref().get()
        current = (snap.to_dict() or {}).get("settings", {}) if snap.exists else {}
        self._user_ref().set({"settings": {**current, **fields}}, merge=True)

    def get_flags(self):
        snap = self._user_ref().get()
        return (snap.to_dict() or {}).get("flags", {}) if snap.exists else {}

    def set_flag(self, key, value):
        snap = self._user_ref().get()
        current = (snap.to_dict() or {}).get("flags", {}) if snap.exists else {}
        self._user_ref().set({"flags": {**current, key: value}}, merge=True)


def _slugify(text):
    return "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-")
