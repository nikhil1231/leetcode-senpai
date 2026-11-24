"""Experience from Notion (via Job Scout): prompts, stories, model answers, prep focus across applications, drift."""
import datetime as dt

import pytest
from fastapi.testclient import TestClient

from server import auth, main
from server.senpai import jobscout, prep_focus
from server.tracks import experience, http
from server.tracks import experience_notion as notion
from server.tracks.experience_content import STAR_CHECKS
from tests.fake_store import FakeStore

DAY = 86400
NOW = 1_800_000_000


def iso(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat()


def app(job_id, company, kind, days=None, themes=(), items=(), stale=False):
    nxt = {'kind': kind, 'label': kind, 'status': 'scheduled' if days is not None else 'expected',
           'starts_at': iso(NOW + days * DAY) if days is not None else None}
    return {'job_id': job_id, 'company': company, 'title': 'Engineer', 'stage': 'screening', 'next': nxt,
            'rounds': [nxt], 'role_pack': {'stale': stale},
            'answers': {'themes': list(themes), 'items': [dict(i) for i in items]} if items else None}


def item(qid, relevance, story=None, answer='I did it.', **kw):
    return {'id': qid, 'text': kw.pop('text', qid), 'kind': kw.pop('kind', 'Story'), 'relevance': relevance,
            'story_id': story, 'answer': answer, 'short_answer': 'Short.', 'follow_ups': [], **kw}


MATERIAL = {
    'questions': [
        {'id': 'p-why-industry', 'text': 'Why this industry?', 'kind': 'Motivation', 'competencies': [],
         'rounds': ['Recruiter screen', 'Final'], 'active': True},
        {'id': 'p-incident', 'text': 'Tell me about a production incident you handled.', 'kind': 'Story',
         'competencies': ['Incidents and pressure', 'Ownership'], 'rounds': ['Behavioural', 'Final'], 'active': True},
        {'id': 'p-mentor', 'text': 'Helped a colleague grow?', 'kind': 'Story', 'competencies': ['Collaboration'],
         'rounds': ['Behavioural'], 'active': True},
        {'id': 'p-old', 'text': 'Retired', 'kind': 'Story', 'competencies': [], 'rounds': [], 'active': False},
    ],
    'stories': [
        {'id': 'es-incident', 'title': 'DevAmericas incident', 'summary': 'Sev-1.', 'status': 'Ready',
         'competencies': ['Incidents and pressure', 'Ownership'], 'body_md': '[st.es-incident.1] I reverted it.'},
        {'id': 'orientation', 'title': 'Orientation challenge', 'summary': '', 'status': 'Needs detail',
         'competencies': ['Collaboration'], 'body_md': ''},
    ],
    'general_answers': {'stale': False, 'themes': [], 'items': [
        item('p-incident', 1, 'es-incident', 'General incident answer.'), item('p-why-industry', 1, None, 'General why.')]},
    'applications': [
        app(1, 'Kraken', 'recruiter_screen', 2, ['finance', 'crypto'],
            [item('p-why-industry', 0.9, None, 'Kraken why.', kind='Motivation'), item('p-incident', 0.4, 'es-incident'),
             item('jd1-1', 0.8, None, 'Because crypto.', text='Why crypto?', kind='Motivation', extra=True)]),
        app(2, 'Revolut', 'recruiter_screen', 3, ['finance', 'payments'],
            [item('p-why-industry', 0.9, None, 'Revolut why.', kind='Motivation'), item('p-incident', 0.5, 'es-incident')]),
    ],
}


def test_prompts_come_from_the_notion_bank_with_role_questions():
    rows = {p['id']: p for p in notion.prompts(MATERIAL)}
    assert set(rows) == {'p-why-industry', 'p-incident', 'p-mentor', 'jd1-1'}
    assert rows['p-incident']['competencies'] == ['pressure', 'ownership']
    assert rows['p-incident']['probes'][0] == 'How did you find the root cause?'   # built-in probes kept for a known id
    assert rows['jd1-1']['company'] == 'Kraken' and rows['jd1-1']['source'] == 'role'
    assert 'p-old' in notion.known_prompt_ids(MATERIAL)                 # history on retired questions still counts
    assert [p['source'] for p in notion.prompts(None)][:1] == ['builtin']


def test_stories_are_read_only_mirrors_with_refs_removed():
    s = {x['id']: x for x in notion.stories(MATERIAL)}
    assert s['es-incident']['body'] == 'I reverted it.' and s['es-incident']['competencies'] == ['pressure', 'ownership']


def test_role_answer_wins_over_the_general_one():
    assert notion.answer_for(MATERIAL, 'p-why-industry', 2)['answer'] == 'Revolut why.'
    assert notion.answer_for(MATERIAL, 'p-why-industry')['answer'] == 'General why.'
    assert notion.answer_for(MATERIAL, 'p-mentor') is None


def test_focus_puts_shared_screen_questions_first_and_moves_on_when_a_round_passes():
    rows = notion.prompts(MATERIAL)
    need = {p['id']: 1.0 for p in rows}
    f = prep_focus.focus(MATERIAL['applications'], rows, need, NOW)
    assert f['active'] and f['shared_themes'] == ['finance']
    assert f['ranked'][0]['id'] == 'p-why-industry' and set(f['ranked'][0]['for']) == {'Kraken', 'Revolut'}
    assert [a['company'] for a in f['applications']] == ['Kraken', 'Revolut']   # sooner round weighs more
    assert f['stories'] == ['es-incident']
    # Kraken's screen is over: its next round (a final, not booked yet) only counts a little.
    after = [dict(MATERIAL['applications'][0], next={'kind': 'final', 'label': 'Final round', 'status': 'expected'}),
             MATERIAL['applications'][1]]
    g = prep_focus.focus(after, rows, need, NOW)
    weights = {a['company']: a['weight'] for a in g['applications']}
    assert weights['Kraken'] == prep_focus.EXPECTED and weights['Revolut'] > 0.5
    # Held questions sink.
    held = prep_focus.focus(MATERIAL['applications'], rows, {**need, 'p-why-industry': 0.0}, NOW)
    assert held['ranked'][0]['id'] != 'p-why-industry'


def test_app_weight_falls_with_distance():
    near = prep_focus.app_weight({'next': {'status': 'scheduled', 'starts_at': iso(NOW + DAY), 'kind': 'final'}}, NOW)[0]
    far = prep_focus.app_weight({'next': {'status': 'scheduled', 'starts_at': iso(NOW + 14 * DAY), 'kind': 'final'}}, NOW)[0]
    assert near > far > prep_focus.EXPECTED / 2
    assert prep_focus.app_weight({'next': None}, NOW)[0] == 0


def test_overview_without_interviews_falls_back_to_the_story_tiers():
    m = {**MATERIAL, 'applications': []}
    o = experience.overview([], NOW, material=m)
    assert not o['focus']['active'] and o['next_prompt'] == 'p-incident'      # has a Ready story
    assert {s['id'] for s in o['stories']} == {'es-incident', 'orientation'}
    assert next(c for c in o['coverage'] if c['id'] == 'pressure')['stories'] == ['es-incident']


def test_drift_lists_what_is_out_of_step():
    m = {**MATERIAL, 'general_answers': {**MATERIAL['general_answers'], 'stale': True},
         'applications': [dict(MATERIAL['applications'][0], role_pack={'stale': True})]}
    rows = notion.prompts(m)
    out = notion.drift(m, {'error': 'timeout'}, rows, experience.all_stories([], m),
                       [{'topic': 'ZooKeeper — quorum & partitions', 'state': 'Needs work'}],
                       {'ZooKeeper — quorum & partitions': 'Solid'})
    kinds = [d['kind'] for d in out]
    assert kinds.count('answers') == 2 and 'feed' in kinds and 'tracker' in kinds
    assert any('Needs detail' in d['text'] for d in out)


def test_tracker_states_from_dives():
    clean = lambda q, at: {'kind': 'dive', 'question_id': q, 'clean': True, 'at': at}
    recs = [clean('zk-quorum', NOW - 40 * DAY), clean('zk-quorum', NOW - 20 * DAY), clean('zk-quorum', NOW - DAY)]
    import server.knowledge as k
    states = k.replay(experience.events(recs), NOW)
    assert experience.tracker_states(states, NOW)['ZooKeeper — quorum'] in ('Developing', 'Solid')
    assert 'Model Ops' not in experience.tracker_states(states, NOW)


def test_sync_keeps_the_material_out_of_the_hot_document(monkeypatch):
    store = FakeStore('alice')
    monkeypatch.setattr(jobscout, 'configured', lambda: True)
    monkeypatch.setattr(jobscout, 'fetch', lambda: {'version': 2, 'fingerprint': 'f', 'generated_at': 'g',
                                                    'career_target': {}, **{k: MATERIAL[k] for k in jobscout.MATERIAL}})
    rec = jobscout.sync(store, NOW)
    assert 'stories' not in rec['context'] and rec['fingerprint'] == 'f'
    assert jobscout.material(store)['stories'][0]['id'] == 'es-incident'


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    store.put_senpai('senpai_career', 'material', MATERIAL)
    monkeypatch.setattr(http, 'get_store', lambda uid: store)
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    c = TestClient(main.app)
    c.store = store
    yield c
    main.app.dependency_overrides.clear()


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def test_api_focus_drill_and_model_answer(client, monkeypatch):
    nxt = ok(client.post('/api/tracks/experience/drill/next', json={'exclude': []}))
    assert nxt['prompt']['id'] in ('p-why-industry', 'jd1-1') and nxt['has_answer']
    assert nxt['prompt']['reason'].startswith('Counts for')
    nxt = ok(client.post('/api/tracks/experience/drill/next', json={'prompt_id': 'p-incident'}))
    assert nxt['stories'][0] == 'es-incident'
    d = ok(client.post('/api/tracks/experience/drills', json={
        'prompt_id': 'p-incident', 'story_id': 'es-incident', 'seconds': 120, 'job_id': 2,
        'checks': {k: True for k, _ in STAR_CHECKS}}))
    assert d['drill']['clean'] and d['model_answer']['company'] == 'Revolut'
    assert ok(client.get('/api/tracks/experience/answers/p-incident'))['answer'] == 'General incident answer.'
    assert client.get('/api/tracks/experience/answers/p-mentor').status_code == 404
    o = ok(client.get('/api/tracks/experience'))
    assert o['focus']['active'] and o['links']['notion_stories'] and o['stories'][0]['drills'] in (0, 1)
    assert client.post('/api/tracks/experience/drills', json={'prompt_id': 'p-incident', 'story_id': 'nope',
                                                              'seconds': 1, 'checks': {}}).status_code == 404


def test_api_suggestions_go_to_job_scout(client, monkeypatch):
    sent = []
    monkeypatch.setattr(jobscout, 'propose', lambda body: sent.append(body) or {'ok': True, 'proposal_id': 7})
    ok(client.post('/api/tracks/experience/notion-note', json={'story_id': 'es-incident', 'text': 'Chris fixed Logstash.'}))
    ok(client.post('/api/tracks/experience/tracker-proposal', json={'topic': 'ZooKeeper — quorum & partitions',
                                                                    'state': 'Developing', 'evidence': '3 clean'}))
    assert [b['kind'] for b in sent] == ['story_note', 'tracker_state']

    def refuse(body):
        raise ValueError('unknown story')
    monkeypatch.setattr(jobscout, 'propose', refuse)
    assert client.post('/api/tracks/experience/notion-note', json={'story_id': 'x', 'text': 'long enough text'}).status_code == 422
