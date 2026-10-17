"""Consumer-visible daily process coaching boundaries; no live providers or storage."""
import asyncio
from copy import deepcopy
import datetime as dt
import json

import pytest
from fastapi.testclient import TestClient

from server import auth, daily_coach as coach, daily_coach_api as api, daily_coach_worker as worker, llm, main
from tests.fake_store import FakeStore


def epoch(text):
    return int(dt.datetime.fromisoformat(text).timestamp())


def seeded():
    store = FakeStore('daily-coach-tests')
    store.update_settings({'target_job': 'Senior backend engineer, distributed systems',
                           'daily_coach_timezone': 'America/New_York', 'daily_coach_time': '00:05'})
    store.upsert_problem({'slug': 'two-sum', 'title': 'Two Sum', 'neetcode_category': 'Hashing'})
    store.add_attempt({'id': 'ignored', 'slug': 'two-sum', 'solved_at': epoch('2026-10-16T16:00:00-04:00'),
                       'kind': 'review', 'independence': 'solo', 'code': 'PRIVATE_CODE', 'approach': 'PRIVATE_ANSWER'})
    return store


def review(evidence_id):
    return {'summary': 'Mix independent practice with supported learning.', 'practiced': 'A coding review.',
            'observations': [{'text': 'You attempted an independent review.', 'confidence': 'observed',
                              'evidence_ids': [evidence_id]}], 'keep_doing': [],
            'adjustment': {'action': 'Try a mixed, unlabelled session.', 'rationale': 'Exercise approach selection.',
                           'evidence_ids': [evidence_id]}, 'tomorrow': 'One mixed practice session.',
            'curriculum_suggestions': [], 'reflection_question': 'What felt difficult?', 'limitations': []}


def enable(monkeypatch, calls=None):
    monkeypatch.setattr(llm, 'enabled', lambda settings=None: True)
    def generate(provider, model, system, prompt, schema, **kwargs):
        data = json.loads(prompt)
        if calls is not None:
            calls.append(data)
        return json.dumps(review(data['evidence'][-1]['id']))
    monkeypatch.setattr(llm, '_raw_generate', generate)


@pytest.mark.parametrize('date,hours', [('2026-03-08', 23), ('2026-11-01', 25)])
def test_calendar_day_bounds_follow_dst(date, hours):
    _, start, end = coach.bounds(date, 'America/New_York')
    assert end - start == hours * 3600


def test_review_date_waits_for_local_schedule_and_handles_utc_date_difference():
    settings = {'daily_coach_timezone': 'America/Los_Angeles', 'daily_coach_time': '00:05'}
    assert coach.review_date(settings, epoch('2026-10-17T07:04:59+00:00')) == '2026-10-15'
    assert coach.review_date(settings, epoch('2026-10-17T07:05:00+00:00')) == '2026-10-16'


def test_evidence_excludes_answers_backfills_future_and_duplicate_assessments():
    store = seeded()
    aid = next(iter(store.attempts))
    store.add_session({'slug': 'two-sum', 'attempt_id': aid, 'started_at': epoch('2026-10-16T15:00:00-04:00')})
    store.add_attempt({'slug': 'two-sum', 'source': 'backfill', 'solved_at': epoch('2026-10-16T10:00:00-04:00')})
    store.add_attempt({'slug': 'two-sum', 'solved_at': epoch('2026-10-17T00:00:00-04:00')})
    store.design_records['d1'] = {'id': 'd1', 'kind': 'session', 'case_id': 'jobs',
                                  'updated_at': epoch('2026-10-16T20:00:00-04:00'), 'fields': {'flow': 'PRIVATE_DESIGN'}}
    store.design_records['a1'] = {'id': 'a1', 'kind': 'assessment', 'created_at': epoch('2026-10-16T21:00:00-04:00')}
    store.design_records['a2'] = {**store.design_records['a1'], 'id': 'a2'}
    data = coach.collect_activity(store, '2026-10-16', 'America/New_York', epoch('2026-10-18T12:00:00+00:00'))
    assert data['day_subject_counts'] == {'Coding': 1, 'System design': 1}
    assert {e['id'] for e in data['evidence']} == {'coding:' + aid, 'design:d1'}
    assert 'PRIVATE_' not in json.dumps(data)


def test_date_cutoff_includes_local_midnight_but_excludes_next_midnight():
    store = seeded()
    store.attempts.clear()
    for text in ['2026-10-16T00:00:00-04:00', '2026-10-16T23:59:59-04:00', '2026-10-17T00:00:00-04:00']:
        store.add_attempt({'slug': 'two-sum', 'solved_at': epoch(text)})
    data = coach.collect_activity(store, '2026-10-16', 'America/New_York', epoch('2026-10-18T00:00:00+00:00'))
    assert data['day_activity_count'] == 2


def test_bounded_evidence_reserves_space_for_day_under_review():
    store = seeded()
    store.attempts.clear()
    for day, count in [(15, 300), (16, 150)]:
        for i in range(count):
            store.add_attempt({'slug': 'two-sum', 'solved_at': epoch(f'2026-10-{day}T12:00:00-04:00') + i})
    data = coach.collect_activity(store, '2026-10-16', 'America/New_York', epoch('2026-10-18T00:00:00+00:00'))
    assert data['day_activity_count'] == 150
    assert sum(e['at'] >= coach.bounds('2026-10-16', 'America/New_York')[1] for e in data['evidence']) == 120
    assert len(data['evidence']) <= coach.MAX_EVENTS


def test_model_failure_and_hallucinated_citations_preserve_last_good_review(monkeypatch):
    store = seeded()
    enable(monkeypatch)
    now = epoch('2026-10-17T12:00:00-04:00')
    saved = asyncio.run(coach.generate(store, '2026-10-16', now=now))
    monkeypatch.setattr(llm, '_raw_generate', lambda *a, **k: json.dumps(review('invented:source')))
    with pytest.raises(coach.ReviewUnavailable):
        asyncio.run(coach.generate(store, '2026-10-16', force=True, now=now))
    assert store.get_daily_review('2026-10-16', 'America/New_York') == saved
    monkeypatch.setattr(llm, '_raw_generate', lambda *a, **k: None)
    with pytest.raises(coach.ReviewUnavailable):
        asyncio.run(coach.generate(store, '2026-10-16', force=True, now=now))
    assert store.get_daily_review('2026-10-16', 'America/New_York') == saved


def test_partial_review_finalises_and_keeps_user_feedback(monkeypatch):
    store = seeded()
    enable(monkeypatch)
    preview = asyncio.run(coach.generate(store, '2026-10-16', now=epoch('2026-10-16T22:00:00-04:00')))
    assert preview['partial'] is True
    store.update_daily_review_feedback('2026-10-16', 'America/New_York', 'dismissed', 'Session was interrupted')
    final = asyncio.run(coach.run_due(store, now=epoch('2026-10-17T00:05:00-04:00')))
    assert final['partial'] is False
    assert final['feedback'] == {'status': 'dismissed', 'note': 'Session was interrupted'}


def test_concurrent_generation_is_idempotent_and_changed_goal_regenerates(monkeypatch):
    store = seeded()
    calls = []
    enable(monkeypatch, calls)
    now = epoch('2026-10-17T12:00:00-04:00')
    async def both():
        return await asyncio.gather(coach.generate(store, '2026-10-16', now=now),
                                    coach.generate(store, '2026-10-16', now=now))
    results = asyncio.run(both())
    assert results[0] == results[1]
    assert len(calls) == 1
    store.update_settings({'target_job': 'Staff platform engineer'})
    changed = asyncio.run(coach.generate(store, '2026-10-16', now=now))
    assert changed['target_job'] == 'Staff platform engineer'
    assert len(calls) == 2


def test_empty_day_missing_goal_and_paused_schedule_do_not_invent_reports(monkeypatch):
    store = seeded()
    enable(monkeypatch)
    with pytest.raises(coach.ReviewUnavailable):
        asyncio.run(coach.generate(store, '2026-10-15', now=epoch('2026-10-17T12:00:00-04:00')))
    store.update_settings({'daily_coach_enabled': False})
    assert asyncio.run(coach.run_due(store)) is None
    store.update_settings({'target_job': ''})
    with pytest.raises(coach.ReviewUnavailable):
        asyncio.run(coach.generate(store))
    assert store.daily_reviews == {}


def test_scheduler_generates_without_browser_and_does_not_rewrite_ready_report(monkeypatch):
    store = seeded()
    enable(monkeypatch)
    monkeypatch.setattr(worker.store_mod, 'get_store', lambda uid: store)
    now = epoch('2026-10-17T00:05:00-04:00')
    asyncio.run(worker.tick([store.uid], now=now))
    saved = store.get_daily_review('2026-10-16', 'America/New_York')
    assert saved['date'] == '2026-10-16' and not saved['partial']
    flags = deepcopy(store.flags)
    asyncio.run(worker.tick([store.uid], now=now + 3600))
    assert store.flags == flags
    assert store.get_daily_review('2026-10-16', 'America/New_York') == saved


@pytest.fixture
def client(monkeypatch):
    stores = {'alice': seeded(), 'bob': FakeStore('bob')}
    stores['alice'].uid = 'alice'
    monkeypatch.setattr(main, 'get_store', lambda uid: stores[uid])
    monkeypatch.setattr(api, 'get_store', lambda uid: stores[uid])
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    client = TestClient(main.app)
    client.store = stores['alice']
    yield client
    main.app.dependency_overrides.clear()


def test_settings_persist_clear_and_reject_invalid_updates_atomically(client):
    response = client.post('/api/config', json={'target_job': '  Staff engineer  ', 'daily_coach_timezone': 'Asia/Kolkata',
                                               'daily_coach_time': '22:30', 'daily_coach_enabled': False})
    assert response.status_code == 200
    data = client.get('/api/config').json()
    assert (data['target_job'], data['daily_coach_timezone'], data['daily_coach_time'], data['daily_coach_enabled']) == ('Staff engineer', 'Asia/Kolkata', '22:30', False)
    before = deepcopy(client.store.settings)
    for bad in [{'daily_coach_timezone': 'Mars/Olympus'}, {'daily_coach_time': '25:61'}, {'daily_coach_enabled': 'yes'}, {'target_job': 'a' * 4001}]:
        assert client.post('/api/config', json={'username': 'must-not-save', **bad}).status_code in (400, 422)
        assert client.store.settings == before
    assert client.post('/api/config', json={'target_job': '  '}).status_code == 200
    assert client.get('/api/config').json()['target_job'] == ''


def test_review_and_feedback_are_user_isolated(client, monkeypatch):
    enable(monkeypatch)
    response = client.post('/api/coach/daily', json={'date': '2026-10-16'})
    assert response.status_code == 200, response.text
    assert client.post('/api/coach/daily/2026-10-16/feedback', json={
        'timezone': 'America/New_York', 'status': 'dismissed', 'note': 'Interrupted session'}).status_code == 200
    main.app.dependency_overrides[auth.require_user] = lambda: 'bob'
    assert client.get('/api/coach/daily').json()['reports'] == []
    assert client.post('/api/coach/daily/2026-10-16/feedback', json={
        'timezone': 'America/New_York', 'status': 'accepted'}).status_code == 404
    assert client.store.get_daily_review('2026-10-16', 'America/New_York')['feedback']['status'] == 'dismissed'
