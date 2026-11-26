"""Timed work is visible across sections, and starts can't replace or overlap it."""
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from fastapi.testclient import TestClient

from server import auth, main, timed_sessions as timed
from server.coding import api as coding, queue
from server import system_design, system_design_drills, system_design_papers, system_design_session


@pytest.fixture
def client(store, monkeypatch):
    for module in (main, timed, coding, queue, system_design, system_design_drills, system_design_papers, system_design_session):
        monkeypatch.setattr(module, 'get_store', lambda uid: store)
    from server.tracks import http
    monkeypatch.setattr(http, 'get_store', lambda uid: store)
    monkeypatch.setattr(queue, 'kick', lambda *args: None)
    for slug in ('two-sum', '3sum', 'valid-parentheses'):
        store.upsert_problem({'slug': slug, 'title': slug.title(), 'url': 'https://leetcode.com/problems/' + slug,
                              'in_library': True, 'neetcode_category': 'Arrays & Hashing', 'difficulty': 'Easy'})
    main.app.dependency_overrides[auth.require_user] = lambda: store.uid
    main.app.dependency_overrides[auth.leetcode_auth] = lambda: None
    client = TestClient(main.app)
    client.store = store
    yield client
    main.app.dependency_overrides.clear()


def status(client):
    r = client.get('/api/timed-sessions')
    assert r.status_code == 200, r.text
    return r.json()['activities']


def start_lc(client):
    r = client.post('/api/session/start', json={'slug': 'two-sum', 'surface': 'editor'})
    assert r.status_code == 200, r.text
    return r.json()


def end(client, key):
    r = client.post('/api/timed-sessions/end', json={'key': key})
    assert r.status_code == 200, r.text


@pytest.mark.parametrize('path,body', [
    ('/api/session/start', {'slug': '3sum'}),
    ('/api/mock/start', {}),
    ('/api/coding/reading/start', {}),
    ('/api/coding/assisted/start', {}),
    ('/api/tracks/practical/exercises/lru-ttl-cache/attempts', {}),
    ('/api/system-design/sessions', {'request_id': 'a' * 32, 'case_id': 'links'}),
    ('/api/system-design/papers', {'request_id': 'a' * 32, 'scope': 'mixed'}),
    ('/api/system-design/drills', {'request_id': 'a' * 32, 'mode': 'blitz'}),
    ('/api/sprint/start', {}),
    ('/api/editor/optimize', {'attempt_id': 'anything'}),
])
def test_live_run_blocks_starts_across_sections_without_losing_work(client, path, body):
    old = start_lc(client)
    r = client.post(path, json=body)
    assert r.status_code == 409, r.text
    assert r.json()['detail']['code'] == 'timed_session_active'
    assert r.json()['detail']['activity']['key'] == 'leetcode:' + old['session_id']
    assert client.store.get_session(old['session_id'])['status'] == 'active'
    assert len(status(client)) == 1


def test_header_reports_pause_and_plan_time_and_stale_end_does_not_end_new_run(client):
    old = start_lc(client)
    client.store.update_session(old['session_id'], {'started_at': 100, 'paused_at': 160, 'plan_time_sec': 20})
    a = status(client)[0]
    assert a['paused'] and not a['ticking'] and a['elapsed_sec'] == 80
    assert a['title'] == 'Two-Sum' and a['href'] == '/leetcode/today'
    end(client, a['key'])
    assert not status(client)
    fresh = start_lc(client)
    end(client, a['key'])
    assert status(client)[0]['id'] == fresh['session_id']


def test_coding_resume_preserves_attempt_and_new_cannot_discard_it(client):
    r = client.post('/api/coding/reading/start', json={'category': 'localisation'})
    assert r.status_code == 200, r.text
    attempt = r.json()['attempt']
    a = status(client)[0]
    assert a['href'] == '/practical/coding/' + attempt['id']
    resumed = client.post('/api/coding/reading/start', json={}).json()['attempt']
    assert resumed['id'] == attempt['id'] and resumed['started_at'] == attempt['started_at']
    for path, body in [('/api/coding/reading/start', {'new': True}), ('/api/coding/assisted/start', {}),
                       ('/api/session/start', {'slug': 'two-sum'}), ('/api/mock/start', {})]:
        assert client.post(path, json=body).status_code == 409
    end(client, a['key'])
    assert client.store.get_track_record('coding', attempt['id'])['status'] == 'abandoned'
    assert start_lc(client)['session_id']


def test_mock_reopens_existing_interview_and_owns_its_question_timer(client):
    m = client.post('/api/mock/start').json()
    again = client.post('/api/mock/start').json()
    assert m['id'] == again['id'] and m['started_at'] == again['started_at']
    slug = m['problems'][0]['slug']
    r = client.post('/api/session/start', json={'slug': slug, 'kind': 'mock', 'surface': 'editor'})
    assert r.status_code == 200, r.text
    activities = status(client)
    assert len(activities) == 1 and activities[0]['kind'] == 'mock'
    assert activities[0]['run_id'] == r.json()['session_id']
    assert client.post('/api/session/start', json={'slug': slug, 'kind': 'mock'}).status_code == 409
    assert client.post('/api/mock/start').json()['id'] == m['id']
    client.post('/api/mock/' + m['id'] + '/finish')
    assert status(client) == []
    assert client.get('/api/session/active').json()['active'] is None


def test_registry_reference_defeats_a_stale_collection_snapshot(client, monkeypatch):
    old = start_lc(client)
    # Another server process could still have cached the collection before the start.
    monkeypatch.setattr(client.store, 'list_active_sessions', lambda: [])
    assert status(client)[0]['id'] == old['session_id']
    assert client.post('/api/mock/start').status_code == 409


def test_existing_overlaps_are_all_visible_and_can_be_ended_individually(client):
    s = client.store.add_session({'slug': 'two-sum', 'status': 'active', 'started_at': time.time()})
    m = client.store.add_mock({'problems': [], 'started_at': time.time(), 'duration_sec': 3600, 'status': 'active'})
    assert {a['key'] for a in status(client)} == {'leetcode:' + s, 'mock:' + m}
    end(client, 'mock:' + m)
    assert len(status(client)) == 1
    assert client.post('/api/mock/start').status_code == 409
    end(client, 'leetcode:' + s)
    assert not status(client)


def test_failed_start_releases_the_slot(client, monkeypatch):
    monkeypatch.setattr(queue, 'take', lambda *args: None)
    assert client.post('/api/coding/reading/start', json={}).status_code == 503
    assert start_lc(client)['session_id']


def test_concurrent_start_lease_blocks_another_request(client):
    entered, release = Event(), Event()
    def hold_slot():
        with timed.exclusive(client.store):
            entered.set()
            assert release.wait(5)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(hold_slot)
        assert entered.wait(5)
        try:
            assert client.post('/api/session/start', json={'slug': 'two-sum'}).status_code == 409
        finally:
            release.set()
        future.result()
    assert start_lc(client)['session_id']


def test_design_clock_pauses_away_and_resume_cannot_overlap_other_work(client):
    d = client.post('/api/system-design/sessions', json={'request_id': uuid.uuid4().hex, 'case_id': 'links'}).json()
    key = 'design:' + d['id']
    assert client.post('/api/timed-sessions/clock', json={'key': key, 'elapsed_sec': 123, 'paused': True}).status_code == 200
    assert status(client)[0]['elapsed_sec'] == 123 and status(client)[0]['paused']
    end(client, key)
    start_lc(client)
    assert client.post('/api/system-design/sessions/' + d['id'] + '/resume').status_code == 409
    assert client.post('/api/timed-sessions/clock', json={'key': key, 'elapsed_sec': 150, 'paused': False}).status_code == 409
    client.post('/api/session/cancel')
    assert client.post('/api/system-design/sessions/' + d['id'] + '/resume').status_code == 200
    assert status(client)[0]['key'] == key


def test_redesign_restores_saved_draft_and_timer(client):
    from server.system_design_session import WALKTHROUGHS
    lesson = WALKTHROUGHS[0]
    path = '/api/system-design/redesign/' + lesson
    r = client.post(path + '/start', json={'request_id': uuid.uuid4().hex})
    assert r.status_code == 200, r.text
    run = r.json()
    assert client.put(path + '/draft', json={'run_id': run['id'], 'text': 'My saved draft'}).status_code == 200
    resumed = client.post(path + '/start', json={'request_id': uuid.uuid4().hex}).json()
    assert resumed['id'] == run['id'] and resumed['created_at'] == run['created_at']
    assert resumed['text'] == 'My saved draft'
    a = status(client)[0]
    assert a['kind'] == 'redesign' and a['duration_sec'] == 600
    assert client.post('/api/mock/start').status_code == 409
    end(client, a['key'])
    assert not status(client)


def test_paper_clock_survives_another_browser_and_end_finishes_saved_answers(client):
    r = client.post('/api/system-design/papers', json={'request_id': uuid.uuid4().hex, 'scope': 'mixed'})
    assert r.status_code == 200, r.text
    paper = r.json()
    key = 'design:' + paper['id']
    client.post('/api/timed-sessions/clock', json={'key': key, 'elapsed_sec': 123, 'paused': True})
    reopened = client.get('/api/system-design/papers/' + paper['id']).json()
    assert reopened['timer_elapsed_sec'] == 123
    end(client, key)
    assert status(client) == []
    assert client.get('/api/system-design/papers').json()['sitting'] is None
    assert client.store.get_design_record(paper['id'])['status'] != 'sitting'


def test_practical_and_drill_end_release_the_slot(client):
    r = client.post('/api/tracks/practical/exercises/lru-ttl-cache/attempts', json={})
    assert r.status_code == 200, r.text
    a = status(client)[0]
    assert a['href'] == '/practical/exercise/lru-ttl-cache'
    assert client.post('/api/coding/reading/start', json={}).status_code == 409
    end(client, a['key'])
    assert client.store.get_track_record('practical', r.json()['id'])['files']
    r = client.post('/api/system-design/drills', json={'request_id': uuid.uuid4().hex, 'mode': 'blitz'})
    assert r.status_code == 200, r.text
    end(client, status(client)[0]['key'])
    assert client.store.get_design_record(r.json()['id'])['finished_at']
    assert not status(client)


@pytest.mark.parametrize('kind', ['mock', 'coding'])
def test_resume_uses_fresh_registry_even_with_a_stale_collection_cache(client, monkeypatch, kind):
    path = '/api/mock/start' if kind == 'mock' else '/api/coding/reading/start'
    opened = client.post(path, json={}).json()
    first_id = opened['id'] if kind == 'mock' else opened['attempt']['id']
    if kind == 'mock':
        monkeypatch.setattr(client.store, 'list_mocks', lambda: [])
    else:
        original = client.store.list_track_records
        monkeypatch.setattr(client.store, 'list_track_records', lambda track: [] if track == 'coding' else original(track))
    resumed = client.post(path, json={}).json()
    assert (resumed['id'] if kind == 'mock' else resumed['attempt']['id']) == first_id
    assert len(status(client)) == 1
