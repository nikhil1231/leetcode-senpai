"""Regressions from the recall prompt/rubric scope audit."""
import json

import pytest

from server import system_design_coach as coach
from server.system_design_curriculum import LESSONS


def recall(lesson):
    return next(b for b in LESSONS[lesson]['blocks'] if b['type'] == 'recall')


@pytest.mark.parametrize('lesson,unasked', [
    ('guarantees', 'constraints'),
    ('sync-async', 'idempotency'),
    ('queue-basics', 'monitor'),
    ('concurrent-holds', 'retries'),
    ('replication', 'fence'),
    ('design-kv', 'R=2'),
    ('design-payments', 'daily reconciliation'),
    ('object-storage', 'reconciler'),
])
def test_rubrics_do_not_require_unasked_followup_details(lesson, unasked):
    assert unasked not in ' '.join(recall(lesson)['points'])


def test_either_rate_limiter_and_sequential_id_are_accepted_alternatives():
    limiter = recall('rate-limiting')
    assert 'or token bucket' in limiter['prompt']
    assert 'either approach is sufficient' in limiter['points'][2]
    assert 'chosen approach' in limiter['points'][3]
    assert 'auto-increment integer' in recall('id-generation')['points'][3]


@pytest.mark.asyncio
async def test_grader_uses_corrected_fanout_scheme_without_expanding_question_scope(monkeypatch):
    block = recall('service-quality')
    monkeypatch.setattr(coach.llm, 'enabled', lambda settings=None: True)
    captured = {}

    def generate(provider, model, system, payload, schema, **kwargs):
        captured.update(system=system, payload=json.loads(payload))
        return {'content': json.dumps({'points': [
            {'point': p, 'status': 'covered', 'note': ''} for p in block['points']
        ], 'feedback': 'Correct explanation and probability.'}), 'model': 'test'}

    monkeypatch.setattr(coach.llm, '_raw_generate', generate)
    result, error = await coach.grade_recall(block, 'The slowest call dominates; 1 - 0.99**50 is about 40%.')
    assert error is None and len(result['points']) == 3
    assert captured['payload']['rubric_points'] == block['points']
    assert 'model answer is illustrative, not extra criteria' in captured['system']
    assert 'do not demand both' in captured['system']
    assert all('mitigation' not in p.lower() for p in captured['payload']['rubric_points'])
