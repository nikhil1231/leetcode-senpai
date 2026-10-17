"""System design API/state regressions. No real storage or model requests."""
import asyncio
from copy import deepcopy
import json
import uuid

import pytest
from fastapi.testclient import TestClient

from server import auth, main, llm, system_design as sd, system_design_coach as coach
from server.system_design_content import EXERCISES, FIELDS
from tests.fake_store import FakeStore


def rid():
    return uuid.uuid4().hex


@pytest.fixture
def client(monkeypatch):
    stores = {'alice': FakeStore('alice'), 'bob': FakeStore('bob')}
    monkeypatch.setattr(sd, 'get_store', lambda uid: stores[uid])
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    c = TestClient(main.app)
    c.store = stores['alice']
    yield c
    main.app.dependency_overrides.clear()


def start(client, case='jobs', **extra):
    response = client.post('/api/system-design/sessions', json={
        'request_id': rid(), 'case_id': case, **extra})
    assert response.status_code == 200, response.text
    return response.json()


def save(client, session, text='Persist the job durably before returning its identifier.'):
    response = client.put('/api/system-design/sessions/' + session['id'], json={
        'revision': session['revision'], 'fields': {'flow': text}, 'elapsed_sec': 80})
    assert response.status_code == 200, response.text
    return response.json()


def assessment(snapshot):
    return {'summary': 'The acceptance boundary is clear.', 'next_skill': 'retries', 'assisted': False,
            'findings': [{'skill': 'retries', 'status': 'demonstrated', 'kind': 'strength',
                          'evidence': snapshot['fields']['flow'], 'observation': 'Durable acceptance.',
                          'consequence': 'Accepted jobs survive this crash.', 'repair': 'Trace the worker next.'}]}


def enable_model(monkeypatch, callback=None):
    monkeypatch.setattr(llm, 'enabled', lambda *args: True)
    async def generate(role, snapshot, settings=None):
        if callback:
            callback(snapshot)
        result = assessment(snapshot) if role == 'assessor' else {'reply': 'What is durable at that point?', 'assistance': False}
        return {'result': result, 'model': 'test/strong', 'requested_model': 'test/strong',
                'reasoning_effort': 'high', 'usage': {}, 'prompt_version': 1, 'content_version': 1}, None
    monkeypatch.setattr(coach, 'generate', generate)


def test_catalog_does_not_expose_rubrics_or_answers(client):
    data = client.get('/api/system-design').json()
    assert len(data['cases']) == 3
    assert data['coach_enabled'] is False
    assert all('rubric' not in c for c in data['cases'])
    assert all('correct' not in q and 'explanation' not in q for q in data['exercises'])
    assert not client.store.attempts and not client.store.reviews


def test_create_is_idempotent_and_conflicting_reuse_rejected(client):
    body = {'request_id': rid(), 'case_id': 'jobs'}
    first = client.post('/api/system-design/sessions', json=body).json()
    assert client.post('/api/system-design/sessions', json=body).json() == first
    assert client.post('/api/system-design/sessions', json={**body, 'case_id': 'seats'}).status_code == 409


def test_stale_save_cannot_erase_new_work(client):
    old = start(client)
    new = save(client, old)
    response = client.put('/api/system-design/sessions/' + old['id'], json={
        'revision': old['revision'], 'fields': {'flow': 'stale'}, 'elapsed_sec': 2})
    assert response.status_code == 409
    assert client.get('/api/system-design/sessions/' + old['id']).json()['session'] == new


def test_user_cannot_read_or_mutate_another_users_design(client):
    session = start(client)
    main.app.dependency_overrides[auth.require_user] = lambda: 'bob'
    path = '/api/system-design/sessions/' + session['id']
    assert client.get(path).status_code == 404
    assert client.put(path, json={'revision': 1, 'fields': {}, 'elapsed_sec': 0}).status_code == 404


def test_disabled_model_preserves_draft_and_has_no_fake_grade(client):
    session = save(client, start(client))
    response = client.post(f"/api/system-design/sessions/{session['id']}/assess",
                           json={'revision': session['revision'], 'request_id': rid()})
    assert response.status_code == 503
    saved = client.get('/api/system-design/sessions/' + session['id']).json()
    assert saved['session']['fields'] == session['fields']
    assert saved['assessments'] == []


def test_assessment_is_immutable_idempotent_and_marks_subsequent_work_supported(client, monkeypatch):
    calls = []
    enable_model(monkeypatch, lambda snapshot: calls.append(deepcopy(snapshot)))
    session = save(client, start(client))
    body = {'revision': session['revision'], 'request_id': rid()}
    path = f"/api/system-design/sessions/{session['id']}/assess"
    result = client.post(path, json=body).json()
    assert len(calls) == 1
    assert calls[0]['assisted'] is False
    assert calls[0]['case_contract'] == sd.CASES[session['case_id']]
    assert result['session']['assisted'] is True
    client.post(path, json=body)
    assert len(calls) == 1
    save(client, result['session'], 'This is a completely revised design with different decisions.')
    saved = client.get('/api/system-design/sessions/' + session['id']).json()
    assert saved['assessments'][0]['snapshot']['fields'] == session['fields']
    assert saved['assessments'][0]['status'] == 'complete'


def test_late_assessment_does_not_overwrite_new_draft(client, monkeypatch):
    session = save(client, start(client))
    def edit_while_grading(_snapshot):
        newer = client.store.get_design_record(session['id'])
        newer['fields']['flow'] = 'New work written while the assessment was running.'
        client.store.put_design_record(session['id'], newer, newer['revision'])
    enable_model(monkeypatch, edit_while_grading)
    client.post(f"/api/system-design/sessions/{session['id']}/assess",
                json={'revision': session['revision'], 'request_id': rid()})
    saved = client.get('/api/system-design/sessions/' + session['id']).json()
    assert saved['session']['fields']['flow'].startswith('New work')
    assert saved['assessments'][0]['snapshot']['fields'] == session['fields']


def test_failed_assessment_retry_uses_original_snapshot(client, monkeypatch):
    monkeypatch.setattr(llm, 'enabled', lambda *args: True)
    async def fail(*args):
        return None, 'Temporary provider failure'
    monkeypatch.setattr(coach, 'generate', fail)
    session = save(client, start(client))
    result = client.post(f"/api/system-design/sessions/{session['id']}/assess",
                         json={'revision': session['revision'], 'request_id': rid()}).json()
    aid = result['assessment']['id']
    assert client.store.get_design_record(aid)['status'] == 'error'
    original_contract = deepcopy(client.store.get_design_record(aid)['snapshot']['case_contract'])
    monkeypatch.setitem(sd.CASES, session['case_id'], {'title': 'Changed after submission'})
    save(client, result['session'], 'A later draft that must not replace the assessment snapshot.')
    calls = []
    enable_model(monkeypatch, lambda snapshot: calls.append(snapshot))
    assert client.post(f'/api/system-design/assessments/{aid}/retry').status_code == 200
    assert calls[0]['fields'] == session['fields']
    assert calls[0]['case_contract'] == original_contract
    assert client.store.get_design_record(aid)['status'] == 'complete'


def test_chat_is_saved_once_and_learning_help_is_recorded(client, monkeypatch):
    enable_model(monkeypatch)
    session = start(client)
    body = {'revision': session['revision'], 'request_id': rid(), 'message': 'How should I begin?'}
    path = f"/api/system-design/sessions/{session['id']}/chat"
    first = client.post(path, json=body).json()
    assert len(first['chat']) == 2 and first['assisted'] is True
    assert client.post(path, json=body).json() == first


def test_lesson_exposure_follows_user_into_new_design(client):
    assert client.post('/api/system-design/lessons/retries', json={}).status_code == 200
    assert start(client, 'jobs', mode='interview')['assisted'] is True
    assert start(client, 'seats', mode='interview')['assisted'] is False


def test_practice_reveal_is_persisted_and_cannot_be_rewritten_as_success(client):
    run = client.post('/api/system-design/practice', json={'request_id': rid(), 'exercise_id': 'capacity-backlog'}).json()
    assert 'correct' not in run['question'] and 'explanation' not in run['question']
    path = '/api/system-design/practice/' + run['record']['id'] + '/answer'
    revealed = client.post(path, json={'reveal': True}).json()
    second = client.post(path, json={'answer': '120'}).json()
    assert second == revealed
    assert revealed['record']['correct'] is False
    assert not client.store.reviews and not client.store.attempts


def test_lesson_opened_after_exercise_starts_marks_answer_supported(client):
    run = client.post('/api/system-design/practice', json={'request_id': rid(), 'exercise_id': 'capacity-backlog'}).json()
    client.post('/api/system-design/lessons/capacity', json={})
    answer = client.post('/api/system-design/practice/' + run['record']['id'] + '/answer', json={'answer': '120'}).json()
    assert answer['record']['correct'] is True and answer['record']['assisted'] is True


def test_immediate_retries_do_not_compound_review_intervals():
    def row(at):
        return {'kind': 'practice', 'skill': 'capacity', 'answered_at': at, 'correct': True}
    first = sd.review_schedule([row(100)])['capacity']
    assert sd.review_schedule([row(100), row(105), row(110)])['capacity'] == first
    later = sd.review_schedule([row(100), row(100 + 7*sd.DAY)])['capacity']
    assert later['interval'] == 21


def test_due_review_prefers_a_reserved_application():
    rows = [{'kind': 'practice', 'exercise_id': 'capacity-backlog', 'skill': 'capacity',
             'answered_at': 100, 'correct': True}]
    rec = sd.recommendation(rows, 15, 100 + 8*sd.DAY)
    assert rec['id'] == 'capacity-transfer'


def test_numeric_exercises_check_mechanism_without_eval():
    from server.system_design_content import check_exercise
    assert check_exercise('capacity-backlog', str((12-10)*60))
    assert check_exercise('capacity-transfer', str(10 + 600//300))
    assert not check_exercise('capacity-transfer', '__import__("os")')
    for item in EXERCISES.values():
        if item['choices']:
            assert 0 <= item['correct'] < len(item['choices'])


@pytest.mark.asyncio
async def test_model_role_uses_bounded_profile_and_rejects_invented_evidence(monkeypatch):
    monkeypatch.setattr(llm, 'enabled', lambda *args: True)
    snapshot = {'case_id': 'jobs', 'fields': {'flow': 'Persist first.'}, 'chat': []}
    calls = []
    def fake(provider, model, system, prompt, schema, *, options):
        calls.append((model, options))
        value = assessment(snapshot)
        value['findings'][0]['evidence'] = 'A quotation the user never wrote.'
        return {'content': json.dumps(value), 'model': model, 'usage': {}}
    monkeypatch.setattr(llm, '_raw_generate', fake)
    output, error = await coach.generate('assessor', snapshot)
    assert output is None and error
    assert calls[0][1]['effort'] == 'high' and calls[0][1]['max_tokens'] == 16000


@pytest.mark.asyncio
async def test_valid_assessment_retains_provenance(monkeypatch):
    monkeypatch.setattr(llm, 'enabled', lambda *args: True)
    monkeypatch.setenv('SD_ASSESSOR_MODEL', 'example/reviewer')
    snapshot = {'case_id': 'jobs', 'fields': {'flow': 'Persist first.'}, 'chat': []}
    monkeypatch.setattr(llm, '_raw_generate', lambda *a, **k: {
        'content': json.dumps(assessment(snapshot)), 'model': 'example/reviewer',
        'usage': {'prompt_tokens': 150, 'completion_tokens': 50}})
    output, error = await coach.generate('assessor', snapshot)
    assert error is None
    assert output['requested_model'] == 'example/reviewer'
    assert output['prompt_version'] == 1 and output['content_version'] == 1
    assert output['usage']['prompt_tokens'] == 150


def test_duplicate_grades_and_assisted_work_do_not_inflate_independent_evidence():
    snap = {'case_id': 'jobs', 'fields': {'flow': 'Persist first.'}, 'chat': [], 'assisted': False}
    a = {'kind': 'assessment', 'session_id': 's1', 'status': 'complete', 'created_at': 100,
         'snapshot': snap, 'assessment': {'result': assessment(snap)}}
    duplicate = {**deepcopy(a), 'created_at': 200}
    assisted = {**deepcopy(a), 'session_id': 's2', 'created_at': 100 + 2*sd.DAY}
    assisted['snapshot']['assisted'] = True
    result = sd.evidence([a, duplicate, assisted])['retries']
    assert result['designs'] == 2
    assert result['independent_cases'] == 1 and result['later_checks'] == 0


def test_profile_revision_and_time_budget_control_recommendation(client):
    response = client.put('/api/system-design/profile', json={'level': 'senior', 'minutes': 5}).json()
    assert client.put('/api/system-design/profile', json={'level': 'mid', 'minutes': 15}).status_code == 409
    data = client.get('/api/system-design').json()
    assert data['profile']['level'] == 'senior'
    assert data['recommendation']['kind'] == 'practice'
    assert start(client)['level'] == 'senior'


def test_assets_are_versioned_and_navigation_is_present(client):
    html = client.get('/').text
    assert 'data-tab="design"' in html and 'id="tab-design"' in html
    assert '/system-design.js?v=' in html and '/system-design.css?v=' in html
    assert 'system-design.js' in main._VERSIONED_ASSETS
