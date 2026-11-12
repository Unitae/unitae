import type { Bbox } from '~/features/territories/model/bbox.type'
import type { CardOverlayPath } from '~/features/territories/model/card-overlay'

// The congregation's part of the map: where its maps may go, and the only tiles the instance serves it. It is the
// perimeter drawn in Réglages › Carte de l'assemblée, or else the rectangle around its placed buildings, with a margin
// either way so the edges of the territories keep their surroundings.

/** A fifth of the area's size on each side… */
const MARGIN_SHARE = 0.2
/** …and at least about a kilometre (in degrees of latitude, and of longitude around 45°). */
const MIN_MARGIN_LAT = 0.01
const MIN_MARGIN_LNG = 0.015

/** The rectangle around the points, widened by the margin; null without a point. */
export function areaAround(points: readonly CardOverlayPath[]): Bbox | null {
  if (points.length === 0) return null
  const lats = points.map(point => point.lat)
  const lngs = points.map(point => point.lng)
  const [south, north] = [Math.min(...lats), Math.max(...lats)]
  const [west, east] = [Math.min(...lngs), Math.max(...lngs)]
  const marginLat = Math.max((north - south) * MARGIN_SHARE, MIN_MARGIN_LAT)
  const marginLng = Math.max((east - west) * MARGIN_SHARE, MIN_MARGIN_LNG)
  return {
    swLat: Math.max(south - marginLat, -85.0511),
    swLng: Math.max(west - marginLng, -180),
    neLat: Math.min(north + marginLat, 85.0511),
    neLng: Math.min(east + marginLng, 180),
  }
}

const latOfTileRow = (y: number, n: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI

/** What a web-mercator tile covers, in degrees. */
export function tileBbox(z: number, x: number, y: number): Bbox {
  const n = 2 ** z
  return {
    swLat: latOfTileRow(y + 1, n),
    swLng: (x / n) * 360 - 180,
    neLat: latOfTileRow(y, n),
    neLng: ((x + 1) / n) * 360 - 180,
  }
}

const columnOf = (lng: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(((lng + 180) / 360) * n)))
const rowOf = (lat: number, n: number) => {
  const rad = (lat * Math.PI) / 180
  return Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n)))
}

/** The tiles an area touches at a zoom, as [x, y], row by row from the north-west. */
export function tilesCovering(area: Bbox, z: number): [number, number][] {
  const n = 2 ** z
  const tiles: [number, number][] = []
  for (let y = rowOf(area.neLat, n); y <= rowOf(area.swLat, n); y++) {
    for (let x = columnOf(area.swLng, n); x <= columnOf(area.neLng, n); x++) tiles.push([x, y])
  }
  return tiles
}

export function bboxesOverlap(a: Bbox, b: Bbox): boolean {
  return a.swLat < b.neLat && b.swLat < a.neLat && a.swLng < b.neLng && b.swLng < a.neLng
}

export interface AreaFeature {
  type: 'Feature'
  properties: Record<string, never>
  geometry: { type: 'Polygon'; coordinates: [number, number][][] }
}

/**
 * The area to cut a map file to, as GeoJSON: the perimeter itself when there is one (the tighter shape), else the
 * area's rectangle.
 */
export function areaFeature({ perimeter, area }: { perimeter: CardOverlayPath[] | null; area: Bbox }): AreaFeature {
  const ring: [number, number][] =
    perimeter != null && perimeter.length >= 3
      ? perimeter.map(point => [point.lng, point.lat])
      : [
          [area.swLng, area.swLat],
          [area.neLng, area.swLat],
          [area.neLng, area.neLat],
          [area.swLng, area.neLat],
        ]
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } }
}
