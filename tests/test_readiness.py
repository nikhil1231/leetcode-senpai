"""readiness: one scale across sections. Pure logic first, then the HTTP round trip."""
import pytest
from fastapi.testclient import TestClient

from server import auth, main, readiness as rd
from server.tracks import http
from tests.fake_store import FakeStore


def test_band_says_unknown_before_it_says_early():
    assert rd.band(0, 0) == 'Not started'
    assert rd.band(80, 10) == 'Not enough tested to say'   # a high score on a sliver of the syllabus is not a score
    assert rd.band(10, 60) == 'Early'
    assert rd.band(30, 60) == 'Building'
    assert rd.band(55, 60) == 'Nearly there'
    assert rd.band(70, 60) == 'Interview-ready'


def test_coding_unit_weights_evidence_not_exposure():
    rows = [{'bucket': 'dsa', 'name': 'Arrays', 'status': 'demonstrated'}, {'bucket': 'dsa', 'name': 'Graphs', 'status': 'needs_check'},
            {'bucket': 'dsa', 'name': 'DP', 'status': 'untested'}, {'bucket': 'dsa', 'name': 'Trees', 'status': 'practised'},
            {'bucket': 'system_design', 'name': 'ignored', 'status': 'demonstrated'}]
    u = rd.coding_unit(rows)
    assert (u['total'], u['tested'], u['slipping']) == (4, 3, 1)
    assert u['held'] == 1.6 and u['ready'] == 39 and u['coverage'] == 75
    assert 'Graphs' in u['focus'] and u['headline'] == '1 of 4 skills demonstrated'


def test_knowledge_unit_reads_a_report():
    rep = {'total': 200, 'tested': 80, 'held': 50, 'knowledge': 60.0, 'slipping': 0, 'misconceptions': 0,
           'areas': [{'title': 'Caching', 'tested': 0}, {'title': 'Queues', 'tested': 4}], 'week': {'gained': 5, 'slipped': 1}}
    u = rd.knowledge_unit(rep)
    assert (u['ready'], u['coverage'], u['band']) == (30, 40, 'Building')
    assert 'Caching' in u['focus'] and u['week'] == {'gained': 5, 'slipped': 1}


def test_experience_blends_recall_with_having_a_story_per_competency():
    comps = [{'title': 'Ownership', 'stories': ['a']}, {'title': 'Conflict', 'stories': []}, {'title': 'Impact', 'stories': ['b']}, {'title': 'Failure', 'stories': []}]
    ov = {'total': 10, 'knowledge': 5.0, 'counts': {'solid': 5, 'unseen': 5}, 'coverage': comps, 'due': 0, 'stories': [1, 2]}
    u = rd.experience_unit(ov)
    assert u['ready'] == round(.7 * 50 + .3 * 50) and u['stories'] == {'count': 2, 'competencies': 4, 'covered': 2}
    assert '2 competencies with no story' in u['focus'] and 'Conflict' in u['focus']
    none = rd.experience_unit({**ov, 'knowledge': 0, 'counts': {'unseen': 10}, 'coverage': [{'title': 'x', 'stories': []}] * 4, 'stories': []})
    assert none['ready'] == 0 and none['band'] == 'Not started'


def test_weights_follow_the_plan_and_split_the_stack_evenly():
    w = rd.weights({'dsa': .4, 'system_design': .3, 'behavioural': .1, 'stack': .2})
    assert w['leetcode'] == pytest.approx(.4) and w['experience'] == pytest.approx(.1)
    assert w['fundamentals'] == w['ai'] == w['practical'] == pytest.approx(.2 / 3)
    assert sum(w.values()) == pytest.approx(1)
    assert set(rd.weights(None).values()) == {1 / 6}          # no plan: equal


def test_build_ranks_weakest_and_weights_the_overall():
    def u(ready, cov=60, slip=0):
        return {'total': 100, 'tested': cov, 'held': ready, 'slipping': slip, 'ready': ready, 'coverage': cov,
                'band': rd.band(ready, cov), 'focus': '', 'headline': ''}
    units = {'leetcode': u(80), 'system-design': u(40, slip=3), 'fundamentals': u(60), 'ai': u(20), 'experience': u(10), 'practical': u(50)}
    out = rd.build(units, {'dsa': .5, 'system_design': .3, 'behavioural': .0, 'stack': .2})
    assert out['overall']['weakest'] == 'experience' and out['overall']['strongest'] == 'leetcode'
    assert out['overall']['ready'] == round(80 * .5 + 40 * .3 + (60 + 20 + 50) * .2 / 3)
    assert out['overall']['slipping'] == 3 and [s['id'] for s in out['sections']][0] == 'leetcode'


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    monkeypatch.setattr(http, 'get_store', lambda uid: store)
    monkeypatch.setattr('server.knowledge_base.api.get_store', lambda uid: store)
    monkeypatch.setattr(main, 'get_store', lambda uid: store)
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    c = TestClient(main.app)
    yield c
    main.app.dependency_overrides.clear()


def test_endpoint_returns_every_section_for_an_empty_account(client):
    r = client.get('/api/readiness')
    assert r.status_code == 200, r.text
    body = r.json()
    assert [s['id'] for s in body['sections']] == ['leetcode', 'system-design', 'fundamentals', 'ai', 'experience', 'practical']
    assert body['overall']['ready'] == 0 and body['overall']['band'] == 'Not started'
    assert all(s['total'] > 0 and s['coverage'] == 0 for s in body['sections'])
    assert abs(sum(s['weight'] for s in body['sections']) - 1) < 0.01


def test_interview_countdown_and_pace():
    import datetime as dt
    today = dt.date(2026, 11, 9)
    assert rd.interview('', today, 40) is None and rd.interview('not a date', today, 40) is None
    out = rd.interview('2026-12-07', today, 40)          # four weeks away, 30 points short of 70
    assert out['days_left'] == 28 and out['gap'] == 30 and out['per_week'] == 7.5
    assert rd.interview('2026-11-12', today, 40)['per_week'] == 30          # under a week: the whole gap
    assert rd.interview('2026-12-07', today, 80)['per_week'] == 0           # already there
    assert rd.interview('2026-11-01', today, 40)['days_left'] == -8        # in the past: the page can say so


def test_interview_date_is_validated_and_reaches_the_overview(client):
    assert client.post('/api/config', json={'interview_date': 'soon'}).status_code == 400
    assert client.post('/api/config', json={'interview_date': '2999-01-01'}).status_code == 200
    body = client.get('/api/readiness').json()
    assert body['interview']['date'] == '2999-01-01' and body['interview']['days_left'] > 1000
    assert client.post('/api/config', json={'interview_date': ''}).status_code == 200
    assert client.get('/api/readiness').json()['interview'] is None
