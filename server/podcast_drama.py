"""Ripple After Dark: the daily podcast as an audio drama about one lesson, voiced by a cast.

Each episode teaches one lesson (the one you hold worst that no recent episode covered) through a
story at Ripple, in a format that rotates so episodes don't all run the same way. It is told, not
quizzed: the lesson's ideas are the facts the story must get right, and your past mistakes on
them become characters' wrong theories.

The script can also be written on the host by a Claude Code job run by hand (`deploy/podcast-writer.sh`):
it asks for the brief (`python -m server.podcast_drama brief`) and hands the script back
(`... submit`). `/podcast` (no scheduled job any more) goes to `ensure`, which writes the script
here through LocalRouter (the box's endpoint over Nikhil's Claude subscription, free) and only if that fails
with FALLBACK_MODEL, the one Anthropic model this app calls through OpenRouter (Nikhil's decision, 2026-11-12). Gemini voices it, two speakers to a request so exchanges flow; a clip that comes back
cut short is redone. Script and MP3 live in Firestore (`podcast_episodes`, the audio in
`podcast_audio` chunks) so an episode survives a redeploy. Intent: docs/plans/ambient-learning.md.
"""
import array
import datetime as dt
import hashlib
import json
import logging
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from . import config, llm, voice
from .drip import cards as dcards
from .knowledge_base import api as kb_api, model as kmodel
from .tutor import story

log = logging.getLogger(__name__)

EPISODES, AUDIO = 'podcast_episodes', 'podcast_audio'
FALLBACK_MODEL = 'anthropic/claude-opus-5.5'   # on OpenRouter, paid
LOCAL_MODEL = 'anthropic/claude-opus-5.5'      # on LocalRouter, free
SPEECH_MODEL = 'google/gemini-3.8-flash-tts'
PROMPT_VERSION = 1
RATE = 24000
CHUNK_BYTES = 700_000          # Firestore documents hold at most 1 MiB
FRESH_DAYS = 21                # a lesson gets another episode only after this
CHARS_PER_SEC, MIN_FRACTION = 13.0, 0.6   # a clip under 60% of its expected length was cut off
WORDS = (1100, 2800)

CAST_VOICES = {'NARRATOR': 'Sulafat', 'MARCUS': 'Puck', 'PRIYA': 'Kore', 'JO': 'Leda', 'SAM': 'Laomedeia'}
GUEST_VOICES = ['Charon', 'Achernar', 'Fenrir']
NARRATOR_STYLE = 'A soft, warm, intimate true-crime podcast narrator, unhurried, close to the microphone.'
CAST_STYLE = {'MARCUS': 'A fast, confident startup CTO, punchy and playful.',
              'PRIYA': 'A calm, dry, deadpan site reliability engineer, understated.',
              'JO': 'A keen, chatty junior engineer, honest and easily excited.',
              'SAM': 'An upbeat, people-first product manager who gets anxious under pressure.'}
GUEST_STYLE = 'A natural, believable speaker in an audio drama.'

# Story shapes, so episodes vary. Each is how the whole episode is built, not just its opening.
FORMATS = [
    {'id': 'investigation', 'name': 'The investigation',
     'how': 'A true-crime investigation. Cold open on the incident as the people affected lived it, then the team '
            'works the case: clues in logs and graphs, a confident wrong theory, a reveal, and the fix.'},
    {'id': 'heist', 'name': 'The heist',
     'how': 'Told largely from the other side: someone outside Ripple (a fraudster, a scraper, a rival) spots the '
            'weakness and plans to exploit it. Cut between their plan and the team noticing too late or just in '
            'time. The listener should understand the weakness well enough to see why the plan works.'},
    {'id': 'confession', 'name': 'The confession',
     'how': 'One cast member tells the story of a night they got something wrong, in the first person, to the '
            'narrator, months later. Mostly their voice and the narrator, with short remembered scenes. Intimate, '
            'honest, a little funny, and they explain what they understand now that they did not then.'},
    {'id': 'parallel', 'name': 'The parallel world',
     'how': 'Opens far from software: a restaurant kitchen, a railway signal box, a post office, a hospital ward, '
            'where the same problem plays out with people and paper. Only gradually does the narrator bring it back '
            'to Ripple, where the same thing is happening in code. The analogy must map precisely.'},
    {'id': 'inquiry', 'name': 'The inquiry',
     'how': 'A post-incident review weeks later. Witnesses give their account one by one, each sure of their '
            'version, told with flashbacks. The truth comes out from where the accounts disagree.'},
    {'id': 'countdown', 'name': 'The countdown',
     'how': 'A ticking clock: something will happen at a known time (a launch, a sale, a migration, a deadline set '
            'by a regulator) and the team has hours to understand the problem before it does. Tense and fast.'},
    {'id': 'case-files', 'name': 'The case files',
     'how': 'Told through found material read aloud: voicemails, customer emails, chat messages, an on-call '
            'handover note, a log line read by the narrator. The narrator stitches them together and fills the gaps.'},
]

# Terms text-to-speech gets wrong, written as they are said. Applied to every spoken line as a safety
# net; the prompt asks the writer to spell them out in the first place.
SAY_AS = [
    (r'\bPostgreSQL\b', 'Postgres'), (r'\bNoSQL\b', 'no-sequel'), (r'\bMySQL\b', 'my-sequel'), (r'\bSQL\b', 'sequel'),
    (r'\bJSON\b', 'jason'), (r'\bYAML\b', 'yamel'), (r'\bnginx\b', 'engine X'), (r'\bETags\b', 'E-tags'),
    (r'\bETag\b', 'E-tag'), (r'\bIf-None-Match\b', 'if none match'), (r'\bIf-Match\b', 'if match'),
    (r'\bgRPC\b', 'G R P C'), (r'\bOAuth\b', 'oh-auth'), (r'\bk8s\b', 'Kubernetes'), (r'\bkubectl\b', 'cube control'),
    (r'\bSaaS\b', 'sass'), (r'\bCRDTs\b', 'C R D Ts'), (r'\bCRDT\b', 'C R D T'), (r'\bp50\b', 'P fifty'),
    (r'\bp95\b', 'P ninety-five'), (r'\bp99\b', 'P ninety-nine'),
]
STATUS_WORDS = {'200': 'two hundred', '201': 'two oh one', '202': 'two oh two', '204': 'two oh four',
                '301': 'three oh one', '302': 'three oh two', '304': 'three oh four', '400': 'four hundred',
                '401': 'four oh one', '403': 'four oh three', '404': 'four oh four', '409': 'four oh nine',
                '412': 'four twelve', '422': 'four twenty-two', '429': 'four twenty-nine', '500': 'five hundred',
                '502': 'five oh two', '503': 'five oh three', '504': 'five oh four'}
_CODES = '|'.join(STATUS_WORDS)
# A bare number is only a status code when the words around it say so ("a 412", "409 Conflict").
STATUS_BEFORE = re.compile(r'\b((?i:a|an|http|returns?|returned|returning|got|gets|with|sent|sends?|the|status)) (' + _CODES + r')\b')
STATUS_AFTER = re.compile(r'\b(' + _CODES + r')(?= (?:Precondition|Conflict|Not Found|Too Many|Created|Accepted|'
                          r'Unauthori[sz]ed|Forbidden|error|errors|response|responses|status|back)\b)')
LINE = re.compile(r'^([A-Z][A-Z .\'-]{0,30}?)\s*\(([^)]*)\):\s*(.+)$')
CUE = re.compile(r'^\[(SFX|MUSIC):\s*(.*)\]\s*$', re.I)


# ---- pure: choosing the lesson and the format ---------------------------------------------

def pick_lesson(ranked, episodes, today, fresh_days=FRESH_DAYS):
    """The weakest lesson (from wall.struggles) with no episode in the last `fresh_days`; when every
    struggling lesson had one, the one covered longest ago."""
    if not ranked:
        return None
    last = {}
    for e in episodes:
        if e.get('lesson') and e.get('day'):
            last[e['lesson']] = max(last.get(e['lesson'], ''), e['day'])
    cutoff = (today - dt.timedelta(days=fresh_days)).isoformat()
    for l in ranked:
        if last.get(l['lesson'], '') < cutoff:
            return l
    return min(ranked, key=lambda l: last.get(l['lesson'], ''))


def pick_format(episodes, day):
    """The format used longest ago (never used first), ties broken by the day so it isn't fixed."""
    last = {f['id']: '' for f in FORMATS}
    for e in episodes:
        if e.get('format') in last and e.get('day'):
            last[e['format']] = max(last[e['format']], e['day'])
    salt = int(hashlib.sha256(day.isoformat().encode()).hexdigest(), 16)
    return min(FORMATS, key=lambda f: (last[f['id']], (salt + FORMATS.index(f)) % len(FORMATS)))


def brief(lesson, views, misconceptions, episodes, day):
    """Everything the writer needs for one episode. -> dict (stored with the episode)."""
    by_id = {v['id']: v for v in views}
    mine = [v for v in views if v['lesson'] == lesson['lesson']]
    weak = [p for p in lesson['points'] if p in by_id]
    ideas = weak + [v['id'] for v in mine if v['id'] not in weak and v['status'] != 'unseen'][:max(0, 6 - len(weak))]
    wrong = []
    for m in misconceptions:
        if m.get('point') in ideas and (m.get('text') or m.get('quote')):
            wrong.append({'point': m['point'], 'gap': m.get('text', ''), 'said': m.get('quote', '')[:300]})
    recent = sorted((e for e in episodes if e.get('title')), key=lambda e: e['day'])[-5:]
    return {'day': day.isoformat(), 'lesson': lesson['lesson'], 'title': lesson['title'], 'section': lesson['section'],
            'format': pick_format(episodes, day)['id'],
            'ideas': [by_id[p]['claim'] for p in ideas], 'mistakes': wrong[:4],
            'recent': [{'title': e['title'], 'format': e.get('format'), 'product': e.get('product')} for e in recent]}


def prompt(b, cast=None):
    """The writer's instructions for brief `b`. Plain text: the same prompt goes to Claude Code and the fallback."""
    cast = cast or [voice.persona(c['id']) for c in story.cast()]
    fmt = next(f for f in FORMATS if f['id'] == b['format'])
    ideas = '\n'.join(f'{i}. {c}' for i, c in enumerate(b['ideas'], 1))
    mistakes = '\n'.join(f'- {m["gap"]}' + (f' (in their words: "{m["said"]}")' if m['said'] else '')
                         for m in b['mistakes']) or '- None recorded yet. Invent plausible wrong theories instead.'
    recent = '\n'.join(f'- "{r["title"]}" ({r["format"]}, set in {r["product"] or "unknown"})' for r in b['recent']) \
        or '- None yet.'
    return f"""You are the head writer of "Ripple After Dark", an audio drama that teaches software engineering. Each episode is one gripping story whose mystery or tension can only be understood through one topic. The listener learns by following the story. It is not a quiz: never ask the listener questions to answer, and never read definitions out like a textbook.

## The world
{story.BIBLE['pitch']} The listener is Ripple's lead engineer, addressed as "you" by the narrator.

Recurring cast (use whoever suits the story; not every episode needs all of them):
{chr(10).join('- ' + c for c in cast)}
- Narrator: soft, warm and intimate, like a true-crime podcast host. Unhurried, sets scenes with sensory detail, speaks to "you".
Other characters (customers, attackers, people from other companies) can appear: give each a name in capitals. At most three besides the cast.
Let personalities show in how people think and talk. No recurring habits, props or catchphrases.

## This episode's topic: {b['title']}
By the end, the story must have conveyed every one of these correctly. The reveal and the closing recap must state them accurately:
{ideas}

## What this listener got wrong before
Use these as red herrings: a character confidently holds the wrong belief and the story shows why it is wrong. Never say the listener held it.
{mistakes}

## The shape of this episode: {fmt['name']}
{fmt['how']}
Set it in whichever Ripple product suits the topic best. Recent episodes, so don't repeat their setting, opening or twist:
{recent}

## How to write it
- First line: TITLE: the episode title. Second line: PRODUCT: the Ripple product it is set in (a few words).
- Then the script, one line each, in exactly these forms:
NARRATOR (direction): text
MARCUS (direction): text
[SFX: description]
[MUSIC: description]
- The direction is an acting note for a text-to-speech voice ("hushed, slow", "panicked, talking fast", "deadpan").
- Write for the ear: contractions, interruptions, short sentences. No markdown, no stage directions outside the brackets.
- Write technical terms the way they are said aloud, because the voice reads exactly what you write: "four twelve" or "a four oh nine" for status codes, "E-tag", "if match", "sequel" for SQL, "Jason" for JSON, "engine X" for nginx, "P ninety-nine", letters spaced out for acronyms said as letters ("T T L", "A P I"). Write numbers as words when a voice could misread them.
- British English. No em dashes.
- Sound and music cues: sparse and purposeful.
- 1,600 to 2,000 words. End with a calm closing recap from the narrator that states the ideas plainly, as a friend would.
- Reply with the script only."""


# ---- pure: reading and speaking a script -------------------------------------------------

def parse(text):
    """-> {title, product, items: [(speaker, direction, text) | ('CUE', kind, description)]}, or raises ValueError."""
    title = product = None
    items = []
    for raw in text.splitlines():
        line = raw.strip().strip('*').strip()
        if not line or line.startswith('```'):
            continue
        if line.upper().startswith('TITLE:'):
            title = title or line[6:].strip()
        elif line.upper().startswith('PRODUCT:'):
            product = product or line[8:].strip()
        elif m := CUE.match(line):
            items.append(('CUE', m.group(1).upper(), m.group(2)))
        elif m := LINE.match(line):
            items.append((m.group(1).strip().upper(), m.group(2).strip(), m.group(3).strip()))
    spoken = [i for i in items if i[0] != 'CUE']
    words = sum(len(t.split()) for _, _, t in spoken)
    guests = {s for s, _, _ in spoken} - set(CAST_VOICES)
    if not title:
        raise ValueError('no TITLE line')
    if len(spoken) < 20 or not WORDS[0] <= words <= WORDS[1]:
        raise ValueError(f'{len(spoken)} lines and {words} words is not an episode')
    if 'NARRATOR' not in {s for s, _, _ in spoken}:
        raise ValueError('no narrator')
    if len(guests) > len(GUEST_VOICES):
        raise ValueError(f'too many characters: {sorted(guests)}')
    return {'title': title, 'product': product, 'items': items, 'words': words}


def say_as(text):
    """A line as it should be spoken: terms the voice mispronounces spelt as they sound."""
    for pattern, spoken in SAY_AS:
        text = re.sub(pattern, spoken, text)
    text = STATUS_BEFORE.sub(lambda m: f'{m.group(1)} {STATUS_WORDS[m.group(2)]}', text)
    text = STATUS_AFTER.sub(lambda m: STATUS_WORDS[m.group(1)], text)
    return re.sub(r'\s*[—–]\s*', ', ', text)


def voices(items):
    """Speaker -> Gemini voice: the cast's own, guests from the spare pool in order of appearance."""
    out, spare = dict(CAST_VOICES), list(GUEST_VOICES)
    for s, _, _ in items:
        if s != 'CUE' and s not in out:
            out[s] = spare.pop(0)
    return out


def style(speaker):
    return NARRATOR_STYLE if speaker == 'NARRATOR' else CAST_STYLE.get(speaker, GUEST_STYLE)


def chunks(items):
    """Runs of lines with at most two speakers (the most one request takes), split at every cue."""
    out, cur = [], []
    for it in items:
        if it[0] == 'CUE':
            if cur:
                out.append(cur)
                cur = []
            out.append(it)
            continue
        if len({s for s, _, _ in cur} | {it[0]}) > 2:
            out.append(cur)
            cur = []
        cur.append(it)
    if cur:
        out.append(cur)
    return out


def request(chunk, cast):
    """The speech request for one run: one voice, or the two-speaker turn form."""
    speakers = {s for s, _, _ in chunk}
    if len(speakers) == 1:
        s = chunk[0][0]
        return {'voice': cast[s], 'input': ' '.join(say_as(t) for _, _, t in chunk),
                'instructions': f'{style(s)} Delivery: ' + '; then '.join(h for _, h, _ in chunk) + '.'}
    return {'input': [{'text': say_as(t), 'voice': cast[s], 'instructions': f'{style(s)} For this line: {h}.'}
                      for s, h, t in chunk]}


def cut_off(chunk, seconds):
    chars = sum(len(t) for _, _, t in chunk)
    return seconds < MIN_FRACTION * chars / CHARS_PER_SEC


def silence(seconds):
    return array.array('h', bytes(2 * int(RATE * seconds)))


def resample(a, src):
    if src == RATE:
        return a
    n = int(len(a) * RATE / src)
    return array.array('h', (a[min(int(i * src / RATE), len(a) - 1)] for i in range(n)))


# ---- making it ---------------------------------------------------------------------------

def _store():
    return kb_api.get_store(config.DEV_UID if config.local_mode() else config.ACCESS_UID)


def today(store, now=None):
    return dt.datetime.fromtimestamp(now or time.time(), dcards.tz_for(store.get_settings())).date()


def episodes(store):
    return [{k: v for k, v in e.items() if k != 'script'} for e in store.list_knowledge(EPISODES)]


def make_brief(store, day, now=None):
    from . import wall
    now = now or time.time()
    c, _, states, seen, mis = kb_api.evidence(store, now)
    views = kmodel.views(c, states, seen, mis, now)
    past = [e for e in episodes(store) if e.get('day') != day.isoformat()]
    lesson = pick_lesson(wall.struggles(views, n=12, per=6), past, day)
    return brief(lesson, views, mis, past, day) if lesson else None


def _speak(chunk, cast):
    for attempt in range(5):
        try:
            rate, pcm = llm._raw_speech(SPEECH_MODEL, **request(chunk, cast))
            a = resample(array.array('h', pcm), rate)
            if not cut_off(chunk, len(a) / RATE):
                return a
            log.info('Podcast clip cut off (%.1fs), redoing', len(a) / RATE)
        except Exception:
            if attempt == 4:
                raise
            log.warning('Podcast speech failed, retrying', exc_info=True)
        time.sleep(2 ** (attempt + 1))
    raise RuntimeError('a clip kept coming back cut off')


def render(items):
    """-> MP3 bytes for a parsed script. Cues are short pauses (no sound library yet)."""
    import lameenc
    cast = voices(items)
    parts = chunks(items)
    spoken = [(i, c) for i, c in enumerate(parts) if isinstance(c, list)]
    with ThreadPoolExecutor(4) as pool:
        audio = dict(zip([i for i, _ in spoken], pool.map(lambda ic: _speak(ic[1], cast), spoken)))
    pcm = array.array('h')
    for i, c in enumerate(parts):
        if isinstance(c, list):
            pcm.extend(audio[i])
            pcm.extend(silence(0.4))
        else:
            pcm.extend(silence(1.6 if c[1] == 'MUSIC' else 1.0))
    pcm = array.array('h', (int(x * 0.85) for x in pcm))   # Gemini peaks at full scale
    enc = lameenc.Encoder()
    enc.set_bit_rate(48)
    enc.set_in_sample_rate(RATE)
    enc.set_channels(1)
    enc.set_quality(2)
    return bytes(enc.encode(pcm.tobytes()) + enc.flush())


def save_audio(store, day, mp3):
    n = 0
    for n, at in enumerate(range(0, len(mp3), CHUNK_BYTES), 1):
        store.put_knowledge(AUDIO, f'{day}-{n}', {'day': day, 'data': mp3[at:at + CHUNK_BYTES]})
    return n


def load_audio(store, ep):
    parts = [store.get_knowledge(AUDIO, f'{ep["day"]}-{n}') for n in range(1, ep.get('chunks', 0) + 1)]
    if not parts or any(p is None for p in parts):
        return None
    return b''.join(bytes(p['data']) for p in parts)


def accept(store, b, text, writer):
    """Check a written script and voice it. -> the stored episode, or raises ValueError for a bad script."""
    script = parse(text)
    ep = {'day': b['day'], 'brief': b, 'lesson': b['lesson'], 'format': b['format'], 'status': 'written',
          'writer': writer, 'script': text, 'title': script['title'], 'product': script['product'],
          'words': script['words'], 'prompt_version': PROMPT_VERSION, 'written_at': time.time()}
    store.put_knowledge(EPISODES, b['day'], ep)
    mp3 = render(script['items'])
    ep.update(status='ready', chunks=save_audio(store, b['day'], mp3), bytes=len(mp3), voiced_at=time.time())
    store.put_knowledge(EPISODES, b['day'], ep)
    return ep


def write_fallback(b):
    """The script from the app's own writer -> (text, writer name). LocalRouter first (Nikhil's Claude subscription,
    free); only if that is down or out of quota, FALLBACK_MODEL on OpenRouter (~$0.20)."""
    messages = [{'role': 'user', 'content': prompt(b)}]
    if config.LOCALROUTER_URL:
        try:
            return llm._raw_local_chat(LOCAL_MODEL, messages)['content'], f'localrouter:{LOCAL_MODEL}'
        except Exception:
            log.warning('LocalRouter could not write the episode; trying OpenRouter', exc_info=True)
    r = llm._raw_chat(FALLBACK_MODEL, messages, options={'max_tokens': 9000, 'timeout': 420, 'allow_anthropic': 'podcast fallback'})
    return r['content'], f'openrouter:{FALLBACK_MODEL}'


def ensure(store, day=None, now=None):
    """Today's episode -> (MP3 bytes, episode), writing the script with the fallback model if the host job
    didn't. None when there is nothing to make an episode about. Raises when making it fails."""
    day = day or today(store, now)
    ep = store.get_knowledge(EPISODES, day.isoformat()) or {}
    if ep.get('status') == 'ready':
        mp3 = load_audio(store, ep)
        if mp3:
            return mp3, ep
    if ep.get('script'):   # written, but the voicing failed or the audio went missing
        ep = accept(store, ep['brief'], ep['script'], ep['writer'])
    else:
        b = ep.get('brief') or make_brief(store, day, now)
        if not b:
            return None
        ep = accept(store, b, *write_fallback(b))
    return load_audio(store, ep), ep


def title_for(store, day):
    ep = store.get_knowledge(EPISODES, day.isoformat() if hasattr(day, 'isoformat') else day)
    return ep.get('title') if ep and ep.get('status') == 'ready' else None


# ---- the host job's side: python -m server.podcast_drama brief | submit | ensure --------------

def main(argv):
    store = _store()
    cmd = argv[0] if argv else ''
    day = dt.date.fromisoformat(argv[argv.index('--day') + 1]) if '--day' in argv else today(store)
    if cmd == 'brief':
        ep = store.get_knowledge(EPISODES, day.isoformat())
        if ep and ep.get('status') in ('written', 'ready'):
            print(json.dumps({'status': 'done', 'day': day.isoformat(), 'title': ep.get('title')}))
            return 0
        b = make_brief(store, day)
        if not b:
            print(json.dumps({'status': 'nothing', 'day': day.isoformat()}))
            return 0
        store.put_knowledge(EPISODES, day.isoformat(), {'day': day.isoformat(), 'status': 'briefed', 'brief': b})
        print(json.dumps({'status': 'needed', 'day': day.isoformat(), 'prompt': prompt(b)}))
        return 0
    if cmd == 'submit':
        writer = argv[argv.index('--writer') + 1] if '--writer' in argv else 'claude-code'
        ep = store.get_knowledge(EPISODES, day.isoformat()) or {}
        b = ep.get('brief')
        if not b:
            print('no brief for that day; run brief first', file=sys.stderr)
            return 2
        try:
            ep = accept(store, b, sys.stdin.read(), writer)
        except ValueError as e:
            print(f'script rejected: {e}', file=sys.stderr)
            return 3
        print(json.dumps({'status': 'ready', 'title': ep['title'], 'words': ep['words'], 'bytes': ep['bytes']}))
        return 0
    if cmd == 'ensure':
        r = ensure(store, day)
        print(json.dumps({'status': 'ready', 'title': r[1]['title'], 'writer': r[1]['writer']} if r else {'status': 'nothing'}))
        return 0
    print('usage: python -m server.podcast_drama brief|submit|ensure [--day YYYY-MM-DD] [--writer NAME]', file=sys.stderr)
    return 2


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    sys.exit(main(sys.argv[1:]))
