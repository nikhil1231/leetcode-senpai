"""Fundamentals and AI simulators: registered, embedded in a lesson, listed in the hub, loaded in order."""
import json
import os
import re

from server import main
from scripts import build_course_sims as build

STATIC = main.STATIC_DIR


def names(script):
    return set(re.findall(r"\breg\('([a-z0-9-]+)'", open(os.path.join(STATIC, script), encoding='utf-8').read()))


def test_the_hub_catalogue_is_fresh():
    with open(build.OUT, encoding='utf-8') as fh:
        assert json.load(fh) == json.loads(json.dumps(build.build())), 'run scripts/build_course_sims.py'


def test_every_course_simulator_is_embedded_once_and_listed():
    listed = [i['id'] for i in build.build()['items']]
    shipped = set().union(*(names(s) for s in build.SCRIPTS if os.path.exists(os.path.join(STATIC, s))))
    assert len(listed) == len(set(listed)), 'a simulator is embedded in two lessons'
    assert set(listed) == shipped, f'registered but not in a lesson: {shipped - set(listed)}; in a lesson but not registered: {set(listed) - shipped}'
    for item in build.build()['items']:
        assert item['title'] and item['blurb'] or item['id'] == 'migration'
        assert item['challenges'] and item['notes'], item['id']


def test_course_scripts_load_after_their_models_and_the_shared_helpers():
    html = open(os.path.join(STATIC, 'index.html'), encoding='utf-8').read()
    order = re.findall(r'<script src="/([\w.-]+)\?v=__ASSET_VER__"', html)
    for script in build.SCRIPTS:
        if script not in order:
            continue
        models = script.replace('-sims.js', '-models.js')
        assert order.index('sd-sims.js') < order.index(script) and order.index(models) < order.index(script) < order.index('sd-simulators.js')
    assert 'course-sims.css' in html
