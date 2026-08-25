import type { Prisma, TerritoryKindKey } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { LatLng } from '~/shared/utils/distance'
import { paginationFromUrl } from '~/shared/utils/pagination.server'
import { closestTerritoryPoint, paginateByProximity } from './proximity-sort.server'

interface ProximityOptions {
  origin: LatLng
}

export async function findActiveAttributionsPaginated(
  db: TransactionClient,
  selectors: Prisma.AttributionWhereInput,
  url: URL,
  congregationId: number,
  proximity?: ProximityOptions,
) {
  const where = { ...selectors, congregationId }

  if (proximity != null) {
    const all = await db.attribution.findMany({
      where,
      include: {
        territory: {
          include: {
            entrances: { include: { buildings: { where: { active: true } } } },
          },
        },
        publisher: true,
      },
      orderBy: [{ startDate: 'asc' }],
    })
    const result = paginateByProximity(
      all,
      proximity.origin,
      a => closestTerritoryPoint(proximity.origin, a.territory.entrances),
      url,
    )
    return {
      attributions: result.items,
      pagination: result.pagination,
      distances: result.distances,
      withCoordsCount: result.withCoordsCount,
      withoutCoordsCount: result.withoutCoordsCount,
    }
  }

  const total = await db.attribution.count({ where })
  const pagination = paginationFromUrl(url, total)

  const attributions = await db.attribution.findMany({
    skip: pagination.offset,
    take: pagination.size,
    where,
    include: { territory: true, publisher: true },
    orderBy: [{ startDate: 'asc' }],
  })

  return { attributions, pagination }
}

export function findActiveAttributionsForPublisher(db: TransactionClient, publisherId: number, congregationId: number) {
  return db.attribution.findMany({
    where: { publisherId, endDate: null, congregationId },
    include: { territory: true },
    orderBy: [{ startDate: 'asc' }],
  })
}

export function findTerritoryWithHistory(db: TransactionClient, territoryId: number, congregationId: number) {
  return db.territory.findUnique({
    where: {
      id_congregationId: { id: territoryId, congregationId },
    },
    include: {
      entrances: {
        where: { buildings: { some: { active: true } } },
        include: { buildings: { where: { active: true } } },
      },
      attributions: {
        include: { publisher: true },
        orderBy: [{ startDate: 'desc' }],
      },
    },
  })
}

export async function findAdjacentTerritories(
  db: TransactionClient,
  territoryNumber: string,
  territoryType: TerritoryKindKey,
  congregationId: number,
): Promise<{
  prev: { id: number; number: string } | null
  next: { id: number; number: string } | null
}> {
  const [prev, next] = await Promise.all([
    db.territory.findFirst({
      where: { congregationId, type: territoryType, number: { lt: territoryNumber } },
      orderBy: { number: 'desc' },
      select: { id: true, number: true },
    }),
    db.territory.findFirst({
      where: { congregationId, type: territoryType, number: { gt: territoryNumber } },
      orderBy: { number: 'asc' },
      select: { id: true, number: true },
    }),
  ])
  return { prev, next }
}
