import type { CardOverlay } from '~/features/territories/model/card-overlay'

const STATIC_MAP_BASE = 'https://maps.googleapis.com/maps/api/staticmap'
const FALLBACK_ZOOM = 15

export interface BuildStaticMapUrlParams {
  apiKey: string
  mapId?: string | null
  size: string
  scale: number
  marker?: { lat: number; lng: number } | null
  overlays: CardOverlay[]
}

function hexToStaticMapColor(hex: string): string {
  return `0x${hex.slice(1)}`
}

function pathParam(overlay: CardOverlay): string {
  const stroke = `${hexToStaticMapColor(overlay.color)}ff`
  const fill = `${hexToStaticMapColor(overlay.color)}80`
  const segments = [`color:${stroke}`, 'weight:1', `fillcolor:${fill}`]
  for (const point of overlay.paths) {
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

  // Auto-fit when at least one marker or overlay is present; otherwise fall back to the marker
  // alone with a sane default zoom. With no marker and no overlays the map page should not be
  // rendered at all (caller is responsible).
  if (params.marker == null && params.overlays.length === 0) {
    search.set('zoom', String(FALLBACK_ZOOM))
  } else if (params.marker != null && params.overlays.length === 0) {
    search.set('zoom', String(FALLBACK_ZOOM))
  }

  search.set('key', params.apiKey)

  const query = search.toString()
  const paths = params.overlays.map(overlay => `path=${encodeURIComponent(pathParam(overlay))}`).join('&')

  if (paths.length === 0) return `${STATIC_MAP_BASE}?${query}`
  return `${STATIC_MAP_BASE}?${query}&${paths}`
}
