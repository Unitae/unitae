export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_METERS = 6_371_000

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Great-circle distance between two points in meters via the Haversine
 * formula. Accurate enough for territory-scale (sub-100km) distances.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

const metersFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'unit',
  unit: 'meter',
  unitDisplay: 'short',
  maximumFractionDigits: 0,
})

const kilometersFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'unit',
  unit: 'kilometer',
  unitDisplay: 'short',
  maximumFractionDigits: 1,
})

/**
 * Formats a distance in meters as a French string. Below 1000m the value is
 * shown in meters (no decimals); from 1km up it shifts to kilometers with one
 * decimal place.
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  if (meters < 1000) return metersFormatter.format(Math.round(meters))
  return kilometersFormatter.format(meters / 1000)
}
