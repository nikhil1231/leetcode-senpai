"""Per-user data access — **Firestore only** (V2).

There is no local JSON backend anymore; the app requires Firestore. Data is tiny
(one user, a few hundred problems/attempts), so we just load/scan in Python
rather than pushing work into query engines.

Collections:
  problems/{slug}                      global problem catalog
  users/{uid}/attempts/{id}            solve/recall/mock attempts
  users/{uid}/reviews/{slug}           spaced-repetition cards
  users/{uid}/sessions/{id}            active/finished solve sessions (with the run's coach chat)
  users/{uid}/recordings/{session_id}  in-app editor change log (never listed wholesale)
  users/{uid}/enrichments/{attempt_id} LLM-derived structure (never source of truth)
  users/{uid}/reports/{iso_week}       weekly coach reports
  users/{uid}/playbooks/{category}     synthesized per-category cheat sheets
  users/{uid}/mocks/{id}               mock-interview sets + scores
  users/{uid}/sprint_rounds/{id}       sprint-rep round state
  users/{uid}/tracks/{track}/records/{key}  Fundamentals / AI / Experience / Practical records
  users/{uid}/knowledge_events/{key}   knowledge-base answers and exposures from any source (append-only)
  users/{uid}/knowledge_misconceptions/{key}  misconceptions per knowledge point, open or resolved
  users/{uid}/study_sessions/{code}  study prompts copied for an outside chatbot, and their pasted debriefs
  users/{uid}/tutor_sessions/{id}      tutor conversations (raw learner text first, then the reply)
  users/{uid}/tutor_memory/{key}       small per-lesson and story notes the tutor opens with
  users/{uid}/drip/{key}               the Telegram drip: its state, and one document per card sent
  users/{uid} (doc)                    { settings: {...}, flags: {...} }
"""
import threading
import time as _time

from . import config

_firestore_app = None
_firestore_db = None
_client_guard = threading.Lock()

# ---- single-flight snapshot cache -----------------------------------------------
# Every endpoint re-streams whole collections (problems/attempts/reviews/…), and
# the dashboard fires ~7 of them concurrently at page load. Each `.stream()` is a
# 200–450ms round-trip to live Firestore, so those bursts stacked up to multi-
# second loads. Data is tiny and single-user, so we cache the whole-collection
# reads in memory.
#
# Crucially this is *single-flight*: because the startup requests all fire at
# once, a plain TTL cache would let every one of them miss and fetch in parallel
# (no benefit). Instead the first caller to need a key fetches while the rest
# block on a per-key lock and then read the warm entry. Writes invalidate the
# affected key so reads never serve stale data past a mutation.
#
# The TTL is NOT what makes this cache correct — explicit invalidation is. Every
# write this process makes drops the affected key, so the timer is only a
# backstop against a write from *another* process (the other machine, a second
# Cloud Run instance), which for a single-user app is close to hypothetical.
#
# So it is deliberately long. A short TTL is worse than useless here: at two
# minutes the cache expired faster than you can read a page, and coming back to
# the app after a short break paid the full multi-second cold load again — the
# exact problem this exists to remove. The cost of an hour is that a write made
# from the *other* machine, against a server left running here the whole time,
# could go unnoticed for up to an hour. Restarting the server clears it; a
# Firestore snapshot listener is the real fix if two machines ever run at once.
_CACHE_TTL = 3600.0
_cache = {}            # key -> (expires_at, value)
_cache_locks = {}      # key -> Lock
_cache_guard = threading.Lock()

# Bumped on every invalidation. The client mirrors these counters (GET /api/rev,
# answered from memory in ~2ms) so it can tell "the view I already rendered is
# still valid" from "something actually changed" without refetching the data to
# find out. That is what makes caching safe here: the freshness *check* is three
# orders of magnitude cheaper than the *fetch*, so we never have to gamble on a
# stale render.
_revisions = {}        # cache key -> bump count


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
    with _cache_guard:
        _revisions[key] = _revisions.get(key, 0) + 1


def get_store(uid):
    """Return the per-user Firestore store. Firestore is the only backend."""
    return FirestoreStore(uid)


def warm(uid):
    """Pre-load the collections every dashboard endpoint needs.

    Each Firestore round-trip costs ~450ms from a laptop and a whole-collection
    stream ~1.8s, so the first page load after a restart used to pay several
    seconds before anything painted. The server is almost always up before the
    browser is, so we spend that time at startup instead of in the user's face.
    Fans out so the whole warm-up costs about one round-trip, and never raises:
    a cold cache is slow, not broken.
    """
    from concurrent.futures import ThreadPoolExecutor
    try:
        store = get_store(uid)
    except Exception:
        return
    loaders = [store.list_problems, store.list_attempts, store.list_reviews,
               store.list_enrichments, store.get_settings, store.list_mocks,
               store.list_active_sessions, store.latest_report]
    with ThreadPoolExecutor(max_workers=len(loaders)) as ex:
        for f in [ex.submit(fn) for fn in loaders]:
            try:
                f.result()
            except Exception:
                pass


def _where(field, op, value):
    """Build a query filter.

    The positional `.where(field, op, value)` form is deprecated in
    google-cloud-firestore 2.x and warns on every single call.
    """
    from google.cloud.firestore_v1 import FieldFilter
    return FieldFilter(field, op, value)


def _firestore_client():
    global _firestore_app, _firestore_db
    if _firestore_db is not None:
        return _firestore_db
    with _client_guard:
        if _firestore_db is None:
            from firebase_admin import firestore
            if _firestore_app is None:
                _firestore_app = config.init_firebase_admin()
            _firestore_db = firestore.client()
    return _firestore_db


def daily_coach_uids():
    """Existing users who have explicitly supplied a career goal."""
    return [d.id for d in _firestore_client().collection("users").stream()
            if (s := (d.to_dict() or {}).get("settings", {})).get("target_job", "").strip()
            and s.get("daily_coach_enabled", True)]


class FirestoreStore:
    def __init__(self, uid):
        self.uid = uid
        self.db = _firestore_client()

    def _user_ref(self):
        return self.db.collection("users").document(self.uid)

    def get_design_record(self, key):
        return self._user_ref().collection('system_design').document(key).get().to_dict()

    def list_design_records(self):
        return [d.to_dict() for d in self._user_ref().collection('system_design').stream()]

    def put_design_record(self, key, doc, expected_revision=None):
        """Create or compare-and-swap. A stale tab cannot overwrite newer work."""
        from google.cloud import firestore
        ref = self._user_ref().collection('system_design').document(key)
        @firestore.transactional
        def write(transaction):
            old = ref.get(transaction=transaction).to_dict()
            actual = old.get('revision', 0) if old else None
            if actual != expected_revision:
                raise ValueError('This design changed in another request. Reload before saving.')
            saved = {**doc, 'id': key, 'revision': (actual or 0) + 1}
            transaction.set(ref, saved)
            return saved
        return write(self.db.transaction())

    # ---- learning tracks (Fundamentals, AI Engineering, Experience, Practical) -----
    # users/{uid}/tracks/{track}/records/{key}: lesson progress, answers, stories, drills
    # and exercise attempts. Each record carries a revision for compare-and-swap.
    def _track(self, track):
        return self._user_ref().collection('tracks').document(track).collection('records')

    def get_track_record(self, track, key):
        return self._track(track).document(key).get().to_dict()

    def list_track_records(self, track):
        return list(_cached(('track', track, self.uid), lambda: [d.to_dict() for d in self._track(track).stream()]))

    def put_track_record(self, track, key, doc, expected_revision=None):
        """Create or compare-and-swap. A stale tab cannot overwrite newer work."""
        from google.cloud import firestore
        ref = self._track(track).document(key)
        @firestore.transactional
        def write(transaction):
            old = ref.get(transaction=transaction).to_dict()
            actual = old.get('revision', 0) if old else None
            if actual != expected_revision:
                raise ValueError('This record changed in another request. Reload before saving.')
            saved = {**doc, 'id': key, 'revision': (actual or 0) + 1}
            transaction.set(ref, saved)
            return saved
        saved = write(self.db.transaction())
        _invalidate(('track', track, self.uid))
        return saved

    def delete_track_record(self, track, key):
        self._track(track).document(key).delete()
        _invalidate(('track', track, self.uid))

    # Kept separate: a small recognition exercise is not an accepted solve or
    # a spaced-repetition review. create() makes submission retries idempotent.
    def _practice_write(self, question_id, result=None, guessed=False, exposure=False):
        from google.cloud import firestore
        from . import practice_state
        ref = self._user_ref().collection('light_practice').document(question_id)
        template = (result or {}).get('template')
        if not template:
            existing = ref.get().to_dict()
            if not existing:
                raise ValueError('Only a saved correct answer can be marked as guessed')
            template = existing['template']
        state_ref = self._user_ref().collection('practice_state').document(template)
        @firestore.transactional
        def write(transaction):
            old = ref.get(transaction=transaction).to_dict()
            state = state_ref.get(transaction=transaction).to_dict() or {}
            saved = old or result
            events = dict(state.get('events') or {})
            previous = events.get(question_id) or {}
            if exposure:
                saved = {**previous, **(old or result), 'exposed_at': previous.get('exposed_at') or result['exposed_at']}
                if old:
                    saved['assisted'] = bool(old.get('assisted') or result.get('assisted'))
            elif not old and previous:
                saved = {**result, 'exposed_at': previous.get('exposed_at'),
                         'assisted': bool(previous.get('assisted') or result.get('assisted'))}
            if guessed:
                if not old or not old.get('correct') or old.get('revealed'):
                    raise ValueError('Only a saved correct answer can be marked as guessed')
                saved = {**old, 'guessed': True, 'revision': old.get('revision', 0) + (not old.get('guessed'))}
            events[question_id] = saved
            if not exposure or old:
                transaction.set(ref, saved)
            transaction.set(state_ref, practice_state.rebuild(events.values()))
            return saved
        return write(self.db.transaction())

    def record_practice_exposure(self, question_id, result):
        return self._practice_write(question_id, result, exposure=True)

    def save_light_practice(self, question_id, result):
        return self._practice_write(question_id, result)

    def get_light_practice(self, question_id):
        return self._user_ref().collection('light_practice').document(question_id).get().to_dict()

    def mark_light_practice_guess(self, question_id):
        return self._practice_write(question_id, guessed=True)

    def list_practice_state(self):
        return {d.id: d.to_dict() for d in self._user_ref().collection('practice_state').stream()}

    def iter_light_practice(self, page_size=500):
        """All source answers; pagination is independent of the UI window."""
        collection = self._user_ref().collection('light_practice')
        cursor = None
        while True:
            query = collection.order_by('__name__').limit(page_size)
            if cursor is not None:
                query = query.start_after(cursor)
            page = list(query.stream())
            for doc in page:
                yield doc.to_dict()
            if len(page) < page_size:
                break
            cursor = page[-1]

    def list_learning_state(self):
        return [{**d.to_dict(), 'id': d.id} for d in self._user_ref().collection('learning_state').stream()]

    def get_learning_state(self, key):
        return self._user_ref().collection('learning_state').document(key).get().to_dict()

    def save_learning_state(self, key, doc):
        self._user_ref().collection('learning_state').document(key).set(doc)

    def list_approach_reviews(self):
        return [d.to_dict() for d in self._user_ref().collection('approach_reviews').stream()]

    def get_approach_review(self, slug):
        return self._user_ref().collection('approach_reviews').document(slug).get().to_dict()

    def upsert_approach_review(self, slug, doc):
        self._user_ref().collection('approach_reviews').document(slug).set({**doc, 'slug': slug})

    def list_light_practice(self):
        from google.cloud.firestore_v1 import Query
        query = self._user_ref().collection("light_practice").order_by(
            "answered_at", direction=Query.DESCENDING).limit(500)
        return [doc.to_dict() for doc in query.stream()]

    # ---- problems (global) --------------------------------------------------
    # The full LeetCode problem statement is 64% of the catalog by bytes, and it
    # is needed one slug at a time (the recall and sprint modals) — never across
    # the whole catalog. Keeping it out of the catalog read keeps every hot
    # endpoint small; get_problem still returns the complete document.
    CATALOG_OMIT = ("content_html", "starter_code", "example_testcases")

    def list_problems(self):
        # Global catalog; cache key is not per-user.
        def load():
            out = []
            for d in self.db.collection("problems").stream():
                doc = d.to_dict()
                for field in self.CATALOG_OMIT:
                    doc.pop(field, None)
                out.append(doc)
            return out
        return list(_cached(("problems",), load))

    def get_problem(self, slug):
        def load():
            snap = self.db.collection("problems").document(slug).get()
            return snap.to_dict() if snap.exists else None
        # Copy: callers treat the result as their own, the cache entry is shared.
        cached = _cached(("problem", slug), load)
        return dict(cached) if cached else None

    def upsert_problem(self, doc):
        self.db.collection("problems").document(doc["slug"]).set(doc, merge=True)
        _invalidate(("problems",))
        _invalidate(("problem", doc["slug"]))

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
        q = self._attempts().where(
            filter=_where("submission_id", "==", submission_id)).limit(1)
        for d in q.stream():
            item = d.to_dict()
            item["id"] = d.id
            return item
        return None

    def attempts_for_slug(self, slug):
        out = []
        for d in self._attempts().where(filter=_where("slug", "==", slug)).stream():
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
    def _recordings(self):
        return self._user_ref().collection("recordings")

    # Uncached and never listed: a recording is read only for its own session,
    # and kept off the attempt doc so loading every attempt stays cheap.
    def get_recording(self, session_id):
        snap = self._recordings().document(session_id).get()
        return snap.to_dict() if snap.exists else None

    def save_recording(self, session_id, doc):
        self._recordings().document(session_id).set(doc)

    def _sessions(self):
        return self._user_ref().collection("sessions")

    def get_session(self, sid):
        snap = self._sessions().document(sid).get()
        if not snap.exists:
            return None
        item = snap.to_dict()
        item["id"] = snap.id
        return item

    def list_sessions(self):
        return [{**d.to_dict(), "id": d.id} for d in self._sessions().stream()]

    def list_active_sessions(self):
        def load():
            out = []
            for d in self._sessions().where(
                    filter=_where("status", "==", "active")).stream():
                item = d.to_dict()
                item["id"] = d.id
                out.append(item)
            return out
        return list(_cached(("sessions", self.uid), load))

    def latest_active_session(self):
        active = self.list_active_sessions()
        active.sort(key=lambda s: s.get("started_at", 0), reverse=True)
        return active[0] if active else None

    def add_session(self, doc):
        ref = self._sessions().document()
        ref.set(doc)
        _invalidate(("sessions", self.uid))
        return ref.id

    def update_session(self, sid, fields):
        self._sessions().document(sid).update(fields)
        _invalidate(("sessions", self.uid))

    def start_session(self, doc, recording=None):
        """Cancel whatever run is active and start `doc` in one write — with its
        editor recording, when it has one. Two round-trips, not one per write."""
        batch = self.db.batch()
        for d in self._sessions().where(
                filter=_where("status", "==", "active")).stream():
            batch.update(d.reference, {"status": "cancelled"})
        ref = self._sessions().document()
        batch.set(ref, doc)
        if recording is not None:
            batch.set(self._recordings().document(ref.id), recording)
        batch.commit()
        _invalidate(("sessions", self.uid))
        return ref.id

    def cancel_active_sessions(self, slug=None):
        cancelled = 0
        for d in self._sessions().where(
                filter=_where("status", "==", "active")).stream():
            if slug and d.to_dict().get("slug") != slug:
                continue
            d.reference.update({"status": "cancelled"})
            cancelled += 1
        _invalidate(("sessions", self.uid))
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
        _invalidate(("reports", self.uid))

    def latest_report(self):
        def load():
            reports = [d.to_dict() for d in self._reports().stream()]
            reports.sort(key=lambda r: r.get("iso_week", ""), reverse=True)
            return reports[0] if reports else None
        return _cached(("reports", self.uid), load)

    # ---- daily learning-process coach ---------------------------------------
    def _daily_reviews(self):
        return self._user_ref().collection("daily_reviews")

    @staticmethod
    def _daily_review_key(date, timezone):
        import hashlib
        return date + "_" + hashlib.sha256(timezone.encode()).hexdigest()[:16]

    def get_daily_review(self, date, timezone):
        return self._daily_reviews().document(self._daily_review_key(date, timezone)).get().to_dict()

    def list_daily_reviews(self, timezone):
        from google.cloud.firestore_v1 import Query
        query = self._daily_reviews().where(filter=_where("timezone", "==", timezone))
        return [d.to_dict() for d in query.stream()]

    def upsert_daily_review(self, date, timezone, doc):
        from google.cloud import firestore
        ref = self._daily_reviews().document(self._daily_review_key(date, timezone))

        @firestore.transactional
        def save(transaction):
            old = ref.get(transaction=transaction).to_dict() or {}
            saved = {**doc, "date": date, "timezone": timezone,
                     "feedback": old.get("feedback") or {"status": "pending", "note": ""}}
            transaction.set(ref, saved)
            return saved

        result = save(self.db.transaction())
        _invalidate(("daily_reviews", self.uid))
        return result

    def update_daily_review_feedback(self, date, timezone, status, note):
        from google.cloud import firestore
        ref = self._daily_reviews().document(self._daily_review_key(date, timezone))

        @firestore.transactional
        def save(transaction):
            old = ref.get(transaction=transaction).to_dict()
            if not old:
                return None
            feedback = {"status": status, "note": note, "at": int(_time.time())}
            transaction.update(ref, {"feedback": feedback})
            return {**old, "feedback": feedback}

        result = save(self.db.transaction())
        if result:
            _invalidate(("daily_reviews", self.uid))
        return result


    # ---- Senpai: plan, state, decisions, proposals, interventions ----------
    # One subcollection per record type under users/{uid}. Documents in
    # `senpai` (plan, state, job_context) carry a revision for compare-and-swap.
    SENPAI = ('senpai', 'senpai_plans', 'senpai_decisions', 'senpai_proposals',
              'senpai_interventions', 'senpai_sessions', 'senpai_weekly', 'senpai_teaching')

    def _senpai(self, coll):
        if coll not in self.SENPAI:
            raise ValueError(f"unknown Senpai collection {coll}")
        return self._user_ref().collection(coll)

    def get_senpai(self, coll, key):
        if coll == 'senpai':  # plan/state/job_context: read on hot paths, so served from the cached list
            return next((dict(d) for d in self.list_senpai(coll) if d.get('_key') == key), None)
        return self._senpai(coll).document(key).get().to_dict()

    def list_senpai(self, coll):
        return list(_cached((coll, self.uid), lambda: [d.to_dict() for d in self._senpai(coll).stream()]))

    def put_senpai(self, coll, key, doc):
        doc = {**doc, '_key': key}
        self._senpai(coll).document(key).set(doc)
        _invalidate((coll, self.uid))
        return doc

    def create_senpai(self, coll, key, doc):
        """Create once; a duplicate (retried or concurrent) execution returns None."""
        from google.api_core.exceptions import AlreadyExists
        try:
            self._senpai(coll).document(key).create({**doc, '_key': key})
        except AlreadyExists:
            return None
        _invalidate((coll, self.uid))
        return doc

    def cas_senpai(self, coll, key, doc, expected_revision):
        """Write only if the stored revision is still `expected_revision` (None: absent)."""
        from google.cloud import firestore
        ref = self._senpai(coll).document(key)

        @firestore.transactional
        def write(transaction):
            old = ref.get(transaction=transaction).to_dict()
            actual = old.get('revision') if old else None
            if actual != expected_revision:
                raise ValueError('Senpai\'s plan changed in another request. Reload and try again.')
            transaction.set(ref, {**doc, '_key': key})
            return doc
        result = write(self.db.transaction())
        _invalidate((coll, self.uid))
        return result

    # ---- knowledge base (server/knowledge_base) and the tutor (server/tutor) --------
    # Events are append-only and keyed by the source's idempotency key, so a retried post
    # records once. Misconceptions are updated in place (open → resolved). Tutor sessions
    # are read one at a time (they grow); tutor memory is a handful of small documents.
    KNOWLEDGE = ('knowledge_events', 'knowledge_misconceptions', 'tutor_sessions', 'tutor_memory', 'drip',
                 'study_sessions')

    def _knowledge(self, coll):
        if coll not in self.KNOWLEDGE:
            raise ValueError(f"unknown knowledge collection {coll}")
        return self._user_ref().collection(coll)

    def list_knowledge(self, coll):
        return list(_cached((coll, self.uid), lambda: [d.to_dict() for d in self._knowledge(coll).stream()]))

    def get_knowledge(self, coll, key):
        doc = self._knowledge(coll).document(key).get().to_dict()
        return {**doc, '_key': key} if doc else None

    def create_knowledge(self, coll, key, doc):
        """Create once; a duplicate (retried or concurrent) post returns None."""
        from google.api_core.exceptions import AlreadyExists
        try:
            self._knowledge(coll).document(key).create({**doc, '_key': key})
        except AlreadyExists:
            return None
        _invalidate((coll, self.uid))
        return {**doc, '_key': key}

    def put_knowledge(self, coll, key, doc):
        doc = {**doc, '_key': key}
        self._knowledge(coll).document(key).set(doc)
        _invalidate((coll, self.uid))
        return doc

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
        _invalidate(("mocks", self.uid))
        return ref.id

    def update_mock(self, mid, fields):
        self._mocks().document(mid).update(fields)
        _invalidate(("mocks", self.uid))

    def list_mocks(self):
        def load():
            out = []
            for d in self._mocks().stream():
                item = d.to_dict()
                item["id"] = d.id
                out.append(item)
            out.sort(key=lambda m: m.get("started_at") or 0, reverse=True)
            return out
        return list(_cached(("mocks", self.uid), load))

    # ---- sprint rounds ------------------------------------------------------
    def _sprint_rounds(self):
        return self._user_ref().collection("sprint_rounds")

    def get_sprint_round(self, rid):
        snap = self._sprint_rounds().document(rid).get()
        if not snap.exists:
            return None
        item = snap.to_dict()
        item["id"] = snap.id
        return item

    def add_sprint_round(self, doc):
        ref = self._sprint_rounds().document()
        ref.set(doc)
        _invalidate(("sprint_rounds", self.uid))
        return ref.id

    def update_sprint_round(self, rid, fields):
        self._sprint_rounds().document(rid).update(fields)
        _invalidate(("sprint_rounds", self.uid))

    def list_sprint_rounds(self):
        def load():
            out = []
            for d in self._sprint_rounds().stream():
                item = d.to_dict()
                item["id"] = d.id
                out.append(item)
            out.sort(key=lambda r: r.get("started_at") or 0, reverse=True)
            return out
        return list(_cached(("sprint_rounds", self.uid), load))

    def latest_active_sprint_round(self):
        active = [r for r in self.list_sprint_rounds() if r.get("status") == "active"]
        return active[0] if active else None

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

    # ---- LeetCode credentials ----------------------------------------------
    # One credential pair per user, shared by every device. Writes are a plain
    # overwrite (no compare-and-set): the last save wins, which is the intended
    # semantics for a cookie pasted from whichever machine has a fresh one.
    def get_leetcode_auth(self):
        saved = self._user_doc().get("leetcode_auth") or {}
        if not saved.get("session"):
            return None
        return {"session": saved["session"], "csrf": saved.get("csrf")}

    def save_leetcode_auth(self, session, csrf=None):
        self._user_ref().set({
            "leetcode_auth": {
                "session": session,
                "csrf": csrf,
                "updated_at": int(_time.time()),
            },
        }, merge=True)
        _invalidate(("userdoc", self.uid))

    def clear_leetcode_auth(self):
        self._user_ref().set({"leetcode_auth": None}, merge=True)
        _invalidate(("userdoc", self.uid))

    # ---- revisions ----------------------------------------------------------
    def revisions(self):
        """Per-collection write counters, for the client's freshness check.

        Any change — a solve, an annotation, a background LLM job finishing —
        invalidates a key and so bumps a counter here. The client caches each
        rendered tab against a snapshot of this dict; an identical snapshot
        means nothing it is showing can have changed.
        """
        return {
            "problems": _revisions.get(("problems",), 0),
            "attempts": _revisions.get(("attempts", self.uid), 0),
            "reviews": _revisions.get(("reviews", self.uid), 0),
            "enrichments": _revisions.get(("enrichments", self.uid), 0),
            "sessions": _revisions.get(("sessions", self.uid), 0),
            "mocks": _revisions.get(("mocks", self.uid), 0),
            "sprint_rounds": _revisions.get(("sprint_rounds", self.uid), 0),
            "reports": _revisions.get(("reports", self.uid), 0),
            "daily_reviews": _revisions.get(("daily_reviews", self.uid), 0),
            "userdoc": _revisions.get(("userdoc", self.uid), 0),
            "senpai": sum(_revisions.get((c, self.uid), 0) for c in self.SENPAI),
        }


def _slugify(text):
    return "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-")
