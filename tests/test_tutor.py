"""The tutor: story state, prompts, parsing and grounding, and full sessions over HTTP with scripted models."""
import json

import pytest
from fastapi.testclient import TestClient

from server import auth, config, llm, main
from server.tutor import api, lessons, session as ses, story
from tests.fake_store import FakeStore

L = lessons.get('system-design', 'cache-aside')
MISS = 'sd.cache-aside.db-load-is-miss-rate'
DELETE = 'sd.cache-aside.delete-beats-set'


def notes(**over):
    base = {'objectives': [], 'evidence': [], 'misconceptions': [], 'resolved': [], 'summary': '', 'story_event': ''}
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


# ---- prompts, parsing and grounding ---------------------------------------------------------


def fresh(mode='teach'):
    s = ses.new('s1', L, mode, 0)
    s['turns'].append({'role': 'tutor', 'speaker': 'tutor', 'say': 'Hi.', 'show_block': '', 'at': 0})
    s['turns'].append({'role': 'learner', 'text': 'Load on the DB is requests times the miss rate, so 99% is ten times better than 90%', 'key': 'k1', 'at': 1})
    return s


def system(s, mis=(), memory=None, debrief=False):
    return ses.system(s, L, [], list(mis), memory or {}, story.scale(summary(0)), debrief=debrief)


def test_quotes_must_come_from_the_learner():
    assert ses.quoted('requests times the miss rate', 'Load is Requests  times the MISS rate!')
    assert not ses.quoted('hit rate', 'requests times the miss rate') and not ses.quoted('a', 'a b c')


def test_each_mode_has_its_own_role_and_only_teach_teaches():
    prompts = {m: system(ses.new('s', L, m, 0)) for m in ses.MODES}
    assert len(set(prompts.values())) == len(ses.MODES)
    assert 'enthusiastic' in prompts['teach'] and '[[activity KEY]]' in prompts['teach']
    assert all('[[activity KEY]]' not in p and '<private>' in p for m, p in prompts.items() if m != 'teach')
    assert 'never teach' in prompts['explain'] and 'believe him' in prompts['explain']
    assert 'THE SESSION IS OVER' not in prompts['explain']
    assert 'Postmortem' in system(ses.new('s', L, 'war-room', 0), debrief=True)
    assert all('Lesson notes' in p and 'Ripple' in p for p in prompts.values())


def test_the_tutor_judges_ideas_not_wording_and_gaps_are_background():
    gap = {'_key': 'telegram:c1', 'point': MISS, 'text': 'Load is requests times the miss rate.', 'quote': 'it is the hit rate', 'status': 'open'}
    p = system(fresh(), mis=[gap], memory={'summary': 'Last time: TTLs.'})
    assert 'understands the idea in general' in p and "Don't open by reviewing last time" in p
    assert 'Load is requests times the miss rate.' in p and 'it is the hit rate' not in p and "don't drill them" in p
    assert 'Last session on this lesson: Last time: TTLs.' in p


def test_messages_are_a_chat_and_blocks_read_as_learner_turns():
    s = fresh()
    s['turns'] += [{'role': 'tutor', 'speaker': 'tutor', 'say': 'Try this.', 'show_block': 'b1', 'at': 2},
                   {'role': 'block', 'block': 'b1', 'correct': False, 'key': 'k2', 'at': 3}]
    m = ses.messages(s, L)
    assert [x['role'] for x in m] == ['user', 'assistant', 'user', 'assistant', 'user']
    assert m[0]['content'] == ses.OPENING and m[3]['content'].endswith('[[activity b1]]')
    assert m[4]['content'].startswith('(I did the activity') and m[4]['content'].endswith('got it wrong.)')
    assert ses.messages(s, L, debrief=True)[-1]['content'].startswith('(The session has ended')


def test_parse_strips_markers_and_keeps_only_valid_new_activities():
    s = fresh()
    say, show, private = ses.parse('**Tutor:** Nice one.\n\nHave a go.\n[[activity b1]]\n<private>flaw: no TTL</private>', s, L)
    assert (say, show, private) == ('Nice one.\n\nHave a go.', 'b1', 'flaw: no TTL')
    s['shown'] = ['b1']
    assert ses.parse('Again [[activity b1]] or [[activity b99]]', s, L)[1] == ''
    assert ses.parse('Go [[ACTIVITY b1]]', fresh('explain'), L)[1] == ''


def test_replies_fold_in_with_the_mode_speaker_and_private_notes():
    s = fresh('critique')
    turn = ses.add_reply(s, 'Here is the design. <private>Planted: write-through on a cold path.</private>', L, 2)
    assert turn['speaker'] == 'marcus' and turn['say'] == 'Here is the design.' and turn['show_block'] == ''
    assert s['notes'] == 'Planted: write-through on a cold path.'
    assert 'notes' not in ses.public(s)
    t = ses.add_reply(fresh(), 'Go on [[activity b1]]', L, 2)
    assert t['speaker'] == 'tutor' and t['show_block'] == 'b1'


def test_notes_keep_only_grounded_evidence():
    s = fresh()
    said, blocks = ses.latest_learner(s)
    n = notes(objectives=[{'objective': 2, 'status': 'demonstrated', 'quote': 'requests times the miss rate'},
                          {'objective': 0, 'status': 'demonstrated', 'quote': 'something they never said'},
                          {'objective': 9, 'status': 'working', 'quote': 'miss rate'}],
              evidence=[{'point': MISS, 'clean': True, 'depth': 'explain', 'quote': 'requests times the miss rate'},
                        {'point': MISS, 'clean': True, 'depth': 'explain', 'quote': 'miss rate'},
                        {'point': DELETE, 'clean': True, 'depth': 'recall', 'quote': 'delete the key'},
                        {'point': 'sd.not-this-lesson.x', 'clean': True, 'depth': 'recall', 'quote': 'miss rate'}],
              misconceptions=[{'point': MISS, 'text': 'thinks 99% is only slightly better', 'quote': 'invented quote'}],
              resolved=['tutor:m1', 'tutor:unknown'], summary='Has the miss-rate rule.')
    writes, _ = ses.apply_notes(s, n, said, blocks, {MISS, DELETE}, {'tutor:m1'}, 2)
    assert s['objectives'][2]['status'] == 'demonstrated' and s['objectives'][0]['status'] == 'open'
    assert [e['point'] for e in writes['evidence']] == [MISS]
    assert writes['misconceptions'] == [] and writes['resolved'] == ['tutor:m1'] and s['summary'] == 'Has the miss-rate rule.'


def test_objectives_never_regress_and_a_correct_block_can_demonstrate():
    s = ses.new('s1', L, 'teach', 0)
    s['turns'].append({'role': 'block', 'block': 'b1', 'correct': True, 'key': 'k1', 'at': 1})
    said, blocks = ses.latest_learner(s)
    ses.apply_notes(s, notes(objectives=[{'objective': 2, 'status': 'demonstrated', 'quote': ''}]), said, blocks, set(), set(), 2)
    assert s['objectives'][2]['status'] == 'demonstrated'
    s['turns'].append({'role': 'learner', 'text': 'not sure about the miss rate', 'key': 'k2', 'at': 3})
    said, blocks = ses.latest_learner(s)
    ses.apply_notes(s, notes(objectives=[{'objective': 2, 'status': 'working', 'quote': 'miss rate'}]), said, blocks, set(), set(), 4)
    assert s['objectives'][2]['status'] == 'demonstrated'


def test_wrong_claims_reach_the_debrief_and_all_shown_asks_for_a_wrap_up():
    s = fresh('explain')
    said, blocks = ses.latest_learner(s)
    ses.apply_notes(s, notes(misconceptions=[{'point': MISS, 'text': 'thinks 99% is only slightly better', 'quote': 'ten times better'}]),
                    said, blocks, {MISS}, set(), 2)
    assert s['mistakes'] == [{'point': MISS, 'text': 'thinks 99% is only slightly better', 'quote': 'ten times better'}]
    assert 'He said "ten times better": thinks 99% is only slightly better' in system(s, debrief=True)
    for o in s['objectives']:
        o['status'] = 'demonstrated'
    assert 'He has now shown every objective' in system(s)
    ses.end(s, 3)
    assert ses.needs_debrief(s)
    ses.add_debrief(s, 'What you did well: …', 4)
    assert s['turns'][-1]['debrief'] and not ses.needs_debrief(s)


# ---- HTTP ------------------------------------------------------------------------------

@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    monkeypatch.setattr(api, 'get_store', lambda uid: store)
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    c = TestClient(main.app)
    c.store, c.replies, c.notes, c.chats, c.payloads = store, [], [], [], []

    def chat(model, messages, options=None):
        assert not llm.forbidden_model(model) and model == config.TUTOR_MODEL
        c.chats.append(messages)
        nxt = c.replies.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return {'content': nxt, 'usage': {'prompt_tokens': 100, 'completion_tokens': 20}}

    def generate(provider, model, system, prompt, schema, options=None):
        assert schema is ses.Notes and model == config.TUTOR_NOTES_MODEL and system == ses.NOTES_SYSTEM
        c.payloads.append(json.loads(prompt))
        nxt = c.notes.pop(0) if c.notes else notes()
        if isinstance(nxt, Exception):
            raise nxt
        return {'content': json.dumps(nxt), 'usage': {}}
    monkeypatch.setattr(llm, '_raw_chat', chat)
    monkeypatch.setattr(llm, '_raw_generate', generate)
    yield c
    main.app.dependency_overrides.clear()


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def start(c, key='sess-0001', mode='teach'):
    c.replies.append('A deploy changed every cache key. What happens to the database?')
    return ok(c.post('/api/tutor/sessions', json={'section': 'system-design', 'lesson': 'cache-aside', 'mode': mode, 'key': key}))


def test_a_session_from_start_to_finish(client):
    s = start(client)
    assert s['turns'][0]['say'].startswith('A deploy') and s['progress'] == {'demonstrated': 0, 'total': 4}
    assert client.chats[0][0]['role'] == 'system' and client.chats[0][1]['content'] == ses.OPENING
    assert client.payloads == []   # nothing to note before the learner speaks
    client.replies.append('Ooh, right. Try this one.\n[[activity b1]]')
    client.notes.append(notes(
        objectives=[{'objective': 2, 'status': 'working', 'quote': 'every read misses'}],
        evidence=[{'point': MISS, 'clean': True, 'depth': 'apply', 'quote': 'every read misses and hits the database'}],
        misconceptions=[{'point': DELETE, 'text': 'thinks setting the cache on write is always safe', 'quote': 'just set the new value'}],
        summary='Knows mass misses hit the DB.', story_event='Priya: the key-format outage, diagnosed.'))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0001',
        'text': 'Every read misses and hits the database at once. On writes I would just set the new value.'}))
    assert s['turns'][-1]['show_block'] == 'b1' and s['turns'][-1]['say'] == 'Ooh, right. Try this one.'
    assert s['shown'] == ['b1'] and s['objectives'][2]['status'] == 'working'
    assert s['turns'][-1]['recorded'] == {'evidence': 1, 'misconceptions': 1, 'resolved': 0}
    assert client.payloads[-1]['LATEST'].startswith('Every read misses')
    assert client.chats[-1][-1] == {'role': 'user', 'content': 'Every read misses and hits the database at once. On writes I would just set the new value.'}
    events = client.store.list_knowledge('knowledge_events')
    assert [(e['source'], e['strength'], e['points'], e['depth']) for e in events] == [('tutor', 'soft', [MISS], 'apply')]
    mis = client.store.list_knowledge('knowledge_misconceptions')
    assert mis[0]['point'] == DELETE and mis[0]['status'] == 'open'

    client.replies.append('Nice. Now: why delete rather than set?')
    client.notes.append(notes(resolved=[mis[0]['_key']]))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0002', 'block': {'key': 'b1', 'correct': True}}))
    assert client.chats[-1][-1]['content'].startswith('(I did the activity') and client.payloads[-1]['LATEST_ACTIVITIES']
    assert client.payloads[-1]['OPEN_MISCONCEPTIONS'][0]['point'] == DELETE
    assert client.store.list_knowledge('knowledge_misconceptions')[0]['status'] == 'resolved'

    client.replies.append('**What you did well**: the miss storm.')
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/end'))
    assert s['status'] == 'ended' and s['turns'][-1]['debrief'] and s['turns'][-1]['speaker'] == 'tutor'
    assert 'THE SESSION IS OVER' in client.chats[-1][0]['content']
    assert 'just set the new value' in client.chats[-1][0]['content']
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
    client.replies.append('Back again.')
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0001', 'text': 'my answer'}))
    assert 'error' not in s and [t['role'] for t in s['turns']] == ['tutor', 'learner', 'tutor']
    again = ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0001', 'text': 'my answer'}))
    assert len(again['turns']) == 3 and client.replies == []


def test_a_failed_note_does_not_stop_the_turn(client):
    s = start(client)
    client.replies.append('Go on.')
    client.notes.append(RuntimeError('notes down'))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0001', 'text': 'every read misses'}))
    assert 'error' not in s and s['turns'][-1]['say'] == 'Go on.' and s['turns'][-1]['recorded']['evidence'] == 0


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


def test_course_track_lessons_and_role_play_work_too(client):
    client.replies.append('Morning! What even is a chunk? [[activity b1]] <private>He has said nothing yet.</private>')
    s = ok(client.post('/api/tutor/sessions', json={'section': 'ai', 'lesson': 'rag', 'mode': 'explain', 'key': 'sess-rag01'}))
    assert s['turns'][0]['speaker'] == 'jo' and s['turns'][0]['show_block'] == '' and 'notes' not in s
    assert s['turns'][0]['say'] == 'Morning! What even is a chunk?'
    assert 'You ARE Jo' in client.chats[0][0]['content']
    assert client.store.get_knowledge('tutor_sessions', s['id'])['notes'] == 'He has said nothing yet.'


def test_without_the_model_the_tutor_is_cleanly_unavailable(client, monkeypatch):
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    assert ok(client.get('/api/tutor'))['enabled'] is False
    r = client.post('/api/tutor/sessions', json={'section': 'system-design', 'lesson': 'cache-aside', 'key': 'sess-0003'})
    assert r.status_code == 503 and 'lesson itself still works' in r.json()['detail']


def test_an_unused_session_ends_without_a_debrief(client):
    s = start(client, mode='explain')
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/end'))
    assert s['status'] == 'ended' and not s['debrief_due'] and len(client.chats) == 1


def test_a_failed_debrief_can_be_written_again(client):
    s = start(client, mode='interview')
    client.replies.append('OK. Go deeper.')
    ok(client.post(f'/api/tutor/sessions/{s["id"]}/turns', json={'key': 'turn-0001', 'text': 'I would cache it'}))
    client.replies.append(RuntimeError('provider down'))
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/end'))
    assert s['status'] == 'ended' and s['debrief_due'] and s['error']
    client.replies.append('Feedback: mixed for senior.')
    s = ok(client.post(f'/api/tutor/sessions/{s["id"]}/end'))
    assert not s['debrief_due'] and 'error' not in s and s['turns'][-1]['say'] == 'Feedback: mixed for senior.'


def test_open_gaps_reach_the_tutor_as_background(client):
    from server.knowledge_base import api as kb_api
    kb_api.open_gap(client.store, 'telegram', 'card-1', MISS, 'Load is requests times the miss rate.', 'Which rate sets DB load?', 'it is the hit rate', 1)
    start(client)
    system_prompt = client.chats[0][0]['content']
    assert 'Load is requests times the miss rate.' in system_prompt and 'Which rate sets DB load?' not in system_prompt


def test_a_reply_with_nothing_visible_is_asked_again(client):
    client.replies += ['<private>Planted: no TTL.</private>', 'Morning! Here is piece one. <private>Planted: no TTL.</private>']
    s = ok(client.post('/api/tutor/sessions', json={'section': 'system-design', 'lesson': 'cache-aside', 'mode': 'critique', 'key': 'sess-crit1'}))
    assert s['turns'][0]['say'] == 'Morning! Here is piece one.' and len(client.chats) == 2


def test_characters_bring_their_own_personality():
    from server import voice
    for mode, who in (('explain', 'jo'), ('critique', 'marcus'), ('war-room', 'priya'), ('interview', 'marcus')):
        assert voice.persona(who) in system(ses.new('s', L, mode, 0))
    assert voice.TUTOR in system(ses.new('s', L, 'teach', 0)) and voice.TUTOR in system(fresh('explain'), debrief=True)
    assert voice.persona('marcus').startswith("Marcus, Ripple's CTO and co-founder: ")
    assert voice.lead('jo', 'p1') == voice.lead('jo', 'p1') and voice.lead('jo', 'p1') in voice.member('jo')['leads']
