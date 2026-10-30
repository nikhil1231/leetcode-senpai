"""Adaptive lessons: pure planning, frozen sessions, tutor moments, variants and redesigns."""
import uuid

import pytest
from fastapi.testclient import TestClient

from server import auth, main, system_design_adaptive as adaptive, system_design_items as items
from server import system_design_learning as learning, system_design_session as session_api
from server import system_design_variants as variants, system_design_tutor as tutor, system_design_papers as papers
from server.system_design_curriculum import LESSONS, QUESTIONS
from tests.fake_store import FakeStore


def rid():
    return uuid.uuid4().hex


# ---------- Pure planning ----------
def test_sections_split_at_headings_and_keep_every_block_once():
    for key, lesson in LESSONS.items():
        if not lesson.get('blocks'):
            continue
        split = adaptive.sections(lesson)
        keys = [k for s in split['sections'] for k in s['blocks']] + split['finale']
        assert sorted(keys) == sorted(b['key'] for b in lesson['blocks'] if b['type'] != 'md'), key
        assert all(LESSONS[key]['blocks'][int(k[1:])]['type'] in adaptive.FINALE for k in split['finale'])


def test_lead_skips_callouts_tables_code_and_lists():
    text = '> [!story] x\n> y\n\n| a | b |\n|---|---|\n\n```py\nx = 1\n\nmore\n```\n\n- item\n\n**Key** point here.'
    assert adaptive.lead(text) == '**Key** point here.'


def test_unseen_lesson_probes_one_block_per_section_and_learns_everything():
    lesson = LESSONS['cache-aside']
    probes = adaptive.probes(lesson, {})
    assert 0 < len(probes) <= adaptive.MAX_PROBES
    sections = {k: s['id'] for s in adaptive.sections(lesson)['sections'] for k in s['blocks']}
    assert len({sections[p] for p in probes}) == len(probes)
    assert {s['mode'] for s in adaptive.plan(lesson, {})['sections']} == {'learn'}


def test_evidence_decides_modes_and_strong_warmups_skim_the_unknown_rest():
    lesson = LESSONS['cache-aside']
    secs = adaptive.sections(lesson)['sections']
    graded = [s for s in secs if any(items.gradeable(lesson['blocks'][int(k[1:])]) for k in s['blocks'])]
    held = {f'cache-aside:{k}': 'solid' for s in graded[:4] for k in s['blocks']}
    plan = {s['id']: s for s in adaptive.plan(lesson, held)['sections']}
    assert all(plan[s['id']]['mode'] == 'known' for s in graded[:4])
    assert all(plan[s['id']]['mode'] == 'skim' for s in secs if s not in graded[:4])
    # A wrong answer forces learn, and an override cannot mark it known.
    wrong = {**held, f'cache-aside:{graded[0]["blocks"][0]}': 'shaky'}
    p = adaptive.plan(lesson, wrong, overrides={graded[0]['id']: {'mode': 'known', 'note': 'n'}})
    assert next(s for s in p['sections'] if s['id'] == graded[0]['id'])['mode'] == 'learn'
    assert adaptive.plan(lesson, held, fresh=True)['sections'][1]['mode'] == 'learn'


def test_walkthroughs_are_attempt_first_with_fading_support():
    lesson = LESSONS['design-feed']
    assert adaptive.probes(lesson, {}) == []
    first = adaptive.plan(lesson, {}, position=0)
    later = adaptive.plan(lesson, {}, position=8)
    assert sum(s['attempt'] for s in first['sections']) == 2
    assert all(s['attempt'] for s in later['sections'] if s['title'])
    assert not adaptive.plan(LESSONS['tradeoffs'], {})['walkthrough']


def test_callbacks_prefer_shaky_then_fading_from_distinct_earlier_lessons():
    order = list(LESSONS)
    def view(qid, status, r):
        return {'id': qid, 'topic': QUESTIONS[qid]['lesson_id'], 'kind': 'quickfire', 'status': status, 'r': r}
    a, b = LESSONS['request-flow']['quickfire_ids'][:2]
    c = LESSONS['guarantees']['quickfire_ids'][0]
    late = LESSONS['tradeoffs']['quickfire_ids'][0]
    views = [view(a, 'fading', .5), view(b, 'shaky', .9), view(c, 'fading', .4), view(late, 'shaky', .1)]
    assert adaptive.callbacks('cache-aside', order, views) == [b, c]
    assert adaptive.callbacks('request-flow', order, views) == []


# ---------- API ----------
@pytest.fixture
def client(monkeypatch):
    store = FakeStore('alice')
    for module in (session_api, learning, items, papers):
        monkeypatch.setattr(module, 'get_store', lambda uid: store)
    monkeypatch.setattr(session_api.llm, 'enabled', lambda settings=None: False)
    main.app.dependency_overrides[auth.require_user] = lambda: 'alice'
    c = TestClient(main.app)
    c.store = store
    yield c
    main.app.dependency_overrides.clear()


def call(client, method, path, status=200, **body):
    r = client.request(method, '/api/system-design' + path, json=body if body or method == 'POST' else None)
    assert r.status_code == status, r.text
    return r.json()


def test_warmup_then_frozen_plan_survives_later_evidence(client):
    s = call(client, 'GET', '/course/lessons/cache-aside/session')
    assert not s['planned'] and s['probes'] and not s['tutor']
    first = s['probes'][0]
    call(client, 'POST', '/course/lessons/cache-aside/open')
    call(client, 'POST', '/course/lessons/cache-aside/activity', block=first, correct=True)
    planned = call(client, 'POST', '/course/lessons/cache-aside/plan', probes=s['probes'][:1], note='I know Redis')
    assert planned['planned'] and planned['probes'] == [first]
    section = next(x for x in planned['sections'] if first in x['blocks'])
    assert section['mode'] == 'known'
    others = [x for x in planned['sections'] if x['id'] != section['id']]
    # Later wrong answers don't collapse or reopen sections mid-lesson.
    for x in others:
        for k in x['blocks']:
            call(client, 'POST', '/course/lessons/cache-aside/activity', block=k, correct=True)
    again = call(client, 'GET', '/course/lessons/cache-aside/session')
    assert [x['mode'] for x in again['sections']] == [x['mode'] for x in planned['sections']]
    assert client.store.get_design_record('course_cache-aside')['plan']['self_report'] == 'I know Redis'
    reset = call(client, 'POST', '/course/lessons/cache-aside/plan/reset')
    assert not reset['planned']


def test_tutor_moments_save_learner_text_and_degrade_without_the_model(client):
    r = call(client, 'POST', '/course/lessons/cache-aside/tutor', section='s3', block='b5', answer='step 2',
             question='Why is delete better?')
    assert r['reply'] is None and 'not connected' in r['message']
    saved = [x for x in client.store.list_design_records() if x['kind'] == 'tutor']
    assert saved[0]['question'] == 'Why is delete better?'
    a = call(client, 'POST', '/course/lessons/design-feed/attempt', section='s1', text='Posts, follows, a feed.')
    assert a['feedback'] is None
    assert call(client, 'GET', '/course/lessons/design-feed/session')['attempts']['s1']['text'] == 'Posts, follows, a feed.'
    call(client, 'POST', '/course/lessons/design-feed/attempt', 422, section='s2', text='')
    assert call(client, 'POST', '/course/lessons/design-feed/attempt', section='s2', skip=True)['skipped']
    block = next(b['key'] for b in LESSONS['design-feed']['blocks'] if b['type'] == 'interview')
    p = call(client, 'POST', '/course/lessons/design-feed/pitch', block=block, text='Hybrid fan-out.')
    assert p['grade'] is None
    call(client, 'POST', '/course/lessons/design-feed/pitch', 404, block=block, followup=9, text='x')
    call(client, 'POST', '/course/lessons/design-feed/twist', 503, request_id=rid())


def test_tutor_results_are_stored_beside_raw_text(client, monkeypatch):
    monkeypatch.setattr(session_api.llm, 'enabled', lambda settings=None: True)
    async def fake_ask(schema, system, payload, settings=None, what=''):
        data = {tutor.TutorReply: {'reply': 'Because order.'},
                tutor.AttemptFeedback: {'got': ['posts'], 'missed': ['fan-out'], 'note': 'n'},
                tutor.Twist: {'scenario': 's', 'question': 'q', 'points': ['a', 'b', 'c'], 'model': 'm'},
                tutor.LessonPlan: {'intro': 'Focus on writes.', 'sections': [
                    {'id': 's1', 'mode': 'known', 'note': 'skip'}, {'id': 'zz', 'mode': 'learn', 'note': 'x'}]}}[schema]
        return {**data, 'model': 'm', 'prompt_version': 1}, None
    monkeypatch.setattr(tutor, 'ask', fake_ask)
    assert call(client, 'POST', '/course/lessons/cache-aside/tutor', section='s3', question='why?')['reply'] == 'Because order.'
    a = call(client, 'POST', '/course/lessons/design-feed/attempt', section='s1', text='Posts and a feed.')
    assert a['feedback']['missed'] == ['fan-out']
    t = call(client, 'POST', '/course/lessons/cache-aside/twist', request_id=rid())
    assert t['scenario'] == 's' and 'points' not in t
    async def grade(block, text, settings=None):
        return {'points': [{'point': p, 'status': 'covered', 'note': ''} for p in block['points']], 'feedback': 'f'}, None
    monkeypatch.setattr(session_api.coach, 'grade_recall', grade)
    answered = call(client, 'POST', f'/course/twists/{t["id"]}/answer', text='Shard it.')
    assert answered['points'] == ['a', 'b', 'c'] and answered['grade']['feedback'] == 'f'
    call(client, 'POST', '/course/lessons/cache-aside/plan')
    notes = call(client, 'POST', '/course/lessons/cache-aside/plan/notes')
    assert notes['intro'] == 'Focus on writes.'
    assert next(s for s in notes['sections'] if s['id'] == 's1')['mode'] == 'known'


def test_redesign_is_a_scheduled_ledger_item_with_self_marking(client):
    assert 'redesign:design-chat' in items.BY_ID and 'redesign:tradeoffs' not in items.BY_ID
    brief = call(client, 'GET', '/redesign/design-chat')
    assert brief['points'] >= 3 and brief['stages']
    call(client, 'GET', '/redesign/tradeoffs', 404)
    r = call(client, 'POST', '/redesign/design-chat', request_id=rid(), text='WebSocket gateways, per-chat sequence numbers.')
    assert r['score'] is None and r['points']
    done = call(client, 'POST', f'/redesign/{r["id"]}/self', covered=1)
    assert 0 < done['score'] < 0.75
    ledger = call(client, 'GET', '/ledger')
    assert ledger['redesign_due'] == [{'lesson_id': 'design-chat', 'title': LESSONS['design-chat']['title'], 'status': 'shaky'}]


# ---------- Variants ----------
def fake_variant(question):
    return {'prompt': 'A different scenario?', 'explanation': 'Because.',
            'choices': [{'text': 'Right', 'correct': True, 'why': 'yes'}, {'text': 'Wrong A', 'correct': False, 'why': 'no'},
                        {'text': 'Wrong B', 'correct': False, 'why': 'no'}], 'model': 'm', 'prompt_version': 1}


def test_variant_contract_keeps_identity_and_grades_its_own_answer():
    qid = next(q for q in QUESTIONS if variants.eligible(q) and QUESTIONS[q].get('format', 'choice') == 'choice')
    c = variants.contract(QUESTIONS[qid], fake_variant(None), 'variant_x')
    assert c['id'] == qid and c['variant_of'] == qid and c['prompt'] == 'A different scenario?'
    assert next(ch['text'] for ch in c['choices'] if ch['id'] == c['correct']) == 'Right'


def test_seen_quickfire_questions_come_back_as_variants(client, monkeypatch):
    monkeypatch.setattr(variants.llm, 'enabled', lambda settings=None: True)
    async def fake(question, lesson, settings=None):
        return fake_variant(question), None
    monkeypatch.setattr(tutor, 'variant', fake)
    qid = next(q for q in LESSONS['request-flow']['quickfire_ids'] if variants.eligible(q))
    first = call(client, 'POST', '/quickfire/next', request_id=rid(), question_id=qid)
    assert first['question']['prompt'] == QUESTIONS[qid]['prompt']
    call(client, 'POST', f'/quickfire/{first["id"]}/answer', question_id=qid, answer=QUESTIONS[qid]['correct'])
    assert len(variants.unused(client.store.list_design_records(), qid)) == 1
    second = call(client, 'POST', '/quickfire/next', request_id=rid(), question_id=qid)
    assert second['question']['prompt'] == 'A different scenario?'
    right = next(ch['id'] for ch in second['question']['choices'] if ch['text'] == 'Right')
    graded = call(client, 'POST', f'/quickfire/{second["id"]}/answer', question_id=qid, answer=right)
    assert graded['result']['correct']
    call(client, 'POST', '/quickfire/next', 422, request_id=rid(), question_id='nope')


def test_every_walkthrough_has_a_critique_appended_after_its_existing_blocks():
    # Block keys are positional and history is keyed by them, so new blocks only ever append.
    for key, lesson in LESSONS.items():
        if not items.is_walkthrough(lesson):
            continue
        blocks = [b for b in lesson['blocks'] if b['type'] != 'md']
        assert blocks[-1]['type'] == 'bug' and blocks[-1]['style'] == 'critique', key
        assert f'{key}:{blocks[-1]["key"]}' in items.BY_ID


def test_mistakes_collect_this_pass_from_raw_records():
    lesson = LESSONS['cache-aside']
    recall = next(b for b in lesson['blocks'] if b['type'] == 'recall')
    interview = next(b for b in lesson['blocks'] if b['type'] == 'interview')
    records = [
        {'kind': 'tutor', 'lesson_id': 'cache-aside', 'block': 'b1', 'answer': '9,000 reads/s', 'created_at': 200},
        {'kind': 'tutor', 'lesson_id': 'cache-aside', 'block': 'b1', 'answer': 'again', 'created_at': 201},
        {'kind': 'recall', 'lesson_id': 'cache-aside', 'block': recall['key'], 'text': 't', 'created_at': 210,
         'grade': {'points': [{'point': p, 'status': 'covered' if i else 'missing'} for i, p in enumerate(recall['points'])]}},
        {'kind': 'pitch', 'lesson_id': 'cache-aside', 'block': interview['key'], 'followup': 0, 'text': 'x', 'created_at': 220,
         'grade': {'verdict': 'adequate', 'missing': ['ordering']}},
        {'kind': 'pitch', 'lesson_id': 'cache-aside', 'block': interview['key'], 'followup': None, 'text': 'y', 'created_at': 221,
         'grade': {'verdict': 'strong', 'missing': []}},
        {'kind': 'tutor', 'lesson_id': 'cache-aside', 'block': 'b3', 'answer': 'old', 'created_at': 50},
        {'id': 'course_cache-aside', 'kind': 'course_lesson', 'lesson_id': 'cache-aside', 'at': 230,
         'activities': {'b1': {'first_correct': False, 'at': 205}, 'b5': {'first_correct': False, 'at': 206}}},
    ]
    found = adaptive.mistakes(lesson, records, since=100)
    sources = [m['source'] for m in found]
    assert sources == ['activity', 'written answer', 'interview answer', 'activity']
    assert found[0]['learner_answer'] == '9,000 reads/s'
    assert found[1]['missed_points'] == [recall['points'][0]]
    assert found[2]['question'] == interview['followups'][0]['q']
    assert found[3]['learner_answer'] == '' and 'b3' not in str(found)


def test_gap_questions_are_generated_from_mistakes_and_graded(client, monkeypatch):
    empty = call(client, 'POST', '/course/lessons/cache-aside/gaps', request_id=rid())
    assert empty['empty'] and not empty['questions']
    call(client, 'POST', '/course/lessons/cache-aside/open')
    call(client, 'POST', '/course/lessons/cache-aside/activity', block='b1', correct=False)
    call(client, 'POST', '/course/lessons/cache-aside/gaps', 503, request_id=rid())
    monkeypatch.setattr(session_api.llm, 'enabled', lambda settings=None: True)
    seen = {}
    async def fake(lesson, mistakes, settings=None):
        seen['mistakes'] = mistakes
        return {'theme': 'Miss rate drives load.', 'model': 'm', 'prompt_version': 2, 'questions': [
            {'targets': 'miss rate', 'question': 'New scenario?', 'points': ['a', 'b'], 'model': 'strong'}]}, None
    monkeypatch.setattr(tutor, 'gap_questions', fake)
    g = call(client, 'POST', '/course/lessons/cache-aside/gaps', request_id=rid())
    assert seen['mistakes'][0]['source'] == 'activity' and g['theme'] == 'Miss rate drives load.'
    assert 'points' not in g['questions'][0]
    async def grade(block, text, settings=None):
        return {'points': [{'point': p, 'status': 'covered', 'note': ''} for p in block['points']], 'feedback': 'f'}, None
    monkeypatch.setattr(session_api.coach, 'grade_recall', grade)
    answered = call(client, 'POST', f'/course/gaps/{g["id"]}/answer', n=0, text='Misses times requests.')
    assert answered['questions'][0]['grade']['feedback'] == 'f' and answered['questions'][0]['model'] == 'strong'
    call(client, 'POST', f'/course/gaps/{g["id"]}/answer', 404, n=3, text='x')


def test_progress_is_saved_per_pass_and_restored_with_the_session(client):
    s = call(client, 'GET', '/course/lessons/cache-aside/session')
    assert s['progress'] is None and s['plan_at'] is None
    warm = {'blocks': {'b1': {'i': 1}}, 'drafts': {'note': 'I know Redis'}}
    assert call(client, 'PUT', '/course/lessons/cache-aside/progress', plan_at=None, state=warm)['saved']
    assert call(client, 'GET', '/course/lessons/cache-aside/session')['progress'] == warm
    planned = call(client, 'POST', '/course/lessons/cache-aside/plan')
    assert planned['progress'] is None  # warm-up progress belongs to the unplanned pass; the client re-saves it
    state = {'page': 3, 'blocks': {'b1': {'i': 1}, 'b3': {'order': [0, 1]}}}
    assert call(client, 'PUT', '/course/lessons/cache-aside/progress', plan_at=planned['plan_at'], state=state)['saved']
    # Another device loads the same pass.
    assert call(client, 'GET', '/course/lessons/cache-aside/session')['progress'] == state
    # A stale device writing for an older pass is refused instead of clobbering.
    stale = call(client, 'PUT', '/course/lessons/cache-aside/progress', plan_at=None, state={'page': 0})
    assert not stale['saved'] and 're-planned' in stale['reason']
    reset = call(client, 'POST', '/course/lessons/cache-aside/plan/reset')
    assert reset['progress'] is None
    call(client, 'PUT', '/course/lessons/cache-aside/progress', 413, plan_at=None, state={'x': 'y' * 500_000})


def test_sort_mistakes_get_one_tutor_note_per_misplaced_item(client, monkeypatch):
    monkeypatch.setattr(session_api.llm, 'enabled', lambda settings=None: True)
    block = next(b for b in LESSONS['service-quality']['blocks'] if b['type'] == 'sort')
    picks = [(it['text'], block['buckets'][it['bucket'] if i else (it['bucket'] + 1) % len(block['buckets'])])
             for i, it in enumerate(block['items'])]
    answer = '; '.join(f'{t} → {b}' for t, b in picks)
    assert [w['item'] for w in tutor.misplaced(block, answer)] == [0]
    seen = {}
    async def fake_ask(schema, system, payload, settings=None, what=''):
        seen['schema'], seen['misplaced'] = schema, payload['misplaced']
        return {'reply': '', 'items': [{'item': 0, 'note': 'Serial.'}, {'item': 3, 'note': 'Not wrong.'}],
                'model': 'm', 'prompt_version': 5}, None
    monkeypatch.setattr(tutor, 'ask', fake_ask)
    section = next(s for s in adaptive.sections(LESSONS['service-quality'])['sections'] if block['key'] in s['blocks'])
    r = call(client, 'POST', '/course/lessons/service-quality/tutor', section=section['id'], block=block['key'], answer=answer)
    assert seen['schema'] is tutor.SortReply and seen['misplaced'][0]['item'] == 0
    assert r['items'] == [{'item': 0, 'note': 'Serial.'}] and r['reply'] == ''


def test_numbers_sheet_is_one_unfolded_page_without_a_warmup():
    lesson = LESSONS['numbers']
    assert lesson['reference'] and lesson['prerequisite'] == 'service-quality'
    assert len(adaptive.sections(lesson)['sections']) == 1
    assert adaptive.probes(lesson, {}) == []
    assert len(lesson['quickfire_ids']) >= 40


def test_estimate_gap_separates_near_misses_from_wrong_answers():
    from server.system_design_tutor import estimate_gap
    block = {'type': 'calc', 'answer': 14, 'tolerance': 1.08}
    near = estimate_gap(block, '10 shards (close: about 1.4× from the reference)')
    assert near['close'] and near['off_by_factor'] == 1.4 and near['learner_value'] == 10
    assert not estimate_gap(block, '3 shards')['close']
    assert estimate_gap({'type': 'calc', 'answer': 2e6}, '1.5m req/s')['close']
    assert estimate_gap(block, 'no idea') is None and estimate_gap({'type': 'quiz'}, '10') is None


def test_numeric_blanks_and_estimate_ranges():
    from server.system_design_lessons import LessonError, calc_bounds, numeric_blank
    assert numeric_blank('#18') == ('18', 18 * 0.9, 18 * 1.1)
    assert numeric_blank('#18:16-22') == ('18', 16, 22)
    for bad in ('#18:19-22', '#abc', '#18:16'):
        with pytest.raises(LessonError):
            numeric_blank(bad)
    assert calc_bounds({'answer': 14, 'range': [14, 16]}) == (14, 16)
    assert calc_bounds({'answer': 30}) == (20, 45)
    from server.system_design_tutor import estimate_gap
    assert estimate_gap({'type': 'calc', 'answer': 14, 'range': [14, 16]}, '13')['accepted_range'] == [14, 16]
