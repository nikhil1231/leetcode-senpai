# Design system

The rules the UI follows, in one place. `tests/test_ui_audit.py` enforces the ones that can be checked from the
stylesheets; the rest are conventions to keep when adding a page.

## The daily loop
- The app opens on Overview (`#/readiness`). Its Home leads with "Do this next": `senpai/next` (server/next_up.py)
  picks the open block from the bucket furthest behind its weekly share. Today's Senpai session, the tutor's pick (one
  line) and readiness across all six sections follow. Do not add another "what to do now" source.
- Opening the app to answering a question is one click from that card.
- The tutor lives under Overview (`#/readiness/tutor`, `static/tutor-home.js`), not in any one section; the sidebar's
  "Your tutor" button goes there from anywhere. LeetCode opens on Today.

## Section Home (one layout for all six)
Every section Home uses `static/section-home.js`: the section's name and tagline, the plan's next step as a slim
banner, then this section's own next step (one card, up to two alternatives) on the left and the readiness card on the
right (300px, sticky, same place everywhere), then the section's own lists below. A section supplies the content; it
never rearranges the layout. The readiness card (`Readiness.card`) shows the same number as Overview, never a second
score, plus at most three section stats and a link to the section's detail page; its footer is the overall figure with
one pip per section, so no Home is a dead end.

Ripple, the company the tutor's scenes and Ripple Ops are set in, belongs to System Design and AI Engineering. Other
sections do not mention it.

## One colour per section
Each section has its own identity, set once by `sections.js` as `<body data-section="…">` and defined in
`static/themes.css`: LeetCode indigo, System Design mint, Fundamentals sky, AI Engineering orchid, Experience apricot,
Practical Coding lime, Overview gold. A section re-points `--accent*`, `--on-accent` (dark label for accent fills) and tints
its surfaces from one hue (`--h`). Rules:
- Style with the tokens (`--accent`, `--accent-soft`, `--accent-line`, `rgba(var(--accent-rgb), a)`), never a literal
  hex, so the page follows its section. Series colours inside diagrams are data, not chrome, and stay fixed.
- Anything that refers to a *specific* section from another place (switcher, readiness cards, the pips on the readiness card) uses `--sec-<id>`.
- Status colours (green, amber, red) keep their meaning in every section; no section accent is green or red.
- A new section needs a `--sec-<id>` token and a `body[data-section]` block; `tests/test_ui_audit.py` checks both, and
  that the accent passes WCAG AA as text on the panel and under the button label.

## Readiness
Overview (`#/readiness`, `static/readiness.js`, `server/readiness.py`) puts all six sections on one scale: what you
would get right today out of each section's whole syllabus. Untested is unknown, never zero (below 15% tested the
band says so). The overall figure weights sections by the Senpai plan. The same numbers appear in the readiness card on every
section Home and as the sidebar chip. An optional interview date adds a countdown
and the weekly pace needed to reach 70%.

## Simulators
The Simulators page groups its ~90 items into four kinds (build and play, worked system designs, building blocks,
course simulators), each split by category; filter chips pick a kind, search narrows within the groups. Simulators
that run on a clock open paused: Play, Step (one full tick), Reset (which pauses again) and a shared speed slider
(`static/sim-clock.js`, 0.1× to 2×, remembered per browser). `scripts/patch_sim_widgets.py` applies this to the prebuilt
widget bundles.

## Sidebar foot
Search, the readiness chip, "Your tutor", the model chip on its own row, then the account chip with the Settings gear
beside it. The gear is always a 34px square in that row, in every section.

## Type scale
Nothing below 11px (audited). Use: 11 / 11.5 captions and kickers, 12 / 12.5 secondary text, 13 / 13.5 body in dense
UI, 14–15 body, 16–18 lead text, 20–24 card titles, 25+ page headings. Kickers (uppercase, letter-spaced) are the only
place 11px is the default.

## Widths
- Reading width: ~66–86ch for prose (`max-width` on paragraphs, not on cards).
- Content column: the page's own `max-width`; hubs 920px, wide pages (lists, grids, simulators) fill `main` (1280px).
- App mode: a simulator's build canvas on a screen wider than 1100px takes the whole window (no page scroll, no
  1280px cap). Toolbars stay one compact line, the palette, side panel and results fold away, and each scrolls on its
  own (`sd-simulators.css`). Other pages keep the normal scrolling layout.
- Do not set a narrower width on one page of a set to "look centred". Left-aligned content with whitespace on the
  right reads as unfinished.

## Cards and states
- Card: `--panel` background, 1px `--line` border, 10–16px radius. A recommendation card uses `--accent-soft` gradient
  and `--accent-line`.
- Empty state: a dashed box with one sentence and, when there is one, the action that fills it.
- Loading: say what is loading ("Loading settings…"); never leave a blank panel.
- Locked / unavailable: reduce the decoration, never the instruction. A locked item keeps its "how to unlock" line at
  full contrast.
- Verdicts: say the word ("Correct", "Not quite", "Answer revealed"), do not rely on colour alone.

## Lesson pages: one way on
Every page of a lesson (warm-up, each part, Put it together, the check, your gaps) has exactly one filled (primary)
button: the next step of the lesson as it is meant to be done. It is the first unfinished activity on the page, then
the lesson check on its page, then the pager's "Next", and on the last page "Finish: next lesson" (which also marks
the lesson read). `oneNext()` in `static/sd-lesson.js` enforces it, so an activity can mark its own submit button
primary and the role moves on as you work. Ways to go somewhere else (the tutor, Ripple Ops, practise this topic, the
related case, further reading) are plain buttons, grouped under "Elsewhere" in the last page's footer.

In an interview card each question (the opening question, each follow-up, then weak vs strong) is its own tab; an
answered step offers "Next: follow-up n" rather than stacking the next question below it.

## Long text
Summaries over ~3 lines are clamped with a "Show more" control. Explanations are one short paragraph first, detail
after a click. Lists of more than ~8 facts become a table or a grid, not paragraphs.

## Phones (≤ 960px)
The sidebar collapses to a header. In System Design and the tracks it scrolls away (it is three rows tall); the topbar
stays pinned. Anything wider than the screen scrolls inside its own container, never the page.

## Focus and labels
Every control has a visible `:focus-visible` ring, except headings that take programmatic focus on navigation
(`tabindex="-1"`). Icon-only buttons have an `aria-label`.
