"""The wall: poster weighting (pure), the wallpaper slot, the fading map, and the endpoints."""
import datetime as dt
import random

import pytest
from fastapi.testclient import TestClient

from server import main, wall
from server.knowledge_base import api, catalog as kcat, model as kmodel
from tests.fake_store import FakeStore

DAY = 86400
T0 = 1_762_000_000


def v(pid, status='solid', lesson='a', mis=0, unconfirmed=False, exposures=0, kind='fact'):
    return {'id': pid, 'status': status, 'lesson': lesson, 'misconceptions': mis, 'unconfirmed': unconfirmed,
            'exposures': exposures, 'kind': kind, 'prompt': f'ask {pid}', 'claim': f'claim {pid}', 'lesson_title': lesson}


def test_weak_points_weigh_most_and_unopened_lessons_never_show():
    started = {'a'}
    assert wall.weight(v('m', mis=1), started) > wall.weight(v('s', 'shaky'), started) > wall.weight(v('f', 'fading'), started) \
        > wall.weight(v('u', 'learning', unconfirmed=True), started) > wall.weight(v('l', 'learning'), started) \
        > wall.weight(v('h'), started)
    assert wall.weight(v('n', 'unseen', lesson='a'), started) > 0 and wall.weight(v('n', 'unseen', lesson='b'), started) == 0


def test_posters_sample_by_weight_without_repeats():
    views = [v('weak', 'shaky'), v('held'), v('new', 'unseen'), v('other', 'unseen', lesson='b')]
    counts = {}
    for seed in range(400):
        first = wall.posters(views, 1, random.Random(seed))[0]['point']
        counts[first] = counts.get(first, 0) + 1
    assert 'other' not in counts and counts['weak'] > counts['new'] > counts['held']
    picked = wall.posters(views, 10, random.Random(1))
    assert sorted(p['point'] for p in picked) == ['held', 'new', 'weak']
    fresh = [v('x', 'unseen', lesson='first'), v('y', 'unseen', lesson='second')]
    assert [p['point'] for p in wall.posters(fresh, 5)] == ['x']  # nothing started: the course's first ideas


def test_a_slot_is_two_hours_and_its_second_hour_reveals_the_answer():
    at = lambda h: dt.datetime(2026, 11, 2, h, 20)  # noqa: E731
    assert wall.slot(at(8)) == ('2026-11-02-4', False) and wall.slot(at(9)) == ('2026-11-02-4', True)
    assert wall.slot(at(10))[0] == '2026-11-02-5'
    views = [v(f'p{i}', 'shaky') for i in range(30)]
    assert wall.slot_poster(views, '2026-11-02-4') == wall.slot_poster(views, '2026-11-02-4')


def test_fading_map_scores_what_you_have_met():
    c = kcat.CATALOG
    pid = 'sd.cache-aside.db-load-is-miss-rate'
    states, seen = kmodel.replay([{'point': pid, 'at': T0 - DAY, 'kind': 'answer', 'clean': True, 'depth': 'recall',
                                   'strength': 'hard', 'blame': 'full'}])
    m = wall.fading_map(kmodel.summary(c, states, seen, [], T0))
    parts = {p['id']: p for p in m['parts']}
    assert set(parts) == set(wall.LAYOUT)
    cache = parts[c['points'][pid]['category']]
    assert cache['met'] == 1 and cache['strength'] > 50 and cache['coverage'] >= 1
    assert parts['queues']['met'] == 0 and parts['queues']['strength'] == 0
    assert [r['id'] for r in m['rooms']] == ['fundamentals', 'ai']
    assert all(a in parts and b in parts for a, b in m['edges'])


def test_render_png_draws_both_sides():
    p = wall.poster(v('p', 'shaky', kind='mechanism'))
    q, a = wall.render_png(p, 600, 1200, False, 0.3), wall.render_png(p, 600, 1200, True, 0.3)
    assert q[:8] == b'\x89PNG\r\n\x1a\n' and q != a


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('me')
    monkeypatch.setattr(api, 'get_store', lambda uid: store)
    main.app.dependency_overrides[api.caller] = lambda: {'uid': 'me', 'source': None}
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_endpoints(client):
    d = client.get('/api/wall', params={'n': 4}).json()
    assert len(d['posters']) == 4 and d['map']['parts'] and d['company']['label']
    r = client.get('/api/wall/poster.png', params={'w': 400, 'h': 800, 'side': 'answer'})
    assert r.status_code == 200 and r.headers['content-type'] == 'image/png' and r.headers['cache-control'] == 'no-store'
    now = client.get('/api/wall/now').json()
    assert now['poster']['ask'] and isinstance(now['reveal'], bool)
    page = client.get('/wall')
    assert page.status_code == 200 and '/api/wall' in page.text


def test_watch_topics_rank_slipping_lessons_and_skip_unopened_ones():
    views = [v('a1', 'shaky', lesson='a'), v('a2', 'fading', lesson='a'), v('b1', 'solid', lesson='b'),
             v('c1', 'unseen', lesson='c'), v('d1', 'learning', lesson='d', mis=1)]
    for x in views:
        x.update(lesson_title=f'Lesson {x["lesson"]}: part - two', section='system-design')
    out = wall.topics(views, 5)
    assert [t['lesson'] for t in out] == ['a', 'd', 'b'] and [t['why'] for t in out] == ['slipping', 'slipping', 'started']
    assert out[0]['query'] == 'Lesson a part two system design'
    assert wall.search_query('Design search autocomplete', 'system-design') == 'Design search autocomplete system design'
    assert wall.search_query('How LLMs behave', 'ai') == 'How LLMs behave'  # the hint is already there
    assert wall.search_query('Evals', 'ai') == 'Evals LLM'
