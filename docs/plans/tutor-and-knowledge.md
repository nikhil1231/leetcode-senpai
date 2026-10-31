# Plan: a tutor that leads, and one model of what Nikhil knows

**Status: living intent document.** It records what Nikhil wants and what has been agreed in
design discussion, not how to build it. Whoever implements a part of it updates this file in
the same change: mark the item's status, link the commit, and record any decision made along the
way or any change of intent. Remove nothing that is still wanted; move dropped ideas to
"Dropped" with the reason. The companion plan is [ambient-learning.md](ambient-learning.md).

## The problem, in Nikhil's words

Everything outside the LeetCode section (system design, Fundamentals, AI Engineering and the
other tracks) has a lot of content, but it feels robotic, because it is: every lesson and
question is pre-programmed. AI is used in many places, but it is bolted onto a fixed structure.
It is boring and does not hold attention.

Think of a spectrum: at one end everything is hard-coded and static; at the other there is no
structure at all, just talking to a chatbot. Nikhil wants the app much closer to the
conversational end than it is now, **without losing the curriculum**, because structure is what
makes it possible to compare what he knows now with what he knew before and see progress.

What he wants is a proper hands-on tutor: one that takes him through things, engages with him,
asks him questions, and works out where his knowledge gaps are.

**Engagement is the top priority.** Nikhil is easily distracted and struggles to hold
concentration, so learning must be easy to come back to and easy to be reminded of. Every
design choice should be judged against that.

Out of scope: the LeetCode section, which is fine as it is.

## Foundation: one central model of what Nikhil knows

Status: **built (first version).** `server/knowledge_base/` holds the catalog, the memory
model and `/api/knowledge` (see the README section "Knowledge base"). All 74 system design,
Fundamentals and AI Engineering lessons have points: 1,416 distinct ideas after 98 duplicates
were merged into aliases, 1,020 with prerequisites, and every one of the 1,076 existing ledger
items mapped. Not yet decided: how much soft evidence should count (for now it counts fully,
but the point stays "unconfirmed" until a hard check agrees).

Content work like this is done by the agent itself, not a paid API:
`scripts/generate_knowledge_points.py` exports prompts and imports the agent's answers
(`--export` / `--import`); `--openrouter` exists but spends the shared balance and is only for
when Nikhil asks.

Nikhil particularly likes the idea of codifying his current state of knowledge, because once
that exists, everything else (the tutor, and every surface in the ambient plan) becomes far
more effective: each one reads from it and writes back to it, and it stays up to date.

His starting picture: the curriculum is essentially a set of facts, so reduce it to something
like a dictionary of topics, subtopics and the facts within each, with how well he knows each
one and when he last recalled it. He did not want a full network of linked nodes unless it is
needed. What was agreed:

- **It is centralised and generic.** One knowledge base that many sources read and write: the
  lessons, Quickfire, papers, the tutor, Telegram, the Threads card, the phone, the podcast, and
  whatever comes later. A new source should only need to say which points it touched and how it
  went.
- **The unit is a knowledge point (an idea), not a question.** One idea is tested by many
  questions, and one question can test several ideas. Questions and activities point at the
  points they test.
- **The dictionary shape stays** (track → topic → points, each with how well it is held and
  when it was last recalled), with four additions that earn their place:
  1. **Kind**: fact, mechanism, trade-off or procedure. Facts can be flashed and recalled;
     trade-offs and procedures can only be shown by applying them. Without this, everything
     degrades into flashcards, and interviews do not test flashcards.
  2. **Depth**: recognise → recall → explain → apply. Knowing a number is different from using
     it unprompted to size a system. Ambient surfaces mostly train recall; the tutor trains
     explanation and application.
  3. **Misconceptions** as first-class entries attached to points ("believes write-through
     prevents stale reads"), open until resolved. A low score says *that* he is wrong; this says
     *how*, which is what the tutor and the story need.
  4. **Two kinds of link, not a graph**: what a point *requires* (prerequisites, so the tutor can
     find the root cause of a gap and not quiz what he cannot yet do) and where it is *used*
     (which design cases or episodes rely on it, which drives interleaving and the story).
- **History, not a snapshot.** What he knows is always recomputed from the record of what
  happened, so the memory model can change later without losing anything (design invariant 5).
- **Seeing is not recalling.** Being shown a point (on a wallpaper, in a podcast) is logged as
  exposure, separately from answering. That lets us measure later whether the passive surfaces
  actually help.
- **Evidence has strength.** Deterministic, graded checks are *hard* evidence. A model's
  judgement of free text (the tutor saying "you explained that well") is *soft* evidence: it
  counts, but should be confirmed later by a hard check. How much soft evidence counts is an
  open question.
- **Stable identities.** Points are content with ids that never change, so history is never
  orphaned when lessons are edited.
- **Credit assignment.** When an answer that tests several points is wrong, which point failed?
  Prefer a grader that can name the failed point; otherwise spread a small penalty.
- **Initial generation.** The points are drafted from every lesson once (by a model), stored as
  reviewable content, and re-generated when lessons change, keeping existing ids.
- Existing history must count from day one: answers already recorded against lesson blocks and
  Quickfire questions flow into the points they test.

## The tutor leads; the curriculum stays behind it

Status: **built (first version).** `server/tutor/` and `static/tutor.js`: a card above every
system design, Fundamentals and AI Engineering lesson starts a session in one of five modes
(Teach me, I explain to Jo, Spot the flaws, War room with Priya, Interview with Marcus). The
session replaces the lesson body with a chat, the objectives checklist and the lesson's own
activities, which the tutor brings in and whose answers are recorded exactly as in the lesson
(hard evidence). The tutor's judgements go to the knowledge base as soft evidence and
misconceptions, but only when they quote the learner's own words; objectives only advance the
same way, and a session cannot be ended early by the model. A running note opens the next
session ("Last time: …"). Dictation works in the reply box. Without the model the card says so
and the lesson is unchanged. Runs on `TUTOR_MODEL` (default `openai/gpt-6-luna`, about $0.001
a turn, ~2.5 s). Tested with unit and HTTP tests and end to end in a headless browser on an
in-memory store (desktop and phone widths) with the real model.

Not built yet: the tutor speaking its replies aloud (text-to-speech costs money: Nikhil's call).
The whole knowledge model now has its own view (What you know), and the tutor picks the next
step on each section's Home: see the 2026-10-31 log entry.

Today the lesson script is in charge and the AI only annotates it (planning notes, explaining on
request, grading). Flip it:

- **The tutor drives a conversation.** The lesson becomes the tutor's private teacher's notes:
  its story, objectives, numbers and sources. The tutor teaches from it in its own way, for
  example opening with the lesson's story as a question and digging in from there.
- **The existing interactive blocks become the tutor's tools.** It can bring a predict, estimate,
  simulation, diagram or incident block into the conversation at the right moment. These stay
  deterministic and graded, so they keep producing hard evidence.
- **Objectives are the exit criteria, and they are visible.** A session shows the lesson's
  objectives as a checklist; the tutor's job is to get each one demonstrated by Nikhil, in his
  own words or through a block. That is the structure he can see and compare over time.
- **It remembers him.** After each session the tutor records the misconceptions it saw, and
  opens later sessions with them ("last week you said X; quick one on that"). It connects ideas
  across lessons.
- **Fixed benchmarks stay fixed.** Papers and other fixed assessments are untouched by the AI,
  so the progress trend stays honest.
- **Modes that change the dynamic**: Nikhil teaches a confused junior (explaining is one of the
  strongest ways to learn); critique a deliberately flawed design; an incident war room where
  the tutor plays the logs and dashboards; the interviewer.
- **Voice first.** Talking a design through is closer to the real interview and lowers effort.
- **No-LLM fallback.** The tutor is conversation, so it may require the model (invariant 1's
  exception), but the static lesson stays available and complete without it.

## The story: Nikhil's fictional company

Status: **built (first version).** `server/tutor/story.yaml` (authored, not generated) and
`story.py`: the company is Ripple, a link shortener growing into a global social product; the
cast is Marcus (CTO), Priya (SRE), Jo (junior) and Sam (PM); each lesson area has a scene.
Company size follows the share of points held now (Garage → Global), and eight milestones
unlock when an area is held (for example "Survive a viral day" at 40% of caching). Story events
the tutor records are fed back into later sessions, so consequences carry. The story only dresses
the lesson; the knowledge model still decides what is taught.

Nikhil wants an engaging story behind all of this rather than reading facts, which are not
interesting on their own. He especially likes tying everything to a fictional company he runs.
This theme spans both plans.

- **One company runs through the whole curriculum.** Lessons are the next crisis at *his*
  company, not a list of topics (lessons already name a design case; these become chapters of
  one story).
- **A company bible**: product, cast (CTO, a grumpy SRE, a PM, an investor), current scale. The
  same cast appear in the tutor, the podcast and on Telegram, in character.
- **The company's scale is his progress meter.** It grows from a thousand users to millions to
  global as points become solid; some milestones are gated on knowledge (no European launch
  until replication is solid).
- **Consequences.** A missed incident means the next episode opens with its postmortem. The
  story remembers.
- **Built for a distractible learner.** Every entry point opens with a one-line "previously on…"
  and every touch is self-contained, so coming back costs nothing.
- **The story never chooses the content.** The knowledge model decides what to practise; the
  story decides how it is dressed.

## Costs and model choice

Prices were taken from OpenRouter on 30 October 2026. Estimated monthly cost for this plan:

- Tutor sessions (one 30-minute session a day): about $0.60 on a cheap model such as
  `openai/gpt-5.6-luna`, more on a stronger one. **Never an Anthropic model through
  OpenRouter** (Nikhil's rule: they are far too expensive); the code refuses them. If the tutor
  needs more quality than the default, try a stronger non-Anthropic model first.
- Voice input: about $1. The tutor speaking back: about $5 (Gemini TTS) to $13 (ElevenLabs).
- Initial point generation: a few dollars, one-off.

Across both plans, the earlier estimate was roughly $25–35 a month for a mix that assumed an
Anthropic tutor; without one it falls toward the all-cheap $5–10. Spending decisions are Nikhil's. Side finding: `openai/gpt-6-luna` costs
half as much as the current default `openai/gpt-5.6-luna`, and is worth trying once grading
quality is checked.

## Open decisions (Nikhil's)

- Which model for the tutor, and the monthly budget. Defaulted to `openai/gpt-6-luna` (cheap,
  replies were good in testing); set `TUTOR_MODEL` to change it. Never an Anthropic model.
- How much soft evidence should count toward progress and grades (now: fully, but flagged
  unconfirmed until a hard check agrees).
- Whether the tutor should speak its replies (text-to-speech, paid).

## Log

- 2026-10-30: plan written from the design discussion. Built the central knowledge base: point
  catalog, pure memory model (depth, hard/soft evidence, shared blame, exposures,
  misconceptions, prerequisites, aliases), next-to-practise selection and the HTTP API with
  source tokens for services on the box. Drafted points for every lesson (about $6.50 of
  OpenRouter spend in total, which Nikhil had not wanted: he meant the agent to do it). Linking
  stopped at 28 lessons when the balance ran out; the agent then linked the other 46 lessons and
  mapped the 25 practice items itself, and the script now defaults to agent export/import.
  Checked read-only against real history: existing answers flow in with no migration.
- 2026-10-31: Gaps: a misconception can now be a "gap" (a piece of an idea the learner keeps
  missing, with a question about just that piece), and answers can be partial (weaken memory
  instead of resetting it). The drip opens gaps; the tutor sees them and probes the piece.
- 2026-10-31: Rule added: never an Anthropic model through OpenRouter (CLAUDE.md, enforced in
  `llm.py`). Built the tutor and the story (see their Status sections). Deployed.

- 2026-10-31: Redesign after Nikhil's feedback: the AI work felt like more features bolted on, he
  had no visibility of how good his knowledge is, the pages were busy (tutor card stacked on top
  of the whole old lesson), and he **wants the tutor to be proactive** about what to do next.
  Built: Home with one next step chosen from the knowledge base (`GET /api/tutor/next`); What you
  know (`GET /api/knowledge/report`): score over tested ideas only, coverage, depth, misconceptions,
  trend, per area and lesson; placement checks per area; lessons open as a choice of tutor or
  notes; four sidebar items per section. Also fixed: answers to `-v1` questions were not reaching
  the knowledge base. Tested with unit and HTTP tests and in a headless browser on an in-memory
  copy of the real data (desktop and phone).

## Dropped

- 2026-10-31: the old System Design overview (Today card, case cards, course links), the old
  progress page (knowledge map of question squares, personal bests, stat tiles, topic table,
  design observations table) and the tracks' three-card overview. Nikhil found them busy and they
  gave no sense of how good he is; Home and What you know replace them. Sidebars went from 10
  items (System Design) to 4. The underlying records are untouched.
