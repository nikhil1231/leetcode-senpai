"""The tutor: story state, reply validation, and full sessions over HTTP with a scripted model."""
import json

import pytest
from fastapi.testclient import TestClient

from server import auth, config, llm, main
from server.tutor import api, lessons, session as ses, story
from tests.fake_store import FakeStore

L = lessons.get('system-design', 'cache-aside')
MISS = 'sd.cache-aside.db-load-is-miss-rate'
DELETE = 'sd.cache-aside.delete-beats-set'


def reply(**over):
    base = {'speaker': 'tutor', 'say': 'Go on.', 'show_block': '', 'objectives': [], 'evidence': [],
            'misconceptions': [], 'resolved': [], 'summary': '', 'story_event': '', 'notes': '', 'done': False}
    return {**base, **over}


# ---- story ---------------------------------------------------------------------------

def summary(pct, cats=()):
    return {'pct': pct, 'sections': [{'id': 'system-design', 'categories': [{'id': c, 'pct': p} for c, p in cats]}]}


def test_company_size_follows_what_you_hold():
    s = story.scale(summary(0))
    assert s['label'] == 'Garage' and s['next']['label'] == 'Launched' and s['next']['progress'] == 0
    s = story.scale(summary(11.5))
    assert s['label'] == 'Seed round' and s['next']['label'] == 'Series A' and s['next']['progress'] == 50
    assert story.scale(summary(95))['next'] is None


def test_milestones_unlock_per_area():
    ms = {m['id']: m for m in story.scale(summary(20, [('caching', 40), ('apis', 20)]))['milestones']}
    assert ms['viral-day']['done'] and not ms['partner-api']['done'] and ms['partner-api']['progress'] == 50
    assert ms['europe']['progress'] == 0


def test_story_events_are_capped_and_ignore_blanks():
    events = []
    for i in range(12):
        events = story.remember(events, f'event {i}', i)
    events = story.remember(events, '   ', 99)
    assert len(events) == story.MAX_EVENTS and events[-1]['text'] == 'event 11'


def test_every_section_and_category_has_a_scene():
    from server.knowledge_base import catalog as kcat
    for section in lessons.SECTIONS:
        for cid, _ in kcat.categories(section):
            if cid in ('skill-drills', 'estimation'):
                continue
            assert story.chapter(section, cid), (section, cid)


# ---- validation ------------------------------------------------------------------------

def fresh(mode='teach'):
    s = ses.new('s1', L, mode, 0)
    s['turns'].append({'role': 'learner', 'text': 'Load on the DB is requests times the miss rate, so 99% is ten times better than 90%', 'key': 'k1', 'at': 1})
    return s


def test_quotes_must_come_from_the_learner():
    assert ses.quoted('requests times the miss rate', 'Load is Requests  times the MISS rate!')
    assert not ses.quoted('hit rate', 'requests times the miss rate') and not ses.quoted('a', 'a b c')


def test_apply_keeps_only_grounded_evidence_and_valid_tools():
    s = fresh()
    r = reply(speaker='narrator', show_block='b99', objectives=[
        {'objective': 2, 'status': 'demonstrated', 'quote': 'requests times the miss rate'},
        {'objective': 0, 'status': 'demonstrated', 'quote': 'something they never said'},
        {'objective': 9, 'status': 'working', 'quote': 'miss rate'}],
        evidence=[{'point': MISS, 'clean': True, 'depth': 'explain', 'quote': 'requests times the miss rate'},
                  {'point': MISS, 'clean': True, 'depth': 'explain', 'quote': 'miss rate'},
                  {'point': DELETE, 'clean': True, 'depth': 'recall', 'quote': 'delete the key'},
                  {'point': 'sd.not-this-lesson.x', 'clean': True, 'depth': 'recall', 'quote': 'miss rate'}],
        misconceptions=[{'point': MISS, 'text': 'thinks 99% is only slightly better', 'quote': 'invented quote'}],
        resolved=['tutor:m1', 'tutor:unknown'], summary='Has the miss-rate rule.', done=True)
    turn, writes, _ = ses.apply(s, r, L, {MISS, DELETE}, {'tutor:m1'}, 2)
    assert turn['speaker'] == 'tutor' and turn['show_block'] == '' and s['status'] == 'active'
    assert s['objectives'][2]['status'] == 'demonstrated' and s['objectives'][0]['status'] == 'open'
    assert [e['point'] for e in writes['evidence']] == [MISS]
    assert writes['misconceptions'] == [] and writes['resolved'] == ['tutor:m1']
    assert s['summary'] == 'Has the miss-rate rule.'


def test_blocks_show_once_and_objectives_never_regress():
    s = fresh()
    ses.apply(s, reply(show_block='b1', speaker='priya', objectives=[{'objective': 2, 'status': 'demonstrated', 'quote': 'miss rate'}]), L, set(), set(), 2)
    assert s['shown'] == ['b1'] and s['turns'][-1]['speaker'] == 'priya'
    s['turns'].append({'role': 'learner', 'text': 'not sure about the miss rate', 'key': 'k2', 'at': 3})
    turn, _, _ = ses.apply(s, reply(show_block='b1', objectives=[{'objective': 2, 'status': 'working', 'quote': 'miss rate'}]), L, set(), set(), 4)
    assert turn['show_block'] == '' and s['objectives'][2]['status'] == 'demonstrated'


def test_a_correct_block_can_demonstrate_without_a_quote():
    s = ses.new('s1', L, 'teach', 0)
    s['turns'].append({'role': 'block', 'block': 'b1', 'correct': True, 'key': 'k1', 'at': 1})
    ses.apply(s, reply(objectives=[{'objective': 2, 'status': 'demonstrated', 'quote': ''}]), L, set(), set(), 2)
    assert s['objectives'][2]['status'] == 'demonstrated'


def test_done_only_when_every_objective_is_demonstrated():
    s = fresh()
    for o in s['objectives']:
        o['status'] = 'demonstrated'
    ses.apply(s, reply(done=True), L, set(), set(), 5)
    assert s['status'] == 'ended' and s['ended_at'] == 5


def test_payload_puts_stable_content_first_and_hides_nothing_needed():
    s = fresh()
    p = ses.payload(s, L, [], [], [], {'summary': 'Last time: TTLs.'}, story.scale(summary(0)))
    assert list(p)[:3] == ['MODE', 'LESSON', 'NOTES'] and list(p)[-1] == 'TRANSCRIPT'
    assert p['PREVIOUSLY'] == 'Last time: TTLs.' and p['STORY']['company'] == 'Ripple'
    assert '[BLOCK b1 · predict]' in p['NOTES'] and {b['key'] for b in p['BLOCKS']} >= {'b1', 'b17'}


# ---- HTTP ------------------------------------------------------------------------------

@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    monkeypatch.setattr(api, 'get_store', lambda uid: store)
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    c = TestClient(main.app)
    c.store, c.replies, c.prompts, c.systems = store, [], [], []

    def fake(provider, model, system, prompt, schema, options=None):
        assert not llm.forbidden_model(model) and schema is ses.TutorReply
        c.prompts.append(json.loads(prompt))
        c.systems.append(system)
        nxt = c.replies.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return {'content': json.dumps(nxt), 'usage': {'prompt_tokens': 100, 'completion_tokens': 20}}
    monkeypatch.setattr(llm, '_raw_generate', fake)
    yield c
    main.app.dependency_overrides.clear()


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def start(c, key='sess-0001', mode='teach'):
    c.replies.append(reply(say='A deploy changed every cache key. What happens to the database?', speaker='priya'))
    return ok(c.post('/api/tutor/sessions', json={'section': 'system-design', 'lesson': 'cache-aside', 'mode': mode, 'key': key}))


def test_a_session_from_start_to_finish(client):
    s = start(client)
    assert s['turns'][0]['say'].startswith('A deploy') and s['progress'] == {'demonstrated': 0, 'total': 4}
    assert client.prompts[0]['TRANSCRIPT'][0]['text'] == 'Open the session.'
    client.replies.append(reply(say='Right. Try this one.', show_block='b1',
        objectives=[{'objective': 2, 'status': 'working', 'quote': 'every read misses'}],
        evidence=[{'point': MISS, 'clean': True, 'depth': 'apply', 'quote': 'every read misses and hits the database'}],
        misconceptions=[{'point': DELETE, 'text': 'thinks setting the cache on write is always safe', 'quote': 'just set the new value'}],
        summary='Knows mass misses hit the DB.', story_event='Priya: the key-format outage, diagnosed.'))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0001',
        'text': 'Every read misses and hits the database at once. On writes I would just set the new value.'}))
    assert s['turns'][-1]['show_block'] == 'b1' and s['shown'] == ['b1'] and s['objectives'][2]['status'] == 'working'
    events = client.store.list_knowledge('knowledge_events')
    assert [(e['source'], e['strength'], e['points'], e['depth']) for e in events] == [('tutor', 'soft', [MISS], 'apply')]
    mis = client.store.list_knowledge('knowledge_misconceptions')
    assert mis[0]['point'] == DELETE and mis[0]['status'] == 'open'

    client.replies.append(reply(say='Good. Now: why delete rather than set?', resolved=[mis[0]['_key']]))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0002', 'block': {'key': 'b1', 'correct': True}}))
    assert client.prompts[-1]['TRANSCRIPT'][-1] == {'role': 'block', 'block': 'b1', 'correct': True}
    assert client.prompts[-1]['OPEN_MISCONCEPTIONS'][0]['point'] == DELETE
    assert client.store.list_knowledge('knowledge_misconceptions')[0]['status'] == 'resolved'

    client.replies.append(reply(speaker='marcus', say='**What you showed**: the miss storm.', summary='Knows mass misses hit the DB.', done=True))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/end'))
    assert s['status'] == 'ended' and s['turns'][-1]['debrief'] and s['turns'][-1]['speaker'] == 'tutor'
    assert client.prompts[-1]['PHASE'] == 'debrief' and 'THE SESSION IS OVER' in client.systems[-1]
    assert client.prompts[-1]['SESSION_MISTAKES'] == [{'belief': 'thinks setting the cache on write is always safe', 'said': 'just set the new value'}]
    assert not s['debrief_due'] and client.replies == []
    state = ok(client.get('/api/tutor/lessons/system-design/cache-aside'))
    assert state['previously'] == 'Knows mass misses hit the DB.' and state['active'] is None and state['sessions'] == 1
    overview = ok(client.get('/api/tutor'))
    assert overview['story']['events'][-1]['text'].startswith('Priya') and overview['story']['company'] == 'Ripple'
    assert client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0003', 'text': 'more'}).status_code == 409


def test_failed_replies_keep_the_learner_turn_and_retry_with_the_same_key(client):
    s = start(client)
    client.replies.append(RuntimeError('provider down'))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0001', 'text': 'my answer'}))
    assert s['error'] and s['turns'][-1] == {**s['turns'][-1], 'role': 'learner', 'text': 'my answer'}
    client.replies.append(reply(say='Back again.'))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0001', 'text': 'my answer'}))
    assert 'error' not in s and [t['role'] for t in s['turns']] == ['tutor', 'learner', 'tutor']
    again = ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0001', 'text': 'my answer'}))
    assert len(again['turns']) == 3 and client.replies == []


def test_a_retried_start_opens_the_same_session(client):
    first = start(client)
    again = ok(client.post('/api/tutor/sessions', json={'section': 'system-design', 'lesson': 'cache-aside', 'key': 'sess-0001'}))
    assert again['id'] == first['id'] and len(again['turns']) == 1
    state = ok(client.get('/api/tutor/lessons/system-design/cache-aside'))
    assert state['active']['id'] == first['id'] and state['sessions'] == 1


def test_bad_input_is_rejected(client):
    s = start(client)
    sid = s['id']
    assert client.post(f'/api/tutor/sessions/{sid}/turns', json={'key': 'turn-0001'}).status_code == 422
    assert client.post(f'/api/tutor/sessions/{sid}/turns', json={'key': 'turn-0001', 'block': {'key': 'b99', 'correct': True}}).status_code == 422
    assert client.post('/api/tutor/sessions', json={'section': 'system-design', 'lesson': 'nope', 'key': 'sess-0002'}).status_code == 404
    assert client.get('/api/tutor/sessions/missing-1').status_code == 404


def test_course_track_lessons_work_too(client):
    client.replies.append(reply(say='Jo here. What even is a chunk?', speaker='jo'))
    s = ok(client.post('/api/tutor/sessions', json={'section': 'ai', 'lesson': 'rag', 'mode': 'explain', 'key': 'sess-rag01'}))
    assert s['turns'][0]['speaker'] == 'jo' and client.prompts[0]['MODE'] == 'I explain'
    assert 'you ARE Jo' in client.systems[0] and client.prompts[0]['BLOCKS'] == []
    assert any(p['id'].startswith('ai.rag.') for p in client.prompts[0]['POINTS'])


def test_without_the_model_the_tutor_is_cleanly_unavailable(client, monkeypatch):
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    assert ok(client.get('/api/tutor'))['enabled'] is False
    r = client.post('/api/tutor/sessions', json={'section': 'system-design', 'lesson': 'cache-aside', 'key': 'sess-0003'})
    assert r.status_code == 503 and 'lesson itself still works' in r.json()['detail']


# ---- modes -----------------------------------------------------------------------------

def test_each_mode_has_its_own_role_and_only_teach_teaches():
    prompts = {m: ses.system(m) for m in ses.MODES}
    assert len(set(prompts.values())) == len(ses.MODES)
    assert 'BLOCKS are interactive' in prompts['teach']
    assert all('BLOCKS are interactive' not in p for m, p in prompts.items() if m != 'teach')
    assert 'never teach' in prompts['explain'] and 'believe them' in prompts['explain']
    assert 'THE SESSION IS OVER' not in prompts['explain'] and 'postmortem' in ses.system('war-room', debrief=True)


def test_role_play_modes_cannot_show_activities_or_switch_speaker():
    s = fresh('explain')
    turn, _, _ = ses.apply(s, reply(speaker='tutor', show_block='b1', notes='They think 99% is barely better.'), L, set(), set(), 2)
    assert turn['speaker'] == 'jo' and turn['show_block'] == '' and s['shown'] == []
    assert s['notes'] == 'They think 99% is barely better.'
    p = ses.payload(s, L, [], [], [], {}, story.scale(summary(0)))
    assert p['BLOCKS'] == [] and p['NOTES_TO_SELF'] == s['notes'] and 'PHASE' not in p
    war = fresh('war-room')
    assert ses.apply(war, reply(speaker='sam'), L, set(), set(), 2)[0]['speaker'] == 'sam'
    assert ses.apply(war, reply(speaker='jo'), L, set(), set(), 3)[0]['speaker'] == 'priya'


def test_wrong_claims_are_kept_for_the_debrief_and_notes_stay_private():
    s = fresh('explain')
    ses.apply(s, reply(misconceptions=[{'point': MISS, 'text': 'thinks 99% is only slightly better', 'quote': 'ten times better'}]),
              L, {MISS}, set(), 2)
    assert s['mistakes'] == [{'point': MISS, 'text': 'thinks 99% is only slightly better', 'quote': 'ten times better'}]
    s['notes'] = 'secret plan'
    assert 'notes' not in ses.public(s) and not ses.public(s)['debrief_due']
    ses.end(s, 3)
    assert ses.public(s)['notes'] == 'secret plan' and ses.needs_debrief(s)
    ses.apply_debrief(s, reply(say='What was wrong: …', summary='Mixed up miss rates.'), 4)
    assert s['turns'][-1]['debrief'] and not ses.needs_debrief(s) and s['summary'] == 'Mixed up miss rates.'


def test_an_unused_session_ends_without_a_debrief(client):
    s = start(client, mode='explain')
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/end'))
    assert s['status'] == 'ended' and not s['debrief_due'] and len(client.prompts) == 1


def test_a_failed_debrief_can_be_written_again(client):
    s = start(client, mode='interview')
    client.replies.append(reply(speaker='marcus', say='OK. Go deeper.'))
    ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0001', 'text': 'I would cache it'}))
    client.replies.append(RuntimeError('provider down'))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/end'))
    assert s['status'] == 'ended' and s['debrief_due'] and s['error']
    client.replies.append(reply(say='Feedback: mixed for senior.'))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/end'))
    assert not s['debrief_due'] and 'error' not in s and s['turns'][-1]['say'] == 'Feedback: mixed for senior.'


def test_showing_the_last_objective_brings_the_debrief(client):
    s = start(client, mode='explain')
    sess = client.store.get_knowledge('tutor_sessions', s['id'])
    for o in sess['objectives'][1:]:
        o['status'] = 'demonstrated'
    client.store.put_knowledge('tutor_sessions', s['id'], sess)
    client.replies.append(reply(speaker='jo', say='Oh, that makes sense now!', done=True,
                                objectives=[{'objective': 0, 'status': 'demonstrated', 'quote': 'delete the key'}]))
    client.replies.append(reply(say='**What you showed**: all of it.'))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0001', 'text': 'On a write, delete the key'}))
    assert s['status'] == 'ended' and [t.get('debrief', False) for t in s['turns'][-2:]] == [False, True]


def test_open_gaps_reach_the_tutor_with_their_question(client):
    from server.knowledge_base import api as kb_api
    kb_api.open_gap(client.store, 'telegram', 'card-1', MISS, 'Load is requests times the miss rate.', 'Which rate sets DB load?', 'it is the hit rate', 1)
    start(client)
    gap = client.prompts[0]['OPEN_MISCONCEPTIONS'][0]
    assert gap['kind'] == 'gap' and gap['ask'] == 'Which rate sets DB load?' and gap['point'] == MISS
