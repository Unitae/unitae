import { Client, Status } from '@googlemaps/google-maps-services-js'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import logger from './logger.server'
import { redis } from './redis.server'

export interface GeocodeAlternate {
  formatted: string
  placeId: string
}

export interface GeocodeResult {
  formatted: string
  lat: number
  lng: number
  locationType: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE'
  alternates: GeocodeAlternate[]
}

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 90 // 90 days — geocoded addresses are stable
const CACHE_PREFIX = 'geocode:v1:'
const MAX_KEY_LENGTH = 200

// Lazy so the `new Client()` construct call is delayed until first geocode —
// the import side-effect would otherwise force test mocks into constructor
// mode at the wrong moment.
let client: Client | null = null
function getClient(): Client {
  if (client == null) client = new Client({})
  return client
}

function cacheKey(query: string): string {
  return `${CACHE_PREFIX}${stripDiacritics(query).trim().slice(0, MAX_KEY_LENGTH)}`
}

/**
 * Resolve a free-text address to coordinates via the Google Maps Geocoding
 * API. Returns `null` when `GOOGLE_MAPS_API_KEY` is missing — callers must
 * degrade gracefully (text-only search). Results (including misses) are cached
 * in Redis for 90 days under a normalized key so users repeating the same
 * query don't burn API credits.
 */
export async function geocode(rawQuery: string): Promise<GeocodeResult | null> {
  const query = rawQuery.trim()
  if (query.length === 0) return null

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || apiKey.length === 0) return null

  const key = cacheKey(query)

  try {
    const cached = await redis.get(key)
    if (cached != null) {
      // Empty string is the cached "no result" sentinel.
      if (cached.length === 0) return null
      return JSON.parse(cached) as GeocodeResult
    }
  } catch (error) {
    logger.warn('Geocoder cache read failed', { error: (error as Error).message })
  }

  let result: GeocodeResult | null = null
  try {
    const response = await getClient().geocode({ params: { address: query, key } })
    if (response.data.status === Status.OK && response.data.results.length > 0) {
      const [top, ...rest] = response.data.results
      result = {
        formatted: top.formatted_address,
        lat: top.geometry.location.lat,
        lng: top.geometry.location.lng,
        locationType: top.geometry.location_type as GeocodeResult['locationType'],
        alternates: rest.slice(0, 2).map(alt => ({
          formatted: alt.formatted_address,
          placeId: alt.place_id,
        })),
      }
    }
  } catch (error) {
    logger.warn('Geocoder call failed', { query, error: (error as Error).message })
    return null
  }

  try {
    await redis.set(key, result == null ? '' : JSON.stringify(result), 'EX', CACHE_TTL_SECONDS)
  } catch (error) {
    logger.warn('Geocoder cache write failed', { error: (error as Error).message })
  }

  return result
}
