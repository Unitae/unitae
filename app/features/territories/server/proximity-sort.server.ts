import { haversineMeters, type LatLng } from '~/shared/utils/distance'
import { paginationFromUrl } from '~/shared/utils/pagination.server'

export interface ProximityPaginationResult<T> {
  items: T[]
  distances: Map<T, number | null>
  pagination: ReturnType<typeof paginationFromUrl>
  withCoordsCount: number
  withoutCoordsCount: number
}

/**
 * Sort a list by distance from `origin`, push rows without coordinates to the
 * tail (their relative order is preserved), then paginate the combined list
 * using the standard `?page` / `?pageSize` params.
 *
 * `getCoords` returns the closest known point on the row, or `null` when the
 * row has no geocoded building/entrance. Distances are kept in a Map so the
 * caller can render them per row without recomputing.
 */
export function paginateByProximity<T>(
  items: T[],
  origin: LatLng,
  getCoords: (item: T) => LatLng | null,
  url: URL,
): ProximityPaginationResult<T> {
  const distances = new Map<T, number | null>()
  const withCoords: { item: T; distance: number }[] = []
  const withoutCoords: T[] = []

  for (const item of items) {
    const coords = getCoords(item)
    if (coords == null) {
      distances.set(item, null)
      withoutCoords.push(item)
      continue
    }
    const distance = haversineMeters(origin, coords)
    distances.set(item, distance)
    withCoords.push({ item, distance })
  }

  withCoords.sort((a, b) => a.distance - b.distance)

  const ordered: T[] = [...withCoords.map(({ item }) => item), ...withoutCoords]
  const pagination = paginationFromUrl(url, ordered.length)
  const paged = ordered.slice(pagination.offset, pagination.offset + pagination.size)

  return {
    items: paged,
    distances,
    pagination,
    withCoordsCount: withCoords.length,
    withoutCoordsCount: withoutCoords.length,
  }
}

/**
 * Compute the closest point of a territory: prefer `BuildingEntrance` centroid,
 * fall back to the entrance's parent buildings, return `null` if neither side
 * has lat/lng.
 */
// Rejects null/NaN/Infinity — open-data import paths can produce NaN
// coordinates from malformed CSV cells, and a NaN slipping through here
// poisons Haversine sort comparisons silently.
function isUsableCoord(value: number | null): value is number {
  return value != null && Number.isFinite(value)
}

export function closestTerritoryPoint(
  origin: LatLng,
  entrances: Array<{
    latitude: number | null
    longitude: number | null
    buildings: Array<{ latitude: number | null; longitude: number | null }>
  }>,
): LatLng | null {
  let best: { point: LatLng; distance: number } | null = null
  for (const entrance of entrances) {
    if (isUsableCoord(entrance.latitude) && isUsableCoord(entrance.longitude)) {
      const point = { lat: entrance.latitude, lng: entrance.longitude }
      const distance = haversineMeters(origin, point)
      if (best == null || distance < best.distance) best = { point, distance }
    }
    for (const building of entrance.buildings) {
      if (isUsableCoord(building.latitude) && isUsableCoord(building.longitude)) {
        const point = { lat: building.latitude, lng: building.longitude }
        const distance = haversineMeters(origin, point)
        if (best == null || distance < best.distance) best = { point, distance }
      }
    }
  }
  return best?.point ?? null
}
