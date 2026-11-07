"""Night Shift: the on-call game for the Fundamentals course. /api/nightshift/...

The incident plays in the browser (static/nightshift-engine.js, pure). This module keeps the runs and
connects them to the course:
- A run is raw data (the moves, the answers, the score), stored once. Progress is derived from runs.
- A run is evidence for the knowledge model (source "nightshift", soft, depth "apply") on the level's
  points: clean when it was diagnosed and fixed for good; a wrong diagnosis opens a gap the tutor and
  reviews ask about. A first clear (2★ or better) becomes a story event at Ripple.
- With the model on, three voices join: a shell that answers commands nobody scripted (consistent with
  the level's hidden truth), Priya on the incident channel, and a written post-mortem. Without it the
  game is complete: scripted commands, Priya's hints, and a templated post-mortem.
"""
import asyncio
import json
import logging
import os
import re
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth, config, llm, voice
from .knowledge_base import api as kb_api, catalog as kcat
from .store import get_store
from .tutor import story

log = logging.getLogger(__name__)
router = APIRouter(prefix='/api/nightshift', tags=['nightshift'])
HERE = os.path.dirname(os.path.abspath(__file__))
LEVELS_PATH = os.path.join(HERE, '..', 'static', 'simulators', 'nightshift.json')
SOURCE, RUNS = 'nightshift', 'nightshift_runs'
PROMPT_VERSION = 1
KEY = r'^[A-Za-z0-9_-]{1,80}$'
UNAVAILABLE = 'This needs the model, which is not connected. The game itself still works.'
FAILED = 'The model could not answer just now. Try again in a moment.'

with open(LEVELS_PATH, encoding='utf-8') as fh:
    LEVELS = {l['id']: l for l in json.load(fh)['levels']}


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


# ---------- pure ----------

def progress(runs):
    """Best stars and attempts per level, and how many are cleared (2★+)."""
    by = {}
    for r in runs:
        p = by.setdefault(r['level'], {'best': 0, 'attempts': 0})
        p['attempts'] += 1
        p['best'] = max(p['best'], r.get('stars') or 0)
    return {'levels': by, 'cleared': sum(1 for p in by.values() if p['best'] >= 2), 'total': len(LEVELS)}


def evidence(level, run, now, catalog=None):
    """Knowledge events and gaps from one run. -> (events, gaps). Unknown points are dropped."""
    canon = (lambda p: kcat.canonical(catalog, p)) if catalog else (lambda p: p)
    pts = [p for p in (canon(p) for p in level.get('points') or []) if p]
    if not pts:
        return [], []
    clean = bool(run['diagnosis'] and run['fix'] and run['lasting'])
    ev = {'key': f"{run['id']}-ev"[:64], 'kind': 'answer', 'points': pts, 'clean': clean, 'depth': 'apply', 'strength': 'soft',
          'at': now, 'note': f"Night Shift: {level['title']}", 'ref': f"nightshift:{level['id']}"}
    if not clean:
        ev['failed'] = pts if not run['diagnosis'] else []
        ev['partial'] = bool(run['diagnosis'])
    gaps = []
    if not run['diagnosis']:
        gaps.append({'key': f"{run['id']}-gap"[:64], 'point': pts[0], 'ask': level['diagnosis']['prompt'],
                     'text': f"On call in Night Shift ({level['title']}), the diagnosis was off. {level['diagnosis']['explain']}"[:500]})
    return [ev], gaps


def story_line(level, run):
    return (f"Night Shift: Nikhil was on call for \"{level['title']}\" and had it stable in {run['minutes']} minutes "
            f"({run['stars']}★). {level['debrief']}")[:400]


def transcript(log_rows, limit=40):
    """The shift so far as short lines a model can read."""
    out = []
    for r in (log_rows or [])[-limit:]:
        k = r.get('kind')
        if k == 'cmd':
            out.append(f"[{r.get('at', 0)}m] $ {r.get('cmd', '')}\n{str(r.get('out', ''))[:600]}")
        elif k == 'act':
            out.append(f"[{r.get('at', 0)}m] ACTION {r.get('label', '')}: {r.get('text', '')}")
        elif k == 'chat':
            out.append(f"[{r.get('at', 0)}m] {r.get('who', '')}: {r.get('text', '')}")
        elif k in ('sys', 'page'):
            out.append(f"[{r.get('at', 0)}m] {r.get('text', '')}")
    return '\n'.join(out)[-9000:]


def postmortem_text(level, run):
    """A blameless post-mortem from the data alone, for when the model is off."""
    acts = [r for r in run.get('log') or [] if r.get('kind') == 'act']
    timeline = '\n'.join(f"- {r.get('at', 0)} min: {r.get('label', '')}. {r.get('text', '')}" for r in acts) or '- (no actions taken)'
    return (f"## {level['title']}\n\n**Impact**: about {run.get('impact', 0):,} {level['impact']['unit']} over {run.get('minutes', 0)} minutes.\n\n"
            f"**Root cause**: {level['diagnosis']['choices'][level['diagnosis']['answer']]}\n\n**Timeline**\n{timeline}\n\n"
            f"**Lasting fix**: {level['fix']['choices'][level['fix']['answer']]}\n\n**Why**: {level['fix']['explain']}")


# ---------- models ----------

class LogRow(BaseModel):
    kind: Literal['page', 'chat', 'cmd', 'act', 'sys']
    at: int = Field(default=0, ge=0, le=1000)
    who: str = Field(default='', max_length=20)
    cmd: str = Field(default='', max_length=300)
    out: str = Field(default='', max_length=4000)
    label: str = Field(default='', max_length=200)
    text: str = Field(default='', max_length=1200)


class RunIn(BaseModel):
    key: str = Field(pattern=KEY, description='Idempotency key from the browser: a retried post stores once.')
    level: str = Field(max_length=60)
    stars: int = Field(ge=0, le=3)
    minutes: int = Field(ge=0, le=1000)
    impact: int = Field(ge=0, le=10_000_000)
    risky: int = Field(ge=0, le=20)
    hints: int = Field(ge=0, le=20)
    diagnosis: bool
    fix: bool
    lasting: bool
    log: list[LogRow] = Field(default_factory=list, max_length=200)


class Line(BaseModel):
    role: Literal['user', 'assistant']
    text: str = Field(max_length=2000)


class ShellIn(BaseModel):
    level: str = Field(max_length=60)
    command: str = Field(min_length=1, max_length=300)
    stable: bool = False
    log: list[LogRow] = Field(default_factory=list, max_length=200)


class PriyaIn(BaseModel):
    level: str = Field(max_length=60)
    stable: bool = False
    messages: list[Line] = Field(default_factory=list, max_length=30)
    log: list[LogRow] = Field(default_factory=list, max_length=200)


def _level(lid):
    if lid not in LEVELS:
        raise HTTPException(404, 'Unknown level')
    return LEVELS[lid]


async def _chat(messages, max_tokens=700):
    try:
        raw = await asyncio.to_thread(llm._raw_chat, config.TUTOR_MODEL, messages, options={'max_tokens': max_tokens, 'timeout': 60, 'think': False})
    except Exception as exc:
        log.warning('Night Shift model call failed: %s', type(exc).__name__)
        raise HTTPException(502, FAILED)
    return raw['content'] or ''


SHELL = """You are a terminal on a production box at Ripple during an incident drill. Print exactly what the command would print, nothing else: no commentary, no markdown fences, no explanations. Stay consistent with the hidden state and with every output already shown. Keep it realistic and short (under 30 lines). If the command would change something (restart, kill, edit, apply, scale), print what it would print and then the line "(this drill's shell is read-only: use the Actions panel to change things)". If the command makes no sense on this box, print the error a real shell would. Never state the root cause in words; real tools don't.

Incident: {title}
Hidden state (never quote it): {truth}
{status}

Session so far:
{log}"""

PRIYA = """You are Priya, Ripple's SRE, on the incident channel with Nikhil, who is the incident lead for this page. {persona}

You know the hidden state below, but you never say the root cause or the fix, and never confirm a guess outright. You can: say what a reading means in general terms, point at where you'd look next ("I'd want to know who's blocking whom"), question an action's risk ("that drops every connection, are we sure?"), and share facts a teammate would know that aren't the cause (what changed recently is fair game only if he asks). Two or three short sentences, chat style, no em dashes.

Incident: {title}
Hidden state: {truth}
{status}

What has happened so far:
{log}"""

POSTMORTEM = """Write the blameless post-mortem for this incident drill, in Markdown, under 250 words, in plain British English, no em dashes. Sections: **Summary** (two sentences), **Impact**, **Timeline** (the moves that mattered, with minutes), **Root cause**, **What went well**, **What to improve** (about how Nikhil ran it: the order he looked at things, anything risky, anything missed), **Follow-ups** (the lasting fix and one detection improvement). Be specific to what he actually did.

Incident: {title}
What really happened: {truth}
Correct diagnosis: {diagnosis}
Lasting fix: {fix}
His diagnosis was {diag_ok}; his lasting fix was {fix_ok}. Score: {stars} stars, stable after {minutes} minutes, {risky} risky moves, {hints} hints.

The shift:
{log}"""


# ---------- endpoints ----------

@router.get('')
def overview(store=Depends(store_for)):
    runs = sorted(store.list_knowledge(RUNS), key=lambda r: r.get('at') or 0)
    return {'enabled': llm.enabled(store.get_settings()), 'progress': progress(runs),
            'recent': [{k: r.get(k) for k in ('id', 'level', 'stars', 'minutes', 'impact', 'at')} for r in runs[-6:]][::-1]}


@router.post('/runs')
def record_run(body: RunIn, store=Depends(store_for)):
    """Store a shift once, count it as evidence, and remember a first clear in the story."""
    now, level = time.time(), _level(body.level)
    rid = f'shift-{body.key}'
    if store.get_knowledge(RUNS, rid):
        return {'id': rid, 'duplicate': True}
    before = progress(store.list_knowledge(RUNS))
    doc = body.model_dump() | {'id': rid, 'at': now, 'title': level['title']}
    store.create_knowledge(RUNS, rid, doc)
    events, gaps = evidence(level, doc, now, kcat.CATALOG)
    recorded = kb_api.write_events(store, SOURCE, events, now)[0] if events else 0
    for g in gaps:
        kb_api.open_gap(store, SOURCE, g['key'], g['point'], g['text'], g['ask'], '', now)
    first = body.stars >= 2 and before['levels'].get(body.level, {}).get('best', 0) < 2
    if first:
        st = {k: v for k, v in (store.get_knowledge('tutor_memory', 'story') or {}).items() if k != '_key'}
        st['events'] = story.remember(st.get('events'), story_line(level, doc), now)
        store.put_knowledge('tutor_memory', 'story', st)
    return {'id': rid, 'duplicate': False, 'evidence': recorded, 'gaps': len(gaps), 'first_clear': first,
            'progress': progress(store.list_knowledge(RUNS))}


def _status(stable):
    return 'Status now: stable (mitigated).' if stable else 'Status now: still broken; nothing has fixed it yet.'


@router.post('/shell')
async def shell(body: ShellIn, store=Depends(store_for)):
    """Output for a command the level didn't script, consistent with its hidden state."""
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    level = _level(body.level)
    system = SHELL.format(title=level['title'], truth=level['truth'], status=_status(body.stable), log=transcript([r.model_dump() for r in body.log], 25))
    text = await _chat([{'role': 'system', 'content': system}, {'role': 'user', 'content': '$ ' + body.command}], 600)
    text = re.sub(r'^```\w*\n?|\n?```$', '', text.strip())
    return {'out': text[:3000]}


@router.post('/priya')
async def priya(body: PriyaIn, store=Depends(store_for)):
    """Priya on the incident channel: helpful, never handing over the answer."""
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    level = _level(body.level)
    system = PRIYA.format(persona=voice.persona('priya'), title=level['title'], truth=level['truth'], status=_status(body.stable),
                          log=transcript([r.model_dump() for r in body.log], 30))
    msgs = [{'role': 'system', 'content': system}] + [{'role': m.role, 'content': m.text} for m in body.messages[-20:]]
    if msgs[-1]['role'] != 'user':
        raise HTTPException(422, 'Ask Priya something first.')
    return {'reply': voice.plain((await _chat(msgs, 400)).strip())}


@router.post('/runs/{rid}/postmortem')
async def postmortem(rid: str, store=Depends(store_for)):
    """The written post-mortem for a shift: the model's when it's on (kept with the run), else the template."""
    r = store.get_knowledge(RUNS, rid)
    if not r:
        raise HTTPException(404, 'Unknown shift')
    level = _level(r['level'])
    if r.get('postmortem', {}).get('prompt_version') == PROMPT_VERSION:
        return r['postmortem']
    if not llm.enabled(store.get_settings()):
        return {'text': postmortem_text(level, r), 'model': False}
    d, f = level['diagnosis'], level['fix']
    system = POSTMORTEM.format(title=level['title'], truth=level['truth'], diagnosis=d['choices'][d['answer']], fix=f['choices'][f['answer']],
                               diag_ok='right' if r['diagnosis'] else 'wrong', fix_ok='right' if r['fix'] else 'wrong', stars=r['stars'],
                               minutes=r['minutes'], risky=r['risky'], hints=r['hints'], log=transcript(r.get('log')))
    text = voice.plain((await _chat([{'role': 'system', 'content': system}, {'role': 'user', 'content': '(Write the post-mortem.)'}], 900)).strip())
    pm = {'text': text, 'model': True, 'prompt_version': PROMPT_VERSION, 'at': time.time()}
    store.put_knowledge(RUNS, rid, {**{k: v for k, v in r.items() if k != '_key'}, 'postmortem': pm})
    return pm
