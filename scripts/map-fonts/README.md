# Map label glyphs

MapLibre draws map labels from glyph files (signed distance fields, one file per 256 codepoints). The app serves
its own from `public/map-fonts/`: no font service is called. The style asks for three stacks, `Unitae Map Regular`,
`Unitae Map Medium` and `Unitae Map Italic` (`MAP_FONTS` in `@unitae/tokens/map-style`).

They are IBM Plex Sans, the app's typeface, turned into glyphs. IBM Plex is under the SIL Open Font License 1.1 with
the Reserved Font Name "Plex", and glyphs are a modified version, so they carry another name. The licences and the
notice ship next to them (`public/map-fonts/*.txt`).

Where Plex has no glyph in a range it does cover, Noto Sans fills it in. Ranges Plex does not cover at all (Arabic,
Hebrew, Devanagari…) are not shipped: `app/shell/map-fonts.tsx` answers them with Noto Sans from the
`smp-noto-glyphs` package. CJK and Hangul come back empty — MapLibre draws those itself.

## Rebuild

Only needed when the typeface changes. The inputs are pinned:

- IBM Plex Sans, Google Fonts build: `google/fonts` commit `0b58fb370093f9a9f4ff785d94405710b79de67c`,
  `ofl/ibmplexsans/IBMPlexSans[wdth,wght].ttf` and `IBMPlexSans-Italic[wdth,wght].ttf`
- `fontnik` 0.7.7 (Mapbox's glyph generator; its npm package ships prebuilt binaries)
- `smp-noto-glyphs` 2.0.0
- Python with `fonttools`

```sh
# 1. Static Regular / Medium / Italic instances, renamed "Unitae Map", and the ranges each covers
python3 scripts/map-fonts/instance.py <folder with the two .ttf> <instances folder>

# 2. One glyph file per range, Plex first, Noto Sans filling the gaps
node scripts/map-fonts/generate.mjs <instances folder> <fontnik package folder> \
  <smp-noto-glyphs package folder> public/map-fonts
```

`fontnik` is not a dependency of the app: unpack it from its npm tarball (`npm pack fontnik@0.7.7`). The Noto
glyphs are the app's own `node_modules/smp-noto-glyphs`.
