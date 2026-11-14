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
    assert out[0]['pool'] == ['a1', 'a2'] and wall.struggles(views, per=1, pool=1)[0]['pool'] == ['a1']
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


def test_shelf_deals_every_recent_poster_one_lesson_at_a_time():
    ranked = [{'lesson': 'b', 'points': ['p']}, {'lesson': 'a', 'points': ['p']}]
    library = [poster_doc('a-old', 'a', 1), poster_doc('a-new', 'a', 5), poster_doc('b1', 'b', 2),
               poster_doc('bad', 'b', 9, ok=False), poster_doc('c1', 'c', 3)]
    assert [p['_key'] for p in wall.shelf(library, ranked)] == ['b1', 'a-new', 'a-old']   # c is no longer weak
    assert [p['_key'] for p in wall.shelf(library, ranked, now=1000, days=1)] == ['b1', 'a-new', 'a-old']
    assert [p['_key'] for p in wall.shelf(library, ranked, now=DAY + 4, days=1)] == ['a-new', 'c1', 'b1']   # old ones padded in
    assert wall.shelf([], ranked) == []


def test_current_rotates_the_shelf_and_gives_new_posters_every_other_slot():
    ranked = [{'lesson': 'b', 'points': ['p']}, {'lesson': 'a', 'points': ['p']}]
    library = [poster_doc('a-old', 'a', 1), poster_doc('a-new', 'a', 5), poster_doc('b1', 'b', 2),
               poster_doc('bad', 'b', 9, ok=False), poster_doc('c1', 'c', 3)]
    assert wall.current(library, ranked, 4)['_key'] == 'a-new'
    assert wall.current([], ranked, 4) is None
    hand = {**poster_doc('hand', 'c', 8), 'pinned_at': 100}
    assert wall.current(library + [hand], ranked, 4, now=150, hold=60)['_key'] == 'hand'     # made by hand: up now
    assert wall.current(library + [hand], ranked, 4, now=200, hold=60)['_key'] == 'a-new'    # then the rotation again
    assert wall.current(library + [{**hand, 'ok': False}], ranked, 4, now=150, hold=60)['_key'] == 'a-new'
    # a new poster is up every other slot, the rest of the shelf in between, and then the shelf alone
    assert [wall.current(library, ranked, n, now=7, fresh=3)['_key'] for n in range(6)] == \
        ['a-new', 'b1', 'a-new', 'a-old', 'a-new', 'b1']
    assert wall.current(library, ranked, 0, now=100, fresh=3)['_key'] == 'b1'
    only = [poster_doc('x', 'a', 5)]
    assert [wall.current(only, ranked, n, now=7, fresh=3)['_key'] for n in range(3)] == ['x'] * 3


def test_rotate_picks_the_weak_points_longest_absent_from_posters():
    lesson = {'lesson': 'a', 'points': ['a1', 'a2', 'a3'], 'pool': ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']}
    assert wall.rotate(lesson, [])['points'] == ['a1', 'a2', 'a3']                      # nothing shown yet: the weakest
    library = [poster_doc('x', 'a', 5, points=['a1', 'a2', 'a3'])]
    assert wall.rotate(lesson, library)['points'] == ['a4', 'a5', 'a6']                 # then the ideas it has not shown
    library += [poster_doc('y', 'a', 9, points=['a4', 'a5', 'a6']), poster_doc('z', 'a', 12, ok=False, points=['a1'])]
    assert wall.rotate(lesson, library)['points'] == ['a1', 'a2', 'a3']                 # then the longest ago; failed ones never showed
    assert wall.rotate({'lesson': 'a', 'points': ['a1', 'a2']}, library)['points'] == ['a1', 'a2']   # no pool: as given
    assert wall.rotate(lesson, [poster_doc('o', 'b', 5, points=['a1'])])['points'] == ['a1', 'a2', 'a3']   # other lessons' posters


def test_to_make_gives_the_next_poster_to_a_lesson_with_ideas_it_has_not_shown():
    now = 100 * DAY
    ranked = [{'lesson': 'a', 'points': ['a1', 'a2'], 'pool': ['a1', 'a2', 'a3', 'a4']},
              {'lesson': 'b', 'points': ['b1'], 'pool': ['b1']}]
    assert wall.to_make(ranked, [], now, ('v',))['lesson'] == 'a'
    # a poster under a day old holds the lesson back; another lesson goes next
    fresh_a = poster_doc('a', 'a', now - 3600, points=['a1', 'a2'])
    assert wall.to_make(ranked, [fresh_a], now, ('v',))['lesson'] == 'b'
    # a day on, the lesson has ideas it has not shown, so it gets another poster ahead of b (which has none new)
    old_a = poster_doc('a', 'a', now - 2 * DAY, points=['a1', 'a2'])
    assert wall.to_make(ranked, [old_a, poster_doc('b', 'b', now - 2 * DAY, points=['b1'])], now, ('v',))['lesson'] == 'a'
    # when nothing has new ideas, the lesson with the oldest poster waits a week and then goes again
    done = [poster_doc('a1', 'a', now - 3 * DAY, points=['a1', 'a2']), poster_doc('a2', 'a', now - 2 * DAY, points=['a3', 'a4']),
            poster_doc('b', 'b', now - 5 * DAY, points=['b1'])]
    assert wall.to_make(ranked, done, now, ('v',)) is None
    done[2] = poster_doc('b', 'b', now - 8 * DAY, points=['b1'])
    assert wall.to_make(ranked, done[:2] + done[2:], now, ('v',))['lesson'] == 'b'
    # ideas shown more than two weeks ago count as new again
    assert wall.to_make(ranked[:1], [poster_doc('a', 'a', now - 20 * DAY, points=['a1', 'a2', 'a3', 'a4'])], now, ('v',))['lesson'] == 'a'
    # posters of an older prompt version do not count; a failed try holds the lesson back for retry_hours
    assert wall.to_make(ranked, [poster_doc('a', 'a', now - 3600, points=['a1'], version='old')], now, ('v',))['lesson'] == 'a'
    failed_a = poster_doc('x', 'a', now - 3600, ok=False)
    assert wall.to_make(ranked, [failed_a], now, ('v',))['lesson'] == 'b'
    assert wall.to_make(ranked, [poster_doc('a', 'a', now - 3600, points=['a1'], version='old')], now, ('old', 'v'))['lesson'] == 'b'
    assert wall.to_make([], [], now, ('v',)) is None


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
    img.paste(Image.new('RGB', (90, 10), '#ff3333'), (0, 0))       # a red top edge
    img.paste(Image.new('RGB', (90, 10), '#33cc33'), (0, 150))     # a green bottom edge
    img.save(buf, 'JPEG')
    out = Image.open(io.BytesIO(wall.fit_image(buf.getvalue(), 300, 650)))
    assert out.size == (300, 650)
    colour = lambda y: max(zip(out.getpixel((150, y)), 'rgb'))[1]
    # 300x533 in 650, a little above centre: 58 - 21 = 37px above continue its red top edge, the rest below its green one
    assert [colour(y) for y in (5, 30, 100, 400, 580, 645)] == ['r', 'r', 'b', 'b', 'g', 'g']
    assert colour(60) == 'r' and colour(80) == 'b'      # its red band (33px) ends at 70: the poster starts at 37


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
