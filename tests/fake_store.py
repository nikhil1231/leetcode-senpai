"""In-memory store implementing the FirestoreStore interface, for tests.

The app itself is Firestore-only; this fake lets the pure logic (scheduler,
insights, importer, endpoints) be exercised without credentials.
"""
import uuid
import zlib
from copy import deepcopy

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
        self.daily_reviews = {}
        self.playbooks = {}
        self.mocks = {}
        self.sprint_rounds = {}
        self.settings = {}
        self.flags = {}
        self.leetcode_auth = None
        self.light_practice = {}
        self.practice_exposures = {}
        self.recordings = {}
        self.learning_state = {}
        self.approach_reviews = {}
        self.design_records = {}
        self.track_records = {}
        self.senpai = {}
        self.knowledge = {}

    def _knowledge_coll(self, coll):
        from server.store import FirestoreStore
        if coll not in FirestoreStore.KNOWLEDGE:
            raise ValueError(f"unknown knowledge collection {coll}")
        return self.knowledge.setdefault(coll, {})

    def list_knowledge(self, coll):
        return deepcopy(list(self._knowledge_coll(coll).values()))

    def create_knowledge(self, coll, key, doc):
        c = self._knowledge_coll(coll)
        if key in c:
            return None
        c[key] = deepcopy({**doc, '_key': key})
        return deepcopy(c[key])

    def put_knowledge(self, coll, key, doc):
        self._knowledge_coll(coll)[key] = deepcopy({**doc, '_key': key})
        return deepcopy(self._knowledge_coll(coll)[key])

    def _senpai_coll(self, coll):
        from server.store import FirestoreStore
        if coll not in FirestoreStore.SENPAI:
            raise ValueError(f"unknown Senpai collection {coll}")
        return self.senpai.setdefault(coll, {})

    def get_senpai(self, coll, key):
        return deepcopy(self._senpai_coll(coll).get(key))

    def list_senpai(self, coll):
        return deepcopy(list(self._senpai_coll(coll).values()))

    def put_senpai(self, coll, key, doc):
        self._senpai_coll(coll)[key] = deepcopy(doc)
        return deepcopy(doc)

    def create_senpai(self, coll, key, doc):
        c = self._senpai_coll(coll)
        if key in c:
            return None
        c[key] = deepcopy(doc)
        return deepcopy(doc)

    def cas_senpai(self, coll, key, doc, expected_revision):
        old = self._senpai_coll(coll).get(key)
        if (old.get('revision') if old else None) != expected_revision:
            raise ValueError("Senpai's plan changed in another request. Reload and try again.")
        self._senpai_coll(coll)[key] = deepcopy(doc)
        return deepcopy(doc)

    def get_track_record(self, track, key):
        return deepcopy(self.track_records.get(track, {}).get(key))

    def list_track_records(self, track):
        return deepcopy(list(self.track_records.get(track, {}).values()))

    def put_track_record(self, track, key, doc, expected_revision=None):
        bucket = self.track_records.setdefault(track, {})
        old = bucket.get(key)
        actual = old.get('revision', 0) if old else None
        if actual != expected_revision:
            raise ValueError('This record changed in another request. Reload before saving.')
        saved = {**deepcopy(doc), 'id': key, 'revision': (actual or 0) + 1}
        bucket[key] = saved
        return deepcopy(saved)

    def delete_track_record(self, track, key):
        self.track_records.get(track, {}).pop(key, None)

    def get_design_record(self, key):
        return deepcopy(self.design_records.get(key))

    def list_design_records(self):
        return deepcopy(list(self.design_records.values()))

    def put_design_record(self, key, doc, expected_revision=None):
        old = self.design_records.get(key)
        actual = old.get('revision', 0) if old else None
        if actual != expected_revision:
            raise ValueError('This design changed in another request. Reload before saving.')
        saved = {**deepcopy(doc), 'id': key, 'revision': (actual or 0) + 1}
        self.design_records[key] = saved
        return deepcopy(saved)

    def record_practice_exposure(self, question_id, result):
        old = self.practice_exposures.get(question_id) or {}
        self.practice_exposures[question_id] = {**result, 'exposed_at': old.get('exposed_at') or result['exposed_at']}
        return self.practice_exposures[question_id]

    def save_light_practice(self, question_id, result):
        exposed = self.practice_exposures.get(question_id) or {}
        if exposed:
            result = {**result, 'exposed_at': exposed.get('exposed_at'),
                      'assisted': bool(exposed.get('assisted') or result.get('assisted'))}
        return dict(self.light_practice.setdefault(question_id, dict(result)))

    def get_light_practice(self, question_id):
        result = self.light_practice.get(question_id)
        return dict(result) if result else None

    def mark_light_practice_guess(self, question_id):
        result = self.light_practice.get(question_id)
        if not result or not result.get("correct") or result.get("revealed"):
            raise ValueError("Only a saved correct answer can be marked as guessed")
        result["guessed"] = True
        return dict(result)

    def list_light_practice(self):
        return sorted((dict(r) for r in self.light_practice.values()),
                      key=lambda r: r["answered_at"], reverse=True)[:500]

    def iter_light_practice(self, page_size=500):
        yield from sorted(self.light_practice.values(), key=lambda r: r['question_id'])

    def list_practice_state(self):
        from server.practice_state import rebuild
        records = {**self.practice_exposures, **self.light_practice}
        templates = {r['template'] for r in records.values()}
        return {t: rebuild(r for r in records.values() if r['template'] == t) for t in templates}

    def list_learning_state(self):
        return [{**doc, 'id': key} for key, doc in self.learning_state.items()]

    def get_learning_state(self, key):
        return self.learning_state.get(key)

    def save_learning_state(self, key, doc):
        self.learning_state[key] = doc

    def list_approach_reviews(self):
        return list(self.approach_reviews.values())

    def get_approach_review(self, slug):
        return self.approach_reviews.get(slug)

    def upsert_approach_review(self, slug, doc):
        self.approach_reviews[slug] = {**doc, 'slug': slug}

    # problems
    def list_problems(self):
        return [{k: v for k, v in p.items() if k != "content_html"}
                for p in self.problems.values()]

    def get_problem(self, slug):
        return self.problems.get(slug)

    def upsert_problem(self, doc):
        existing = self.problems.get(doc["slug"], {})
        self.problems[doc["slug"]] = {**existing, **doc}

    def delete_problem(self, slug):
        self.problems.pop(slug, None)

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

    def delete_review(self, slug):
        self.reviews.pop(slug, None)

    # sessions
    def get_recording(self, session_id):
        doc = self.recordings.get(session_id)
        return dict(doc) if doc else None

    def save_recording(self, session_id, doc):
        self.recordings[session_id] = dict(doc)

    def get_session(self, sid):
        s = self.sessions.get(sid)
        return dict(s) if s else None

    def list_active_sessions(self):
        return [dict(s) for s in self.sessions.values() if s.get("status") == "active"]

    def list_sessions(self):
        return deepcopy(list(self.sessions.values()))

    def latest_active_session(self):
        active = self.list_active_sessions()
        active.sort(key=lambda s: s.get("started_at", 0), reverse=True)
        return active[0] if active else None

    def add_session(self, doc):
        sid = uuid.uuid4().hex[:12]
        self.sessions[sid] = {**doc, "id": sid}
        return sid

    def start_session(self, doc, recording=None):
        self.cancel_active_sessions()
        sid = self.add_session(doc)
        if recording is not None:
            self.save_recording(sid, recording)
        return sid

    def update_session(self, sid, fields):
        if sid in self.sessions:
            self.sessions[sid].update(fields)

    def cancel_active_sessions(self, slug=None):
        cancelled = 0
        for s in self.sessions.values():
            if s.get("status") == "active":
                if slug and s.get("slug") != slug:
                    continue
                s["status"] = "cancelled"
                cancelled += 1
        return cancelled

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

    def get_daily_review(self, date, timezone):
        return deepcopy(self.daily_reviews.get((date, timezone)))

    def list_daily_reviews(self, timezone):
        return deepcopy([r for (date, zone), r in self.daily_reviews.items() if zone == timezone])

    def upsert_daily_review(self, date, timezone, doc):
        old = self.daily_reviews.get((date, timezone), {})
        saved = {**deepcopy(doc), "date": date, "timezone": timezone,
                 "feedback": deepcopy(old.get("feedback") or {"status": "pending", "note": ""})}
        self.daily_reviews[date, timezone] = saved
        return deepcopy(saved)

    def update_daily_review_feedback(self, date, timezone, status, note):
        old = self.daily_reviews.get((date, timezone))
        if old is None:
            return None
        old["feedback"] = {"status": status, "note": note}
        return deepcopy(old)


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

    def get_leetcode_auth(self):
        saved = self.leetcode_auth or {}
        if not saved.get("session"):
            return None
        return {"session": saved["session"], "csrf": saved.get("csrf")}

    def save_leetcode_auth(self, session, csrf=None):
        self.leetcode_auth = {"session": session, "csrf": csrf}

    def clear_leetcode_auth(self):
        self.leetcode_auth = None

    # revisions
    def revisions(self):
        """Content-derived, unlike the real store's write counters.

        The fake has no invalidation hooks to piggyback on, and the contract the
        client actually depends on is "changes if and only if the data changed",
        which a fingerprint satisfies directly.
        """
        def fp(d):
            return zlib.crc32(repr(sorted(d.items())).encode()) & 0xFFFFFFFF
        return {
            "problems": fp(self.problems),
            "attempts": fp(self.attempts),
            "reviews": fp(self.reviews),
            "enrichments": fp(self.enrichments),
            "sessions": fp(self.sessions),
            "mocks": fp(self.mocks),
            "sprint_rounds": fp(self.sprint_rounds),
            "reports": fp(self.reports),
            "daily_reviews": fp({str(k): v for k, v in self.daily_reviews.items()}),
            "userdoc": fp({"s": self.settings, "f": self.flags}),
            "senpai": zlib.crc32(repr(self.senpai).encode()) & 0xFFFFFFFF,
        }
