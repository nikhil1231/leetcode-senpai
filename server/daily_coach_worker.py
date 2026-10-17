"""Server-owned daily review scheduling; no open browser or LeetCode cookie needed."""
import asyncio
import logging
import time

from . import config, connectivity, daily_coach, store as store_mod

log = logging.getLogger(__name__)


async def tick(uids=None, now=None):
    """One observable scheduling pass, also usable by a one-shot deployment job."""
    if uids is None:
        uids = [config.DEV_UID] if config.local_mode() else await asyncio.to_thread(store_mod.daily_coach_uids)
    for uid in uids:
        try:
            store = await asyncio.to_thread(store_mod.get_store, uid)
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


async def run():
    while True:
        try:
            if await asyncio.to_thread(connectivity.online):
                await tick()
        except Exception:
            log.exception('Daily learning review scheduler failed')
        await asyncio.sleep(60)
