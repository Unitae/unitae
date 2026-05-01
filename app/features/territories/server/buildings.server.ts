import type { Building, Prisma } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { AggregatedEntrance, Entrance } from '~/shared/types/entrance'
import { paginationFromUrl } from '~/shared/utils/pagination.server'

export const entranceKindForTerritoryType: Record<TerritoryKind, EntranceKind> = {
  [TerritoryKind.Classical]: EntranceKind.Residential,
  [TerritoryKind.Phone]: EntranceKind.Residential,
  [TerritoryKind.Commerces]: EntranceKind.Commerce,
  [TerritoryKind.Hotel]: EntranceKind.Hotel,
  [TerritoryKind.Univ]: EntranceKind.Campus,
}

export type BboxEntranceStatus = 'in-this-territory' | 'available' | 'on-other-territory'

export type BboxEntrance = {
  id: number
  latitude: number
  longitude: number
  kind: EntranceKind
  shopKind: string
  homes: number
  phones: number
  liberals: number
  address: { number: string; street: string; zip: string }
  status: BboxEntranceStatus
  otherTerritory: { id: number; number: string } | null
}

function sortBuildingsByAddress<T extends { zip: string; street: string; number: string }>(buildings: T[]) {
  buildings.sort((a, b) => {
    if (a.zip === b.zip && a.street === b.street) {
      return a.number.localeCompare(b.number, 'fr', { numeric: true, sensitivity: 'base' })
    }
    return 0
  })
  return buildings
}

function sortEntrancesByAddress(entrances: Entrance[]) {
  entrances.sort((a, b) => {
    const buildingA = a.buildings[0]
    const buildingB = b.buildings[0]

    if (buildingA?.zip === buildingB?.zip && buildingA?.street === buildingB?.street) {
      return buildingA?.number.localeCompare(buildingB?.number, 'fr', { numeric: true, sensitivity: 'base' })
    }
    return 0
  })
  return entrances
}

const entranceInclude = {
  buildings: true,
  accesses: { orderBy: { position: 'asc' as const } },
}

export async function findBuildingsPaginated(
  db: TransactionClient,
  selectors: Prisma.BuildingWhereInput,
  url: URL,
  congregationId: number,
) {
  const totalBuildings = await db.building.count({ where: { ...selectors, congregationId } })
  const pagination = paginationFromUrl(url, totalBuildings)

  const buildings = await db.building.findMany({
    skip: pagination.offset,
    take: pagination.size,
    where: { ...selectors, congregationId },
    orderBy: [{ zip: 'asc' }, { street: 'asc' }, { number: 'asc' }],
  })

  sortBuildingsByAddress(buildings)

  return { buildings, pagination }
}

export async function findBuildingsWithEntrancePaginated(
  db: TransactionClient,
  selectors: Prisma.BuildingWhereInput,
  url: URL,
  congregationId: number,
) {
  const totalBuildings = await db.building.count({ where: { ...selectors, congregationId } })
  const pagination = paginationFromUrl(url, totalBuildings)

  const buildings = await db.building.findMany({
    skip: pagination.offset,
    take: pagination.size,
    where: { ...selectors, congregationId },
    include: { entrances: { where: { kind: EntranceKind.Residential }, take: 1 } },
    orderBy: [{ zip: 'asc' }, { street: 'asc' }, { number: 'asc' }],
  })

  sortBuildingsByAddress(buildings)

  return { buildings, pagination }
}

export async function findEntrancesPaginated(
  db: TransactionClient,
  selectors: Prisma.BuildingEntranceWhereInput,
  url: URL,
  congregationId: number,
) {
  const totalEntrances = await db.buildingEntrance.count({ where: { ...selectors, congregationId } })
  const pagination = paginationFromUrl(url, totalEntrances)

  const entrances = await db.buildingEntrance.findMany({
    skip: pagination.offset,
    take: pagination.size,
    where: { ...selectors, congregationId },
    include: entranceInclude,
  })

  return { entrances: sortEntrancesByAddress(entrances), pagination }
}

export async function getProspectionStaleDate(db: TransactionClient): Promise<Date> {
  const prospectionValidity = Number(
    (await db.setting.findFirst({ where: { key: 'prospection-validity' } }))?.value ?? '0',
  )
  if (prospectionValidity <= 0) return new Date(0)
  const staleDate = new Date()
  staleDate.setMonth(staleDate.getMonth() - prospectionValidity)
  return staleDate
}

export function aggregateEntrance(entrance: Entrance): AggregatedEntrance {
  return {
    ...entrance,
    street: entrance.buildings[0].street,
    zip: entrance.buildings[0].zip,
    number: entrance.buildings.map(building => building.number).join(', '),
    homes: entrance.homes ?? 0,
    phones: entrance.phones ?? 0,
    liberals: entrance.liberals ?? 0,
    entranceNotes: entrance.notes,
  }
}

export async function getZips(db: TransactionClient, congregationId: number, territoryType?: TerritoryKind) {
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

  if (territoryType != null) {
    selectors.entrances = {
      some: {
        territories: {
          every: {
            type: territoryType,
          },
        },
      },
    }
  }

  return await db.building.groupBy({ by: 'zip', where: selectors })
}

export async function getAvailableZips(db: TransactionClient, congregationId: number, territoryType?: TerritoryKind) {
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

  if (territoryType != null) {
    selectors.entrances = {
      some: {
        territories: {
          none: {
            type: territoryType,
          },
        },
      },
    }
  }

  return await db.building.groupBy({ by: 'zip', where: selectors })
}

export async function getStreets(
  db: TransactionClient,
  congregationId: number,
  zip?: string,
  territoryType?: TerritoryKind,
) {
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

  if (zip != null) {
    selectors.zip = zip
  }

  if (territoryType != null) {
    selectors.entrances = {
      some: {
        territories: {
          every: {
            type: territoryType,
          },
        },
      },
    }
  }

  return await db.building.groupBy({ by: 'street', where: selectors })
}

export async function getAvailableStreets(
  db: TransactionClient,
  congregationId: number,
  zip?: string,
  territoryType?: TerritoryKind,
) {
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

  if (zip != null) {
    selectors.zip = zip
  }

  if (territoryType != null) {
    selectors.entrances = {
      some: {
        territories: {
          every: {
            type: territoryType,
          },
        },
      },
    }
  }
  return await db.building.groupBy({ by: 'street', where: selectors })
}

export async function getEntrances(
  db: TransactionClient,
  congregationId: number,
  zip?: string,
  street?: string,
  territoryType?: TerritoryKind,
): Promise<Entrance[]> {
  const selectors: Prisma.BuildingEntranceWhereInput = {
    congregationId,
    buildings: { some: { active: true } },
  }

  if (zip != null) {
    selectors.buildings = { some: { ...(selectors.buildings as Prisma.BuildingListRelationFilter).some, zip } }
  }

  if (street != null) {
    selectors.buildings = { some: { ...(selectors.buildings as Prisma.BuildingListRelationFilter).some, street } }
  }

  if (territoryType != null) {
    selectors.territories = { every: { type: territoryType } }
  }

  return await db.buildingEntrance.findMany({
    where: selectors,
    include: entranceInclude,
  })
}

export async function getAvailableEntrances(
  db: TransactionClient,
  congregationId: number,
  zip?: string,
  street?: string,
  territoryType?: TerritoryKind,
): Promise<Entrance[]> {
  const selectors: Prisma.BuildingEntranceWhereInput = {
    congregationId,
    buildings: { some: { active: true } },
  }

  if (zip != null) {
    selectors.buildings = { some: { ...(selectors.buildings as Prisma.BuildingListRelationFilter).some, zip } }
  }

  if (street != null) {
    selectors.buildings = { some: { ...(selectors.buildings as Prisma.BuildingListRelationFilter).some, street } }
  }

  if (territoryType != null) {
    selectors.territories = { none: { type: territoryType } }
  }

  return await db.buildingEntrance.findMany({
    where: selectors,
    include: entranceInclude,
  })
}

export async function getEntrance(db: TransactionClient, entranceId: number): Promise<Entrance | null> {
  return await db.buildingEntrance.findUnique({
    where: { id: entranceId },
    include: entranceInclude,
  })
}

export async function getBuilding(db: TransactionClient, buildingId: number): Promise<Building | null> {
  return await db.building.findUnique({
    where: { id: buildingId },
    include: { entrances: { include: { buildings: true } } },
  })
}

export async function getEntrancesInBbox(
  db: TransactionClient,
  congregationId: number,
  territoryId: number,
  territoryType: TerritoryKind,
  bbox: { swLat: number; swLng: number; neLat: number; neLng: number },
  limit = 1500,
): Promise<{ entrances: BboxEntrance[]; truncated: boolean }> {
  const expectedKind = entranceKindForTerritoryType[territoryType]

  const rows = await db.buildingEntrance.findMany({
    where: {
      congregationId,
      kind: expectedKind,
      latitude: { gte: bbox.swLat, lte: bbox.neLat },
      longitude: { gte: bbox.swLng, lte: bbox.neLng },
    },
    include: {
      territories: { where: { type: territoryType }, select: { id: true, number: true } },
      buildings: { take: 1, select: { number: true, street: true, zip: true } },
    },
    take: limit + 1,
  })

  const truncated = rows.length > limit
  const sliced = truncated ? rows.slice(0, limit) : rows

  const entrances: BboxEntrance[] = sliced
    .filter(row => row.latitude != null && row.longitude != null && row.buildings[0] != null)
    .map(row => {
      const inThisTerritory = row.territories.some(t => t.id === territoryId)
      const otherTerritory = row.territories.find(t => t.id !== territoryId) ?? null
      const status: BboxEntranceStatus = inThisTerritory
        ? 'in-this-territory'
        : otherTerritory != null
          ? 'on-other-territory'
          : 'available'
      const building = row.buildings[0]
      return {
        id: row.id,
        // biome-ignore lint/style/noNonNullAssertion: filtered above
        latitude: row.latitude!,
        // biome-ignore lint/style/noNonNullAssertion: filtered above
        longitude: row.longitude!,
        kind: row.kind,
        shopKind: row.shopKind,
        homes: row.homes ?? 0,
        phones: row.phones ?? 0,
        liberals: row.liberals ?? 0,
        address: { number: building.number, street: building.street, zip: building.zip },
        status,
        otherTerritory: otherTerritory != null ? { id: otherTerritory.id, number: otherTerritory.number } : null,
      }
    })

  return { entrances, truncated }
}
