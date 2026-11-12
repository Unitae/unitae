import { notoGlyphFallback } from 'smp-noto-glyphs'
import type { Route } from './+types/map-fonts'

// Map label glyphs the app does not ship in `public/map-fonts`: the ranges of scripts the map fonts do not cover
// (Arabic, Hebrew, Devanagari…), answered with Noto Sans. The files in `public/` are served before this route is
// reached, so it only sees the other ranges. CJK and Hangul come back empty: MapLibre draws them itself.

const RANGE = /^(\d{1,5})-(\d{1,5})\.pbf$/

export function loader({ params }: Route.LoaderArgs) {
  const match = RANGE.exec(params.range)
  const start = Number(match?.[1])
  const end = Number(match?.[2])
  if (match == null || start % 256 !== 0 || end !== start + 255 || end > 65535) {
    return new Response(null, { status: 400 })
  }
  return notoGlyphFallback(params.fontstack, `${start}-${end}`)
}
