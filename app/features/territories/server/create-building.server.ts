import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { pointInPolygon } from '~/shared/utils/point-in-polygon.server'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import { getPerimeterPaths } from './perimeter.server'

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
    const perimeter = await getPerimeterPaths(db)
    if (perimeter != null) {
      isInTerritory = pointInPolygon(
        [coordinates.latitude, coordinates.longitude],
        perimeter.map(p => [p.lat, p.lng]),
      )
    }
  }

  const building = await db.building.create({
    data: {
      number: address.number,
      street: address.street,
      streetNormalized: stripDiacritics(address.street),
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
