"""Vendored lesson widgets: every simulator a lesson embeds is registered, shipped and cache-busted."""
import glob
import os
import re
import subprocess

import pytest

from server import main
from server.system_design_lessons import LessonError, parse
from server.tracks import courses

STATIC = main.STATIC_DIR
LESSON_DIRS = [os.path.join(os.path.dirname(main.__file__), 'system_design_lessons'), courses.HERE]


def registered():
    names = set()
    for f in glob.glob(os.path.join(STATIC, 'sd-sims*.js')) + [os.path.join(STATIC, 'sd-walkthrough.js')]:
        text = open(f, encoding='utf-8').read()
        names |= set(re.findall(r"\b(?:reg|register)\('([a-z0-9-]+)'", text)) | set(re.findall(r"\bregistry\.([a-z0-9]+)\s*=", text))
    widgets = open(os.path.join(STATIC, 'sd-widgets.js'), encoding='utf-8').read()
    block = re.search(r'const WIDGETS = \{(.*?)\};', widgets, re.S).group(1)
    return names, set(re.findall(r"\b([a-z0-9]+): '", block))


def lesson_files():
    return [p for d in LESSON_DIRS for p in glob.glob(os.path.join(d, '**', '*.md'), recursive=True)]


def embedded():
    """(file, simulator name) for every ```sim block in every lesson."""
    found = []
    for path in lesson_files():
        text = open(path, encoding='utf-8').read()
        found += [(os.path.basename(path), n) for n in re.findall(r'^```sim[ \t]*\nname:[ \t]*([a-z0-9-]+)', text, re.M)]
    return found


def test_every_embedded_simulator_is_registered():
    base, widgets = registered()
    assert embedded()
    assert not [(f, n) for f, n in embedded() if n not in base | widgets]


def test_widget_names_are_unique_and_shipped():
    base, widgets = registered()
    assert widgets and not widgets & base, 'a widget would replace a built-in simulator'
    for name in widgets:
        path = f'widgets/internals/{name}.js'
        assert os.path.exists(os.path.join(STATIC, path))
        assert path in main._VERSIONED_ASSETS
    assert 'widgets/shared/vendor-react.js' in main._VERSIONED_ASSETS


def test_widgets_are_used_by_a_lesson():
    _, widgets = registered()
    used = {n for _, n in embedded()}
    assert widgets <= used, 'vendored but never embedded: ' + ', '.join(sorted(widgets - used))


@pytest.mark.skipif(subprocess.run(['which', 'node'], capture_output=True).returncode, reason='node not installed')
def test_widget_modules_load_and_export_mount():
    """Catches a widget that references something its extraction dropped (a ReferenceError at import)."""
    files = sorted(glob.glob(os.path.join(STATIC, 'widgets', '*', '*.js')))
    files = [f for f in files if '/shared/' not in f]
    script = ("const files=process.argv.slice(1);(async()=>{for(const f of files){const m=await import('file://'+f);"
              "if(typeof m.mount!=='function')throw new Error(f+' has no mount()');}})().catch(e=>{console.error(e.stack);process.exit(1)})")
    r = subprocess.run(['node', '-e', script, *files], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr


KEYED = re.compile(r'^```sim[ \t]*\nname: [a-z0-9-]+\nkey: b\d{3}\n.*?^```[ \t]*\n\n?', re.M | re.S)


def test_inserting_keyed_simulators_does_not_renumber_other_blocks():
    """Block keys are stored with progress and knowledge links; a lesson gaining a sim must keep every one."""
    checked = 0
    for path in glob.glob(os.path.join(LESSON_DIRS[0], '*.md')):
        text = open(path, encoding='utf-8').read()
        if not KEYED.search(text):
            continue
        checked += 1
        with_sims, without = parse(text)['blocks'], parse(KEYED.sub('', text))['blocks']
        keys = lambda blocks: [b['key'] for b in blocks if 'key' in b]
        assert [k for k in keys(with_sims) if not re.match(r'^b[1-9]\d{2}$', k)] == keys(without)
    assert checked >= 4


def test_explicit_block_keys_are_validated():
    text = open(os.path.join(LESSON_DIRS[0], 'storage-engines.md'), encoding='utf-8').read()
    with pytest.raises(LessonError):
        parse(text.replace('key: b900', 'key: b1'))
    with pytest.raises(LessonError):
        parse(text.replace('key: b901', 'key: b900'))


def test_visualise_index_matches_the_shipped_animations():
    """Every algorithm listed on the Visualise tab has a module to mount, and the data is well formed."""
    import json
    index = json.load(open(os.path.join(STATIC, 'widgets', 'dsa', 'index.json'), encoding='utf-8'))
    ids = [t['id'] for t in index['topics']]
    assert len(ids) == len(set(ids)) >= 40
    assert {t['category'] for t in index['topics']} == {c for c, _ in index['categories']}
    shipped = {os.path.basename(f)[:-3] for f in glob.glob(os.path.join(STATIC, 'widgets', 'dsa', '*.js'))}
    assert set(ids) == shipped, 'listed without a module, or shipped without being listed'
    for t in index['topics']:
        assert t['difficulty'] in ('easy', 'medium', 'hard') and t['title'] and t['concept'] and t['time'] and t['space']
        assert isinstance(t['pitfalls'], list) and isinstance(t['problems'], list)
    assert 'widgets/dsa/index.json' in main._VERSIONED_ASSETS


def test_walkthrough_lessons_point_at_real_designs():
    import json
    index = {d['id'] for d in json.load(open(os.path.join(STATIC, 'walkthrough', 'index.json'), encoding='utf-8'))['designs']}
    seen = []
    for path in lesson_files():
        text = open(path, encoding='utf-8').read()
        for design in re.findall(r'^name: walkthrough\n(?:.*\n)*?config: \{design: ([a-z0-9-]+)\}', text, re.M):
            seen.append(design)
            assert design in index, (os.path.basename(path), design)
            assert os.path.exists(os.path.join(STATIC, 'walkthrough', design + '.json'))
    assert len(seen) >= 10 and len(seen) == len(set(seen))


def test_simulator_hub_lists_exactly_the_shipped_internals_widgets():
    import json
    topics = json.load(open(os.path.join(STATIC, 'simulators', 'internals.json'), encoding='utf-8'))['topics']
    ids = [t['id'] for t in topics]
    shipped = {os.path.basename(f)[:-3] for f in glob.glob(os.path.join(STATIC, 'widgets', 'internals', '*.js'))}
    assert len(ids) == len(set(ids)) == 32 and set(ids) == shipped
    for t in topics:
        assert t['title'] and t['blurb'] and t['overview'] and t['howItWorks'] and t['difficulty'] in ('easy', 'medium', 'hard')
    cats = {t['category'] for t in topics}
    assert cats == {c for c, _ in json.load(open(os.path.join(STATIC, 'simulators', 'internals.json'), encoding='utf-8'))['categories']}


def test_hub_scripts_are_loaded_in_dependency_order():
    html = open(os.path.join(STATIC, 'index.html'), encoding='utf-8').read()
    order = [m for m in re.findall(r'<script src="/([\w.-]+)\?v=__ASSET_VER__"', html)]
    pos = {n: i for i, n in enumerate(order)}
    for dep, user in [('sd-stress.js', 'sd-walkthrough.js'), ('sd-builder-calc.js', 'sd-builder.js'),
                      ('sd-walkthrough.js', 'sd-simulators.js'), ('sd-builder.js', 'sd-simulators.js'), ('sd-sims.js', 'sd-walkthrough.js')]:
        assert pos[dep] < pos[user], f'{dep} must load before {user}'
    assert 'data-design-view="simulators"' in html
