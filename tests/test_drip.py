"""The Telegram drip: scheduling, card choice, and the bot against a fake Telegram and a fixed clock."""
import datetime as dt
import json
import random
from zoneinfo import ZoneInfo

import pytest

from server import config, llm
from server.drip import bot as drip, cards
from server.knowledge_base import catalog as kcat, model as kmodel
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
    text = cards.card_text(p, 'fading')
    assert text.startswith('<b>Marcus</b>') and '1 &lt; 2 &amp; does' in text and 'Before it fades' in text


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
        assert schema is cards.Grade and not llm.forbidden_model(model)
        assert json.loads(prompt)['ANSWER']
        env_prompts.append(json.loads(prompt))
        return {'content': json.dumps({'missing': '', 'follow_up': '', 'misconception': '', **grades.pop(0)})}
    monkeypatch.setattr(llm, '_raw_generate', fake)
    b = drip.Bot(store, tg=tg, clock=clock, rng=random.Random(3))
    b.prompts = env_prompts
    return b, store, tg, clock, grades


uid = iter(range(1000, 10**6))


def msg(text, chat=42):
    return {'update_id': next(uid), 'message': {'chat': {'id': chat}, 'text': text}}


def press(data, chat=42):
    return {'update_id': next(uid), 'callback_query': {'id': 'q', 'data': data, 'message': {'chat': {'id': chat}}}}


def events(store):
    return sorted(store.list_knowledge('knowledge_events'), key=lambda e: e['at'])


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
    assert 'Not quite' in tg.last() and 'The idea:' in tg.last()
    e = events(store)[-1]
    assert (e['source'], e['strength'], e['clean'], e['points']) == ('telegram', 'soft', False, [c['point']])
    m = store.list_knowledge('knowledge_misconceptions')[0]
    assert m['source'] == 'telegram' and m['quote'] == 'caches just make it faster'
    assert store.get_knowledge('drip', 'card-1')['verdict'] == 'wrong' and b.state['pending'] is None
    assert b.state['offset'] == tg_offset(store)
    tg.updates = [msg('another answer')]
    b.step(poll=0)
    assert 'No question is open' in tg.last()


def tg_offset(store):
    return store.get_knowledge('drip', 'state')['offset']


def test_without_the_model_you_see_the_answer_and_grade_yourself(env, monkeypatch):
    b, store, tg, clock, _ = env
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    b.send_card(clock.t)
    tg.updates = [msg('my guess')]
    b.step(poll=0)
    assert 'Did you know it?' in tg.last() and tg.sent[-1]['reply_markup']['inline_keyboard'][0][0]['callback_data'] == 'self:1:1'
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
    assert events(store)[-1]['clean'] is False and 'sooner' in tg.last()


def test_voice_notes_are_transcribed_then_graded(env, monkeypatch):
    b, store, tg, clock, grades = env
    b.send_card(clock.t)
    tg.files['v1'] = b'OggS...'
    monkeypatch.setattr(llm, 'transcribe', lambda audio, fmt, lang=None: 'load is requests times the miss rate')
    grades.append({'verdict': 'right', 'feedback': 'Exactly.', 'misconception': ''})
    tg.updates = [{'update_id': next(uid), 'message': {'chat': {'id': 42}, 'voice': {'file_id': 'v1'}}}]
    b.step(poll=0)
    assert any('Heard:' in s['text'] for s in tg.sent) and 'Right' in tg.last()
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
    assert 'Partly' in tg.last() and 'just the part you missed' in tg.last()
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
    assert follow['point'] == c['point'] and follow['reason'] == 'gap' and follow['ask'] == ask
    assert ask in tg.last() and 'The part you missed' in tg.last()

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
    assert 'You just opened Uber' in tg.last() and b.state['pending'] == old['n'] + 1
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
    assert 'You missed 1 idea today' in tg.last()
    assert tg.sent[-1]['reply_markup']['inline_keyboard'][0][0]['url'].endswith('/feed?set=tonight&n=1')
    b.tick()
    assert len(tg.sent) == 1
