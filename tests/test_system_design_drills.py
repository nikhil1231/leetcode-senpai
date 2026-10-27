"""Estimation drills: reproducible generation, tolerant grading, sprints feeding the ledger."""
import uuid

import pytest
from fastapi.testclient import TestClient

from server import auth, main, system_design_drills as drills, system_design_items as items
from tests.fake_store import FakeStore


def test_generation_is_reproducible_positive_and_cycles_templates():
    a, b = drills.generate('seed', 30), drills.generate('seed', 30)
    assert a == b and len(a) == 30
    assert all(q['answer'] > 0 and q['prompt'] and q['working'] for q in a)
    assert all(x['template'] != y['template'] for x, y in zip(a, a[1:]))
    assert {q['template'] for q in a} == set(drills.TEMPLATES)


def test_judging_accepts_within_a_quarter_and_parses_suffixes():
    assert drills.judge(1000, 1200) and drills.judge(1000, 810)
    assert not drills.judge(1000, 1300) and not drills.judge(1000, 0)
    assert drills.number('2.5k') == 2500 and drills.number('3M') == 3e6 and drills.number('x') is None


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    for module in (drills, items):
        monkeypatch.setattr(module, 'get_store', lambda uid: store)
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_ten_sprint_scores_hides_answers_until_answered_and_feeds_the_ledger(client):
    sprint = client.post('/api/system-design/drills', json={'request_id': uuid.uuid4().hex, 'mode': 'ten'}).json()
    assert len(sprint['questions']) == 10 and 'answer' not in sprint['questions'][0]
    for q in sprint['questions']:
        stored = client.get(f'/api/system-design/drills/{sprint["id"]}').json()
        assert 'answer' not in stored['questions'][q['n']]
        value = str(drills.generate(sprint['id'][len('sprint_'):], 10)[q['n']]['answer'] * (1 if q['n'] else 5))
        sprint = client.post(f'/api/system-design/drills/{sprint["id"]}/answer', json={'n': q['n'], 'value': value}).json()
    assert sprint['finished_at'] and sprint['score'] == 9
    assert all('answer' in q for q in sprint['questions'])
    listing = client.get('/api/system-design/drills').json()
    assert listing['best'] == {'ten': 9}
    ledger = client.get('/api/system-design/ledger').json()
    assert any(r['key'] == 'sprint:ten' and r['value'] == 9 for r in ledger['records'])
    estimation = next(c for c in ledger['heatmap'] if c['id'] == 'estimation')
    assert sum(s['status'] != 'unseen' for t in estimation['topics'] for s in t['items']) >= 8
