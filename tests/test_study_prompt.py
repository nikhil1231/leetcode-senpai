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


def test_lesson_prompt_lists_every_idea_by_subtopic_with_its_status():
    t = sp.knowledge(VIEWS, MIS, 'system-design', lesson='a')
    assert 'Topic: Lesson a (System design > Cat c1)' in t
    assert 'Basics:\n- claim a1 [solid]' in t and 'Edges:\n- claim a2 [got it wrong last time]' in t
    assert 'Edges: I wrongly believed: caches are always fresh' in t and 'old news' not in t
    assert 'claim b1' not in t and 'live voice' in t


def test_category_and_section_prompts_summarise_lessons_and_name_the_weakest_ideas():
    t = sp.knowledge(VIEWS, MIS, 'system-design', category='c1')
    assert 'Topic: Cat c1 (System design)' in t
    assert '- Lesson a: 48% held' in t and '- Lesson b: 70% held' in t and 'Lesson d' not in t
    weak = t.split('Ideas I am weakest on:\n')[1]
    assert weak.index('claim a2') < weak.index('claim b1') and 'claim a1' not in weak  # misconception first, solid never
    s = sp.knowledge(VIEWS, MIS, 'system-design')
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
    r = client.get('/api/study-prompt', params={'section': 'system-design', 'lesson': 'cache-aside'})
    assert r.status_code == 200 and 'Topic: Cache-aside' in r.json()['prompt'] and 'never practised' in r.json()['prompt']
    assert client.get('/api/study-prompt', params={'section': 'system-design', 'lesson': 'nope'}).status_code == 404
    assert client.get('/api/study-prompt', params={'section': 'leetcode'}).status_code == 404  # nothing imported yet
