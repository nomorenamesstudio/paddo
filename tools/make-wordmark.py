#!/usr/bin/env python3
"""Turns the wordmark into outlines, so the ō never depends on the webfont.

Writes src/web/assets/wordmark.svg: one <path> per glyph, positioned by advance width,
filled with currentColor so the theme controls it.

Usage: python3 tools/make-wordmark.py
"""
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
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
for char in TEXT:
    name = cmap[ord(char)]
    glyph = glyph_set[name]
    pen = SVGPathPen(glyph_set)
    glyph.draw(pen)
    d = pen.getCommands()
    if d:
        pen_paths.append((x, d))
    x += hmtx[name][0]

# Font units go up, SVG goes down: flip on the ascender line, keep font units so the
# viewBox and the transforms agree.
height = font['OS/2'].sTypoAscender - font['OS/2'].sTypoDescender
ascender = font['OS/2'].sTypoAscender

parts = []
for offset, d in pen_paths:
    parts.append(f'<path transform="translate({offset} {ascender}) scale(1 -1)" d="{d}" />')

# No role or label in the file: the heading that hosts it carries the name.
svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {x} {height}" '
    f'fill="currentColor" aria-hidden="true" focusable="false">\n  '
    + '\n  '.join(parts)
    + '\n</svg>\n'
)
OUT.write_text(svg, encoding='utf-8')
print(f'wrote {OUT} ({OUT.stat().st_size} bytes, viewBox 0 0 {x} {height})')
