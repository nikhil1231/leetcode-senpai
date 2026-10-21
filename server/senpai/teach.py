"""Interactive teaching: Senpai explains, diagnoses and scaffolds around one capability.

This feature *is* conversation, so it needs the model and is cleanly unavailable without it. The model may
call a few bounded tools (find resources, inspect evidence, request a later checkpoint, propose a focus);
lookups run at most one extra round. Every turn is logged with the assistance it gave; if a coding run is in
progress, that assistance is also recorded on the run, so a later solve is not mistaken for independent work.
Generated exercises are supplemental and unvalidated: they never become assessment evidence.
"""
import hashlib
import time

from .. import llm
from . import service

MODES = ('learn', 'independent', 'interview')
MAX_HISTORY = 12


class TeachUnavailable(Exception):
    pass


async def turn(store, capability_id, message, history=(), mode='learn', now=None):
    import asyncio
    now = int(time.time() if now is None else now)
    settings = await asyncio.to_thread(store.get_settings)
    if not llm.enabled(settings):
        raise TeachUnavailable('Teaching needs the model. Configure OPENROUTER_API_KEY on the server.')
    mode = mode if mode in MODES else 'learn'
    b = await asyncio.to_thread(service.bundle, store, now)
    evidence = service.inspect_evidence(b, capability_id, limit=8)   # raises LookupError for unknown ids
    job = await asyncio.to_thread(store.get_senpai, 'senpai', 'job_context') or {}
    experience = ((job.get('context') or {}).get('experience') or [])[:3]
    payload = {'charter': settings.get('senpai_charter', ''), 'mode': mode,
               'capability': {k: evidence['capability'][k] for k in ('id', 'name', 'bucket', 'status', 'signals')},
               'experience_excerpts': [{'ref': e['ref'], 'excerpt': e['excerpt']} for e in experience],
               'history': [{'role': h.get('role'), 'text': str(h.get('text', ''))[:2000]} for h in history][-MAX_HISTORY:],
               'message': message[:4000], 'tool_results': []}
    result, error = await llm.extract_or_error('senpai_teach', payload, settings=settings)
    if not result:
        raise TeachUnavailable(error or 'Senpai could not answer just now.')
    lookups = [a for a in result['actions'] if a['tool'] in ('find_resources', 'inspect_evidence')]
    if lookups:
        payload['tool_results'] = [_lookup(b, a) for a in lookups]
        payload['history'] = payload['history'] + [{'role': 'senpai', 'text': result['reply']}]
        again, _ = await llm.extract_or_error('senpai_teach', payload, settings=settings)
        if again:
            again['actions'] = [a for a in again['actions'] if a['tool'] not in ('find_resources', 'inspect_evidence')]
            result = {**again, 'assistance': _max_help(result['assistance'], again['assistance'])}
    done = []
    for a in result['actions']:
        if a['tool'] == 'request_checkpoint':
            item = await asyncio.to_thread(service.request_checkpoint, store, a['capability_id'], a.get('days') or 7,
                                           a.get('note') or 'Requested while teaching', now, 'teach')
            done.append({'tool': a['tool'], 'capability_id': a['capability_id'], 'check_at': item['check_at']})
        elif a['tool'] == 'propose_focus':
            r = await asyncio.to_thread(service.propose, store, {'kind': 'focus_add', 'capability_id': a['capability_id'],
                                                                 'basis': 'learning', 'confidence': 'medium',
                                                                 'rationale': a.get('note') or 'Suggested while teaching',
                                                                 'evidence': evidence['capability']['evidence']},
                                        source='teach', now=now)
            done.append({'tool': a['tool'], 'capability_id': a['capability_id'], 'decision': r['decision']})
    on_run = await asyncio.to_thread(_record_on_run, store, result['assistance'], capability_id, now)
    tid = hashlib.sha256(f'{capability_id}:{now}:{message[:200]}'.encode()).hexdigest()[:16]
    exercise = {**result['exercise'], 'provenance': 'generated_unvalidated'} if result.get('exercise') else None
    log = {'id': tid, 'at': now, 'capability_id': capability_id, 'mode': mode, 'message': message[:2000],
           'reply': result['reply'], 'move': result['move'], 'assistance': result['assistance'],
           'actions': done, 'exercise': exercise, 'recorded_on_run': on_run, 'model': llm.current_model(settings)['model']}
    await asyncio.to_thread(store.put_senpai, 'senpai_teaching', tid, log)
    return log


def _lookup(b, action):
    try:
        if action['tool'] == 'find_resources':
            return {'tool': 'find_resources', 'result': service.find_resources(b, action['capability_id'])}
        ev = service.inspect_evidence(b, action['capability_id'], limit=8)
        return {'tool': 'inspect_evidence', 'result': {'status': ev['capability']['status'],
                                                       'signals': ev['capability']['signals'],
                                                       'observations': ev['observations']}}
    except LookupError as exc:
        return {'tool': action['tool'], 'error': str(exc)}


HELP = ('none', 'clarification', 'conceptual_hint', 'code_hint', 'solution')


def _max_help(a, b):
    return max(a, b, key=HELP.index)


def _record_on_run(store, assistance, capability_id, now):
    if assistance in ('none', 'clarification'):
        return False
    session = store.latest_active_session()
    if not session:
        return False
    events = list(session.get('assistance_events') or [])
    events.append({'kind': assistance, 'source': 'senpai', 'capability_id': capability_id, 'at': now})
    store.update_session(session['id'], {'assistance_events': events})
    return True
