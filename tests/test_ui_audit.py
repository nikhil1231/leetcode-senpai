"""Static UI audit: rules from docs/design-system.md that can be checked in the stylesheets and index.html."""
import glob
import re

CSS = sorted(glob.glob('static/*.css'))
MIN_PX = 11


def _sizes(css):
    for m in re.finditer(r'font-size:\s*([0-9.]+)px', css):
        yield float(m.group(1)), m.start()
    for m in re.finditer(r'font:\s*(?:(?:italic|bold|normal|[1-9]00)\s+)?([0-9.]+)px', css):
        yield float(m.group(1)), m.start()


def test_no_text_below_the_type_floor():
    bad = []
    for f in CSS:
        css = open(f, encoding='utf-8').read()
        bad += [f'{f}:{css.count(chr(10), 0, pos) + 1} {size}px' for size, pos in _sizes(css) if size < MIN_PX]
    assert not bad, 'Text smaller than 11px (see docs/design-system.md):\n' + '\n'.join(bad)


def test_every_asset_in_index_exists():
    html = open('static/index.html', encoding='utf-8').read()
    for path in re.findall(r'(?:src|href)="/([^"?]+)\?v=__ASSET_VER__"', html):
        assert glob.glob('static/' + path), f'index.html references static/{path}, which does not exist'


def test_icon_only_buttons_are_labelled():
    html = open('static/index.html', encoding='utf-8').read()
    for m in re.finditer(r'<button\b([^>]*)>(.*?)</button>', html, re.S):
        attrs, inner = m.group(1), re.sub(r'<svg.*?</svg>', '', m.group(2), flags=re.S)
        if re.search(r'class="[^"]*\bhidden\b', attrs):   # filled with text by script when shown
            continue
        if not re.sub(r'<[^>]+>|\s', '', inner):
            assert 'aria-label' in attrs or 'title=' in attrs, f'Unlabelled icon-only button: <button{attrs[:80]}'
