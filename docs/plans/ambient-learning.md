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

Each item notes Nikhil's reaction and its status. Device setup for every surface is in
[clients/README.md](../../clients/README.md).

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
unanswered cards (after 3 hours) count as exposures. Commands: /next, /stats, /frequency, /pause,
/resume, /help (filled into the bot's command menu at startup). `/frequency 8` sets how many
cards a day, 1 to 10, and reschedules at once; it is saved in the bot's state and overrides
`DRIP_PER_DAY`. Nikhil asked for it. Tested with unit tests and end to end against a fake Telegram with real grading.
Also in the bot: questions tied to the day (`/api/drip/opened`), the bedtime link, lighter days
after poor sleep and `/podcast`; see those sections. Grading is shared with walk mode
(`server/drip/assess.py`).

To switch it on (Nikhil): create a bot with @BotFather, put `TELEGRAM_BOT_TOKEN=…` in
`~/secrets/leetcode-senpai.env` (the whats Secrets tab works), recreate the container, send the
bot /start to get your chat id, add `TELEGRAM_CHAT_ID=…`, recreate again.

### Quizzes while waiting on agents (liked)
He spends many short waits on Claude sessions every day. Sundial's Threads card is already
always on screen and already knows when a session is running, so it (or something like it)
shows one question while an agent works, answerable instantly.

Status: **built, needs a token to switch on.** In Sundial (`src/sundial/learn.py`, commit
e6dcbcc): while any thread is Running, the card shows one question at the top (the feed's next
card): "Show the idea", then "Knew it" or "Didn't"; the next one follows. Sundial asks the app
over the `edge` network (`http://leetcode-senpai:8080`) with a knowledge source token named
`threads`, so answers count under that source. No model. A card setting turns it off. To switch
it on (Nikhil): pick a random token, add `threads:<token>` to `KNOWLEDGE_SOURCE_TOKENS` in
`~/secrets/leetcode-senpai.env` and `LEETCODE_TOKEN=<token>` to `~/secrets/sundial.env`, then
recreate both containers. Tested with Sundial unit tests and in the card against a fake app.

### Living wallpaper and phone surfaces (very interested)
He looks at his phone screen many times a day, so the phone is the most valuable surface.
- Lock screen and home screen wallpaper regenerated through the day as a bright, colourful
  poster of one concept he is weak on, possibly a question in the morning and its answer later.
  He asked how frequently it can update: iOS Shortcuts can change it on a schedule (hourly is
  realistic) and on events such as opening an app or plugging in; to be verified on his phone.
- The Mac desktop can do the same.
- A "fading map": one big poster of his company's architecture with each part coloured by how
  well he currently holds it, fading as memory decays.

Status: **built; the phone and Mac steps are Nikhil's.** `server/wall.py`.
- `/api/wall/poster.png` draws a poster with Pillow and a bundled Noto Sans: one weak point,
  a new one every two hours, its answer shown in the second hour, the top 30% left clear for
  the lock screen clock (`w`, `h`, `top`, `side` adjust it). An iPhone Shortcut fetches it and
  sets the wallpaper on Time of Day automations (hourly works; iOS has no "every hour" trigger, so
  one automation per hour). `clients/mac/senpai-wallpaper` does the Mac desktop hourly (launchd).
- `clients/ios/senpai-widget.js` is a Scriptable widget (home screen, lock screen, StandBy) of
  the same poster (`/api/wall/now`); tapping it opens the feed.
- The fading map is a slide on `/wall` (see The physical wall): Ripple's architecture, one box
  per system design area, coloured green to red by how well he holds the ideas he has met there
  and faint where he has met few.
Decided: phones and scripts authenticate with a Cloudflare Access **service token** (the app now
accepts tokens whose client id is in `ACCESS_SERVICE_TOKENS`). Creating it and adding a Service
Auth policy is Nikhil's step. Nothing is recorded when a poster is shown: a screen is not proof
he looked. Not yet verified on a real iPhone.

### iOS app (very useful)
Later: widgets, notifications answerable from the lock screen, bedside StandBy posters, and a
voice mode to talk to the tutor on walks.

Status: **covered without a native app, for now.** A native app needs Xcode on a Mac, which this
box can't run. Each piece has a stand-in: widgets and StandBy posters via the Scriptable widget;
notifications answerable from the lock screen via Telegram (its notifications take a reply
in place); voice mode as `/walk` (below). A native app remains wanted if these feel second-best.

Voice mode, status **built**: `/walk` (`static/walk.html`) is hands-free practice. It reads a
question in the phone's own voice, listens until he stops talking (it detects the pause),
transcribes it, grades it like a Telegram reply (`POST /api/feed/answer`, source `walk`, gaps and
misconceptions included) and reads back the verdict and the idea. "Skip", "repeat" and "stop"
work by voice. Without the model it reads the question, waits, reads the idea, and he taps. The
screen must stay on (phones stop speaking when they lock); it holds a wake lock. It drills
knowledge points rather than running a free tutor conversation; a spoken tutor session is the
next step if wanted. Tested in Chromium with a recorded voice as the microphone.

### Questions tied to his day (really liked)
When he uses something, he is asked about how it works, immediately: open Uber and get a
Telegram message about designing ride matching; watch YouTube and get asked how it picks a CDN
edge. It must be fast enough to catch his attention in the moment. Phone app-open automations
are the instant trigger; the hourly screen-time feed is too slow for this.

Status: **built; the phone automations are Nikhil's.** `server/drip/context.py`,
`server/drip/apps.yaml`. An iPhone automation ("when Uber is opened") posts the app's name to
`/api/drip/opened` with the service token; the running bot sends a card from that app's lessons
within a second or two, opening with "You just opened Uber. Riders and drivers have to find each
other in seconds." Fifteen app groups are mapped (YouTube, Uber, Deliveroo, social feeds, chat,
streaming, maps, shops, banks, email, Google, AI assistants, GitHub, booking apps, cloud files).
Limits keep it a nudge: only in the drip's hours, not while paused, each app once per 3 hours, 4
a day, never on top of a card from the last 10 minutes (an older unanswered one is replaced and
counts as shown). Telegram, Safari and Chrome are left out because they would trigger themselves.

### Morning YouTube Shorts (his idea)
Every morning he opens YouTube to watch Shorts. A phone shortcut can redirect that to the
learning app. Agreed refinement: rather than a hard block (which tends to get switched off), a
short "toll" of a few quick swipeable cards in a Shorts-like format, then continue to YouTube.
The learning feed should compete with Shorts on its own format.

Status: **built, waiting on the phone shortcut.** `/feed` (`server/feed.py`, `static/feed.html`) is a
standalone phone page: full-screen cards, one bright colour per kind of idea, swiped like Shorts.
Cards are chosen like the drip's (open gaps first, asking only the missing piece, then
misconceptions, shaky and fading points), never the point a drip card is still waiting on. You think,
tap to see the idea, then "Knew it" or "Didn't know" (self-graded, soft evidence, source `feed`;
"Knew it" on a gap card closes the gap). A card swiped past after a second and a half is an
exposure. The end card shows the score and Ripple's stage, with "N more" and, given
`?then=youtube`, "Continue to YouTube" (the app on iOS). "Not now" always lets him through: a toll,
not a wall. `?n=` sets the number of cards (default 3, at most 10). No model is used. It works
under Access and in local mode; in Firebase sign-in mode it asks you to sign in to the app first.

Decided: the loop guard lives in the shortcut, not the page. Opening YouTube from the feed would
trigger the "YouTube opened" automation again, and only the shortcut can stop itself before Safari
opens. To switch it on (Nikhil, on the phone; not yet verified on a device):
1. Shortcuts → Automation → New → App → YouTube → Is Opened → Run Immediately.
2. Get File `feed-toll.txt` from the Shortcuts folder (Error If Not Found off).
3. If the file has any value, Get Time Between that date and Current Date in minutes.
4. If there was no file, or the minutes are over 30: Save Current Date to `feed-toll.txt`
   (overwrite), then Open URL `https://leetcode.nikhil.ing/feed?then=youtube`. Otherwise do nothing.
The same page works as a home-screen bookmark (`/feed`) for any spare minute.

### A YouTube extension that shows more productive videos (his idea)
A browser extension that makes YouTube show him more videos relevant to what he is learning,
mixed in with his usual recommendations rather than replacing them (for example a row of
videos matched to his current weak spots). Desktop first; the phone app cannot run extensions.

Status: **built; install it in Chrome.** `clients/youtube-extension` (Manifest V3) adds "For what
you're learning" above the YouTube home feed: two videos for each of his four weakest lessons
(`/api/wall/topics` turns them into searches), from a YouTube search the extension makes itself,
so no API key or cost. Shorts and anything over 90 minutes are left out, and results are kept for
3 hours. Tested in Chromium against the real YouTube home page.

He sees a broader theme here: **taking control of his digital time**. This could generalise to
many other things in future, probably as its own project beyond this app.

### Bedtime: the nightly life-metrics write-up (his idea)
He writes up his life metrics every night before bed (around 10pm) and looks at it every night.
An optional learning section there (a few cards from the day's misses) is the ideal place for a
pre-sleep review, and the next morning's first touch (for example the Shorts toll) can check the
same items. Where the write-up lives still needs confirming.

Status: **built in the app; the write-up hook waits on where it lives.** After 21:45
(`DRIP_BEDTIME`) the bot sends "You missed N ideas today" with a button to `/feed?set=tonight`,
only on days with misses. Before noon the feed (so the YouTube toll too) starts with last night's
misses he hasn't answered since: the morning check after sleep. `GET /api/feed/tonight.txt` is the
day's misses as plain text (question and idea), ready for the nightly write-up to include once
its location is known. Sundial has no nightly write-up, so it isn't there.

### Daily podcast built for him (liked)
Like NotebookLM's audio overviews, but made from his own weak spots and due points, with pauses
that ask him to think. Also wanted: audio-drama episodes about his company's latest outage.
Delivered so his phone's podcast app can play it; timed for walks and commutes.

Status: **built (daily episode); the audio drama is not.** `server/podcast.py`. An episode is
about six minutes: last night's misses, then gaps, misconceptions, shaky and fading points; a
cast member asks, six seconds of quiet, then the narrator gives the idea. Templated, no model.
Speech is free and local: Piper with two British voices, baked into the image. Each voice runs in
its own child process and long sentences are spoken in short phrases, so it peaks near 430 MB
and frees it when done (made in 44 s on the box). Nikhil raised the container's memory limit to
1 GB for this. Delivery: `/podcast` in Telegram sends today's episode, and `/podcast daily` sends
one every morning when the questions start (Telegram plays in the background). For a podcast app:
set `PODCAST_TOKEN` and give `/podcast/*` an Access Bypass policy (the token in the address is
the lock), then follow `/podcast/<token>/feed.xml`. Episodes are derived and live on the
container's disk, so a redeploy just means today's is made again. The audio drama needs a model
to write it and better voices: a spending decision (see Costs).

### His own home lab as case studies (useful)
His box is a system design curriculum (deploy polling and rollback, the Cloudflare tunnel, the
memory reaper's load shedding, backups and restore tests). Questions grounded in his own systems
are memorable and double as interview stories.

Status: **done.** A Fundamentals lesson, "Case study: your own box" (Cloud and delivery), written
from `~/infra`: pull deploys with per-commit images and health-checked rollback, the tunnel and
Access JWT checks, the reaper's memory-aware load shedding and the October incident, restic
backups with monthly restore tests, and the auto-fixer's loop guards. 20 knowledge points, all
items mapped, so every surface uses them. Writing it found a real flaw worth an interview story:
a failed deploy doesn't record its commit, so every poll retries the broken image and the site
flaps until a fix lands (the lesson's predict activity is about it; the deploy script is unchanged).

### The physical wall (loves it)
He has wanted this for a while but every option felt underwhelming, and e-ink is expensive.
Options discussed: a mini projector onto a wall (closest to the plastered-walls feeling), a
secondhand portrait TV or monitor showing a web page, the Mac screensaver cycling posters, a
weekly colour print, a jailbroken old Kindle (cheap e-ink, but small and monochrome). Weak
points should appear more often.

Status: **software built; the hardware is Nikhil's choice.** `/wall` shows full-screen posters
on any signed-in browser (TV, monitor, projector, a Mac screensaver via a web-page screensaver, a
phone on a stand): the question first, the idea after `?reveal` seconds, a clock, and every fifth
slide the fading map. Weak points come up more often (misconceptions 6×, shaky 5×, fading 4×,
unconfirmed 3× a held point). It keeps the screen awake. `/wall?print=1` lays six posters on one
A4 page for a weekly colour print. A Kindle would need a monochrome layout: not built.

### Sleep-aware timing
Lighter load on poor-sleep days; review before sleep and recall the next morning (served by the
bedtime write-up above).

Status: **built; switch on with `SUNDIAL_URL=http://sundial:8700`** in the app's env (unset, the
drip never looks). Once a day the bot reads last night from Sundial's coach feed, keeping only
minutes asleep, sleep score and readiness (coarse, per the plan's principle). Under 5.5 hours or a
score under 60 halves the day's cards; under 6.5 hours or 70 sends three quarters. `/stats` says
why it's lighter. Review before sleep and recall the next morning are the bedtime section above.

## Costs

Prices were taken from OpenRouter on 30 October 2026. Estimated monthly cost:

| Surface | Cheap | Premium |
|---|---|---|
| Telegram drip (8 a day) | ~$0.40 | ~$3 |
| Threads-card quizzes (~30 a day, mostly ungraded by a model) | ~$0.30 | ~$1 |
| Day-tied questions (~5 a day) | ~$0.15 | ~$3 |
| Daily 12-minute podcast | ~$1.50 | ~$6 (Gemini TTS) to ~$28 (ElevenLabs v3) |
| *Daily podcast as built (templated script, local Piper voices)* | *$0* | |
| Weekly audio drama | — | ~$7 |
| Posters | $0 (templated) | ~$7–15 (AI-illustrated) |

Spending decisions are Nikhil's. Never an Anthropic model through OpenRouter (too
expensive); bulk content work is done by the agent itself, not a paid API.

## Open decisions (Nikhil's)

- Telegram: decided, a separate bot. Creating it (BotFather) is Nikhil's step.
- How much of Sundial's data the learning side may see. Built with coarse signals only: last
  night's minutes asleep, sleep score and readiness, read by the drip once a day.
- Spend on voices and imagery: the podcast uses free local voices and the posters are templated.
  Paid voices, AI-illustrated posters and the weekly audio drama wait on this.
- Where the nightly life-metrics write-up lives (then include `/api/feed/tonight.txt` in it).
- Physical wall hardware: projector, TV or monitor, or the weekly print.

## Switching it all on (Nikhil's steps)

1. Cloudflare: create an Access service token and a Service Auth policy for the app; put its client
   id in `ACCESS_SERVICE_TOKENS` (clients/README.md). Phone shortcuts, the widget and the Mac
   script use it.
2. `~/secrets/leetcode-senpai.env`: `SUNDIAL_URL=http://sundial:8700`, `threads:<token>` in
   `KNOWLEDGE_SOURCE_TOKENS`, and for a podcast app `PODCAST_TOKEN` plus an Access Bypass for
   `/podcast/*`. `~/secrets/sundial.env`: `LEETCODE_TOKEN=<the same token>`. Recreate both.
3. iPhone: the YouTube toll, wallpaper and app-opened automations, and the Scriptable widget.
4. Mac: the wallpaper script. Chrome: load the YouTube extension.
5. Telegram: `/podcast daily` if wanted.

## Log

- 2026-10-30: plan written from the design discussion. No surface built yet. The shared knowledge
  model they need now exists: a surface asks `GET /api/knowledge/next` for what to show (each
  point has a short recall `prompt` and its `claim` as the answer, so no model call is needed
  at runtime) and reports back with `POST /api/knowledge/events` (answers, or `kind: exposure`
  for things merely shown). Services authenticate with a source token
  (`KNOWLEDGE_SOURCE_TOKENS`).
- 2026-10-31: Built the Telegram drip inside the app (see its Status). Switched on as
  @codi_nikhil_bot; first card answered. Then: partly-right answers open a gap and get a
  targeted follow-up instead of the whole question again. `/frequency 1-10` sets cards a day.
  Built the Shorts-style feed at `/feed` (see Morning YouTube Shorts); the iOS shortcut that
  opens it before YouTube is Nikhil's step.
  Then the rest of the plan in one go: the home-lab lesson; `/wall`, poster wallpapers and the
  fading map; Access service tokens for devices; the Mac wallpaper script and the Scriptable
  widget; questions tied to opened apps; the bedtime link and morning re-check; sleep-aware
  pacing; the Threads-card quiz (Sundial); the YouTube extension; the daily podcast (container
  memory limit raised to 1 GB, Nikhil's call); and `/walk` voice mode. All need the switch-on steps
  above before they reach his devices. Not built: a native iOS app, the audio drama, AI imagery.

## Dropped

- Training YouTube's recommendation algorithm by automated viewing: a misreading of the
  request; Nikhil meant an extension that shows more productive videos.
