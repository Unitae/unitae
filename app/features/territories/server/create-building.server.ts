import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { pointInPolygon } from '~/shared/utils/point-in-polygon.server'
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

  const building = await db.building.create({
    data: {
      number: address.number,
      street: address.street,
      zip: address.zip,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      inTerritory: isInTerritory,
      entrances: {
        create: {
          kind: EntranceKind.Residential,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          congregation: { connect: { id: congregationId } },
        },
      },
      congregation: { connect: { id: congregationId } },
    },
    include: {
      entrances: {
        include: {
          buildings: true,
          territories: true,
          accesses: { orderBy: { position: 'asc' } },
          residentialData: true,
        },
      },
      residentialData: true,
    },
  })

  // Create empty BuildingResidentialData linked to the residential entrance
  const residentialEntrance = building.entrances.find(e => e.kind === EntranceKind.Residential)
  if (residentialEntrance != null) {
    await db.buildingResidentialData.create({
      data: {
        building: { connect: { id: building.id } },
        entrance: { connect: { id: residentialEntrance.id } },
        congregation: { connect: { id: congregationId } },
      },
    })
  }

  return building
}
