"""In-memory store implementing the FirestoreStore interface, for tests.

The app itself is Firestore-only; this fake lets the pure logic (scheduler,
insights, importer, endpoints) be exercised without credentials.
"""
import uuid

from server import config
from server.store import _slugify


class FakeStore:
    def __init__(self, uid="test"):
        self.uid = uid
        self.problems = {}
        self.attempts = {}
        self.reviews = {}
        self.sessions = {}
        self.enrichments = {}
        self.reports = {}
        self.playbooks = {}
        self.mocks = {}
        self.sprint_rounds = {}
        self.settings = {}
        self.flags = {}

    # problems
    def list_problems(self):
        return list(self.problems.values())

    def get_problem(self, slug):
        return self.problems.get(slug)

    def upsert_problem(self, doc):
        existing = self.problems.get(doc["slug"], {})
        self.problems[doc["slug"]] = {**existing, **doc}

    # attempts
    def list_attempts(self):
        return [dict(a) for a in self.attempts.values()]

    def get_attempt(self, aid):
        a = self.attempts.get(aid)
        return dict(a) if a else None

    def add_attempt(self, doc):
        aid = uuid.uuid4().hex[:12]
        self.attempts[aid] = {**doc, "id": aid}
        return aid

    def update_attempt(self, aid, fields):
        if aid in self.attempts:
            self.attempts[aid].update(fields)

    def find_attempt_by_submission(self, submission_id):
        for a in self.attempts.values():
            if a.get("submission_id") == submission_id:
                return dict(a)
        return None

    def attempts_for_slug(self, slug):
        out = [dict(a) for a in self.attempts.values() if a.get("slug") == slug]
        out.sort(key=lambda a: a.get("solved_at") or 0)
        return out

    # reviews
    def list_reviews(self):
        return [dict(r) for r in self.reviews.values()]

    def get_review(self, slug):
        r = self.reviews.get(slug)
        return dict(r) if r else None

    def upsert_review(self, slug, doc):
        self.reviews[slug] = {**doc, "slug": slug}

    # sessions
    def get_session(self, sid):
        s = self.sessions.get(sid)
        return dict(s) if s else None

    def list_active_sessions(self):
        return [dict(s) for s in self.sessions.values() if s.get("status") == "active"]

    def latest_active_session(self):
        active = self.list_active_sessions()
        active.sort(key=lambda s: s.get("started_at", 0), reverse=True)
        return active[0] if active else None

    def add_session(self, doc):
        sid = uuid.uuid4().hex[:12]
        self.sessions[sid] = {**doc, "id": sid}
        return sid

    def update_session(self, sid, fields):
        if sid in self.sessions:
            self.sessions[sid].update(fields)

    def cancel_active_sessions(self):
        for s in self.sessions.values():
            if s.get("status") == "active":
                s["status"] = "cancelled"

    # enrichments
    def get_enrichment(self, attempt_id):
        e = self.enrichments.get(attempt_id)
        return dict(e) if e else None

    def upsert_enrichment(self, attempt_id, doc):
        self.enrichments[attempt_id] = {**doc, "attempt_id": attempt_id}

    def list_enrichments(self):
        return [dict(e) for e in self.enrichments.values()]

    # reports
    def get_report(self, iso_week):
        return self.reports.get(iso_week)

    def upsert_report(self, iso_week, doc):
        self.reports[iso_week] = {**doc, "iso_week": iso_week}

    def latest_report(self):
        if not self.reports:
            return None
        return self.reports[max(self.reports)]

    # playbooks
    def get_playbook(self, category):
        return self.playbooks.get(_slugify(category))

    def upsert_playbook(self, category, doc):
        self.playbooks[_slugify(category)] = {**doc, "category": category}

    # mocks
    def get_mock(self, mid):
        m = self.mocks.get(mid)
        return dict(m) if m else None

    def add_mock(self, doc):
        mid = uuid.uuid4().hex[:12]
        self.mocks[mid] = {**doc, "id": mid}
        return mid

    def update_mock(self, mid, fields):
        if mid in self.mocks:
            self.mocks[mid].update(fields)

    def list_mocks(self):
        out = [dict(m) for m in self.mocks.values()]
        out.sort(key=lambda m: m.get("started_at") or 0, reverse=True)
        return out

    # sprint rounds
    def get_sprint_round(self, rid):
        r = self.sprint_rounds.get(rid)
        return dict(r) if r else None

    def add_sprint_round(self, doc):
        rid = uuid.uuid4().hex[:12]
        self.sprint_rounds[rid] = {**doc, "id": rid}
        return rid

    def update_sprint_round(self, rid, fields):
        if rid in self.sprint_rounds:
            self.sprint_rounds[rid].update(fields)

    def list_sprint_rounds(self):
        out = [dict(r) for r in self.sprint_rounds.values()]
        out.sort(key=lambda r: r.get("started_at") or 0, reverse=True)
        return out

    def latest_active_sprint_round(self):
        active = [r for r in self.list_sprint_rounds() if r.get("status") == "active"]
        return active[0] if active else None

    # settings + flags
    def get_settings(self):
        return {**config.DEFAULT_SETTINGS, **self.settings}

    def update_settings(self, fields):
        self.settings.update(fields)

    def get_flags(self):
        return dict(self.flags)

    def set_flag(self, key, value):
        self.flags[key] = value
