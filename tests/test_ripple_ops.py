"""Ripple Ops server: progress and unlocks, the daily streak, runs as knowledge evidence, the story, and the cast's model calls."""
import json

import pytest
from fastapi.testclient import TestClient

from server import auth, config, llm, main, ripple_ops as ro
from server.knowledge_base import catalog as kcat
from tests.fake_store import FakeStore

LEVELS = ro.CAMPAIGN['levels']


def run(level='garage', stars=2, key='k1', **over):
    body = {'key': key, 'level': level, 'stars': stars, 'availability': 99.95, 'cost': 201.0,
            'objectives': [{'id': 'availability', 'label': 'Availability', 'target': '99.5%', 'actual': '99.95%', 'pass': True}],
            'events': [], 'findings': [], 'bill': [{'id': 'n2', 'defId': 'app-server', 'usd': 60.0, 'detail': '1 × 2 vCPU'}],
            'estimates': [], 'graph': {'nodes': [{'id': 'n1', 'defId': 'client'}, {'id': 'n2', 'defId': 'app-server', 'cfg': {'tier': 's'}}],
                                       'edges': [{'id': 'e1', 'from': 'n1', 'to': 'n2'}]}}
    body.update(over)
    return body


# ---- pure ------------------------------------------------------------------------------

def test_campaign_concepts_point_at_real_knowledge_points():
    for k, c in ro.CONCEPTS.items():
        for p in c['points']:
            assert kcat.canonical(kcat.CATALOG, p), f'{k}: {p}'
        assert c['ask'].endswith('?'), k


def test_levels_unlock_in_order_and_side_quests_after_the_queues_chapter():
    p = ro.progress(LEVELS, [])
    assert p['unlocked'] == ['garage']
    p = ro.progress(LEVELS, [{'level': 'garage', 'stars': 1, 'at': 1, 'cost': 300}])
    assert p['unlocked'] == ['garage', 'launch-day'] and p['levels']['garage']['best'] == 1
    runs = [{'level': l['id'], 'stars': 3, 'at': i, 'cost': 10} for i, l in enumerate(LEVELS) if not l.get('side')][:5]
    p = ro.progress(LEVELS, runs)
    assert {'ripple-chat', 'ripple-video', 'ripple-rides', 'ripple-notify'} <= set(p['unlocked'])
    assert p['cleared'] == 5 and p['stars'] == 15


def test_best_run_keeps_the_most_stars_then_the_cheapest():
    p = ro.progress(LEVELS, [{'level': 'garage', 'stars': 2, 'cost': 400, 'at': 1}, {'level': 'garage', 'stars': 3, 'cost': 500, 'at': 2},
                             {'level': 'garage', 'stars': 3, 'cost': 200, 'at': 3}, {'level': 'garage', 'stars': 1, 'cost': 50, 'at': 4}])
    assert p['levels']['garage'] == {'best': 3, 'attempts': 4, 'last_at': 4, 'best_cost': 200}


def test_daily_runs_do_not_count_as_campaign_progress():
    p = ro.progress(LEVELS, [{'level': 'garage', 'daily': '2026-11-06', 'stars': 3, 'at': 1}])
    assert p['unlocked'] == ['garage'] and 'garage' not in p['levels']


def test_streak_counts_consecutive_survived_days_ending_today_or_yesterday():
    d = lambda day, stars=1: {'daily': day, 'stars': stars}
    runs = [d('2026-11-03'), d('2026-11-04'), d('2026-11-05'), d('2026-11-01')]
    assert ro.streak(runs, '2026-11-05') == 3
    assert ro.streak(runs, '2026-11-06') == 3          # today not played yet
    assert ro.streak(runs, '2026-11-07') == 0
    assert ro.streak(runs + [d('2026-11-06', 0)], '2026-11-06') == 3   # a failed daily doesn't count


def test_a_beaten_level_is_clean_evidence_for_each_concept_it_tests():
    level = ro.LEVELS['viral-link']
    events, gaps = ro.evidence(level, {'id': 'r1', 'stars': 3, 'findings': []}, ro.CONCEPTS, 100.0, kcat.CATALOG)
    assert [e['clean'] for e in events] == [True, True] and not gaps
    assert all(e['depth'] == 'apply' and e['strength'] == 'soft' for e in events)
    assert set(events[0]['points']) == set(ro.CONCEPTS['caching']['points'])


def test_a_failure_on_a_concept_is_a_miss_with_a_gap_and_the_rest_partial():
    level = ro.LEVELS['viral-link']
    r = {'id': 'r2', 'stars': 0, 'findings': [{'level': 'bad', 'concept': 'hot-keys', 'text': 'The cache emptied and every miss hit the database at once.'},
                                              {'level': 'warn', 'concept': 'caching', 'text': 'small'},
                                              {'level': 'bad', 'concept': 'retries', 'text': 'Retries multiplied load.'}]}
    events, gaps = ro.evidence(level, r, ro.CONCEPTS, 100.0, kcat.CATALOG)
    by = {e['key'].split('-', 1)[1]: e for e in events}
    assert by['hot-keys']['clean'] is False and by['hot-keys']['failed'] and not by['hot-keys']['partial']
    assert by['caching']['clean'] is False and by['caching']['partial'] and by['caching']['failed'] == []
    assert 'retries' in by                     # a failure outside the level's own concepts still counts
    assert [g['point'] for g in gaps] == [ro.CONCEPTS['hot-keys']['points'][0], ro.CONCEPTS['retries']['points'][0]]
    assert gaps[0]['text'].startswith('In Ripple Ops (A viral evening)') and gaps[0]['ask'].endswith('?')


def test_estimates_are_evidence_for_estimation():
    events, _ = ro.evidence(ro.LEVELS['garage'], {'id': 'r3', 'stars': 3, 'findings': [], 'estimates': [{'verdict': 'good'}, {'verdict': 'close'}]},
                            ro.CONCEPTS, 1.0, kcat.CATALOG)
    est = next(e for e in events if e['note'] == 'Ripple Ops estimates')
    assert est['clean'] is False and est['partial'] is True


def test_whatif_tags_are_parsed_clamped_and_stripped():
    text, ev = ro.parse_whatif('Prove it.\n[[whatif hot-key at=19 dur=2 share=0.95]]')
    assert text == 'Prove it.'
    assert ev == {'id': 'whatif', 'type': 'hot-key', 'at': 19, 'dur': 2, 'params': {'share': 0.9}}
    assert ro.parse_whatif('Hm. [[whatif meteor at=3]]') == ('Hm.', None)
    assert ro.parse_whatif('No tag here.') == ('No tag here.', None)
    assert ro.parse_whatif('[[whatif surge at=40 mult=100]]')[1]['at'] == 23


def test_designs_and_runs_read_as_short_text():
    g = {'nodes': [{'id': 'n1', 'defId': 'client'}, {'id': 'n2', 'defId': 'cache', 'cfg': {'tier': '13', 'hotKey': True, 'coalesce': False}}],
         'edges': [{'id': 'e', 'from': 'n1', 'to': 'n2'}], 'settings': {'regions': 2, 'crossRegion': 'sync'}}
    t = ro.graph_text(g)
    assert '- n2: cache {"tier":"13","hotKey":true}' in t and 'n1->n2' in t and 'Regions: 2' in t
    assert 'budget $3,500/month' in ro.level_text(ro.LEVELS['viral-link'])


def test_reasoning_reads_as_what_he_said_when_with_the_design_then():
    g = {'nodes': [{'id': 'n1', 'defId': 'client'}, {'id': 'n2', 'defId': 'app-server'}], 'edges': [{'from': 'n1', 'to': 'n2'}]}
    tl = [{'at': 1000, 'said': 'One server is enough at 2k users.', 'graph': g},
          {'at': 1095, 'said': 'Adding a database.', 'revised': True, 'graph': None}, {'at': 1100, 'said': '  '}]
    t = ro.reasoning_text('One server. Adding a database.', tl)
    assert t.startswith('Final notes:\nOne server.') and '[+0:00] "One server is enough' in t and 'n1->n2' in t
    assert '[+1:35] (reworded) "Adding a database."' in t and t.count('Design then') == 1
    assert ro.reasoning_text('just notes', []) == 'just notes' and ro.reasoning_text('', None) == 'None written.'


# ---- HTTP ------------------------------------------------------------------------------

@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    monkeypatch.setattr(ro, 'get_store', lambda uid: store)
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    c = TestClient(main.app)
    c.store, c.chats, c.gens, c.replies, c.generated = store, [], [], [], []

    def chat(model, messages, options=None):
        assert not llm.forbidden_model(model)
        c.chats.append(messages)
        return {'content': c.replies.pop(0), 'usage': {}}

    def generate(provider, model, system, prompt, schema, options=None):
        assert not llm.forbidden_model(model)
        c.gens.append((schema, json.loads(prompt)))
        return json.dumps(c.generated.pop(0))
    monkeypatch.setattr(llm, '_raw_chat', chat)
    monkeypatch.setattr(llm, '_raw_generate', generate)
    yield c
    main.app.dependency_overrides.clear()


def test_a_run_is_stored_once_counts_as_evidence_and_unlocks_the_next_level(client):
    r = client.post('/api/ripple/runs', json=run()).json()
    assert r['first_clear'] and r['unlocked'] == ['launch-day'] and r['evidence'] == 2
    again = client.post('/api/ripple/runs', json=run()).json()
    assert again['duplicate'] is True
    events = client.store.list_knowledge('knowledge_events')
    assert len(events) == 2 and all(e['source'] == 'ripple' and e['clean'] for e in events)
    story = client.store.get_knowledge('tutor_memory', 'story')
    assert 'Ripple v0' in story['events'][-1]['text']
    o = client.get('/api/ripple').json()
    assert o['progress']['levels']['garage']['best'] == 2 and o['recent'][0]['level'] == 'garage'


def test_a_failed_run_opens_a_gap_and_tells_no_story(client):
    body = run(stars=0, key='k2', findings=[{'id': 'budget', 'level': 'bad', 'concept': 'estimates', 'text': 'Over budget.'}])
    r = client.post('/api/ripple/runs', json=body).json()
    assert r['gaps'] == 1 and not r['first_clear'] and r['unlocked'] == []
    gaps = client.store.list_knowledge('knowledge_misconceptions')
    assert gaps[0]['kind'] == 'gap' and gaps[0]['point'] == ro.CONCEPTS['estimates']['points'][0]
    assert not (client.store.get_knowledge('tutor_memory', 'story') or {}).get('events')


def test_whatif_and_daily_runs_are_kept_but_not_progress_or_evidence(client):
    client.post('/api/ripple/runs', json=run(key='w', whatif=True))
    client.post('/api/ripple/runs', json=run(key='d', daily='2026-11-06'))
    assert len(client.store.list_knowledge('ripple_runs')) == 2
    assert len(client.store.list_knowledge('knowledge_events')) == 2      # only the daily counts as evidence
    assert client.get('/api/ripple').json()['progress']['unlocked'] == ['garage']


def test_drafts_round_trip(client):
    assert client.get('/api/ripple/drafts/garage').json()['graph'] is None
    g = {'nodes': [{'id': 'n1', 'defId': 'client'}], 'edges': []}
    client.put('/api/ripple/drafts/garage', json={'graph': g, 'notes': 'small boxes', 'timeline': [{'at': 5, 'said': 'small boxes', 'graph': g}]})
    d = client.get('/api/ripple/drafts/garage').json()
    assert d['graph'] == g and d['notes'] == 'small boxes' and d['timeline'][0]['said'] == 'small boxes'


def test_the_debrief_is_written_once_and_kept_with_the_run(client):
    rid = client.post('/api/ripple/runs', json=run(stars=1, key='k3')).json()['id']
    client.generated.append({'priya': 'The database held — barely.', 'marcus': 'Cheap.', 'jo': 'Why small?', 'next': ['Try x'], 'weak': ['estimates', 'nonsense']})
    d = client.post(f'/api/ripple/runs/{rid}/debrief').json()
    assert d['priya'] == 'The database held: barely.' and d['weak'] == ['estimates']
    schema, prompt = client.gens[0]
    assert schema is ro.Debrief and 'app-server' in prompt['design'] and 'Stars: 1/3' in prompt['result']
    assert client.post(f'/api/ripple/runs/{rid}/debrief').json()['jo'] == 'Why small?' and len(client.gens) == 1


def test_the_review_passes_the_design_and_returns_a_whatif(client):
    client.replies.append('You think that survives a zone outage?\n[[whatif az-outage at=14 dur=2]]')
    r = client.post('/api/ripple/review', json={'level': 'pager', 'graph': run()['graph'], 'messages': []}).json()
    assert r['reply'] == 'You think that survives a zone outage?' and r['whatif']['type'] == 'az-outage'
    system = client.chats[0][0]['content']
    assert "Priya's worst day" in system and 'n2: app-server' in system and 'Marcus' in system and 'His own reasoning' not in system
    client.replies.append('Fine.')
    client.post('/api/ripple/review', json={'level': 'pager', 'graph': run()['graph'], 'mode': 'interview', 'notes': 'Two zones for safety.',
                                           'messages': [{'role': 'assistant', 'text': 'Q'}, {'role': 'note', 'text': 'Zone outage: handled'}, {'role': 'user', 'text': 'A'}]})
    sent = client.chats[1]
    assert 'system design interview' in sent[0]['content'] and 'Two zones for safety.' in sent[0]['content'] and sent[2]['content'] == '(Note from the app: Zone outage: handled)'


def test_ending_an_interview_scores_it_and_records_soft_evidence(client):
    msgs = [{'role': r, 'text': t} for r, t in [('assistant', 'Q1'), ('user', 'A1'), ('assistant', 'Q2'), ('user', 'A2'), ('user', 'A3')]]
    client.generated.append({'verdict': 'hire', 'summary': 'Solid.', 'strengths': ['estimates'], 'gaps': ['failover'], 'weak': ['replication'], 'strong': ['estimates', 'replication']})
    r = client.post('/api/ripple/review/end', json={'level': 'pager', 'graph': run()['graph'], 'mode': 'interview', 'messages': msgs}).json()
    assert r['verdict'] == 'hire' and r['strong'] == ['estimates'] and r['weak'] == ['replication']
    ev = client.store.list_knowledge('knowledge_events')
    assert {e['clean'] for e in ev} == {True, False} and all(e['depth'] == 'explain' for e in ev)
    too_short = client.post('/api/ripple/review/end', json={'level': 'pager', 'graph': {}, 'messages': msgs[:2]})
    assert too_short.status_code == 400


def test_a_generated_level_is_validated_stored_and_playable(client):
    gen = {'title': 'Ripple Polls', 'kicker': 'Live polls.', 'goal': 'Survive the vote.', 'users': '3M users',
           'brief': [{'who': 'sam', 'text': 'Polls!'}, {'who': 'marcus', 'text': '$8k.'}], 'dau': 3000000,
           'traffic': {'read': {'perUser': 30, 'kb': 1, 'cacheable': 0.8, 'workingSetGb': 4}, 'write': {'perUser': 5, 'kb': 0.5, 'jobs': [{'kind': 'analytics', 'per': 1, 'ms': 1, 'fanout': 1}]}, 'peak': 2.5},
           'data_gb': 200, 'availability': 99.9, 'p99': {'read': 200, 'write': 300, 'geo': 100}, 'budget': 8000, 'lag_min': 10,
           'events': [{'type': 'hot-key', 'at': 20, 'dur': 1, 'share': 0.3, 'label': 'Celebrity poll', 'who': 'priya', 'line': 'Here it comes.'}],
           'concepts': ['hot-keys', 'bogus'], 'hints': ['a', 'b', 'c'], 'debrief': 'Hot keys.'}
    client.generated.append(gen)
    s = client.post('/api/ripple/generate', json={'focus': 'hot-keys'}).json()
    assert s['id'].startswith('gen-') and s['concepts'] == ['hot-keys'] and s['lessons'] == ['hot-keys']
    assert s['events'][0]['params'] == {'share': 0.3} and s['slo']['p99'] == {'read': 200, 'write': 300} and s['slo']['lagMin'] == 10
    assert client.get(f"/api/ripple/scenarios/{s['id']}").json()['title'] == 'Ripple Polls'
    assert client.get('/api/ripple').json()['generated'][0]['title'] == 'Ripple Polls'
    r = client.post('/api/ripple/runs', json=run(level=s['id'], key='g1', generated=True, stars=0,
                                                   findings=[{'id': 'x', 'level': 'bad', 'concept': 'hot-keys', 'text': 'Melted.'}])).json()
    assert r['gaps'] == 1 and not r['first_clear']


def test_model_features_are_cleanly_unavailable_without_a_key(client, monkeypatch):
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    assert client.get('/api/ripple').json()['enabled'] is False
    assert client.post('/api/ripple/review', json={'level': 'garage', 'graph': {}, 'messages': []}).status_code == 503
    assert client.post('/api/ripple/generate', json={}).status_code == 503
    assert client.post('/api/ripple/runs', json=run()).status_code == 200      # the game itself still works
