import { Client, Status } from '@googlemaps/google-maps-services-js'
import { GEOCODER_CACHE_TTL_SECONDS, GEOCODER_MAX_ALTERNATES } from '~/shared/constants/limits'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import logger from './logger.server'
import { redis } from './redis.server'

export interface GeocodeAlternate {
  formatted: string
  placeId: string
}

const LOCATION_TYPES = ['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER', 'APPROXIMATE'] as const
type KnownLocationType = (typeof LOCATION_TYPES)[number]

export interface GeocodeResult {
  formatted: string
  lat: number
  lng: number
  // `OTHER` covers any future Google Maps enum value we haven't pinned —
  // prevents an unchecked widening cast from silently lying at the type
  // level when Google adds e.g. `PLUS_CODE`.
  locationType: KnownLocationType | 'OTHER'
  alternates: GeocodeAlternate[]
}

const CACHE_PREFIX = 'geocode:v1:'
const MAX_KEY_LENGTH = 200
const REQUEST_TIMEOUT_MS = 5000

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

function normalizeLocationType(raw: string | undefined): GeocodeResult['locationType'] {
  return (LOCATION_TYPES as readonly string[]).includes(raw ?? '') ? (raw as KnownLocationType) : 'OTHER'
}

/**
 * Resolve a free-text address to coordinates via the Google Maps Geocoding
 * API. Returns `null` when `GOOGLE_MAPS_API_KEY` is missing — callers must
 * degrade gracefully (text-only search). OK / ZERO_RESULTS responses are
 * cached in Redis for 90 days under a normalized key. Non-OK statuses
 * (REQUEST_DENIED, OVER_QUERY_LIMIT, INVALID_REQUEST, …) are logged at error
 * and NOT cached — caching them would poison results for 90 days on a key
 * outage or quota blip.
 */
export async function geocode(rawQuery: string): Promise<GeocodeResult | null> {
  const query = rawQuery.trim()
  if (query.length === 0) return null

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || apiKey.length === 0) return null

  const cacheRedisKey = cacheKey(query)

  try {
    const cached = await redis.get(cacheRedisKey)
    if (cached != null) {
      // Empty string is the cached "no result" sentinel.
      if (cached.length === 0) return null
      try {
        return JSON.parse(cached) as GeocodeResult
      } catch (parseError) {
        logger.warn('Geocoder cache value malformed; ignoring', {
          query,
          error: (parseError as Error).message,
        })
      }
    }
  } catch (error) {
    logger.warn('Geocoder cache read failed', { query, error: (error as Error).message })
  }

  let result: GeocodeResult | null = null
  let shouldCache = false
  try {
    const response = await getClient().geocode({
      params: { address: query, key: apiKey },
      timeout: REQUEST_TIMEOUT_MS,
    })
    const status = response.data.status
    if (status === Status.OK && response.data.results.length > 0) {
      const [top, ...rest] = response.data.results
      result = {
        formatted: top.formatted_address,
        lat: top.geometry.location.lat,
        lng: top.geometry.location.lng,
        locationType: normalizeLocationType(top.geometry.location_type),
        alternates: rest.slice(0, GEOCODER_MAX_ALTERNATES).map(alt => ({
          formatted: alt.formatted_address,
          placeId: alt.place_id,
        })),
      }
      shouldCache = true
    } else if (status === Status.ZERO_RESULTS) {
      // Genuine miss — cache the empty sentinel so repeat queries don't burn
      // API credits.
      shouldCache = true
    } else {
      logger.error('Geocoder non-OK status; skipping cache', {
        query,
        status,
        errorMessage: response.data.error_message,
      })
    }
  } catch (error) {
    logger.warn('Geocoder call failed', { query, error: (error as Error).message })
    return null
  }

  if (shouldCache) {
    try {
      await redis.set(cacheRedisKey, result == null ? '' : JSON.stringify(result), 'EX', GEOCODER_CACHE_TTL_SECONDS)
    } catch (error) {
      logger.error('Geocoder cache write failed', { query, error: (error as Error).message })
    }
  }

  return result
}
