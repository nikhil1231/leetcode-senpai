"""Knowledge base: catalog integrity, the pure memory model and selection, and the HTTP round trips."""
import pytest
import yaml
from fastapi.testclient import TestClient

from server import config, main
from server.knowledge_base import api, catalog as cat, model, sources
from tests.fake_store import FakeStore

DAY = 86400
T0 = 1_760_000_000
A, B, C, D = (f'sd.cache-aside.{s}' for s in ('miss-rate', 'read-path', 'miss-rate-again', 'eviction'))


def write_points(folder, points, items=None, lesson='cache-aside'):
    path = folder / 'system-design'
    path.mkdir(parents=True, exist_ok=True)
    (path / f'{lesson}.yaml').write_text(yaml.safe_dump(
        {'section': 'system-design', 'lesson': lesson, 'source_hash': 'x', 'points': points, 'items': items or {}}))


def pt(pid, kind='fact', **extra):
    return {'id': pid, 'subtopic': 'Introduction', 'kind': kind, 'claim': f'claim {pid}', 'prompt': f'ask {pid}', **extra}


@pytest.fixture
def small(tmp_path):
    write_points(tmp_path, [pt(A, 'principle'), pt(B, 'mechanism', requires=[A]), pt(C, same_as=A), pt(D, 'tradeoff')],
                 {'cache-aside-fire-1-v2': [B, A], 'cache-aside-check-1-v2': [C]})
    return cat.load(tmp_path)


def ans(point, at, clean=True, **extra):
    return {'point': point, 'at': at, 'kind': 'answer', 'clean': clean, 'depth': 'recall', 'strength': 'hard',
            'blame': 'full', **extra}


# ---- catalog ---------------------------------------------------------------------------

def test_real_catalog_is_consistent():
    c = cat.CATALOG
    assert not c['problems']
    for p in c['points'].values():
        assert p['kind'] in cat.KINDS and p['claim'] and p['prompt']
        assert all(r in c['points'] and r not in c['aliases'] for r in p['requires'])
    for item, pids in c['items'].items():
        assert item in c['item_info'] and all(p in c['points'] and p not in c['aliases'] for p in pids)


def test_aliases_resolve_and_links_invert(small):
    assert small['aliases'] == {C: A}
    assert small['items']['cache-aside-check-1-v2'] == [A]
    assert small['used_by'] == {A: [B]}
    assert [p['id'] for p in cat.active(small)] == [A, B, D]
    assert cat.canonical(small, C) == A and cat.canonical(small, 'sd.nope.x') is None
    assert 'system-design/cache-aside' in small['stale']
    assert 'cache-aside-check-2-v2' in small['unmapped']['system-design']


@pytest.mark.parametrize('points,items,message', [
    ([pt(A), pt(A)], {}, 'duplicate'),
    ([pt(A, requires=['sd.cache-aside.ghost'])], {}, 'requires unknown'),
    ([pt(A, same_as=B), pt(B, same_as=D), pt(D)], {}, 'itself an alias'),
    ([pt(A, kind='vibe')], {}, 'unknown kind'),
    ([pt('sd.other-lesson.x')], {}, 'must be'),
    ([pt(A)], {'cache-aside-fire-1-v2': ['sd.cache-aside.ghost']}, 'unknown point'),
    ([pt(A)], {'cache-aside-fire-1-v2': []}, 'must map'),
])
def test_inconsistent_files_fail_loudly(tmp_path, points, items, message):
    write_points(tmp_path, points, items)
    with pytest.raises(cat.CatalogError, match=message):
        cat.load(tmp_path)


def test_unknown_items_and_files_are_reported_not_fatal(tmp_path):
    write_points(tmp_path, [pt(A)], {'cache-aside-fire-99-v2': [A]})
    write_points(tmp_path, [], lesson='not-a-lesson')
    c = cat.load(tmp_path)
    assert any('cache-aside-fire-99-v2' in p for p in c['problems'])
    assert any('not-a-lesson' in p for p in c['problems'])


# ---- sources ---------------------------------------------------------------------------

def test_ledger_answers_reach_every_point_an_item_tests(small):
    records = {'system-design': [
        {'id': 'q1', 'kind': 'quickfire', 'lesson_id': 'cache-aside', 'question_id': 'cache-aside-fire-1-v2',
         'result': {'correct': False, 'answered_at': T0}},
        {'id': 'q2', 'kind': 'quickfire', 'lesson_id': 'cache-aside', 'question_id': 'cache-aside-fire-2-v2',
         'result': {'correct': True, 'answered_at': T0}},  # unmapped: no points, no events
    ]}
    evs = sources.derived(small, records)
    assert [(e['point'], e['blame'], e['clean']) for e in evs] == [(B, 'full', False), (A, 'shared', False)]
    assert all(e['depth'] == 'recall' and e['strength'] == 'hard' and e['ref'] == 'cache-aside-fire-1-v2' for e in evs)


def test_item_depth_and_strength_follow_the_format():
    assert sources.item_depth({'kind': 'quickfire', 'format': 'choice'}) == 'recognise'
    assert sources.item_depth({'kind': 'quickfire', 'format': 'numeric'}) == 'recall'
    assert sources.item_depth({'kind': 'predict'}) == 'apply'
    assert sources.item_depth({'kind': 'recall'}) == 'explain' and 'recall' in sources.SOFT_ITEMS


def test_direct_events_resolve_aliases_and_respect_named_failures(small):
    docs = [{'_key': 'tg:1', 'kind': 'answer', 'points': [C, B, 'sd.gone.x'], 'clean': False, 'failed': [B], 'at': T0,
             'source': 'telegram', 'depth': 'explain', 'strength': 'soft'},
            {'_key': 'wall:1', 'kind': 'exposure', 'points': [D, D], 'at': T0, 'source': 'wallpaper'}]
    evs = sources.direct(small, docs)
    assert [(e['point'], e['kind']) for e in evs] == [(B, 'answer'), (D, 'exposure')]
    assert evs[0]['strength'] == 'soft' and evs[0]['blame'] == 'full'


# ---- model -----------------------------------------------------------------------------

def test_shared_miss_weakens_but_does_not_reset():
    full, _ = model.replay([ans(A, T0), ans(A, T0 + 3 * DAY), ans(A, T0 + 4 * DAY, clean=False)])
    shared, _ = model.replay([ans(A, T0), ans(A, T0 + 3 * DAY), ans(A, T0 + 4 * DAY, clean=False, blame='shared')])
    before, _ = model.replay([ans(A, T0), ans(A, T0 + 3 * DAY)])
    assert full[A]['stability'] < shared[A]['stability'] < before[A]['stability']
    assert not full[A]['last_clean'] and shared[A]['last_clean']


def test_exposures_never_change_memory():
    states, seen = model.replay([ans(A, T0), {'point': A, 'at': T0 + DAY, 'kind': 'exposure'},
                                 {'point': B, 'at': T0 + DAY, 'kind': 'exposure'}])
    assert set(states) == {A} and seen[A]['count'] == 1 and seen[B] == {'count': 1, 'last_at': T0 + DAY}


def test_depth_is_the_highest_level_whose_latest_answer_was_clean():
    states, _ = model.replay([ans(A, T0, depth='recognise'), ans(A, T0 + DAY, depth='apply'),
                              ans(A, T0 + 2 * DAY, depth='apply', clean=False), ans(A, T0 + 3 * DAY, depth='recall')])
    assert model.depth(states[A]) == 'recall'
    assert states[A]['depths']['apply']['clean'] is False


def test_soft_evidence_holds_a_point_but_leaves_it_unconfirmed():
    soft, _ = model.replay([ans(A, T0, strength='soft')])
    assert soft[A]['last_clean'] and not model.confirmed(soft[A])
    hard, _ = model.replay([ans(A, T0, strength='soft'), ans(A, T0 + DAY)])
    assert model.confirmed(hard[A])
    relapsed, _ = model.replay([ans(A, T0), ans(A, T0 + DAY, clean=False), ans(A, T0 + 2 * DAY, strength='soft')])
    assert relapsed[A]['last_clean'] and not model.confirmed(relapsed[A])


def test_summary_rolls_up_section_category_lesson_subtopic(small):
    states, seen = model.replay([ans(A, T0), ans(B, T0, clean=False)])
    s = model.summary(small, states, seen, [{'point': D, 'status': 'open'}], T0)
    assert s['total'] == 3 and s['counts']['shaky'] == 1 and s['counts']['unseen'] == 1 and s['misconceptions'] == 1
    lesson = s['sections'][0]['categories'][0]['lessons'][0]
    assert lesson['id'] == 'cache-aside' and lesson['subtopics'][0]['title'] == 'Introduction'
    assert lesson['subtopics'][0]['total'] == 3


def test_pick_orders_by_need_and_respects_mode(small):
    now = T0 + 60 * DAY
    states, seen = model.replay([ans(A, T0), ans(B, T0 + 59 * DAY, clean=False)])
    mis = [{'point': D, 'status': 'open'}]
    review = model.pick(small, states, seen, mis, now, mode='review')
    assert [(x['point']['id'], x['reason']) for x in review] == [(D, 'misconception'), (B, 'shaky'), (A, 'fading')]
    learn = model.pick(small, states, seen, [], now, mode='learn')
    assert [x['point']['id'] for x in learn] == [B, A, D]
    assert [x['reason'] for x in learn] == ['shaky', 'fading', 'new']
    assert model.pick(small, states, seen, [], now, kinds={'tradeoff'}, mode='any')[0]['point']['id'] == D
    cooled = model.pick(small, states, seen, mis, now, cooldown=2 * DAY)
    assert B not in [x['point']['id'] for x in cooled]


def test_new_points_wait_for_their_prerequisites(small):
    states, seen = model.replay([])
    learn = model.pick(small, states, seen, [], T0, mode='learn')
    assert [x['point']['id'] for x in learn] == [A, D]
    assert [x['point']['id'] for x in model.pick(small, states, seen, [], T0, mode='any')] == [A, D, B]


# ---- HTTP ------------------------------------------------------------------------------

@pytest.fixture
def client(monkeypatch, small):
    store = FakeStore('alice')
    monkeypatch.setattr(api, 'get_store', lambda uid: store)
    monkeypatch.setattr(cat, 'CATALOG', small)
    main.app.dependency_overrides[api.caller] = lambda: {'uid': 'alice', 'source': None}
    c = TestClient(main.app)
    c.store = store
    yield c
    main.app.dependency_overrides.clear()


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def test_events_record_once_and_update_state(client):
    body = {'source': 'tutor', 'events': [{'key': 's1-t3', 'points': [B], 'clean': True, 'depth': 'explain',
                                           'strength': 'soft', 'note': 'explained the read path'}]}
    first = ok(client.post('/api/knowledge/events', json=body))
    assert first['recorded'] == 1 and first['points'][0]['id'] == B and first['points'][0]['unconfirmed']
    again = ok(client.post('/api/knowledge/events', json=body))
    assert again['recorded'] == 0 and again['duplicates'] == ['s1-t3']
    stored = client.store.list_knowledge('knowledge_events')
    assert len(stored) == 1 and stored[0]['_key'] == 'tutor:s1-t3' and stored[0]['source'] == 'tutor'
    detail = ok(client.get(f'/api/knowledge/points/{B}'))
    assert detail['history'][0]['source'] == 'tutor' and detail['requires'][0]['id'] == A


def test_ledger_history_counts_without_any_new_records(client):
    client.store.design_records['q1'] = {'id': 'q1', 'kind': 'quickfire', 'lesson_id': 'cache-aside',
                                         'question_id': 'cache-aside-check-1-v2',
                                         'result': {'correct': True, 'answered_at': T0}}
    overview = ok(client.get('/api/knowledge'))
    assert overview['total'] == 3 and overview['evidence'] == {'quickfire': 1}
    detail = ok(client.get(f'/api/knowledge/points/{C}'))  # an alias answers for its canonical point
    assert detail['id'] == A and detail['answers'] == 1 and detail['aliases'] == [C]


def test_bad_events_reject_the_whole_batch(client):
    r = client.post('/api/knowledge/events', json={'events': [
        {'key': 'a', 'points': [A], 'clean': True},
        {'key': 'b', 'points': ['sd.cache-aside.ghost'], 'clean': True},
        {'key': 'c', 'points': [A]},
        {'key': 'd', 'points': [A], 'clean': False, 'failed': [B]},
        {'key': 'e', 'points': [A], 'clean': True, 'at': 1}]})
    assert r.status_code == 422
    assert len(r.json()['detail']) == 4
    assert client.store.list_knowledge('knowledge_events') == []


def test_exposures_are_counted_and_next_offers_what_needs_work(client):
    ok(client.post('/api/knowledge/events', json={'source': 'wallpaper', 'events': [
        {'key': 'w1', 'kind': 'exposure', 'points': [D]}]}))
    ok(client.post('/api/knowledge/events', json={'events': [{'key': 'x', 'points': [A], 'clean': False}]}))
    nxt = ok(client.get('/api/knowledge/next', params={'mode': 'learn'}))['points']
    assert [(p['id'], p['reason']) for p in nxt] == [(A, 'shaky'), (D, 'new')]
    assert nxt[1]['exposures'] == 1
    assert ok(client.get('/api/knowledge/next', params={'cooldown': 3600}))['points'] == []


def test_misconception_lifecycle(client):
    made = ok(client.post('/api/knowledge/misconceptions', json={
        'key': 'm1', 'point': C, 'text': 'thinks a hit rate of 50% halves nothing', 'source': 'tutor'}))
    assert made['point'] == A and made['status'] == 'open' and not made['duplicate']
    assert ok(client.post('/api/knowledge/misconceptions', json={
        'key': 'm1', 'point': C, 'text': 'thinks a hit rate of 50% halves nothing', 'source': 'tutor'}))['duplicate']
    assert ok(client.get('/api/knowledge/next'))['points'][0]['reason'] == 'misconception'
    done = ok(client.patch('/api/knowledge/misconceptions/tutor:m1', json={'status': 'resolved', 'note': 'fixed'}))
    assert done['status'] == 'resolved' and done['resolved_at']
    assert ok(client.get('/api/knowledge/misconceptions', params={'status': 'open'}))['misconceptions'] == []
    assert client.patch('/api/knowledge/misconceptions/tutor:nope', json={'status': 'resolved'}).status_code == 404
    assert client.post('/api/knowledge/misconceptions', json={'key': 'm2', 'point': 'sd.x.y', 'text': 'abc'}).status_code == 404


def test_catalog_and_points_filters(client):
    points = ok(client.get('/api/knowledge/catalog'))['points']
    assert [p['id'] for p in points] == [A, B, D]
    assert points[0]['used_by'] == [B] and points[0]['items'] == ['cache-aside-check-1-v2', 'cache-aside-fire-1-v2']
    assert ok(client.get('/api/knowledge/points', params={'kind': 'tradeoff'}))['total'] == 1
    assert client.get('/api/knowledge/points/sd.nope.x').status_code == 404


def test_source_tokens_pin_the_source(monkeypatch, small):
    store = FakeStore('owner')
    monkeypatch.setattr(api, 'get_store', lambda uid: store if uid == config.ACCESS_UID else None)
    monkeypatch.setattr(cat, 'CATALOG', small)
    monkeypatch.setattr(config, 'KNOWLEDGE_SOURCE_TOKENS', {'telegram': 's3cret'})
    c = TestClient(main.app)
    r = c.post('/api/knowledge/events', headers={'Authorization': 'Bearer s3cret'},
               json={'source': 'spoofed', 'events': [{'key': 'k', 'points': [A], 'clean': True}]})
    assert r.status_code == 200, r.text
    assert store.list_knowledge('knowledge_events')[0]['source'] == 'telegram'
    assert c.get('/api/knowledge').status_code == 401


# ---- generator (pure parts; no model calls) --------------------------------------------

def generator():
    import importlib.util
    import os
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts', 'generate_knowledge_points.py')
    spec = importlib.util.spec_from_file_location('generate_knowledge_points', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_every_lesson_renders_with_all_its_items():
    gen = generator()
    for section in cat.SECTIONS:
        for key in cat.lessons(section):
            text, subtopics, items = gen.render(section, key)
            expected = sorted(i for i, v in cat.items(section).items() if v['lesson'] == key)
            assert items == expected and subtopics[0] == gen.INTRO
            assert all(f'[ITEM {i} ' in text for i in items)


def test_generator_validation_names_every_problem():
    gen = generator()
    got = gen.LessonPoints(points=[
        gen.GenPoint(slug='miss-rate', subtopic='Introduction', kind='fact', claim='c', prompt='p', objectives=[0]),
        gen.GenPoint(slug='miss-rate', subtopic='Nowhere', kind='fact', claim='c', prompt='p', objectives=[9]),
    ], items=[gen.GenItem(item='x:b1', points=['miss-rate', 'ghost']), gen.GenItem(item='stray', points=['miss-rate'])])
    errors = gen.check_points(got, ['Introduction'], ['x:b1', 'x:b2'], 2)
    for needle in ('duplicate slug', 'subtopic', 'objective', 'unknown slug ghost', 'x:b2 is missing', 'stray is not a listed item'):
        assert any(needle in e for e in errors), needle


def test_gaps_are_one_per_point_and_partial_misses_only_weaken(client):
    body = {'key': 'g1', 'point': A, 'text': 'the miss rate sets the load', 'kind': 'gap', 'ask': 'What sets DB load?', 'source': 'tutor'}
    first = ok(client.post('/api/knowledge/misconceptions', json=body))
    again = ok(client.post('/api/knowledge/misconceptions', json={**body, 'key': 'g2', 'ask': 'Which rate sets DB load?'}))
    assert first['kind'] == 'gap' and again['duplicate'] and again['repeats'] == 1 and again['ask'] == 'Which rate sets DB load?'
    assert len(client.store.list_knowledge('knowledge_misconceptions')) == 1
    r = client.post('/api/knowledge/events', json={'events': [{'key': 'p0', 'points': [A], 'clean': True, 'partial': True}]})
    assert r.status_code == 422
    ok(client.post('/api/knowledge/events', json={'events': [
        {'key': 'p1', 'points': [B], 'clean': True}, {'key': 'p3', 'points': [B], 'clean': False, 'partial': True}]}))
    stored = {e['_key']: e for e in client.store.list_knowledge('knowledge_events')}
    assert stored['app:p3']['partial'] is True
    evs = sources.direct(cat.CATALOG, client.store.list_knowledge('knowledge_events'))
    assert sorted(e['blame'] for e in evs if e['point'] == B) == ['full', 'shared']
