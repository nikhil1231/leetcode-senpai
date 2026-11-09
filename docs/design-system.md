# Design system

The rules the UI follows, in one place. `tests/test_ui_audit.py` enforces the ones that can be checked from the
stylesheets; the rest are conventions to keep when adding a page.

## The daily loop
- One recommendation leads everywhere: `senpai/next` (server/next_up.py) picks the open block from the bucket
  furthest behind its weekly share. Today and the Tutor tab show the full "Do this next" card; section Homes show the
  slim banner and keep their own section-specific suggestion beneath it. Do not add another "what to do now" source.
- Opening the app to answering a question is one click from that card.

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
