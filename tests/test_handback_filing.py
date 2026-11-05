"""A detailed handback: topics beyond the lesson filed onto any course, and the app's tutor picking up after it."""
import json

import pytest
from fastapi.testclient import TestClient

from server import auth, config, handback_filing as hf, handover as ho, llm, main, study_prompt as sp
from server.knowledge_base import api as kb_api, catalog as kcat
from server.tutor import api as tapi
from tests.fake_store import FakeStore

POINTS = [
    {'id': 'tx.lost', 'claim': 'A lost update happens when two transactions read the same row and both write it back.',
     'subtopic': 'Anomalies', 'lesson_title': 'Transactions', 'prompt': ''},
    {'id': 'tx.occ', 'claim': 'Optimistic concurrency checks a version column in the UPDATE and retries on conflict.',
     'subtopic': 'Concurrency control', 'lesson_title': 'Transactions', 'prompt': ''},
    {'id': 'cache.ttl', 'claim': 'A TTL bounds how stale a cached value can get.', 'subtopic': 'Expiry', 'lesson_title': 'Caching', 'prompt': ''},
]
TOPICS = [{'topic': 'Lost updates', 'detail': 'Two transactions overwrite each other; a version column catches it.',
           'verdict': 'partial', 'depth': 'explain', 'said': 'lock the row I guess', 'missing': 'no version check'},
          {'topic': 'Cache expiry', 'detail': 'TTLs and staleness.', 'verdict': 'explained', 'depth': 'recall', 'said': '', 'missing': ''}]


def test_shortlist_ranks_by_shared_rare_words_and_skips_excluded_ideas():
    idx = hf.index(POINTS)
    assert set(hf.shortlist(hf.topic_text(TOPICS[0]), idx)) == {'tx.lost', 'tx.occ'}
    assert 'tx.lost' not in hf.shortlist(hf.topic_text(TOPICS[0]), idx, exclude={'tx.lost'})
    assert hf.shortlist('nothing in common here', idx) == []


def test_rows_keep_only_shortlisted_picks_and_the_strictest_verdict_per_idea():
    lists = [['tx.lost', 'tx.occ'], ['cache.ttl']]
    again = {**TOPICS[0], 'topic': 'Lost updates again', 'verdict': 'right', 'said': 'version check'}
    shown, heard, refs = hf.rows(TOPICS + [again], lists + [['tx.lost']], [
        {'ref': 'T1.C1', 'shown': True}, {'ref': 'T1.C2', 'shown': False}, {'ref': 'T2.C1', 'shown': True},
        {'ref': 'T3.C1', 'shown': True}, {'ref': 'T1.C9', 'shown': True}, {'ref': 'T7.C1', 'shown': True}, {'ref': 'bogus', 'shown': True}])
    assert [(r['ref'], r['verdict'], r['note'], r['quote']) for r in shown] == [
        ('x.tx.lost', 'partial', 'no version check', 'lock the row I guess')]
    assert heard == ['tx.occ', 'cache.ttl'] and refs == {'x.tx.lost': 'tx.lost'}   # 'explained' is heard even when "shown"


def test_merge_topics_adds_only_new_ones():
    assert ho.merge_topics(TOPICS, [TOPICS[0], {**TOPICS[0], 'said': 'different words'}]) == TOPICS + [{**TOPICS[0], 'said': 'different words'}]


def test_lesson_report_shows_the_latest_handback_and_ideas_filed_from_other_lessons():
    here = {'section': 'system-design', 'lesson': 'a'}
    filed = [{'section': 'system-design', 'lesson': 'tx', 'lesson_title': 'Transactions', 'point': 'p', 'claim': '', 'verdict': 'partial'},
             {'section': 'system-design', 'lesson': 'tx', 'lesson_title': 'Transactions', 'point': 'q', 'claim': '', 'verdict': 'explained'},
             {'section': 'system-design', 'lesson': 'a', 'lesson_title': 'A', 'point': 'r', 'claim': '', 'verdict': 'right'}]
    sessions = [
        {'_key': 'old', 'origin': 'handover', 'scope': here, 'imported_at': 1, 'summary': 'old'},
        {'_key': 'new', 'origin': 'handover', 'scope': here, 'imported_at': 50000, 'counts': {'right': 2}, 'explained_refs': ['P3'],
         'summary': 'S', 'next_steps': 'N', 'topics': [{}, {}], 'filing': {'status': 'done', 'filed': filed}},
        {'_key': 'nope', 'origin': 'handover', 'scope': here, 'imported_at': None},
        {'_key': 'tx1', 'origin': 'handover', 'scope': {'section': 'system-design', 'lesson': 'tx'}, 'imported_at': 3,
         'filing': {'status': 'done', 'filed': filed}}]
    report, elsewhere = hf.lesson_report(sessions, 'system-design', 'a')
    assert report['session'] == 'new' and report['explained'] == 1 and report['topics'] == 2
    assert report['filing']['here'] == 1 and report['filing']['elsewhere'] == [
        {'section': 'system-design', 'lesson': 'tx', 'lesson_title': 'Transactions', 'ideas': 2}]
    assert elsewhere == [{'session': 'tx1', 'section': 'system-design', 'lesson': 'tx', 'at': 3, 'ideas': 1}]
    assert report['summary'] == 'S' and report['sessions'] == ['new']   # the old one was another sitting
    pending, _ = hf.lesson_report([{**sessions[1], 'filing': None}], 'system-design', 'a')
    assert pending['filing']['status'] == 'pending'
    first = {**sessions[1], '_key': 'first', 'imported_at': 49000, 'counts': {'right': 1, 'partial': 3}, 'summary': 'R',
             'next_steps': '', 'lesson_suggestions': ['x'], 'filing': {'status': 'failed', 'error': 'try again'}}
    both, _ = hf.lesson_report([sessions[1], first], 'system-design', 'a')
    assert both['sessions'] == ['first', 'new'] and both['counts'] == {'right': 3, 'partial': 3} and both['summary'] == 'R\n\nS'
    assert both['next_steps'] == 'N' and both['topics'] == 4 and both['filing']['status'] == 'failed'
    assert both['filing']['retry'] == {'session': 'first', 'error': 'try again'}
    assert hf.lesson_report(sessions, 'system-design', 'zzz') == (None, [])


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('me')
    for mod in (ho, kb_api, sp, tapi):
        monkeypatch.setattr(mod, 'get_store', lambda uid: store)
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    main.app.dependency_overrides[kb_api.caller] = lambda: {'uid': 'me', 'source': 'personal-mcp'}
    main.app.dependency_overrides[auth.require_user] = lambda: 'me'
    c = TestClient(main.app)
    c.store, c.filings, c.chats = store, [], []

    def generate(provider, model, system, prompt, schema, options=None):
        assert schema is hf.Filing and model == config.TUTOR_NOTES_MODEL and not llm.forbidden_model(model)
        topics = json.loads(prompt)['topics']
        nxt = c.filings.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return json.dumps({'matches': nxt(topics)})

    def chat(model, messages, options=None):
        c.chats.append(messages)
        return {'content': 'Right, picking up from your other session: error codes next.', 'usage': {}}
    monkeypatch.setattr(llm, '_raw_generate', generate)
    monkeypatch.setattr(llm, '_raw_chat', chat)
    yield c
    main.app.dependency_overrides.clear()


def pick(topics, title, words):
    """The candidate of `title`'s topic whose idea mentions `words`."""
    t = next(t for t in topics if t['title'] == title)
    return next(x['ref'] for x in t['candidates'] if words in x['idea'].casefold())


def test_a_detailed_handback_files_tangents_and_the_next_tutor_session_picks_up(client):
    http, store = client, client.store
    old = http.post('/api/tutor/sessions', json={'section': 'system-design', 'lesson': 'cache-aside', 'key': 'sess-before'}).json()
    h = http.get('/api/knowledge/handover', params={'lesson': 'cache-aside'}).json()
    assert 'topics: one per other topic' in h['brief'] and 'however far from the lesson' in h['brief']
    refs = store.get_knowledge('study_sessions', h['session'])['refs']
    topics = [{'topic': 'Lost updates in transactions', 'detail': 'Two transactions read the same row and both write: a lost update.',
               'verdict': 'wrong', 'depth': 'explain', 'said': 'the database stops that by itself', 'missing': 'thought the default isolation level prevents lost updates'},
              {'topic': 'Idempotency keys', 'detail': 'A client sends an idempotency key so a retried request is not applied twice.', 'verdict': 'explained'}]
    client.filings.append(lambda ts: [{'ref': pick(ts, 'Lost updates in transactions', 'lost update'), 'shown': True},
                                      {'ref': pick(ts, 'Idempotency keys', 'idempotency key'), 'shown': False}])
    body = {'session': h['session'], 'grades': [{'ref': 'P1', 'verdict': 'right', 'said': 'cache first'}, {'ref': 'P2', 'verdict': 'explained'}],
            'topics': topics, 'summary': 'Covered the read path.\n\n\n\nThen a long tangent  into transactions.',
            'next_steps': 'Start with invalidation.', 'lesson_suggestions': ['Show a stampede diagram.']}
    r = http.post('/api/knowledge/handback', json=body).json()
    assert r['recorded'] == ['P1'] and r['explained'] == ['P2'] and r['topics'] == 2

    s = store.get_knowledge('study_sessions', h['session'])
    assert s['summary'] == 'Covered the read path.\n\nThen a long tangent into transactions.' and s['lesson_suggestions'] == ['Show a stampede diagram.']
    filing = s['filing']
    assert filing['status'] == 'done' and filing['version'] == hf.FILING_VERSION
    lost = next(f for f in filing['filed'] if f['verdict'] == 'wrong')
    heard = next(f for f in filing['filed'] if f['verdict'] == 'explained')
    assert lost['lesson'] != 'cache-aside' and 'lost update' in lost['claim'].casefold()
    events = {e['_key']: e for e in store.list_knowledge('knowledge_events')}
    assert events[f"personal-mcp:{h['session']}.x.{lost['point']}"]['clean'] is False
    assert events[f"personal-mcp:{h['session']}.heard.{heard['point']}"]['kind'] == 'exposure'
    assert events[f"personal-mcp:{h['session']}.seen.{refs['P2']}"]['kind'] == 'exposure'
    mis = {m['point']: m for m in store.list_knowledge('knowledge_misconceptions')}
    assert mis[lost['point']]['text'] == 'thought the default isolation level prevents lost updates'

    assert store.get_knowledge('tutor_sessions', old['id'])['status'] == 'ended'   # the outside tutor carried on from it
    state = http.get('/api/tutor/lessons/system-design/cache-aside').json()
    assert state['active'] is None and state['outside']['session'] == h['session'] and state['outside']['picks_up']
    assert state['outside']['filing']['elsewhere'][0]['lesson'] == lost['lesson']
    there = http.get(f"/api/tutor/lessons/system-design/{lost['lesson']}").json()
    assert there['outside'] is None and there['outside_elsewhere'][0]['lesson_title'].startswith('Cache-aside')

    n = len(store.list_knowledge('knowledge_events'))
    client.filings.append(lambda ts: [{'ref': pick(ts, 'Lost updates in transactions', 'lost update'), 'shown': True}])
    assert http.post(f"/api/knowledge/handback/{h['session']}/file").json()['status'] == 'done'
    assert len(store.list_knowledge('knowledge_events')) == n   # filing again records nothing twice

    new = http.post('/api/tutor/sessions', json={'section': 'system-design', 'lesson': 'cache-aside', 'key': 'sess-after1'}).json()
    system = client.chats[-1][0]['content']
    assert new['pickup']['session'] == h['session'] and "He's just come from his other tutor" in system
    assert 'Then a long tangent into transactions.' in system and 'What it suggested next: Start with invalidation.' in system
    assert 'talking about that session like someone who read the notes' in system
    assert not http.get('/api/tutor/lessons/system-design/cache-aside').json()['outside']['picks_up']
    http.post(f"/api/tutor/sessions/{new['id']}/end")
    later = http.post('/api/tutor/sessions', json={'section': 'system-design', 'lesson': 'cache-aside', 'key': 'sess-after2'}).json()
    assert 'pickup' not in later and 'Picking up' not in client.chats[-1][0]['content']


def test_filing_waits_for_the_model_and_a_failure_can_be_retried(client, monkeypatch):
    http, store = client, client.store
    h = http.get('/api/knowledge/handover', params={'lesson': 'cache-aside'}).json()
    topic = {'topic': 'Lost updates in transactions', 'detail': 'Two transactions both write the same row: a lost update.', 'verdict': 'right',
             'said': 'add a version check'}
    client.filings.append(RuntimeError('provider down'))
    http.post('/api/knowledge/handback', json={'session': h['session'], 'grades': [], 'topics': [topic], 'summary': ''})
    s = store.get_knowledge('study_sessions', h['session'])
    assert s['filing']['status'] == 'failed' and s['topics'] == [{**topic, 'depth': 'recall', 'missing': ''}]
    assert http.get('/api/tutor/lessons/system-design/cache-aside').json()['outside']['filing']['status'] == 'failed'

    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    assert http.post(f"/api/knowledge/handback/{h['session']}/file").json()['status'] == 'waiting'
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    client.filings.append(lambda ts: [{'ref': pick(ts, topic['topic'], 'lost update'), 'shown': True}])
    done = http.post(f"/api/knowledge/handback/{h['session']}/file").json()
    assert done['status'] == 'done' and done['filed'][0]['verdict'] == 'right'
    again = http.post('/api/knowledge/handback', json={'session': h['session'], 'grades': [], 'topics': [topic], 'summary': ''}).json()
    assert again['topics'] == 1 and client.filings == []   # a repeated handback with nothing new files nothing
    assert http.post('/api/knowledge/handback/zzzzzz/file').status_code == 404


def test_two_handbacks_in_one_sitting_both_reach_the_next_session(client):
    http = client
    for summary in ('First half: pagination.', 'Second half: concurrency.'):
        h = http.get('/api/knowledge/handover', params={'lesson': 'cache-aside'}).json()
        http.post('/api/knowledge/handback', json={'session': h['session'], 'grades': [], 'summary': summary})
    state = http.get('/api/tutor/lessons/system-design/cache-aside').json()
    assert state['outside']['summary'] == 'First half: pagination.\n\nSecond half: concurrency.' and len(state['outside']['sessions']) == 2
    s = http.post('/api/tutor/sessions', json={'section': 'system-design', 'lesson': 'cache-aside', 'key': 'sess-both1'}).json()
    assert s['pickup']['summary'] == 'First half: pagination.\n\nSecond half: concurrency.'
