"""Senpai: the learning planner and teacher.

Owns learning evidence, curriculum sequencing, practice sessions, teaching interventions and learning-time
allocation. Job Scout owns career evidence; Senpai reads its bounded context (jobscout.py) and never writes it.
Pure logic: policy, capabilities, sessions, interventions, demand, snapshot. I/O: service, jobscout, daily,
worker, teach, api.
"""
