"""Read Job Scout's career context, and keep the last good copy.

Job Scout owns career evidence; Senpai only reads `GET /api/senpai/context` (bearer token) and caches it in
`senpai/job_context`. A failed fetch keeps the cached copy and records the error, so an outage never pauses
learning. The career target is mirrored into settings.target_job (source "job_scout") so every existing
reader keeps working; the local value stays as the fallback when Job Scout is not configured.

From version 2 the feed also carries the Notion stories and questions, the model answers and the applications in
flight. Those are large and only the Experience track reads them, so they go to their own document
(`senpai_career/material`) instead of the hot `senpai` collection. Senpai never writes to Notion: what practice
turns up is sent back with `propose()` and waits in Job Scout's review queue.
"""
import logging
import time

import httpx

from .. import config

log = logging.getLogger(__name__)
TIMEOUT = 20
VERSIONS = {1, 2}
MATERIAL = ('stories', 'questions', 'general_answers', 'applications')
MAX_MATERIAL = 800_000   # bytes of JSON; Firestore documents stop at 1 MiB


def configured():
    return bool(config.JOB_SCOUT_URL and config.JOB_SCOUT_TOKEN)


def fetch():
    resp = httpx.get(config.JOB_SCOUT_URL + '/api/senpai/context', timeout=TIMEOUT,
                     headers={'Authorization': 'Bearer ' + config.JOB_SCOUT_TOKEN})
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict) or data.get('version') not in VERSIONS:
        raise ValueError('Unsupported Job Scout context version')
    return data


def sync(store, now=None):
    """Fetch, cache and mirror the target. Returns the cached record (possibly stale, with `error`)."""
    now = int(time.time() if now is None else now)
    cached = store.get_senpai('senpai', 'job_context') or {}
    if not configured():
        return cached or None
    try:
        ctx = fetch()
    except Exception as exc:  # network, auth, schema: keep the last good copy
        log.warning('Job Scout context unavailable: %s', exc)
        record = {**cached, 'error': f'{type(exc).__name__}: {str(exc)[:160]}', 'error_at': now}
        store.put_senpai('senpai', 'job_context', record)
        return record
    target = ((ctx.get('career_target') or {}).get('text') or '').strip()
    material = {k: ctx.pop(k) for k in MATERIAL if k in ctx}
    if material:
        store.put_senpai('senpai_career', 'material', {**fit(material), 'fetched_at': now,
                                                         'generated_at': ctx.get('generated_at')})
    record = {'context': ctx, 'fingerprint': ctx.get('fingerprint'), 'generated_at': ctx.get('generated_at'),
              'fetched_at': now, 'error': None, 'career_target': target or None,
              'previous_fingerprint': cached.get('fingerprint')}
    store.put_senpai('senpai', 'job_context', record)
    settings = store.get_settings()
    if target and (settings.get('target_job') != target or settings.get('target_job_source') != 'job_scout'):
        store.update_settings({'target_job': target, 'target_job_source': 'job_scout', 'target_job_synced_at': now})
    return record


def fit(material):
    """Trim story bodies, then the general pack's follow-ups, until the document fits."""
    import json
    size = lambda m: len(json.dumps(m, default=str))
    if size(material) <= MAX_MATERIAL:
        return material
    for s in material.get('stories') or []:
        s['body_md'] = (s.get('body_md') or '')[:3000]
    for item in (material.get('general_answers') or {}).get('items') or []:
        if size(material) <= MAX_MATERIAL:
            break
        item['follow_ups'] = item.get('follow_ups', [])[:1]
    return material


def material(store):
    return store.get_senpai('senpai_career', 'material')


def propose(body):
    """Send a suggested Notion change to Job Scout's review queue. -> {'ok', 'proposal_id', 'review_url'}."""
    if not configured():
        raise RuntimeError('Job Scout is not configured here.')
    resp = httpx.post(config.JOB_SCOUT_URL + '/api/senpai/proposals', json=body, timeout=TIMEOUT,
                      headers={'Authorization': 'Bearer ' + config.JOB_SCOUT_TOKEN})
    if resp.status_code == 422:
        raise ValueError(resp.json().get('detail') or 'Job Scout rejected the suggestion.')
    resp.raise_for_status()
    return {**resp.json(), 'review_url': config.JOB_SCOUT_PUBLIC_URL + '/review'}


def public_links():
    base = config.JOB_SCOUT_PUBLIC_URL
    return {'settings': base + '/settings#career-target', 'insights': base + '/insights', 'home': base}
