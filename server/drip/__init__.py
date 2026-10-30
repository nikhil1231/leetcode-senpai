"""The Telegram drip: a few questions a day, wherever you are, answered by text, voice or a tap.

Cards come from the knowledge base (open misconceptions, shaky and fading points first, then
points you have seen, then new ideas from lessons you have started) and arrive in the voice of
the story's cast. A typed or spoken answer is graded against the point's claim by the model
(soft evidence); without the model you see the answer and grade yourself. A skipped or expired
card is recorded as an exposure. Everything lands in the knowledge base with source "telegram".

Runs as a background task inside the app, only where TELEGRAM_BOT_TOKEN is set (the box), so one
process owns the bot. Pure: cards. I/O: telegram (transport), bot (handlers and the loop).
Intent: docs/plans/ambient-learning.md.
"""
