"""Wallpaper posters: an infographic of a lesson you hold badly, drawn by an image model and
checked by a second model before it goes up on the wall (server/wall.py picks which is up).

Made in the background on a cadence (`run`: a new poster at most every WALL_EVERY_HOURS and
WALL_PER_DAY a day, for the weakest lesson without a fresh one), never on a phone's request.
A poster is made in three steps: the text model condenses the lesson's claims (the source of
truth) into the poster's few words, the image model draws them, and the text model reviews the
picture against the claims and the words for spelling, facts, sensible diagrams and legibility.
A failed try goes back to the image model as an edit with the reviewer's notes, up to ATTEMPTS.
Posters are derived: kept in Firestore (wall_posters, the JPEG in wall_images) and stamped with
PROMPT_VERSION; posters of the KEPT versions still count as current, so a new prompt applies to new
posters without remaking the old ones. Without a model nothing is made and the wall shows its plain card. Pure: copy_prompt, image_prompt, fix_prompt, review_prompt, passed, due. I/O: the rest.
"""
import asyncio
import io
import json
import logging
import time
import uuid
from typing import Literal

from pydantic import BaseModel, Field

from . import config, llm, wall
from .knowledge_base import api as kb_api, model as kmodel

log = logging.getLogger(__name__)
POSTERS, IMAGES = 'wall_posters', 'wall_images'
PROMPT_VERSION = 'wall-7'   # wall-7: glanceable copy (a takeaway, a detail, a big figure), text colour per panel
KEPT = ('wall-4', 'wall-5', 'wall-6', PROMPT_VERSION)
# The panels' colours, in order (a bright modern infographic: warm to cool on a light background), each
# with the text colour that reads on it.
PALETTE = (('tangerine', '#FFA41B', 'charcoal'), ('vermilion', '#FF5A1F', 'white'), ('raspberry pink', '#F2316F', 'white'),
           ('sky cyan', '#1FB5F2', 'charcoal'), ('periwinkle violet', '#8C7BF2', 'white'),
           ('emerald teal', '#14C79A', 'charcoal'), ('lime green', '#8EE66B', 'charcoal'))
ATTEMPTS = 3
WIDTH = 1179            # stored width: an iPhone's; wall.fit_image fits other screens
MAX_BYTES = 900_000     # a Firestore document holds 1 MiB
CHECK_EVERY = 30 * 60
ASPECT = '9:16'          # the image model's tallest usable shape (it refuses 9:21; 1:4 is far too narrow)


class Panel(BaseModel):
    takeaway: str = Field(description="the idea itself as one plain statement, at most 8 words, that teaches on its own "
                                      "at a glance; not a topic label like 'Measure availability'")
    figure: str = Field(description="the one number worth remembering, at most 6 characters (like '63%' or '3x'), "
                                    "or '' when the claim has none")
    figure_label: str = Field(description="what the figure means, at most 6 words (like 'slow at 100 calls'); '' with no figure")
    detail: str = Field(description="plain words, at most 12, adding the conditions and facts the takeaway leaves out; "
                                    "no formulas, symbols or slashes")
    visual: str = Field(description="one simple icon for the idea, described by its shape so it cannot be misread: "
                                    "'two padlocks', 'a stack of boxes overflowing', not a programming term like 'map' "
                                    "or 'queue'; no text, numbers or letters in it; at most 6 words")


class PosterCopy(BaseModel):
    headline: str = Field(description="the lesson's topic, at most four words, shown small")
    panels: list[Panel]


class PosterReview(BaseModel):
    text_correct: bool = Field(description="every word on the poster is spelled correctly; no garbled, repeated, invented or half-formed text")
    facts_correct: bool = Field(description="nothing the poster states is wrong or misleading against the ideas given; leaving a detail out is fine")
    all_ideas_present: bool = Field(description="every panel asked for appears, with its takeaway; a panel may leave out details of its claim")
    diagrams_make_sense: bool = Field(description="every icon and diagram illustrates its idea correctly; no nonsense labels, arrows or pairings")
    legible: bool = Field(description="all text is large and contrasted enough to read on a phone lock screen")
    tasteful: bool = Field(description="looks professionally designed: bright but coherent colours, clean typography, consistent icons; nothing cluttered, glossy or clip-art")
    score: int = Field(description="1 unusable … 10 a poster you would gladly look at every day: clear, refined, correct")
    issues: list[str] = Field(description="each problem found, naming exactly where it is and what to change; empty when there are none")
    verdict: Literal["pass", "redraw"]


COPY_SYSTEM = ("You write the words for a study poster that becomes a phone lock screen. It is read in a two-second "
               "glance, so each panel's takeaway must carry the idea by itself, in plain everyday words; the detail "
               "is read only on a longer look. Prefer the memorable consequence over the definition. Write numbers "
               "in words a person would say (\"63% at 100 calls\", not \"N=100: 63%\"); keep the engineer's own terms "
               "(p99, not \"ninety-ninth percentile\"). A takeaway is a complete, natural sentence a senior engineer "
               "would say, often advice (\"Count failed requests, not uptime pings\"). Numbers always as digits, with % for percentages. Never add a fact the claims "
               "do not state, and never contradict one.")


def copy_prompt(b):
    ideas = []
    for i, idea in enumerate(b['ideas'], 1):
        ideas.append(f"{i}. {idea['claim']}")
        if idea.get('pitfall'):
            ideas.append(f"   (The learner once got this wrong: {idea['pitfall']} Make the right idea unmistakable, "
                         "without mentioning the learner.)")
    return (f"Lesson: {b['title']}\nOne panel per claim, in this order:\n" + '\n'.join(ideas) +
            "\n\nWrite the headline and the panels.")


def image_prompt(b, copy):
    def panel(i, p):
        name, hex_, ink = PALETTE[(i - 1) % len(PALETTE)]
        mark = (f'Big figure: "{p["figure"]}" with the small label "{p["figure_label"]}" under it.' if p.get('figure')
                else f'Icon: {p["visual"]}.')
        return f'Panel {i} ({name} {hex_}, {ink} text). Takeaway: "{p["takeaway"]}". Detail: "{p["detail"]}". {mark}'
    panels = '\n'.join(panel(i, p) for i, p in enumerate(copy['panels'], 1))
    return f"""Design a vertical 9:16 infographic poster: the phone lock screen wallpaper of a software engineer revising for interviews.
Topic label: "{copy['headline']}"
{panels}
Write exactly the quoted text above and nothing else: no extra captions, footnotes or labels, no colour names or codes, and no text inside the icons. Every word spelled exactly as given.
Style: a bright, modern flat infographic, the quality of a design studio's print. A light off-white background (#F7F7F9). Each panel is a solid block of its own vivid colour given above, exactly that colour, with all its text in the text colour given (white, or dark charcoal #22232B); the panels run warm to cool down the poster like a spectrum. Hierarchy, so the poster teaches in a two-second glance: in each panel the takeaway is the biggest, boldest text on the whole poster; the detail is a smaller medium-weight line under it; a big figure, when given, sits at the panel's right side as a very large bold number with its small label beneath, in place of an icon. Otherwise the panel's icon is a clean line icon in the panel's colour inside a white circle at its right, all icons in the same style (no diagrams, flows, arrows or code). The topic label is small, uppercase and letter-spaced in dark charcoal (#22232B) at the very top, with a short thin rule in the first panel's colour. One clean geometric sans-serif typeface. A strong grid: the panels fill the poster's height, aligned and evenly spaced.
Avoid: glossy, 3D, bevels or heavy drop shadows, stickers, badges, emoji, confetti, starbursts, ribbons and decorative clutter.
Use the whole canvas from the very top edge to the bottom: there is no area to keep clear. All text large enough to read on a phone lock screen.
The background must run seamlessly to every edge: no border, frame or band. Margins of 5% on the sides. No watermark, signature, logos or fake phone UI."""


def fix_prompt(issues):
    return ("Edit this poster. Fix only these problems and keep everything else exactly as it is: same layout, "
            "colours, illustrations and all other text. Never write these notes onto the poster.\n" +
            '\n'.join(f'- {x}' for x in issues))


REVIEW_SYSTEM = ("You review generated study posters before they become someone's phone lock screen, read in a "
                 "two-second glance. By design each panel shows one big takeaway and a short detail line, so it "
                 "deliberately leaves out parts of the full claim (formulas, secondary numbers, caveats): never ask "
                 "for them back, and never ask for more text. Be strict about what is shown: a misspelled, repeated "
                 "or garbled word, a wrong or misleading statement, a missing panel, an icon that does not fit, or "
                 "text too small to read on a phone each means verdict 'redraw'. A panel with a big figure shows it "
                 "in place of an icon. Bright colours are wanted, but a cluttered, glossy or clip-art look scores 6 "
                 "or less, and so does a poster whose takeaways are not its most prominent text.")


def review_prompt(b, copy):
    ideas = '\n'.join(f"{i}. {idea['claim']}" for i, idea in enumerate(b['ideas'], 1))
    shown = copy and {**copy, 'panels': [{k: v for k, v in p.items() if v and not (k == 'visual' and p.get('figure'))}
                                         for p in copy['panels']]}
    words = json.dumps(shown, ensure_ascii=False) if shown else '(none given)'
    return (f"Poster topic: {b['title']}\nThe full ideas behind it (the poster shortens them):\n{ideas}\n\n"
            f"The text it was asked to show, word for word: {words}\n\nReview the attached poster.")


def passed(r):
    """Spelling, facts, every idea and sensible diagrams are musts; legibility and taste are musts
    too unless the reviewer still scores it 8+ (a small caption is no reason to redraw)."""
    musts = ('text_correct', 'facts_correct', 'all_ideas_present', 'diagrams_make_sense')
    return all(r[k] for k in musts) and (r['score'] >= 8 or (
        r['verdict'] == 'pass' and r['score'] >= 7 and r['legible'] and r.get('tasteful', True)))


def _jpeg(data):
    """The model's picture at the stored width, as a JPEG small enough for one document."""
    from PIL import Image
    img = Image.open(io.BytesIO(data)).convert('RGB')
    img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
    for q in (90, 85, 80, 72, 65):
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=q, optimize=True)
        if buf.tell() <= MAX_BYTES:
            break
    return buf.getvalue()


def _state(store, now):
    c, _, states, seen, mis = kb_api.evidence(store, now)
    views = kmodel.views(c, states, seen, mis, now)
    return views, mis, wall.struggles(views)


def _copy(b):
    """The poster's words, or the claims themselves when the text model fails."""
    try:
        raw = llm._raw_generate('openrouter', config.WALL_REVIEW_MODEL, COPY_SYSTEM, copy_prompt(b), PosterCopy)
        copy = PosterCopy.model_validate(json.loads(raw)).model_dump()
        if len(copy['panels']) == len(b['ideas']):
            return copy
    except Exception:
        log.warning('Wall poster copy for %s failed', b['lesson'], exc_info=True)
    return {'headline': b['title'], 'panels': [{'takeaway': idea['claim'], 'figure': '', 'figure_label': '', 'detail': '',
                                                'visual': 'a simple icon'} for idea in b['ideas']]}


def make(store, now, lesson=None, force=False, pin=False):
    """Write, draw, review and keep one poster: for `lesson`, else the weakest lesson needing one
    (with `force`, else the lesson whose poster is oldest). `pin`: asked for by hand, so it goes up
    now if it passes (wall.current).
    -> the kept poster (passing, or the best failed try, which never goes up), or None."""
    views, mis, ranked = _state(store, now)
    library = store.list_knowledge(POSTERS)
    target = next((l for l in ranked if l['lesson'] == lesson), None) if lesson else \
        wall.to_make(ranked, library, now, KEPT) or (wall.stalest(ranked, library) if force else None)
    if not target:
        return None
    b = wall.brief(target, views, mis)
    copy = _copy(b)
    best, last, spent = None, None, 0.0
    for attempt in range(1, ATTEMPTS + 1):
        try:
            if last:
                pic = llm._raw_image(config.WALL_IMAGE_MODEL, fix_prompt(last[1]['issues'] or ['Redraw it more carefully.']),
                                     ASPECT, edit=(last[0], 'image/jpeg'))
            else:
                pic = llm._raw_image(config.WALL_IMAGE_MODEL, image_prompt(b, copy), ASPECT)
            spent += float(pic['usage'].get('cost') or 0)
            data = _jpeg(pic['image'])
            review = llm._raw_look(config.WALL_REVIEW_MODEL, REVIEW_SYSTEM, review_prompt(b, copy), data, 'image/jpeg',
                                   PosterReview)
        except Exception:
            log.warning('Wall poster try %s for %s failed', attempt, b['lesson'], exc_info=True)
            continue
        ok = passed(review)
        log.info('Wall poster try %s for %s: %s (%s/10) %s', attempt, b['lesson'], 'pass' if ok else 'redraw',
                 review['score'], review['issues'])
        if not best or ok or review['score'] > best[1]['score']:
            best = (data, review, ok, attempt, pic['model'])
        if ok:
            break
        last = (data, review)
    if not best:
        return None
    data, review, ok, attempt, model = best
    key = f"{time.strftime('%Y%m%d-%H%M', time.gmtime(now))}-{uuid.uuid4().hex[:6]}"
    store.put_knowledge(IMAGES, key, {'data': data})
    return store.put_knowledge(POSTERS, key, {
        'lesson': b['lesson'], 'title': b['title'], 'section': b['section'], 'points': b['points'],
        'ideas': [i['claim'] for i in b['ideas']], 'copy': copy, 'created_at': now, 'version': PROMPT_VERSION,
        'ok': ok, 'review': review, 'attempts': attempt, 'model': model, 'reviewer': config.WALL_REVIEW_MODEL,
        'cost': round(spent, 4), 'bytes': len(data), 'pinned_at': time.time() if pin else None})   # from when it is ready


def due(library, now, every_hours, per_day):
    """Whether the cadence allows a new poster now: none in the last every_hours, and fewer than
    per_day in the last day (failed ones count: they cost the same)."""
    recent = [p['created_at'] for p in library if now - p['created_at'] < 86400]
    return len(recent) < per_day and all(now - t >= every_hours * 3600 for t in recent)


def tick(store, now):
    if llm.enabled() and due(store.list_knowledge(POSTERS), now, config.WALL_EVERY_HOURS, config.WALL_PER_DAY):
        return make(store, now)
    return None


async def run(get_store):
    """Own the poster cadence for the app's lifetime. Failures are logged; nothing waits on it."""
    uid = config.DEV_UID if config.local_mode() else config.ACCESS_UID
    await asyncio.sleep(60)   # let the app settle (and a bad deploy roll back) before spending anything
    while True:
        try:
            await asyncio.to_thread(tick, await asyncio.to_thread(get_store, uid), time.time())
        except asyncio.CancelledError:
            raise
        except Exception:
            log.warning('Wall poster cadence failed', exc_info=True)
        await asyncio.sleep(CHECK_EVERY)
