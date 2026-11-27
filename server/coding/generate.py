"""Exercise generation: a spec in, a complete exercise out (not yet validated).

The model writes a fresh repository in a delimited format (code does not survive JSON string escaping well):

    <<<META>>> {json} <<<END>>>
    <<<FILE path>>> code <<<END>>>        what the learner sees (source, and visible tests)
    <<<HIDDEN path>>> code <<<END>>>      hidden tests, released to no one
    <<<FIX path>>> code <<<END>>>         the reference fix: whole replacement files

Findings point at code with an exact snippet, and line numbers are computed here, because a model counts lines badly.
"""
import ast
import random
import re
import secrets
import time

from . import model_io, spec as S

HEADER = re.compile(r'^<<<(META|FILE|HIDDEN|FIX|FLAWED)(?:[ \t]+(?:path[ \t]*=[ \t]*)?["\']?([^\n>"\']+?)["\']?)?[ \t]*>>>[ \t]*$')
END = re.compile(r'^<<<END>>>[ \t]*$')
LEAK = re.compile(r'(#|//|/\*|\*|--)[^\n]*\b(bug|bugs|buggy|planted|injected|intentional(?:ly)?|fixme|off[- ]by[- ]one|the problem is|should be)\b', re.I)

SYSTEM = (
    "You write realistic practice repositories for a senior backend engineer rebuilding their code-reading and debugging "
    "skills for job interviews. Each repository is new, self-contained and reads like real work code: sensible names, "
    "docstrings where a team would write them, some small imperfections, no tutorial tone. Never comment on the bug or hint "
    "at the answer anywhere in the code, the file names or the task. Reply in exactly the delimited format requested and "
    "nothing else."
)


class GenError(ValueError):
    pass


def _dim_text(level):
    return '\n'.join(f'- {k}: {v}' for k, v in S.dims(level).items())


MARKSCHEME_RULE = (
    '\nThe "model_answer" is marked against the findings and the review: it must state every finding (every key one first) '
    'and every step of "execution_path", including the behaviour of each function the findings name, so that nothing the '
    'learner is marked on is missing from it. Criteria must assess only the task requested, accept equivalent reasoning, '
    'and distinguish required understanding from optional deeper observations. Do not add cosmetic requirements.\n')


KOTLIN = (
    "Write idiomatic Kotlin as a Kotlin backend team would: Kotlin 2 with the standard library (kotlinx.coroutines only when "
    "the level calls for async). Use the features such a team uses every day where they are natural, not as a tour: data "
    "classes, nullable types with ?. ?: and !!, when expressions, sealed interfaces for results, extension functions, scope "
    "functions (let, apply, also, run), named and default arguments, collection operations (map, filter, groupBy, associateBy, "
    "fold), object declarations and companion objects. The reader knows Java well and is learning to read Kotlin.\n"
    'Add META key "idioms": 4 to 8 objects {"kotlin":"a short form as it appears in this code","java":"what you would write in '
    'Java instead","note":"one sentence on what it does"}, only for features that appear in this code, and none that hints at the answer.\n')
JVM_SERVICE = (
    "Lay it out like a small JVM backend service: an entry point (a handler or controller), a service holding the business logic, "
    "and repository or client interfaces with in-memory implementations standing in for the database and other services. "
    "Standard library only, no framework, but named and split the way a Spring team would split it.\n")
WALKTHROUGH = (
    "No bug report. The repository is a small working service with one weakness that only shows when something fails: an operation "
    "of two or more steps that is not atomic (for example a balance debited before a ledger write, stock reserved before a payment "
    "call, a cache written before the database), so a failure between the steps leaves state inconsistent, or a retry repeats an "
    "effect. Do not make it obvious, and do not comment on it.\n"
    "The task names one concrete request, with its input, and asks exactly these four numbered questions in this order:\n"
    "1. Trace this request from where it enters to where it returns: which functions run, in which order, across which files.\n"
    "2. What state is shared, between which components, requests or threads, and what protects it?\n"
    "3. What happens if <one specific call in this request> throws? Name the call (for example \"the call to the ledger client\"), "
    "not its consequences.\n"
    "4. Describe the test you'd write to pin that behaviour down: its setup, the failure you'd inject and what it asserts.\n"
    "Every answer must be derivable from reading the code.\n"
    'META json keys: "title" (neutral, a few words), "task" (markdown: one sentence on the service, the request, then the four '
    'questions), "findings" (5 to 8 objects: {"id":"f1","part":"trace|state|failure|test","text":"a fact the answer must state",'
    '"key":true if essential,"anchors":[{"path":"...","snippet":"an exact, contiguous 1-4 line excerpt of that file"}]}; at least '
    'one finding for each part; the trace and failure parts have a key finding with anchors; a test finding says what a good test '
    'does (which collaborator to fake and make fail, what to assert about the state afterwards) and needs no anchors), "rubric" '
    '(4-6 short criteria, at least one per question), "hints" (exactly 3: a nudge, a stronger nudge, a near-giveaway, none naming the '
    'weakness), "review" ({"expected_behaviour":"...","execution_path":"numbered steps naming files and functions","root_cause":'
    '"the failure-halfway weakness and its effect","interactions":"what a skim would miss"}), "model_answer" (the answer a strong '
    'engineer would give out loud, 200-350 words, answering the four questions in order).\n')


def build_prompt(spec):
    cat, lang, level = spec['category'], spec['language'], spec['difficulty']
    skills = ', '.join(S.SKILLS[s] for s in spec['skills'])
    ext = S.LANGUAGES[lang][0]
    base = (
        f"Make one {S.CATEGORY_LABELS[cat].lower()} exercise in {lang}.\n"
        f"Scenario: {spec['archetype']}. Invent your own names, domain details and layout; do not reuse a famous example.\n"
        f"Difficulty {level} of {S.LEVELS}:\n{_dim_text(level)}\n"
        f"Skills it should exercise: {skills}.\n"
        f"Files: source files use the .{ext} extension, in one or more folders; at most {S.MAX_FILES} files, each under "
        f"{S.MAX_FILE_BYTES // 1000} KB. Include a short README.md that says what the service is for (not how it is built).\n\n")
    if lang == 'kotlin':
        base += KOTLIN
    if cat == 'walkthrough':
        task = (JVM_SERVICE if lang in ('java', 'kotlin') else '') + WALKTHROUGH
    elif cat == 'comprehension':
        task = (
            "No bug is needed. The task asks the learner to understand the code: trace what happens for one concrete request "
            "or event end to end, say where state is persisted, how errors propagate, or predict the state or output after a "
            "specific sequence of events. The answer must be derivable from reading the code alone, but should need two or more "
            "files or functions, and one non-obvious detail (an ordering, a default, a swallowed error) that a skim would miss.\n"
            'META json keys: "title" (neutral, a few words), "task" (markdown: the question, with any concrete input), '
            '"findings" (3 to 6 objects: {"id":"f1","text":"a fact the answer must state","key":true if essential,'
            '"anchors":[{"path":"...","snippet":"an exact, contiguous 1-4 line excerpt of that file"}]}), '
            '"rubric" (3-5 short criteria for marking), "hints" (exactly 3: a nudge, a stronger nudge, a near-giveaway, none naming the answer), '
            '"review" ({"expected_behaviour":"...","execution_path":"numbered steps naming files and functions","root_cause":"",'
            '"interactions":"what a skim would miss"}), "model_answer" (the answer a strong engineer would write, 100-200 words).\n')
    elif cat == 'localisation':
        task = (
            "Plant one realistic bug (possibly spread over two functions or files, or a missing operation) and write a bug "
            "report that describes the symptom only: what the user or an operator saw, with a concrete example or log excerpt "
            "when it helps. The learner must find and explain the root cause without being told where. The code must otherwise "
            "work. The bug must be reproducible by reading, with enough evidence in the report to find it.\n"
            'META json keys: "title" (neutral, not naming the bug), "task" (markdown: the bug report), '
            '"findings" (2 to 5 objects: {"id":"f1","text":"root cause or a part of it","key":true for the root cause,'
            '"anchors":[{"path":"...","snippet":"an exact contiguous 1-4 line excerpt of the faulty code"}]}), '
            '"rubric" (3-5 criteria), "hints" (exactly 3, none naming the faulty function), '
            '"review" ({"expected_behaviour":"...","execution_path":"numbered steps from trigger to symptom","root_cause":"...",'
            '"interactions":"why it is easy to overlook"}), "model_answer" (100-200 words), '
            '"fix_summary" (how a maintainer would fix it, 1-3 sentences).\n')
    else:
        task = build_executable(spec)
        if lang == 'java':
            task = task.replace('tests/test_visible.py', 'tests/VisibleTest.java').replace('tests/test_hidden.py', 'tests/HiddenTest.java')
    example = {'java': 'exports/Store.java', 'kotlin': 'exports/Store.kt'}.get(lang, f'exports/store.{ext}')
    return base + task + MARKSCHEME_RULE + '\nOutput format: the <<<META>>> block first, then every file in its own block, for example\n<<<META>>>\n{...json...}\n<<<END>>>\n<<<FILE ' + example + '>>>\n...code...\n<<<END>>>\nThe path follows FILE after one space, with no quotes or path=.'


def build_executable(spec):
    """Executable Python/unittest or Java/standard-library exercises with tests the sandbox can run."""
    common = (
        "The repository is Python 3 using only the standard library, laid out as a package folder plus `tests/`. Tests use "
        "`unittest` and must be fast and deterministic: no network, no real sleeping (inject a fake clock), no randomness "
        "without a fixed seed, and for anything concurrent drive the interleaving explicitly instead of relying on real threads. "
        "Every file the learner is meant to change is a source file; the tests are not edited by the learner.\n"
        "Blocks: every source file and `tests/test_visible.py` go in <<<FILE path>>> blocks; `tests/test_hidden.py` goes in a "
        "<<<HIDDEN tests/test_hidden.py>>> block; the reference solution goes in <<<FIX path>>> blocks, each the COMPLETE "
        "replacement of one source file that changes.\n")
    if spec['language'] == 'java':
        common = (
            "Use Java 21 and only its standard library. No Maven, Gradle, JUnit or dependencies. Source files live in package "
            "folders matching their package declarations. Tests are public classes tests.VisibleTest and tests.HiddenTest, "
            "with public static void testDescriptiveName() methods taking no arguments. Each test must be independent and "
            "throw AssertionError on failure (Java assert is enabled). No main method or custom test runner. Tests import "
            "your public production classes. Use fake clocks, no networking, subprocesses, native code or real sleeps. "
            "Keep state in memory: no filesystem writes. Production code must compile on Java 21. No preview features. "
            "Put sources and tests/VisibleTest.java in FILE blocks, tests/HiddenTest.java in a HIDDEN block, and COMPLETE "
            "replacement production files in FIX blocks. Tests are read-only. "
        )
    if spec['category'] == 'repair':
        return common + (
            "Plant one realistic bug (possibly spread over two functions or files, or a missing operation) and write a bug report "
            "describing the symptom only. `tests/test_visible.py` has 3 to 6 tests: at least one fails because of the bug and "
            "reproduces the report, and at least one passes (the baseline works). `tests/test_hidden.py` has 4 to 8 tests of edge "
            "cases and neighbouring behaviour that a correct fix must satisfy and that the buggy code fails in at least one. The "
            "reference fix must make every test pass. The visible failure must not reveal the faulty line in its message.\n"
            'META json keys: "title" (neutral), "task" (markdown: the bug report, then one sentence asking the learner to fix it '
            'and run the tests with the Run tests button, never naming a shell command), "findings" (2 to 5: {"id":"f1","text":"root cause or a part of it","key":true for the root cause,'
            '"anchors":[{"path":"...","snippet":"an exact contiguous 1-4 line excerpt of the faulty code"}]}), "rubric" (3-5 criteria '
            'for the learner\'s explanation of the bug and fix), "hints" (exactly 3, none naming the faulty function), '
            '"review" ({"expected_behaviour":"...","execution_path":"numbered steps from trigger to symptom","root_cause":"...",'
            '"interactions":"why it is easy to overlook"}), "model_answer" (100-200 words on cause and fix), "fix_summary" (1-3 sentences).\n')
    plan = ''
    if spec.get('plan'):
        plan = (
            f"The exercise is for a session with an AI assistant that will, once, give a plausible but flawed answer of this kind: "
            f"{S.MISTAKES[spec['plan']]}. Write that flawed answer too: <<<FLAWED path>>> blocks, each the COMPLETE replacement of a "
            "source file, so that it looks like a sensible solution and reads as competent, "
            + ("fails to run (it uses something that does not exist) " if spec['plan'] == 'invented-api' else "passes every visible test but fails at least one hidden test ")
            + 'and is not obviously wrong. Add META key "assistant_plan": {"description":"what is wrong with it, for the reviewer",'
            '"message":"the confident message the assistant writes when it offers this patch, 60-140 words, no hint that it is flawed, '
            'and no claim to have run anything it has not","tell":"what the learner could notice or test to catch it"}.\n')
    if spec['category'] == 'bugfix':
        return common + (
            "Plant one realistic bug and describe the symptom in a ticket. `tests/test_visible.py` has 3 to 6 tests (one reproduces "
            "the ticket, some pass); `tests/test_hidden.py` has 4 to 8 tests of edge cases the correct fix must satisfy and the buggy "
            "code fails in at least one. The reference fix must make every test pass.\n" + plan +
            'META json keys: "title", "task" (markdown ticket), "findings" (2-4: {"id","text","key","anchors":[{"path","snippet"}]}), '
            '"rubric" (3-5 criteria for the learner\'s final explanation), "hints" (3), "review" ({"expected_behaviour","execution_path",'
            '"root_cause","interactions"}), "model_answer", "fix_summary"' + (', "assistant_plan"' if plan else '') + '.\n')
    if spec['category'] == 'feature':
        return common + (
            "A small, realistic feature request for an existing, working codebase. `tests/test_visible.py` has 3 to 5 tests of the "
            "requested behaviour (at least one new-behaviour test fails on the starter code) and at least one that checks existing "
            "behaviour and passes. `tests/test_hidden.py` has 4 to 8 tests of the requirements' edge cases and failure behaviour. "
            "The request states the behaviour precisely enough that the hidden tests are fair. The reference solution makes every test pass.\n"
            + plan + 'META json keys: "title", "task" (markdown feature request with the interface to add), "findings" (2-4: what a '
            'correct solution must do, each with optional anchors to where it belongs), "rubric" (3-5), "hints" (3), '
            '"review" ({"expected_behaviour","execution_path":"how the change fits the code","root_cause":"","interactions":"what is easy to miss"}), '
            '"model_answer", "fix_summary"' + (', "assistant_plan"' if plan else '') + '.\n')
    raise GenError(f"{spec['category']} exercises are not available")


def parse(text):
    """-> (meta dict, {kind: {path: code}}). A block ends at <<<END>>> or at the next header, since models forget the first."""
    meta, files = None, {'FILE': {}, 'HIDDEN': {}, 'FIX': {}, 'FLAWED': {}}
    kind = path = None
    body = []

    def close():
        nonlocal meta
        if kind == 'META':
            meta = model_io.extract_json('\n'.join(body))
        elif kind:
            if not path:
                raise GenError(f'a {kind} block has no path')
            files[kind][path] = '\n'.join(body).strip('\n') + '\n'
    for line in (text or '').replace('\r\n', '\n').split('\n'):
        h = HEADER.match(line)
        if h or END.match(line):
            close()
            kind, path, body = (h.group(1), (h.group(2) or '').strip(), []) if h else (None, None, [])
        elif kind:
            body.append(line)
    close()
    if meta is None:
        raise GenError('no META block')
    return meta, files


def _check_files(files, language):
    if not files or len(files) > S.MAX_FILES:
        raise GenError(f'{len(files)} files')
    total = 0
    for path, code in files.items():
        if not S.safe_path(path):
            raise GenError(f'unsafe path {path}')
        total += len(code.encode())
        if len(code.encode()) > S.MAX_FILE_BYTES:
            raise GenError(f'{path} is too long')
        if LEAK.search(code):
            raise GenError(f'{path} comments on its own bug or answer')
        if path.endswith('.py'):
            try:
                ast.parse(code, path)
            except SyntaxError as e:
                raise GenError(f'{path} does not parse: {e.msg} on line {e.lineno}') from e
    if total > S.MAX_TOTAL_BYTES:
        raise GenError('repository too large')
    exts = S.LANGUAGES[language]
    if not any(p.endswith(tuple('.' + e for e in exts)) for p in files):
        raise GenError(f'no {language} source files')


def assemble(spec, text, model):
    """The stored exercise, from the model's reply. Finds each finding's lines from its anchor; raises GenError."""
    meta, blocks = parse(text)
    files = blocks['FILE']
    _check_files(files, spec['language'])
    findings = []
    for i, f in enumerate(meta.get('findings') or []):
        f = f if isinstance(f, dict) else {'text': str(f)}
        locations = []
        for a in [a for a in f.get('anchors') or [] if isinstance(a, dict)]:
            where = S.locate(files, a.get('path', ''), a.get('snippet', ''))
            if where:
                locations.append({'path': a['path'], 'start': where[0], 'end': where[1]})
        needs_code = spec['category'] in ('localisation', 'repair', 'bugfix') or f.get('anchors')
        if f.get('anchors') and not locations and f.get('key'):
            raise GenError(f"finding {f.get('id', i)} quotes code that is not in the files")
        if needs_code and not locations and f.get('key'):
            raise GenError('a key finding has no location')
        findings.append({'id': str(f.get('id') or f'f{i + 1}'), 'text': str(f.get('text') or '')[:600],
                         'key': bool(f.get('key')), 'locations': locations,
                         **({'part': f['part']} if spec['category'] == 'walkthrough' and f.get('part') in S.WALKTHROUGH_PARTS else {})})
    if not findings or not any(f['key'] for f in findings):
        findings = [{**f, 'key': True} for f in findings[:1]] + findings[1:]
    if not findings or not meta.get('task') or not meta.get('model_answer'):
        raise GenError('missing task, findings or model answer')
    if spec['category'] == 'walkthrough' and not {'trace', 'failure'} <= {f.get('part') for f in findings}:
        raise GenError('a walkthrough needs findings for the trace and for the failure')
    hints = [str(h) for h in (meta.get('hints') or [])][:3]
    rubric = [str(r) for r in (meta.get('rubric') or [])][:6]
    if len(hints) < 2 or len(rubric) < 2:
        raise GenError('missing hints or rubric')
    visible = {p: c for p, c in files.items() if _is_test(p)}
    if spec['category'] in S.EXECUTABLE:
        if spec['language'] not in dict(S.EXECUTION_LANGUAGES):
            raise GenError('execution supports Python and Java only')
        if not visible or not blocks['HIDDEN'] or not blocks['FIX']:
            raise GenError('an executable exercise needs visible tests, hidden tests and a reference fix')
        if any(not _is_test(p) or p in files for p in blocks['HIDDEN']):
            raise GenError('hidden tests must be separate test files, not source replacements')
        for p in blocks['FIX']:
            if p not in files or _is_test(p) or not p.endswith(tuple('.' + ext for ext in S.LANGUAGES[spec['language']])):
                raise GenError(f'the reference fix replaces {p}, which is not a source file')
        for p, code in blocks['FIX'].items():
            if not p.endswith('.py'):
                continue
            try:
                ast.parse(code, p)
            except SyntaxError as e:
                raise GenError(f'the reference fix {p} does not parse: {e.msg}') from e
        _check_files({**files, **blocks['HIDDEN']}, spec['language'])
    return {
        'kind': 'exercise', 'id': 'ex_' + secrets.token_hex(8), 'mode': spec['mode'], 'category': spec['category'],
        'language': spec['language'], 'difficulty': spec['difficulty'], 'skills': spec['skills'], 'archetype': spec['archetype'],
        'title': str(meta.get('title') or 'Untitled')[:90], 'task': str(meta['task'])[:5000], 'files': files,
        'editable': [] if spec['category'] not in S.EXECUTABLE else sorted(p for p in files if not _is_test(p) and p.endswith(tuple('.' + ext for ext in S.LANGUAGES[spec['language']]))),
        'visible_tests': visible, 'hidden_tests': blocks['HIDDEN'], 'reference_fix': blocks['FIX'],
        'findings': findings, 'rubric': rubric, 'hints': hints, 'review': meta['review'] if isinstance(meta.get('review'), dict) else {'expected_behaviour': str(meta.get('review') or '')},
        'model_answer': str(meta['model_answer'])[:2500], 'fix_summary': str(meta.get('fix_summary') or '')[:800],
        'assistant_plan': _plan(spec, meta, blocks), 'idioms': _idioms(meta) if spec['language'] == 'kotlin' else [],
        'status': 'draft', 'source': 'generated', 'created_at': time.time(), 'model': model, 'validation': {},
    }


def _idioms(meta):
    rows = [i for i in meta.get('idioms') or [] if isinstance(i, dict) and i.get('kotlin') and i.get('java')]
    return [{k: str(i.get(k) or '')[:300] for k in ('kotlin', 'java', 'note')} for i in rows[:8]]


def _plan(spec, meta, blocks):
    if not spec.get('plan'):
        return {'kind': None} if spec['mode'] == 'assisted' else None
    p = meta.get('assistant_plan') if isinstance(meta.get('assistant_plan'), dict) else {}
    if not blocks['FLAWED'] or not p.get('message'):
        raise GenError('the assistant plan needs a flawed patch and its message')
    for path, code in blocks['FLAWED'].items():
        if not S.safe_path(path) or path not in blocks['FILE'] or _is_test(path):
            raise GenError('flawed patches must replace existing source files only')
        if not path.endswith('.py'):
            continue
        try:
            ast.parse(code, path)
        except SyntaxError as e:
            raise GenError(f'the flawed patch {path} does not parse') from e
    return {'kind': spec['plan'], 'description': str(p.get('description') or '')[:700], 'message': str(p['message'])[:1500],
            'tell': str(p.get('tell') or '')[:500], 'flawed_files': blocks['FLAWED']}


def _is_test(path):
    name = path.rsplit('/', 1)[-1]
    return name.startswith('test_') or name.endswith(('_test.py', '_test.go', '.test.js', 'Test.java')) or path.startswith(('tests/', 'test/'))


def generate(spec):
    """Blocking: one model call, then assembly. Raises GenError or model_io.ModelError."""
    text, model = model_io.chat('coding_gen', SYSTEM, build_prompt(spec), timeout=600, max_tokens=model_io.REPOSITORY_TOKENS)
    return assemble(spec, text, model)
