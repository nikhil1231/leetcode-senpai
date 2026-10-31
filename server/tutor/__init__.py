"""The tutor: a conversation that leads you through a lesson, with the curriculum behind it.

The lesson becomes the tutor's notes, its interactive blocks become tools the tutor brings into
the conversation, and its objectives are the exit criteria shown beside the chat. Every turn
the tutor talks in plain chat while a note-taker records what the learner's latest words show,
validated before anything is stored: evidence must quote the learner's own words. Block answers
stay hard evidence through the lesson's own activity record; the tutor's judgements are soft
evidence in the knowledge base. The story (story.yaml) dresses
it all as one company growing with what you know.

This feature is conversation, so it needs the model and is cleanly unavailable without it; the
static lesson always works. Pure: lessons, story, session. I/O: api.
Intent: docs/plans/tutor-and-knowledge.md.
"""
