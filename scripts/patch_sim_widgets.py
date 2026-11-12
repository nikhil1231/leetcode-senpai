"""Make the auto-ticking internals simulators open paused, pause on Reset, and run at the shared speed.

The widgets in web/public/widgets/internals/ are prebuilt React bundles with no source here, so this rewrites
the few spots that matter (see web/src/legacy/sim-clock.js). Idempotent: a patched file is left alone.

    python scripts/patch_sim_widgets.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'web' / 'public' / 'widgets' / 'internals'
WIDGETS = ['raft', 'bully', 'cap', 'quorum', 'twopc', 'replanomalies', 'tcp']
OWN_SPEED = {'tcp'}   # already has its own speed slider
ID = r'[\w$]+'


def patch(src, name):
    if 'SimClock' in src:
        return src, 'already patched'
    # The auto-tick effect: `if(!X)return;const T=setInterval(F,N);return()=>clearInterval(T)`
    m = re.search(rf'if\(!({ID})\)return;const ({ID})=setInterval\(({ID}),(\d+)\)', src)
    if not m:
        raise SystemExit(f'{name}: auto-tick effect not found')
    auto, timer, fn, ms = m.groups()
    src = src.replace(m.group(0), f'if(!{auto})return;const {timer}=window.SimClock.every({fn},{ms})', 1)
    # Open paused: `[X,setX]=h.useState(!0)` -> `!1`
    m = re.search(rf'\[{re.escape(auto)},({ID})\]=h\.useState\(!0\)', src)
    if not m:
        raise SystemExit(f'{name}: auto-tick state not found')
    setter = m.group(1)
    src = src.replace(m.group(0), f'[{auto},{setter}]=h.useState(!1)', 1)
    # Ticks advance by the chosen speed while playing; Step stays one full tick.
    if name in OWN_SPEED:
        src, n = re.subn(r'const M=40\*p,', 'const M=40*p*window.SimClock.scale(),', src, count=1)
    else:
        src, n = re.subn(rf'\.tick\((\d+)\)', r'.tick(\1*window.SimClock.scale())', src, count=1)
    if n != 1:
        raise SystemExit(f'{name}: tick call not found')
    # Toolbar: Play/Pause, Step, Reset (which also pauses), then the speed slider.
    m = re.search(rf'children:{re.escape(auto)}\?"Pause":"Auto-tick"\}}\),e\.jsx\("button",\{{onClick:({ID}),disabled:{re.escape(auto)},children:"Step"\}}\),e\.jsx\("button",\{{onClick:(.+?),children:"Reset"\}}\)', src)
    if not m:
        raise SystemExit(f'{name}: toolbar not found')
    step, reset = m.groups()
    reset_call = f'({reset})()' if reset.startswith('(') or '=>' in reset else f'{reset}()'
    speed = '' if name in OWN_SPEED else ',e.jsx("span",{ref:window.SimClock.control})'
    src = src.replace(m.group(0), f'children:{auto}?"Pause":"Play"}}),e.jsx("button",{{onClick:{step},disabled:{auto},children:"Step"}}),'
                      f'e.jsx("button",{{onClick:()=>{{{setter}(!1);{reset_call}}},children:"Reset"}}){speed}', 1)
    return src, 'patched'


def main():
    for name in WIDGETS:
        path = ROOT / f'{name}.js'
        out, status = patch(path.read_text(), name)
        if out != path.read_text():
            path.write_text(out)
        print(f'{name}: {status}')


if __name__ == '__main__':
    sys.exit(main())
