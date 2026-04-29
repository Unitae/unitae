import type { Building } from '~/database/generated/client'

import { getTerritoryPolygon } from '~/features/territories/server/get-territory-polygon.server'

import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { pointInPolygon } from '~/shared/utils/point-in-polygon.server'

export async function editBuilding(
  db: TransactionClient,
  buildingId: number,
  {
    address,
    coordinates = {},
    actorId,
  }: {
    address: { number: string; street: string; zip: string }
    coordinates?: { latitude?: number; longitude?: number }
    actorId: number
  },
): Promise<Building> {
  let isInTerritory = true
  if (coordinates.latitude != null && coordinates.longitude != null) {
    const polygon = await getTerritoryPolygon(db)
    if (polygon.length > 0) {
      isInTerritory = pointInPolygon([coordinates.latitude, coordinates.longitude], polygon)
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
  })

  audit({
    action: AuditAction.BuildingUpdated,
    congregationId: building.congregationId,
    actorId,
    entityType: 'Building',
    entityId: buildingId,
  })

  return building
}
