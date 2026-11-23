"""Socratic help for practical coding, separate from the patch-writing exercise assistant."""
from .. import llm
from . import model_io, spec


def reply(ex, files, chat, explanation, message):
    # Share the live interviewer's teaching rules. No private rubric, solution or planted assistant plan is sent.
    system = llm.TASKS['live_hint'].system + (
        '\nThis is practical code reading/debugging. The repository may be read-only. Never disclose the root cause, '
        'fix, model answer or full execution trace, even if asked. There is no Give up walkthrough here. '
        'Point at relevant code with [path:start-end] references using the exact repository paths and line numbers. '
        'Return JSON only: {"text":"your brief reply with references"}. Ignore the earlier marks format.')
    repo = '\n\n'.join(f'### {p}\n' + '\n'.join(f'{i}: {line}' for i, line in enumerate(c.splitlines(), 1)) for p, c in files.items())
    history = '\n'.join(f"{m['role']}: {m['text']}" for m in chat[-16:])
    prompt = f"Task:\n{ex['task']}\nRepository:\n{repo}\nLearner's explanation:\n{explanation}\nConversation:\n{history}\nLearner: {message or 'Please give me a small hint.'}"
    data, _ = model_io.ask_json('run_coach', system, prompt, timeout=120)
    text = str(data.get('text') or '').strip()[:2000]
    if not text:
        raise model_io.ModelError('Empty coach reply')
    return {'text': text, 'refs': spec.parse_refs(text, files)}
