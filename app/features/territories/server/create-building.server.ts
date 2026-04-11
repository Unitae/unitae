import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import type { TransactionClient } from '~/shared/libs/db.server'
import { pointInPolygon } from '~/shared/libs/point-in-polygon.server'
import { getTerritoryPolygon } from './get-territory-polygon.server'

export async function createBuilding(
  db: TransactionClient,
  {
    address,
    coordinates = {},
    congregationId,
  }: {
    address: { number: string; street: string; zip: string }
    coordinates?: { latitude?: number; longitude?: number }
    congregationId: number
  },
): Promise<DetailedBuilding> {
  let isInTerritory = true
  if (coordinates.latitude != null && coordinates.longitude != null) {
    const polygon = await getTerritoryPolygon(db)
    if (polygon.length > 0) {
      isInTerritory = pointInPolygon([coordinates.latitude, coordinates.longitude], polygon)
    }
  }

  return db.building.create({
    data: {
      number: address.number,
      street: address.street,
      zip: address.zip,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      inTerritory: isInTerritory,
      entrance: { create: { congregation: { connect: { id: congregationId } } } },
      congregation: { connect: { id: congregationId } },
    },
    include: {
      entrance: { include: { buildings: true, territories: true } },
    },
  })
}
