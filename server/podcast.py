"""The daily podcast: a few minutes of your own weak spots, read aloud, with pauses to think.

An episode is a script (pure: `script`) of the ideas the feed would deal you now: last night's
misses first, then open gaps, misconceptions, shaky and fading points. A cast member asks each
question, you get a few seconds of quiet to answer in your head, then the narrator gives the
idea. No model writes it. Speech is synthesised locally with Piper (free, offline voices) in a
child process, so its memory is returned as soon as the episode is made, and encoded to MP3.

Episodes are derived: kept on local disk (PODCAST_DIR) and remade when missing. Delivered by the
Telegram bot (/podcast, or every morning with /podcast daily) and, with PODCAST_TOKEN set, as an
RSS feed a podcast app can follow at /podcast/<token>/feed.xml (that path must bypass Access).
Intent: docs/plans/ambient-learning.md.
"""
import datetime as dt
import hmac
import html
import json
import os
import subprocess
import sys
import tempfile
import threading
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from . import config
from .drip import cards as dcards
from .feed import deck, day_bounds, morning
from .knowledge_base import api as kb_api, model as kmodel
from .tutor import story

ITEMS = 12
THINK = 6.0      # seconds of quiet after each question
ASKER, NARRATOR = 'alan', 'jenny'
VOICE_FILES = {'alan': 'en_GB-alan-medium.onnx', 'jenny': 'en_GB-jenny_dioco-medium.onnx'}
_lock = threading.Lock()   # one episode at a time


def speakable(text):
    """Text as it should be heard: no markdown, arrows or slashes read out as symbols."""
    for a, b in (('->', ' to '), ('→', ' to '), ('≈', 'about '), ('~', 'about '), ('e.g.', 'for example'),
                 ('i.e.', 'that is'), ('/s', ' a second'), ('`', ''), ('*', ''), (' vs ', ' versus '), ('&', ' and ')):
        text = text.replace(a, b)
    return ' '.join(text.split())


def script(items, company, day):
    """-> segments [{voice, text, pause}] for one episode. `items`: feed cards."""
    when = day.strftime('%A %-d %B')
    n = len(items)
    seg = [{'voice': NARRATOR, 'pause': 1.0,
            'text': f'Senpai daily, {when}. Ripple is at {company["label"]}, with {company["users"]}. '
                    f'{n} idea{"s" if n != 1 else ""} today, the shakiest first. After each question, answer it in your head '
                    f'before you hear the idea.'}]
    for i, c in enumerate(items, 1):
        lead = {'morning': 'One you missed last night. ', 'gap': 'Just the part you missed last time. ',
                'misconception': 'You got this one wrong before. '}.get(c['reason'], '')
        seg.append({'voice': ASKER, 'pause': THINK, 'text': f'{lead}{c["speaker"]} asks: {speakable(c["ask"])}'})
        seg.append({'voice': NARRATOR, 'pause': 1.6, 'text': speakable(c['claim'])})
        if i % 4 == 0 and i < n:
            seg.append({'voice': NARRATOR, 'pause': 0.8, 'text': f'That is {i} of {n}.'})
    seg.append({'voice': NARRATOR, 'pause': 0.5,
                'text': 'That is today. Anything you could not answer will come back on Telegram. See you tomorrow.'})
    return seg


def episode_items(store, now, n=ITEMS):
    c, events, states, seen, mis = kb_api.evidence(store, now)
    yesterday, today, _ = day_bounds(now, dcards.tz_for(store.get_settings()))
    items = deck(c, states, seen, mis, now, n, first=morning(events, yesterday, today), first_reason='morning')
    sc = story.scale(kmodel.summary(c, states, seen, mis, now))
    return items, {'label': sc['label'], 'users': sc['users']}


# ---- making the audio ---------------------------------------------------------------------

def voices_dir():
    return config.PODCAST_VOICES


def available():
    try:
        import lameenc  # noqa: F401
        import piper  # noqa: F401
    except ImportError:
        return False
    return all(os.path.exists(os.path.join(voices_dir(), f)) for f in VOICE_FILES.values())


def path_for(day):
    return os.path.join(config.PODCAST_DIR, f'{day.isoformat()}.mp3')


def make(store, now=None, force=False):
    """Today's episode, made if missing. -> (path, segments count) or raises RuntimeError."""
    now = now or time.time()
    day = dt.datetime.fromtimestamp(now, dcards.tz_for(store.get_settings())).date()
    out = path_for(day)
    with _lock:
        if os.path.exists(out) and not force:
            return out
        if not available():
            raise RuntimeError('Speech is not installed here (Piper voices missing)')
        items, company = episode_items(store, now)
        if not items:
            raise RuntimeError('Nothing to talk about yet: start a lesson first')
        os.makedirs(config.PODCAST_DIR, exist_ok=True)
        segments = script(items, company, day)
        with tempfile.TemporaryDirectory() as tmp:
            spec = os.path.join(tmp, 'script.json')
            with open(spec, 'w') as fh:
                json.dump({'segments': segments, 'voices': {k: os.path.join(voices_dir(), f) for k, f in VOICE_FILES.items()}}, fh)
            # Child processes, one per voice: each model's memory goes back to the system when it ends.
            parts = []
            for name in dict.fromkeys(s['voice'] for s in segments):
                parts.append(os.path.join(tmp, f'{name}.npz'))
                _child(['voice', name, spec, parts[-1]])
            _child(['encode', spec, out + '.part', *parts])
        os.replace(out + '.part', out)
        for old in sorted(f for f in os.listdir(config.PODCAST_DIR) if f.endswith('.mp3'))[:-14]:
            os.unlink(os.path.join(config.PODCAST_DIR, old))
        return out


def _child(args):
    r = subprocess.run([sys.executable, '-m', 'server.podcast_synth', *args], capture_output=True, text=True,
                       timeout=900, cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if r.returncode != 0:
        raise RuntimeError(f'Speech failed: {r.stderr.strip()[-300:]}')


# ---- the feed a podcast app follows -------------------------------------------------------

router = APIRouter(tags=['podcast'])


def _check(token):
    if not config.PODCAST_TOKEN or not hmac.compare_digest(token.encode(), config.PODCAST_TOKEN.encode()):
        raise HTTPException(404, 'Not found')


def rss(episodes, base, token):
    """-> RSS XML for [(date, path, bytes)], newest first."""
    items = ''.join(
        f'<item><title>Senpai daily, {d.strftime("%A %-d %B")}</title><guid isPermaLink="false">senpai-{d.isoformat()}</guid>'
        f'<pubDate>{dt.datetime.combine(d, dt.time(6, 0)).strftime("%a, %d %b %Y %H:%M:%S +0000")}</pubDate>'
        f'<enclosure url="{html.escape(base)}/podcast/{token}/{d.isoformat()}.mp3" length="{size}" type="audio/mpeg"/></item>'
        for d, _, size in episodes)
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>'
            '<title>Senpai daily</title><description>Your weak spots, read aloud, with time to think.</description>'
            f'<link>{html.escape(base)}</link><language>en-gb</language><itunes:author>Leetcode Senpai</itunes:author>'
            f'<itunes:image href="{html.escape(base)}/apple-touch-icon.png"/>{items}</channel></rss>')


@router.get('/podcast/{token}/feed.xml')
def podcast_feed(token: str):
    _check(token)
    store = kb_api.get_store(config.ACCESS_UID)
    try:
        make(store)
    except RuntimeError:
        pass   # the feed still lists what there is
    eps = []
    if os.path.isdir(config.PODCAST_DIR):
        for f in sorted(os.listdir(config.PODCAST_DIR), reverse=True):
            if f.endswith('.mp3'):
                p = os.path.join(config.PODCAST_DIR, f)
                eps.append((dt.date.fromisoformat(f[:-4]), p, os.path.getsize(p)))
    return Response(rss(eps, config.APP_URL, token), media_type='application/rss+xml')


@router.get('/podcast/{token}/{day}.mp3')
def podcast_episode(token: str, day: str):
    _check(token)
    try:
        p = path_for(dt.date.fromisoformat(day))
    except ValueError:
        raise HTTPException(404, 'Not found')
    if not os.path.exists(p):
        raise HTTPException(404, 'Not found')
    return FileResponse(p, media_type='audio/mpeg')
