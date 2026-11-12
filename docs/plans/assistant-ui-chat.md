# Chat on assistant-ui: plan

Status: built 2026-11-12, after the move to Next.js (`web/`). The integration ideas below are not built.

## What was built

The "build step" question this plan opened with went away with the Next.js move: assistant-ui is an ordinary pinned
dependency of `web/` (`@assistant-ui/react` 0.15.32, unstyled primitives, no Tailwind).

- **One chat component**, `web/src/components/chat/Chat.tsx`, on the external-store runtime: the caller owns the
  messages and the server stays the record. Styled by `web/src/styles/chat.css` over the app's tokens, so section
  colours follow. Replies render with the lessons' Markdown (`web/src/lib/lesson-md.ts`, a TypeScript copy of
  `sd-blocks.js`'s `md`, which the legacy VM tests cannot import). Tool parts are cards the caller draws by name.
- **Streaming** where the reply is plain chat: `llm._raw_chat_stream` (OpenRouter `stream: true`, same Anthropic ban),
  `server/chat_stream.py` (the pure `Visible` filter that holds back `<private>`, `[[markers]]` and widget fences, and
  the SSE helpers), `streamApi` in `web/src/lib/api.ts`. An endpoint streams when the request accepts
  `text/event-stream` and answers JSON otherwise. Checked through `next dev`, the standalone production server and
  gzip: events arrive as written.
- **Page coach**: plain chat now (`server/page_coach.py`, the `page_chat` structured task is gone), streamed.
- **Tutor and area overviews**: starting a session, each turn and the debrief stream. Markers become placeholder cards
  while streaming ("Bringing in an activity…", "Drawing on the whiteboard…", "Noted"); the stored turn then replaces
  the preview, with cards that bring whiteboards, activities and designs forward on the stage, links, moves, and
  "Recorded N things you showed". `web/src/features/tutor/TutorChat.tsx`, mounted by `tutor.js` and `sd-map.js`
  through the bridge (`window.SenpaiChat.tutor`).
- **Interviewer, Senpai teach, design-workspace coach, Ripple game drawer**: on the same component, not streamed.
  Their replies are structured (hint plus editor marks, assistance and exercises, revisioned sessions, what-if events),
  so their endpoints are unchanged. Legacy modules mount it with `window.SenpaiChat.mount`.
- **Mobile**: 16px input on phones, the page coach sized to the visual viewport so the keyboard does not cover the
  composer, a chat opens on its latest message. Checked in headless Chrome at 1400px and 390px.
- `FAKE_CHAT=1 uv run scripts/dev_fake_server.py` answers the plain chats with canned, slowly streamed replies, for
  building chat UI without spending anything.

## The chats before this change

`llm._raw_chat` always sends `stream: False`; replies arrive whole after up to 60s.

| Chat | Code | Notes |
|---|---|---|
| Tutor sessions | `static/tutor.js`, `server/tutor/` | Largest. Already has "tools": whiteboard, lesson activities, simulator handover, move/next/note markers |
| Area overviews | `static/sd-map.js` | Reuses the tutor's chat styles (`tu-chat`) |
| Page coach | `static/page-coach.js`, `POST /api/coach/page-chat` | Floating "ask about this page". Uses structured JSON (`llm.extract("page_chat")`), not plain chat |
| Problem interviewer / hints | `static/app.js` (`#coach-chat`) | Hint cards plus chat |
| System design coach | `static/system-design.js` (`#sd-chat`) | `/sessions/{id}/chat` |
| Ripple game (Marcus, mock interview) | `static/sd-game.js` | |
| Senpai "teach" | `static/senpai.js` (`teachState`) | |

## Design

### Runtime
Use **ExternalStoreRuntime** (the app owns message state). The server is already the source of truth: a tutor turn is
stored before the model is called, and a failed reply is retried with the same key (`server/tutor/api.py`).
assistant-ui only displays server messages and never owns them, which keeps invariant 2.

### Streaming
- Add a streaming variant of `llm._raw_chat` (OpenRouter `stream: true`), keeping the Anthropic-model refusal.
- SSE endpoints via FastAPI `StreamingResponse`, `Content-Type: text/event-stream`, `Cache-Control: no-cache`
  (Cloudflare passes event streams through).
- The tutor's replies contain hidden `<private>…</private>` notes and `[[markers]]` (`server/tutor/session.py`:
  `PRIVATE`, `ANY_MARKER`). The stream filter must hold back text from a `<` or `[[` until it knows whether it's
  hidden, so private notes never flash on screen. Pure function, unit-tested.
- The parallel note-taker and the final turn record (recorded counts, move, whiteboard) arrive as a closing `done`
  event. The stored turn stays the canonical record; the stream is just a preview of it.
- Page coach moves from structured JSON output to plain chat so it can stream.

### Tool calls and widgets
Keep the current text markers (they work with any cheap model) and convert them into tool-call parts as they stream:

| Marker | Rendered as |
|---|---|
| whiteboard (`server/tutor/board.py`) | Inline diagram widget |
| `[[activity b3]]` | The lesson block embedded in chat |
| `[[play r1]]` / rig handover (`server/tutor/rig.py`) | Simulator card with "Run" |
| `[[move section/lesson]]` | "Go to lesson" card |
| `[[note …]]` | Small "Noted" chip |
| note-taker results | Quiet "Recorded 2 pieces of evidence" line |

Moving to real OpenAI-style function calling can come later.

### Colours, markdown, mobile
- Style the unstyled primitives with our own CSS over existing tokens (`--accent`, `--accent-rgb`, `--panel*`,
  `--line`); no Tailwind. Section theming then follows `body[data-section]` from `static/themes.css` automatically.
- Render replies through the existing `SDBlocks.md` so they match lessons.
- Mobile: sticky composer that moves above the on-screen keyboard (`visualViewport`), 16px input font so iOS doesn't
  zoom, the tutor's stage above the chat on narrow screens.
- Verify in Chrome (claude-in-chrome) at phone and desktop widths. Headless Chrome can't reach local servers on this
  box, so use the deployed site or the user's real Chrome against localhost.

### Order
1. Pilot: page coach (small, on every page).
2. Tutor sessions and area overviews (most of the value).
3. Fold in the other four chats.

## Integration ideas

1. **Approve/reject cards in chat.** Senpai's "Needs approval" plan changes become cards with Allow/Deny
   (assistant-ui has this human-in-the-loop pattern built in).
2. **Actions the model can take in the app.** Page coach and tutor open a lesson, start a problem, highlight an
   editor line or open a simulator, via existing calls (`App.startFlow`, `AppSections.select`).
3. **Run my code.** The interviewer runs your solution through `practical-worker.js` and shows a test-results card.
4. **Voice.** Wire `dictate.js` into the composer's dictation slot; the podcast's Piper voices read interviewer
   replies aloud in mock interviews.
5. **Image attachments.** Paste a whiteboard photo or problem screenshot; the vision path (`llm._raw_look`) exists.
6. **Suggested prompts.** Starters that fit the page, e.g. "Why was my answer wrong?" when a wrong option is showing.
7. **Edit and retry with branches.** Re-ask differently and flip between answers; all branches kept as raw data.
8. **One "Ask Senpai" in the Cmd-K palette.** One assistant with tools over the search index, `next_up` and the
   knowledge base.
9. **Evidence citations as cards.** The daily review's "Evidence 1/2" buttons become hover cards of the cited
   activity.
10. **Thumbs up/down on replies.** Stored as raw data, for tuning `server/voice.py`.

## Caveats

- The LLM stays out of core flows: every chat surface already hides itself without the model, and that doesn't change.
- `tests/test_ui_audit.py` will need updating for the new markup.
- Pin assistant-ui's version in the build script; some APIs are `unstable_` and change between releases.

## Sources

- [assistant-ui on GitHub](https://github.com/assistant-ui/assistant-ui)
- [Picking a runtime](https://www.assistant-ui.com/docs/runtimes/pick-a-runtime)
- [External store runtime](https://assistant-ui.com/docs/runtimes/custom/external-store)
- [Local runtime](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime)
- [Data stream protocol](https://www.assistant-ui.com/docs/runtimes/custom/data-stream)
- [assistant-stream-ce (FastAPI)](https://mylonasc.github.io/assistant-stream-ce/fastapi.html)
