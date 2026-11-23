"""The one place Coding Practice talks to a model: plain chat that returns a JSON object. LocalRouter first (llm._raw_chat),
so this costs nothing per call; there is no tool calling there, so anything agentic is done by the callers."""
import asyncio
import json
import logging
import re

import httpx

from .. import llm, model_areas

log = logging.getLogger(__name__)
REPLY_TOKENS = 6_000     # Includes reasoning tokens on OpenRouter.
REPOSITORY_TOKENS = 32_000  # Generated repositories and complete replacement files.


class ModelError(RuntimeError):
    pass


class OutputLimitError(ModelError):
    pass


def available():
    return bool(llm.config.LOCALROUTER_URL or llm.config.OPENROUTER_API_KEY)


def extract_json(text):
    """The first JSON object in a reply, however it is wrapped (a code fence, a sentence before it)."""
    text = (text or '').strip()
    text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text)
    start, end = text.find('{'), text.rfind('}')
    if start < 0 or end <= start:
        raise ModelError('The model did not return JSON')
    body = text[start:end + 1]
    for attempt in (body, re.sub(r',\s*([}\]])', r'\1', body)):   # trailing commas are the usual slip
        try:
            return json.loads(attempt)
        except ValueError as e:
            err = e
    raise ModelError(f'The model returned malformed JSON ({err})')


def chat(area, system, user, *, timeout=420, max_tokens=REPLY_TOKENS):
    """Blocking text reply from the area's model. Run it in a thread."""
    messages = [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]
    return complete(area, messages, timeout=timeout, max_tokens=max_tokens)


def complete(area, messages, *, timeout, max_tokens):
    model = model_areas.model_for(area)
    try:
        raw = llm._raw_chat(model, messages, options={'timeout': timeout, 'think': False, 'max_tokens': max_tokens})
    except httpx.HTTPError as e:
        raise ModelError(f'Model connection failed ({type(e).__name__})') from e
    except llm.OutputLimitError as e:
        raise OutputLimitError(str(e)) from e
    except (RuntimeError, ValueError) as e:
        raise ModelError(str(e)) from e
    return raw['content'], raw.get('model') or model


def ask_json(area, system, user, *, timeout=420, check=None):
    """A JSON object from the model; one retry if it is malformed or `check` (a validator raising ModelError) rejects it."""
    last = None
    for attempt in range(2):
        text, model = chat(area, system, user if not last else f'{user}\n\nYour previous reply was rejected: {last}. Reply again, as one JSON object only.', timeout=timeout)
        try:
            data = extract_json(text)
            if check:
                check(data)
            return data, model
        except ModelError as e:
            last = str(e)
            log.warning('coding: %s reply rejected: %s', area, last)
    raise ModelError(last)


async def aask_json(*a, **kw):
    return await asyncio.to_thread(ask_json, *a, **kw)
