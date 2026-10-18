"""Authenticated daily process review history, generation and recommendation feedback."""
import asyncio
import datetime as dt
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth, daily_coach, llm
from .store import get_store

router = APIRouter(prefix='/api/coach/daily', tags=['learning-coach'])


class GenerateReview(BaseModel):
    date: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    force: bool = False


class ReviewFeedback(BaseModel):
    timezone: str = Field(max_length=100)
    status: Literal['accepted', 'dismissed', 'pending']
    note: str = Field(default='', max_length=2000)


def validate_date(date):
    try:
        if dt.date.fromisoformat(date).isoformat() != date:
            raise ValueError()
    except ValueError:
        raise HTTPException(400, 'Use a calendar date in YYYY-MM-DD format.') from None


@router.get('')
async def latest(uid: str = Depends(auth.require_user)):
    store = await asyncio.to_thread(get_store, uid)
    settings = await asyncio.to_thread(store.get_settings)
    reports = await asyncio.to_thread(daily_coach.history, store)
    status = (await asyncio.to_thread(store.get_flags)).get('daily_coach_status')
    eligible = daily_coach.review_date(settings)
    if status and (status.get('timezone') != settings['daily_coach_timezone']
                   or status.get('target_job') != settings['target_job'] or status.get('date') != eligible):
        status = None
    return {'reports': reports, 'target_job': settings['target_job'],
            'enabled': settings['daily_coach_enabled'], 'timezone': settings['daily_coach_timezone'],
            'review_time': settings['daily_coach_time'], 'eligible_date': eligible,
            'today': daily_coach.local_now(settings).date().isoformat(),
            'model_enabled': llm.enabled(settings), 'status': status}


@router.post('')
async def generate(body: GenerateReview, uid: str = Depends(auth.require_user)):
    store = await asyncio.to_thread(get_store, uid)
    try:
        return {'report': await daily_coach.generate(store, body.date, force=body.force)}
    except daily_coach.ReviewUnavailable as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post('/{date}/feedback')
async def feedback(date: str, body: ReviewFeedback, uid: str = Depends(auth.require_user)):
    validate_date(date)
    try:
        ZoneInfo(body.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(400, 'Use a valid IANA timezone.') from None
    store = await asyncio.to_thread(get_store, uid)
    report = await asyncio.to_thread(store.update_daily_review_feedback, date, body.timezone,
                                    body.status, body.note.strip())
    if report is None:
        raise HTTPException(404, 'Daily review not found.')
    return {'report': report}
