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

// Memoize formatter instances per-locale: `Intl.NumberFormat` is heavy to
// construct (CLDR lookup), and the call sites render a Distance column per
// row.
const metersFormatters = new Map<string, Intl.NumberFormat>()
const kilometersFormatters = new Map<string, Intl.NumberFormat>()

function getMetersFormatter(locale: string): Intl.NumberFormat {
  const cached = metersFormatters.get(locale)
  if (cached != null) return cached
  const formatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'meter',
    unitDisplay: 'short',
    maximumFractionDigits: 0,
  })
  metersFormatters.set(locale, formatter)
  return formatter
}

function getKilometersFormatter(locale: string): Intl.NumberFormat {
  const cached = kilometersFormatters.get(locale)
  if (cached != null) return cached
  const formatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  })
  kilometersFormatters.set(locale, formatter)
  return formatter
}

/**
 * Below 1000m the value is shown in meters (no decimals); from 1km up it
 * shifts to kilometers with one decimal. Locale controls the decimal/group
 * separator (e.g. `1,2 km` in `fr-FR`, `1.2 km` in `en-GB`).
 */
export function formatDistance(meters: number, locale = 'fr-FR'): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  if (meters < 1000) return getMetersFormatter(locale).format(Math.round(meters))
  return getKilometersFormatter(locale).format(meters / 1000)
}
