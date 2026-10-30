"""Past papers: pure marking per item type, composition, and the sit → finish → mark flow."""
import uuid

import pytest
from fastapi.testclient import TestClient

from server import auth, main, system_design_items as items, system_design_papers as papers
from server.system_design_curriculum import LESSONS, QUESTIONS
from tests.fake_store import FakeStore


def rid():
    return uuid.uuid4().hex


def block_item(kind):
    return next(k for k, b in papers.BLOCKS.items() if b['type'] == kind)


def test_every_paper_item_has_a_contract_a_public_view_and_full_marks_for_the_right_answer():
    for item in papers.POOL:
        c = papers.contract(item['id'])
        assert c['max'] == papers.max_marks(item['id']) >= 1
        pub = papers.public(c, 0, 'seed')
        text = repr(pub)
        if c['type'] == 'recall':
            assert all(p not in text for p in c['b']['points'])
        if c['type'] == 'predict':
            assert 'reveal' not in pub and 'answer' not in pub


from server.system_design_lessons import numeric_blank


def right_answer(c):
    if c['type'] == 'question':
        q = c['q']
        return str(q['correct']) if q.get('format') == 'numeric' else q['correct']
    b = c['b']
    return {'predict': lambda: str(b['answer']), 'calc': lambda: str(b['answer']),
            'faded': lambda: [numeric_blank(m)[0] if m.startswith('#') else m.split('|')[0].strip() for m in papers.BLANK.findall(b['text'])],
            'sort': lambda: {str(i): it['bucket'] for i, it in enumerate(b['items'])},
            'order': lambda: [str(i) for i in range(len(b['items']))],
            'bug': lambda: list(b['bug'])}[c['type']]()


def test_right_answers_score_full_marks_and_blanks_score_zero():
    for item in papers.POOL:
        c = papers.contract(item['id'])
        if c['type'] == 'recall':
            assert papers.mark(c, 'some words')['marks'] is None
            assert papers.mark(c, '')['marks'] == 0
            continue
        assert papers.mark(c, right_answer(c))['marks'] == c['max'], item['id']
        assert papers.mark(c, None)['marks'] == 0, item['id']


def test_partial_credit_rules():
    calc = papers.contract(next(k for k, b in papers.BLOCKS.items()
                                if b['type'] == 'calc' and float(b.get('tolerance') or 1.5) >= 1.2))
    answer = float(calc['b']['answer'])
    factor = float(calc['b'].get('tolerance') or 1.5)
    assert papers.mark(calc, str(answer * factor * 1.1))['marks'] == 1
    assert papers.mark(calc, str(answer * factor ** 3))['marks'] == 0
    assert papers.number('20k') == 20000 and papers.number('1.5M') == 1.5e6
    order = papers.contract(next(k for k, b in papers.BLOCKS.items() if b['type'] == 'order' and len(b['items']) >= 4))
    n = len(order['b']['items'])
    swapped = [str(i) for i in range(n)]
    swapped[-1], swapped[-2] = swapped[-2], swapped[-1]
    assert papers.mark(order, swapped)['marks'] == 1
    multi = papers.contract(next(q for q in QUESTIONS if QUESTIONS[q].get('format') == 'multi'
                                 and len(QUESTIONS[q]['correct']) > 1 and q in items.BY_ID))
    assert papers.mark(multi, multi['q']['correct'][:1])['marks'] == 1


def test_compose_reaches_the_target_spreads_topics_and_puts_long_answers_last():
    picked = papers.compose(papers.POOL, {}, 30, 'seed')
    marks = sum(papers.max_marks(i['id']) for i in picked)
    assert 24 <= marks <= 32
    per_topic = {}
    for i in picked:
        per_topic[i['topic']] = per_topic.get(i['topic'], 0) + 1
    assert max(per_topic.values()) <= 2
    assert sum(i['kind'] == 'recall' for i in picked) <= 2
    kinds = [i['kind'] == 'recall' for i in picked]
    assert kinds == sorted(kinds)
    assert papers.compose(papers.POOL, {}, 30, 'seed') == picked


@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    monkeypatch.setattr(papers, 'get_store', lambda uid: store)
    monkeypatch.setattr(items, 'get_store', lambda uid: store)
    monkeypatch.setattr(papers.llm, 'enabled', lambda settings=None: False)
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    c = TestClient(main.app)
    c.store = store
    yield c
    main.app.dependency_overrides.clear()


def post(client, path, **body):
    r = client.post('/api/system-design' + path, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_sit_finish_and_self_mark_a_topic_paper(client):
    paper = post(client, '/papers', request_id=rid(), scope='topic', value='cache-aside', length='standard')
    assert paper['status'] == 'sitting' and all(p['topic'] == 'cache-aside' for p in paper['items'])
    assert 'contract' not in repr(paper) and 'results' not in paper
    doc = client.store.get_design_record(paper['id'])
    recall_n = None
    for it in doc['items']:
        c = it['contract']
        if c['type'] == 'recall':
            recall_n = it['n']
            post(client, f'/papers/{paper["id"]}/answer', n=it['n'], value='Cache-aside reads the cache first.')
        else:
            post(client, f'/papers/{paper["id"]}/answer', n=it['n'], value=right_answer(c))
    done = post(client, f'/papers/{paper["id"]}/finish', elapsed_sec=300)
    full = sum(p['max'] for p in done['items'])
    if recall_n is None:
        assert done['status'] == 'marked' and done['totals']['pct'] == 100
        return
    assert done['status'] == 'self_mark' and done['totals']['grade'] is None
    recall = next(p for p in done['items'] if p['n'] == recall_n)
    marked = post(client, f'/papers/{paper["id"]}/self-mark', n=recall_n, covered=list(range(len(recall['scheme']))))
    assert marked['status'] == 'marked' and marked['totals']['marks'] == full
    assert marked['totals']['grade']['grade'] == 'A*'
    ledger = client.get('/api/system-design/ledger').json()
    assert ledger['knowledge'] >= len(done['items']) - 0.01
    listing = client.get('/api/system-design/papers').json()
    assert listing['papers'][0]['grade'] == 'A*' and listing['sitting'] is None
    assert client.post(f'/api/system-design/papers/{paper["id"]}/answer', json={'n': 0, 'value': 'x'}).status_code == 409


def test_review_and_mistakes_papers_need_something_to_review(client):
    r = client.post('/api/system-design/papers', json={'request_id': rid(), 'scope': 'mistakes'})
    assert r.status_code == 422
    assert client.post('/api/system-design/papers', json={'request_id': rid(), 'scope': 'topic', 'value': 'nope'}).status_code == 422


def test_model_marks_written_answers_and_writes_a_report(client, monkeypatch):
    async def grade(block, text, settings=None):
        return {'points': [{'point': p, 'status': 'covered', 'note': ''} for p in block['points']],
                'feedback': 'Good.', 'model': 'test'}, None
    async def report(rows, settings=None):
        return {'summary': 'Solid.', 'notes': [], 'focus': ['caching'], 'model': 'test'}, None
    monkeypatch.setattr(papers.llm, 'enabled', lambda settings=None: True)
    monkeypatch.setattr(papers.coach, 'grade_recall', grade)
    monkeypatch.setattr(papers.coach, 'examiner_report', report)
    lesson = next(k for k in LESSONS if any(b['type'] == 'recall' for b in LESSONS[k]['blocks']))
    paper = post(client, '/papers', request_id=rid(), scope='topic', value=lesson, length='long')
    doc = client.store.get_design_record(paper['id'])
    for it in doc['items']:
        if it['contract']['type'] == 'recall':
            post(client, f'/papers/{paper["id"]}/answer', n=it['n'], value='An answer with enough words.')
    post(client, f'/papers/{paper["id"]}/finish', elapsed_sec=10)
    marked = client.get(f'/api/system-design/papers/{paper["id"]}').json()
    assert marked['status'] == 'marked' and marked['report']['summary'] == 'Solid.'
    recall = [p for p in marked['items'] if p['type'] == 'recall']
    assert recall and all(marked['results'][str(p['n'])]['marks'] == p['max'] for p in recall)


def test_explicit_ranges_mark_one_sided_answers():
    shards = papers.contract(next(k for k, b in papers.BLOCKS.items() if b.get('range')))
    assert [papers.mark(shards, v)['marks'] for v in ('13', '14', '16', '17')] == [1, 2, 2, 1]
    fanout = papers.contract(next(k for k, b in papers.BLOCKS.items() if '#18:16-22' in b.get('text', '')))
    blanks = right_answer(fanout)
    assert papers.mark(fanout, blanks)['marks'] == fanout['max']
    assert papers.mark(fanout, ['20' if x == '18' else x for x in blanks])['marks'] == fanout['max']
    assert papers.mark(fanout, ['90' if x == '98' else x for x in blanks])['marks'] == fanout['max'] - 1
