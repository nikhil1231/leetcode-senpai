"""Coding Practice: Code Reading (comprehension, bug localisation, repair) and AI-Assisted sessions.

One exercise schema and one workspace serve both modes. Exercises are generated in the background, validated, and kept
in a small ready queue (`queue`), so starting one never waits on a model. Records live in the per-user track store
(`coding_ex` holds exercises, `coding` holds attempts), so progress is read from the same place as the other tracks.
Everything the learner must not see before submitting (hidden tests, expected findings, the reference fix, the rubric and
planted-mistake notes) lives only in the stored exercise; `spec.public` is the one function that builds what is sent out.
"""
