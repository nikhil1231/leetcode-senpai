"""The phone feed: the deck it deals (pure) and the round trip of a result."""
import random

import pytest
from fastapi.testclient import TestClient

from server import feed, main
from server.knowledge_base import api, catalog as kcat, model as kmodel
from tests.fake_store import FakeStore

DAY = 86400
T0 = 1_762_000_000
MISS = 'sd.cache-aside.db-load-is-miss-rate'
OTHER = 'sd.cache-aside.delete-beats-set'


def ans(point, at, clean=True):
    return {'point': point, 'at': at, 'kind': 'answer', 'clean': clean, 'depth': 'recall', 'strength': 'hard', 'blame': 'full'}


def gap(point, at):
    return {'_key': 'telegram:card-1', 'point': point, 'status': 'open', 'kind': 'gap', 'created_at': at,
            'text': 'the miss rate sets the load', 'ask': 'What sets the database load?'}


def test_deck_deals_distinct_cards_with_gaps_first_and_asks_only_the_missing_piece():
    c = kcat.CATALOG
    states, seen = kmodel.replay([ans(MISS, T0 - 2 * DAY, clean=False), ans(OTHER, T0 - 3 * DAY)])
    cards = feed.deck(c, states, seen, [gap(MISS, T0 - DAY)], T0, 5, random.Random(0))
    assert len(cards) == 5 and len({x['point'] for x in cards}) == 5
    first = cards[0]
    assert (first['point'], first['reason'], first['ask']) == (MISS, 'gap', 'What sets the database load?')
    assert first['focus'] == 'the miss rate sets the load' and first['gap'] == 'telegram:card-1'
    assert first['claim'] == c['points'][MISS]['claim'] and first['speaker'] and first['tag']
    assert all(x['ask'] == c['points'][x['point']]['prompt'] and not x['gap'] for x in cards[1:])
    assert MISS not in [x['point'] for x in feed.deck(c, states, seen, [], T0, 3, random.Random(0), exclude=[MISS])]


def test_deck_is_empty_only_when_there_is_nothing_left():
    c = {**kcat.CATALOG, 'points': {}}
    assert feed.deck(c, {}, {}, [], T0, 3) == []


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('me')
    monkeypatch.setattr(api, 'get_store', lambda uid: store)
    main.app.dependency_overrides[api.caller] = lambda: {'uid': 'me', 'source': None}
    c = TestClient(main.app)
    c.store = store
    yield c
    main.app.dependency_overrides.clear()


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def test_results_record_answers_and_exposures_once_and_knowing_a_gap_closes_it(client):
    store = client.store
    store.put_knowledge('drip', 'state', {'pending': 4})
    store.put_knowledge('drip', 'card-4', {'n': 4, 'point': MISS, 'status': 'pending'})
    data = ok(client.get('/api/feed', params={'n': 4}))
    assert len(data['cards']) == 4 and MISS not in [x['point'] for x in data['cards']]  # the drip is waiting on it
    assert data['company']['label']
    api.open_gap(store, 'telegram', 'card-1', OTHER, 'deleting avoids a race', 'Why delete, not set?', 'quote', T0)
    g = store.list_knowledge('knowledge_misconceptions')[0]['_key']
    assert ok(client.post('/api/feed/result', json={'key': 'f-a-1-0', 'point': OTHER, 'outcome': 'knew', 'gap': g})) == \
        {'recorded': True, 'closed_gaps': [g]}
    assert ok(client.post('/api/feed/result', json={'key': 'f-a-1-0', 'point': OTHER, 'outcome': 'knew'}))['recorded'] is False
    ok(client.post('/api/feed/result', json={'key': 'f-a-1-1-seen', 'point': MISS, 'outcome': 'seen'}))
    ok(client.post('/api/feed/result', json={'key': 'f-a-1-2', 'point': MISS, 'outcome': 'missed'}))
    events = sorted(store.list_knowledge('knowledge_events'), key=lambda e: e['_key'])
    assert [(e['source'], e['kind'], e.get('clean'), e.get('strength')) for e in events] == [
        ('feed', 'answer', True, 'soft'), ('feed', 'exposure', None, None), ('feed', 'answer', False, 'soft')]
    assert store.list_knowledge('knowledge_misconceptions')[0]['status'] == 'resolved'
    assert client.post('/api/feed/result', json={'key': 'k', 'point': 'sd.nope.x', 'outcome': 'knew'}).status_code == 404
    assert client.post('/api/feed/result', json={'key': 'bad key!', 'point': MISS, 'outcome': 'knew'}).status_code == 422


def test_the_page_is_served(client):
    r = client.get('/feed')
    assert r.status_code == 200 and '/api/feed' in r.text and r.headers['cache-control'] == 'no-cache'


def ev(point, at, clean):
    return {'point': point, 'at': at, 'kind': 'answer', 'clean': clean}


def test_tonight_and_morning_sets():
    today, yesterday = T0, T0 - DAY
    events = [ev(MISS, yesterday + 100, False), ev(OTHER, yesterday + 200, False), ev('x', yesterday + 300, True),
              ev(OTHER, today + 50, True), ev('y', today + 60, False), ev('z', today + 70, False),
              {'point': 'w', 'at': today + 80, 'kind': 'exposure'}]
    assert feed.misses(events, today, today + DAY) == ['z', 'y']
    assert feed.morning(events, yesterday, today) == [MISS]  # OTHER was answered again this morning
    assert [feed.choose_set('auto', h) for h in (7, 13, 21)] == ['morning', 'due', 'tonight']
    assert feed.choose_set('due', 7) == 'due'
    c = kcat.CATALOG
    states, seen = kmodel.replay([])
    cards = feed.deck(c, states, seen, [], T0, 3, random.Random(0), first=[OTHER, MISS], first_reason='tonight')
    assert [x['point'] for x in cards[:2]] == [OTHER, MISS] and cards[0]['tag'].startswith('Missed today')
    assert len(cards) == 3 and cards[2]['reason'] != 'tonight'


def test_tonight_text_and_set_param(client):
    store = client.store
    assert client.get('/api/feed/tonight.txt').text == 'Nothing missed today.\n'
    import time as _t
    api.write_events(store, 'telegram', [{'key': 'k', 'points': [MISS], 'clean': False}], _t.time())
    text = client.get('/api/feed/tonight.txt').text
    assert text.startswith('- ') and kcat.CATALOG['points'][MISS]['claim'] in text
    d = ok(client.get('/api/feed', params={'set': 'tonight', 'n': 2}))
    assert d['set'] == 'tonight' and d['first'] == 1 and d['cards'][0]['point'] == MISS
