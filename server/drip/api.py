"""/api/drip: what phone automations tell the drip. POST /opened {app} → maybe a question now."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..knowledge_base import api as kb_api
from . import bot, context

router = APIRouter(prefix='/api/drip', tags=['drip'])


class Opened(BaseModel):
    app: str = Field(min_length=1, max_length=60)


@router.post('/opened')
async def opened(body: Opened, who=Depends(kb_api.caller)):
    """An app was opened. Sends a card about it when the limits allow; says why not otherwise."""
    if bot.RUNNING is None:
        raise HTTPException(503, 'The Telegram drip is not running here')
    return await asyncio.to_thread(bot.RUNNING.nudge, body.app)


@router.get('/apps')
def apps(who=Depends(kb_api.caller)):
    """The app names a phone automation can send, with the lessons each one asks about."""
    seen, out = set(), []
    for a in context.APPS.values():
        if a['name'] not in seen:
            seen.add(a['name'])
            out.append({'name': a['name'], 'aliases': a.get('aliases') or [], 'lessons': a['lessons']})
    return {'apps': out}
