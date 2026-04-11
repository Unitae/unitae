import type { Building, Prisma } from '~/database/generated/client'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/libs/db.server'
import { paginationFromUrl } from '~/shared/libs/pagination.server'
import type { AggregatedEntrance, Entrance } from '~/shared/types/entrance'

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
    include: { entrance: true },
    orderBy: [{ zip: 'asc' }, { street: 'asc' }, { number: 'asc' }],
  })

  sortBuildingsByAddress(buildings)

  return { buildings, pagination }
}

export async function findEntrancesPaginated(
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
    select: { entrance: { include: { buildings: true } } },
    distinct: ['entranceId'],
    orderBy: [{ zip: 'asc' }, { street: 'asc' }, { number: 'asc' }],
  })

  const entrances = buildings.map(building => building.entrance).filter(entrance => entrance !== null)

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
  const stats = entrance.buildings.reduce(
    (acc, building) => {
      acc.homes += building.homes ?? 0
      acc.phones += building.phones ?? 0
      acc.liberals += building.liberals ?? 0

      return acc
    },
    { homes: 0, phones: 0, liberals: 0 },
  )

  return {
    ...entrance,
    street: entrance.buildings[0].street,
    zip: entrance.buildings[0].zip,
    number: entrance.buildings.map(building => building.number).join(', '),
    homes: stats.homes,
    phones: stats.phones,
    liberals: stats.liberals,
    importantNotes: entrance.buildings.map(building => building.importantNotes),
  }
}

export async function getZips(db: TransactionClient, congregationId: number, territoryType?: TerritoryKind) {
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

  if (territoryType != null) {
    selectors.entrance = {
      territories: {
        every: {
          type: territoryType,
        },
      },
    }
  }

  return await db.building.groupBy({ by: 'zip', where: selectors })
}

export async function getAvailableZips(db: TransactionClient, congregationId: number, territoryType?: TerritoryKind) {
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

  if (territoryType != null) {
    selectors.entrance = {
      territories: {
        none: {
          type: territoryType,
        },
      },
    }
  }

  return await db.building.groupBy({ by: 'zip', where: selectors })
}

export async function getStreets(db: TransactionClient, congregationId: number, zip?: string, territoryType?: TerritoryKind) {
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

  if (zip != null) {
    selectors.zip = zip
  }

  if (territoryType != null) {
    selectors.entrance = {
      territories: {
        every: {
          type: territoryType,
        },
      },
    }
  }

  return await db.building.groupBy({ by: 'street', where: selectors })
}

export async function getAvailableStreets(db: TransactionClient, congregationId: number, zip?: string, territoryType?: TerritoryKind) {
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

  if (zip != null) {
    selectors.zip = zip
  }

  if (territoryType != null) {
    selectors.entrance = {
      territories: {
        every: {
          type: territoryType,
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
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

  if (zip != null) {
    selectors.zip = zip
  }

  if (street != null) {
    selectors.street = street
  }

  if (territoryType != null) {
    selectors.entrance = {
      territories: {
        every: {
          type: territoryType,
        },
      },
    }
  }

  const buildings = await db.building.findMany({
    where: selectors,
    select: { entrance: { include: { buildings: true } } },
    distinct: ['entranceId'],
  })

  return buildings.map(building => building.entrance).filter(entrance => entrance != null)
}

export async function getAvailableEntrances(
  db: TransactionClient,
  congregationId: number,
  zip?: string,
  street?: string,
  territoryType?: TerritoryKind,
): Promise<Entrance[]> {
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

  if (zip != null) {
    selectors.zip = zip
  }

  if (street != null) {
    selectors.street = street
  }

  if (territoryType != null) {
    selectors.entrance = {
      territories: {
        none: {
          type: territoryType,
        },
      },
    }
  }

  const buildings = await db.building.findMany({
    where: selectors,
    select: { entrance: { include: { buildings: true } } },
    distinct: ['entranceId'],
  })

  return buildings.map(building => building.entrance).filter(entrance => entrance != null)
}

export async function getEntrance(db: TransactionClient, entranceId: number): Promise<Entrance | null> {
  return await db.buildingEntrance.findUnique({
    where: { id: entranceId },
    include: { buildings: true },
  })
}

export async function getBuilding(db: TransactionClient, buildingId: number): Promise<Building | null> {
  return await db.building.findUnique({
    where: { id: buildingId },
    include: { entrance: { include: { buildings: true } } },
  })
}
