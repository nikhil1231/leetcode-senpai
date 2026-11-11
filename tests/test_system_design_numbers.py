"""Numbers drill: forgiving parsing across units, banded grading, an endless queue where misses return sooner."""
import math

import pytest
from fastapi.testclient import TestClient

import itertools

from server import auth, main, numbers_derived as derived, system_design_numbers as nd
from tests.fake_store import FakeStore


def test_units_of_one_kind_are_interchangeable_and_typed_units_win():
    assert nd.parse('1000', 'size', 'MB') == nd.parse('1 GB', 'size', 'bytes') == (1e9, 1e9)
    assert nd.parse('1000MB', 'size', 'TB') == (1e9, 1e9)
    assert nd.parse('1 Gbps', 'bandwidth', 'MB/s') == (125e6, 125e6)
    assert nd.parse('40 min', 'time', 's') == (2400, 2400)
    assert nd.parse('1.5k', 'rate', 'per second') == (1500, 1500)
    assert nd.parse('100k ops/s', 'rate', '') == (1e5, 1e5)
    assert nd.parse('2.5M', 'count', '') == (2.5e6, 2.5e6)
    assert nd.parse('10^5', 'count', '') == nd.parse('1e5', 'count', '') == nd.parse('10⁵', 'count', '') == (1e5, 1e5)
    assert nd.parse('2.5 × 10⁶', 'count', '') == (2.5e6, 2.5e6)
    assert nd.parse('20-100 µs', 'time', 'ms') == pytest.approx((2e-5, 1e-4))
    for bad, kind in [('abc', 'count'), ('5 parsecs', 'time'), ('', 'size')]:
        with pytest.raises(nd.UnitError):
            nd.parse(bad, kind, 's' if kind == 'time' else '')


def test_bands_forgive_2x_and_ranges_then_grade_by_how_far_out():
    ans = nd.QUESTIONS['lat-mem']['answer']          # 100 ns
    band = lambda text, unit: nd.band(nd.ratio(*nd.parse(text, 'time', unit), ans))
    assert band('100', 'ns') == 'exact' and band('0.1', 'µs') == 'exact'
    assert band('180', 'ns') == 'close' and band('60', 'ns') == 'close'
    assert band('500', 'ns') == 'off' and band('5', 'µs') == 'far' and band('1', 'ms') == 'wild'
    rng = nd.QUESTIONS['lat-ssd-random']['answer']   # 20 to 100 µs
    assert nd.ratio(*nd.parse('50 µs', 'time', ''), rng) == 1.0
    assert nd.band(nd.ratio(*nd.parse('150 µs', 'time', ''), rng)) == 'close'
    assert nd.ratio(0, 0, ans) == math.inf


def test_every_authored_answer_parses_and_shows_its_unit():
    assert len(nd.QUESTIONS) >= 100
    for q in nd.QUESTIONS.values():
        lo, hi = q['answer']
        assert 0 < lo <= hi and q['why'] and q['prompt'].endswith('?')
        assert nd.band(nd.ratio(*nd.parse(q['shown'].replace(' to ', '-'), q['kind'], nd.DEFAULT[q['kind']]), q['answer'])) == 'exact', q['id']


def test_misses_come_back_sooner_the_further_out_they_were():
    gaps = {b: nd.schedule({}, b, 10)['due'] - 10 for b in ('exact', 'close', 'off', 'far', 'wild')}
    assert gaps['wild'] < gaps['far'] < gaps['off'] < gaps['close'] < gaps['exact']
    card = {}
    for turn in range(1, 4):
        card = nd.schedule(card, 'exact', turn)
    assert card['streak'] == 4 and card['due'] - 3 > gaps['exact']
    assert nd.schedule(card, 'far', 4)['streak'] == 0


def test_pick_prefers_overdue_then_new_and_never_repeats():
    cards = {'lat-l1': {'due': 3}, 'lat-mem': {'due': 1}}
    assert nd.pick(cards, 5, None, 1) == 'lat-mem'
    assert nd.pick(cards, 5, 'lat-mem', 1) == 'lat-l1'
    assert nd.pick(cards, 0, None, 1) not in cards
    full = {q: {'due': 100 + i} for i, q in enumerate(nd.QUESTIONS)}
    first = next(iter(nd.QUESTIONS))
    assert nd.pick(full, 5, None, 1) == first and nd.pick(full, 5, first, 1) != first


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    monkeypatch.setattr(nd, 'get_store', lambda uid: store)
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_the_queue_is_endless_and_keeps_a_window_of_recent_answers(client):
    state = client.get('/api/system-design/numbers').json()
    assert client.get('/api/system-design/numbers').json()['question'] == state['question']
    assert 'answer' not in state['question'] and state['question']['unit'] in state['question']['units']
    first = state['question']['id']
    lo, _ = nd.QUESTIONS[first]['answer']
    res = client.post('/api/system-design/numbers/answer', json={'question_id': first, 'value': repr(lo * 1000), 'unit': nd.UNITS[nd.QUESTIONS[first]['kind']][0][0]}).json()
    assert res['result']['correct'] is False and res['result']['band'] in ('far', 'wild', 'off')
    assert res['question']['id'] != first and res['log'][-1]['q'] == first
    for _ in range(30):
        q = res['question']
        res = client.post('/api/system-design/numbers/answer', json={'question_id': q['id'], 'skip': True}).json()
    assert len(res['log']) == nd.WINDOW and res['answered'] == 31
    assert first in [a['q'] for a in res['log']]   # the miss came back within the window
    bad = client.post('/api/system-design/numbers/answer', json={'question_id': res['question']['id'], 'value': 'lots', 'unit': ''})
    assert bad.status_code == 422


def test_a_typed_unit_beats_the_dropdown_through_the_api(client):
    res = client.post('/api/system-design/numbers/answer', json={'question_id': 'lat-100km', 'value': '300ms', 'unit': 's'})
    assert res.status_code == 200
    assert res.json()['result']['given'] == '300ms'


def test_new_questions_keep_coming_while_misses_pile_up():
    cards = {q: {'due': 0} for q in list(nd.QUESTIONS)[:10]}
    picks = [nd.pick(cards, turn, None, 1) for turn in range(10, 20)]
    assert sum(p not in cards for p in picks) == 5
    assert nd.schedule({}, 'exact', 1)['due'] - 1 == nd.RIGHT_GAPS[1]   # known cold on first sight


def test_every_derived_question_checks_against_its_own_answer():
    n = 0
    for name, t in derived.TEMPLATES.items():
        for combo in itertools.product(*t['options']):
            q = derived.build(':'.join(['gen', name, *combo]))
            if not q:
                continue
            n += 1
            lo, hi = q['answer']
            assert 0 < lo <= hi and q['prompt'].endswith('?') and q['why'], q['id']
            assert q['parts'] and all(p in nd.QUESTIONS for p in q['parts']), q['id']
            assert nd.band(nd.ratio(*nd.parse(q['shown'], q['kind'], nd.DEFAULT[q['kind']]), q['answer'])) == 'exact', q['id']
    assert n > 500
    assert derived.build('gen:span:7:months:seconds') is None and derived.build('gen:nope') is None


def test_derived_answers_follow_the_base_numbers():
    q = derived.build('gen:span:6:months:seconds')
    assert q['answer'] == pytest.approx((6 * 30 * 86400, 6 * 365 / 12 * 86400))
    q = derived.build('gen:remote:ssd:dc')     # random SSD read on a machine in the same datacentre
    assert q['answer'] == pytest.approx((0.5e-3 + 20e-6, 0.5e-3 + 100e-6)) and set(q['parts']) == {'lat-dc-rtt', 'lat-ssd-random'}
    assert nd.band(nd.ratio(*nd.parse('0.6 ms', 'time', ''), q['answer'])) == 'exact'


def test_a_derived_miss_nudges_its_base_cards_lightly():
    card = {'due': 100, 'streak': 3}
    after = derived.nudge(card, 'wild', 10)
    assert after['streak'] == 2 and after['due'] == 10 + 2 * nd.WRONG_GAP['wild']
    assert nd.schedule(card, 'wild', 10)['due'] < after['due']   # lighter than a direct miss
    assert derived.nudge({'due': 5, 'streak': 0}, 'off', 10)['due'] == 5
    assert derived.nudge(None, 'off', 10) is None


def test_derived_mode_through_the_api(client):
    base = client.get('/api/system-design/numbers').json()
    state = client.get('/api/system-design/numbers?mode=derived').json()
    q = state['question']
    assert q['derived'] and q['id'].startswith('gen:') and state['mode'] == 'derived'
    assert client.get('/api/system-design/numbers?mode=derived').json()['question'] == q
    built = derived.build(q['id'])
    for part in built['parts']:
        client.post('/api/system-design/numbers/answer', json={'question_id': part, 'skip': True})
    lo, _ = built['answer']
    res = client.post('/api/system-design/numbers/answer', json={'question_id': q['id'], 'value': repr(lo * 1e4), 'unit': nd.UNITS[q['kind']][0][0]}).json()
    assert res['result']['correct'] is False and res['result']['nudged'] >= 1 and res['pending'] == 1
    assert res['question']['derived'] and res['answered'] == 1 and res['log'][-1]['q'] == q['id']
    assert client.get('/api/system-design/numbers').json()['answered'] == base['answered'] + len(set(built['parts']))
    assert client.post('/api/system-design/numbers/answer', json={'question_id': 'gen:span:7:x:y', 'skip': True}).status_code == 404
