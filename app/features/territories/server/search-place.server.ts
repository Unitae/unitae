import type { GeocodeNoticeData } from '~/features/territories/model/geocode-notice.type'
import { geocode } from '~/shared/infra/geocoder.server'
import type { LatLng } from '~/shared/utils/distance'

import { classifySearch } from './search-intent.server'

/**
 * The place a list's search names, to sort by distance from it: an address, or anything after `@`. A name or a
 * number asks the geocoder nothing. The notice says when the place was not found, or when `@` came without one.
 */
export async function resolveSearchPlace(
  search: string,
): Promise<{ origin: LatLng | null; notice: GeocodeNoticeData | null }> {
  const intent = classifySearch(search)
  if (intent.geoQuery == null) {
    return { origin: null, notice: intent.forced ? { kind: 'missing-query' } : null }
  }
  const place = await geocode(intent.geoQuery)
  if (place == null) return { origin: null, notice: { kind: 'failed', query: intent.geoQuery } }
  return { origin: { lat: place.lat, lng: place.lng }, notice: null }
}
