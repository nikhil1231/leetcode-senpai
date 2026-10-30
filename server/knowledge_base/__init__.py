"""The knowledge base: one central, source-agnostic model of what you know.

A knowledge point is one idea worth holding (a fact, principle, mechanism, trade-off or
procedure). Points are drafted from the lessons by `scripts/generate_knowledge_points.py` and
kept as reviewable content in `points/<section>/<lesson>.yaml`, with the lesson's item → point
map. Ids never change: a point that stops being taught is retired, and a duplicate of an earlier
point becomes an alias of it.

Evidence is the source of truth and what you hold is recomputed from it. Lesson, Quickfire,
paper and drill answers already recorded flow in through the item map, so history counts
without a migration. Any other source (the tutor, Telegram, the Threads card, the phone) posts
answers, exposures and misconceptions through `/api/knowledge`.

Pure: catalog (after load), model, sources. I/O: api. Intent: docs/plans/tutor-and-knowledge.md.
"""
