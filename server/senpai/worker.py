"""Server-owned Senpai scheduling: Job Scout sync, the daily review and the weekly adaptation.

No open browser or LeetCode cookie needed. Each step is independent: one failing never blocks the others.
"""
import asyncio
import logging
import time

from .. import config, connectivity, store as store_mod
from . import daily as daily_coach, jobscout, service

log = logging.getLogger(__name__)


async def tick(uids=None, now=None):
    """One observable scheduling pass, also usable by a one-shot deployment job."""
    if uids is None:
        uids = [config.DEV_UID] if config.local_mode() else await asyncio.to_thread(store_mod.daily_coach_uids)
        if config.access_mode() and config.ACCESS_UID not in uids:
            # The career target may only arrive with the first Job Scout sync, and Senpai's
            # weekly review does not need one: the Access user is always visited.
            uids = list(uids) + [config.ACCESS_UID]
    for uid in uids:
        try:
            store = await asyncio.to_thread(store_mod.get_store, uid)
            await _sync_job_scout(store, now)
            await _weekly(store, now)
            settings = await asyncio.to_thread(store.get_settings)
            if not settings.get('daily_coach_enabled', True) or not settings.get('target_job', '').strip():
                continue
            date = daily_coach.review_date(settings, now)
            old = (await asyncio.to_thread(store.get_flags)).get('daily_coach_status') or {}
            timestamp = int(time.time() if now is None else now)
            # A no-activity day or provider outage is not a reason to issue a model
            # request every minute. Manual generation remains immediately available.
            if (old.get('date') == date and old.get('timezone') == settings['daily_coach_timezone']
                    and old.get('target_job') == settings['target_job']
                    and (old.get('state') == 'ready' or timestamp - old.get('checked_at', 0) < 900)):
                continue
            try:
                report = await daily_coach.run_due(store, now=now)
                state = {'state': 'ready' if report else 'disabled', 'message': ''}
            except daily_coach.ReviewUnavailable as exc:
                state = {'state': 'unavailable', 'message': str(exc)}
            state.update(date=date, timezone=settings['daily_coach_timezone'],
                         target_job=settings['target_job'], checked_at=timestamp)
            await asyncio.to_thread(store.set_flag, 'daily_coach_status', state)
        except Exception:
            # One user's storage/model failure must not stop other users' reviews.
            log.exception('Daily learning review failed for user %s', uid)


SYNC_EVERY = 6 * 3600


async def _sync_job_scout(store, now=None):
    if not jobscout.configured():
        return
    timestamp = int(time.time() if now is None else now)
    cached = await asyncio.to_thread(store.get_senpai, 'senpai', 'job_context') or {}
    last = max(cached.get('fetched_at') or 0, cached.get('error_at') or 0)
    if timestamp - last >= SYNC_EVERY:
        await asyncio.to_thread(jobscout.sync, store, timestamp)


async def _weekly(store, now=None):
    """On the configured weekday, after the daily review time, once per ISO week."""
    import datetime as dt
    timestamp = int(time.time() if now is None else now)
    settings = await asyncio.to_thread(store.get_settings)
    local = daily_coach.local_now(settings, timestamp)
    if local.isoweekday() != int(settings.get('senpai_weekly_day') or 7):
        return
    if local.time().replace(tzinfo=None) < dt.time.fromisoformat(settings.get('daily_coach_time', '00:05')):
        return
    flags = await asyncio.to_thread(store.get_flags)
    status = flags.get('senpai_weekly_status') or {}
    week = service.policy.iso_week(timestamp)
    if status.get('week') == week and (status.get('state') == 'ready' or timestamp - status.get('checked_at', 0) < 3600):
        return
    try:
        await service.weekly(store, timestamp)
        state = {'state': 'ready', 'message': ''}
    except Exception as exc:
        log.exception('Senpai weekly review failed')
        state = {'state': 'failed', 'message': f'{type(exc).__name__}'}
    await asyncio.to_thread(store.set_flag, 'senpai_weekly_status', {**state, 'week': week, 'checked_at': timestamp})


async def run():
    while True:
        try:
            if await asyncio.to_thread(connectivity.online):
                await tick()
        except Exception:
            log.exception('Daily learning review scheduler failed')
        await asyncio.sleep(60)
