"""The wall: poster weighting, the wallpaper's lessons and rotation (pure), the fading map, and the endpoints."""
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


def test_struggles_rank_covered_lessons_and_never_include_unmet_points():
    views = [v('a1', 'shaky', lesson='a'), v('a2', 'fading', lesson='a'), v('a3', 'solid', lesson='a'),
             v('a4', 'unseen', lesson='a'), v('b1', 'learning', lesson='b', mis=1), v('c1', 'unseen', lesson='c'),
             v('d1', 'solid', lesson='d')]
    for x in views:
        x['section'] = 'system-design'
    out = wall.struggles(views, per=2)
    assert [l['lesson'] for l in out] == ['a', 'b']      # c never met, d held: neither needs a poster
    assert out[0]['points'] == ['a1', 'a2'] and out[0]['score'] == 9 and out[1]['score'] == 7
    assert wall.struggle(v('u', 'unseen', mis=1)) == 6   # a misconception counts even before an answer


def test_brief_carries_claims_and_open_misconceptions():
    views = [v('a1', 'shaky'), v('a2', 'fading')]
    for x in views:
        x['section'] = 'fundamentals'
    lesson = {'lesson': 'a', 'title': 'A', 'section': 'fundamentals', 'points': ['a1', 'a2'], 'score': 9}
    b = wall.brief(lesson, views, [{'point': 'a1', 'status': 'open', 'text': 'mixed up X and Y'},
                                   {'point': 'a2', 'status': 'resolved', 'text': 'old'}])
    assert [i['claim'] for i in b['ideas']] == ['claim a1', 'claim a2']
    assert b['ideas'][0]['pitfall'] == 'mixed up X and Y' and 'pitfall' not in b['ideas'][1]


def test_the_poster_changes_only_in_waking_hours():
    at = lambda d, h, m=0: dt.datetime(2026, 11, d, h, m)  # noqa: E731
    slot = lambda t: wall.wake_slot(t, '08:30-22:30', 2)  # noqa: E731   7 slots a day
    assert slot(at(2, 8, 30)) == slot(at(2, 10, 29)) and slot(at(2, 10, 30)) == slot(at(2, 8, 30)) + 1
    evening = slot(at(2, 20, 30))
    assert slot(at(2, 22, 45)) == slot(at(3, 3)) == slot(at(3, 8, 29)) == evening   # the night keeps it
    assert slot(at(3, 8, 30)) == evening + 1
    # Every poster gets waking time: over a week of slots each of 4 posters is up in the day.
    shown = {slot(at(d, h)) % 4 for d in range(2, 9) for h in range(9, 22)}
    assert shown == {0, 1, 2, 3}


def poster_doc(key, lesson, at, ok=True, points=('p',), version='v'):
    return {'_key': key, 'lesson': lesson, 'created_at': at, 'ok': ok, 'points': list(points), 'version': version}


def test_shelf_puts_the_weakest_lessons_posters_first_and_reuses_old_ones():
    ranked = [{'lesson': 'b', 'points': ['p']}, {'lesson': 'a', 'points': ['p']}]
    library = [poster_doc('a-old', 'a', 1), poster_doc('a-new', 'a', 5), poster_doc('b1', 'b', 2),
               poster_doc('bad', 'b', 9, ok=False), poster_doc('c1', 'c', 3)]
    assert [p['_key'] for p in wall.shelf(library, ranked)] == ['b1', 'a-new', 'c1']
    assert wall.current(library, ranked, 4)['_key'] == 'a-new'
    assert wall.current([], ranked, 4) is None


def test_to_make_picks_the_weakest_lesson_without_a_fresh_poster():
    now = 100 * DAY
    ranked = [{'lesson': 'a', 'points': ['a1', 'a2']}, {'lesson': 'b', 'points': ['b1']}]
    assert wall.to_make(ranked, [], now, ('v',))['lesson'] == 'a'
    fresh_a = poster_doc('a', 'a', now - DAY, points=['a1'])
    assert wall.to_make(ranked, [fresh_a], now, ('v',))['lesson'] == 'b'
    assert wall.to_make(ranked, [poster_doc('a', 'a', now - 8 * DAY, points=['a1'])], now, ('v',))['lesson'] == 'a'
    assert wall.to_make(ranked, [poster_doc('a', 'a', now - DAY, points=['zz'])], now, ('v',))['lesson'] == 'a'  # moved on
    assert wall.to_make(ranked, [poster_doc('a', 'a', now - DAY, points=['a1'], version='old')], now, ('v',))['lesson'] == 'a'
    failed_a = poster_doc('x', 'a', now - 3600, ok=False)
    assert wall.to_make(ranked, [failed_a], now, ('v',))['lesson'] == 'b'   # a failing lesson waits its turn
    assert wall.to_make(ranked, [fresh_a, poster_doc('b', 'b', now - DAY, points=['b1'])], now, ('v',)) is None
    assert wall.to_make(ranked, [poster_doc('a', 'a', now - DAY, points=['a1'], version='old')], now, ('old', 'v'))['lesson'] == 'b'


def test_stalest_picks_the_lesson_with_the_oldest_poster():
    ranked = [{'lesson': 'a'}, {'lesson': 'b'}, {'lesson': 'c'}]
    library = [poster_doc('a', 'a', 5), poster_doc('b', 'b', 2), poster_doc('c', 'c', 9), poster_doc('x', 'c', 1, ok=False)]
    assert wall.stalest(ranked, library)['lesson'] == 'b'
    assert wall.stalest(ranked, library[:1])['lesson'] == 'b'      # none at all comes first, weakest first
    assert wall.stalest([], library) is None


def test_fit_image_fills_the_screen_without_cropping():
    from PIL import Image
    import io
    buf = io.BytesIO()
    img = Image.new('RGB', (90, 160), '#3366ff')
    img.paste(Image.new('RGB', (90, 10), '#ff3333'), (0, 0))
    img.save(buf, 'JPEG')
    out = Image.open(io.BytesIO(wall.fit_image(buf.getvalue(), 300, 650)))
    assert out.size == (300, 650)
    r, g, b = out.getpixel((150, 5))    # the poster starts at the very top
    assert r > 200 and b < 100
    r, g, b = out.getpixel((150, 640))  # the padding below continues the poster's own edge
    assert b > 200 and r < 100


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


def test_render_card_shows_every_idea():
    card = {'title': 'Caching', 'ideas': ['one idea', 'another idea'], 'colour': wall.COLOURS['mechanism']}
    png = wall.render_card(card, 600, 1200, 0.3)
    assert png[:8] == b'\x89PNG\r\n\x1a\n' and png != wall.render_card({**card, 'ideas': []}, 600, 1200, 0.3)


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
    r = client.get('/api/wall/poster.png', params={'w': 400, 'h': 800})
    assert r.status_code == 200 and r.headers['content-type'] == 'image/png' and r.headers['cache-control'] == 'no-store'
    assert client.get('/api/wall/now').json() == {'poster': None, 'card': None}   # nothing covered yet
    assert client.post('/api/wall/posters').status_code == 503                    # no model: nothing is made
    assert client.post('/api/wall/poster.png').status_code == 503
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
