import type { CardOverlay, CardOverlayPath } from '~/features/territories/model/card-overlay'

const STATIC_MAP_BASE = 'https://maps.googleapis.com/maps/api/staticmap'
const FALLBACK_ZOOM = 15
const PERIMETER_HEX = '#6B7280'

export interface BuildStaticMapUrlParams {
  apiKey: string
  mapId?: string | null
  size: string
  scale: number
  marker?: { lat: number; lng: number } | null
  overlays: CardOverlay[]
  /**
   * Optional congregation perimeter. Drawn in gray as a fallback **only** when no overlays
   * are configured — when the assembly has zones, those already cover the same area and
   * drawing the perimeter would just thicken every line.
   */
  perimeter?: CardOverlayPath[] | null
}

function hexToStaticMapColor(hex: string): string {
  return `0x${hex.slice(1)}`
}

function overlayPathParam(overlay: CardOverlay): string {
  const stroke = `${hexToStaticMapColor(overlay.color)}ff`
  const fill = `${hexToStaticMapColor(overlay.color)}80`
  const segments = [`color:${stroke}`, 'weight:1', `fillcolor:${fill}`]
  for (const point of overlay.paths) {
    segments.push(`${point.lat},${point.lng}`)
  }
  return segments.join('|')
}

function perimeterPathParam(paths: CardOverlayPath[]): string {
  const stroke = `${hexToStaticMapColor(PERIMETER_HEX)}ff`
  const fill = `${hexToStaticMapColor(PERIMETER_HEX)}20`
  const segments = [`color:${stroke}`, 'weight:1', `fillcolor:${fill}`]
  for (const point of paths) {
    segments.push(`${point.lat},${point.lng}`)
  }
  return segments.join('|')
}

export function buildTerritoryStaticMapUrl(params: BuildStaticMapUrlParams): string {
  const search = new URLSearchParams()
  search.set('size', params.size)
  search.set('scale', String(params.scale))
  search.set('maptype', 'roadmap')
  if (params.mapId != null && params.mapId.length > 0) search.set('map_id', params.mapId)
  if (params.marker != null) {
    search.set('markers', `color:yellow|${params.marker.lat},${params.marker.lng}`)
  }

  const perimeterIsDrawn =
    params.overlays.length === 0 && params.perimeter != null && params.perimeter.length >= 3

  // Auto-fit when at least one marker, overlay, or fallback perimeter is present; otherwise fall
  // back to the marker alone with a sane default zoom. With no marker, no overlays, and no
  // perimeter the map page should not be rendered at all (caller is responsible).
  if (params.marker == null && params.overlays.length === 0 && !perimeterIsDrawn) {
    search.set('zoom', String(FALLBACK_ZOOM))
  } else if (params.marker != null && params.overlays.length === 0 && !perimeterIsDrawn) {
    search.set('zoom', String(FALLBACK_ZOOM))
  }

  search.set('key', params.apiKey)

  const query = search.toString()
  const paths: string[] = params.overlays.map(overlay => `path=${encodeURIComponent(overlayPathParam(overlay))}`)
  if (perimeterIsDrawn && params.perimeter != null) {
    paths.push(`path=${encodeURIComponent(perimeterPathParam(params.perimeter))}`)
  }

  if (paths.length === 0) return `${STATIC_MAP_BASE}?${query}`
  return `${STATIC_MAP_BASE}?${query}&${paths.join('&')}`
}
