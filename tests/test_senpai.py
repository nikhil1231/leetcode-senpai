"""Senpai: authority limits, evidence handling, sessions, follow-through and the Job Scout boundary."""
import asyncio
import datetime as dt
import json

import pytest
from fastapi.testclient import TestClient

from server import auth, config, llm, main
from server.senpai import (api, capabilities, demand, interventions, jobscout, policy, service, sessions,
                           snapshot, teach)
from tests.fake_store import FakeStore

DAY = 86400
NOW = int(dt.datetime(2026, 10, 21, 12, tzinfo=dt.timezone.utc).timestamp())
LIM = policy.limits({})


def plan():
    return policy.default_plan({}, NOW)


# ---- policy -------------------------------------------------------------------------------------

def test_rebalance_is_damped_capped_per_week_and_floored_at_protected_minimums():
    p = plan()
    decision, _, eff = policy.classify(p, {'kind': 'rebalance', 'target': {'system_design': 0.9}, 'confidence': 'high'}, LIM, NOW)
    assert decision == 'auto'
    moved = policy.shift(p['allocation'], eff['target'])
    assert moved <= LIM['max_weekly_shift'] + 1e-6
    assert eff['target']['dsa'] >= p['protected']['dsa']
    p2 = policy.apply(p, eff, NOW)
    assert p2['revision'] == 2 and p2['movement']['moved'] == pytest.approx(moved, abs=1e-3)
    # The weekly budget is spent: a second automatic move this week waits.
    decision, reasons, _ = policy.classify(p2, {'kind': 'rebalance', 'target': {'system_design': 0.9}, 'confidence': 'high'}, LIM, NOW + 60)
    assert decision == 'defer' and 'used up' in reasons[0]
    # Next ISO week, movement is available again.
    assert policy.classify(p2, {'kind': 'rebalance', 'target': {'system_design': 0.9}, 'confidence': 'high'}, LIM, NOW + 7 * DAY)[0] == 'auto'


def test_low_confidence_moves_less_than_high_confidence():
    p = {**plan(), 'movement': {}}
    lim = {**LIM, 'max_weekly_shift': 1.0}
    low = policy.damp(p, {'system_design': 0.6}, 'low', lim, NOW)
    high = policy.damp(p, {'system_design': 0.6}, 'high', lim, NOW)
    assert p['allocation']['system_design'] < low['system_design'] < high['system_design']


def test_large_or_authority_changes_need_approval():
    p = plan()
    assert policy.classify(p, {'kind': 'rebalance', 'target': {'dsa': 0.2}, 'immediate': True}, LIM, NOW)[0] == 'approval'
    for kind in ('set_protected', 'weekly_minutes', 'authority'):
        assert policy.classify(p, {'kind': kind}, LIM, NOW)[0] == 'approval'
    assert policy.classify(p, {'kind': 'objective_remove', 'objective_id': 'core-dsa'}, LIM, NOW)[0] == 'approval'
    assert policy.classify(p, {'kind': 'nonsense'}, LIM, NOW)[0] == 'reject'


def test_focus_limits_cooldown_and_sustained_market_evidence():
    p = plan()
    known = {'dsa:a', 'dsa:b', 'dsa:c', 'dsa:d'}
    for cid in ('dsa:a', 'dsa:b', 'dsa:c'):
        assert policy.classify(p, {'kind': 'focus_add', 'capability_id': cid}, LIM, NOW, known)[0] == 'auto'
        p = policy.apply(p, {'kind': 'focus_add', 'capability_id': cid}, NOW)
    assert policy.classify(p, {'kind': 'focus_add', 'capability_id': 'dsa:d'}, LIM, NOW, known)[0] == 'approval'
    p = policy.apply(p, {'kind': 'focus_remove', 'capability_id': 'dsa:a'}, NOW)
    assert policy.classify(p, {'kind': 'focus_add', 'capability_id': 'dsa:a'}, LIM, NOW + DAY, known)[0] == 'defer'
    assert policy.classify(p, {'kind': 'focus_add', 'capability_id': 'dsa:a'}, LIM, NOW + 8 * DAY, known)[0] == 'auto'
    market = {'kind': 'focus_add', 'capability_id': 'dsa:d', 'basis': 'market', 'sustained_weeks': 1}
    assert policy.classify(p, market, LIM, NOW, known)[0] == 'defer'
    assert policy.classify(p, {**market, 'sustained_weeks': 2}, LIM, NOW, known)[0] == 'auto'
    assert policy.classify(p, {'kind': 'focus_add', 'capability_id': 'dsa:zzz'}, LIM, NOW, known)[0] == 'reject'


def test_interview_overlays_are_temporary_and_bounded():
    p = plan()
    ov = {'kind': 'overlay_add', 'basis': 'interview', 'allocation': {'system_design': 1}, 'weight': 0.4,
          'starts_at': NOW, 'expires_at': NOW + 5 * DAY, 'source_ref': 'x'}
    assert policy.classify(p, ov, LIM, NOW)[0] == 'auto'
    assert policy.classify(p, {**ov, 'weight': 0.8}, LIM, NOW)[0] == 'approval'
    assert policy.classify(p, {**ov, 'expires_at': NOW + 40 * DAY}, LIM, NOW)[0] == 'approval'
    p2 = policy.apply(p, ov, NOW)
    assert policy.classify(p2, ov, LIM, NOW)[0] == 'reject'  # one overlay per source
    during = policy.effective_allocation(p2, NOW + DAY)
    assert during['system_design'] > p['allocation']['system_design']
    assert during['dsa'] >= p['protected']['dsa'] - 1e-6
    assert p2['allocation'] == p['allocation']  # the plan itself is unchanged
    assert policy.effective_allocation(p2, NOW + 6 * DAY) == policy._normalise(p['allocation'])


# ---- demand -------------------------------------------------------------------------------------

def context(roles=10, last_seen='2026-10-20', interviews=()):
    return {'version': 1, 'fingerprint': 'f', 'demand': {'cohort': {'roles': roles}, 'tags': [
        {'tag': 'distributed systems', 'roles': 6, 'companies': 5, 'share': 0.6, 'last_seen': last_seen},
        {'tag': 'kubernetes', 'roles': 5, 'companies': 4, 'share': 0.5, 'last_seen': last_seen},
        {'tag': 'communication', 'roles': 2, 'companies': 2, 'share': 0.2, 'last_seen': last_seen}]},
        'interviews': {'upcoming': list(interviews), 'debriefs': []}, 'uncertainty': []}


def test_repeated_vacancies_are_not_new_evidence():
    week1 = demand.brief(context(), {}, '2026-W43', NOW)
    assert week1['signals']['sd:distributed']['weeks'] == 1
    same = demand.brief(context(), week1['signals'], '2026-W44', NOW + 7 * DAY)
    assert same['signals']['sd:distributed']['weeks'] == 1
    again = demand.brief(context(), week1['signals'], '2026-W43', NOW + DAY)
    assert again['signals']['sd:distributed']['weeks'] == 1  # same week counts once
    fresh = demand.brief(context(last_seen='2026-10-27'), week1['signals'], '2026-W44', NOW + 7 * DAY)
    assert fresh['signals']['sd:distributed']['weeks'] == 2
    assert demand.focus_candidates(fresh['signals'], 2)[0]['capability_id'] == 'sd:distributed'
    # Kubernetes has lessons (Fundamentals: Cloud and delivery), so it is curriculum, not outside it.
    assert [o['tag'] for o in week1['outside']] == []
    k8s = next(m for m in week1['mapped'] if m['tag'] == 'kubernetes')
    assert (k8s['bucket'], k8s['capability_id']) == ('stack', 'track:fundamentals:infrastructure')
    assert demand.classify_tag('typescript') == ('stack', None)   # no lessons: outside the curriculum, not a gap
    assert {m['bucket'] for m in week1['mapped']} == {'system_design', 'behavioural', 'stack'}


def test_imminent_interviews_become_expiring_overlays():
    start = dt.datetime.fromtimestamp(NOW + 3 * DAY, dt.timezone.utc).isoformat()
    later = dt.datetime.fromtimestamp(NOW + 20 * DAY, dt.timezone.utc).isoformat()
    exp = {'documented': [{'statement': 'One design round'}], 'reported_unconfirmed': [], 'predicted': [{'topics': ['caching']}]}
    br = demand.brief(context(interviews=[
        {'id': 1, 'company': 'Acme', 'round': 'system_design', 'round_label': 'System design', 'starts_at': start, 'expectations': exp},
        {'id': 2, 'company': 'Far', 'round': 'technical', 'starts_at': later, 'expectations': exp},
        {'id': 3, 'company': 'Hr', 'round': 'recruiter_screen', 'starts_at': start, 'expectations': exp}]), {}, 'w', NOW)
    assert [o['source_ref'] for o in br['overlays']] == ['job_scout:interview:1']
    assert br['overlays'][0]['expires_at'] == NOW + 4 * DAY
    assert br['interviews'][0]['documented'] == ['One design round']
    assert br['interviews'][0]['predicted_topics'] == ['caching']


# ---- capabilities -------------------------------------------------------------------------------

def problems():
    return [{'slug': 'two-sum', 'title': 'Two Sum', 'neetcode_category': 'Arrays & Hashing', 'difficulty': 'Easy', 'packs': ['neetcode150']},
            {'slug': 'valid-parentheses', 'title': 'Valid Parentheses', 'neetcode_category': 'Stack', 'difficulty': 'Easy', 'packs': ['neetcode150']}]


def attempt(aid, slug, at, **kw):
    return {'id': aid, 'slug': slug, 'solved_at': at, 'submission_id': aid, 'independence': 'solo', 'confidence': 3,
            'demonstrated_skill_ids': [kw.pop('skill', 'hash.lookup')], **kw}


def test_capability_status_describes_evidence_not_the_person():
    old = NOW - 40 * DAY
    rows, events = capabilities.build(problems(), [attempt('a1', 'two-sum', old)], [], now=NOW, today='2026-10-21')
    by = {r['id']: r for r in rows}
    assert by['dsa:hash.lookup']['status'] == 'stale'           # not practised recently: check, don't remediate
    assert by['dsa:stack.order']['status'] == 'untested'        # nothing recorded: unknown, not weak
    assert by['sd:caching']['status'] == 'untested'
    assisted = attempt('a2', 'valid-parentheses', NOW - DAY, skill='stack.order', assistance_events=[{'kind': 'solution'}])
    rows, _ = capabilities.build(problems(), [assisted], [], now=NOW, today='2026-10-21')
    assert {r['id']: r for r in rows}['dsa:stack.order']['status'] == 'needs_check'
    assert events['dsa:hash.lookup'][0]['id'].startswith('attempt:a1')


# ---- sessions -----------------------------------------------------------------------------------

def queue():
    return {'reviews': [{'slug': 'two-sum', 'title': 'Two Sum', 'category': 'Arrays & Hashing', 'difficulty': 'Easy', 'mode': 'recall'}],
            'new': [{'slug': 'valid-parentheses', 'title': 'Valid Parentheses', 'category': 'Stack', 'difficulty': 'Medium'}],
            'learning_checks': [{'id': 'chk1', 'due_at': NOW}], 'learning_recovery': None}


SD = {'next_lesson': 'l1', 'lessons': [{'id': 'l1', 'category': 'caching', 'title': 'Cache basics', 'minutes': 12, 'due': 0, 'mistakes': 0}]}


def caps(status='stale'):
    return [{'id': 'dsa:hash.lookup', 'bucket': 'dsa', 'name': 'Arrays & Hashing', 'status': status, 'signals': {}},
            {'id': 'sd:caching', 'bucket': 'system_design', 'name': 'Caching', 'status': 'untested', 'signals': {}}]


def test_sessions_fit_the_budget_lead_with_checks_and_mix_subjects():
    p = policy.apply(plan(), {'kind': 'focus_add', 'capability_id': 'dsa:hash.lookup'}, NOW)
    s = sessions.prepare(p, NOW, '2026-10-21', caps(), queue(), SD, {'Arrays & Hashing'}, budget=60)
    assert s['blocks'][0]['kind'] == 'application_check'
    assert s['planned_minutes'] <= 63
    assert {b['bucket'] for b in s['blocks']} == {'dsa', 'system_design'}
    kinds = [b['kind'] for b in s['blocks']]
    assert 'diagnostic' in kinds                     # a stale focus gets a quick check first...
    assert 'explain' not in kinds and 'lesson_sequence' not in kinds   # ...not remedial teaching
    short = sessions.prepare(p, NOW, '2026-10-21', caps(), queue(), SD, {'Arrays & Hashing'}, budget=15)
    assert len(short['blocks']) < len(s['blocks'])   # no fixed number of items
    assert short['planned_minutes'] <= 18


def test_session_modes_restrict_activity_and_interview_mode_is_unassisted():
    p = plan()
    r = sessions.prepare(p, NOW, 'd', caps(), queue(), SD, {'Arrays & Hashing'}, budget=60, mode='retrieval')
    assert {b['activity'] for b in r['blocks']} <= {'check', 'retrieval'}
    i = sessions.prepare(p, NOW, 'd', caps(), queue(), SD, set(), budget=90, mode='interview')
    assert i['blocks'] and {b['activity'] for b in i['blocks']} <= {'implementation', 'design'}
    assert all(b['action'].get('interview') for b in i['blocks'] if b['activity'] == 'implementation')
    o = sessions.prepare(p, NOW, 'd', caps(), queue(), SD, set(), budget=60, objective='sd-course')
    assert {b['bucket'] for b in o['blocks']} == {'system_design'}


# ---- interventions ------------------------------------------------------------------------------

def test_interventions_track_trying_and_outcome_from_evidence():
    item = interventions.new('daily', 'Recall before re-solving', 'r', ['dsa:x'], 'independent recall', NOW)
    events = {'dsa:x': [{'id': 'e1', 'at': NOW + DAY, 'outcome': 'failure', 'help': 'solution'}]}
    mid = interventions.evaluate(item, events, NOW + 2 * DAY)
    assert mid['tried_at'] == NOW + DAY and mid['outcome'] == 'pending'
    assert interventions.evaluate(item, events, NOW + 8 * DAY)['outcome'] == 'not_helped'
    events['dsa:x'].append({'id': 'e2', 'at': NOW + 3 * DAY, 'outcome': 'success', 'help': 'none'})
    assert interventions.evaluate(item, events, NOW + 8 * DAY)['outcome'] == 'helped'
    assert interventions.evaluate(item, {}, NOW + 8 * DAY)['outcome'] == 'not_tried'
    accepted = {**interventions.evaluate(item, {}, NOW + 8 * DAY), 'response': 'accepted'}
    assert interventions.ineffective([accepted]) == [accepted]


# ---- service, with storage ----------------------------------------------------------------------

def seeded():
    store = FakeStore('senpai')
    for p in problems():
        store.upsert_problem(p)
    store.add_attempt(attempt('a1', 'two-sum', NOW - 40 * DAY))
    store.update_settings({'target_job': 'Backend engineer', 'daily_coach_timezone': 'UTC'})
    return store


def test_changes_route_by_permission_and_execute_once():
    store = seeded()
    r = service.propose(store, {'kind': 'focus_add', 'capability_id': 'dsa:hash.lookup', 'rationale': 'stale'},
                        source='daily', now=NOW, run_key='daily:2026-10-20')
    assert r['decision'] == 'auto' and r['plan']['revision'] == 2
    again = service.propose(store, {'kind': 'focus_add', 'capability_id': 'dsa:hash.lookup', 'rationale': 'stale'},
                            source='daily', now=NOW, run_key='daily:2026-10-20')
    assert again['decision'] == 'duplicate'
    big = service.propose(store, {'kind': 'set_protected', 'bucket': 'stack', 'share': 0.3}, source='weekly', now=NOW)
    assert big['decision'] == 'approval'
    pid = big['proposal']['id']
    assert service.propose(store, {'kind': 'set_protected', 'bucket': 'stack', 'share': 0.3}, source='weekly', now=NOW)['decision'] == 'approval'
    assert len(store.list_senpai('senpai_proposals')) == 1      # the same proposal is not queued twice
    out = service.resolve_proposal(store, pid, True, NOW + 60)
    assert out['plan']['protected']['stack'] == 0.3 and out['proposal']['status'] == 'approved'
    with pytest.raises(LookupError):
        service.resolve_proposal(store, pid, True, NOW + 61)
    kinds = [d['decision'] for d in store.list_senpai('senpai_decisions')]
    assert {'auto', 'approval', 'approved'} <= set(kinds)


def test_plan_writes_are_revision_checked():
    store = seeded()
    p = service.load_plan(store, NOW)
    service.save_plan(store, policy.apply(p, {'kind': 'focus_add', 'capability_id': 'dsa:hash.lookup'}, NOW), p['revision'])
    with pytest.raises(ValueError):
        service.save_plan(store, policy.apply(p, {'kind': 'focus_add', 'capability_id': 'dsa:stack.order'}, NOW), p['revision'])


def fake_context(monkeypatch, ctx):
    monkeypatch.setattr(config, 'JOB_SCOUT_URL', 'http://job-scout:8765')
    monkeypatch.setattr(config, 'JOB_SCOUT_TOKEN', 't')
    monkeypatch.setattr(jobscout, 'fetch', lambda: ctx)


def test_job_scout_sync_mirrors_the_target_and_survives_outages(monkeypatch):
    store = seeded()
    ctx = {**context(), 'career_target': {'text': 'Senior backend engineer'}, 'generated_at': 'x'}
    fake_context(monkeypatch, ctx)
    rec = jobscout.sync(store, NOW)
    assert rec['career_target'] == 'Senior backend engineer'
    assert store.get_settings()['target_job'] == 'Senior backend engineer'
    assert store.get_settings()['target_job_source'] == 'job_scout'

    def down():
        raise OSError('connection refused')
    monkeypatch.setattr(jobscout, 'fetch', down)
    rec = jobscout.sync(store, NOW + 60)
    assert rec['error'].startswith('OSError') and rec['context'] == ctx      # the last good copy is kept
    assert store.get_settings()['target_job'] == 'Senior backend engineer'


def test_weekly_applies_interview_overlay_and_explains_without_a_model(monkeypatch):
    store = seeded()
    start = dt.datetime.fromtimestamp(NOW + 2 * DAY, dt.timezone.utc).isoformat()
    exp = {'documented': [], 'reported_unconfirmed': [], 'predicted': []}
    fake_context(monkeypatch, {**context(interviews=[{'id': 9, 'company': 'Acme', 'round': 'technical',
                                                       'round_label': 'Technical', 'starts_at': start,
                                                       'expectations': exp}]), 'career_target': {'text': None}})
    monkeypatch.setattr(llm, 'enabled', lambda settings=None: False)
    rec = asyncio.run(service.weekly(store, NOW))
    plan = service.load_plan(store, NOW)
    assert [o['source_ref'] for o in plan['overlays']] == ['job_scout:interview:9']
    assert 'No model review' in rec['summary']
    assert store.get_settings()['target_job'] == 'Backend engineer'   # empty Job Scout target: local fallback kept
    assert asyncio.run(service.weekly(store, NOW + 60)) == rec                # once per week unless forced
    asyncio.run(service.weekly(store, NOW + 120, force=True))
    assert len(service.load_plan(store, NOW)['overlays']) == 1                # and the overlay is not duplicated


def test_weekly_model_changes_are_validated(monkeypatch):
    store = seeded()
    fake_context(monkeypatch, {**context(), 'career_target': {'text': 'x'}})
    monkeypatch.setattr(llm, 'enabled', lambda settings=None: True)
    out = {'summary': 'Small shift.', 'explanation': ['More design.'], 'questions': ['How much time outside the app?'],
           'changes': [
               {'kind': 'rebalance', 'target_system_design': 0.5, 'confidence': 'medium', 'basis': 'market',
                'rationale': 'Design demand', 'evidence_ids': ['job_scout:tag:distributed systems']},
               {'kind': 'focus_add', 'capability_id': 'sd:caching', 'confidence': 'high', 'basis': 'learning',
                'rationale': 'x', 'evidence_ids': ['made-up']}]}
    monkeypatch.setattr(llm, '_raw_generate', lambda *a, **k: json.dumps(out))
    rec = asyncio.run(service.weekly(store, NOW))
    assert [d['decision'] for d in rec['decisions']][-2:] == ['auto', 'reject']
    plan = service.load_plan(store, NOW)
    assert 0.30 < plan['allocation']['system_design'] < 0.5           # damped, not jumped
    assert store.get_senpai('senpai', 'state')['questions'][0]['text'] == 'How much time outside the app?'
    q = store.get_senpai('senpai', 'state')['questions'][0]
    service.answer_question(store, q['id'], 'About two hours a week', NOW)
    assert service.answers_for_prompt(store.get_senpai('senpai', 'state'))[0]['answer'] == 'About two hours a week'


def test_teaching_records_assistance_on_an_active_run(monkeypatch):
    store = seeded()
    sid = store.add_session({'slug': 'two-sum', 'status': 'active', 'started_at': NOW})
    monkeypatch.setattr(llm, 'enabled', lambda settings=None: True)
    replies = iter([
        {'reply': 'What do you store in the map?', 'move': 'diagnose', 'assistance': 'clarification',
         'actions': [{'tool': 'find_resources', 'capability_id': 'dsa:hash.lookup', 'days': None, 'note': ''}], 'exercise': None},
        {'reply': 'Store value→index; check the complement first.', 'move': 'explain', 'assistance': 'conceptual_hint',
         'actions': [{'tool': 'request_checkpoint', 'capability_id': 'dsa:hash.lookup', 'days': 5, 'note': 'retention'}],
         'exercise': {'prompt': 'Pairs summing to k', 'answer_outline': 'complement map'}}])
    seen = []

    def gen(provider, model, system, prompt, schema, **kw):
        seen.append(json.loads(prompt))
        return json.dumps(next(replies))
    monkeypatch.setattr(llm, '_raw_generate', gen)
    log = asyncio.run(teach.turn(store, 'dsa:hash.lookup', 'How does two-sum work?', mode='independent', now=NOW))
    assert seen[1]['tool_results'][0]['tool'] == 'find_resources'           # one bounded lookup round
    assert log['assistance'] == 'conceptual_hint' and log['recorded_on_run']
    assert store.get_session(sid)['assistance_events'][-1]['source'] == 'senpai'
    assert log['exercise']['provenance'] == 'generated_unvalidated'
    assert any(i['capability_ids'] == ['dsa:hash.lookup'] for i in store.list_senpai('senpai_interventions'))
    monkeypatch.setattr(llm, 'enabled', lambda settings=None: False)
    with pytest.raises(teach.TeachUnavailable):
        asyncio.run(teach.turn(store, 'dsa:hash.lookup', 'again', now=NOW))


def test_snapshot_renders_from_state():
    p = policy.apply(plan(), {'kind': 'focus_add', 'capability_id': 'dsa:hash.lookup', 'rationale': 'stale'}, NOW)
    rows, _ = capabilities.build(problems(), [], [], now=NOW, today='2026-10-21')
    state = snapshot.build({}, p, rows, [], [], {}, NOW)
    md = snapshot.render(state, p, NOW)
    assert '# Senpai snapshot' in md and 'Arrays & Hashing' in md and 'unknown, not weak' in md


# ---- API ----------------------------------------------------------------------------------------

@pytest.fixture
def client(monkeypatch):
    store = seeded()
    monkeypatch.setattr(api, 'get_store', lambda uid: store)
    monkeypatch.setattr(main, 'get_store', lambda uid: store)
    main.app.dependency_overrides[auth.require_user] = lambda: 'senpai'
    c = TestClient(main.app)
    c.store = store
    yield c
    main.app.dependency_overrides.clear()


def test_api_overview_session_changes_and_approvals(client):
    data = client.get('/api/senpai').json()
    assert data['plan']['revision'] == 1 and data['snapshot_md'].startswith('# Senpai snapshot')
    assert any(c['id'] == 'sd:caching' for c in data['capabilities'])
    today = client.get('/api/senpai/today').json()
    assert today['blocks'] and today['plan_revision'] == 1
    s = client.post('/api/senpai/session', json={'budget': 20, 'mode': 'retrieval'}).json()
    assert s['mode'] == 'retrieval' and s['budget_minutes'] == 20
    r = client.post('/api/senpai/changes', json={'kind': 'focus_add', 'capability_id': 'dsa:hash.lookup'})
    assert r.status_code == 200 and r.json()['plan']['focus'][0]['capability_id'] == 'dsa:hash.lookup'
    assert client.post('/api/senpai/changes', json={'kind': 'focus_add', 'capability_id': 'nope'}).status_code == 400
    r = client.post('/api/senpai/changes', json={'kind': 'rebalance', 'target': {'system_design': 0.5}})
    assert r.json()['plan']['allocation']['system_design'] == pytest.approx(0.5, abs=0.02)   # yours: applied as asked
    assert client.get('/api/senpai/history').json()['decisions'][0]['decision'] == 'user'
    assert client.get('/api/senpai/capabilities/dsa:hash.lookup').json()['resources']
    assert client.get('/api/senpai/snapshot.md').text.startswith('# Senpai snapshot')
    assert client.post('/api/senpai/proposals/nope/approve', json={}).status_code == 404
    assert client.post('/api/senpai/sync').status_code == 409          # Job Scout not configured here
    assert client.get('/api/senpai/daily').status_code == 200          # the daily review, under Senpai's path


def test_synced_target_is_edited_in_job_scout(client, monkeypatch):
    fake_context(monkeypatch, {**context(), 'career_target': {'text': 'Staff engineer'}})
    jobscout.sync(client.store, NOW)
    assert client.post('/api/config', json={'target_job': 'Something else'}).status_code == 409
    assert client.post('/api/config', json={'target_job': 'Staff engineer', 'senpai_weekly_minutes': 300}).status_code == 200
    assert client.get('/api/config').json()['senpai_weekly_minutes'] == 300


def test_scheduler_focus_is_a_bounded_nudge():
    from server import scheduler
    probs = [{'slug': f's{i}', 'title': f'S{i}', 'neetcode_category': cat, 'difficulty': 'Easy', 'packs': ['neetcode150']}
             for i, cat in enumerate(['Arrays & Hashing', 'Stack'])]
    base = scheduler.build_daily_queue(probs, [], [], {'new_limit': 1}, today=dt.date(2026, 10, 21))
    other = next(c for c in ('Arrays & Hashing', 'Stack') if c != base['new'][0]['category'])
    nudged = scheduler.build_daily_queue(probs, [], [], {'new_limit': 1, 'senpai_focus_categories': [other]},
                                         today=dt.date(2026, 10, 21))
    assert nudged['new'][0]['category'] == other


def test_daily_review_follow_through_tracks_advice_and_routes_plan_changes_once(monkeypatch):
    from server.senpai import daily
    store = seeded()
    store.add_attempt(attempt('a3', 'two-sum', NOW - DAY))
    monkeypatch.setattr(llm, 'enabled', lambda settings=None: True)
    prompts = []

    def gen(provider, model, system, prompt, schema, **kw):
        data = json.loads(prompt)
        prompts.append(data)
        eid = data['evidence'][-1]['id']
        return json.dumps({
            'summary': 'One review.', 'practiced': 'Coding.', 'observations': [], 'keep_doing': [],
            'adjustment': {'action': 'Recall before re-solving', 'rationale': 'r', 'evidence_ids': [eid],
                           'capability_ids': ['dsa:hash.lookup', 'dsa:invented'], 'intended_outcome': 'An unaided recall'},
            'tomorrow': 'Recall.', 'curriculum_suggestions': [], 'reflection_question': '', 'limitations': [],
            'plan_changes': [{'kind': 'focus_add', 'capability_id': 'dsa:hash.lookup', 'confidence': 'medium',
                              'basis': 'learning', 'rationale': 'Recent work', 'evidence_ids': [eid]},
                             {'kind': 'focus_add', 'capability_id': 'dsa:stack.order', 'confidence': 'medium',
                              'basis': 'learning', 'rationale': 'x', 'evidence_ids': ['not-supplied']}]})
    monkeypatch.setattr(llm, '_raw_generate', gen)
    date = dt.datetime.fromtimestamp(NOW - DAY, dt.timezone.utc).date().isoformat()
    report = asyncio.run(daily.generate(store, date, now=NOW))
    assert prompts[0]['senpai']['capabilities'] and 'charter' in prompts[0]['senpai']
    assert report['adjustment']['capability_ids'] == ['dsa:hash.lookup']   # unknown ids dropped
    assert len(report['plan_changes']) == 1                                # uncited change dropped
    plan = service.load_plan(store, NOW)
    assert [f['capability_id'] for f in plan['focus']] == ['dsa:hash.lookup']
    items = store.list_senpai('senpai_interventions')
    assert items[0]['intended_outcome'] == 'An unaided recall' and items[0]['ref'] == f'daily:{date}'
    asyncio.run(daily.generate(store, date, force=True, now=NOW + 60))     # regeneration: no double execution
    assert service.load_plan(store, NOW)['revision'] == plan['revision']
    assert len(store.list_senpai('senpai_interventions')) == 1
    assert store.get_senpai('senpai_sessions', '2026-10-21')['blocks']     # tomorrow's session prepared


def test_solved_problems_without_confirmed_technique_read_as_practised():
    solve = {'id': 'b1', 'slug': 'valid-parentheses', 'solved_at': NOW - DAY, 'submission_id': 'b1', 'independence': 'solo'}
    rows, _ = capabilities.build(problems(), [solve], [], now=NOW, today='2026-10-21')
    row = {r['id']: r for r in rows}['dsa:stack.order']
    assert row['status'] == 'practised' and row['signals']['solved_problems'] == 1
    imported = {**solve, 'id': 'b2', 'source': 'backfill', 'solved_at': NOW - 400 * DAY}
    rows, _ = capabilities.build(problems(), [imported], [], now=NOW, today='2026-10-21')
    assert {r['id']: r for r in rows}['dsa:stack.order']['status'] == 'practised'   # history, not "stale"


def test_only_one_diagnostic_beyond_focus_per_session():
    many = [{'id': f'dsa:s{i}', 'bucket': 'dsa', 'name': f'T{i}', 'status': 'untested', 'signals': {}} for i in range(6)]
    s = sessions.prepare(plan(), NOW, 'd', many, {}, {}, {f'T{i}' for i in range(6)}, budget=120, mode='retrieval')
    assert sum(b['kind'] == 'diagnostic' for b in s['blocks']) == 1


def test_worker_visits_the_access_user_without_a_target(monkeypatch):
    from server.senpai import worker
    from server import store as store_mod
    store = seeded()
    store.update_settings({'target_job': ''})
    seen = []
    monkeypatch.setattr(config, 'AUTH_MODE', 'access')
    monkeypatch.setattr(config, 'ACCESS_UID', 'senpai')
    monkeypatch.setattr(store_mod, 'daily_coach_uids', lambda: [])
    monkeypatch.setattr(worker.store_mod, 'get_store', lambda uid: seen.append(uid) or store)
    fake_context(monkeypatch, {**context(), 'career_target': {'text': 'Platform engineer'}})
    asyncio.run(worker.tick(now=NOW))
    assert seen == ['senpai'] and store.get_settings()['target_job'] == 'Platform engineer'


# ---- career target, way-in lessons and the weekly brief -------------------------------------------

from server.senpai import brief, career  # noqa: E402

TARGET = ('AI platform engineer (mid/senior, London): model serving and LLM APIs, retrieval and evaluation '
          'pipelines, agent tooling, cost and reliability, on distributed-systems, Java and Python experience.')
KNOWN = {'track:ai:production', 'track:ai:models', 'track:ai:retrieval', 'track:ai:evaluation', 'track:ai:agents',
         'sd:reliability', 'sd:distributed', 'track:fundamentals:languages', 'track:fundamentals:infrastructure'}


def test_career_target_names_capabilities_in_order_and_falls_back_to_search_titles():
    caps = career.target_capabilities(TARGET)
    assert caps[0] == 'track:ai:production'                 # "AI platform" before "platform", longest phrase wins
    assert {'track:ai:retrieval', 'track:ai:evaluation', 'track:ai:agents', 'sd:reliability', 'sd:distributed'} <= set(caps)
    assert len(caps) <= career.MAX_TARGET_CAPS
    assert career.short_target(TARGET) == 'AI platform engineer'
    job = {'context': {'career_target': {'text': None, 'target_titles': ['platform engineer', 'ai engineer']}}}
    assert career.goal({}, job) == 'Roles: platform engineer, ai engineer'   # never silently nothing
    assert career.goal({'target_job': 'SRE'}, job) == 'SRE'
    assert career.goal({}, {}) == ''


def test_career_target_becomes_an_objective_and_a_gradual_shift_to_the_stack():
    p = plan()
    changes = career.plan_changes(TARGET, p, KNOWN)
    obj = next(c for c in changes if c['kind'] == 'objective_add')
    assert obj['id'] == career.objective_id(TARGET) and obj['bucket'] == 'stack'
    assert obj['title'] == 'Interview-ready for AI platform engineer'
    reb = next(c for c in changes if c['kind'] == 'rebalance')
    assert reb['target']['stack'] > 0.2 and reb['confidence'] == 'high'
    decision, _, eff = policy.classify(p, reb, LIM, NOW)
    assert decision == 'auto'
    moved = policy.apply(p, eff, NOW)
    assert 0.05 < moved['allocation']['stack'] <= 0.05 + LIM['max_weekly_shift'] + 1e-6   # damped, capped
    assert moved['allocation']['dsa'] >= p['protected']['dsa']
    p2 = policy.apply(p, obj, NOW)
    again = career.plan_changes(TARGET, p2, KNOWN)
    assert not any(c['kind'] == 'objective_add' for c in again)               # once per target
    other = career.plan_changes('Site reliability engineer, on call and observability', p2, KNOWN)
    assert {'kind': 'objective_remove', 'objective_id': obj['id']}.items() <= next(
        c for c in other if c['kind'] == 'objective_remove').items()           # a new target retires the old one


def test_follow_career_applies_through_policy_once_a_week(monkeypatch):
    store = FakeStore()
    store.update_settings({'target_job': TARGET})
    first = service.follow_career(store, NOW)
    assert {r['decision'] for r in first} == {'auto'}
    p = service.load_plan(store, NOW)
    assert any(o['id'].startswith('career-') for o in p['objectives'])
    assert p['allocation']['stack'] > 0.05
    assert service.follow_career(store, NOW + DAY) == []                       # same target, same week


def test_untested_focus_and_career_capabilities_get_a_tutor_lesson():
    p = policy.apply(plan(), {'kind': 'focus_add', 'capability_id': 'sd:caching'}, NOW)
    p = policy.apply(p, {'kind': 'objective_add', 'id': 'career-x', 'title': 't', 'bucket': 'stack',
                         'capability_ids': ['track:ai:production']}, NOW)
    rows = caps() + [{'id': 'track:ai:production', 'bucket': 'stack', 'name': 'AI Engineering: Production AI',
                      'status': 'untested', 'signals': {}}]
    sd = {'next_lesson': None, 'lessons': [{'id': 'l1', 'category': 'caching', 'title': 'Cache basics', 'minutes': 12,
                                            'due': 0, 'mistakes': 0, 'completed': False}]}
    tracks = {'ai': {'due': 0, 'mistakes': 0, 'answers': 0, 'next_lesson': None,
                     'next_by_category': {'production': {'id': 'serving', 'title': 'Serving LLMs', 'minutes': 15, 'category': 'production'}}}}
    pool = sessions.candidates(rows, queue(), sd, set(), ['sd:caching'], {'stack'}, 'balanced', True, 'mixed', tracks,
                               ['track:ai:production'])
    ways = {b['action'].get('id') or b['action'].get('view'): b for b in pool if b['kind'] == 'focus_lesson'}
    assert ways['l1']['action'] == {'type': 'sd_lesson', 'id': 'l1', 'tutor': True}
    assert ways['lesson/serving']['capability_id'] == 'track:ai:production'
    assert ways['l1']['priority'] > ways['lesson/serving']['priority']       # focus outranks a career objective
    s = sessions.prepare(p, NOW, 'd', rows, queue(), sd, set(), budget=90, llm_enabled=True, tracks=tracks)
    assert any(b['kind'] == 'focus_lesson' for b in s['blocks'])


def job_ctx():
    return {'context': {'career_target': {'text': TARGET},
                        'demand': {'cohort': {'roles': 187}, 'tags': [
                            {'tag': 'distributed systems', 'share': 0.65}, {'tag': 'llm', 'share': 0.07}]},
                        'experience': [{'ref': 'cv.1', 'cited_by_roles': 435, 'excerpt':
                                        'Goldman Sachs | Middleware - Upgrading our internally managed ZooKeeper platform.'}],
                        'self_reported_topics': [{'topic': 'ZooKeeper — leader election', 'state': 'Needs work'}]}}


def test_weekly_brief_is_concrete_and_says_why():
    p = policy.apply(plan(), {'kind': 'objective_add', 'id': 'career-x', 'title': 't', 'bucket': 'stack',
                              'capability_ids': ['track:ai:production', 'sd:distributed']}, NOW)
    rows = [{'id': 'track:ai:production', 'bucket': 'stack', 'name': 'AI Engineering: Production AI', 'status': 'untested'},
            {'id': 'sd:distributed', 'bucket': 'system_design', 'name': 'Distributed data', 'status': 'untested'},
            {'id': 'dsa:interval.merge_boundaries', 'bucket': 'dsa', 'name': 'Intervals', 'status': 'needs_check'}]
    tracks = {'ai': {'next_by_category': {'production': {'id': 'serving', 'title': 'Serving LLMs', 'minutes': 15}}}}
    probs = [{'slug': f'p{i}', 'difficulty': 'Medium'} for i in range(8)]
    solves = [{'slug': f'p{i}', 'kind': 'review', 'solved_at': NOW - i * 3600, 'independence': 'solo', 'solution_grade': {'score': 5}}
              for i in range(8)]
    gaps = [{'text': 'What 409 and 412 mean.', 'section': 'system-design', 'lesson': 'api-contracts',
             'lesson_title': 'Design an API contract', 'ignored': 2}]
    out = brief.build(TARGET, job_ctx(), p, rows, [], tracks, solves, probs, gaps, [0], NOW, True)
    kinds = [i['kind'] for i in out['items']]
    assert kinds == ['target', 'cv', 'gap', 'coding'] and out['goal'] == 'AI platform engineer'
    target, cv, gap, coding = out['items']
    assert target['action'] == {'type': 'tutor', 'section': 'ai', 'lesson': 'serving'}
    assert 'AI platform engineer' in target['why']
    assert cv['action'] == {'type': 'tutor', 'section': 'system-design', 'lesson': 'consensus', 'mode': 'cv'}
    assert '435' in cv['why'] and 'leader election' in cv['why']
    assert gap['action']['focus'] == 'What 409 and 412 mean.'
    assert coding['action'] == {'type': 'session', 'mode': 'interview'} and 'Intervals' in coding['why']
    # Recently defended, no model, nothing recorded: the brief shrinks instead of inventing work.
    quiet = brief.build(TARGET, job_ctx(), p, rows, [], tracks, [], probs, gaps, [NOW - DAY], NOW, False)
    assert [i['kind'] for i in quiet['items']] == ['target', 'coding']
    assert quiet['items'][1]['title'] == 'Get the coding reps back in'


def test_today_includes_the_brief(client):
    out = client.get('/api/senpai/today').json()
    assert 'blocks' in out and 'items' in out['brief']


def test_without_any_goal_the_daily_review_says_why_instead_of_skipping_silently(monkeypatch):
    from server.senpai import daily, worker
    store = seeded()
    store.update_settings({'target_job': ''})
    monkeypatch.setattr(config, 'AUTH_MODE', 'local')
    monkeypatch.setattr(worker.store_mod, 'get_store', lambda uid: store)
    monkeypatch.setattr(jobscout, 'configured', lambda: False)
    asyncio.run(worker.tick(uids=['me'], now=NOW))
    status = store.get_flags()['daily_coach_status']
    assert status['state'] == 'off' and status['message'] == daily.NO_GOAL


def test_time_split_shows_minutes_and_where_it_is_heading():
    p = plan()
    sp = service.time_split(p, TARGET, KNOWN, NOW)
    assert [b['id'] for b in sp['buckets']][0] == 'dsa' and sum(b['minutes'] for b in sp['buckets']) in range(418, 423)
    assert 'moving toward' in sp['note'] and 'AI platform engineer' in sp['note']
    p['allocation'] = policy._normalise({**p['allocation'], 'stack': 0.4})
    assert service.time_split(p, TARGET, KNOWN, NOW)['note'] == ''   # arrived: nothing to explain
    assert service.time_split(plan(), '', KNOWN, NOW)['note'] == ''
