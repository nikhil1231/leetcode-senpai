"""Read Job Scout's career context, and keep the last good copy.

Job Scout owns career evidence; Senpai only reads `GET /api/senpai/context` (bearer token) and caches it in
`senpai/job_context`. A failed fetch keeps the cached copy and records the error, so an outage never pauses
learning. The career target is mirrored into settings.target_job (source "job_scout") so every existing
reader keeps working; the local value stays as the fallback when Job Scout is not configured.
"""
import logging
import time

import httpx

from .. import config

log = logging.getLogger(__name__)
TIMEOUT = 10


def configured():
    return bool(config.JOB_SCOUT_URL and config.JOB_SCOUT_TOKEN)


def fetch():
    resp = httpx.get(config.JOB_SCOUT_URL + '/api/senpai/context', timeout=TIMEOUT,
                     headers={'Authorization': 'Bearer ' + config.JOB_SCOUT_TOKEN})
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict) or data.get('version') != 1:
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
    record = {'context': ctx, 'fingerprint': ctx.get('fingerprint'), 'generated_at': ctx.get('generated_at'),
              'fetched_at': now, 'error': None, 'career_target': target or None,
              'previous_fingerprint': cached.get('fingerprint')}
    store.put_senpai('senpai', 'job_context', record)
    settings = store.get_settings()
    if target and (settings.get('target_job') != target or settings.get('target_job_source') != 'job_scout'):
        store.update_settings({'target_job': target, 'target_job_source': 'job_scout', 'target_job_synced_at': now})
    return record


def public_links():
    base = config.JOB_SCOUT_PUBLIC_URL
    return {'settings': base + '/settings#career-target', 'insights': base + '/insights', 'home': base}
