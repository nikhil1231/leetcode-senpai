"""Learning tracks beyond LeetCode and system design: one registry, one record store per track.

Course tracks (Fundamentals, AI Engineering) reuse the system-design lesson format and block
renderer; Experience (stories, behavioural drills, CV deep dives) and Practical Coding
(multi-file exercises run in the browser) have their own content. Every track reports answer
events to the generic knowledge ledger, so progress, mistakes and due items work the same way.
Senpai buckets: Experience is `behavioural`; the others are the role `stack`.
"""

TRACKS = {
    'fundamentals': {'title': 'Fundamentals', 'kind': 'course', 'bucket': 'stack',
                     'blurb': 'Languages, Linux, networking, databases, cloud and delivery: the role-stack questions.'},
    'ai': {'title': 'AI Engineering', 'kind': 'course', 'bucket': 'stack',
           'blurb': 'The AI-assisted coding round, then LLMs, retrieval, evals, agents and AI system design: what AI engineering interviews ask.'},
    'experience': {'title': 'Experience', 'kind': 'experience', 'bucket': 'behavioural',
                   'blurb': 'A story bank from your CV, timed behavioural answers and technical deep dives on your own work.'},
    'practical': {'title': 'Practical Coding', 'kind': 'practical', 'bucket': 'stack',
                  'blurb': 'Build, extend, debug and review realistic code, the way practical rounds do.'},
}
