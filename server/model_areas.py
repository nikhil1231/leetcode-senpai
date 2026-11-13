"""Which model each part of the app uses, chosen per area in Settings. Pure lookups plus one settings write.

Each area has a kind (what its calls need), a default (the env setting it replaced), and the user's choice, kept in
settings["models"] (the analysis area keeps its old home, settings["llm_model"]). Conversation areas may "follow the
main model": that is the tutor's voice, which the coach pill in the sidebar shows. `apply` loads the choices at
startup and on every save, as voice.apply does, so call sites ask `model_for(key)` with no settings in hand.

Kinds and where their models come from:
  chat        plain text chat: LocalRouter's models (free, the Claude subscriptions) and OpenRouter's text models.
              Anthropic models only through LocalRouter (llm.forbidden_model); a fallback to OpenRouter refuses them.
  structured  JSON-schema output: OpenRouter models that support structured outputs, never Anthropic.
  vision      structured, reading an image too.
  image       draws images.
  speech, stt not in OpenRouter's catalog: a short known list.
"""
import os
from dataclasses import dataclass
from typing import Callable, Optional

from . import config, llm


@dataclass(frozen=True)
class Area:
    key: str
    label: str
    uses: str
    kind: str
    default: Callable[[], str]
    follows_main: bool = False


MAIN = 'main'
AREAS = [
    Area(MAIN, 'Main model', "The tutor's voice in lessons and checks, Ripple Ops, Night Shift, and the voice sample.",
         'chat', lambda: config.TUTOR_MODEL),
    Area('coach', 'Page coach', 'The chat on each page.', 'chat', lambda: config.TUTOR_MODEL, follows_main=True),
    Area('drip', 'Telegram, feed and walk replies', "Phrasing each card and answering back in the asker's voice.",
         'chat', lambda: config.TUTOR_MODEL, follows_main=True),
    Area('grading', 'Grading answers', 'Marking answers on Telegram, the feed and walks.', 'structured',
         lambda: 'deepseek/deepseek-v4.1-flash'),
    Area('notes', 'Notes and debriefs', 'What the tutor records from your answers, session debriefs, Ripple Ops scoring '
         'and scenarios, and handover notes.', 'structured', lambda: config.TUTOR_NOTES_MODEL),
    Area('analysis', 'Analysis', "Problem enrichment, Senpai's daily plan and run reviews, and mistake explanations.",
         'structured', lambda: config.LLM_MODEL),
    Area('sd_tutor', 'System design coach', 'Hints and replies while you work a design.', 'structured',
         lambda: os.environ.get('SD_TUTOR_MODEL', 'openai/gpt-6.1-sol')),
    Area('sd_assessor', 'System design assessor', 'Marking a finished design against the criteria.', 'structured',
         lambda: os.environ.get('SD_ASSESSOR_MODEL', 'openai/gpt-6-astra')),
    Area('wall_review', 'Wall poster words and review', "Writes each poster's text and checks the drawn poster.",
         'vision', lambda: config.WALL_REVIEW_MODEL),
    Area('wall_image', 'Wall poster image', 'Draws the posters.', 'image', lambda: config.WALL_IMAGE_MODEL),
    Area('podcast_writer', 'Podcast script', "Writes Ripple After Dark when the scheduled job didn't.", 'chat',
         lambda: 'anthropic/claude-opus-5.5'),
    Area('podcast_voice', 'Podcast voices', 'Reads the episode aloud.', 'speech', lambda: 'google/gemini-3.8-flash-tts'),
    Area('stt', 'Dictation', 'Transcribes spoken answers before grading.', 'stt', lambda: config.STT_MODEL),
]
BY_KEY = {a.key: a for a in AREAS}
KNOWN = {'speech': ['google/gemini-3.8-flash-tts'],
         'stt': ['elevenlabs/scribe-v2', 'openai/gpt-4o-mini-transcribe', 'deepgram/nova-3']}

_chosen: dict = {}


def apply(settings: Optional[dict]):
    """Load the saved choices (settings["models"], and llm_model for analysis)."""
    global _chosen
    settings = settings or {}
    chosen = {k: v for k, v in (settings.get('models') or {}).items() if k in BY_KEY and isinstance(v, str)}
    if settings.get('llm_model'):
        chosen['analysis'] = llm.normalize_model(settings['llm_model'])
    _chosen = chosen


def model_for(key: str) -> str:
    """The model an area uses now: the saved choice, else the main model for an area that follows it, else the default."""
    area = BY_KEY[key]
    picked = (_chosen.get(key) or '').strip()
    if picked:
        return picked
    if area.follows_main:
        return model_for(MAIN)
    return area.default()


def free(model: str) -> bool:
    return model.lstrip('~') in llm._local_models()


def options(kind: str) -> list[dict]:
    """[{id, free}] a dropdown offers for a kind: LocalRouter's models first for chat, then OpenRouter's."""
    if kind in KNOWN:
        return [{'id': m, 'free': False} for m in KNOWN[kind]]
    local = sorted(llm._local_models()) if kind == 'chat' else []
    paid = [m for m in llm.catalog(kind) if m not in local]
    return [{'id': m, 'free': True} for m in local] + [{'id': m, 'free': False} for m in paid]


def describe() -> list[dict]:
    """Every area for the Settings page: what it's for, what it uses now, and what it could use."""
    out, cache = [], {}
    for a in AREAS:
        current = model_for(a.key)
        opts = cache.setdefault(a.kind, options(a.kind))
        if current not in {o['id'] for o in opts}:
            opts = [{'id': current, 'free': free(current)}, *opts]
        out.append({'key': a.key, 'label': a.label, 'uses': a.uses, 'kind': a.kind, 'model': current,
                    'chosen': _chosen.get(a.key, ''), 'default': a.default(), 'follows_main': a.follows_main,
                    'free': free(current), 'options': opts})
    return out


def check(key: str, model: str) -> Optional[str]:
    """Why a choice can't be saved, or None. Blank always works: back to the default (or the main model)."""
    if key not in BY_KEY:
        return f'unknown area {key}'
    model = model.strip()
    if not model:
        return None
    area = BY_KEY[key]
    if area.kind in KNOWN:
        return None if model in KNOWN[area.kind] or model == area.default() else f'{model} is not a {area.kind} model this app knows'
    if llm.forbidden_model(model) and not (area.kind == 'chat' and free(model)):
        return 'Anthropic models are only used through LocalRouter, and only for conversation'
    if not llm.valid_model(model) and not free(model):
        return f'{model} is not a model ID'
    if model not in {o['id'] for o in options(area.kind)}:
        return f'{model} is not available for {area.label.lower()}'
    return None


def save(store, changes: dict) -> dict:
    """Store choices {area: model or ''} and apply them. Raises ValueError with the first problem."""
    for key, model in changes.items():
        problem = check(key, model or '')
        if problem:
            raise ValueError(problem)
    settings = store.get_settings() or {}
    chosen = dict(settings.get('models') or {})
    updates = {}
    for key, model in changes.items():
        model = (model or '').strip()
        if key == 'analysis':
            updates['llm_model'], updates['llm_provider'] = (model or config.LLM_MODEL), 'openrouter'
        elif model:
            chosen[key] = model
        else:
            chosen.pop(key, None)
    updates['models'] = chosen
    store.update_settings(updates)
    apply(store.get_settings())
    return {'areas': describe()}
