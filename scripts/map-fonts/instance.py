# Static instances of IBM Plex Sans (Google Fonts build, OFL) renamed « Unitae Map »: the OFL reserves the name
# « Plex » for unmodified versions, and SDF glyphs are a modified version.
import json
import pathlib
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Usage: python3 instance.py <folder holding the two variable fonts> <output folder>
SOURCE, OUT = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
JOBS = [
    (SOURCE / 'IBMPlexSans[wdth,wght].ttf', {'wght': 400, 'wdth': 100}, 'Regular'),
    (SOURCE / 'IBMPlexSans[wdth,wght].ttf', {'wght': 500, 'wdth': 100}, 'Medium'),
    (SOURCE / 'IBMPlexSans-Italic[wdth,wght].ttf', {'wght': 400, 'wdth': 100}, 'Italic'),
]
ranges = {}
for path, axes, style in JOBS:
    font = instancer.instantiateVariableFont(TTFont(path), axes)
    name = font['name']
    family = 'Unitae Map'
    full = f'{family} {style}'
    for rec in list(name.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
            name.removeNames(nameID=rec.nameID)
    name.setName(family, 1, 3, 1, 0x409)
    name.setName(style if style in ('Regular', 'Italic') else 'Regular', 2, 3, 1, 0x409)
    name.setName(f'{full};derived from IBM Plex Sans', 3, 3, 1, 0x409)
    name.setName(full, 4, 3, 1, 0x409)
    name.setName(full.replace(' ', ''), 6, 3, 1, 0x409)
    name.setName(family, 16, 3, 1, 0x409)
    name.setName(style, 17, 3, 1, 0x409)
    out = OUT / f'UnitaeMap-{style}.ttf'
    font.save(out)
    # The 256-codepoint glyph ranges this face has something in
    ranges[style] = sorted({codepoint // 256 * 256 for codepoint in font.getBestCmap()})
    print('wrote', out, len(font.getGlyphOrder()), 'glyphs')
(OUT / 'ranges.json').write_text(json.dumps(ranges))
