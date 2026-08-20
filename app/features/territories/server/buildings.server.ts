import type { Prisma } from '~/database/generated/client'
import type { Bbox } from '~/features/territories/model/bbox.type'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import {
  availableForCreateWhere,
  type MapVisibilityContext,
  mapVisibleWhere,
} from '~/features/territories/server/map-visibility'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { AggregatedEntrance, Entrance } from '~/shared/types/entrance'
import { paginationFromUrl } from '~/shared/utils/pagination.server'

const entranceKindForTerritoryType: Record<TerritoryKind, EntranceKind> = {
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
  buildingId: number
  status: BboxEntranceStatus
  otherTerritory: { id: number; number: string } | null
  // Access data — populated for residential entrances so the popup can render badges
  // (intercom / digicode / doorbell / open-early / mailbox-open / PMR).
  access: number | null
  accesses: { type: number }[]
  isPMR: boolean | null
  isOpenEarly: boolean | null
  isMailboxOpen: boolean | null
  // Last prospection date of the primary building. Serialised as ISO string so the
  // JSON round-trip keeps it as a plain string on the client (Date objects don't
  // survive JSON.stringify → JSON.parse).
  prospectionDate: string | null
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

async function queryEntrancesInBbox(
  db: TransactionClient,
  where: Prisma.BuildingEntranceWhereInput,
  territoryType: TerritoryKind,
  matchesThisTerritory: (row: { territories: { id: number; number: string }[] }) => {
    inThisTerritory: boolean
    otherTerritory: { id: number; number: string } | null
  },
  limit: number,
): Promise<{ entrances: BboxEntrance[]; truncated: boolean; total: number | null }> {
  const rows = await db.buildingEntrance.findMany({
    where,
    include: {
      territories: { where: { type: territoryType }, select: { id: true, number: true } },
      buildings: { take: 1, select: { id: true, number: true, street: true, zip: true, prospectionDate: true } },
      accesses: { orderBy: { position: 'asc' as const }, select: { type: true } },
    },
    take: limit + 1,
  })

  const truncated = rows.length > limit
  const sliced = truncated ? rows.slice(0, limit) : rows
  const total = truncated ? await db.buildingEntrance.count({ where }) : null

  const entrances: BboxEntrance[] = sliced
    .filter(row => row.latitude != null && row.longitude != null && row.buildings[0] != null)
    .map(row => {
      const { inThisTerritory, otherTerritory } = matchesThisTerritory(row)
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
        buildingId: building.id,
        status,
        otherTerritory: otherTerritory != null ? { id: otherTerritory.id, number: otherTerritory.number } : null,
        access: row.access,
        accesses: row.accesses.map(a => ({ type: a.type })),
        isPMR: row.isPMR,
        isOpenEarly: row.isOpenEarly,
        isMailboxOpen: row.isMailboxOpen,
        prospectionDate: building.prospectionDate?.toISOString() ?? null,
      }
    })

  return { entrances, truncated, total }
}

export async function getEntrancesInBbox(
  db: TransactionClient,
  congregationId: number,
  territoryId: number,
  territoryType: TerritoryKind,
  bbox: Bbox,
  ctx: MapVisibilityContext,
  limit = 1500,
): Promise<{ entrances: BboxEntrance[]; truncated: boolean; total: number | null }> {
  const where = {
    congregationId,
    kind: entranceKindForTerritoryType[territoryType],
    latitude: { gte: bbox.swLat, lte: bbox.neLat },
    longitude: { gte: bbox.swLng, lte: bbox.neLng },
    ...mapVisibleWhere(territoryType, territoryId, ctx),
  } satisfies Prisma.BuildingEntranceWhereInput

  return queryEntrancesInBbox(
    db,
    where,
    territoryType,
    row => {
      const inThisTerritory = row.territories.some(t => t.id === territoryId)
      const otherTerritory = row.territories.find(t => t.id !== territoryId) ?? null
      return { inThisTerritory, otherTerritory }
    },
    limit,
  )
}

/**
 * Total number of entrances that would be eligible for a new territory of the given kind,
 * ignoring any bbox. Also reports how many of them lack coordinates and therefore never
 * show up on the map — the map's "N sur M · X sans coordonnées" hint uses both numbers.
 */
export async function countAvailableEntrances(
  db: TransactionClient,
  congregationId: number,
  kind: TerritoryKind,
  ctx: MapVisibilityContext,
): Promise<{ total: number; withoutCoordinates: number }> {
  const baseWhere = {
    congregationId,
    kind: entranceKindForTerritoryType[kind],
    ...availableForCreateWhere(kind, ctx),
  } satisfies Prisma.BuildingEntranceWhereInput

  const [total, withoutCoordinates] = await Promise.all([
    db.buildingEntrance.count({ where: baseWhere }),
    db.buildingEntrance.count({
      where: { ...baseWhere, OR: [{ latitude: null }, { longitude: null }] },
    }),
  ])

  return { total, withoutCoordinates }
}

export async function getAvailableEntrancesInBbox(
  db: TransactionClient,
  congregationId: number,
  kind: TerritoryKind,
  bbox: Bbox,
  ctx: MapVisibilityContext,
  limit = 1500,
): Promise<{ entrances: BboxEntrance[]; truncated: boolean; total: number | null }> {
  const where = {
    congregationId,
    kind: entranceKindForTerritoryType[kind],
    latitude: { gte: bbox.swLat, lte: bbox.neLat },
    longitude: { gte: bbox.swLng, lte: bbox.neLng },
    ...availableForCreateWhere(kind, ctx),
  } satisfies Prisma.BuildingEntranceWhereInput

  return queryEntrancesInBbox(
    db,
    where,
    kind,
    row => ({ inThisTerritory: false, otherTerritory: row.territories[0] ?? null }),
    limit,
  )
}
