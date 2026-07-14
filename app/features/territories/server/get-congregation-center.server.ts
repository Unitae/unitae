import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Average lat/lng of the congregation's active buildings — the "here we are" point
 * used to center a fresh map before any entrance has been picked. Returns null when
 * the congregation has no geocoded buildings yet.
 */
export async function getCongregationCenter(
  db: TransactionClient,
  congregationId: number,
): Promise<{ lat: number; lng: number } | null> {
  const result = await db.building.aggregate({
    where: { congregationId, active: true, latitude: { not: null }, longitude: { not: null } },
    _avg: { latitude: true, longitude: true },
  })

  const lat = result._avg.latitude
  const lng = result._avg.longitude
  if (lat == null || lng == null) return null
  return { lat, lng }
}
