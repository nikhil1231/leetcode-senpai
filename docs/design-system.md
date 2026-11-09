# Design system

The rules the UI follows, in one place. `tests/test_ui_audit.py` enforces the ones that can be checked from the
stylesheets; the rest are conventions to keep when adding a page.

## The daily loop
- One recommendation leads everywhere: `senpai/next` (server/next_up.py) picks the open block from the bucket
  furthest behind its weekly share. Today and the Tutor tab show the full "Do this next" card; section Homes show the
  slim banner and keep their own section-specific suggestion beneath it. Do not add another "what to do now" source.
- Opening the app to answering a question is one click from that card.

## One colour per section
Each section has its own identity, set once by `sections.js` as `<body data-section="…">` and defined in
`static/themes.css`: LeetCode indigo, System Design mint, Fundamentals sky, AI Engineering orchid, Experience apricot,
Practical Coding lime, Overview gold. A section re-points `--accent*`, `--on-accent` (dark label for accent fills) and tints
its surfaces from one hue (`--h`). Rules:
- Style with the tokens (`--accent`, `--accent-soft`, `--accent-line`, `rgba(var(--accent-rgb), a)`), never a literal
  hex, so the page follows its section. Series colours inside diagrams are data, not chrome, and stay fixed.
- Anything that refers to a *specific* section from another place (switcher, readiness cards, strip) uses `--sec-<id>`.
- Status colours (green, amber, red) keep their meaning in every section; no section accent is green or red.
- A new section needs a `--sec-<id>` token and a `body[data-section]` block; `tests/test_ui_audit.py` checks both, and
  that the accent passes WCAG AA as text on the panel and under the button label.

## Readiness
Overview (`#/readiness`, `static/readiness.js`, `server/readiness.py`) puts all six sections on one scale: what you
would get right today out of each section's whole syllabus. Untested is unknown, never zero (below 15% tested the
band says so). The overall figure weights sections by the Senpai plan. The same numbers appear as a strip on Tutor and
every section Home and as the sidebar chip, so no section is a dead end. An optional interview date adds a countdown
and the weekly pace needed to reach 70%.

## Type scale
Nothing below 11px (audited). Use: 11 / 11.5 captions and kickers, 12 / 12.5 secondary text, 13 / 13.5 body in dense
UI, 14–15 body, 16–18 lead text, 20–24 card titles, 25+ page headings. Kickers (uppercase, letter-spaced) are the only
place 11px is the default.

## Widths
- Reading width: ~66–86ch for prose (`max-width` on paragraphs, not on cards).
- Content column: the page's own `max-width`; hubs 920px, wide pages (lists, grids, simulators) fill `main` (1280px).
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

## Long text
Summaries over ~3 lines are clamped with a "Show more" control. Explanations are one short paragraph first, detail
after a click. Lists of more than ~8 facts become a table or a grid, not paragraphs.

## Phones (≤ 960px)
The sidebar collapses to a header. In System Design and the tracks it scrolls away (it is three rows tall); the topbar
stays pinned. Anything wider than the screen scrolls inside its own container, never the page.

## Focus and labels
Every control has a visible `:focus-visible` ring, except headings that take programmatic focus on navigation
(`tabindex="-1"`). Icon-only buttons have an `aria-label`.
