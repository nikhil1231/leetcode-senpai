"""The drip bot: poll Telegram, answer commands, grade replies, and send cards on schedule.

Synchronous and step-driven (`step` = one long poll, the updates it returned, then one scheduling
tick), so tests drive it with a fake transport and a fixed clock. State is one small document
(`drip/state`); each card sent is its own document (`drip/card-<n>`). Only the configured chat
is served; before one is configured, /start replies with the chat id to put in the env.
"""
import asyncio
import base64
import html
import datetime as dt
import json
import logging
import random
import threading
import time

import httpx

from .. import config, llm
from ..knowledge_base import api as kb_api, catalog as kcat, model as kmodel
from . import cards, context, telegram

log = logging.getLogger(__name__)
RUNNING = None   # the bot the app's background task runs, for /api/drip/opened
COLL = 'drip'
SOURCE = 'telegram'


def configured():
    return bool(config.TELEGRAM_BOT_TOKEN)


class Bot:
    def __init__(self, store, tg=telegram, clock=time.time, rng=None):
        self.store, self.tg, self.clock, self.rng = store, tg, clock, rng or random.Random()
        self.lock = threading.RLock()   # the poll loop and web requests (nudge) share the state
        self.chat = str(config.TELEGRAM_CHAT_ID or '')
        saved = store.get_knowledge(COLL, 'state') or {}
        self.state = {'offset': 0, 'n': 0, 'pending': None, 'paused': False, 'next_at': None, 'day': None,
                      'sent': 0, 'answered': 0, 'right': 0, **{k: v for k, v in saved.items() if k != '_key'}}

    # ---- plumbing -------------------------------------------------------------------
    def tz(self):
        return cards.tz_for(self.store.get_settings())

    def save(self):
        self.store.put_knowledge(COLL, 'state', self.state)

    def card(self, n):
        return self.store.get_knowledge(COLL, f'card-{n}')

    def put_card(self, c):
        self.store.put_knowledge(COLL, f'card-{c["n"]}', c)

    def say(self, text, buttons=None):
        params = {'chat_id': self.chat, 'text': text, 'parse_mode': 'HTML', 'disable_web_page_preview': True}
        if buttons:
            params['reply_markup'] = {'inline_keyboard': [[{'text': t, 'url': d} if d.startswith('https://') else
                                                           {'text': t, 'callback_data': d} for t, d in buttons]]}
        return self.tg.call('sendMessage', **params)

    def roll_day(self, now):
        today = cards.local_day(now, self.tz())
        if self.state['day'] != today:
            self.state.update(day=today, sent=0, answered=0, right=0, sleep=self.load_sleep(today), next_at=None)

    # ---- the loop ---------------------------------------------------------------------
    def step(self, poll=telegram.POLL):
        updates = self.tg.call('getUpdates', offset=self.state['offset'], timeout=poll,
                               allowed_updates=['message', 'callback_query'])
        with self.lock:
            self._process(updates)

    def _process(self, updates):
        self.roll_day(self.clock())
        for u in updates:
            self.state['offset'] = u['update_id'] + 1
            try:
                self.handle(u)
            except Exception:
                log.exception('Drip update failed')
        if updates:
            self.save()
        self.tick()

    def tick(self):
        if not self.chat:
            return
        now = self.clock()
        self.roll_day(now)
        self.bedtime(now)
        if self.state['pending'] is not None:
            c = self.card(self.state['pending'])
            if c and c['status'] == 'pending' and now - c['sent_at'] > cards.EXPIRE:
                self.close(c, 'expired', now)
            else:
                return
        if self.state['paused']:
            return
        local = dt.datetime.fromtimestamp(now, self.tz())
        if self.state['next_at'] is None:
            self.state['next_at'] = cards.next_send(local, self.per_day(), config.DRIP_WINDOW, self.rng).timestamp()
            self.save()
        if now >= self.state['next_at']:
            self.send_card(now)
            self.state['next_at'] = cards.next_send(local, self.per_day(), config.DRIP_WINDOW, self.rng).timestamp()
            self.save()

    def bedtime(self, now):
        """Once a day after DRIP_BEDTIME: if you missed anything today, a link to go over it."""
        if not config.DRIP_BEDTIME or self.state['paused'] or self.state.get('bedtime_day') == self.state['day']:
            return
        start, _ = cards.window(config.DRIP_BEDTIME + '-23:59')
        local = dt.datetime.fromtimestamp(now, self.tz())
        if local.hour * 60 + local.minute < start:
            return
        from ..feed import tonight_points   # feed imports drip.cards; import here to keep the layers one way
        missed = tonight_points(self.store, now)
        self.state['bedtime_day'] = self.state['day']
        self.save()
        if missed:
            self.say(cards.bedtime_text(len(missed)), [('Go over them', f'{config.APP_URL}/feed?set=tonight&n={min(10, len(missed))}')])

    # ---- updates ----------------------------------------------------------------------
    def handle(self, u):
        if 'callback_query' in u:
            q = u['callback_query']
            if str(q['message']['chat']['id']) != self.chat:
                return
            self.tg.call('answerCallbackQuery', callback_query_id=q['id'])
            return self.button(q.get('data', ''))
        m = u.get('message') or {}
        chat = str((m.get('chat') or {}).get('id', ''))
        text = (m.get('text') or '').strip()
        if not self.chat:
            if text.startswith('/start'):
                self.tg.call('sendMessage', chat_id=chat, text=f'Your chat id is {chat}. Set TELEGRAM_CHAT_ID={chat} in the app env to turn the drip on.')
            return
        if chat != self.chat:
            return
        if text.startswith('/'):
            word, *args = text.split()
            return self.command(word.split('@')[0].lower(), args)
        if m.get('voice'):
            text = self.transcribe(m['voice'])
            if text is None:
                return
        if text:
            self.answer(text)

    def usual_per_day(self):
        return cards.clamp_per_day(self.state.get('per_day') or config.DRIP_PER_DAY)

    def per_day(self):
        """Today's pace: the usual one, lighter after a poor night."""
        usual = self.usual_per_day()
        return max(1, round(usual * cards.sleep_factor(self.state.get('sleep'))))

    def load_sleep(self, today):
        """Last night from Sundial, once a day. Any failure means no adjustment."""
        if not config.SUNDIAL_URL:
            return None
        try:
            r = httpx.get(f'{config.SUNDIAL_URL}/api/coach/days', params={'start': today, 'end': today}, timeout=15)
            r.raise_for_status()
            sleep = (r.json() or [{}])[-1].get('sleep') or {}
            return {k: sleep.get(k) for k in ('asleep_min', 'score', 'readiness')} if sleep else None
        except Exception:
            log.warning('Drip could not read sleep from Sundial', exc_info=True)
            return None

    def command(self, cmd, args=()):
        now = self.clock()
        self.roll_day(now)
        if cmd in ('/start', '/help'):
            self.say(cards.HELP)
        elif cmd == '/next':
            pending = self.card(self.state['pending']) if self.state['pending'] is not None else None
            if pending and pending['status'] == 'pending':
                self.say('Still waiting on this one:\n\n' + pending['text'], [('Show answer', f'reveal:{pending["n"]}'), ('Skip', f'skip:{pending["n"]}')])
            else:
                self.send_card(now)
        elif cmd == '/pause':
            self.state['paused'] = True
            self.say('Paused. /resume to start again.')
        elif cmd == '/resume':
            self.state.update(paused=False, next_at=None)
            self.say('Back on. The next question comes later today.')
        elif cmd in ('/frequency', '/freq'):
            n = cards.parse_per_day(args[0]) if args else None
            if args and n is None:
                self.say(f'Send a number from {cards.PER_DAY_MIN} to {cards.PER_DAY_MAX}, like /frequency 8.')
            elif n is None:
                self.say(cards.frequency_text(self.usual_per_day(), config.DRIP_WINDOW, current=True))
            else:
                self.state.update(per_day=n, next_at=None)
                self.say(cards.frequency_text(n, config.DRIP_WINDOW))
        elif cmd == '/stats':
            c, _, states, seen, mis = kb_api.evidence(self.store, now)
            summary = kmodel.summary(c, states, seen, mis, now)
            note = cards.sleep_text(self.state.get('sleep'), self.per_day(), self.usual_per_day())
            self.say(cards.stats_text(summary, self.state['sent'], self.state['answered'], self.state['right'], self.state['paused'], note))
        else:
            self.say(cards.HELP)
        self.save()

    def button(self, data):
        parts = data.split(':')
        if len(parts) < 2 or not parts[1].isdigit():
            return
        c, now = self.card(int(parts[1])), self.clock()
        if not c:
            return
        point = self.point(c)
        if parts[0] == 'skip' and c['status'] == 'pending':
            self.close(c, 'skipped', now)
            self.say('Skipped. I will bring it back another time.')
        elif parts[0] == 'reveal' and c['status'] == 'pending' and point:
            c.update(status='revealed', revealed_at=now)
            self.put_card(c)
            self.state['pending'] = None
            self.save()
            self.say(cards.reveal_text(point, c.get('focus')), [('I knew it', f'self:{c["n"]}:1'), ('I did not', f'self:{c["n"]}:0')])
        elif parts[0] == 'self' and len(parts) == 3 and c['status'] in ('revealed', 'pending') and point:
            knew = parts[2] == '1'
            self.record(c, point, knew, cards.depth(point) if knew else 'recall', f'self-graded: {"knew it" if knew else "did not"}', now)
            c.update(status='answered', verdict='right' if knew else 'wrong', self_graded=True)
            self.put_card(c)
            self.state['right'] += knew
            self.save()
            self.say('Noted.' if knew else 'Noted. It will come back sooner.')

    def transcribe(self, voice):
        if not llm.enabled(self.store.get_settings()):
            self.say('Voice needs the model, which is not connected. Type your answer instead.')
            return None
        try:
            audio = self.tg.download(voice['file_id'])
            text = llm.transcribe(base64.b64encode(audio).decode(), 'ogg', 'en')
        except Exception:
            log.warning('Drip voice download failed', exc_info=True)
            text = None
        if not text:
            self.say('I could not make that out. Try again or type it.')
            return None
        self.say(f'<i>Heard:</i> {html.escape(text)}')
        return text

    # ---- cards --------------------------------------------------------------------------
    def point(self, c):
        pid = kcat.canonical(kcat.CATALOG, c['point'])
        return kcat.CATALOG['points'].get(pid) if pid else None

    def in_window(self, now):
        start, end = cards.window(config.DRIP_WINDOW)
        local = dt.datetime.fromtimestamp(now, self.tz())
        return start <= local.hour * 60 + local.minute < end

    def nudge(self, name):
        """An app was just opened on the phone: maybe send a question about how it works."""
        with self.lock:
            now = self.clock()
            self.roll_day(now)
            app = context.find(name)
            pending = self.card(self.state['pending']) if self.state['pending'] is not None else None
            pending = pending if pending and pending['status'] == 'pending' else None
            ok, why = context.decide(app, self.state, pending['sent_at'] if pending else None, now, self.in_window(now))
            if not ok or not self.chat:
                return {'sent': False, 'reason': why if ok is False else 'no chat configured'}
            if pending:
                self.close(pending, 'replaced', now)
            c = self.send_card(now, app=app)
            if not c:
                return {'sent': False, 'reason': 'nothing to ask about it yet'}
            context.remember(self.state, app, now)
            self.save()
            return {'sent': True, 'reason': 'ok', 'point': c['point']}

    def send_card(self, now, app=None):
        self.roll_day(now)
        cat, _, states, seen, mis = kb_api.evidence(self.store, now)
        if app:
            point, reason = context.pick(cat, states, seen, mis, now, app, cards.COOLDOWN)
        else:
            point, reason = cards.pick(cat, states, seen, mis, now, self.rng)
        if not point:
            return None
        self.state['n'] += 1
        n = self.state['n']
        gap = cards.open_gap(mis, point['id'])
        if gap:
            reason = 'gap'
        text = cards.card_text(point, reason, gap['ask'] if gap else None, app['line'] if app else None)
        msg = self.say(text, [('Show answer', f'reveal:{n}'), ('Skip', f'skip:{n}')])
        c = {'n': n, 'point': point['id'], 'reason': reason, 'text': text, 'sent_at': now, 'status': 'pending',
             'message_id': (msg or {}).get('message_id'), 'app': app['name'] if app else None}
        if gap:
            c.update(gap=gap['_key'], ask=gap['ask'], focus=gap['text'])
        self.put_card(c)
        self.state.update(pending=n, sent=self.state['sent'] + 1)
        self.save()
        return c

    def answer(self, text):
        now = self.clock()
        c = self.card(self.state['pending']) if self.state['pending'] is not None else None
        if not c or c['status'] != 'pending':
            self.say('No question is open. /next for one.')
            return
        point = self.point(c)
        if not point:
            self.close(c, 'expired', now)
            return
        grade = self.grade(point, text, c.get('ask'), c.get('focus'))
        if grade is None:
            c.update(answer=text[:2000])
            self.put_card(c)
            return self.button(f'reveal:{c["n"]}')
        verdict, clean = grade['verdict'], grade['verdict'] == 'right'
        self.record(c, point, clean, cards.depth(point), text[:500], now, partial=verdict == 'partly')
        missing = ''
        if clean:
            kb_api.resolve_open(self.store, point['id'], now, 'Answered in full on Telegram.', kind='gap')
        elif verdict == 'partly' and grade['missing'].strip() and grade['follow_up'].strip():
            missing = grade['missing'].strip()
            kb_api.open_gap(self.store, SOURCE, f'card-{c["n"]}', point['id'], missing, grade['follow_up'], text[:400], now)
        elif verdict == 'wrong' and grade['misconception'].strip():
            kb_api.add_misconception(self.store, SOURCE, f'card-{c["n"]}', point['id'], grade['misconception'], text[:400], now)
        c.update(status='answered', answer=text[:2000], verdict=verdict, feedback=grade['feedback'], answered_at=now)
        self.put_card(c)
        self.state.update(pending=None, right=self.state['right'] + clean)
        self.save()
        self.say(cards.result_text(verdict, grade['feedback'], point, missing))

    def grade(self, point, text, ask=None, focus=None):
        if not llm.enabled(self.store.get_settings()):
            return None
        try:
            raw = llm._raw_generate('openrouter', config.TUTOR_MODEL, cards.GRADE_SYSTEM,
                                    json.dumps(cards.grade_payload(point, text, ask, focus), ensure_ascii=False), cards.Grade,
                                    options={'effort': 'low', 'max_tokens': 1000, 'timeout': 30, 'metadata': True})
            return cards.Grade.model_validate_json(raw['content']).model_dump()
        except Exception:
            log.warning('Drip grading failed', exc_info=True)
            return None

    def record(self, c, point, clean, depth, note, now, partial=False):
        kb_api.write_events(self.store, SOURCE, [{'key': f'card-{c["n"]}', 'points': [point['id']], 'clean': clean,
                                                  'partial': partial and not clean, 'depth': depth, 'strength': 'soft',
                                                  'note': note, 'ref': f'card-{c["n"]}'}], now)
        self.state['answered'] += 1
        if self.state['pending'] == c['n']:
            self.state['pending'] = None
        self.save()

    def close(self, c, status, now):
        """A card nobody answered: it was still shown, so it counts as an exposure."""
        kb_api.write_events(self.store, SOURCE, [{'key': f'card-{c["n"]}-shown', 'kind': 'exposure', 'points': [c['point']]}], now)
        c.update(status=status, closed_at=now)
        self.put_card(c)
        if self.state['pending'] == c['n']:
            self.state['pending'] = None
        self.save()


COMMANDS = [('next', 'A question now'), ('stats', 'How you are doing'), ('frequency', 'Questions a day, 1 to 10'),
            ('pause', 'Stop the questions'), ('resume', 'Start them again'), ('help', 'What I do')]


def register(tg=telegram):
    """Fill the bot's command menu. Cosmetic: a failure is logged and ignored."""
    try:
        tg.call('setMyCommands', commands=[{'command': c, 'description': d} for c, d in COMMANDS])
    except Exception:
        log.warning('Drip command menu not set', exc_info=True)


async def run(get_store):
    """Own the bot for the app's lifetime. Every failure is logged and retried; nothing else waits on it."""
    global RUNNING
    uid = config.DEV_UID if config.local_mode() else config.ACCESS_UID
    bot, delay = None, 5
    while True:
        try:
            if bot is None:
                bot = await asyncio.to_thread(Bot, await asyncio.to_thread(get_store, uid))
                await asyncio.to_thread(register)
                RUNNING = bot
            await asyncio.to_thread(bot.step)
            delay = 5
        except asyncio.CancelledError:
            raise
        except Exception:
            log.warning('Drip loop failed; retrying in %ss', delay, exc_info=True)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 300)
