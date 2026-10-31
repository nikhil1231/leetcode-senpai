"""What-you-know report, the next step and placement: pure parts on the real catalog, then HTTP."""
import pytest
from fastapi.testclient import TestClient

from server import auth, config, main, system_design_learning as sdl
from server.knowledge_base import api as kb_api, catalog as cat, model, progress, sources
from server.tracks import courses, http as track_http
from server.tutor import api as tutor_api
from tests.fake_store import FakeStore

DAY = 86400
NOW = 1_800_000_000
C = cat.CATALOG


def pids(lesson, n=None):
    found = [p['id'] for p in cat.active(C) if p['lesson'] == lesson]
    return found[:n] if n else found


def ans(point, at, clean=True):
    return {'point': point, 'at': at, 'kind': 'answer', 'clean': clean, 'depth': 'recall', 'strength': 'hard', 'blame': 'full'}


def rep(events, mis=(), section='system-design'):
    states, seen = model.replay(events, NOW)
    week_ago, _ = model.replay(events, NOW - progress.WEEK)
    return progress.report(C, states, week_ago, seen, list(mis), NOW, section)


def area(r, aid):
    return next(a for a in r['areas'] if a['id'] == aid)


def lesson(r, lid):
    return next(l for a in r['areas'] for l in a['lessons'] if l['id'] == lid)


# ---- report ---------------------------------------------------------------------------------

def test_untested_is_unknown_not_zero():
    r = rep([])
    assert r['tested'] == 0 and r['score'] is None and r['level'] == 'untested'
    assert [a['id'] for a in r['areas']][:3] == ['foundations', 'apis', 'storage']
    assert all(a['level'] == 'untested' for a in r['areas'])


def test_score_is_over_tested_points_only():
    right, wrong = pids('request-flow', 6), pids('guarantees', 2)
    r = rep([ans(p, NOW - 3600) for p in right] + [ans(p, NOW - 3600, False) for p in wrong])
    a = area(r, 'foundations')
    assert a['tested'] == 8 and a['total'] > 50
    assert 70 <= a['score'] <= 76          # six held near 1.0, two wrong at 0
    assert a['level'] == 'good' and a['slipping'] == 2
    assert lesson(r, 'request-flow')['level'] == 'strong' and lesson(r, 'guarantees')['level'] == 'early'
    assert area(r, 'apis')['level'] == 'untested'


def test_week_changes_and_misconceptions():
    a, b = pids('request-flow', 2)
    events = [ans(a, NOW - 10 * DAY), ans(a, NOW - 9 * DAY), ans(a, NOW - DAY, False), ans(b, NOW - DAY)]
    mis = [{'_key': 'tutor:k1', 'point': b, 'text': 'thinks the gateway commits writes', 'quote': 'the gateway saves it',
            'status': 'open', 'created_at': NOW - 100, 'source': 'tutor'},
           {'_key': 'tutor:k0', 'point': b, 'text': 'old', 'status': 'resolved', 'created_at': NOW - 200}]
    r = rep(events, mis)
    assert r['week']['gained'] == 1 and r['week']['gained_points'][0]['id'] == b
    assert r['week']['slipped'] == 1 and r['week']['slipped_points'][0]['id'] == a
    assert [m['key'] for m in r['misconceptions']] == ['tutor:k1']
    assert r['misconceptions'][0]['lesson'] == 'request-flow' and r['misconceptions'][0]['claim']


def test_trend_is_weekly_and_oldest_first():
    events = [ans(p, NOW - 20 * DAY) for p in pids('request-flow', 3)] + [ans(p, NOW - DAY) for p in pids('guarantees', 2)]
    t = progress.trend(C, events, NOW, 'system-design', weeks=4)
    assert [x['tested'] for x in t] == [0, 3, 3, 5]
    assert t[-1]['at'] == NOW


# ---- next step ------------------------------------------------------------------------------

def test_first_step_is_placement_then_learning():
    step = progress.next_step(rep([]))
    assert step['primary']['kind'] == 'placement' and step['primary']['area'] == 'foundations'
    assert step['primary']['count'] == 5
    assert step['alternatives'][0]['kind'] == 'learn' and step['alternatives'][0]['lesson'] == 'request-flow'


def test_started_lesson_continues_and_tutor_leads():
    events = [ans(p, NOW - DAY) for p in pids('guarantees', 5)]
    step = progress.next_step(rep(events), tutor=True)
    assert step['primary']['kind'] == 'learn' and step['primary']['lesson'] == 'guarantees'
    assert step['primary']['tutor'] and 'tutor' in step['primary']['label']


def test_strong_areas_are_skipped():
    events = [ans(p, NOW - 3 * DAY) for p in pids('request-flow')]
    events += [ans(p, NOW - 2 * DAY) for p in pids('request-flow')] + [ans(p, NOW - DAY) for p in pids('request-flow')]
    events += [ans(p, NOW - DAY) for l in ('guarantees', 'service-quality', 'numbers', 'estimates') for p in pids(l, 2)]
    r = rep(events)
    assert area(r, 'foundations')['level'] == 'strong'
    step = progress.next_step(r)
    assert step['primary']['kind'] == 'placement' and step['primary']['area'] == 'apis'


def test_lessons_probed_right_wait_until_last():
    events = [ans(pids('request-flow', 1)[0], NOW - DAY), ans(pids('guarantees', 1)[0], NOW - DAY, False)]
    step = progress.next_step(rep(events))
    assert step['primary']['kind'] == 'learn' and step['primary']['lesson'] == 'guarantees'


def test_priorities_resume_fix_review():
    wrong = [ans(p, NOW - DAY, False) for p in pids('request-flow', 6)]
    mis = [{'_key': 'drip:g', 'kind': 'gap', 'point': pids('guarantees', 1)[0], 'text': 'name the invariant', 'status': 'open',
            'created_at': NOW}]
    r = rep(wrong, mis)
    s = progress.next_step(r, tutor=True, active={'lesson': 'numbers'})
    assert [s['primary']['kind']] + [a['kind'] for a in s['alternatives']] == ['resume', 'fix', 'review']
    s = progress.next_step(r, tutor=False, active={'lesson': 'numbers'})
    assert s['primary']['kind'] == 'fix' and not s['primary']['tutor'] and 'slippery: name the invariant.' in s['primary']['why']
    assert progress.general('Specify the invariant precisely, such as at most one CONFIRMED booking.') == 'Specify the invariant precisely.'


# ---- placement pickers ------------------------------------------------------------------

def test_track_placement_one_question_per_untested_lesson():
    cat_id = next(iter(courses.lessons('fundamentals').values()))['category']
    in_cat = [k for k, l in courses.lessons('fundamentals').items() if l['category'] == cat_id]
    asked, records = [], [{'kind': 'answer', 'lesson_id': in_cat[0]}]
    while (q := courses.placement_question('fundamentals', records, asked, cat_id)):
        asked.append(q['id'])
    assert [courses.questions('fundamentals')[q]['lesson_id'] for q in asked] == in_cat[1:]


def test_sd_placement_pool_skips_tested_and_asked():
    qs = [q for q in sdl.QUESTIONS.values() if q['kind'] == 'quickfire' and q['category'] == 'foundations']
    lessons = list(dict.fromkeys(q['lesson_id'] for q in qs))
    first = next(q for q in qs if q['lesson_id'] == lessons[1])
    pool = sdl.placement_pool(qs, [{'lesson_id': lessons[0]}], [first['id']])
    assert {q['lesson_id'] for q in pool} == set(lessons[2:])


# ---- HTTP -----------------------------------------------------------------------------------

@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    for mod in (kb_api, tutor_api, sdl, track_http):
        monkeypatch.setattr(mod, 'get_store', lambda uid: store)
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', None)
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    main.app.dependency_overrides[kb_api.caller] = lambda: {'uid': 'alice', 'source': None}
    c = TestClient(main.app)
    c.store = store
    yield c
    main.app.dependency_overrides.clear()


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def test_report_and_next_step_over_http(client):
    r = ok(client.get('/api/knowledge/report', params={'section': 'fundamentals'}))
    assert r['level'] == 'untested' and len(r['trend']) == 8 and r['areas']
    n = ok(client.get('/api/tutor/next', params={'section': 'fundamentals'}))
    assert n['tutor'] is False and n['previously'] is None and n['primary']['kind'] in ('placement', 'learn')
    assert n['standing']['tested'] == 0 and n['company']['name'] == 'Ripple'
    client.store.put_knowledge('tutor_memory', 'lesson:fundamentals:kubernetes', {'summary': 'Probes.', 'last_at': 5, 'active': None})
    n = ok(client.get('/api/tutor/next', params={'section': 'fundamentals'}))
    assert n['previously']['lesson'] == 'kubernetes' and n['previously']['summary'] == 'Probes.'
    assert client.get('/api/tutor/next', params={'section': 'leetcode'}).status_code == 422


def test_track_placement_over_http(client):
    cat_id = next(iter(courses.lessons('ai').values()))['category']
    q = ok(client.post('/api/tracks/ai/quickfire/next', json={'placement': True, 'category': cat_id}))['question']
    assert courses.lessons('ai')[q['lesson_id']]['category'] == cat_id


def test_older_question_versions_count_for_the_current_points():
    assert sources.mapped(C, 'request-flow-check-1-v1') == 'request-flow-check-1-v2'
    assert sources.mapped(C, 'request-flow-check-1-v2') == 'request-flow-check-1-v2'
    assert sources.mapped(C, 'nope-check-1-v1') is None and sources.mapped(C, 'plain') is None
