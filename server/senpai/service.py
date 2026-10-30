"""Senpai's bounded internal tools and its daily/weekly runs. All storage I/O lives here.

Tools: read context, inspect evidence, find resources, prepare a session, propose a plan change, request a
checkpoint, record a decision. Every write is validated (policy permissions, plan revision, idempotency) and
logged in the decision history with rationale and evidence; permitted changes apply automatically and the rest
wait for approval. Original evidence stays where it lives (attempts, answers, Job Scout); Senpai keeps ids.
"""
import datetime as dt
import hashlib
import logging
import time

from .. import config, curriculum, learning_sequences, practice, scheduler
from ..system_design_learning import course_summary
from ..tracks import senpai as tracks_senpai
from . import capabilities as caps_mod, demand, interventions, jobscout, policy, sessions, snapshot

log = logging.getLogger(__name__)

PLAN = 'plan'
STATE = 'state'


def _now(now=None):
    return int(time.time() if now is None else now)


def local_date(settings, now):
    from zoneinfo import ZoneInfo
    return dt.datetime.fromtimestamp(now, ZoneInfo(settings.get('daily_coach_timezone', 'UTC'))).date().isoformat()


# ---- plan & decisions ---------------------------------------------------------------------------

def load_plan(store, now=None):
    now = _now(now)
    plan = store.get_senpai('senpai', PLAN)
    if plan:
        plan.pop('_key', None)
        return plan
    plan = policy.default_plan(store.get_settings(), now)
    try:
        store.cas_senpai('senpai', PLAN, plan, None)
    except ValueError:  # created concurrently
        got = store.get_senpai('senpai', PLAN)
        got.pop('_key', None)
        return got
    store.put_senpai('senpai_plans', str(plan['revision']), plan)
    record_decision(store, now, kind='plan_created', decision='auto', change=None,
                    rationale='Initial plan from defaults and your learning preferences.', source='senpai')
    return plan


def save_plan(store, plan, expected_revision):
    store.cas_senpai('senpai', PLAN, plan, expected_revision)
    store.put_senpai('senpai_plans', str(plan['revision']), plan)
    return plan


def record_decision(store, now, *, kind, decision, change, rationale, source, evidence=(), confidence=None,
                    reasons=(), before=None, after=None, follow_up=None, key=None):
    did = key or hashlib.sha256(f'{kind}:{now}:{time.perf_counter_ns()}'.encode()).hexdigest()[:16]
    doc = {'id': did, 'at': now, 'seq': time.time_ns(), 'kind': kind, 'decision': decision, 'change': change, 'rationale': rationale,
           'reasons': list(reasons), 'evidence': list(evidence)[:12], 'confidence': confidence, 'source': source,
           'plan_revision_before': before, 'plan_revision_after': after, 'follow_up': follow_up}
    if key:
        return store.create_senpai('senpai_decisions', did, doc)
    return store.put_senpai('senpai_decisions', did, doc)


def propose(store, change, *, source, now=None, run_key=None, known=None):
    """Validate and route one change. Returns {decision, reasons, plan, proposal?}.

    `run_key` makes execution idempotent across retries and regenerations (e.g. the same daily review).
    """
    now = _now(now)
    settings = store.get_settings()
    lim = policy.limits(settings)
    plan = load_plan(store, now)
    change = {**change, 'source': source}
    if known is None:
        known = {r['id'] for r in caps_mod_rows(store, now)[0]}
    if change.get('kind') == 'focus_add' and change.get('basis') == 'market' and change.get('sustained_weeks') is None:
        signals = (store.get_senpai('senpai', STATE) or {}).get('signals', {})
        change['sustained_weeks'] = (signals.get(change.get('capability_id')) or {}).get('weeks', 0)
    decision, reasons, effective = policy.classify(plan, change, lim, now, known)
    key = None
    if run_key:
        key = 'run_' + hashlib.sha256(f"{run_key}:{policy.change_key(change, 0)}".encode()).hexdigest()[:20]
        if store.get_senpai('senpai_decisions', key):
            return {'decision': 'duplicate', 'reasons': ['Already handled.'], 'plan': plan}
    common = dict(change=change, rationale=change.get('rationale', ''), source=source,
                  evidence=change.get('evidence', []), confidence=change.get('confidence'), reasons=reasons)
    if decision == 'auto':
        new = policy.apply(plan, effective, now)
        save_plan(store, new, plan['revision'])
        if record_decision(store, now, kind=change['kind'], decision='auto', before=plan['revision'],
                           after=new['revision'], key=key, **common) is None:
            return {'decision': 'duplicate', 'reasons': ['Already handled.'], 'plan': plan}
        return {'decision': 'auto', 'reasons': reasons, 'plan': new}
    if decision == 'approval':
        pid = 'p_' + policy.change_key(change, plan['revision'])
        proposal = {'id': pid, 'created_at': now, 'status': 'pending', 'change': change, 'reasons': reasons,
                    'rationale': change.get('rationale', ''), 'evidence': change.get('evidence', []),
                    'base_revision': plan['revision'], 'source': source}
        created = store.create_senpai('senpai_proposals', pid, proposal)
        if created is not None:
            record_decision(store, now, kind=change['kind'], decision='approval', before=plan['revision'],
                            follow_up=pid, key=key, **common)
        return {'decision': 'approval', 'reasons': reasons, 'plan': plan, 'proposal': proposal}
    record_decision(store, now, kind=change.get('kind') or 'unknown', decision=decision,
                    before=plan['revision'], key=key, **common)
    return {'decision': decision, 'reasons': reasons, 'plan': plan}


def resolve_proposal(store, pid, approve, now=None, note=''):
    now = _now(now)
    p = store.get_senpai('senpai_proposals', pid)
    if not p or p.get('status') != 'pending':
        raise LookupError('No pending proposal with that id.')
    plan = load_plan(store, now)
    if not approve:
        p.update(status='rejected', resolved_at=now, note=note[:500])
        store.put_senpai('senpai_proposals', pid, p)
        record_decision(store, now, kind=p['change']['kind'], decision='rejected', change=p['change'],
                        rationale=note or 'You rejected this proposal.', source='user', follow_up=pid,
                        before=plan['revision'])
        return {'proposal': p, 'plan': plan}
    change = p['change']
    if plan['revision'] != p['base_revision']:
        # The plan moved on: re-check the change still makes sense before applying it.
        decision, reasons, _ = policy.classify(plan, change, {**policy.limits(store.get_settings()),
                                                             'max_focus': 99, 'max_objectives': 99}, now)
        if decision in ('reject',):
            p.update(status='stale', resolved_at=now, note='; '.join(reasons))
            store.put_senpai('senpai_proposals', pid, p)
            raise ValueError('The plan changed since this proposal and it no longer applies: ' + '; '.join(reasons))
    base, working = plan['revision'], plan
    if change['kind'] == 'focus_add' and len(policy.active_focus(plan)) >= policy.limits(store.get_settings())['max_focus']:
        # Approving a new focus when full replaces the longest-standing one.
        oldest = min(policy.active_focus(plan), key=lambda f: f['since'])
        working = policy.apply(plan, {'kind': 'focus_remove', 'capability_id': oldest['capability_id']}, now)
    new = policy.apply(working, change, now)
    save_plan(store, new, base)
    p.update(status='approved', resolved_at=now, note=note[:500], applied_revision=new['revision'])
    store.put_senpai('senpai_proposals', pid, p)
    record_decision(store, now, kind=change['kind'], decision='approved', change=change,
                    rationale=note or 'You approved this proposal.', source='user', follow_up=pid,
                    before=p['base_revision'], after=new['revision'])
    return {'proposal': p, 'plan': new}


# ---- evidence & context -------------------------------------------------------------------------

def bundle(store, now=None):
    """Everything Senpai reads, loaded once per run."""
    now = _now(now)
    settings = store.get_settings()
    problems, attempts, reviews = store.list_problems(), store.list_attempts(), store.list_reviews()
    answers, learning, design = store.list_light_practice(), store.list_learning_state(), store.list_design_records()
    today = local_date(settings, now)
    rows, events = caps_mod.build(problems, attempts, reviews, answers, learning, design, now=now, today=today)
    tracks = _track_records(store)
    rows = sorted(rows + tracks_senpai.capability_rows(tracks, now), key=lambda r: r['id'])
    return {'settings': settings, 'problems': problems, 'attempts': attempts, 'reviews': reviews,
            'answers': answers, 'learning': learning, 'design': design, 'rows': rows, 'events': events,
            'tracks': tracks, 'today': today, 'now': now}


def _track_records(store):
    """Experience, Fundamentals, AI and Practical records. A failure here never stops Senpai."""
    from ..tracks import TRACKS
    try:
        return {t: store.list_track_records(t) for t in TRACKS}
    except Exception as exc:  # e.g. an older store without track records
        log.warning('Track records unavailable: %s', type(exc).__name__)
        return {}


def caps_mod_rows(store, now):
    b = bundle(store, now)
    return b['rows'], b['events']


def quickfire_topics():
    return {e['topic'] for e in practice.catalog()['exercises']}


def read_context(store, now=None):
    """Tool: compact context — plan, state, Job Scout brief summary. No raw evidence."""
    now = _now(now)
    plan = load_plan(store, now)
    state = store.get_senpai('senpai', STATE) or {}
    job = store.get_senpai('senpai', 'job_context') or {}
    return {'plan': plan_summary(plan, now), 'state': {k: state.get(k) for k in ('priorities', 'uncertainties', 'questions', 'progress')},
            'job': {k: job.get(k) for k in ('career_target', 'fetched_at', 'error')}}


def plan_summary(plan, now):
    return {'revision': plan['revision'], 'weekly_minutes': plan.get('weekly_minutes'),
            'allocation': plan['allocation'], 'effective_allocation': policy.effective_allocation(plan, now),
            'protected': plan.get('protected', {}), 'focus': policy.active_focus(plan),
            'overlays': [{k: o[k] for k in ('id', 'label', 'expires_at', 'weight')} for o in policy.active_overlays(plan, now)],
            'objectives': [{k: o.get(k) for k in ('id', 'title', 'bucket', 'protected', 'status')}
                           for o in plan.get('objectives', []) if o.get('status') == 'active']}


def inspect_evidence(b, capability_id, limit=12):
    """Tool: the recorded observations behind one capability, by reference."""
    row = next((r for r in b['rows'] if r['id'] == capability_id), None)
    if not row:
        raise LookupError(f'Unknown capability {capability_id}')
    obs = sorted(b['events'].get(capability_id, []), key=lambda e: e.get('at') or 0)[-limit:]
    return {'capability': row, 'observations': obs}


def find_resources(b, capability_id, limit=6):
    """Tool: existing material for one capability. Generated material is never listed here."""
    out = []
    if capability_id.startswith('dsa:'):
        sid = capability_id[4:]
        name = curriculum.SKILLS.get(sid, {}).get('name')
        for key, seq in learning_sequences.SEQUENCES.items():
            if seq['skill'] == sid:
                out.append({'type': 'sequence', 'sequence': key, 'title': seq['title'], 'minutes': 10})
        if name in quickfire_topics():
            out.append({'type': 'quickfire', 'topic': name, 'title': f'Quickfire: {name}', 'minutes': 5})
        attempted = {a.get('slug') for a in b['attempts']}
        for p in b['problems']:
            if curriculum.CATEGORY_SKILLS.get(p.get('neetcode_category')) == sid and scheduler._in_library(p):
                out.append({'type': 'problem', 'slug': p['slug'], 'title': p['title'], 'difficulty': p.get('difficulty'),
                            'category': p.get('neetcode_category'), 'attempted': p['slug'] in attempted,
                            'minutes': sessions.PAR_MIN.get(p.get('difficulty'), 25)})
    elif capability_id.startswith('sd:'):
        from ..system_design_curriculum import LESSONS
        for lid, l in LESSONS.items():
            if l['category'] == capability_id[3:]:
                out.append({'type': 'sd_lesson', 'id': lid, 'title': l['title'], 'minutes': l.get('minutes', 12)})
        out.append({'type': 'sd_quickfire', 'title': 'System design Quickfire', 'minutes': 6})
    out.sort(key=lambda r: (r.get('attempted', False), r['type'] != 'sequence', r.get('minutes', 0)))
    return out[:limit]


def request_checkpoint(store, capability_id, days, reason, now=None, source='senpai'):
    """Tool: schedule a later retention/application check as a tracked intervention."""
    now = _now(now)
    days = max(1, min(30, int(days or 7)))
    item = interventions.new(source, f'Check {capability_id} again in {days} days without help',
                             reason, [capability_id], 'An independent success on a later check', now,
                             check_days=days, ref=f'checkpoint:{capability_id}:{now // 86400}')
    created = store.create_senpai('senpai_interventions', item['id'], item)
    record_decision(store, now, kind='checkpoint', decision='auto', change={'capability_id': capability_id, 'days': days},
                    rationale=reason, source=source)
    return created or item


# ---- sessions ---------------------------------------------------------------------------------

def prepare_session(store, now=None, *, budget=None, mode=None, depth=None, objective=None, b=None, save=True):
    """Tool: assemble a session from existing material within the plan."""
    from .. import llm
    now = _now(now)
    b = b or bundle(store, now)
    s = b['settings']
    plan = load_plan(store, now)
    queue = scheduler.build_daily_queue(b['problems'], b['attempts'], b['reviews'], _with_focus(s, plan),
                                        today=dt.date.fromisoformat(b['today']), enrichments=store.list_enrichments())
    if config.LEARNING_FEATURES['recovery']:
        from .. import learning_evidence
        queue['learning_checks'] = learning_sequences.due_checks(b['learning'], now)
        queue['learning_recovery'] = learning_sequences.recommendation(learning_evidence.project(b['problems'], b['attempts']))
    session = sessions.prepare(plan, now, b['today'], b['rows'], queue, course_summary(b['design'], now),
                               quickfire_topics(), budget=int(budget or s.get('senpai_session_minutes') or 60),
                               mode=mode or s.get('senpai_mode', 'mixed'), depth=depth or s.get('senpai_depth', 'balanced'),
                               objective=objective, llm_enabled=llm.enabled(s),
                               tracks=tracks_senpai.material(b.get('tracks') or {}, now))
    if save:
        store.put_senpai('senpai_sessions', b['today'], session)
    return session


def _with_focus(settings, plan):
    names = [curriculum.SKILLS[f['capability_id'][4:]]['name'] for f in policy.active_focus(plan)
             if f['capability_id'].startswith('dsa:') and f['capability_id'][4:] in curriculum.SKILLS]
    return {**settings, 'senpai_focus_categories': names}


def focus_categories(store, now=None):
    """Category names in focus, for the scheduler (cheap: one cached document)."""
    plan = store.get_senpai('senpai', PLAN)
    return _with_focus({}, plan)['senpai_focus_categories'] if plan else []


def session_progress(session, b):
    """Mark blocks done from evidence recorded after the session was prepared."""
    since = session.get('generated_at', 0)
    solved = {a.get('slug') for a in b['attempts'] if (a.get('solved_at') or 0) >= since}
    probes = {r['id'] for r in b['learning'] if (r.get('probe_answered_at') or 0) >= since}
    lessons = {r.get('sequence') for r in b['learning'] if (r.get('updated_at') or 0) >= since}
    catalog = {e['id']: e['topic'] for e in practice.catalog()['exercises']}
    topics = {catalog.get(a.get('template')) for a in b['answers'] if (a.get('answered_at') or 0) >= since}
    design = [r for r in b['design'] if max(r.get('updated_at') or 0, r.get('at') or 0, r.get('answered_at') or 0,
                                            r.get('completed_at') or 0, r.get('created_at') or 0) >= since]
    read = {r.get('lesson_id') for r in design if r.get('kind') in ('course_lesson', 'quiz')}
    for block in session.get('blocks', []):
        a = block['action']
        block['done'] = bool(
            (a['type'] == 'problem' and a['slug'] in solved) or (a['type'] == 'application' and a['id'] in probes)
            or (a['type'] == 'sequence' and a['sequence'] in lessons) or (a['type'] == 'quickfire' and a['topic'] in topics)
            or (a['type'] == 'sd_lesson' and a['id'] in read)
            or (a['type'] == 'sd_quickfire' and any(r.get('kind') == 'quickfire' for r in design))
            or (a['type'] == 'sd_cases' and any(r.get('kind') == 'session' for r in design))
            or (a['type'] == 'track' and tracks_senpai.done(a, b.get('tracks') or {}, since)))
    return session


def today_session(store, now=None, b=None):
    now = _now(now)
    b = b or bundle(store, now)
    plan = load_plan(store, now)
    cached = store.get_senpai('senpai_sessions', b['today'])
    if not cached or cached.get('plan_revision') != plan['revision'] or now - cached.get('generated_at', 0) > 6 * 3600:
        if cached and any(bl.get('done') for bl in session_progress(cached, b)['blocks']):
            return cached  # keep a session in progress stable; regenerating would reshuffle it
        cached = prepare_session(store, now, b=b)
    return session_progress(cached, b)


# ---- state ------------------------------------------------------------------------------------

def refresh_state(store, now=None, b=None, extra=None):
    from .daily import collect_activity
    now = _now(now)
    b = b or bundle(store, now)
    plan = load_plan(store, now)
    previous = store.get_senpai('senpai', STATE) or {}
    previous.pop('_key', None)
    job = store.get_senpai('senpai', 'job_context') or {}
    tz = b['settings'].get('daily_coach_timezone', 'UTC')
    try:
        activity = collect_activity(store, b['today'], tz, now)['evidence']
    except Exception:
        activity = []
    state = snapshot.build(previous, plan, b['rows'], activity, previous.get('questions', []), job, now)
    state.update(extra or {})
    store.put_senpai('senpai', STATE, state)
    return state


def update_interventions(store, b, now):
    out = []
    for item in store.list_senpai('senpai_interventions'):
        item.pop('_key', None)
        new = interventions.evaluate(item, b['events'], now)
        if new != item:
            store.put_senpai('senpai_interventions', new['id'], new)
            if new['outcome'] != item['outcome']:
                record_decision(store, now, kind='intervention_outcome', decision='auto',
                                change={'intervention': new['id'], 'outcome': new['outcome']},
                                rationale=f"{new['action']} → {new['outcome']}", source='senpai',
                                evidence=new['outcome_evidence'])
        out.append(new)
    return out


def add_questions(state, texts, source, now):
    qs = list(state.get('questions', []))
    known = {q['text'] for q in qs}
    for t in texts:
        t = (t or '').strip()[:300]
        if t and t not in known:
            qs.append({'id': hashlib.sha256(t.encode()).hexdigest()[:10], 'text': t, 'asked_at': now, 'source': source})
    return qs[-8:]


def answer_question(store, qid, answer, now=None):
    now = _now(now)
    state = store.get_senpai('senpai', STATE) or {}
    state.pop('_key', None)
    for q in state.get('questions', []):
        if q['id'] == qid:
            q.update(answer=answer.strip()[:1000], answered_at=now)
            state.setdefault('answers', []).append(q)
            state['answers'] = state['answers'][-10:]
            state['questions'] = [x for x in state['questions'] if x['id'] != qid]
            store.put_senpai('senpai', STATE, state)
            return q
    raise LookupError('No open question with that id.')


# ---- daily & weekly ---------------------------------------------------------------------------

def after_daily_review(store, report, now=None):
    """Follow through on a saved daily review: track its advice, route its plan changes, prepare tomorrow."""
    now = _now(now)
    b = bundle(store, now)
    known = {r['id'] for r in b['rows']}
    adj = report.get('adjustment')
    if adj:
        item = interventions.new('daily', adj['action'], adj['rationale'],
                                 [c for c in adj.get('capability_ids') or [] if c in known],
                                 adj.get('intended_outcome') or '', now, adj.get('evidence_ids', []),
                                 ref=f"daily:{report['date']}")
        existing = store.get_senpai('senpai_interventions', item['id'])
        if not existing:
            store.create_senpai('senpai_interventions', item['id'], item)
    results = []
    for ch in report.get('plan_changes') or []:
        results.append(propose(store, to_change(ch), source='daily', now=now, known=known,
                               run_key=f"daily:{report['date']}:{report.get('timezone')}"))
    update_interventions(store, b, now)
    prepare_session(store, now, b=b)
    refresh_state(store, now, b)
    return results


def to_change(model_change):
    """Model-proposed change → policy change. The model cannot propose overlays, protections or authority."""
    c = {'kind': model_change['kind'], 'rationale': model_change.get('rationale', ''),
         'evidence': model_change.get('evidence_ids', []), 'confidence': model_change.get('confidence', 'low'),
         'basis': model_change.get('basis', 'learning')}
    if c['kind'] == 'rebalance':
        c['target'] = {b: model_change.get('target_' + b) for b in policy.BUCKETS
                       if model_change.get('target_' + b) is not None}
    for k in ('capability_id', 'objective_id', 'title', 'bucket'):
        if model_change.get(k):
            c[k] = model_change[k]
    return c


def answers_for_prompt(state):
    return [{'question': q['text'], 'answer': q.get('answer')} for q in (state or {}).get('answers', [])[-5:]]


async def weekly(store, now=None, force=False):
    """Weekly adaptation: Job Scout brief → overlays, sustained signals, model-reviewed plan changes."""
    import asyncio
    from .. import llm
    now = _now(now)
    week = policy.iso_week(now)
    existing = await asyncio.to_thread(store.get_senpai, 'senpai_weekly', week)
    if existing and not force:
        return existing
    job = await asyncio.to_thread(jobscout.sync, store, now) or {}
    state = await asyncio.to_thread(store.get_senpai, 'senpai', STATE) or {}
    state.pop('_key', None)
    b = await asyncio.to_thread(bundle, store, now)
    known = {r['id'] for r in b['rows']}
    br = demand.brief(job.get('context'), state.get('signals', {}), week, now)
    applied = []
    for ov in br['overlays']:
        applied.append(await asyncio.to_thread(lambda ov=ov: propose(store, ov, source='weekly', now=now, known=known,
                                                                    run_key='overlay:' + ov['source_ref'])))
    lim = policy.limits(b['settings'])
    in_focus = {f['capability_id'] for f in policy.active_focus(await asyncio.to_thread(load_plan, store, now))}
    for cand in demand.focus_candidates(br['signals'], lim['min_evidence_weeks']):
        if cand['capability_id'] in in_focus:
            continue
        applied.append(await asyncio.to_thread(lambda c=cand: propose(store, c, source='weekly', now=now, known=known,
                                                                     run_key=f'weekly:{week}')))
    plan = await asyncio.to_thread(load_plan, store, now)
    items = await asyncio.to_thread(update_interventions, store, b, now)
    record = {'iso_week': week, 'generated_at': now, 'brief': {k: br[k] for k in ('roles', 'buckets', 'mapped', 'outside',
                                                                                   'interviews', 'notes', 'fingerprint')},
              'job_context': {k: job.get(k) for k in ('fetched_at', 'error', 'fingerprint')},
              'decisions': [{'decision': r['decision'], 'reasons': r['reasons']} for r in applied],
              'summary': None, 'explanation': [], 'model': None}
    if llm.enabled(b['settings']):
        payload = {'charter': b['settings'].get('senpai_charter', ''), 'target': b['settings'].get('target_job', ''),
                   'learning_preferences': {k: b['settings'].get('senpai_' + k) for k in ('weekly_minutes', 'session_minutes', 'depth', 'focus_note')},
                   'plan': plan_summary(plan, now), 'limits': lim,
                   'capabilities': caps_mod.digest(b['rows'], [f['capability_id'] for f in policy.active_focus(plan)]),
                   'progress': (state.get('progress') or {}), 'interventions': interventions.summary(items),
                   'ineffective_advice': interventions.summary(interventions.ineffective(items), 4),
                   'job_brief': {k: br[k] for k in ('roles', 'buckets', 'mapped', 'outside', 'interviews', 'debriefs', 'notes')},
                   'sustained_signals': br['signals'], 'answers_to_questions': answers_for_prompt(state),
                   'evidence_ids': sorted(known) + [f"job_scout:tag:{m['tag']}" for m in br['mapped']]
                                   + [f"job_scout:interview:{i['id']}" for i in br['interviews']]}
        result, error = await llm.extract_or_error('senpai_weekly', payload, settings=b['settings'])
        if result:
            valid = set(payload['evidence_ids'])
            for ch in result.get('changes', []):
                if not set(ch.get('evidence_ids', [])) <= valid:
                    record['decisions'].append({'decision': 'reject', 'reasons': ['Cited evidence that was not supplied.']})
                    continue
                r = await asyncio.to_thread(lambda ch=ch: propose(store, to_change(ch), source='weekly', now=now,
                                                                 known=known, run_key=f'weekly:{week}'))
                record['decisions'].append({'decision': r['decision'], 'reasons': r['reasons'], 'kind': ch['kind']})
            record.update(summary=result['summary'], explanation=result['explanation'], model=llm.current_model(b['settings'])['model'])
            state['questions'] = add_questions(state, result.get('questions', []), 'weekly', now)
        else:
            record['error'] = error
    if not record['summary']:
        auto = sum(d['decision'] == 'auto' for d in record['decisions'])
        record['summary'] = (f"Weekly check: {br['roles']} relevant roles in Job Scout, {len(br['interviews'])} upcoming "
                             f"interview(s); {auto} automatic change(s). No model review this week.")
    await asyncio.to_thread(store.put_senpai, 'senpai_weekly', week, record)
    await asyncio.to_thread(refresh_state, store, now, b, {'signals': br['signals'], 'questions': state.get('questions', []),
                                                          'last_weekly': week})
    return record
