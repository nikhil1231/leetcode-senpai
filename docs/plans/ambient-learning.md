# Plan: learning in the background of Nikhil's life

**Status: living intent document.** It records what Nikhil wants and what has been agreed in
design discussion, not how to build it. Whoever implements a part of it updates this file in
the same change: mark the item's status, link the commit, and record any decision made along the
way or any change of intent. Remove nothing that is still wanted; move dropped ideas to
"Dropped" with the reason. The companion plan is [tutor-and-knowledge.md](tutor-and-knowledge.md),
which also describes the shared knowledge model every surface here reads and writes.

## The problem, in Nikhil's words

Studying has too much activation energy. Today he has to be in the mindset to study, go to his
computer, open the site, decide "I am now going to study", and then gets distracted before
doing everything else it takes. He wants learning to be more passive: the knowledge just there
in the background of his life, so that he never has to think about setting up to study.

The model is his school bedroom. He plastered the walls with bright, colourful notes, and when
he daydreamed or got distracted and looked around, the content was there. That helped him absorb
it. Podcasts are too generic and untargeted; a phone flashcard app with notifications, streaks
and Duolingo-style gamification is closer, but he wants something more creative.

What makes that possible: he controls the whole stack. He controls his time (no job), the
learning platform (he built it), a phone app (he has an Apple developer licence), and a suite of
home services on the laptop that already track much of his life and are reachable from
anywhere (Kimi on Telegram, Sundial's screen time, location, sleep and timeline data, Noodle,
Lookout).

**Engagement is the top priority.** He is easily distracted, so every surface must be easy to
come back to and good at reminding him. He notes these are not hugely ambitious projects: agents
can build most surfaces on the side, once the shared knowledge model exists.

## Principles agreed

- **Tiny effortless recall beats passive exposure.** The walls worked partly because he
  half-rehearsed what he saw. The aim is to make one act of recall take seconds, need no
  decision, and land in dead time. Passive exposure is still wanted, and is logged so its effect
  can be measured.
- **One knowledge model, many thin surfaces.** Every surface picks what to show from the shared
  knowledge model and reports what happened back to it, so practice anywhere counts toward
  progress.
- **The story travels.** The fictional company and its cast (see the companion plan) appear on
  every surface, so a question arrives as a message from a colleague, not "Question 14".
- **Context is optional and coarse.** Where he is, what app he just used and how he slept make
  timing smarter, but only coarse signals ("commuting", "opened Uber") are used, and everything
  works without them.

## Surfaces

Each item notes Nikhil's reaction. Status for all: **not started** unless marked.

### Telegram drip (liked)
A few questions a day, chosen from what is due or weak, answered by tap, text or voice note,
graded, and counted. No app to open, no decision to study.

Status: **live** (@codi_nikhil_bot). Decided: a separate bot (the existing bots each have
one reader, and learning stays apart from life admin). `server/drip/` runs inside the app as a
background task, only where `TELEGRAM_BOT_TOKEN` is set. About six cards a day between 08:30
and 22:30 (`DRIP_PER_DAY`, `DRIP_WINDOW`, local time from the Senpai timezone setting), never
two open at once, chosen from the knowledge base: open misconceptions, then shaky, fading and
unconfirmed points, then points seen before, then new ideas from lessons already started. Each
card comes from a cast member (Sam asks facts, Marcus principles and trade-offs, Jo mechanisms,
Priya procedures). Reply by text or voice note: the cheap model grades it against the point's
claim and replies with what was missing and the idea itself (soft evidence; wrong beliefs become
misconceptions). A "partly" answer no longer counts as a full miss: it weakens the memory instead
of resetting it, and opens a *gap*: the one piece that was missing plus a question about just
that piece. After 3 hours the next card for that idea asks only the follow-up, and answering it
right closes the gap (one gap per idea; a repeat updates it). Nikhil asked for this because
re-asking the whole question and missing the same part again was annoying. Without the model, "Show answer" then "I knew it / I did not". Skipped or
unanswered cards (after 3 hours) count as exposures. Commands: /next, /stats, /pause, /resume,
/help. Tested with unit tests and end to end against a fake Telegram with real grading.

To switch it on (Nikhil): create a bot with @BotFather, put `TELEGRAM_BOT_TOKEN=…` in
`~/secrets/leetcode-senpai.env` (the whats Secrets tab works), recreate the container, send the
bot /start to get your chat id, add `TELEGRAM_CHAT_ID=…`, recreate again.

### Quizzes while waiting on agents (liked)
He spends many short waits on Claude sessions every day. Sundial's Threads card is already
always on screen and already knows when a session is running, so it (or something like it)
shows one question while an agent works, answerable instantly.

### Living wallpaper and phone surfaces (very interested)
He looks at his phone screen many times a day, so the phone is the most valuable surface.
- Lock screen and home screen wallpaper regenerated through the day as a bright, colourful
  poster of one concept he is weak on, possibly a question in the morning and its answer later.
  He asked how frequently it can update: iOS Shortcuts can change it on a schedule (hourly is
  realistic) and on events such as opening an app or plugging in; to be verified on his phone.
- The Mac desktop can do the same.
- A "fading map": one big poster of his company's architecture with each part coloured by how
  well he currently holds it, fading as memory decays.

### iOS app (very useful)
Later: widgets, notifications answerable from the lock screen, bedside StandBy posters, and a
voice mode to talk to the tutor on walks.

### Questions tied to his day (really liked)
When he uses something, he is asked about how it works, immediately: open Uber and get a
Telegram message about designing ride matching; watch YouTube and get asked how it picks a CDN
edge. It must be fast enough to catch his attention in the moment. Phone app-open automations
are the instant trigger; the hourly screen-time feed is too slow for this.

### Morning YouTube Shorts (his idea)
Every morning he opens YouTube to watch Shorts. A phone shortcut can redirect that to the
learning app. Agreed refinement: rather than a hard block (which tends to get switched off), a
short "toll" of a few quick swipeable cards in a Shorts-like format, then continue to YouTube.
The learning feed should compete with Shorts on its own format.

### A YouTube extension that shows more productive videos (his idea)
A browser extension that makes YouTube show him more videos relevant to what he is learning,
mixed in with his usual recommendations rather than replacing them (for example a row of
videos matched to his current weak spots). Desktop first; the phone app cannot run extensions.

He sees a broader theme here: **taking control of his digital time**. This could generalise to
many other things in future, probably as its own project beyond this app.

### Bedtime: the nightly life-metrics write-up (his idea)
He writes up his life metrics every night before bed (around 10pm) and looks at it every night.
An optional learning section there (a few cards from the day's misses) is the ideal place for a
pre-sleep review, and the next morning's first touch (for example the Shorts toll) can check the
same items. Where the write-up lives still needs confirming.

### Daily podcast built for him (liked)
Like NotebookLM's audio overviews, but made from his own weak spots and due points, with pauses
that ask him to think. Also wanted: audio-drama episodes about his company's latest outage.
Delivered so his phone's podcast app can play it; timed for walks and commutes.

### His own home lab as case studies (useful)
His box is a system design curriculum (deploy polling and rollback, the Cloudflare tunnel, the
memory reaper's load shedding, backups and restore tests). Questions grounded in his own systems
are memorable and double as interview stories.

### The physical wall (loves it)
He has wanted this for a while but every option felt underwhelming, and e-ink is expensive.
Options discussed: a mini projector onto a wall (closest to the plastered-walls feeling), a
secondhand portrait TV or monitor showing a web page, the Mac screensaver cycling posters, a
weekly colour print, a jailbroken old Kindle (cheap e-ink, but small and monochrome). Weak
points should appear more often.

### Sleep-aware timing
Lighter load on poor-sleep days; review before sleep and recall the next morning (served by the
bedtime write-up above).

## Costs

Prices were taken from OpenRouter on 30 October 2026. Estimated monthly cost:

| Surface | Cheap | Premium |
|---|---|---|
| Telegram drip (8 a day) | ~$0.40 | ~$3 |
| Threads-card quizzes (~30 a day, mostly ungraded by a model) | ~$0.30 | ~$1 |
| Day-tied questions (~5 a day) | ~$0.15 | ~$3 |
| Daily 12-minute podcast | ~$1.50 | ~$6 (Gemini TTS) to ~$28 (ElevenLabs v3) |
| Weekly audio drama | — | ~$7 |
| Posters | $0 (templated) | ~$7–15 (AI-illustrated) |

Spending decisions are Nikhil's. Never an Anthropic model through OpenRouter (too
expensive); bulk content work is done by the agent itself, not a paid API.

## Open decisions (Nikhil's)

- Telegram: decided, a separate bot. Creating it (BotFather) is Nikhil's step.
- How much of Sundial's data the learning side may see (suggested: coarse signals only).
- Spend on voices and imagery.
- Where the nightly life-metrics write-up lives.

## Log

- 2026-10-30: plan written from the design discussion. No surface built yet. The shared knowledge
  model they need now exists: a surface asks `GET /api/knowledge/next` for what to show (each
  point has a short recall `prompt` and its `claim` as the answer, so no model call is needed
  at runtime) and reports back with `POST /api/knowledge/events` (answers, or `kind: exposure`
  for things merely shown). Services authenticate with a source token
  (`KNOWLEDGE_SOURCE_TOKENS`).
- 2026-10-31: Built the Telegram drip inside the app (see its Status). Switched on as
  @codi_nikhil_bot; first card answered. Then: partly-right answers open a gap and get a
  targeted follow-up instead of the whole question again.

## Dropped

- Training YouTube's recommendation algorithm by automated viewing: a misreading of the
  request; Nikhil meant an extension that shows more productive videos.
