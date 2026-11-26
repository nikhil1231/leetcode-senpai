"""Writing a concurrency question: a spec in (level, topic, what to avoid), a complete question out, not yet validated.

The model replies in a delimited format, since Java does not survive JSON string escaping well:

    <<<META>>> {json} <<<END>>>
    <<<STATEMENT>>> the statement, as HTML <<<END>>>
    <<<STARTER>>> the class as the learner first sees it <<<END>>>
    <<<SOLUTION>>> the reference solution <<<END>>>
    <<<VISIBLE>>> public class VisibleTest <<<END>>>
    <<<HIDDEN>>> public class HiddenTest <<<END>>>
    <<<BROKEN 1>>> a plausible wrong solution, the whole class <<<END>>>   (two to four of these)

A question that fails validation gets one repair round: the model sees what failed and replies with the whole question
again (`repair`)."""
import html
import json
from html.parser import HTMLParser
import re
import secrets
import time

from ..coding import model_io
from . import judge, spec as S

AREA = 'concurrency_gen'
HEADER = re.compile(r'^<<<(META|STATEMENT|STARTER|SOLUTION|VISIBLE|HIDDEN|BROKEN)(?:[ \t]+(\d+))?[ \t]*>>>[ \t]*$')
END = re.compile(r'^<<<END>>>[ \t]*$')
MAX_CODE = 24_000
TOOL_WORDS = re.compile(r'(//|/\*|\*)[^\n]*\b(semaphore|latch|barrier|condition|reentrant|stampedlock|readwritelock|'
                        r'atomic|cas|compareandset|notifyall|wait\(\)|volatile|synchronized|phaser|executor|completablefuture|'
                        r'hint|use a|you should|the trick)\b', re.I)

SYSTEM = (
    "You write Java concurrency interview questions in the style of LeetCode's concurrency problems, for an engineer "
    "practising for interviews. Each question is new: invent the scenario, the class and its methods, and never copy a "
    "LeetCode problem or a textbook example. The statement is precise enough that every hidden test is fair, the tests are "
    "deterministic for any correct solution whatever the scheduling, and the broken solutions are the mistakes a capable "
    "engineer actually makes. Plain, specific British English in the statement, no em dashes. Reply in exactly the "
    "delimited format requested and nothing else."
)

HARNESS_DOC = (
    "Tests run on Java 21 with the standard library only, in the default package (no package line anywhere). They are "
    "two classes, `public class VisibleTest` and `public class HiddenTest`, each with `public static void testDescriptiveName()` "
    "methods (they may declare `throws Exception`) that fail by throwing AssertionError (`assert` is enabled, or "
    "`throw new AssertionError(message)`). Every test is run 20 times in a row, each run with a fresh instance and a "
    "timeout of TIMEOUT ms, so keep each run under about 150 ms and never let a correct solution come near the timeout. A run "
    "that times out is reported as a deadlock with a thread dump. A helper class `Conc` is available to tests:\n"
    "- `Conc.runAll(long timeoutMs, Runnable... tasks)`: runs each task on its own thread, all released together, waits for "
    "all of them and rethrows the first failure; if any is still running after timeoutMs it fails the test with a thread dump.\n"
    "- `Conc.parallel(int n, long timeoutMs, IntConsumer task)`: the same for task(0) .. task(n-1).\n"
    "- `Conc.jitter()`: a tiny random pause; call it inside workers between steps so races show up.\n"
    "- `new Conc.Gauge()` with `enter()`, `exit()`, `current()` and `max()`: counts how many threads are inside a section at once.\n"
    "- `Conc.metric(String name, long value)`: records a number for the reviewer (the largest per name is kept), for "
    "example the most readers seen inside at once or how long a timed-out call took.\n"
    "Lambdas cannot throw checked exceptions, so wrap calls that throw InterruptedException. A test may use short sleeps "
    "(a few milliseconds) to let a thread reach a blocking call before checking it is blocked, with generous margins. "
    "Never assert an exact timing that a correct solution could miss on a busy machine: allow at least 5 times the margin "
    "(a 50 ms tryLock timeout may take up to 500 ms to return). Failure messages say what was observed and what was "
    "expected, without naming the fix."
)


def build_prompt(spec):
    lv = S.LEVELS[spec['level']]
    below = sorted({t for n in range(1, spec['level']) for t in S.LEVELS[n]['tools']})
    topic = S.TOPIC_BY_KEY[spec['topic']]
    parts = [
        f"Write one concurrency question at level {spec['level']} of 5 ({lv['label']}).",
        f"Topic: {topic['label']}.",
        f"At this level the intended solution needs one or more of: {', '.join(lv['tools'])}. Typical shape: {lv['shape']}. "
        f"The hidden tests check {lv['tests']}.",
        (f"Tools from earlier levels may appear alongside: {', '.join(below)}. " if below else '')
        + "Design the requirements so that the level's tools are the natural way to meet them, without naming any tool or "
          "primitive in the statement (unless the method signatures themselves need a type, such as a Runnable callback).",
    ]
    if spec.get('focus_tool'):
        parts.append(f"The learner has struggled with {spec['focus_tool']}: make it the natural tool for this question.")
    if spec['level'] >= 3:
        parts.append("One broken solution uses a weaker tool than this level needs, and look reasonable doing it (for "
                     "example a single synchronized lock where parallelism or a timeout is required, or a busy loop where "
                     "a thread should wait), and a hidden test must fail it on a requirement the statement states. Mark it "
                     "\"weaker_tool\": true.")
    if spec.get('avoid_titles'):
        parts.append('Do not repeat these recent questions or their scenarios: ' + '; '.join(spec['avoid_titles']) + '.')
    if spec.get('discarded'):
        parts.append('The learner discarded recent questions for these reasons; avoid the same problems: '
                     + '; '.join(spec['discarded']) + '.')
    parts += [
        "",
        "The class: one public class whose name is given in META \"class_name\" (not Solution, Conc, VisibleTest or "
        "HiddenTest), in a file of its own with any imports it needs. Nested helper classes are fine. Its methods are called "
        "from several threads, like LeetCode's concurrency problems (callbacks such as `void first(Runnable printFirst)` are "
        "fine) or a 'design a thread-safe X' class.",
        "STARTER: the class with its public constructor and method signatures and trivial bodies (return 0, null or false), "
        "compiling, with no comments that hint at the approach.",
        "SOLUTION: a clean, idiomatic reference solution an interviewer would be glad to see.",
        "VISIBLE: 2 or 3 tests that mirror the statement's examples. HIDDEN: 5 to 9 tests covering edge cases (capacity "
        "one, zero waiting threads, many threads), stress with 8 to 32 threads using Conc.jitter(), ordering or safety "
        "invariants checked on every run, and the level's demands. A correct solution passes every run; an incorrect one "
        "should fail on most runs, not once in a thousand.",
        "BROKEN 1 .. BROKEN n: 2 to 4 complete, compiling versions of the class, each with one realistic mistake (for "
        "example: no synchronisation, `if` instead of `while` around a wait, notify where notifyAll is needed, a missed "
        "signal, sleeping to force an order, a lock order that can deadlock, checking then acting without holding the lock, "
        "swallowing an interrupt, one coarse lock where parallelism is required). Each must fail at least one hidden test on "
        "every 20-run submission.",
        "",
        HARNESS_DOC.replace('TIMEOUT', str(spec.get('timeout_ms', 2000))),
        "",
        "STATEMENT: the statement as "
        "HTML using only <p>, <pre>, <code>, <strong>, <em>, <ul>, <ol>, <li>: what the class is for and how its methods are "
        "called, then <p><strong>Example 1:</strong></p> and <p><strong>Example 2:</strong></p> with <pre> blocks showing "
        "the calls from each thread and what is allowed to happen, then <p><strong>Constraints:</strong></p> as a list. It "
        "states every behaviour a hidden test checks: blocking, timeouts and what a timed-out call returns, interrupts, "
        "ordering, fairness, limits.",
        "",
        "META json keys (one line each, no line breaks inside strings): \"title\" (a few words, not naming the tool), "
        "\"class_name\", \"primary_tool\" (the one tool from this level the solution centres on, as named "
        "above), \"tools\" (every tool the solution uses, as named above), \"key_ideas\" (3 to 5 short phrases: the crux, "
        "for the reviewer), \"hints\" (exactly 3: a nudge about the requirement that matters, a stronger nudge, a near "
        "giveaway; none naming a class from java.util.concurrent until the third), \"broken\" (one object per BROKEN block: "
        "{\"n\": 1, \"kind\": \"a few words\", \"description\": \"what is wrong and which test catches it\", "
        "\"weaker_tool\": true or false}), \"timeout_ms\" (per run, 1000 to 4000).",
        "",
        "Output format: the META block first, then STATEMENT, STARTER, SOLUTION, VISIBLE, HIDDEN and the BROKEN blocks, each ending "
        "with <<<END>>>, for example\n<<<META>>>\n{...}\n<<<END>>>\n<<<STATEMENT>>>\n<p>...</p>\n<<<END>>>\n<<<STARTER>>>\nimport java.util.*;\npublic class ...\n"
        "<<<END>>>\n<<<BROKEN 1>>>\n...\n<<<END>>>",
    ]
    return '\n'.join(parts)


class GenError(ValueError):
    pass


def parse(text):
    """-> (meta, {kind: code}, {n: code}). A block ends at <<<END>>> or at the next header."""
    meta, blocks, broken = None, {}, {}
    kind, num, body = None, None, []

    def close():
        nonlocal meta
        if kind == 'META':
            meta = _meta('\n'.join(body))
        elif kind == 'BROKEN':
            broken[int(num or len(broken) + 1)] = _code('\n'.join(body))
        elif kind:
            blocks[kind] = _code('\n'.join(body))
    for line in (text or '').replace('\r\n', '\n').split('\n'):
        h = HEADER.match(line)
        if h or END.match(line):
            close()
            kind, num, body = (h.group(1), h.group(2), []) if h else (None, None, [])
        elif kind:
            body.append(line)
    close()
    if meta is None:
        raise GenError('no META block')
    return meta, blocks, broken


def _meta(text):
    try:
        return model_io.extract_json(text)
    except model_io.ModelError as e:
        start, end = text.find('{'), text.rfind('}')
        try:   # raw newlines inside strings are the usual slip
            return json.loads(text[start:end + 1], strict=False)
        except ValueError:
            raise GenError(f'META: {e}') from e


def _code(text):
    text = re.sub(r'^\s*```(?:java)?\s*\n|\n\s*```\s*$', '', text.strip('\n'))
    return text.strip('\n') + '\n'


# ---- the statement's HTML: an allow-list, since it is shown with dangerouslySetInnerHTML ---------------------------
ALLOWED = {'p', 'pre', 'code', 'strong', 'em', 'ul', 'ol', 'li', 'b', 'i', 'br', 'sup', 'sub'}


class _Clean(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []

    def handle_starttag(self, tag, attrs):
        if tag in ALLOWED:
            self.out.append(f'<{tag}>')

    def handle_endtag(self, tag):
        if tag in ALLOWED and tag != 'br':
            self.out.append(f'</{tag}>')

    def handle_data(self, data):
        self.out.append(html.escape(data, quote=False))


def clean_html(text):
    p = _Clean()
    p.feed(text or '')
    p.close()
    return ''.join(p.out).strip()


def _class_named(code, name):
    return re.search(rf'\bpublic\s+(?:final\s+)?class\s+{re.escape(name)}\b', code or '')


def assemble(spec, text, model):
    """The stored question from the model's reply; raises GenError when it is incomplete or malformed."""
    meta, blocks, broken = parse(text)
    name = str(meta.get('class_name') or '').strip()
    if not re.fullmatch(r'[A-Z][A-Za-z0-9]{1,40}', name) or name in judge.RESERVED or name == 'Solution':
        raise GenError(f'bad class name {name!r}')
    for kind in ('STARTER', 'SOLUTION', 'VISIBLE', 'HIDDEN'):
        code = blocks.get(kind)
        if not code or len(code) > MAX_CODE:
            raise GenError(f'{kind} is missing or too long')
        if re.search(r'^\s*package\s', code, re.M):
            raise GenError(f'{kind} declares a package')
    for kind in ('STARTER', 'SOLUTION'):
        if not _class_named(blocks[kind], name):
            raise GenError(f'{kind} does not declare public class {name}')
    if not _class_named(blocks['VISIBLE'], 'VisibleTest') or not _class_named(blocks['HIDDEN'], 'HiddenTest'):
        raise GenError('tests must be public classes VisibleTest and HiddenTest')
    if TOOL_WORDS.search(blocks['STARTER']):
        raise GenError('the starter code comments on the approach')
    described = {int(b.get('n') or i + 1): b for i, b in enumerate(meta.get('broken') or []) if isinstance(b, dict)}
    if not 2 <= len(broken) <= 4:
        raise GenError(f'{len(broken)} broken solutions (need 2 to 4)')
    wrongs = []
    for n, code in sorted(broken.items()):
        if not _class_named(code, name) or len(code) > MAX_CODE:
            raise GenError(f'broken solution {n} does not declare public class {name}')
        d = described.get(n, {})
        wrongs.append({'n': n, 'kind': str(d.get('kind') or 'mistake')[:60], 'description': str(d.get('description') or '')[:400],
                       'weaker_tool': bool(d.get('weaker_tool')), 'code': code})
    if 'STATEMENT' in blocks and not blocks['STATEMENT'].lstrip().startswith('<'):
        raise GenError('the STATEMENT block is not HTML')
    statement = clean_html(blocks.get('STATEMENT') or str(meta.get('statement_html') or ''))
    hints = [str(h).strip() for h in meta.get('hints') or [] if str(h).strip()][:3]
    ideas = [str(k).strip() for k in meta.get('key_ideas') or [] if str(k).strip()][:5]
    if len(statement) < 200 or len(hints) < 2 or not ideas:
        raise GenError('missing statement, hints or key ideas')
    tools = [str(t)[:60] for t in meta.get('tools') or []][:6]
    try:
        timeout = int(meta.get('timeout_ms') or 2000)
    except (TypeError, ValueError):
        timeout = 2000
    return {
        'kind': 'question', 'id': 'cq_' + secrets.token_hex(8), 'status': 'draft',
        'level': spec['level'], 'topic': spec['topic'], 'focus_tool': spec.get('focus_tool'),
        'title': str(meta.get('title') or 'Untitled')[:80], 'class_name': name, 'statement_html': statement[:12000],
        'primary_tool': str(meta.get('primary_tool') or (tools[0] if tools else ''))[:60], 'tools': tools,
        'key_ideas': ideas, 'hints': hints, 'timeout_ms': max(1000, min(4000, timeout)),
        'starter': blocks['STARTER'], 'solution': blocks['SOLUTION'],
        'visible_tests': blocks['VISIBLE'], 'hidden_tests': blocks['HIDDEN'], 'broken': wrongs,
        'created_at': time.time(), 'model': model, 'validation': {},
    }


def generate(spec):
    """Blocking: one model call, then assembly. -> (question, conversation for a repair)."""
    messages = [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': build_prompt(spec)}]
    text, model = model_io.complete(AREA, messages, timeout=900, max_tokens=model_io.REPOSITORY_TOKENS)
    return assemble(spec, text, model), messages + [{'role': 'assistant', 'content': text}]


def repair(spec, messages, problems):
    """Blocking: the model sees what validation found and replies with the whole question again."""
    ask = ("Checking your question by compiling and running it found these problems:\n- " + '\n- '.join(problems)
           + "\n\nFix them and reply with the complete question again in the same format (META, STATEMENT, STARTER, SOLUTION, VISIBLE, "
             "HIDDEN and every BROKEN block). Keep what was right. If a broken solution passes every test, either make a "
             "hidden test catch its mistake (when the statement requires that behaviour) or replace it with a mistake the "
             "tests do catch.")
    messages = messages + [{'role': 'user', 'content': ask}]
    text, model = model_io.complete(AREA, messages, timeout=900, max_tokens=model_io.REPOSITORY_TOKENS)
    return assemble(spec, text, model), messages + [{'role': 'assistant', 'content': text}]
