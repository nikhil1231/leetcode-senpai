"""The daily podcast: the script (pure), phrase splitting, the RSS feed and Telegram delivery."""
import datetime as dt
import os

import pytest
from fastapi.testclient import TestClient

from server import config, main, podcast, podcast_synth, voice
from server.knowledge_base import api
from tests.fake_store import FakeStore

ITEM = {'reason': 'gap', 'speaker': 'Marcus', 'cast': 'marcus', 'point': 'p1', 'ask': 'Why delete -> not set?', 'claim': 'Deletes are order-insensitive, e.g. under races.'}


def test_script_reads_each_question_then_gives_time_then_the_idea():
    items = [dict(ITEM, reason=r) for r in ('morning', 'shaky', 'fading', 'new', 'held')]
    seg = podcast.script(items, {'label': 'Launched', 'users': '50k users'}, dt.date(2026, 11, 2))
    assert seg[0]['text'].startswith('Morning! This is Senpai daily for Monday 2 November. Ripple is at Launched') and '5 ideas' in seg[0]['text']
    lead, q, a = seg[1], seg[2], seg[3]
    assert lead == {'voice': podcast.NARRATOR, 'pause': 0.4, 'text': 'This one tripped you up last night.'}
    assert q['voice'] == podcast.ASKER and q['pause'] == podcast.THINK
    assert q['text'] == f"Marcus here. {voice.lead('marcus', 'p1')} Why delete to not set?"
    assert a['voice'] == podcast.NARRATOR and a['text'] == 'Deletes are order-insensitive, for example under races.'
    assert any(s['text'].startswith('That is 4 of 5.') for s in seg) and seg[-1]['text'].startswith('That is today.')
    assert len(seg) == 1 + 5 * 2 + 1 + 1 + 1   # intro, ask + idea each, one lead-in, one cheer, sign-off


def test_long_sentences_are_spoken_in_short_phrases():
    long = ('Concurrent writers cache sets can land in a different order than their database commits, leaving an older '
            'value cached; deletes are order-insensitive, and the next read rebuilds from the database. Short one.')
    out = podcast_synth.phrases(long)
    assert all(len(p.split()) <= podcast_synth.MAX_WORDS for p in out) and out[-1] == 'Short one.'
    assert ' '.join(out) == ' '.join(long.split())


def test_rss_lists_episodes():
    xml = podcast.rss([(dt.date(2026, 11, 2), 'p', 1234)], 'https://x.test', 'tok')
    assert '<enclosure url="https://x.test/podcast/tok/2026-11-02.mp3" length="1234" type="audio/mpeg"/>' in xml
    assert 'Senpai daily, Monday 2 November' in xml and xml.startswith('<?xml')


@pytest.fixture
def client(monkeypatch, tmp_path):
    store = FakeStore('owner')
    monkeypatch.setattr(api, 'get_store', lambda uid: store)
    monkeypatch.setattr(config, 'PODCAST_DIR', str(tmp_path))
    monkeypatch.setattr(config, 'PODCAST_TOKEN', 'sekret')
    monkeypatch.setattr(podcast, 'make', lambda store, now=None, force=False: (tmp_path / '2026-11-02.mp3').write_bytes(b'ID3fake') and str(tmp_path / '2026-11-02.mp3'))
    return TestClient(main.app)


def test_feed_and_episodes_need_the_token(client, monkeypatch):
    assert client.get('/podcast/wrong/feed.xml').status_code == 404
    r = client.get('/podcast/sekret/feed.xml')
    assert r.status_code == 200 and '/podcast/sekret/2026-11-02.mp3' in r.text
    assert client.get('/podcast/sekret/2026-11-02.mp3').content == b'ID3fake'
    assert client.get('/podcast/sekret/2026-11-09.mp3').status_code == 404
    assert client.get('/podcast/sekret/../x.mp3').status_code == 404
    monkeypatch.setattr(config, 'PODCAST_TOKEN', '')
    assert client.get('/podcast/sekret/feed.xml').status_code == 404


def test_make_without_voices_says_so(monkeypatch, tmp_path):
    monkeypatch.setattr(config, 'PODCAST_DIR', str(tmp_path))
    monkeypatch.setattr(config, 'PODCAST_VOICES', str(tmp_path / 'none'))
    with pytest.raises(RuntimeError, match='not installed'):
        podcast.make(FakeStore('x'))


@pytest.mark.skipif(not os.path.exists(os.path.join(config.PODCAST_VOICES, podcast.VOICE_FILES['alan'])),
                    reason='Piper voices not downloaded here')
def test_a_real_short_episode(monkeypatch, tmp_path):
    monkeypatch.setattr(config, 'PODCAST_DIR', str(tmp_path))
    monkeypatch.setattr(podcast, 'episode_items', lambda store, now, n=12: ([ITEM], {'label': 'Garage', 'users': '1k users'}))
    path = podcast.make(FakeStore('x'))
    data = open(path, 'rb').read()
    assert len(data) > 20000 and (data[:3] == b'ID3' or data[0] == 0xFF)
