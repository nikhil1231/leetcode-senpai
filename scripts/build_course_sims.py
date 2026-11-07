"""Write static/simulators/courses.json: the Fundamentals and AI simulators for the simulator hub.

Each entry comes from the ```sim block that embeds it in a course lesson (title, intro, takeaway),
so the hub and the lessons say the same thing. Run it after adding or editing a course simulator;
tests/test_course_sims.py fails while the file is stale.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
OUT = os.path.join(HERE, '..', 'static', 'simulators', 'courses.json')
SECTIONS = [('fundamentals', 'Fundamentals'), ('ai', 'AI engineering')]
SCRIPTS = ('fund-sims.js', 'ai-sims.js')


def build():
    from server.tracks import courses
    items = []
    for section, label in SECTIONS:
        for lid, lesson in courses.lessons(section).items():
            for b in lesson['blocks']:
                if b['type'] != 'sim' or b.get('name') in ('dns', 'tcp', 'tls', 'http'):   # vendored internals widgets are listed already
                    continue
                items.append({'id': b['name'], 'title': b.get('title') or b['name'], 'blurb': (b.get('intro') or '').strip(),
                              'notes': (b.get('takeaway') or '').strip(), 'category': section, 'categoryLabel': label,
                              'lesson': lid, 'lessonTitle': lesson['title'],
                              'challenges': [c['text'] for c in b.get('challenges') or []]})
    return {'categories': [list(s) for s in SECTIONS], 'items': items}


if __name__ == '__main__':
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(build(), fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f'wrote {OUT}')
