"""Question variants: tutor-written isomorphs served when a question comes round again.

After a question is answered, a background task asks the tutor for one variant (same
principle, new scenario) and stores it as a frozen contract. Quickfire and papers serve an
unused variant instead of the original for questions already seen, so a repeat tests the
reasoning rather than a remembered answer. Grading stays deterministic against the stored
contract, and the answer still counts for the original item in the ledger. Without the
tutor, the original question is served as before.
"""
import secrets
import time

from . import llm, system_design_tutor as tutor
from .system_design_curriculum import LESSONS, QUESTIONS
from .system_design_lessons import _permute

FORMATS = ('choice', 'multi')


def contract(base, result, vid):
    """A gradeable contract with the original's identity and the variant's content. Pure."""
    shown = _permute(vid, list(range(len(result['choices']))))
    choices = [result['choices'][i] for i in shown]
    position = {i: f'c{n}' for n, i in enumerate(shown)}
    right = sorted(position[i] for i, c in enumerate(result['choices']) if c['correct'])
    return {**{k: base[k] for k in ('id', 'version', 'lesson_id', 'category', 'skill', 'kind', 'difficulty')},
            'format': base.get('format', 'choice'), 'prompt': result['prompt'].strip(),
            'explanation': result['explanation'].strip(),
            'choices': [{'id': f'c{n}', 'text': c['text'].strip()} for n, c in enumerate(choices)],
            'whys': {f'c{n}': c['why'].strip() for n, c in enumerate(choices) if c.get('why')},
            'correct': right[0] if base.get('format', 'choice') == 'choice' else right,
            'variant_of': base['id'], 'variant_id': vid}


def eligible(qid):
    q = QUESTIONS.get(qid)
    return bool(q) and not q.get('retired') and q.get('format', 'choice') in FORMATS


def unused(records, qid):
    return sorted((r for r in records if r.get('kind') == 'variant' and r['question_id'] == qid and not r.get('used_at')),
                  key=lambda r: r['created_at'])


async def ensure(store, qid):
    """Keep one unused variant in stock for a seen question. Background; never raises."""
    try:
        if not eligible(qid) or unused(store.list_design_records(), qid) or not llm.enabled(store.get_settings()):
            return
        base = QUESTIONS[qid]
        result, _ = await tutor.variant(base, LESSONS[base['lesson_id']], store.get_settings())
        if not result:
            return
        vid = 'variant_' + secrets.token_hex(12)
        store.put_design_record(vid, {'kind': 'variant', 'question_id': qid, 'created_at': time.time(),
                                      'contract': contract(base, result, vid), 'used_at': None,
                                      'model': result['model'], 'prompt_version': result['prompt_version']}, None)
    except Exception:  # A missing variant only means the original is served again.
        return


def take(store, records, qid):
    """Claim the oldest unused variant's contract, or None."""
    for r in unused(records, qid):
        try:
            store.put_design_record(r['id'], {**r, 'used_at': time.time()}, r['revision'])
            return r['contract']
        except ValueError:
            continue
    return None
