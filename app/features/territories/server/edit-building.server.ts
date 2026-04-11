import type { Building } from '~/database/generated/client'

import { getTerritoryPolygon } from '~/features/territories/server/get-territory-polygon.server'

import type { TransactionClient } from '~/shared/libs/db.server'
import { pointInPolygon } from '~/shared/libs/point-in-polygon.server'

export async function editBuilding(
  db: TransactionClient,
  buildingId: number,
  {
    address,
    coordinates = {},
  }: {
    address: { number: string; street: string; zip: string }
    coordinates?: { latitude?: number; longitude?: number }
  },
): Promise<Building> {
  let isInTerritory = true
  if (coordinates.latitude != null && coordinates.longitude != null) {
    const polygon = await getTerritoryPolygon(db)
    if (polygon.length > 0) {
      isInTerritory = pointInPolygon([coordinates.latitude, coordinates.longitude], polygon)
    }
  }

  return db.building.update({
    where: {
      id: buildingId,
    },
    data: {
      number: address.number,
      street: address.street,
      zip: address.zip,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      inTerritory: isInTerritory,
    },
  })
}
