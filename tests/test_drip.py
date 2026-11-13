"""The Telegram drip: scheduling, card choice, and the bot against a fake Telegram and a fixed clock."""
import datetime as dt
import json
import random
from zoneinfo import ZoneInfo

import pytest

from server import config, llm, voice
from server.drip import assess, bot as drip, cards
from server.knowledge_base import api as kb_api, catalog as kcat, model as kmodel
from server.tutor import story
from tests.fake_store import FakeStore

LON = ZoneInfo('Europe/London')
DAY = 86400
T0 = dt.datetime(2026, 11, 2, 9, 0, tzinfo=LON).timestamp()


# ---- scheduling ------------------------------------------------------------------------

def at(h, m=0, day=2):
    return dt.datetime(2026, 11, day, h, m, tzinfo=LON)


def test_sends_spread_across_the_window_and_wrap_to_tomorrow():
    rng = random.Random(1)
    first = cards.next_send(at(7, 0), 6, '08:30-22:30', rng)
    assert at(8, 30) <= first <= at(9, 30)
    nxt = cards.next_send(at(12, 0), 6, '08:30-22:30', rng)
    assert at(13, 45) <= nxt <= at(15, 15)  # 14 h / 6 = 140 min, ±25%
    late = cards.next_send(at(22, 0), 6, '08:30-22:30', rng)
    assert late.date() == dt.date(2026, 11, 3) and late.hour in (8, 9)
    assert cards.next_send(at(23, 0), 6, '08:30-22:30', rng).date() == dt.date(2026, 11, 3)
    assert cards.next_send(at(12, 0), 100, '08:30-22:30', rng) >= at(12, 0) + dt.timedelta(seconds=cards.MIN_GAP * 0.75)


# ---- choosing a card -------------------------------------------------------------------

def ans(point, at, clean=True):
    return {'point': point, 'at': at, 'kind': 'answer', 'clean': clean, 'depth': 'recall', 'strength': 'hard', 'blame': 'full'}


MISS = 'sd.cache-aside.db-load-is-miss-rate'


def test_pick_prefers_misconceptions_then_weak_then_seen_then_started_lessons():
    c = kcat.CATALOG
    rng = random.Random(0)
    states, seen = kmodel.replay([])
    p, reason = cards.pick(c, states, seen, [], T0, rng)
    assert reason == 'new' and p['lesson'] == next(iter(kcat.lessons('system-design')))
    states, seen = kmodel.replay([ans(MISS, T0 - 3 * DAY)])
    p, reason = cards.pick(c, states, seen, [], T0, rng)
    assert reason == 'fading' and p['id'] == MISS  # the only point you have seen, three days on
    p, reason = cards.pick(c, states, seen, [], T0 - 3 * DAY + 3600, rng)
    assert reason == 'new' and p['lesson'] == 'cache-aside'  # cooling down: a new idea from the same lesson
    states, seen = kmodel.replay([ans(MISS, T0 - 2 * DAY, clean=False)])
    assert cards.pick(c, states, seen, [], T0, rng) == (c['points'][MISS], 'shaky')
    other = 'sd.cache-aside.delete-beats-set'
    p, reason = cards.pick(c, states, seen, [{'point': other, 'status': 'open'}], T0, rng)
    assert (p['id'], reason) == (other, 'misconception')


def test_card_text_speaks_in_the_casts_voice_and_escapes_html():
    p = {**kcat.CATALOG['points'][MISS], 'prompt': 'Is 1 < 2 & does it matter?'}
    text = cards.card_text(p)
    assert text.startswith('<b>Marcus</b>\n') and '1 &lt; 2 &amp; does' in text and '<i>' not in text
    assert cards.card_text(p, context='You just opened Uber.').startswith('<b>Marcus</b>\nYou just opened Uber. ')


# ---- the bot ---------------------------------------------------------------------------

class FakeTelegram:
    def __init__(self):
        self.sent, self.updates, self.files, self.n = [], [], {}, 0

    def call(self, method, **p):
        if method == 'getUpdates':
            out, self.updates = [u for u in self.updates if u['update_id'] >= p['offset']], []
            return out
        if method == 'sendMessage':
            self.n += 1
            self.sent.append(p)
            return {'message_id': self.n}
        return True

    def download(self, file_id):
        return self.files[file_id]

    def last(self):
        return self.sent[-1]['text']


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(config, 'TELEGRAM_BOT_TOKEN', 'token')
    monkeypatch.setattr(config, 'TELEGRAM_CHAT_ID', '42')
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    store, tg, clock = FakeStore('me'), FakeTelegram(), Clock(T0)
    store.settings = {'daily_coach_timezone': 'Europe/London'}
    grades, env_prompts = [], []

    def fake(provider, model, system, prompt, schema, options=None):
        assert schema is cards.Grade and not llm.forbidden_model(model) and system == cards.STORY_GRADE_SYSTEM
        assert json.loads(prompt)['ANSWER']
        env_prompts.append(json.loads(prompt))
        return {'content': json.dumps({'missing': '', 'follow_up': '', 'misconception': '', **grades.pop(0)})}
    monkeypatch.setattr(llm, '_raw_generate', fake)
    phrasings = []

    talks = []

    def chat(model, messages, options=None):
        assert not llm.forbidden_model(model)
        if messages[0]['content'].startswith(cards.CHAT_SYSTEM):
            talks.append(messages)
            return {'content': f'"Reply {len(talks)}"', 'usage': {}}
        assert messages[0]['content'] == assess.PHRASE_SYSTEM
        phrasings.append(json.loads(messages[1]['content']))
        return {'content': f'"Quick one from Ripple: {phrasings[-1]["QUESTION"]}"', 'usage': {}}
    monkeypatch.setattr(llm, '_raw_chat', chat)
    # Everything has been covered in a lesson: Telegram only asks about ideas met elsewhere.
    kb_api.write_events(store, 'lesson', [{'key': 'all', 'kind': 'exposure', 'points': [p['id'] for p in kcat.active(kcat.CATALOG)]}],
                        T0 - 30 * DAY)
    b = drip.Bot(store, tg=tg, clock=clock, rng=random.Random(3))
    b.prompts, b.phrasings, b.talks = env_prompts, phrasings, talks
    return b, store, tg, clock, grades


uid = iter(range(1000, 10**6))


def msg(text, chat=42):
    return {'update_id': next(uid), 'message': {'chat': {'id': chat}, 'text': text}}


def press(data, chat=42):
    return {'update_id': next(uid), 'callback_query': {'id': 'q', 'data': data, 'message': {'chat': {'id': chat}}}}


def events(store):
    return sorted((e for e in store.list_knowledge('knowledge_events') if e['source'] != 'lesson'), key=lambda e: e['at'])


def test_cards_go_out_on_schedule_and_wait_for_an_answer(env):
    b, store, tg, clock, _ = env
    b.tick()
    assert tg.sent == [] and b.state['next_at'] > clock.t
    clock.t = b.state['next_at'] + 1
    b.tick()
    assert len(tg.sent) == 1 and b.state['pending'] == 1 and b.state['sent'] == 1
    assert tg.sent[0]['reply_markup']['inline_keyboard'][0][0]['callback_data'] == 'reveal:1'
    clock.t = b.state['next_at'] + 1
    b.tick()
    assert len(tg.sent) == 1  # never two questions open at once
    clock.t += cards.EXPIRE
    b.tick()
    assert store.get_knowledge('drip', 'card-1')['status'] == 'expired'
    assert [e['kind'] for e in events(store)] == ['exposure']
    assert len(tg.sent) == 2 and b.state['pending'] == 2  # the next one was already due


def test_a_typed_answer_is_graded_and_recorded(env):
    b, store, tg, clock, grades = env
    c = b.send_card(clock.t)
    grades.append({'verdict': 'wrong', 'feedback': 'You described latency, not load.', 'misconception': 'thinks caches only cut latency'})
    tg.updates = [msg('caches just make it faster')]
    b.step(poll=0)
    assert tg.last().startswith('❌ <b>Priya:</b> You described latency') and '<blockquote expandable><b>The idea</b>' in tg.last()
    e = events(store)[-1]
    assert (e['source'], e['strength'], e['clean'], e['points']) == ('telegram', 'soft', False, [c['point']])
    m = store.list_knowledge('knowledge_misconceptions')[0]
    assert m['source'] == 'telegram' and m['quote'] == 'caches just make it faster'
    assert store.get_knowledge('drip', 'card-1')['verdict'] == 'wrong' and b.state['pending'] is None
    assert b.state['offset'] == tg_offset(store)
    assert b.prompts[-1]['STORY'] == story.BIBLE['pitch']   # the reply stays inside the story


def tg_offset(store):
    return store.get_knowledge('drip', 'state')['offset']


def test_without_the_model_you_see_the_answer_and_grade_yourself(env, monkeypatch):
    b, store, tg, clock, _ = env
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    b.send_card(clock.t)
    tg.updates = [msg('my guess')]
    b.step(poll=0)
    assert tg.last().startswith('<b>Priya:</b> ') and tg.sent[-1]['reply_markup']['inline_keyboard'][0][0]['callback_data'] == 'self:1:1'
    tg.updates = [press('self:1:1')]
    b.step(poll=0)
    assert events(store)[-1]['clean'] is True and store.get_knowledge('drip', 'card-1')['self_graded']
    assert b.state['answered'] == 1


def test_skip_and_reveal_buttons(env):
    b, store, tg, clock, _ = env
    b.send_card(clock.t)
    tg.updates = [press('skip:1')]
    b.step(poll=0)
    assert store.get_knowledge('drip', 'card-1')['status'] == 'skipped' and events(store)[-1]['kind'] == 'exposure'
    b.send_card(clock.t)
    tg.updates = [press('reveal:2'), press('self:2:0')]
    b.step(poll=0)
    assert events(store)[-1]['clean'] is False and tg.last()[len('<b>Priya:</b> '):] in voice.member('priya')['lines']['missed']


def test_voice_notes_are_transcribed_then_graded(env, monkeypatch):
    b, store, tg, clock, grades = env
    b.send_card(clock.t)
    tg.files['v1'] = b'OggS...'
    monkeypatch.setattr(llm, 'transcribe', lambda audio, fmt, lang=None: 'load is requests times the miss rate')
    grades.append({'verdict': 'right', 'feedback': 'Exactly.', 'misconception': ''})
    tg.updates = [{'update_id': next(uid), 'message': {'chat': {'id': 42}, 'voice': {'file_id': 'v1'}}}]
    b.step(poll=0)
    assert any(s['text'].startswith('🎙️ load is')  for s in tg.sent) and '✅' in tg.last()
    assert events(store)[-1]['clean'] is True and b.state['right'] == 1


def test_commands_and_strangers(env):
    b, store, tg, clock, _ = env
    tg.updates = [msg('/pause'), msg('/next', chat=7), msg('hello', chat=7)]
    b.step(poll=0)
    assert b.state['paused'] and len(tg.sent) == 1
    clock.t += DAY
    b.tick()
    assert len(tg.sent) == 1
    tg.updates = [msg('/resume'), msg('/next'), msg('/next'), msg('/stats'), msg('/help')]
    b.step(poll=0)
    texts = [s['text'] for s in tg.sent[1:]]
    assert texts[0].startswith('Back on') and texts[2].startswith('Still waiting') and 'Ripple is at' in texts[3]
    assert '/next' in texts[4] and b.state['paused'] is False


def test_before_a_chat_is_configured_start_reveals_your_chat_id(env, monkeypatch):
    _, store, tg, clock, _ = env
    monkeypatch.setattr(config, 'TELEGRAM_CHAT_ID', '')
    b = drip.Bot(store, tg=tg, clock=clock)
    tg.updates = [msg('/start', chat=99), msg('hello', chat=99)]
    b.step(poll=0)
    assert len(tg.sent) == 1 and 'TELEGRAM_CHAT_ID=99' in tg.last()


def test_state_survives_a_restart(env):
    b, store, tg, clock, _ = env
    b.send_card(clock.t)
    again = drip.Bot(store, tg=tg, clock=clock)
    assert again.state['pending'] == 1 and again.state['n'] == 1


def test_a_just_missed_point_is_not_asked_again_straight_away(env):
    b, store, tg, clock, grades = env
    first = b.send_card(clock.t)
    grades.append({'verdict': 'wrong', 'feedback': 'No.', 'misconception': ''})
    tg.updates = [msg('no idea'), msg('/next')]
    b.step(poll=0)
    second = store.get_knowledge('drip', 'card-2')
    assert second and second['point'] != first['point']
    tg.updates = [press('reveal:2'), press('self:2:1')]
    b.step(poll=0)
    assert b.state['right'] == 1 and b.state['answered'] == 2


def test_a_partly_right_answer_opens_a_gap_and_the_follow_up_targets_it(env):
    b, store, tg, clock, grades = env
    c = b.send_card(clock.t)
    piece = 'The state change is committed last, after every check.'
    ask = 'At which point in the request path is the write actually committed?'
    grades.append({'verdict': 'partly', 'feedback': 'You named the hops but not where the write lands.',
                   'missing': piece, 'follow_up': ask})
    tg.updates = [msg('DNS, edge, load balancer, service, database')]
    b.step(poll=0)
    assert '🟡' in tg.last() and '<i>' not in tg.last()
    e = events(store)[-1]
    assert e['clean'] is False and e['partial'] is True
    gap = store.list_knowledge('knowledge_misconceptions')[0]
    assert (gap['kind'], gap['text'], gap['ask'], gap['point']) == ('gap', piece, ask, c['point'])

    # A partial miss weakens rather than resets: the idea is not "shaky".
    from server.knowledge_base import api as kb_api
    _, _, states, seen, mis = kb_api.evidence(store, clock.t)
    assert kmodel.views(kcat.CATALOG, states, seen, mis, clock.t, [kcat.CATALOG['points'][c['point']]])[0]['status'] == 'shaky'
    # (a first-ever answer has nothing to weaken; a later partial on a held idea keeps it held)

    clock.t += cards.GAP_COOLDOWN - 60
    nxt = b.send_card(clock.t)
    assert nxt['point'] != c['point']  # too soon for the follow-up
    tg.updates = [press(f'skip:{nxt["n"]}')]
    b.step(poll=0)
    clock.t += 120
    follow = b.send_card(clock.t)
    assert follow['point'] == c['point'] and follow['reason'] == 'gap'
    assert b.phrasings[-1]['QUESTION'] == ask and b.phrasings[-1]['REASON'] == 'gap'   # the character asks the gap's question
    assert follow['ask'] == f'Quick one from Ripple: {ask}' and ask in tg.last()
    ask = follow['ask']

    grades.append({'verdict': 'right', 'feedback': 'Yes, last.'})
    tg.updates = [msg('right at the end, after auth and the rules')]
    b.step(poll=0)
    assert b.prompts[-1]['QUESTION'] == ask and b.prompts[-1]['FOCUS'] == piece
    assert store.list_knowledge('knowledge_misconceptions')[0]['status'] == 'resolved'
    assert events(store)[-1]['clean'] is True


def test_a_repeated_partial_updates_the_same_gap(env):
    b, store, tg, clock, grades = env
    b.send_card(clock.t)
    grades.append({'verdict': 'partly', 'feedback': 'f', 'missing': 'piece one', 'follow_up': 'q one?'})
    tg.updates = [msg('a')]
    b.step(poll=0)
    clock.t += cards.GAP_COOLDOWN + 1
    b.send_card(clock.t)
    grades.append({'verdict': 'partly', 'feedback': 'f', 'missing': 'piece two', 'follow_up': 'q two?'})
    tg.updates = [msg('b')]
    b.step(poll=0)
    gaps = store.list_knowledge('knowledge_misconceptions')
    assert len(gaps) == 1 and gaps[0]['text'] == 'piece two' and gaps[0]['repeats'] == 1
    assert b.prompts[-1]['FOCUS'] == 'piece one'


def test_a_partial_on_a_held_idea_keeps_it_held():
    held = [ans(MISS, T0 - 6 * DAY), ans(MISS, T0 - 3 * DAY)]
    partial = {**ans(MISS, T0, clean=False), 'blame': 'shared'}
    full = ans(MISS, T0, clean=False)
    s_part, _ = kmodel.replay(held + [partial])
    s_full, _ = kmodel.replay(held + [full])
    assert s_part[MISS]['last_clean'] and not s_full[MISS]['last_clean']
    assert s_part[MISS]['stability'] > s_full[MISS]['stability']


def test_frequency_parsing_and_text():
    assert [cards.parse_per_day(a) for a in ('1', '10', ' 7 ', '0', '11', 'lots', '2.5')] == [1, 10, 7, None, None, None, None]
    assert cards.clamp_per_day(40) == 10 and cards.clamp_per_day(0) == 1
    assert 'about 2 questions a day between 08:30 and 22:30, roughly every 7 hours' in cards.frequency_text(2, '08:30-22:30')
    assert 'roughly every 84 minutes' in cards.frequency_text(10, '08:30-22:30')
    assert '1 question a day' in cards.frequency_text(1, '08:30-22:30', current=True)


def test_frequency_command_sets_questions_a_day_and_reschedules(env):
    b, store, tg, clock, _ = env
    b.tick()
    assert b.per_day() == config.DRIP_PER_DAY
    tg.updates = [msg('/frequency'), msg('/frequency 11'), msg('/frequency@codi_nikhil_bot 10')]
    b.step(poll=0)
    texts = [s['text'] for s in tg.sent]
    assert texts[0].startswith('Right now: about 6') and texts[1].startswith('Send a number from 1 to 10')
    assert texts[2].startswith('Done. From now on, about 10')
    assert store.get_knowledge('drip', 'state')['per_day'] == 10
    assert b.state['next_at'] - clock.t <= 84 * 60 * 1.25 + 1  # rescheduled at the new pace, not the old one
    again = drip.Bot(store, tg=tg, clock=clock)
    assert again.per_day() == 10
    tg.updates = [msg('/freq 1')]
    b.step(poll=0)
    assert b.per_day() == 1 and b.state['next_at'] - clock.t >= 14 * 3600 * 0.75 - 1


def test_register_fills_the_command_menu_and_never_raises():
    tg = FakeTelegram()
    calls = []
    tg.call = lambda method, **p: calls.append((method, p))
    drip.register(tg)
    assert calls[0][0] == 'setMyCommands' and 'frequency' in [c['command'] for c in calls[0][1]['commands']]

    def boom(method, **p):
        raise RuntimeError('down')
    tg.call = boom
    drip.register(tg)


# ---- questions tied to your day ----------------------------------------------------------

def test_app_names_resolve_and_every_lesson_exists():
    from server.drip import context
    assert context.find('Uber')['name'] == 'Uber' and context.find('  uber   EATS ')['name'] == 'Deliveroo'
    assert context.find('Telegram') is None and context.find('Safari') is None
    lessons = {p['lesson'] for p in kcat.active(kcat.CATALOG)}
    assert all(set(a['lessons']) <= lessons for a in context.APPS.values())


def test_context_limits():
    from server.drip import context
    uber, yt = context.find('uber'), context.find('youtube')
    st = {'day': '2026-11-02'}
    assert context.decide(uber, st, None, T0, True) == (True, 'ok')
    assert context.decide(None, st, None, T0, True)[0] is False
    assert context.decide(uber, {**st, 'paused': True}, None, T0, True)[1] == 'paused'
    assert context.decide(uber, st, None, T0, False)[1] == 'outside the window'
    assert context.decide(uber, st, T0 - 60, T0, True)[1] == 'a question just arrived'
    assert context.decide(uber, st, T0 - context.FRESH - 1, T0, True)[0]
    context.remember(st, uber, T0)
    assert context.decide(uber, st, None, T0 + 3600, True)[1] == 'asked about this app recently'
    assert context.decide(yt, st, None, T0 + 3600, True)[0]
    for _ in range(context.DAILY_CAP):
        context.remember(st, yt, T0)
    assert context.decide(context.find('spotify'), st, None, T0, True)[1] == 'enough for today'
    st['day'] = '2026-11-03'
    assert context.decide(context.find('spotify'), st, None, T0, True)[0]


def test_opening_an_app_sends_a_question_about_it_and_replaces_a_stale_card(env):
    b, store, tg, clock, _ = env
    old = b.send_card(clock.t)
    clock.t += 20 * 60
    out = b.nudge('Uber')
    assert out['sent'] and kcat.CATALOG['points'][out['point']]['lesson'] in ('design-rides', 'geo-index', 'concurrent-holds')
    assert 'You just opened Uber' in b.phrasings[-1]['CONTEXT'] and b.state['pending'] == old['n'] + 1
    assert store.get_knowledge('drip', f'card-{old["n"]}')['status'] == 'replaced'
    assert b.nudge('Uber')['reason'] == 'asked about this app recently'
    assert b.nudge('YouTube') == {'sent': False, 'reason': 'a question just arrived'}
    assert b.nudge('Telegram')['reason'] == 'unknown app'
    clock.t = dt.datetime(2026, 11, 2, 23, 30, tzinfo=LON).timestamp()
    assert b.nudge('YouTube')['reason'] == 'outside the window'


def test_opened_endpoint(env, monkeypatch):
    from fastapi.testclient import TestClient
    from server import main
    from server.knowledge_base import api as kb_api
    b, store, tg, clock, _ = env
    main.app.dependency_overrides[kb_api.caller] = lambda: {'uid': 'me', 'source': None}
    try:
        c = TestClient(main.app)
        monkeypatch.setattr(drip, 'RUNNING', None)
        assert c.post('/api/drip/opened', json={'app': 'uber'}).status_code == 503
        monkeypatch.setattr(drip, 'RUNNING', b)
        r = c.post('/api/drip/opened', json={'app': 'uber'})
        assert r.status_code == 200 and r.json()['sent'] is True
        assert 'Uber' in [a['name'] for a in c.get('/api/drip/apps').json()['apps']]
    finally:
        main.app.dependency_overrides.clear()


def test_bedtime_links_to_the_days_misses_once(env, monkeypatch):
    from server.knowledge_base import api as kb_api
    b, store, tg, clock, _ = env
    monkeypatch.setattr(kb_api, 'get_store', lambda uid: store)
    clock.t = dt.datetime(2026, 11, 2, 21, 0, tzinfo=LON).timestamp()
    b.state['next_at'] = clock.t + DAY
    b.tick()
    assert tg.sent == []
    kb_api.write_events(store, 'telegram', [{'key': 'k1', 'points': [MISS], 'clean': False}], clock.t)
    clock.t += 50 * 60
    b.tick()
    assert '1 idea slipped today' in tg.last()
    assert tg.sent[-1]['reply_markup']['inline_keyboard'][0][0]['url'].endswith('/feed?set=tonight&n=1')
    b.tick()
    assert len(tg.sent) == 1


def test_sleep_makes_the_day_lighter():
    assert cards.sleep_factor(None) == 1.0
    assert cards.sleep_factor({'asleep_min': 460, 'score': 82}) == 1.0
    assert cards.sleep_factor({'asleep_min': 370, 'score': 80}) == 0.75
    assert cards.sleep_factor({'asleep_min': 460, 'score': 55}) == 0.5
    assert cards.sleep_factor({'asleep_min': 294, 'score': None}) == 0.5
    assert cards.sleep_text({'asleep_min': 294}, 3, 6) == 'Lighter today after a short night (4 h 54 m asleep): 3 questions instead of 6.'
    assert cards.sleep_text({'asleep_min': 480}, 6, 6) == ''


def test_the_bot_reads_last_night_from_sundial_once_it_appears(env, monkeypatch):
    b, store, tg, clock, _ = env
    calls, nights = [], [None, {'asleep_min': 300, 'score': 52, 'readiness': 60, 'bedtime': 'x'}]

    class R:
        def raise_for_status(self):
            pass

        def json(self):
            night = nights[min(len(calls), len(nights)) - 1]
            return [{'date': '2026-11-03', 'sleep': night or {'asleep_min': None, 'score': None, 'readiness': None}}]
    monkeypatch.setattr(config, 'SUNDIAL_URL', 'http://sundial:8700')
    monkeypatch.setattr(drip.httpx, 'get', lambda url, params, timeout: calls.append((url, params)) or R())
    clock.t = dt.datetime(2026, 11, 3, 0, 30, tzinfo=LON).timestamp()
    b.tick()
    assert calls == []  # too early: the night hasn't happened
    clock.t = dt.datetime(2026, 11, 3, 6, 0, tzinfo=LON).timestamp()
    b.tick()
    assert calls == [('http://sundial:8700/api/coach/days', {'start': '2026-11-03', 'end': '2026-11-03'})]
    assert b.state['sleep'] is None and b.per_day() == 6  # not synced yet
    clock.t += 10 * 60
    b.tick()
    assert len(calls) == 1  # waits before asking again
    clock.t += 25 * 60
    b.tick()
    assert b.state['sleep'] == {'asleep_min': 300, 'score': 52, 'readiness': 60} and b.per_day() == 3
    clock.t += 3600
    b.tick()
    assert len(calls) == 2
    tg.updates = [msg('/stats'), msg('/frequency')]
    b.step(poll=0)
    assert 'Lighter today after a short night (5 h 00 m asleep): 3 questions instead of 6.' in tg.sent[-2]['text']
    assert tg.last().startswith('Right now: about 6')
    monkeypatch.setattr(drip.httpx, 'get', lambda *a, **k: (_ for _ in ()).throw(RuntimeError('down')))
    clock.t += DAY
    b.tick()
    assert b.state['sleep'] is None and b.per_day() == 6


def test_podcast_command_sends_audio_and_nothing_makes_one_unasked(env, monkeypatch, tmp_path):
    from server import podcast
    b, store, tg, clock, _ = env
    ep = tmp_path / '2026-11-02.mp3'
    ep.write_bytes(b'ID3audio')
    monkeypatch.setattr(podcast, 'make', lambda store, now=None, force=False: str(ep))
    uploads = []
    tg.upload = lambda method, field, name, data, mime, **p: uploads.append((method, name, data, p['title']))
    tg.updates = [msg('/podcast')]
    b.step(poll=0)
    b._podcast_thread = None
    import threading
    for t in threading.enumerate():
        if t.name == 'podcast':
            t.join(5)
    assert uploads == [('sendAudio', 'senpai-2026-11-02.mp3', b'ID3audio', 'Senpai daily, Monday 2 November')]
    b.roll_day(dt.datetime(2026, 11, 3, 7, 0, tzinfo=LON).timestamp())
    clock.t = dt.datetime(2026, 11, 3, 9, 0, tzinfo=LON).timestamp()
    b.tick()   # a new day inside the window: the questions start, no episode follows
    assert not hasattr(b, 'morning_podcast') and len(uploads) == 1


def test_the_grader_speaks_as_the_colleague_who_asked():
    from server import voice
    from server.knowledge_base import catalog as kcat
    p = next(p for p in kcat.active(kcat.CATALOG) if p['kind'] == 'procedure')
    payload = cards.grade_payload(p, 'my answer')
    assert payload['SPEAKER'] == voice.persona('priya') and 'SPEAKER' in cards.GRADE_SYSTEM and voice.FEEDBACK in cards.GRADE_SYSTEM
    assert voice.lead('priya', p['id']) in cards.card_text(p)


def test_cards_are_phrased_by_their_character_and_graded_against_that_question(env):
    b, store, tg, clock, grades = env
    c = b.send_card(clock.t)
    p = b.phrasings[-1]
    assert p['SPEAKER'] == voice.persona('priya') and p['IDEA'] and p['REASON'] == c['reason']
    assert c['ask'] == f'Quick one from Ripple: {p["QUESTION"]}'          # quotes stripped
    assert tg.sent[-1]['text'].startswith('<b>Priya</b>\nQuick one from Ripple:')
    grades.append({'verdict': 'right', 'feedback': 'Nice.', 'misconception': ''})
    tg.updates = [msg('dns, edge, lb, service, then the commit')]
    b.step(poll=0)
    assert b.prompts[-1]['QUESTION'] == c['ask']


def test_a_self_introduction_is_dropped(env, monkeypatch):
    b, store, tg, clock, grades = env
    monkeypatch.setattr(llm, '_raw_chat', lambda *a, **k: {'content': 'Priya here — what commits the write?'})
    p = next(p for p in kcat.active(kcat.CATALOG) if p['kind'] == 'procedure')
    assert assess.phrase(store, p, 'new') == 'What commits the write?'


def test_without_the_model_cards_use_the_template(env, monkeypatch):
    b, store, tg, clock, grades = env
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    b.send_card(clock.t)
    assert b.phrasings == [] and any(lead in tg.sent[-1]['text'] for lead in voice.member('priya')['leads'])


def test_an_ignored_gap_stops_jumping_the_queue(env):
    b, store, tg, clock, grades = env
    c = b.send_card(clock.t)
    grades.append({'verdict': 'partly', 'feedback': 'f', 'missing': 'the piece', 'follow_up': 'which piece?'})
    tg.updates = [msg('half an answer')]
    b.step(poll=0)
    for _ in range(cards.GAP_IGNORED):
        clock.t += cards.GAP_COOLDOWN + 1
        again = b.send_card(clock.t)
        assert again['reason'] == 'gap' and again['point'] == c['point']
        tg.updates = [press(f'skip:{again["n"]}')]
        b.step(poll=0)
    clock.t += cards.GAP_COOLDOWN + 1
    assert b.send_card(clock.t)['reason'] != 'gap'
    assert store.list_knowledge('knowledge_misconceptions')[0]['status'] == 'open'   # kept, just not pushed


def test_marking_a_gap_card_known_closes_the_gap(env):
    b, store, tg, clock, grades = env
    b.send_card(clock.t)
    grades.append({'verdict': 'partly', 'feedback': 'f', 'missing': 'the piece', 'follow_up': 'which piece?'})
    tg.updates = [msg('half an answer')]
    b.step(poll=0)
    clock.t += cards.GAP_COOLDOWN + 1
    g = b.send_card(clock.t)
    tg.updates = [press(f'reveal:{g["n"]}'), press(f'self:{g["n"]}:1')]
    b.step(poll=0)
    assert store.list_knowledge('knowledge_misconceptions')[0]['status'] == 'resolved'


def test_only_ideas_met_outside_telegram_are_asked():
    c = kcat.CATALOG
    known = [p['id'] for p in kcat.active(c) if p['lesson'] == 'guarantees'][:2]
    evs = [{'point': known[0], 'source': 'lesson'}, {'point': known[1], 'source': 'tutor'},
           {'point': MISS, 'source': 'telegram'}]                        # a Telegram miss alone is not "covered"
    met = cards.met(evs)
    assert met == set(known)
    for _ in range(5):
        p, reason = cards.pick(c, {}, {}, [], T0, random.Random(), met=met)
        assert p['id'] in known and reason == 'new'
    assert cards.pick(c, {}, {}, [], T0, met=set()) == (None, None)


def test_after_an_answer_you_keep_talking_to_whoever_asked_until_the_next_card(env):
    b, store, tg, clock, grades = env
    b.send_card(clock.t)
    grades.append({'verdict': 'right', 'feedback': 'Old exchange.'})
    tg.updates = [msg('first card answer')]
    b.step(poll=0)
    c = b.send_card(clock.t)
    who = cards.speaker(b.point(c))['name']
    grades.append({'verdict': 'partly', 'feedback': 'The board goes quiet on the missing bit.'})
    tg.updates = [msg('my answer')]
    b.step(poll=0)
    tg.updates = [msg('wait, why does that matter?')]
    b.step(poll=0)
    assert tg.last() == f'<b>{who}:</b> Reply 1' and b.state['pending'] is None
    sent = b.talks[-1]
    assert [m['role'] for m in sent] == ['system', 'assistant', 'user', 'assistant', 'user']
    assert sent[1]['content'] == c['ask'] and sent[2]['content'] == 'my answer' and sent[-1]['content'] == 'wait, why does that matter?'
    assert not any('first card answer' in m['content'] or 'Old exchange' in m['content'] for m in sent)   # earlier cards stay out
    for i in range(cards.CHAT_TURNS):
        tg.updates = [msg(f'more {i}')]
        b.step(poll=0)
    sent = b.talks[-1]
    assert len(sent) == 4 + cards.CHAT_TURNS and sent[-1]['content'] == f'more {cards.CHAT_TURNS - 1}'   # trimmed to the latest turns
    assert len(store.get_knowledge('drip', f'card-{c["n"]}')['chat']) == 2 * (cards.CHAT_TURNS + 1)   # the full chat is kept
    n = len(events(store))
    b.send_card(clock.t)   # a new card ends the chat: the next message answers it
    grades.append({'verdict': 'right', 'feedback': 'Ship it.'})
    tg.updates = [msg('an answer to the new one')]
    b.step(poll=0)
    assert tg.last().startswith('✅') and len(events(store)) == n + 1 and len(b.talks) == cards.CHAT_TURNS + 1


def test_without_the_model_a_message_after_the_answer_gets_the_old_nudge(env, monkeypatch):
    b, store, tg, clock, grades = env
    b.send_card(clock.t)
    tg.updates = [press('reveal:1')]
    b.step(poll=0)
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    tg.updates = [msg('hmm')]
    b.step(poll=0)
    assert "Nothing's open" in tg.last() and b.talks == []


def test_feed_grading_keeps_the_tutor_voice():
    p = next(p for p in kcat.active(kcat.CATALOG) if p['kind'] == 'procedure')
    assert 'STORY' not in cards.grade_payload(p, 'x') and cards.grade_payload(p, 'x', in_story=True)['STORY']
    assert 'tick or a cross' in cards.STORY_GRADE_SYSTEM and 'tick' not in cards.GRADE_SYSTEM


def test_unanswered_streak_counts_from_the_newest_card():
    assert cards.unanswered_streak([{'status': 'pending'}, {'status': 'expired'}, {'status': 'skipped'},
                                    {'status': 'answered'}, {'status': 'expired'}]) == 2
    assert cards.unanswered_streak([{'status': 'answered'}, {'status': 'expired'}]) == 0


def test_after_three_unanswered_cards_the_bot_eases_to_one_a_day_and_says_so(env):
    b, store, tg, clock, grades = env
    for n in range(1, 4):
        b.state['n'] = n
        b.put_card({'n': n, 'point': 'x', 'status': 'expired', 'sent_at': clock.t - 9 * 3600})
    b.save()
    assert b.per_day() == 1
    b.tick()
    assert b.state['eased'] and any('ease off' in m['text'] for m in tg.sent)
    sent = len(tg.sent)
    b.tick()
    assert len(tg.sent) == sent   # said once
    b.put_card({'n': 3, 'point': 'x', 'status': 'answered', 'sent_at': clock.t})
    assert b.per_day() == b.usual_per_day()
    b.tick()
    assert not b.state['eased']


def test_a_gap_ignored_twice_rests_for_a_week_and_is_not_asked(env):
    b, store, tg, clock, grades = env
    point = kcat.active(kcat.CATALOG)[0]['id']
    kb_api.open_gap(store, 'telegram', 'gap-1', point, 'The general idea.', 'Ask it like this?', 'quote', clock.t - DAY)
    for n in (1, 2):
        b.state['n'] = n
        b.put_card({'n': n, 'point': point, 'gap': 'telegram:gap-1', 'status': 'pending', 'sent_at': clock.t - 4 * 3600})
        b.close(b.card(n), 'expired', clock.t)
    gap = store.get_knowledge('knowledge_misconceptions', 'telegram:gap-1')
    assert gap['status'] == 'open' and gap['parked_by'] == 'telegram'
    assert gap['parked_until'] >= clock.t + 6 * DAY
    c = b.send_card(clock.t)
    assert not c or c.get('gap') != 'telegram:gap-1'
