import type { Building } from '~/database/generated/client'

import { getPerimeterPaths } from '~/features/territories/server/perimeter.server'

import type { TransactionClient } from '~/shared/infra/db.server'
import { pointInPolygon } from '~/shared/utils/point-in-polygon.server'
import { recalculateEntranceCentroid } from './update-buildings-in-entrance.server'

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
    const perimeter = await getPerimeterPaths(db)
    if (perimeter != null) {
      isInTerritory = pointInPolygon(
        [coordinates.latitude, coordinates.longitude],
        perimeter.map(p => [p.lat, p.lng]),
      )
    }
  }

  const building = await db.building.update({
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
    include: { entrances: { select: { id: true } } },
  })

  for (const entrance of building.entrances) {
    await recalculateEntranceCentroid(db, entrance.id)
  }

  return building
}
