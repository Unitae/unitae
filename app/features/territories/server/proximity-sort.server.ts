import { haversineMeters, type LatLng } from '~/shared/utils/distance'

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
