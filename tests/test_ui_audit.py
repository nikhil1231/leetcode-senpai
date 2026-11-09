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


# ---- section colour identities (static/themes.css) ---------------------------------------------

def _lum(hex_):
    h = hex_.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= .03928 else ((c + .055) / 1.055) ** 2.4
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b)


def _contrast(a, b):
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + .05) / (lb + .05)


def _hsl_hex(h, s, l):
    import colorsys
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s / 100)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))


def _themes():
    css = open('static/themes.css', encoding='utf-8').read()
    out = {}
    for m in re.finditer(r'body\[data-section="([a-z-]+)"\]\s*\{([^}]*)\}', css):
        props = dict(re.findall(r'--([a-z0-9-]+):\s*([^;]+);', m.group(2)))
        if 'accent' in props:
            out[m.group(1)] = props
    return css, out


def test_every_section_has_a_colour_identity():
    css, themes = _themes()
    html = open('static/index.html', encoding='utf-8').read()
    ids = set(re.findall(r'data-section="([a-z-]+)" class="section-option"', html))
    assert ids >= {'leetcode', 'system-design', 'fundamentals', 'ai', 'experience', 'practical', 'readiness'}
    for sid in ids:
        assert f'--sec-{sid}:' in css, f'{sid} has no --sec-{sid} token in themes.css'
        if sid != 'leetcode':   # LeetCode is the base theme in style.css
            assert sid in themes, f'{sid} has no body[data-section="{sid}"] block in themes.css'
            assert {'h', 'accent', 'accent-rgb', 'on-accent'} <= set(themes[sid]), f'{sid} theme is incomplete'


def test_section_accents_are_legible():
    """Accent text on the section's panel, and the dark label on an accent button, both meet WCAG AA."""
    _, themes = _themes()
    for sid, p in themes.items():
        panel = _hsl_hex(float(p['h']), 13, 10.5)
        assert _contrast(p['accent'].strip(), panel) >= 4.5, f'{sid}: accent text on its panel is too faint'
        assert _contrast(p['on-accent'].strip(), p['accent'].strip()) >= 4.5, f'{sid}: button label on accent is too faint'
