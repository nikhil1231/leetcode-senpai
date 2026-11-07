"""Wallpaper posters: the prompts and the pass rule (pure), the cadence, and the make/review/edit
loop and serving with the models faked."""
import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from server import config, llm, main, wall, wall_gen
from server.knowledge_base import api
from tests.fake_store import FakeStore

DAY = 86400
NOW = 1_794_000_000
BRIEF = {'lesson': 'jc', 'title': 'Java concurrency', 'section': 'fundamentals', 'points': ['p1', 'p2'],
         'ideas': [{'point': 'p1', 'claim': 'volatile gives visibility, not atomicity.', 'kind': 'fact', 'status': 'shaky',
                    'pitfall': 'thought volatile made count++ safe'},
                   {'point': 'p2', 'claim': 'Take two locks in a fixed global order.', 'kind': 'procedure', 'status': 'fading'}]}
COPY = {'headline': 'Java concurrency', 'panels': [{'heading': 'Volatile', 'line': 'Visibility, not atomicity.', 'visual': 'an eye'},
                                                   {'heading': 'Lock order', 'line': 'Fixed global order.', 'visual': 'two padlocks'}]}


def review(ok=True, score=9, **kw):
    r = {'text_correct': ok, 'facts_correct': True, 'all_ideas_present': True, 'tasteful': True,
         'diagrams_make_sense': True, 'legible': True, 'score': score, 'issues': [] if ok else ['Panel 1: "atomicty" is misspelled.'],
         'verdict': 'pass' if ok else 'redraw'}
    return {**r, **kw}


def test_prompts_carry_the_claims_and_keep_notes_off_the_poster():
    cp = wall_gen.copy_prompt(BRIEF)
    assert 'volatile gives visibility' in cp and 'thought volatile made count++ safe' in cp and 'without mentioning' in cp
    ip = wall_gen.image_prompt(BRIEF, COPY)
    assert '"Visibility, not atomicity."' in ip and 'Panel 2' in ip and 'thought volatile' not in ip and 'top 6%' not in ip and 'translucent clock' in ip
    fp = wall_gen.fix_prompt(['Panel 1: fix the typo'])
    assert 'Panel 1: fix the typo' in fp and 'Never write these notes' in fp
    rp = wall_gen.review_prompt(BRIEF, COPY)
    assert 'Take two locks' in rp and 'Lock order' in rp


def test_passing_needs_correct_words_facts_and_diagrams():
    assert wall_gen.passed(review())
    assert not wall_gen.passed(review(ok=False, score=9))                       # a typo always fails
    assert not wall_gen.passed(review(diagrams_make_sense=False))
    assert wall_gen.passed(review(legible=False, score=8, verdict='redraw'))    # one small caption, still an 8
    assert not wall_gen.passed(review(legible=False, score=7))
    assert not wall_gen.passed(review(score=6))


def test_cadence_spaces_posters_and_caps_a_day():
    at = lambda *ts: [{'created_at': t} for t in ts]  # noqa: E731
    assert wall_gen.due([], NOW, 4, 3)
    assert not wall_gen.due(at(NOW - 3600), NOW, 4, 3)
    assert wall_gen.due(at(NOW - 5 * 3600), NOW, 4, 3)
    assert not wall_gen.due(at(NOW - 5 * 3600, NOW - 10 * 3600, NOW - 15 * 3600), NOW, 4, 3)
    assert wall_gen.due(at(NOW - 2 * DAY), NOW, 4, 3)


def png(colour='#ff8800', size=(180, 320)):
    buf = io.BytesIO()
    Image.new('RGB', size, colour).save(buf, 'PNG')
    return buf.getvalue()


@pytest.fixture
def models(monkeypatch):
    """Fake models: the image model's calls are recorded; reviews are dealt from `reviews`."""
    calls = {'image': [], 'reviews': [review(ok=False, score=8), review()]}
    monkeypatch.setattr(llm, '_raw_generate', lambda *a, **k: json.dumps(COPY))

    def image(model, prompt, aspect, edit=None):
        calls['image'].append({'prompt': prompt, 'edit': edit is not None})
        return {'image': png(), 'mime': 'image/png', 'model': model, 'usage': {'cost': 0.05}}
    monkeypatch.setattr(llm, '_raw_image', image)
    monkeypatch.setattr(llm, '_raw_look', lambda *a, **k: calls['reviews'].pop(0))
    views = [{'id': p['point'], 'claim': p['claim'], 'kind': p['kind'], 'status': p['status'], 'lesson': 'jc',
              'lesson_title': 'Java concurrency', 'section': 'fundamentals', 'misconceptions': 0, 'unconfirmed': False}
             for p in BRIEF['ideas']]
    monkeypatch.setattr(wall_gen, '_state', lambda store, now: (views, [], wall.struggles(views)))
    return calls


def test_make_edits_a_failed_try_and_keeps_the_passing_one(models):
    store = FakeStore('me')
    p = wall_gen.make(store, NOW)
    assert p['ok'] and p['attempts'] == 2 and p['lesson'] == 'jc' and p['copy'] == COPY and p['cost'] == 0.1
    assert [c['edit'] for c in models['image']] == [False, True]
    assert 'atomicty' in models['image'][1]['prompt']            # the redraw is told what to fix
    stored = Image.open(io.BytesIO(store.get_knowledge(wall_gen.IMAGES, p['_key'])['data']))
    assert stored.format == 'JPEG' and stored.width == wall_gen.WIDTH
    assert wall_gen.make(store, NOW + 60) is None                  # the lesson has a fresh poster now


def test_a_poster_that_never_passes_is_kept_but_never_goes_up(models):
    models['reviews'] = [review(ok=False, score=5), review(ok=False, score=7), review(ok=False, score=6)]
    store = FakeStore('me')
    p = wall_gen.make(store, NOW)
    assert not p['ok'] and p['review']['score'] == 7 and len(models['image']) == 3
    assert wall.current(store.list_knowledge(wall_gen.POSTERS), [{'lesson': 'jc'}], 0) is None


def test_tick_makes_nothing_without_a_model(models, monkeypatch):
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    assert wall_gen.tick(FakeStore('me'), NOW) is None and not models['image']


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('me')
    monkeypatch.setattr(api, 'get_store', lambda uid: store)
    main.app.dependency_overrides[api.caller] = lambda: {'uid': 'me', 'source': None}
    yield TestClient(main.app), store
    main.app.dependency_overrides.clear()


def test_the_phone_gets_the_stored_poster(client, models, monkeypatch):
    c, store = client
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    monkeypatch.setattr(wall, '_views', lambda uid, now: (None, None, None, [], wall_gen._state(None, now)[0]))
    card = c.get('/api/wall/now').json()
    assert card['poster'] is None and card['card']['title'] == 'Java concurrency' and len(card['card']['ideas']) == 2
    made = c.post('/api/wall/posters').json()
    assert made['ok'] and made['image'] == f'/api/wall/posters/{made["id"]}.jpg'
    now = c.get('/api/wall/now').json()
    assert now['poster']['id'] == made['id'] and now['card'] is None
    r = c.get('/api/wall/poster.png', params={'w': 400, 'h': 900})
    assert r.headers['content-type'] == 'image/jpeg' and Image.open(io.BytesIO(r.content)).size == (400, 900)
    assert c.get(made['image']).status_code == 200 and c.get('/api/wall/posters/nope.jpg').status_code == 404
    assert [p['id'] for p in c.get('/api/wall/posters').json()['posters']] == [made['id']]
    models['reviews'].append(review())
    r = c.post('/api/wall/poster.png', params={'w': 400, 'h': 900})       # forced: a new one though none is due
    assert r.status_code == 200 and r.headers['content-type'] == 'image/jpeg' and r.headers['x-wall-poster'] != made['id']
    assert Image.open(io.BytesIO(r.content)).size == (400, 900)
    assert len(c.get('/api/wall/posters').json()['posters']) == 2
