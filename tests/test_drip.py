"""The Telegram drip: scheduling, card choice, and the bot against a fake Telegram and a fixed clock."""
import datetime as dt
import json
import random
from zoneinfo import ZoneInfo

import pytest

from server import config, llm, voice
from server.drip import assess, bot as drip, cards
from server.knowledge_base import api as kb_api, catalog as kcat, model as kmodel
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


def test_card_text_puts_the_plain_question_first_and_escapes_html():
    p = {**kcat.CATALOG['points'][MISS], 'prompt': 'Is 1 < 2 & does it matter?'}
    text = cards.card_text(p)
    assert text == '<b>Is 1 &lt; 2 &amp; does it matter?</b>'
    assert '<i>You just opened Uber.</i>' in cards.card_text(p, context='You just opened Uber.')
    composed = {'question': 'Which wins?', 'lead': 'From <today>.', 'options': ['a < b', 'b', 'c', 'd'], 'answer': 1}
    text = cards.card_text(p, composed=composed)
    assert text == '<b>Which wins?</b>\n<i>From &lt;today&gt;.</i>\n\nA. a &lt; b\nB. b\nC. c\nD. d'
    assert cards.card_text(p, composed={'question': 'Which wins?', 'lead': ''}) == '<b>Which wins?</b>'


def test_a_composed_card_is_parsed_and_a_broken_option_set_is_dropped():
    good = {'question': 'what bounds a pool?', 'lead': 'Coffee chat.', 'options': ['a', 'b', 'c', 'd'], 'answer': 2, 'why': 'C.'}
    out = cards.parse_composed('Sure!\n```json\n' + json.dumps(good) + '\n```', True)
    assert out == {**good, 'question': 'What bounds a pool?'}
    for bad in ({'options': ['a', 'b', 'c']}, {'options': ['a', 'a', 'c', 'd']}, {'answer': 4}, {'answer': True}, {'answer': '1'}):
        assert 'options' not in cards.parse_composed(json.dumps({**good, **bad}), True)
    assert 'options' not in cards.parse_composed(json.dumps(good), False)
    assert cards.parse_composed('no json here', True) is None and cards.parse_composed('{"question": "x"}', True) is None
    opts, ans = cards.shuffled(['right', 'b', 'c', 'd'], 0, random.Random(1))
    assert sorted(opts) == ['b', 'c', 'd', 'right'] and opts[ans] == 'right'


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
        assert schema is cards.Grade and not llm.forbidden_model(model) and system == voice.live(cards.GRADE_SYSTEM)
        assert json.loads(prompt)['ANSWER']
        env_prompts.append(json.loads(prompt))
        return {'content': json.dumps({'missing': '', 'follow_up': '', 'misconception': '', **grades.pop(0)})}
    monkeypatch.setattr(llm, '_raw_generate', fake)
    phrasings = []

    talks = []

    def chat(model, messages, options=None):
        assert not llm.forbidden_model(model)
        if messages[0]['content'].startswith(voice.live(cards.CHAT_SYSTEM)):
            talks.append(messages)
            return {'content': f'"Reply {len(talks)}"', 'usage': {}}
        assert messages[0]['content'] == voice.live(assess.COMPOSE_SYSTEM)
        p = json.loads(messages[1]['content'])
        phrasings.append(p)
        card = {'question': f'"Plain: {p["QUESTION"]}"', 'lead': 'A little review from today.', 'options': [], 'answer': None, 'why': ''}
        if p['CHOICE']:
            card.update(options=['Right one', 'Wrong one', 'Also wrong', 'Wrong too'], answer=0, why='Because it is.')
        return {'content': '```json\n' + json.dumps(card) + '\n```', 'usage': {}}
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
    assert tg.sent[0]['reply_markup']['inline_keyboard'][-1][0]['callback_data'] == 'reveal:1'
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
    assert tg.last().startswith('❌ You described latency') and '<blockquote expandable><b>The idea</b>' in tg.last()
    e = events(store)[-1]
    assert (e['source'], e['strength'], e['clean'], e['points']) == ('telegram', 'soft', False, [c['point']])
    m = store.list_knowledge('knowledge_misconceptions')[0]
    assert m['source'] == 'telegram' and m['quote'] == 'caches just make it faster'
    assert store.get_knowledge('drip', 'card-1')['verdict'] == 'wrong' and b.state['pending'] is None
    assert b.state['offset'] == tg_offset(store)
    assert 'STORY' not in b.prompts[-1] and 'SPEAKER' not in b.prompts[-1]


def tg_offset(store):
    return store.get_knowledge('drip', 'state')['offset']


def test_without_the_model_you_see_the_answer_and_grade_yourself(env, monkeypatch):
    b, store, tg, clock, _ = env
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    b.send_card(clock.t)
    tg.updates = [msg('my guess')]
    b.step(poll=0)
    assert tg.last().startswith("Here's the idea to keep in mind.") and tg.sent[-1]['reply_markup']['inline_keyboard'][0][0]['callback_data'] == 'self:1:1'
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
    assert events(store)[-1]['clean'] is False and tg.last() == cards.moment_text(b.point(store.get_knowledge('drip', 'card-2')), 'missed')


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
    assert texts[0].startswith('Back on') and texts[2].startswith('Still waiting') and 'ideas.' in texts[3] and 'Ripple' not in texts[3]
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
    assert b.phrasings[-1]['QUESTION'] == ask and b.phrasings[-1]['REASON'] == 'gap'   # the card asks the gap's question
    assert b.phrasings[-1]['FOCUS'] == piece and follow['ask'] == f'Plain: {ask}' and ask in tg.last()
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


def test_the_grader_uses_the_shared_tutor_feedback_voice():
    p = next(p for p in kcat.active(kcat.CATALOG) if p['kind'] == 'procedure')
    payload = cards.grade_payload(p, 'my answer')
    assert payload == {'QUESTION': p['prompt'], 'CLAIM': p['claim'], 'ANSWER': 'my answer'}
    assert voice.FEEDBACK in cards.GRADE_SYSTEM
    assert cards.card_text(p) == f'<b>{p["prompt"]}</b>'


def test_cards_lead_with_the_plain_question_and_are_graded_against_it(env):
    b, store, tg, clock, grades = env
    c = b.send_card(clock.t)
    p = b.phrasings[-1]
    assert 'SPEAKER' not in p and p['IDEA'] and p['REASON'] == c['reason']
    assert c['ask'] == f'Plain: {p["QUESTION"]}' and c['lead'] == 'A little review from today.'   # quotes stripped
    assert tg.sent[-1]['text'].startswith(f'<b>Plain: ') and '<i>A little review from today.</i>' in tg.sent[-1]['text']
    grades.append({'verdict': 'right', 'feedback': 'Nice.', 'misconception': ''})
    tg.updates = [msg('dns, edge, lb, service, then the commit')]
    b.step(poll=0)
    assert b.prompts[-1]['QUESTION'] == c['ask']


def _choice_card(b, clock):
    b.rng.random = lambda: 0.9   # past OPEN_SHARE: a one-tap card
    c = b.send_card(clock.t)
    assert c['options'] and sorted(c['options']) == sorted(['Right one', 'Wrong one', 'Also wrong', 'Wrong too'])
    assert c['options'][c['answer']] == 'Right one' and c['why'] == 'Because it is.'
    return c


def test_a_one_tap_card_shows_its_options_and_grades_the_tap(env):
    b, store, tg, clock, grades = env
    c = _choice_card(b, clock)
    sent = tg.sent[-1]
    rows = sent['reply_markup']['inline_keyboard']
    assert [k['text'] for k in rows[0]] == ['A', 'B', 'C', 'D'] and rows[0][2]['callback_data'] == 'pick:1:2'
    assert [k['callback_data'] for k in rows[1]] == ['reveal:1', 'skip:1']
    assert f"\n\nA. {c['options'][0]}\nB. " in sent['text']
    wrong = next(i for i in range(4) if i != c['answer'])
    tg.updates = [press(f'pick:1:{wrong}'), press(f'pick:1:{c["answer"]}')]   # a second tap changes nothing
    b.step(poll=0)
    assert tg.last().startswith(f'❌ <b>Not quite.</b> It\'s {cards.LETTERS[c["answer"]]}: Right one Because it is.')
    assert '<blockquote expandable><b>The idea</b>' in tg.last() and b.prompts == []   # no model to grade a tap
    e = events(store)[-1]
    assert (e['clean'], e['depth'], e['source']) == (False, 'recognise', 'telegram') and len(events(store)) == 1
    saved = store.get_knowledge('drip', 'card-1')
    assert (saved['status'], saved['verdict'], saved['picked']) == ('answered', 'wrong', wrong) and b.state['pending'] is None

    c = _choice_card(b, clock)
    tg.updates = [press(f'pick:{c["n"]}:{c["answer"]}')]
    b.step(poll=0)
    assert tg.last().startswith('✅ <b>Correct.</b> Because it is.') and events(store)[-1]['clean'] is True
    assert b.state['right'] == 1 and b.state['answered'] == 2


def test_a_one_tap_card_can_still_be_answered_in_words(env):
    b, store, tg, clock, grades = env
    c = _choice_card(b, clock)
    grades.append({'verdict': 'right', 'feedback': 'Nice.'})
    tg.updates = [msg('the right one, because reasons')]
    b.step(poll=0)
    assert b.prompts[-1]['QUESTION'] == c['ask'] and tg.last().startswith('✅ Nice.')
    tg.updates = [msg('/next')]
    b.step(poll=0)
    nxt = store.get_knowledge('drip', f'card-{b.state["n"]}')
    tg.updates = [msg('/next')]
    b.step(poll=0)
    assert tg.last().startswith('Still waiting on this one:') and tg.sent[-1]['reply_markup'] and nxt['status'] == 'pending'


def test_a_self_introduction_is_dropped_from_the_lead(env, monkeypatch):
    b, store, tg, clock, grades = env
    card = {'question': 'what commits the write?', 'lead': 'Tutor here — reviewing the deploy.', 'options': [], 'answer': None}
    monkeypatch.setattr(llm, '_raw_chat', lambda *a, **k: {'content': json.dumps(card)})
    p = next(p for p in kcat.active(kcat.CATALOG) if p['kind'] == 'procedure')
    assert assess.compose(store, p, 'new', choice=False) == {'question': 'What commits the write?', 'lead': 'Reviewing the deploy.'}


def test_a_card_without_usable_options_keeps_its_plain_question(env, monkeypatch):
    b, store, tg, clock, grades = env
    calls = []
    monkeypatch.setattr(llm, '_raw_chat', lambda *a, **k: calls.append(1) or {'content': '{"question": "What commits it?", "lead": "", "options": ["a"]}'})
    p = next(p for p in kcat.active(kcat.CATALOG) if p['kind'] == 'procedure')
    assert assess.compose(store, p, 'new') == {'question': 'What commits it?', 'lead': ''} and len(calls) == 2


def test_without_the_model_cards_use_the_template(env, monkeypatch):
    b, store, tg, clock, grades = env
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', '')
    c = b.send_card(clock.t)
    assert b.phrasings == [] and tg.sent[-1]['text'] == cards.card_text(b.point(c))
    assert 'options' not in c and len(tg.sent[-1]['reply_markup']['inline_keyboard']) == 1


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


def test_after_an_answer_you_keep_talking_to_the_tutor_until_the_next_card(env):
    b, store, tg, clock, grades = env
    b.send_card(clock.t)
    grades.append({'verdict': 'right', 'feedback': 'Old exchange.'})
    tg.updates = [msg('first card answer')]
    b.step(poll=0)
    c = b.send_card(clock.t)
    grades.append({'verdict': 'partly', 'feedback': 'There is a missing piece.'})
    tg.updates = [msg('my answer')]
    b.step(poll=0)
    tg.updates = [msg('wait, why does that matter?')]
    b.step(poll=0)
    assert tg.last() == 'Reply 1' and b.state['pending'] is None
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
    assert 'STORY' not in cards.grade_payload(p, 'x') and 'SPEAKER' not in cards.grade_payload(p, 'x')
    assert voice.FEEDBACK in cards.GRADE_SYSTEM and voice.TUTOR in cards.CHAT_SYSTEM


def test_saved_voices_reach_card_composition_grading_and_follow_up_chat(env, monkeypatch):
    b, store, tg, clock, grades = env
    monkeypatch.setattr(voice, 'TUTOR', 'Saved conversational voice.')
    monkeypatch.setattr(voice, 'FEEDBACK', 'Saved feedback voice.')
    systems = []

    def chat(model, messages, options=None):
        systems.append(messages[0]['content'])
        if 'Reply with JSON only' in messages[0]['content']:
            return {'content': json.dumps({'question': 'What limits database load?', 'lead': ''})}
        return {'content': 'The cache serves hits without reaching the database.'}

    def grade(provider, model, system, prompt, schema, options=None):
        systems.append(system)
        return {'content': json.dumps({'verdict': 'right', 'feedback': 'Hits avoid a database request.',
                                       'misconception': '', 'missing': '', 'follow_up': ''})}

    monkeypatch.setattr(llm, '_raw_chat', chat)
    monkeypatch.setattr(llm, '_raw_generate', grade)
    b.rng.random = lambda: 0.1  # an open question
    b.send_card(clock.t)
    tg.updates = [msg('Only misses reach the database.'), msg('Why?')]
    b.step(poll=0)
    assert len(systems) == 3
    assert 'Saved conversational voice.' in systems[0] and 'Saved feedback voice.' in systems[0]
    assert 'Saved feedback voice.' in systems[1] and 'Saved conversational voice.' in systems[2]
    assert all(voice.DEFAULT_TUTOR not in s and voice.DEFAULT_FEEDBACK not in s for s in systems)
    assert tg.last() == 'The cache serves hits without reaching the database.'
    assert events(store)[-1]['clean'] is True


def test_tutor_messages_escape_html_without_cast_names():
    p = {**kcat.CATALOG['points'][MISS], 'claim': 'Hits < requests & misses.'}
    assert cards.chat_text(p, 'Hits < requests & misses.') == 'Hits &lt; requests &amp; misses.'
    assert cards.result_text('partly', 'Hits < requests.', p).startswith('🟡 Hits &lt; requests.')
    assert 'Hits &lt; requests &amp; misses.' in cards.reveal_text(p, 'Why < matters')
    assert 'Why &lt; matters' in cards.reveal_text(p, 'Why < matters')
    messages = [cards.HELP, cards.reveal_text(p), cards.result_text('right', 'Yes.', p),
                *(cards.moment_text(p, kind) for kind in ('skip', 'knew', 'missed'))]
    assert not any(name in text for name in ('Marcus', 'Priya', 'Jo', 'Sam') for text in messages)


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


def test_telegram_client_reuse_and_close(monkeypatch):
    import httpx
    from server.drip import telegram
    telegram.close()
    try:
        c1 = telegram.get_client()
        assert isinstance(c1, httpx.Client)
        assert not c1.is_closed
        c2 = telegram.get_client()
        assert c1 is c2
        telegram.close()
        assert c1.is_closed
        c3 = telegram.get_client()
        assert c3 is not c1
        assert not c3.is_closed
    finally:
        telegram.close()


def test_telegram_call_upload_download(monkeypatch):
    import httpx
    from server.drip import telegram

    monkeypatch.setattr(config, 'TELEGRAM_API', 'https://mock.telegram.org')
    monkeypatch.setattr(config, 'TELEGRAM_BOT_TOKEN', 'mock-token')

    def handler(request: httpx.Request) -> httpx.Response:
        url_path = request.url.path
        if url_path.endswith('/sendMessage'):
            payload = json.loads(request.content)
            return httpx.Response(200, json={'ok': True, 'result': {'message_id': 123, 'text': payload.get('text')}})
        if url_path.endswith('/sendAudio'):
            return httpx.Response(200, json={'ok': True, 'result': {'message_id': 124}})
        if url_path.endswith('/getFile'):
            return httpx.Response(200, json={'ok': True, 'result': {'file_path': 'voice/test.oga'}})
        if 'file/botmock-token/voice/test.oga' in url_path:
            return httpx.Response(200, content=b'fake-audio-bytes')
        return httpx.Response(404, json={'ok': False, 'description': 'Not Found'})

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(telegram, 'get_client', lambda: mock_client)

    try:
        res = telegram.call('sendMessage', chat_id=123, text='hello')
        assert res['message_id'] == 123
        assert res['text'] == 'hello'

        up_res = telegram.upload('sendAudio', 'audio', 'audio.mp3', b'mp3data', 'audio/mpeg', chat_id=123)
        assert up_res['message_id'] == 124

        content = telegram.download('file-123')
        assert content == b'fake-audio-bytes'
    finally:
        mock_client.close()


@pytest.mark.asyncio
async def test_drip_run_failure_threshold_logs_info_then_warning(monkeypatch):
    import asyncio
    from server.drip import bot as drip_mod
    logs = []

    class FakeLogger:
        def info(self, msg, *args, **kwargs):
            logs.append(('INFO', msg % args if args else msg))
        def warning(self, msg, *args, **kwargs):
            logs.append(('WARNING', msg % args if args else msg))

    monkeypatch.setattr(drip_mod, 'log', FakeLogger())

    async def fast_sleep(_):
        return

    monkeypatch.setattr(drip_mod.asyncio, 'sleep', fast_sleep)

    step_count = 0
    closed = []

    class MockTg:
        def close(self):
            closed.append(True)

    class FailingBot:
        def __init__(self):
            self.tg = MockTg()
        def step(self):
            nonlocal step_count
            step_count += 1
            if step_count <= 4:
                raise ConnectionResetError("Connection reset by peer")
            raise asyncio.CancelledError()

    monkeypatch.setattr(drip_mod, 'Bot', lambda store: FailingBot())
    monkeypatch.setattr(drip_mod, 'register', lambda: None)

    with pytest.raises(asyncio.CancelledError):
        await drip_mod.run(lambda uid: FakeStore('me'))

    info_logs = [entry for entry in logs if entry[0] == 'INFO']
    warning_logs = [entry for entry in logs if entry[0] == 'WARNING']
    assert len(info_logs) == 2
    assert "transient failure (1/3)" in info_logs[0][1]
    assert "transient failure (2/3)" in info_logs[1][1]
    assert len(warning_logs) == 2
    assert "3 consecutive failures" in warning_logs[0][1]
    assert "4 consecutive failures" in warning_logs[1][1]
    assert len(closed) >= 1
