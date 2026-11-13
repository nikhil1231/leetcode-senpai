"""The streaming filter: what the learner may see of a reply while it arrives."""
import json

import pytest

from server.chat_stream import Visible, sse


def run(chunks):
    v, out = Visible(), []
    for c in chunks:
        out += v.feed(c)
    out += v.finish()
    # merge neighbouring text events so tests read the same however the reply was split
    merged = []
    for e in out:
        if merged and e['type'] == 'text' and merged[-1]['type'] == 'text':
            merged[-1] = {'type': 'text', 'text': merged[-1]['text'] + e['text']}
        else:
            merged.append(e)
    return merged


def every_split(text):
    """The same reply split one character at a time, and whole."""
    return [list(text), [text]]


@pytest.mark.parametrize('chunks', every_split('Hello <private>he is close</private>there.'))
def test_private_notes_never_show(chunks):
    assert run(chunks) == [{'type': 'text', 'text': 'Hello there.'}]


def test_a_private_note_is_held_back_while_it_might_be_one():
    v = Visible()
    assert v.feed('Hi <pri') == [{'type': 'text', 'text': 'Hi '}]
    assert v.feed('vate>secret') == []
    assert v.feed('</priv') == []
    assert v.feed('ate> ok') == [{'type': 'text', 'text': ' ok'}]


def test_an_unclosed_private_note_hides_the_rest():
    assert run(['Fine. <PRIVATE>never shown', ' at all']) == [{'type': 'text', 'text': 'Fine. '}]


@pytest.mark.parametrize('chunks', every_split('a < b and x[0] <p>'))
def test_ordinary_angle_and_square_brackets_show(chunks):
    assert run(chunks) == [{'type': 'text', 'text': 'a < b and x[0] <p>'}]


@pytest.mark.parametrize('chunks', every_split('Try this.\n[[activity b1]] Then [[note likes caches]]done'))
def test_markers_become_events(chunks):
    assert run(chunks) == [{'type': 'text', 'text': 'Try this.\n'}, {'type': 'marker', 'text': 'activity b1'},
                           {'type': 'text', 'text': ' Then '}, {'type': 'marker', 'text': 'note likes caches'},
                           {'type': 'text', 'text': 'done'}]


@pytest.mark.parametrize('chunks', every_split('Look:\n```diagram\nnodes: [a]\n```\nSee? ```design\ntitle: x'))
def test_widget_fences_are_hidden(chunks):
    assert run(chunks) == [{'type': 'text', 'text': 'Look:\n'}, {'type': 'widget', 'kind': 'diagram'},
                           {'type': 'text', 'text': '\nSee? '}, {'type': 'widget', 'kind': 'design'}]


@pytest.mark.parametrize('chunks', every_split('Code:\n```python\nx = `y`\n```\nend'))
def test_code_fences_and_inline_code_show(chunks):
    assert run(chunks) == [{'type': 'text', 'text': 'Code:\n```python\nx = `y`\n```\nend'}]


def test_a_dangling_bracket_shows_at_the_end():
    assert run(['a [', '[unfinished']) == [{'type': 'text', 'text': 'a [[unfinished'}]


def test_sse_is_one_json_event():
    line = sse({'type': 'text', 'text': 'é'})
    assert line.startswith('data: ') and line.endswith('\n\n') and json.loads(line[6:]) == {'type': 'text', 'text': 'é'}


# ---- the OpenRouter stream ---------------------------------------------------------------

import asyncio  # noqa: E402

import httpx  # noqa: E402

from server import config, llm  # noqa: E402

REAL_CLIENT = httpx.AsyncClient


def collect(monkeypatch, body, model='openai/gpt-5.6-luna'):
    seen = {}

    def handler(request):
        seen['body'] = json.loads(request.content)
        return httpx.Response(200, content=body.encode(), headers={'content-type': 'text/event-stream'})
    monkeypatch.setattr(llm.httpx, 'AsyncClient', lambda **kw: REAL_CLIENT(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')

    async def go():
        return [p async for p in llm._raw_chat_stream(model, [{'role': 'user', 'content': 'hi'}], options={'think': False})]
    return asyncio.run(go()), seen


def chunk(text=None, finish=None, **extra):
    return 'data: ' + json.dumps({'model': 'openai/x', 'choices': [{'delta': {'content': text} if text else {},
                                                                    'finish_reason': finish}], **extra}) + '\n\n'


def test_the_stream_yields_pieces_then_the_model_and_usage(monkeypatch):
    body = ': OPENROUTER PROCESSING\n\n' + chunk('Hel') + chunk('lo') + chunk(finish='stop', usage={'prompt_tokens': 3}) + 'data: [DONE]\n\n'
    pieces, seen = collect(monkeypatch, body)
    assert pieces == [{'text': 'Hel'}, {'text': 'lo'}, {'model': 'openai/x', 'usage': {'prompt_tokens': 3}}]
    assert seen['body']['stream'] is True and seen['body']['reasoning'] == {'enabled': False}


def test_the_stream_refuses_empty_cut_off_and_anthropic_replies(monkeypatch):
    with pytest.raises(RuntimeError, match='no reply'):
        collect(monkeypatch, chunk(finish='stop') + 'data: [DONE]\n\n')
    with pytest.raises(RuntimeError, match='output limit'):
        collect(monkeypatch, chunk('Half') + chunk(finish='length'))
    with pytest.raises(ValueError, match='Anthropic'):
        collect(monkeypatch, chunk('x'), model='anthropic/claude-opus-5.5')


# ---- caching and reasoning ------------------------------------------------------------------

def test_cache_marks_go_on_the_system_prompt_and_the_conversation_before_the_latest_message():
    msgs = [{'role': 'system', 'content': 'S'}, {'role': 'user', 'content': 'a'}, {'role': 'assistant', 'content': 'b'}, {'role': 'user', 'content': 'c'}]
    marked = llm.cache_marks('anthropic/claude-sonnet-5.5', msgs, ttl='1h')
    assert marked[0]['content'] == [{'type': 'text', 'text': 'S', 'cache_control': {'type': 'ephemeral', 'ttl': '1h'}}]
    assert marked[2]['content'][0]['cache_control'] == {'type': 'ephemeral', 'ttl': '1h'}
    assert marked[1]['content'] == 'a' and marked[3]['content'] == 'c' and msgs[0]['content'] == 'S'   # the original is untouched
    assert llm.cache_marks('openai/gpt-6.1-terra', msgs) is msgs   # OpenAI caches a repeated prefix on its own


def test_a_model_that_insists_on_reasoning_is_asked_again_with_it_low(monkeypatch):
    bodies = []

    def post(url, timeout, json, headers):
        bodies.append(json)
        if json['reasoning'].get('enabled') is False:
            return httpx.Response(400, text='{"error":{"message":"Reasoning is mandatory for this endpoint and cannot be disabled."}}')
        return httpx.Response(200, json={'model': 'm', 'choices': [{'message': {'content': 'Hi'}, 'finish_reason': 'stop'}], 'usage': {'cost': 0.01}})
    monkeypatch.setattr(llm.httpx, 'post', post)
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    out = llm._raw_chat('anthropic/claude-sonnet-5.5', [{'role': 'user', 'content': 'x'}], options={'think': False, 'allow_anthropic': 'tutor', 'cache': True})
    assert out['content'] == 'Hi' and out['usage']['cost'] == 0.01
    assert [b['reasoning'] for b in bodies] == [{'enabled': False}, {'effort': 'low', 'exclude': True}]


def test_the_stream_asks_again_with_reasoning_low_too(monkeypatch):
    seen = []

    def handler(request):
        body = json.loads(request.content); seen.append(body['reasoning'])
        if body['reasoning'].get('enabled') is False:
            return httpx.Response(400, text='Reasoning is mandatory for this endpoint and cannot be disabled.')
        return httpx.Response(200, content=(chunk('Hi') + chunk(finish='stop') + 'data: [DONE]\n\n').encode(), headers={'content-type': 'text/event-stream'})
    monkeypatch.setattr(llm.httpx, 'AsyncClient', lambda **kw: REAL_CLIENT(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')

    async def go():
        return [p async for p in llm._raw_chat_stream('openai/gpt-6.1-sol', [{'role': 'user', 'content': 'x'}], options={'think': False})]
    assert asyncio.run(go())[0] == {'text': 'Hi'} and seen == [{'enabled': False}, {'effort': 'low', 'exclude': True}]


# ---- LocalRouter first, OpenRouter as the fallback ----------------------------------------------

LR = 'http://lr.test/api/v1'
SONNET = 'anthropic/claude-sonnet-5.5'
OK = {'model': 'm', 'choices': [{'message': {'content': 'Hi'}, 'finish_reason': 'stop'}], 'usage': {'cost': 0.01}}


@pytest.fixture
def local(monkeypatch):
    """LocalRouter serving Sonnet; returns the hosts each request went to."""
    monkeypatch.setattr(config, 'LOCALROUTER_URL', LR)
    monkeypatch.setattr(config, 'OPENROUTER_API_KEY', 'test')
    monkeypatch.setattr(llm, '_LOCAL', {'at': 0.0, 'ttl': 0.0, 'models': frozenset()})
    hosts = []

    def get(url, **kw):
        hosts.append('models')
        return httpx.Response(200, json={'data': [{'id': SONNET}, {'id': 'claude/opus'}]}, request=httpx.Request('GET', url))
    monkeypatch.setattr(llm.httpx, 'get', get)
    return hosts


def post_to(monkeypatch, hosts, local_status=200):
    def post(url, json=None, **kw):
        hosts.append(url.split('/')[2])
        if url.startswith(LR):
            assert 'max_tokens' not in json and isinstance(json['messages'][0]['content'], str)   # plain text only
            return httpx.Response(local_status, json=OK if local_status == 200 else {'error': 'rate_limit'})
        return httpx.Response(200, json=OK)
    monkeypatch.setattr(llm.httpx, 'post', post)


def test_a_model_localrouter_serves_goes_there_first_for_free(local, monkeypatch):
    post_to(monkeypatch, local)
    r = llm._raw_chat(SONNET, [{'role': 'system', 'content': 'S'}, {'role': 'user', 'content': 'hi'}],
                      options={'allow_anthropic': 'tutor', 'cache': True})
    assert (r['content'], r['via'], r['usage']) == ('Hi', 'localrouter', {}) and local == ['models', 'lr.test']
    llm._raw_chat(SONNET, [{'role': 'user', 'content': 'again'}], options={'allow_anthropic': 'tutor'})
    assert local.count('models') == 1   # the model list is remembered


def test_openrouter_takes_over_when_localrouter_fails_or_lacks_the_model(local, monkeypatch):
    post_to(monkeypatch, local, local_status=503)
    r = llm._raw_chat(SONNET, [{'role': 'user', 'content': 'hi'}], options={'allow_anthropic': 'tutor'})
    assert r['via'] == 'openrouter' and local[1:] == ['lr.test', 'openrouter.ai']
    local.clear()
    assert llm._raw_chat('deepseek/deepseek-v4.1-flash', [{'role': 'user', 'content': 'hi'}])['via'] == 'openrouter'
    assert local == ['openrouter.ai']
    local.clear()
    llm._raw_chat(SONNET, [{'role': 'user', 'content': 'hi'}], options={'allow_anthropic': 'tutor', 'local': False})
    assert local == ['openrouter.ai']


def test_the_anthropic_ban_is_on_openrouter_only(local, monkeypatch):
    post_to(monkeypatch, local)
    assert llm._raw_chat(SONNET, [{'role': 'user', 'content': 'hi'}])['via'] == 'localrouter'   # any caller, free
    local.clear()
    post_to(monkeypatch, local, local_status=503)
    with pytest.raises(ValueError, match='Anthropic'):
        llm._raw_chat(SONNET, [{'role': 'user', 'content': 'hi'}])   # no paid fallback without an exception
    assert local == ['lr.test']


def test_unset_or_unreachable_localrouter_means_openrouter(monkeypatch):
    monkeypatch.setattr(config, 'LOCALROUTER_URL', '')
    assert llm._local_models() == frozenset()
    monkeypatch.setattr(config, 'LOCALROUTER_URL', LR)
    monkeypatch.setattr(llm, '_LOCAL', {'at': 0.0, 'ttl': 0.0, 'models': frozenset()})

    def down(url, **kw):
        raise httpx.ConnectError('no route')
    monkeypatch.setattr(llm.httpx, 'get', down)
    assert llm._local_models() == frozenset() and llm._LOCAL['ttl'] == 60


def stream_hosts(monkeypatch, local_body=None, local_status=200):
    hosts = []

    def handler(request):
        hosts.append(request.url.host)
        if request.url.host == 'lr.test':
            assert 'reasoning' not in json.loads(request.content)
            return httpx.Response(local_status, content=(local_body or '').encode(), headers={'content-type': 'text/event-stream'})
        return httpx.Response(200, content=(chunk('From OR') + chunk(finish='stop') + 'data: [DONE]\n\n').encode(),
                              headers={'content-type': 'text/event-stream'})
    monkeypatch.setattr(llm.httpx, 'AsyncClient', lambda **kw: REAL_CLIENT(transport=httpx.MockTransport(handler), **kw))

    async def go():
        return [p async for p in llm._raw_chat_stream(SONNET, [{'role': 'user', 'content': 'hi'}], options={'allow_anthropic': 'tutor', 'think': False})]
    return go, hosts


def test_the_stream_comes_from_localrouter_and_falls_back_before_any_text(local, monkeypatch):
    go, hosts = stream_hosts(monkeypatch, chunk('From LR') + chunk(finish='stop') + 'data: [DONE]\n\n')
    assert asyncio.run(go())[0] == {'text': 'From LR'} and hosts == ['lr.test']
    go, hosts = stream_hosts(monkeypatch, local_status=503)
    assert asyncio.run(go())[0] == {'text': 'From OR'} and hosts == ['lr.test', 'openrouter.ai']
    go, hosts = stream_hosts(monkeypatch, chunk('Half way') + 'data: {"error": {"message": "quota"}}\n\n')
    with pytest.raises(RuntimeError, match='LocalRouter'):
        asyncio.run(go())   # text already shown: no second voice mid-reply
    assert hosts == ['lr.test']
