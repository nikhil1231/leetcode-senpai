"""Settings > AI models: each area's model, following the main model, what each kind may offer, saving."""
import pytest

from server import config, llm, model_areas as ma
from tests.fake_store import FakeStore

CATALOG = [
    {'id': 'openai/gpt-6.1-terra', 'supported_parameters': ['structured_outputs'],
     'architecture': {'input_modalities': ['text', 'image'], 'output_modalities': ['text']}},
    {'id': 'deepseek/deepseek-v4.1-flash', 'supported_parameters': ['structured_outputs'],
     'architecture': {'input_modalities': ['text'], 'output_modalities': ['text']}},
    {'id': 'moonshotai/kimi-k3.1', 'supported_parameters': [], 'architecture': {'output_modalities': ['text']}},
    {'id': 'google/gemini-nano-banana-2.1', 'supported_parameters': ['structured_outputs'],
     'architecture': {'input_modalities': ['text', 'image'], 'output_modalities': ['image', 'text']}},
]
SONNET = 'anthropic/claude-sonnet-5.5'


@pytest.fixture
def models(monkeypatch):
    monkeypatch.setattr(llm, '_catalog', CATALOG)
    monkeypatch.setattr(llm, '_local_models', lambda: frozenset({SONNET, 'anthropic/claude-opus-5.5'}))
    monkeypatch.setattr(config, 'TUTOR_MODEL', SONNET)


def test_every_area_has_a_model_and_conversation_follows_the_main_one(models):
    assert ma.model_for('main') == SONNET and ma.model_for('coach') == SONNET and ma.model_for('drip') == SONNET
    assert ma.model_for('grading') == 'deepseek/deepseek-v4.1-flash'   # structured: not the main model
    ma.apply({'models': {'main': 'deepseek/deepseek-v4.1-flash', 'coach': 'anthropic/claude-opus-5.5'}, 'llm_model': 'openai/gpt-6.1-terra'})
    assert ma.model_for('drip') == 'deepseek/deepseek-v4.1-flash' and ma.model_for('coach') == 'anthropic/claude-opus-5.5'
    assert ma.model_for('analysis') == 'openai/gpt-6.1-terra'


def test_each_kind_offers_what_its_calls_can_use(models):
    ids = lambda kind: [o['id'] for o in ma.options(kind)]  # noqa: E731
    assert ids('chat')[:2] == ['anthropic/claude-opus-5.5', SONNET] and all(o['free'] for o in ma.options('chat')[:2])
    assert 'moonshotai/kimi-k3.1' in ids('chat') and 'moonshotai/kimi-k3.1' not in ids('structured')
    assert ids('vision') == ['google/gemini-nano-banana-2.1', 'openai/gpt-6.1-terra']
    assert ids('image') == ['google/gemini-nano-banana-2.1']
    assert not any(m.startswith('anthropic/') for k in ('structured', 'vision', 'image') for m in ids(k))
    assert 'elevenlabs/scribe-v2' in ids('stt')
    areas = {a['key']: a for a in ma.describe()}
    assert set(areas) == set(ma.BY_KEY) and areas['main']['free'] and areas['coach']['follows_main']


def test_saving_checks_each_choice_and_blank_goes_back(models):
    store = FakeStore('u')
    with pytest.raises(ValueError, match='only used through LocalRouter'):
        ma.save(store, {'grading': SONNET})   # structured calls go to OpenRouter
    with pytest.raises(ValueError, match='not available'):
        ma.save(store, {'grading': 'moonshotai/kimi-k3.1'})
    ma.save(store, {'grading': 'openai/gpt-6.1-terra', 'coach': 'anthropic/claude-opus-5.5', 'analysis': 'deepseek/deepseek-v4.1-flash'})
    assert ma.model_for('grading') == 'openai/gpt-6.1-terra' and store.get_settings()['llm_model'] == 'deepseek/deepseek-v4.1-flash'
    ma.save(store, {'coach': ''})
    assert ma.model_for('coach') == SONNET and 'coach' not in store.get_settings()['models']
