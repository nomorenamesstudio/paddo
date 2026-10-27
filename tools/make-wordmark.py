#!/usr/bin/env python3
"""Turns the wordmark into outlines, so the ō never depends on the webfont.

Writes src/web/assets/wordmark.svg: one <path> per glyph, positioned by advance width,
filled with currentColor so the theme controls it.

Usage: python3 tools/make-wordmark.py
"""
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from pathlib import Path

FONT = Path('public/fonts/young-serif.woff2')
TEXT = 'Paddō'
OUT = Path('src/web/assets/wordmark.svg')

font = TTFont(FONT)
glyph_set = font.getGlyphSet()
cmap = font.getBestCmap()
units = font['head'].unitsPerEm
hmtx = font['hmtx']

pen_paths = []
x = 0
bounds = []
for char in TEXT:
    name = cmap[ord(char)]
    glyph = glyph_set[name]
    pen = SVGPathPen(glyph_set)
    glyph.draw(pen)
    d = pen.getCommands()
    if d:
        pen_paths.append((x, d))
    bounds_pen = BoundsPen(glyph_set)
    glyph.draw(bounds_pen)
    if bounds_pen.bounds:
        x_min, y_min, x_max, y_max = bounds_pen.bounds
        bounds.append((x + x_min, y_min, x + x_max, y_max))
    x += hmtx[name][0]

# Crop the box to the ink: a viewBox padded with ascender and descender space makes the
# logo look smaller than its CSS height, because most of that height is empty.
top = max(entry[3] for entry in bounds)
bottom = min(entry[1] for entry in bounds)
left = min(entry[0] for entry in bounds)
right = max(entry[2] for entry in bounds)
width = right - left
height = top - bottom
ascender = top
min_x = left

parts = []
for offset, d in pen_paths:
    parts.append(
        f'<path transform="translate({offset - left} {ascender}) scale(1 -1)" d="{d}" />'
    )

# No role or label in the file: the heading that hosts it carries the name.
svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
    f'fill="currentColor" aria-hidden="true" focusable="false">\n  '
    + '\n  '.join(parts)
    + '\n</svg>\n'
)
OUT.write_text(svg, encoding='utf-8')
print(f'wrote {OUT} ({OUT.stat().st_size} bytes, viewBox 0 0 {width} {height}, ratio {width / height:.2f})')
