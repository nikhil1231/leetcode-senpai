"""Learning policy regressions: no credentials, model calls or executable user code."""
import asyncio
import itertools
import random

from server import assessment, curriculum, importer, learning_evidence as evidence
from server import learning_sequences as lessons, packs, practice_queue, practice_state, scheduler


def test_taxonomy_is_order_independent_and_preserves_overrides(store):
    for tags in itertools.permutations(['Array', 'Matrix', 'Breadth-First Search']):
        assert packs.category_from_tags(tags) == 'Graphs'
    for slug, category in [('accounts-merge','Graphs'), ('flood-fill','Graphs'),
                           ('01-matrix','Graphs'), ('maximal-square','2-D DP')]:
        old = {'category_override': 'Stack'}
        assert curriculum.classify(slug, ['Array'])['neetcode_category'] == category
        assert curriculum.classify(slug, ['Array'], old)['neetcode_category'] == 'Stack'
        doc = importer._problem_doc(slug, {}, None, 'Arrays & Hashing', ['grind75'])
        assert doc['neetcode_category'] == category
        assert set(doc['skill_ids']) <= curriculum.SKILLS.keys()
        assert importer._problem_doc(slug, doc, None, 'Arrays & Hashing', ['grind75']) == doc
    assert packs.category_from_tags(['Matrix']) == 'Unclassified'
    assert packs.category_from_tags(['Depth-First Search']) != 'Trees'


def test_every_topic_has_reachable_entry_without_easy():
    problems = [{'slug': slug, 'title': slug, 'difficulty': 'Medium',
                 'neetcode_category': cat} for cat, slug in curriculum.STARTERS.items()]
    for p in problems:
        assert curriculum.eligible(p, problems, [])
    # An unavailable designated starter has a finite fallback.
    p = {'slug':'alternate', 'difficulty':'Medium', 'neetcode_category':'2-D DP'}
    assert curriculum.eligible(p, [p], [])
    def visit(skill, path):
        assert skill not in path
        for parent in curriculum.SKILLS[skill]['prerequisites']:
            visit(parent, path + [skill])
    for skill in curriculum.SKILLS:
        visit(skill, [])


def test_three_assisted_attempts_do_not_unlock_hard():
    p = {'slug':'hard', 'difficulty':'Hard', 'neetcode_category':'Graphs'}
    problems = [p, {'slug':'number-of-islands','difficulty':'Medium','neetcode_category':'Graphs'}]
    attempts = [{'slug': 'number-of-islands', 'independence':'hints', 'solved_at':i*86400} for i in range(3)]
    assert not curriculum.eligible(p, problems, attempts)


def test_model_objection_cannot_rewrite_judge_and_style_is_not_retention():
    a = {'id':'a', 'code':'saved code', 'submission_id':'123', 'independence':'solo'}
    normalized = assessment.normalize(a, {}, {'correctness_objections':[{'verification':'reproduced'}]})
    assert normalized['execution_status'] == 'accepted'
    assert normalized['dimensions']['constraints'] == 'unknown'
    assert normalized['correctness_objections'][0]['verification'] == 'unverified'
    assert scheduler.solution_quality(3, 'solo', 0) == scheduler.solution_quality(3, 'solo', 5)
    assert assessment.normalize({**a, 'unsolved':True}, {})['execution_status'] == 'ended_unsolved'


def test_counterexample_verification_rejects_stale_code_and_disproves_false_claim():
    a = {'code':'immutable submission'}
    claim = {'input':'[1,2,0]', 'expected_output':'[0,1,2]',
             'claimed_actual_output':'[1,0,2]', 'explanation':'skipped zero'}
    async def run(code, data):
        assert code == a['code'] and data == '[1,2,0]'
        return {'status':'completed','actual_output':'[0,1,2]', 'code_identity':assessment.code_identity(code)}
    result = asyncio.run(assessment.verify_objection(a, claim, run, lambda _: True))
    assert result['verification'] == 'disproved'
    async def stale(code, data):
        return {'status':'completed','actual_output':'[1,0,2]', 'code_identity':'editor-buffer'}
    assert asyncio.run(assessment.verify_objection(a, claim, stale, lambda _: True))['verification'] == 'unverified'
    async def broken(code, data):
        return {'status':'completed','actual_output':'[1,0,2]', 'code_identity':assessment.code_identity(code)}
    assert asyncio.run(assessment.verify_objection(a, claim, broken, lambda _: True))['verification'] == 'reproduced'
    assert asyncio.run(assessment.verify_objection(a, claim, broken, lambda _: False))['verification'] == 'invalid_input'


def test_same_episode_exposure_survives_retry_but_later_attempt_is_independent():
    old = {'id':'a','slug':'p','solved_at':1,'independence':'solution'}
    retry = {'id':'b','slug':'p','solved_at':100,'independence':'solo'}
    assert assessment.independence(assessment.episode_attempt(retry,[old])) == 'solution'
    later = {**retry,'solved_at':86402}
    assert assessment.independence(assessment.episode_attempt(later,[old])) == 'solo'
    assert assessment.assistance({'hint_level_used':2,'independence':'solo'}) == 'unknown'


def test_reducer_corrections_are_idempotent_and_unknown_is_not_success():
    event = {'id':'e','revision':0,'skill':'dp.state','task':'a','format':'implementation',
             'outcome':'success','help':'none','at':1,'episode':'one'}
    corrected = {**event,'revision':1,'help':'solution'}
    assert evidence.reduce([corrected,event,event]) == evidence.reduce([event,corrected])
    assert evidence.reduce([event,event])['dp.state']['implementation_tasks'] == 1
    assert evidence.reduce([event])['dp.state']['ready'] is False
    assert evidence.reduce([corrected])['dp.state']['implementation_tasks'] == 0
    attempts = [{'id':'a','slug':'accounts-merge','submission_id':'1','independence':'solo'}]
    assert evidence.project([],attempts) == []  # teaching tags do not prove union-find


def test_quickfire_immediate_successes_cannot_compound_and_guess_retracts():
    events = [{'question_id':str(i), 'template':'a', 'answered_at':100+i,
               'correct':True} for i in range(10)]
    s = practice_state.rebuild(events)
    assert s['spaced_successes'] == 1 and s['due_at'] == 100+86400
    events[0] = {**events[0], 'guessed':True, 'revision':1}
    assert practice_state.rebuild(events)['spaced_successes'] == 0
    assert practice_state.rebuild(events) == practice_state.rebuild(list(reversed(events))+events)
    later = {'question_id':'later','template':'a','answered_at':100+86400+10,'correct':True}
    assert practice_state.rebuild(events+[later])['spaced_successes'] == 1


def test_quickfire_display_records_exposure_and_four_item_gap_is_real():
    exposed = {'question_id':'x','template':'a','exposed_at':10,'exposure_only':True}
    state = practice_state.rebuild([exposed])
    assert state['last_exposure'] == 10 and state['spaced_successes'] == 0
    assert practice_queue.pick({'a':'T'},[],['a'],100,random.Random(1)) is None
    miss = {'question_id':'x','template':'a','answered_at':1,'correct':False}
    assert practice_queue.pick({'a':'T'},[miss],['a','b'],100,random.Random(1)) is None
    assert practice_queue.pick({'a':'T'},[miss],['a','b','c','d','e'],100,random.Random(1)) == 'a'
    assert practice_queue.pick({'a':'T'},[miss],['a','b','c','d','e','a','b','c','d','e'],100,random.Random(1)) is None


def test_fake_history_matches_production_500_window_but_state_remembers(store):
    for i in range(501):
        store.save_light_practice(str(i), {'question_id':str(i),'template':'old' if i==0 else 'other',
                                         'answered_at':i+1,'correct':True})
    assert len(store.list_light_practice()) == 500
    assert store.list_practice_state()['old']['spaced_successes'] == 1
    assert len(list(store.iter_light_practice(page_size=100))) == 501


def test_authored_sequences_have_separate_held_out_content_and_valid_objectives():
    assert len(lessons.SEQUENCES) == 6
    for key, lesson in lessons.SEQUENCES.items():
        assert lesson['skill'] in curriculum.SKILLS
        assert set(('principle','worked','explain','objective','code','incorrect')) <= lesson.keys()
        assert 'probe' not in lessons.public(key) and 'accepted' not in lessons.public(key)
        for answer in lesson['accepted']:
            assert lessons.check(key, answer)
        assert not lessons.check(key, 'nonsense')
    # Independent outcomes for authored examples.
    assert sorted([1,2,0]) == [0,1,2]
    assert oct(int('77',8)+1)[2:] == lessons.SEQUENCES['carry']['probe']['accepted'][0]
    intervals = [(1,4),(2,9),(6,7)]
    actual = [min((b-a+1 for a,b in intervals if a<=q<=b),default=-1) for q in [4,5,7,10]]
    assert actual == [4,8,2,-1]
    assert 1+min(2,1,2) == 2
    assert min(3+1,2+1,1+1) == 2


def test_timing_missing_is_missing_and_failed_time_is_in_denominator():
    records = [{'time_taken_sec':None}, {'time_taken_sec':3600,'unsolved':True},
               {'timing':{'elapsed_sec':3600,'source':'measured'}}]
    result = evidence.evaluate(records, [])
    assert result['recorded_hours'] == 2
    assert result['reliable_time_proportion'] == .5
    assert result['missing_time_records'] == 1
    assert evidence.timing({'time_taken_sec':0})['source'] == 'estimated'

# Exercise the existing authenticated API harness as well as the pure policies.
from tests.test_api import client  # noqa: E402,F401
from server import main  # noqa: E402


def test_hinted_recall_keeps_help_and_updates_only_approach_card(client, monkeypatch):
    async def hint(*args, **kwargs):
        return 'Use a lookup table'
    monkeypatch.setattr(main.coach, 'recall_hint', hint)
    client.store.upsert_review('two-sum', {'slug':'two-sum','due_date':'2000-01-01'})
    assert client.post('/api/review/recall/hint', json={'slug':'two-sum'}).json()['hint']
    # Deliberately omit client hints: server provenance must survive.
    r = client.post('/api/review/recall', json={'slug':'two-sum','recall_text':'lookup','confidence':3}).json()
    attempt = client.store.get_attempt(r['attempt_id'])
    assert attempt['independence'] == 'hints'
    assert r['review']['quality'] <= 3
    assert client.store.get_review('two-sum')['due_date'] == '2000-01-01'
    assert client.store.get_approach_review('two-sum') is not None


def test_recovery_and_delayed_application_preserve_session_and_raw_history(client, monkeypatch):
    monkeypatch.setitem(main.config.LEARNING_FEATURES, 'recovery', True)
    clock = [100]
    monkeypatch.setattr(main.time, 'time', lambda: clock[0])
    sid = client.store.add_session({'slug':'sort-colors','started_at':10,'status':'active',
                                    'hint_level':0,'kind':'new'})
    offer = client.get('/api/learning/recovery').json()
    assert offer['sequence'] == 'partition'
    opened = client.post('/api/learning/sequence', json={'sequence':'partition'}).json()
    lesson = client.get('/api/learning/sequence/partition').json()
    assert 'probe' not in lesson and 'accepted' not in lesson
    completed = client.post('/api/learning/sequence', json={'sequence':'partition','action':'complete',
        'answer':'right -= 1','explanation':'Incoming value is unknown'}).json()
    assert completed['correct'] and not client.store.attempts
    s = client.store.get_session(sid)
    assert s['started_at'] == 10 and s['assistance_events'][0]['kind'] == 'solution'
    key = next(iter(client.store.learning_state))
    assert client.get('/api/learning/application/'+key).status_code == 404
    clock[0] += 7*86400
    check = client.get('/api/learning/application/'+key).json()
    assert 'skill' not in check and 'title' not in check
    result = client.post('/api/learning/application', json={'id':key,'answer':'right only','elapsed_sec':20}).json()
    assert result['probe_correct'] and result['probe_delay_sec'] == 7*86400
    # Retry is the same observation, not another success.
    again = client.post('/api/learning/application', json={'id':key,'answer':'wrong'}).json()
    assert again == result
    summary = client.get('/api/learning/evidence').json()
    assert summary['evaluation']['passed'] == 1 and summary['evaluation']['attempted'] == 1
    assert client.store.get_session(sid)['started_at'] == 10


def test_online_choices_exposure_cannot_be_omitted_from_answer(client):
    q = client.get('/api/practice/question/fill-search').json()
    client.post('/api/practice/exposure', json={'question_id':q['id'],'choices':True})
    from server import practice
    solution = practice.from_id(q['id'])['answer']
    answer = client.post('/api/practice/answer',json={'question_id':q['id'],'answer':solution}).json()
    assert answer['correct'] and answer['assisted']
    assert client.store.list_practice_state()['fill-search']['spaced_successes'] == 0


def test_authored_partial_solutions_preserve_invariants():
    # Run only repository-authored fixtures, never learner expressions in APIs.
    code = lessons.SEQUENCES['partition']['code'].replace('___','right -= 1')
    env = {'nums':[1,2,0], 'scan':1, 'right':2}
    exec(code, env)
    assert env['nums'] == [1,0,2] and env['scan'] == 1 and env['right'] == 1
    dp = lessons.SEQUENCES['dp-storage']['code'].replace('___','old_top')
    env = {'dp':[1,2], 'j':1, 'diagonal':2}
    exec(dp, env)
    assert env['dp'] == [1,2] and env['diagonal'] == 2
    merge = lessons.SEQUENCES['intervals']['code'].replace('___', 'max(end, b)')
    env = {'end':9,'b':5}
    exec(merge,env)
    assert env['end'] == 9  # a contained interval cannot shorten the merged one


def test_saved_sort_colors_regression_matches_independent_reference():
    import json
    from pathlib import Path
    fixture = json.loads((Path(__file__).parent/'fixtures'/'sort_colors_regression.json').read_text())
    assert assessment.code_identity(fixture['code']) == assessment.SORT_COLORS_CORRECTION['code_identity']
    scope = {}
    exec('from typing import *\n'+fixture['code'], scope)
    solver = scope['Solution']()
    for n in range(1,10):
        for values in itertools.product(range(3),repeat=n):
            nums = list(values)
            solver.sortColors(nums)
            assert nums == sorted(values)


def test_taxonomy_migration_is_resumable_and_preserves_source_data(store):
    from scripts.migrate_learning import changes
    store.upsert_problem({'slug':'accounts-merge','neetcode_category':'Arrays & Hashing',
                          'leetcode_tags':['Array','Union Find'],'packs':['grind75'], 'content_html':'statement'})
    store.add_attempt({'slug':'accounts-merge','code':'saved code','solved_at':1})
    before = store.list_attempts()
    pending = changes(store, 'taxonomy')
    assert len(pending) == 1
    for _, slug, old, new in pending:
        store.upsert_problem(new)
        assert new['content_html'] == old['content_html']
    assert changes(store, 'taxonomy') == []
    assert store.list_attempts() == before


def test_offline_browser_replay_preserves_original_answer_time(client):
    r = client.post('/api/practice/answer', json={'question_id':'v1:fill-search:5','answer':'0',
        'answered_at':1000,'exposed_at':900,'elapsed_sec':100}).json()
    assert r['answered_at'] == 1000 and r['exposed_at'] == 900
    again = client.post('/api/practice/answer', json={'question_id':'v1:fill-search:5','answer':'1'}).json()
    assert again['answered_at'] == 1000


def test_old_displayed_application_cannot_claim_unseen_transfer(client, monkeypatch):
    monkeypatch.setitem(main.config.LEARNING_FEATURES, 'recovery', True)
    client.store.save_learning_state('probe', {'sequence':'carry','opened_at':1,
        'last_exposure_at':1,'probe_due_at':2,'probe_opened_at':3})
    r = client.post('/api/learning/application',json={'id':'probe','answer':'100'}).json()
    assert r['probe_correct'] and not r['probe_novel']
    assert client.get('/api/learning/evidence').json()['evaluation']['passed'] == 0


def test_late_recall_assessment_cannot_move_a_newer_approach_card(store):
    old = store.add_attempt({'slug':'p','solved_at':10})
    newer = store.add_attempt({'slug':'p','solved_at':20})
    card = {'slug':'p','source_attempt':newer,'due_date':'2030-01-01'}
    store.upsert_approach_review('p',card)
    assert main._save_approach_card(store,'p',{'due_date':'2026-01-01'},old) == card
    assert store.get_approach_review('p') == card
