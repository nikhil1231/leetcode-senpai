"""The clock-driven internals simulators open paused and run on the shared speed (web/src/legacy/sim-clock.js)."""
import pathlib
import re

from scripts import patch_sim_widgets as p

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'web'


def test_every_clocked_widget_is_patched_and_the_patch_is_idempotent():
    for name in p.WIDGETS:
        src = (p.ROOT / f'{name}.js').read_text()
        assert 'window.SimClock.every(' in src, name
        assert not re.search(r'if\(![\w$]+\)return;const [\w$]+=setInterval\(', src), f'{name} still ticks on its own'
        assert '"Auto-tick"' not in src and '"Play"' in src, name
        assert p.patch(src, name) == (src, 'already patched')


def test_no_other_widget_auto_ticks_unpatched():
    for f in (ROOT / 'public' / 'widgets' / 'internals').glob('*.js'):
        if f.stem not in p.WIDGETS:
            assert '"Auto-tick"' not in f.read_text(), f'{f.stem} has an auto-tick the patch does not cover'


def test_sim_clock_loads_before_the_widgets():
    order = (ROOT / 'src' / 'legacy' / 'load.ts').read_text()
    assert order.index('"sim-clock"') < order.index('"sd-widgets"')
