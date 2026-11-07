"""Night Shift server: levels on real knowledge points, runs as evidence and story, and the model's three voices."""
import json

import pytest
from fastapi.testclient import TestClient

from scripts import build_night_shift as build
from server import auth, config, llm, main, night_shift as ns
from server.knowledge_base import catalog as kcat
from tests.fake_store import FakeStore


def run(level='oomkilled', stars=3, key='k1', **over):
    body = {'key': key, 'level': level, 'stars': stars, 'minutes': 7, 'impact': 4200, 'risky': 0, 'hints': 0,
            'diagnosis': True, 'fix': True, 'lasting': True,
            'log': [{'kind': 'page', 'at': 0, 'text': 'FIRING links-api'}, {'kind': 'cmd', 'at': 1, 'cmd': 'kubectl describe pod x', 'out': 'OOMKilled'},
                    {'kind': 'act', 'at': 5, 'label': 'Set MaxRAMPercentage=75', 'text': 'Restarts stop.'}]}
    body.update(over)
    return body


# ---- pure ------------------------------------------------------------------------------

def test_the_levels_file_is_fresh_and_every_level_uses_real_points_and_lessons():
    with open(build.OUT, encoding='utf-8') as fh:
        assert json.load(fh) == json.loads(json.dumps(build.build())), 'run scripts/build_night_shift.py'
    from server.tracks import courses
    lessons = courses.lessons('fundamentals')
    for l in ns.LEVELS.values():
        assert l['points'] and all(kcat.canonical(kcat.CATALOG, p) for p in l['points']), l['id']
        assert all(x in lessons for x in l['lessons']), l['id']
        assert l['diagnosis']['prompt'].endswith('?') and l['truth'] and l['debrief']


def test_a_clean_shift_is_clean_evidence_and_a_wrong_diagnosis_opens_a_gap():
    level = ns.LEVELS['lockqueue']
    events, gaps = ns.evidence(level, run('lockqueue') | {'id': 'r1'}, 1.0)
    assert events[0]['clean'] and not gaps and events[0]['depth'] == 'apply' and events[0]['strength'] == 'soft'
    events, gaps = ns.evidence(level, run('lockqueue', diagnosis=False) | {'id': 'r2'}, 1.0)
    assert not events[0]['clean'] and events[0]['failed'] == level['points'] and gaps[0]['point'] == level['points'][0]
    events, _ = ns.evidence(level, run('lockqueue', lasting=False) | {'id': 'r3'}, 1.0)
    assert events[0]['partial'] and events[0]['failed'] == []


def test_progress_keeps_the_best_stars():
    p = ns.progress([{'level': 'oomkilled', 'stars': 1}, {'level': 'oomkilled', 'stars': 3}, {'level': 'fdleak', 'stars': 2}])
    assert p['levels']['oomkilled'] == {'best': 3, 'attempts': 2} and p['cleared'] == 2 and p['total'] == len(ns.LEVELS)


def test_the_offline_postmortem_has_the_root_cause_and_the_fix():
    text = ns.postmortem_text(ns.LEVELS['oomkilled'], run())
    assert 'Root cause' in text and 'MaxRAMPercentage' in text and 'Set MaxRAMPercentage=75' in text


# ---- HTTP ------------------------------------------------------------------------------

@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    monkeypatch.setattr(ns, 'get_store', lambda uid: store)
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    c = TestClient(main.app)
    c.store, c.chats, c.replies = store, [], []

    def chat(model, messages, options=None):
        assert not llm.forbidden_model(model)
        c.chats.append(messages)
        return {'content': c.replies.pop(0), 'usage': {}}
    monkeypatch.setattr(llm, '_raw_chat', chat)
    yield c
    main.app.dependency_overrides.clear()


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def test_a_shift_is_stored_once_counted_and_remembered(client):
    first = ok(client.post('/api/nightshift/runs', json=run()))
    assert first['evidence'] == 1 and first['first_clear'] and first['progress']['levels']['oomkilled']['best'] == 3
    assert ok(client.post('/api/nightshift/runs', json=run()))['duplicate']
    story = client.store.get_knowledge('tutor_memory', 'story')
    assert 'Night Shift' in story['events'][-1]['text']
    again = ok(client.post('/api/nightshift/runs', json=run(key='k2', diagnosis=False, stars=1)))
    assert again['gaps'] == 1 and not again['first_clear']
    assert ok(client.get('/api/nightshift'))['progress']['cleared'] == 1
    assert client.post('/api/nightshift/runs', json=run(level='nope', key='k3')).status_code == 404


def test_the_postmortem_is_written_once_with_the_model_and_from_a_template_without(client, monkeypatch):
    rid = ok(client.post('/api/nightshift/runs', json=run()))['id']
    client.replies.append('**Summary**: the pod outgrew its limit.')
    pm = ok(client.post(f'/api/nightshift/runs/{rid}/postmortem'))
    assert pm['model'] and 'outgrew' in pm['text'] and 'kubectl describe pod x' in client.chats[-1][0]['content']
    assert ok(client.post(f'/api/nightshift/runs/{rid}/postmortem'))['text'] == pm['text'] and len(client.chats) == 1
    rid2 = ok(client.post('/api/nightshift/runs', json=run(key='k9')))['id']
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    monkeypatch.setattr(llm, 'enabled', lambda settings=None: False)
    off = ok(client.post(f'/api/nightshift/runs/{rid2}/postmortem'))
    assert not off['model'] and 'Root cause' in off['text']


def test_the_shell_and_priya_stay_in_the_hidden_state_and_need_the_model(client, monkeypatch):
    client.replies.append('```\nMiB Mem :  2048.0 total\n```')
    out = ok(client.post('/api/nightshift/shell', json={'level': 'oomkilled', 'command': 'free -m', 'log': run()['log']}))
    assert out['out'] == 'MiB Mem :  2048.0 total'
    system = client.chats[-1][0]['content']
    assert ns.LEVELS['oomkilled']['truth'] in system and 'read-only' in system and client.chats[-1][1]['content'] == '$ free -m'
    client.replies.append('I would look at what the pod events say about why it stopped — not the app logs.')
    reply = ok(client.post('/api/nightshift/priya', json={'level': 'oomkilled', 'messages': [{'role': 'user', 'text': 'Where do I start?'}]}))
    assert '—' not in reply['reply'] and 'never say the root cause' in client.chats[-1][0]['content']
    assert client.post('/api/nightshift/priya', json={'level': 'oomkilled', 'messages': []}).status_code == 422
    monkeypatch.setattr(llm, 'enabled', lambda settings=None: False)
    assert client.post('/api/nightshift/shell', json={'level': 'oomkilled', 'command': 'free -m'}).status_code == 503
