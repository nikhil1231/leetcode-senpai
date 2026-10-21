"""Senpai's daily review: process evidence against the plan. Source answers/code never enter this prompt."""
import asyncio
from collections import Counter
import datetime as dt
import threading
import logging
import time
from zoneinfo import ZoneInfo

from .. import llm
from . import service

log = logging.getLogger(__name__)

PROMPT_VERSION = 2
MAX_EVENTS = 240
_locks = {}
_lock_guard = threading.Lock()


class ReviewUnavailable(Exception):
    """An explicit missing prerequisite, empty day, or model failure."""


def local_now(settings, now=None):
    return dt.datetime.fromtimestamp(time.time() if now is None else now,
                                     ZoneInfo(settings.get('daily_coach_timezone', 'UTC')))


def review_date(settings, now=None):
    local = local_now(settings, now)
    scheduled = dt.time.fromisoformat(settings.get('daily_coach_time', '00:05'))
    days = 1 if local.time().replace(tzinfo=None) >= scheduled else 2
    return (local.date() - dt.timedelta(days=days)).isoformat()


def bounds(date, timezone):
    day = dt.date.fromisoformat(date)
    zone = ZoneInfo(timezone)
    # Local midnights, not 86400-second arithmetic: DST days can be 23/25 hours.
    start = dt.datetime.combine(day, dt.time.min, zone).timestamp()
    end = dt.datetime.combine(day + dt.timedelta(days=1), dt.time.min, zone).timestamp()
    window = dt.datetime.combine(day - dt.timedelta(days=13), dt.time.min, zone).timestamp()
    return int(window), int(start), int(end)


def history(store, limit=7):
    zone = store.get_settings().get('daily_coach_timezone', 'UTC')
    return sorted(store.list_daily_reviews(zone), key=lambda r: r['date'], reverse=True)[:limit]


def collect_activity(store, date, timezone, now=None):
    """Normalize subject sources into process evidence; add future subjects here.

    One source attempt is one activity regardless of grading revisions. Latest-only
    sources cannot reconstruct earlier snapshots; we disclose that and omit any
    snapshot whose update is beyond the review cutoff.
    """
    window, start, end = bounds(date, timezone)
    cutoff = min(end, int(time.time() if now is None else now) + 1)
    events = {}
    limitations = [
        'Only activity recorded in this app is visible; other learning and untracked time are unknown.',
        'Activity counts and timings describe practice, not mastery or job readiness.',
        'Latest-only lesson/design records cannot reconstruct every historical session or revision.',
    ]

    def add(key, subject, at, title, activity, **process):
        if not isinstance(at, (int, float)) or not window <= at < cutoff:
            return
        events[key] = {'id': key, 'subject': subject, 'at': int(at),
                       'title': str(title or activity)[:200], 'activity': activity,
                       **{k: v for k, v in process.items() if v is not None}}

    problems = {p['slug']: p for p in store.list_problems()}
    attempts = store.list_attempts()
    linked = set()
    for a in attempts:
        if a.get('source') == 'backfill':
            continue
        at = a.get('solved_at')
        if not isinstance(at, (int, float)) or not window <= at < cutoff:
            continue
        aid = a.get('id') or a.get('submission_id')
        if not aid:
            continue
        linked.add(str(aid))
        p = problems.get(a.get('slug'), {})
        mode = a.get('kind') or a.get('source') or 'practice'
        add('coding:' + str(aid), 'Coding', at, p.get('title', a.get('slug')), mode,
            topic=p.get('neetcode_category') or p.get('category'),
            independence=a.get('independence'), plan_status=a.get('plan_status'),
            plan_held=a.get('plan_held'), elapsed_sec=a.get('time_taken_sec'),
            plan_sec=a.get('plan_time_sec'), hints_used=a.get('hint_level_used'),
            completed=not bool(a.get('unsolved')))
    for s in store.list_sessions():
        if str(s.get('attempt_id')) in linked or s.get('kind') == 'optimize':
            continue
        # A start is observable even when a session never ends. Do not project
        # its later status, hint usage or duration back into an earlier day.
        p = problems.get(s.get('slug'), {})
        add('session:' + str(s['id']), 'Coding', s.get('started_at'),
            p.get('title', s.get('slug')), 'session started (completion not observed in window)',
            plan_status=s.get('plan_status'), mode=s.get('kind'))
    for q in store.iter_light_practice():
        if q.get('exposure_only'):
            continue
        key = q.get('question_id') or q.get('id')
        if not key:
            continue
        timing = q.get('timing') or {}
        add('quickfire:' + str(key), 'Quickfire', q.get('answered_at'),
            q.get('template') or key, 'recall' if q.get('recall') else q.get('format', 'practice'),
            topic=q.get('skill_id') or q.get('topic'), assisted=q.get('assisted'),
            revealed=q.get('revealed'), elapsed_sec=timing.get('elapsed_sec'),
            timing_source=timing.get('source'), timing_uncertain=bool(timing.get('uncertain_sec')))
    for r in store.list_design_records():
        key = str(r.get('id', ''))
        kind = r.get('kind')
        if kind == 'session':
            # A single latest snapshot, not a new practice event per assessment.
            add('design:' + key, 'System design', r.get('updated_at'),
                r.get('case_id'), 'design workspace saved', mode=r.get('mode'),
                level=r.get('level'), assisted=r.get('assisted'),
                elapsed_sec=r.get('elapsed_sec'), timing_uncertain=r.get('timing_uncertain'))
        elif kind == 'practice':
            add('design-practice:' + key, 'System design', r.get('answered_at'),
                r.get('exercise_id'), r.get('format', 'practice'), topic=r.get('skill'),
                assisted=r.get('assisted'), revealed=r.get('revealed'), elapsed_sec=r.get('elapsed_sec'))
        elif kind in ('quiz', 'quickfire'):
            from ..system_design_learning import rows
            for answer in rows([r]):
                add('design-learning:' + answer['id'], 'System design', answer['answered_at'],
                    answer['question_id'], 'lesson check' if kind == 'quiz' else 'quickfire',
                    topic=answer['lesson_id'], assisted=answer.get('assisted'),
                    revealed=answer.get('revealed'), guessed=answer.get('guessed'),
                    elapsed_sec=answer.get('elapsed_sec'))
        elif kind == 'course_lesson':
            add('design-course:' + key, 'System design', r.get('at'), r.get('lesson_id'), 'lesson opened')
        elif kind == 'exposure':
            add('design-lesson:' + key, 'System design', r.get('at'), r.get('skill'), 'lesson opened')
    for r in store.list_learning_state():
        key = str(r.get('id', ''))
        if r.get('probe_answered_at'):
            add('application:' + key, 'Coding knowledge', r['probe_answered_at'],
                r.get('sequence'), 'later application check', assisted=r.get('probe_assisted'),
                delay_sec=r.get('probe_delay_sec'), elapsed_sec=(r.get('timing') or {}).get('elapsed_sec'))
        elif r.get('sequence') and r.get('last_action') in ('open', 'complete'):
            add('lesson:' + key, 'Coding knowledge', r.get('updated_at'), r['sequence'],
                'supported lesson ' + r['last_action'])

    for t in store.list_senpai('senpai_teaching'):
        add('teaching:' + str(t.get('id')), 'Senpai teaching', t.get('at'), t.get('capability_id'),
            'guided explanation with Senpai', mode=t.get('mode'), assistance=t.get('assistance'))
    all_events = sorted(events.values(), key=lambda e: (e['at'], e['id']))
    today = [e for e in all_events if e['at'] >= start]
    prior = [e for e in all_events if e['at'] < start]
    # Reserve half the budget for the day under review, keeping trend context.
    selected = today[-(MAX_EVENTS // 2):] + prior[-(MAX_EVENTS - min(len(today), MAX_EVENTS // 2)):]
    selected.sort(key=lambda e: (e['at'], e['id']))
    if len(selected) < len(all_events):
        limitations.append(f'Evidence is sampled: {len(selected)} of {len(all_events)} recorded activities; aggregate counts use all selected-window sources.')
    if len({dt.datetime.fromtimestamp(e['at'], ZoneInfo(timezone)).date() for e in all_events}) < 3:
        limitations.append('Fewer than three active days are recorded in this window; longer-term trends are tentative.')
    counts = Counter(e['subject'] for e in today)
    daily = Counter(dt.datetime.fromtimestamp(e['at'], ZoneInfo(timezone)).date().isoformat() for e in all_events)
    return {'evidence': selected, 'day_activity_count': len(today), 'day_subject_counts': dict(counts),
            'window_daily_activity_counts': dict(sorted(daily.items())), 'limitations': limitations,
            'window_start': dt.datetime.fromtimestamp(window, ZoneInfo(timezone)).date().isoformat()}


async def generate(store, date=None, force=False, now=None):
    settings = await asyncio.to_thread(store.get_settings)
    goal = settings.get('target_job', '').strip()
    if not goal:
        raise ReviewUnavailable('Add your career target (in Job Scout, or in Settings) before generating a review.')
    timezone = settings.get('daily_coach_timezone', 'UTC')
    date = date or review_date(settings, now)
    try:
        day = dt.date.fromisoformat(date)
        if day.isoformat() != date or day > local_now(settings, now).date():
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError('Choose a valid date no later than today in your review timezone.') from None
    key = (store.uid, timezone, date)
    with _lock_guard:
        lock = _locks.setdefault(key, threading.Lock())
    # Nonblocking acquisition keeps the request loop usable while the worker runs.
    while not lock.acquire(blocking=False):
        await asyncio.sleep(.05)
    try:
        old = await asyncio.to_thread(store.get_daily_review, date, timezone)
        partial = day == local_now(settings, now).date()
        if (old and not force and old.get('target_job') == goal
                and old.get('prompt_version') == PROMPT_VERSION
                and (not old.get('partial') or partial)):
            return old
        if not llm.enabled(settings):
            raise ReviewUnavailable("Senpai's model is unavailable. Configure OPENROUTER_API_KEY on the server.")
        activity = await asyncio.to_thread(collect_activity, store, date, timezone, now)
        if not activity['day_activity_count']:
            raise ReviewUnavailable('No recorded learning activity for this day. No review was invented.')
        prior = await asyncio.to_thread(store.list_daily_reviews, timezone)
        prior = sorted((r for r in prior if r['date'] < date), key=lambda r: r['date'], reverse=True)[:7]
        context = await asyncio.to_thread(senpai_context, store, now)
        payload = {'target_job': goal, 'date': date, 'timezone': timezone, 'partial_day': partial,
                   **activity, 'senpai': context, 'previous_recommendations': [
                       {'date': r['date'], 'adjustment': r.get('adjustment'),
                        'curriculum_suggestions': r.get('curriculum_suggestions', []),
                        'feedback': r.get('feedback')} for r in prior]}
        result, error = await llm.extract_or_error('daily_process_review', payload, settings=settings)
        if not result:
            raise ReviewUnavailable(error or 'Daily review generation failed. Any saved review is unchanged.')
        # Validate again here: callers/tests that replace the model cannot bypass
        # the persisted report contract, and fabricated citations never get saved.
        try:
            result = llm.DailyProcessReview.model_validate(result).model_dump()
        except ValueError:
            raise ReviewUnavailable('The model returned an invalid review. Any saved review is unchanged.') from None
        ids = {e['id'] for e in activity['evidence']}
        cited = result['observations'] + result['keep_doing'] + result['curriculum_suggestions']
        if result.get('adjustment'):
            cited.append(result['adjustment'])
        if any(not set(item['evidence_ids']) <= ids for item in cited):
            raise ReviewUnavailable('The model cited activity that was not supplied. Any saved review is unchanged.')
        known = {c['id'] for c in context['capabilities']} | set(context['capability_ids'])
        if result.get('adjustment'):
            result['adjustment']['capability_ids'] = [c for c in result['adjustment'].get('capability_ids', []) if c in known]
        # A plan change citing unknown evidence is dropped, not the whole review.
        result['plan_changes'] = [c for c in result.get('plan_changes', [])
                                  if set(c['evidence_ids']) <= ids | known]
        report = {**result, 'date': date, 'timezone': timezone, 'target_job': goal,
                  'generated_at': int(time.time() if now is None else now), 'partial': partial,
                  'prompt_version': PROMPT_VERSION, 'model': llm.current_model(settings)['model'],
                  'evidence': activity['evidence'], 'day_subject_counts': activity['day_subject_counts']}
        report['limitations'] = list(dict.fromkeys(activity['limitations'] + result['limitations']))
        if partial:
            report['limitations'].append('This is a partial-day preview. The scheduled review will replace it after the day ends.')
        saved = await asyncio.to_thread(store.upsert_daily_review, date, timezone, report)
        if not partial:
            try:
                await asyncio.to_thread(service.after_daily_review, store, saved, now)
            except Exception:
                log.exception('Senpai follow-through failed for %s; the review itself is saved', date)
        return saved
    finally:
        lock.release()


def senpai_context(store, now=None):
    """Bounded plan/capability/intervention context for the daily prompt."""
    from . import capabilities as caps_mod, interventions, policy
    now = int(time.time() if now is None else now)
    b = service.bundle(store, now)
    plan = service.load_plan(store, now)
    items = service.update_interventions(store, b, now)
    focus = [f['capability_id'] for f in policy.active_focus(plan)]
    session = store.get_senpai('senpai_sessions', b['today']) or {}
    return {'charter': b['settings'].get('senpai_charter', ''), 'plan': service.plan_summary(plan, now),
            'capabilities': caps_mod.digest(b['rows'], focus), 'capability_ids': [r['id'] for r in b['rows']],
            'interventions': interventions.summary(items), 'ineffective': interventions.summary(interventions.ineffective(items), 4),
            'next_session': [{k: bl[k] for k in ('title', 'activity', 'minutes', 'why')} for bl in session.get('blocks', [])][:8],
            'learning_preferences': {k: b['settings'].get('senpai_' + k) for k in ('weekly_minutes', 'session_minutes', 'mode', 'depth', 'focus_note')}}


async def run_due(store, now=None):
    settings = await asyncio.to_thread(store.get_settings)
    if not settings.get('daily_coach_enabled', True) or not settings.get('target_job', '').strip():
        return None
    return await generate(store, review_date(settings, now), now=now)
