"""Study prompts: pure text for each scope, and the endpoint."""
import pytest
from fastapi.testclient import TestClient

from server import auth, main, study_prompt as sp
from tests.fake_store import FakeStore


def v(pid, status='unseen', lesson='a', category='c1', sub='Basics', section='system-design', r=0.0, mis=0):
    return {'id': pid, 'section': section, 'section_title': 'System design', 'category': category,
            'category_title': f'Cat {category}', 'lesson': lesson, 'lesson_title': f'Lesson {lesson}',
            'subtopic': sub, 'claim': f'claim {pid}', 'status': status, 'r': r, 'misconceptions': mis,
            'unconfirmed': False}


VIEWS = [v('a1', 'solid', r=0.95), v('a2', 'shaky', sub='Edges', mis=1), v('b1', 'fading', lesson='b', r=0.7),
         v('d1', category='c2', lesson='d'), v('f1', section='ai', lesson='z', category='cz')]
MIS = [{'point': 'a2', 'status': 'open', 'kind': 'belief', 'text': 'caches are always fresh', 'created_at': 1},
       {'point': 'b1', 'status': 'resolved', 'kind': 'gap', 'text': 'old news', 'created_at': 2}]


def test_lesson_prompt_numbers_every_idea_by_subtopic_with_its_status():
    t, refs = sp.knowledge(VIEWS, MIS, 'system-design', lesson='a', session='abc234')
    assert 'Topic: Lesson a (System design > Cat c1)' in t
    assert 'Basics:\n- P1: claim a1 [solid]' in t and 'Edges:\n- P2: claim a2 [got it wrong last time]' in t
    assert refs == {'P1': 'a1', 'P2': 'a2'}
    assert 'Edges: I wrongly believed: caches are always fresh' in t and 'old news' not in t
    assert 'claim b1' not in t and 'live voice' in t
    assert 'SENPAI-DEBRIEF session=abc234' in t
    assert 'SENPAI-DEBRIEF' not in sp.knowledge(VIEWS, MIS, 'system-design', lesson='a')[0]  # no session, no debrief


def test_category_and_section_prompts_summarise_lessons_and_name_the_weakest_ideas():
    t, refs = sp.knowledge(VIEWS, MIS, 'system-design', category='c1')
    assert 'Topic: Cat c1 (System design)' in t
    assert '- Lesson a: 48% held' in t and '- Lesson b: 70% held' in t and 'Lesson d' not in t
    weak = t.split('Ideas I am weakest on:\n')[1]
    assert weak.index('P1: claim a2') < weak.index('P2: claim b1') and 'claim a1' not in weak  # misconception first, solid never
    assert refs == {'P1': 'a2', 'P2': 'b1'}  # nothing unseen in c1, so nothing to learn next
    s, refs = sp.knowledge(VIEWS, MIS, 'system-design')
    assert 'Ideas to learn next, in course order:\n- P3: claim d1 (Lesson d)' in s and refs['P3'] == 'd1'
    assert 'Topic: System design\n' in s and '- Cat c2: not started' in s and 'claim f1' not in s


def test_an_empty_scope_has_no_prompt():
    assert sp.knowledge(VIEWS, MIS, 'system-design', lesson='nope') is None
    assert sp.knowledge([], [], 'fundamentals') is None
    assert sp.leetcode([], [], [], []) is None


def topic(cat, solved, total, mastery):
    return {'category': cat, 'solved': solved, 'total': total, 'mastery': mastery, 'weakness': 1 - mastery,
            'avg_confidence': 2.5 if solved else None, 'independence_rate': 0.5 if solved else None}


FAMILIES = [{'family': 'Foundations', 'solved': 2, 'total': 4, 'mastery': 0.6,
             'topics': [topic('Two Pointers', 2, 3, 0.6), topic('Stack', 0, 1, 0)]},
            {'family': 'DP', 'solved': 0, 'total': 1, 'mastery': 0, 'topics': [topic('1-D DP', 0, 1, 0)]}]
PROBLEMS = [{'slug': s, 'title': s.title(), 'difficulty': d, 'neetcode_category': c, 'in_library': True}
            for s, d, c in (('two-sum-ii', 'Medium', 'Two Pointers'), ('3sum', 'Medium', 'Two Pointers'),
                            ('valid-palindrome', 'Easy', 'Two Pointers'), ('min-stack', 'Medium', 'Stack'),
                            ('climb', 'Easy', '1-D DP'))]
ATTEMPTS = [{'id': 'x1', 'slug': 'two-sum-ii', 'solved_at': 1, 'independence': 'solo', 'confidence': 3},
            {'id': 'x2', 'slug': '3sum', 'solved_at': 1, 'unsolved': True},
            {'id': 'x3', 'slug': '3sum', 'solved_at': 2, 'independence': 'hints', 'confidence': 2},
            {'id': 'x4', 'slug': 'valid-palindrome', 'kind': 'sprint', 'solved_at': 3}]
ENRICH = [{'attempt_id': 'x3', 'mistake_tags': ['edge_case', 'tle'], 'mistake_summary': 'Forgot to skip duplicates'},
          {'attempt_id': 'x1', 'mistake_tags': ['edge_case'], 'mistake_summary': 'No mistake identified.'}]


def test_leetcode_topic_prompt_lists_problems_runs_and_mistakes():
    t = sp.leetcode(FAMILIES, PROBLEMS, ATTEMPTS, ENRICH, topic='Two Pointers')
    assert 'Topic: Two Pointers (LeetCode patterns > Foundations)' in t
    assert '- 3Sum (Medium): 2 attempts, last solved with hints, confidence 2 out of 3. Note: Forgot to skip duplicates' in t
    assert '- Two-Sum-Ii (Medium): 1 attempt, last solved on my own, confidence 3 out of 3\n' in t  # no empty note
    assert 'not tried yet: Valid-Palindrome (Easy)' in t  # a pattern drill is not an attempt
    assert '- missed edge cases (2 times)' in t and '- too slow (time limit exceeded) (1 time)' in t
    assert 'Min-Stack' not in t


def test_leetcode_family_and_map_prompts():
    f = sp.leetcode(FAMILIES, PROBLEMS, ATTEMPTS, ENRICH, family='Foundations')
    assert 'Topic: Foundations (LeetCode patterns)' in f and '- Stack: 0 of 1 problems solved, not started' in f
    assert '1-D DP' not in f and 'My weakest topics so far: Two Pointers' in f
    m = sp.leetcode(FAMILIES, PROBLEMS, ATTEMPTS, ENRICH)
    assert 'DP: 0 of 1 solved' in m and '- 1-D DP:' in m
    assert sp.leetcode(FAMILIES, PROBLEMS, ATTEMPTS, ENRICH, topic='Graphs') is None


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('me')
    monkeypatch.setattr(sp, 'get_store', lambda uid: store)
    main.app.dependency_overrides[auth.require_user] = lambda: 'me'
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_endpoint(client):
    r = client.post('/api/study-prompt', json={'section': 'system-design', 'lesson': 'cache-aside'})
    body = r.json()
    assert r.status_code == 200 and 'Topic: Cache-aside' in body['prompt'] and 'never practised' in body['prompt']
    assert f"SENPAI-DEBRIEF session={body['session']}" in body['prompt']
    assert client.post('/api/study-prompt', json={'section': 'system-design', 'lesson': 'nope'}).status_code == 404
    lc = client.post('/api/study-prompt', json={'section': 'leetcode'})
    assert lc.status_code == 404  # nothing imported yet


def test_a_pasted_debrief_previews_then_records_once(client, monkeypatch):
    from server.knowledge_base import api as kb_api
    store = sp.get_store('me')
    monkeypatch.setattr(kb_api, 'get_store', lambda uid: store)
    main.app.dependency_overrides[kb_api.caller] = lambda: {'uid': 'me', 'source': None}
    session = client.post('/api/study-prompt', json={'section': 'system-design', 'lesson': 'cache-aside'}).json()['session']
    refs = store.get_knowledge('study_sessions', session)['refs']
    text = (f'Sure! Here is your debrief:\n```\nSENPAI-DEBRIEF session={session}\nP1 right explain "nailed the miss-rate maths"\n'
            f'P2 wrong recall "thought a cache is optional for capacity"\nP3 partial apply "missed the mass-miss case"\n'
            f'P99 right recall\nNOTE "talked about CDNs too"\n```')
    preview = client.post('/api/study-prompt/debrief', json={'text': text}).json()
    assert preview['counts'] == {'right': 1, 'partial': 1, 'wrong': 1} and not preview['applied']
    assert preview['notes'] == ['talked about CDNs too'] and any('P99' in s for s in preview['skipped'])
    assert store.list_knowledge('knowledge_events') == []  # a preview records nothing

    done = client.post('/api/study-prompt/debrief', json={'text': text, 'apply': True}).json()
    assert done['applied'] and done['imported_at']
    events = {e['_key']: e for e in store.list_knowledge('knowledge_events')}
    assert set(events) == {f'voice-chat:{session}.P1', f'voice-chat:{session}.P2', f'voice-chat:{session}.P3'}
    first = events[f'voice-chat:{session}.P1']
    assert first['clean'] and first['strength'] == 'soft' and first['depth'] == 'explain' and first['points'] == [refs['P1']]
    assert events[f'voice-chat:{session}.P3']['partial']
    mis = {m['point']: m for m in store.list_knowledge('knowledge_misconceptions')}
    assert mis[refs['P2']]['kind'] == 'belief' and mis[refs['P2']]['text'] == 'thought a cache is optional for capacity'
    assert mis[refs['P3']]['kind'] == 'gap' and refs['P1'] not in mis

    points = {p['id']: p for p in client.get('/api/knowledge/points', params={'lesson': 'cache-aside'}).json()['points']}
    assert points[refs['P1']]['unconfirmed'] and points[refs['P2']]['status'] == 'shaky'

    again = client.post('/api/study-prompt/debrief', json={'text': text, 'apply': True}).json()
    assert not again['applied'] and len(store.list_knowledge('knowledge_events')) == 3


def test_debrief_errors(client):
    assert client.post('/api/study-prompt/debrief', json={'text': 'P1 right'}).status_code == 400
    assert client.post('/api/study-prompt/debrief', json={'text': 'SENPAI-DEBRIEF session=zzzzzz\nP1 right'}).status_code == 404
