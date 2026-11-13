"""Ripple After Dark: choosing the lesson and format, the prompt, reading and speaking a script, and
making, keeping and falling back."""
import array
import datetime as dt

import pytest

from server import config, llm, podcast, podcast_drama as pd
from tests.fake_store import FakeStore

DAY = dt.date(2026, 11, 12)
LESSONS = [{'lesson': 'api-contracts', 'title': 'API contracts', 'section': 'system-design', 'score': 9, 'points': ['p1', 'p2']},
           {'lesson': 'caching', 'title': 'Caching', 'section': 'system-design', 'score': 5, 'points': ['p3']}]
VIEWS = [{'id': 'p1', 'lesson': 'api-contracts', 'claim': 'DELETE is idempotent.', 'status': 'shaky'},
         {'id': 'p2', 'lesson': 'api-contracts', 'claim': '412 means a failed precondition.', 'status': 'fading'},
         {'id': 'p4', 'lesson': 'api-contracts', 'claim': 'POST needs an idempotency key.', 'status': 'solid'},
         {'id': 'p3', 'lesson': 'caching', 'claim': 'Caches need a TTL.', 'status': 'shaky'}]
MIS = [{'point': 'p2', 'text': 'Did not know 409 from 412.', 'quote': '412 - not sure', 'status': 'resolved'}]


def script(lines=24, words_each=60, extra=''):
    body = [f'{("NARRATOR", "PRIYA", "MARCUS")[i % 3]} (calm): ' + ' '.join(['word'] * words_each) for i in range(lines)]
    return 'TITLE: Charged Twice\nPRODUCT: Ripple Pay\n[MUSIC: a low pulse]\n' + '\n'.join(body) + extra


# ---- choosing --------------------------------------------------------------------------------

def test_the_weakest_lesson_without_a_recent_episode_is_chosen():
    assert pd.pick_lesson(LESSONS, [], DAY)['lesson'] == 'api-contracts'
    recent = [{'lesson': 'api-contracts', 'day': '2026-11-05'}]
    assert pd.pick_lesson(LESSONS, recent, DAY)['lesson'] == 'caching'
    both = recent + [{'lesson': 'caching', 'day': '2026-11-10'}]
    assert pd.pick_lesson(LESSONS, both, DAY)['lesson'] == 'api-contracts'   # covered longest ago
    assert pd.pick_lesson([], [], DAY) is None


def test_formats_rotate_through_all_before_repeating():
    eps, seen = [], []
    for i in range(len(pd.FORMATS)):
        day = DAY + dt.timedelta(days=i)
        f = pd.pick_format(eps, day)['id']
        seen.append(f)
        eps.append({'format': f, 'day': day.isoformat()})
    assert sorted(seen) == sorted(f['id'] for f in pd.FORMATS)
    assert pd.pick_format(eps, DAY + dt.timedelta(days=30))['id'] == seen[0]


def test_the_brief_carries_the_ideas_mistakes_and_recent_episodes():
    past = [{'day': '2026-11-11', 'title': 'The Night Shift', 'format': 'confession', 'product': 'Ripple Chat'}]
    b = pd.brief(LESSONS[0], VIEWS, MIS, past, DAY)
    assert b['ideas'] == ['DELETE is idempotent.', '412 means a failed precondition.', 'POST needs an idempotency key.']
    assert b['mistakes'] == [{'point': 'p2', 'gap': 'Did not know 409 from 412.', 'said': '412 - not sure'}]
    assert b['format'] != 'confession'
    p = pd.prompt(b, cast=['Marcus, the CTO'])
    for s in ('412 means a failed precondition.', 'Did not know 409 from 412.', '"The Night Shift"', 'TITLE:',
              'four twelve', 'Marcus, the CTO', next(f['name'] for f in pd.FORMATS if f['id'] == b['format'])):
        assert s in p
    assert 'Ripple started as a link shortener' in p and '—' not in p


# ---- reading and speaking ----------------------------------------------------------------------

def test_a_script_is_read_and_checked():
    s = pd.parse(script())
    assert (s['title'], s['product'], s['words']) == ('Charged Twice', 'Ripple Pay', 24 * 60)
    assert s['items'][0] == ('CUE', 'MUSIC', 'a low pulse') and s['items'][1][:2] == ('NARRATOR', 'calm')
    with pytest.raises(ValueError, match='TITLE'):
        pd.parse(script().replace('TITLE: Charged Twice\n', ''))
    with pytest.raises(ValueError, match='not an episode'):
        pd.parse(script(lines=5))
    with pytest.raises(ValueError, match='too many characters'):
        pd.parse(script(extra=''.join(f'\n{n} (calm): hello there' for n in ('ANNA', 'BEN', 'CARL', 'DEV'))))


def test_terms_are_written_as_they_are_said():
    assert pd.say_as('Send If-Match with the ETag; SQL and JSON via nginx at p99.') == \
        'Send if match with the E-tag; sequel and jason via engine X at P ninety-nine.'
    assert pd.say_as('It returned a 412, then 409 Conflict.') == 'It returned a four twelve, then four oh nine Conflict.'
    assert pd.say_as('311 customers were charged twice in 404 seconds.') == '311 customers were charged twice in 404 seconds.'
    assert pd.say_as('slow — then gone') == 'slow, then gone'


def test_lines_are_voiced_two_speakers_at_a_time():
    items = pd.parse(script())['items']
    parts = pd.chunks(items)
    assert parts[0][0] == 'CUE'
    assert all(len({s for s, _, _ in c}) <= 2 for c in parts if isinstance(c, list))
    cast = pd.voices(items + [('ANNA', 'shy', 'hi'), ('BEN', 'loud', 'hey')])
    assert (cast['NARRATOR'], cast['ANNA'], cast['BEN']) == ('Sulafat', 'Charon', 'Achernar')
    one = pd.request([('NARRATOR', 'soft', 'A 412.'), ('NARRATOR', 'slower', 'Then quiet.')], cast)
    assert one['voice'] == 'Sulafat' and one['input'] == 'A four twelve. Then quiet.' and 'soft; then slower' in one['instructions']
    two = pd.request([('NARRATOR', 'soft', 'Hello.'), ('PRIYA', 'dry', 'Hi.')], cast)
    assert [t['voice'] for t in two['input']] == ['Sulafat', 'Kore'] and 'dry' in two['input'][1]['instructions']
    assert pd.cut_off([('NARRATOR', '', 'x' * 130)], 2.0) and not pd.cut_off([('NARRATOR', '', 'x' * 130)], 9.0)


# ---- making, keeping, falling back -----------------------------------------------------------

@pytest.fixture
def speech(monkeypatch):
    calls = []

    def speak(model, input, voice=None, instructions=None):
        calls.append(input)
        text = input if isinstance(input, str) else ' '.join(t['text'] for t in input)
        if len(calls) == 2:   # the second clip comes back cut short once
            return 24000, bytes(200)
        return 24000, array.array('h', [1000] * int(24000 * len(text) / 13)).tobytes()
    monkeypatch.setattr(llm, '_raw_speech', speak)
    monkeypatch.setattr(pd.time, 'sleep', lambda s: None)
    return calls


def test_a_submitted_script_is_voiced_kept_and_survives_losing_the_file(speech):
    store = FakeStore('u')
    b = pd.brief(LESSONS[0], VIEWS, MIS, [], DAY)
    ep = pd.accept(store, b, script(), 'claude-code:opus')
    assert ep['status'] == 'ready' and ep['writer'] == 'claude-code:opus' and ep['chunks'] >= 1
    assert len(speech) == len([c for c in pd.chunks(pd.parse(script())['items']) if isinstance(c, list)]) + 1   # one redo
    mp3, again = pd.ensure(store, DAY)
    assert mp3[:3] in (b'ID3', b'\xff\xfb', b'\xff\xf3') or mp3[0] == 0xff
    assert again['title'] == 'Charged Twice' and pd.title_for(store, DAY) == 'Charged Twice'
    with pytest.raises(ValueError):
        pd.accept(store, b, 'not a script', 'claude-code:opus')


def test_without_the_host_job_the_fallback_model_writes_it(speech, monkeypatch):
    store = FakeStore('u')
    asked = []
    monkeypatch.setattr(pd, 'make_brief', lambda store, day, now=None: pd.brief(LESSONS[0], VIEWS, MIS, [], day))

    def chat(model, messages, options=None):
        asked.append((model, options))
        return {'content': script()}
    monkeypatch.setattr(llm, '_raw_chat', chat)
    mp3, ep = pd.ensure(store, DAY)
    assert asked[0][0] == 'anthropic/claude-opus-5.5' and asked[0][1]['allow_anthropic'] == 'podcast fallback'
    assert ep['writer'] == 'openrouter:anthropic/claude-opus-5.5' and mp3


def test_localrouter_writes_it_first_and_openrouter_only_if_that_fails(speech, monkeypatch):
    monkeypatch.setattr(pd, 'make_brief', lambda store, day, now=None: pd.brief(LESSONS[0], VIEWS, MIS, [], day))
    monkeypatch.setattr(pd.config, 'LOCALROUTER_URL', 'http://lr.test/api/v1')
    local, paid = [], []
    monkeypatch.setattr(llm, '_raw_local_chat', lambda model, messages, **k: local.append(model) or {'content': script()})
    monkeypatch.setattr(llm, '_raw_chat', lambda *a, **k: paid.append(a) or pytest.fail('paid call'))
    _, ep = pd.ensure(FakeStore('u'), DAY)
    assert local == ['anthropic/claude-opus-5.5'] and not paid and ep['writer'] == 'localrouter:anthropic/claude-opus-5.5'

    def down(*a, **k):
        raise RuntimeError('LocalRouter request failed (HTTP 503)')
    monkeypatch.setattr(llm, '_raw_local_chat', down)
    monkeypatch.setattr(llm, '_raw_chat', lambda m, msgs, options=None: {'content': script()})
    _, ep = pd.ensure(FakeStore('u'), DAY)
    assert ep['writer'] == 'openrouter:anthropic/claude-opus-5.5'


def test_a_written_script_whose_voicing_failed_is_voiced_again_not_rewritten(speech, monkeypatch):
    store = FakeStore('u')
    b = pd.brief(LESSONS[0], VIEWS, MIS, [], DAY)
    store.put_knowledge(pd.EPISODES, b['day'], {'day': b['day'], 'brief': b, 'status': 'written',
                                                'script': script(), 'writer': 'claude-code:opus'})
    monkeypatch.setattr(llm, '_raw_chat', lambda *a, **k: pytest.fail('should not rewrite'))
    _, ep = pd.ensure(store, DAY)
    assert ep['status'] == 'ready' and ep['writer'] == 'claude-code:opus'


def test_nothing_to_teach_means_no_episode(monkeypatch):
    monkeypatch.setattr(pd, 'make_brief', lambda store, day, now=None: None)
    assert pd.ensure(FakeStore('u'), DAY) is None


def test_the_ban_on_anthropic_models_has_only_its_named_exceptions():
    assert llm.ANTHROPIC_EXCEPTIONS == {'podcast fallback', 'tutor'}
    with pytest.raises(ValueError):
        llm._raw_chat('anthropic/claude-opus-5.5', [], options={})
    with pytest.raises(ValueError):
        llm._raw_chat('anthropic/claude-opus-5.5', [], options={'allow_anthropic': 'page coach'})
    with pytest.raises(ValueError):
        llm._raw_speech('anthropic/whatever', 'hi')
    assert 'podcast fallback' in llm.ANTHROPIC_EXCEPTIONS


def test_the_daily_podcast_is_the_drama_and_falls_back_to_the_questions(monkeypatch, tmp_path):
    monkeypatch.setattr(config, 'PODCAST_DIR', str(tmp_path))
    monkeypatch.setattr(config, 'PODCAST_STYLE', 'drama')
    monkeypatch.setattr(llm, 'enabled', lambda settings=None: True)
    monkeypatch.setattr(pd, 'ensure', lambda store, day, now=None: (b'ID3drama', {'title': 'Charged Twice'}))
    path = podcast.make(FakeStore('u'), now=dt.datetime(2026, 11, 12, 9).timestamp())
    assert open(path, 'rb').read() == b'ID3drama'

    def broken(store, day, now=None):
        raise RuntimeError('speech down')
    monkeypatch.setattr(pd, 'ensure', broken)
    monkeypatch.setattr(podcast, 'available', lambda: False)
    with pytest.raises(RuntimeError, match='Piper'):
        podcast.make(FakeStore('u'), now=dt.datetime(2026, 11, 13, 9).timestamp())
