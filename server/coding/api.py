"""HTTP API for Coding Practice: /api/coding/... Answers are saved before any model call; hidden material is released only
after a submission (`grade.review`) and never appears in `spec.public` or `public_attempt`."""
import asyncio
import logging
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..timed_sessions import timed_start, activities as timed_activities
from .. import auth
from ..store import get_store
from ..tracks.http import put
from . import assistant, coach, grade, interview, model_io, queue, runner, sandbox, spec as S

log = logging.getLogger(__name__)
router = APIRouter(prefix='/api/coding', tags=['coding'])
AT, EX = queue.AT, queue.EX
ATTEMPT_PUBLIC = ('id', 'mode', 'category', 'exercise_id', 'status', 'started_at', 'explanation', 'hints_used', 'revision',
                  'submitted_at', 'elapsed_sec', 'files', 'runs', 'chat', 'last_run', 'coach_chat', 'interview', 'via', 'own_test')


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


def _shown(m):
    return {k: v for k, v in m.items() if k != 'planted'}


def public_attempt(a, ex=None):
    out = {k: a.get(k) for k in ATTEMPT_PUBLIC if k in a}
    if 'chat' in out:
        out['chat'] = [_shown(m) for m in out['chat'] or []]
    out['refs'] = S.parse_refs(a.get('explanation', ''), ex['files']) if ex else []
    out['hints'] = (ex.get('hints') or [])[:a.get('hint_ladder_used', a.get('hints_used', 0))] if ex else []
    if a.get('status') == 'submitted':
        out['result'] = a.get('result')
        out['needs_self_mark'] = not a.get('result') and a.get('via') != 'interview'
        out['review'] = grade.review(ex) if ex else None
        if ex and ex['category'] in S.EXECUTABLE:
            out['review']['reference_diff'] = runner.unified(ex, None, fixed=True)
            out['review']['your_diff'] = a.get('your_diff', '')
        if ex and ex.get('mode') == 'assisted' and a.get('ai_reveal'):
            out['review']['ai'] = a['ai_reveal']
            out['review']['chat'] = a.get('chat') or []   # after submission, which reply was planted may be seen
    return out


def _attempt(store, aid):
    a = store.get_track_record(AT, aid)
    if not a or a.get('kind') != 'attempt':
        raise HTTPException(404, 'Attempt not found')
    return a


def _exercise(store, a):
    ex = store.get_track_record(EX, a['exercise_id'])
    if not ex:
        raise HTTPException(410, 'This exercise is no longer stored')
    return ex


def _mode(mode):
    if mode not in S.MODES:
        raise HTTPException(404, 'Unknown mode')
    return mode


def _summary(done, mode):
    mine = S.done(done, mode)
    last = mine[-10:]
    return {'level': S.difficulty(done, mode), 'attempts': len(mine),
            'recent_score': round(sum(a['score'] for a in last) / len(last)) if last else None,
            'by_category': {c: round(100 * (1 - w)) if any(a['category'] == c for a in mine) else None
                            for c, w in S.weakness(done, mode, 'category', list(S.CATEGORIES[mode])).items()}}


@router.get('/overview')
def overview(uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    done = queue.attempts(store)
    exs = queue.exercises(store)
    modes, lang = {}, queue.choice(store)
    for m in S.MODES:
        modes[m] = {**_summary(done, m), 'ready': len([e for e in queue.ready(store, m, exs) if e.get('source') != 'curated' and queue.matches(e, lang)]),
                    'target': S.TARGET_READY * len(queue.categories(m)),
                    'overreliance': S.overreliance(done) if m == 'assisted' else False, 'generating': queue.generating(uid, m), 'error': queue.errors.get((uid, m)),
                    'open': next((a['id'] for a in sorted(done, key=lambda a: -a['started_at'])
                                  if a['mode'] == m and a['status'] == 'open'), None)}
        queue.kick(uid, m) if m == 'reading' or modes[m]['attempts'] or modes[m]['open'] else None
    recent = sorted((a for a in done if a['status'] == 'submitted'), key=lambda a: -a['submitted_at'])[:12]
    return {'modes': modes, 'model': model_io.available(), 'language': _language(lang),
            'recent': [{k: a.get(k) for k in ('id', 'mode', 'category', 'difficulty', 'score', 'process', 'title', 'submitted_at', 'hints_used')}
                       for a in recent]}


def _language(choice):
    runs = S.target_language(choice, 'repair')
    return {'choice': choice, 'choices': [{'id': c, 'label': S.LANGUAGE_LABELS[c]} for c in S.LANGUAGE_CHOICES],
            'note': ('Reading mix: mostly Java, some Python, a little Go and TypeScript. Exercises you run are Java or Python.'
                     if choice == 'mixed' else f'Everything in {S.LANGUAGE_LABELS[choice]}.' if runs == choice else
                     f'Reading exercises in {S.LANGUAGE_LABELS[choice]}. Exercises you edit and run are in {S.LANGUAGE_LABELS[runs]}, '
                     f'because the sandbox cannot run {S.LANGUAGE_LABELS[choice]} yet.')}


class LanguageBody(BaseModel):
    language: str


@router.put('/language')
def set_language(body: LanguageBody, uid: str = Depends(auth.require_user)):
    """The language to practise in. New exercises are made in it from now on; ones already made wait in case you switch back."""
    if body.language not in S.LANGUAGE_CHOICES:
        raise HTTPException(422, 'Unknown language')
    store = get_store(uid)
    store.update_settings({'coding_language': body.language})
    for m in S.MODES:
        queue.kick(uid, m)
    return {'language': _language(body.language)}


class StartBody(BaseModel):
    category: str | None = None
    new: bool = False


@router.post('/{mode}/start')
@timed_start('coding')
async def start(mode: str, body: StartBody, uid: str = Depends(auth.require_user)):
    store = get_store(uid)
    _mode(mode)
    current = next((a for a in timed_activities(store) if a['kind'] == 'coding' and a.get('mode') == mode), None)
    if current and not body.new:
        a = store.get_track_record(AT, current['id'])
        return {'attempt': public_attempt(a, ex := _exercise(store, a)), 'exercise': S.public(ex)}
    if body.category and body.category not in S.CATEGORIES[mode]:
        raise HTTPException(422, 'Unknown category')
    ex = queue.take(store, mode, body.category)
    if ex is None:
        raise HTTPException(503, 'Nothing is ready for this mode yet. Exercises are still being prepared, try again in a minute.')
    now = time.time()
    a = put(store, AT, 'at_' + secrets.token_hex(8),
            {'kind': 'attempt', 'mode': mode, 'category': ex['category'], 'exercise_id': ex['id'], 'difficulty': ex['difficulty'],
             'language': ex['language'], 'skills': ex['skills'], 'title': ex['title'], 'status': 'open', 'started_at': now, 'updated_at': now,
             'explanation': '', 'hints_used': 0, 'files': {}, 'runs': []})
    queue.kick(uid, mode)
    want = S.target_language(queue.choice(store), ex['category'])
    note = (f"No {S.LANGUAGE_LABELS[want]} exercise of this kind is ready yet, so this one is in {S.LANGUAGE_LABELS.get(ex['language'], ex['language'])}. "
            f"More in {S.LANGUAGE_LABELS[want]} are being prepared.") if want and ex['language'] != want else None
    return {'attempt': public_attempt(a, ex), 'exercise': S.public(ex), 'note': note}


@router.get('/attempts/{aid}')
def get_attempt(aid: str, store=Depends(store_for)):
    a = _attempt(store, aid)
    ex = _exercise(store, a)
    return {'attempt': public_attempt(a, ex), 'exercise': S.public(ex)}


class SaveBody(BaseModel):
    explanation: str = Field(max_length=12000)
    revision: int
    files: dict[str, str] | None = None


@router.put('/attempts/{aid}')
def save(aid: str, body: SaveBody, store=Depends(store_for)):
    a = _attempt(store, aid)
    if a['status'] != 'open':
        raise HTTPException(409, 'This attempt is already submitted')
    mine = {**(a.get('files') or {}), **_learner_files(_exercise(store, a), body.files)} if body.files else a.get('files') or {}
    saved = put(store, AT, aid, {**a, 'explanation': body.explanation, 'files': mine, 'updated_at': time.time()}, body.revision)
    return {'revision': saved['revision']}


@router.post('/attempts/{aid}/hint')
def hint(aid: str, store=Depends(store_for)):
    """The next hint, one at a time, each a little more specific. Counted against the score a little."""
    a = _attempt(store, aid)
    ex = _exercise(store, a)
    if a['status'] != 'open':
        raise HTTPException(409, 'This attempt is already submitted')
    n = a.get('hint_ladder_used', a.get('hints_used', 0))
    if n >= len(ex.get('hints') or []):
        raise HTTPException(409, 'No more hints')
    saved = put(store, AT, aid, {**a, 'hints_used': a.get('hints_used', 0) + 1, 'hint_ladder_used': n + 1}, a['revision'])
    return {'hints': ex['hints'][:n + 1], 'revision': saved['revision']}


class SubmitBody(BaseModel):
    explanation: str = Field(max_length=12000)
    revision: int
    elapsed_sec: int = Field(default=0, ge=0, le=86400)
    files: dict[str, str] = Field(default_factory=dict)


def _finish(a, ex, result, now):
    a = {**a, 'status': 'submitted', 'submitted_at': now, 'result': result, 'score': result['score'] if result else None,
         'process': result.get('process') if result else None, 'refs': S.parse_refs(a['explanation'], ex['files'])}
    if result:
        a['misconceptions'] = result.get('misconceptions', [])
    return a


@router.post('/attempts/{aid}/submit')
async def submit(aid: str, body: SubmitBody, store=Depends(store_for)):
    a = _attempt(store, aid)
    if a['status'] != 'open':
        raise HTTPException(409, 'This attempt is already submitted')
    ex = _exercise(store, a)
    if len(body.explanation.strip()) < 10:
        raise HTTPException(422, 'Write your explanation first')
    now = time.time()
    saved = put(store, AT, aid, {**a, 'explanation': body.explanation, 'updated_at': now, 'elapsed_sec': body.elapsed_sec or int(now - a['started_at'])},
                body.revision)
    refs = S.parse_refs(body.explanation, ex['files'])
    message, result = None, None
    tests = None
    if ex['category'] in S.EXECUTABLE:
        mine = _learner_files(ex, {**(a.get('files') or {}), **body.files})
        saved = put(store, AT, aid, {**saved, 'files': mine}, saved['revision'])
        tests = await _run_all(ex, mine)
        saved['your_diff'] = runner.unified(ex, mine)
        if S.own_test_written(ex, mine):
            saved['own_test'] = await _own_verdict(ex, mine, 'fix')
    if model_io.available():
        try:
            result = await _grade(ex, saved, refs, tests)
        except model_io.ModelError as e:
            log.warning('Coding examiner could not mark the answer: %s', e)
            message = f'The examiner could not mark this just now ({e}). ' + ('Your tests are marked below.' if tests else 'Your answer is saved: mark yourself against the findings below.')
    else:
        log.warning('Coding examiner disabled: configure LocalRouter or an OpenRouter API key')
        message = 'The examiner is off, so ' + ('only the tests mark this one.' if tests else 'mark yourself against the findings below.')
    if tests:
        result = _combine(tests, result)
    if ex.get('mode') == 'assisted':
        chat = saved.get('chat') or []
        sig = assistant.signals(ex, saved, chat, saved.get('files') or {})
        assessed = None
        if model_io.available():
            try:
                assessed = await asyncio.to_thread(assistant.assess, ex, saved, chat, sig, tests, saved.get('your_diff', ''))
            except model_io.ModelError as e:
                message = (message or '') + f' The AI-use review could not be written ({e}).'
        reveal = assistant.reveal(ex, sig, assessed)
        saved['ai'] = {'planted': sig['planted'], 'kind': sig['kind'], 'detected': reveal.get('detected'), 'applied_flawed': sig['applied_flawed']}
        saved['ai_reveal'] = reveal
        if result and assessed:
            result['process'] = assessed['process']
            result['process_note'] = '; '.join(v['note'] for v in assessed['dims'].values() if v['note'])[:600]
    done = put(store, AT, aid, _finish(saved, ex, result, now), saved['revision'])
    queue.kick(store.uid, a['mode'])
    return {'attempt': public_attempt(done, ex), 'message': message}


async def _grade(ex, a, refs, tests=None):
    extra = ''
    if tests:
        extra = (f"THE LEARNER'S CODE CHANGES (unified diff):\n{runner.unified(ex, a.get('files'))[:6000] or '(none)'}\n"
                 f"TEST RESULTS: visible {tests['visible_summary']['passed']}/{tests['visible_summary']['total']} pass, hidden "
                 f"{tests['hidden_summary']['passed']}/{tests['hidden_summary']['total']} pass. The reference fix:\n{runner.unified(ex, None, fixed=True)[:6000]}\n"
                 "Mark the explanation of the cause and the fix; the tests are marked separately.\n\n")
    return await asyncio.to_thread(grade.mark, ex, a['explanation'], refs, a.get('hints_used', 0), extra)


def _learner_files(ex, files):
    ok = set(S.learner_paths(ex))
    return {p: c for p, c in files.items() if p in ok and isinstance(c, str) and len(c) <= S.MAX_FILE_BYTES}


async def _run_all(ex, files):
    vis, hid = await asyncio.gather(asyncio.to_thread(runner.run_visible, ex, files), asyncio.to_thread(runner.run_hidden, ex, files))
    return {'visible': runner.learner_rows(vis), 'hidden': runner.learner_rows(hid), 'visible_summary': sandbox.summary(vis),
            'hidden_summary': sandbox.summary(hid), 'timed_out': bool(vis['timed_out'] or hid['timed_out'])}


def _combine(tests, marked):
    """Repair marks: how the code does against every test (65%) and the explanation of cause and fix (35%). Without the examiner,
    the tests alone."""
    vs, hs = tests['visible_summary'], tests['hidden_summary']
    total = vs['total'] + hs['total']
    test_score = round(100 * (vs['passed'] + hs['passed']) / total) if total else 0
    if not marked:
        return {'score': test_score, 'process': None, 'process_note': '', 'findings': [], 'misconceptions': [], 'strengths': [], 'improve': [],
                'summary': f"Marked on the tests alone: {vs['passed'] + hs['passed']} of {total} pass.", 'by': 'tests', 'tests': tests, 'test_score': test_score}
    return {**marked, 'score': round(0.65 * test_score + 0.35 * marked['score']), 'explanation_score': marked['score'], 'test_score': test_score, 'tests': tests}


async def _own_verdict(ex, files, after):
    """Your test on the code you were given and on the fixed code (`after`: your edits while you work, the reference fix
    at submission, so the review says whether it catches the bug rather than whether it agrees with your fix)."""
    before, fixed = await asyncio.gather(asyncio.to_thread(runner.run_own, ex, files, 'original'), asyncio.to_thread(runner.run_own, ex, files, after))
    return {**S.own_test_verdict(runner.ran(before), runner.ran(fixed), after), 'against': after,
            'original': runner.learner_rows(before), 'fixed': runner.learner_rows(fixed)}


class FilesBody(BaseModel):
    files: dict[str, str] = Field(default_factory=dict)


@router.post('/attempts/{aid}/own-test')
async def own_test(aid: str, body: FilesBody, store=Depends(store_for)):
    """Run your own test on the code you were given and on your current code."""
    a = _attempt(store, aid)
    ex = _exercise(store, a)
    if a['status'] != 'open' or not S.own_test(ex):
        raise HTTPException(409, 'There is no test of yours to run here')
    mine = {**(a.get('files') or {}), **_learner_files(ex, body.files)}
    if not S.own_test_written(ex, mine):
        raise HTTPException(422, f'Write your test in {S.own_test(ex)[0]} first')
    verdict = await _own_verdict(ex, mine, 'yours')
    a = _attempt(store, aid)
    saved = put(store, AT, aid, {**a, 'files': {**(a.get('files') or {}), **_learner_files(ex, body.files)}}, a['revision'])
    return {**verdict, 'revision': saved['revision']}


class TalkBody(BaseModel):
    text: str = Field(default='', max_length=8000)
    files: dict[str, str] = Field(default_factory=dict)


def _open_for_talk(store, aid):
    a = _attempt(store, aid)
    if a['status'] != 'open':
        raise HTTPException(409, 'This exercise is finished')
    if not model_io.available():
        raise HTTPException(503, 'The interviewer needs a model, and none is configured.')
    return a, _exercise(store, a)


@router.post('/attempts/{aid}/interview')
async def interview_turn(aid: str, body: TalkBody, store=Depends(store_for)):
    """Your turn (saved first), then the interviewer's. An empty first turn asks the interviewer to open."""
    a, ex = _open_for_talk(store, aid)
    talk = dict(a.get('interview') or {'started_at': time.time(), 'turns': []})
    text = body.text.strip()
    if not text and interview.turns(talk):
        raise HTTPException(422, 'Say something first')
    if interview.yours(talk) >= interview.MAX_TURNS:
        raise HTTPException(429, 'That is a long interview. Press Finish for the debrief.')
    if text:
        talk['turns'] = interview.turns(talk) + [{'id': secrets.token_hex(4), 'role': 'you', 'text': text, 'at': time.time()}]
        a = put(store, AT, aid, {**a, 'interview': talk, 'files': {**(a.get('files') or {}), **_learner_files(ex, body.files)}}, a['revision'])
    files = runner.overlay(ex, a.get('files'))
    try:
        out = await asyncio.to_thread(interview.reply, ex, files, talk)
    except model_io.ModelError as e:
        raise HTTPException(502, f'The interviewer did not answer ({e}). What you said is saved; press Next again.') from e
    a = _attempt(store, aid)
    talk = dict(a.get('interview') or talk)
    talk['turns'] = interview.turns(talk) + [{'id': secrets.token_hex(4), 'role': 'interviewer', 'kind': out['kind'], 'text': out['text'],
                                              'refs': out['refs'], 'at': time.time()}]
    saved = put(store, AT, aid, {**a, 'interview': talk}, a['revision'])
    return {'interview': talk, 'revision': saved['revision']}


class FinishBody(BaseModel):
    elapsed_sec: int = Field(default=0, ge=0, le=86400)


@router.post('/attempts/{aid}/interview/finish')
async def interview_finish(aid: str, body: FinishBody, store=Depends(store_for)):
    """End the exercise with an informal debrief. No score, so your level and averages don't move; the skills it says to
    work on are given more weight in what comes next (spec.flagged_skills)."""
    a, ex = _open_for_talk(store, aid)
    talk = a.get('interview') or {}
    if not interview.yours(talk):
        raise HTTPException(422, 'Talk the interviewer through it first')
    now = time.time()
    try:
        d = await asyncio.to_thread(interview.debrief, ex, runner.overlay(ex, a.get('files')), talk, now)
    except model_io.ModelError as e:
        raise HTTPException(502, f'The debrief could not be written ({e}). Your interview is saved; press Finish again.') from e
    a = _attempt(store, aid)
    if a['status'] != 'open':
        raise HTTPException(409, 'This exercise is finished')
    done = put(store, AT, aid, {**a, 'status': 'submitted', 'submitted_at': now, 'via': 'interview', 'result': None, 'score': None,
                                'elapsed_sec': body.elapsed_sec or int(now - a['started_at']),
                                'explanation': a.get('explanation') or interview.transcript(talk)[:12000],
                                'misconceptions': d['misconceptions'], 'interview': {**talk, 'debrief': d}}, a['revision'])
    queue.kick(store.uid, a['mode'])
    return {'attempt': public_attempt(done, ex)}


class AssistBody(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    files: dict[str, str] = Field(default_factory=dict)


class CoachBody(BaseModel):
    message: str = Field(default='', max_length=4000)
    files: dict[str, str] = Field(default_factory=dict)
    explanation: str = Field(default='', max_length=30000)


@router.post('/attempts/{aid}/coach')
async def coach_chat(aid: str, body: CoachBody, store=Depends(store_for)):
    a = _attempt(store, aid)
    ex = _exercise(store, a)
    if a['status'] != 'open':
        raise HTTPException(409, 'This attempt is already submitted')
    if not model_io.available():
        raise HTTPException(503, 'The coach needs a model, and none is configured.')
    chat = list(a.get('coach_chat') or [])
    if len(chat) >= S.MAX_ASSIST * 2:
        raise HTTPException(429, 'This session has reached its coach message limit.')
    files = runner.overlay(ex, {**(a.get('files') or {}), **_learner_files(ex, body.files)})
    try:
        out = await asyncio.to_thread(coach.reply, ex, files, chat, body.explanation, body.message)
    except model_io.ModelError as e:
        raise HTTPException(502, f'The coach did not answer ({e}). Try again.') from e
    a = _attempt(store, aid)
    if a['status'] != 'open':
        raise HTTPException(409, 'This attempt is already submitted')
    chat = list(a.get('coach_chat') or []) + [
        {'id': secrets.token_hex(4), 'role': 'user', 'text': body.message or 'Give me a hint', 'at': time.time()},
        {'id': secrets.token_hex(4), 'role': 'assistant', **out, 'at': time.time()}]
    saved = put(store, AT, aid, {**a, 'coach_chat': chat, 'hints_used': a.get('hints_used', 0) + 1,
                                 'hint_ladder_used': a.get('hint_ladder_used', a.get('hints_used', 0))}, a['revision'])
    return {'chat': chat, 'revision': saved['revision']}


@router.post('/attempts/{aid}/assist')
async def assist(aid: str, body: AssistBody, store=Depends(store_for)):
    """One turn with the AI assistant. The learner's message is saved before the model is called."""
    a = _attempt(store, aid)
    ex = _exercise(store, a)
    if ex.get('mode') != 'assisted' or a['status'] != 'open':
        raise HTTPException(409, 'The assistant is for open AI-assisted sessions')
    if not model_io.available():
        raise HTTPException(503, 'The assistant needs a model, and none is configured.')
    chat = list(a.get('chat') or [])
    if sum(m['role'] == 'user' for m in chat) >= S.MAX_ASSIST:
        raise HTTPException(429, 'This session has reached its message limit.')
    now = time.time()
    chat.append({'id': secrets.token_hex(4), 'role': 'user', 'text': body.message, 'at': now})
    a = put(store, AT, aid, {**a, 'chat': chat, 'files': {**(a.get('files') or {}), **_learner_files(ex, body.files)}}, a['revision'])
    mine = runner.overlay(ex, a.get('files'))
    try:
        out = await asyncio.to_thread(assistant.reply, ex, mine, chat[:-1], body.message)
    except model_io.ModelError as e:
        raise HTTPException(502, f'The assistant did not answer ({e}). Your message is saved; try again.') from e
    msg = {'id': secrets.token_hex(4), 'role': 'assistant', 'text': out['text'], 'patch': out['patch'], 'at': time.time(), 'planted': out['planted']}
    a = store.get_track_record(AT, aid)
    saved = put(store, AT, aid, {**a, 'chat': (a.get('chat') or []) + [msg]}, a['revision'])
    return {'message': _shown(msg), 'revision': saved['revision']}


class AppliedBody(BaseModel):
    msg_id: str


@router.post('/attempts/{aid}/applied')
def applied(aid: str, body: AppliedBody, store=Depends(store_for)):
    """The learner took the assistant's patch into their code. Recorded for the review of how they used it."""
    a = _attempt(store, aid)
    if a['status'] != 'open':
        raise HTTPException(409, 'This attempt is already submitted')
    chat = (a.get('chat') or []) + [{'role': 'event', 'kind': 'applied', 'msg_id': body.msg_id, 'at': time.time(), 'text': ''}]
    saved = put(store, AT, aid, {**a, 'chat': chat}, a['revision'])
    return {'revision': saved['revision']}


class RunBody(BaseModel):
    files: dict[str, str] = Field(default_factory=dict)
    revision: int | None = None


@router.post('/attempts/{aid}/run')
async def run(aid: str, body: RunBody, store=Depends(store_for)):
    """Run the visible tests against your current files. The hidden tests are only ever run at submission."""
    a = _attempt(store, aid)
    ex = _exercise(store, a)
    if a['status'] != 'open' or ex['category'] not in S.EXECUTABLE:
        raise HTTPException(409, 'There is nothing to run here')
    if len(a.get('runs') or []) >= S.MAX_RUNS:
        raise HTTPException(429, 'That is plenty of runs for one exercise. Submit when you are ready.')
    mine = _learner_files(ex, body.files)
    res = await asyncio.to_thread(runner.run_visible, ex, mine)
    rows = runner.learner_rows(res)
    s = sandbox.summary(res)
    now = time.time()
    a = store.get_track_record(AT, aid)
    saved = put(store, AT, aid, {**a, 'files': {**(a.get('files') or {}), **mine}, 'runs': ((a.get('runs') or []) + [{'at': now, 'passed': s['passed'], 'total': s['total']}])[-S.MAX_RUNS:],
                         'last_run': {'rows': rows, 'at': now, 'timed_out': res['timed_out'], 'loaderror': res.get('loaderror', '')}}, a['revision'])
    return {'revision': saved['revision'], 'rows': rows, 'passed': s['passed'], 'total': s['total'], 'timed_out': res['timed_out'], 'loaderror': res.get('loaderror', ''),
            'crashed': res['crashed'], 'diff': runner.unified(ex, mine)}


@router.post('/attempts/{aid}/diff')
def diff(aid: str, body: RunBody, store=Depends(store_for)):
    a = _attempt(store, aid)
    return {'diff': runner.unified(_exercise(store, a), _learner_files(_exercise(store, a), body.files))}


class MarkBody(BaseModel):
    met: list[str] = Field(max_length=20)


@router.post('/attempts/{aid}/mark')
def mark(aid: str, body: MarkBody, store=Depends(store_for)):
    """Marking yourself against the findings, when the examiner is unavailable."""
    a = _attempt(store, aid)
    ex = _exercise(store, a)
    if a['status'] != 'submitted' or a.get('result'):
        raise HTTPException(409, 'Only a submitted attempt that has not been marked can be self-marked')
    result = grade.self_marked(ex, body.met)
    done = put(store, AT, aid, {**a, 'result': result, 'score': result['score']}, a['revision'])
    return {'attempt': public_attempt(done, ex)}
