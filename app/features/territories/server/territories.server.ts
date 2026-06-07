import type { Prisma } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { LatLng } from '~/shared/utils/distance'
import { paginationFromUrl } from '~/shared/utils/pagination.server'
import { closestTerritoryPoint, paginateByProximity } from './proximity-sort.server'

interface ProximityOptions {
  origin: LatLng
}

export async function findTerritoriesWithDetailsPaginated(
  db: TransactionClient,
  selectors: Prisma.TerritoryWhereInput,
  url: URL,
  congregationId: number,
  proximity?: ProximityOptions,
) {
  const where = { ...selectors, congregationId }

  if (proximity != null) {
    const all = await db.territory.findMany({
      where,
      include: {
        entrances: { include: { buildings: { where: { active: true } } } },
        attributions: { where: { endDate: null }, include: { publisher: true } },
      },
    })
    const result = paginateByProximity(
      all,
      proximity.origin,
      t => closestTerritoryPoint(proximity.origin, t.entrances),
      url,
    )
    return {
      territories: result.items,
      pagination: result.pagination,
      distances: result.distances,
      withCoordsCount: result.withCoordsCount,
      withoutCoordsCount: result.withoutCoordsCount,
    }
  }

  const total = await db.territory.count({ where })
  const pagination = paginationFromUrl(url, total)

  const territories = await db.territory.findMany({
    skip: pagination.offset,
    take: pagination.size,
    where,
    include: {
      entrances: { include: { buildings: { where: { active: true } } } },
      attributions: { where: { endDate: null }, include: { publisher: true } },
    },
  })

  return { territories, pagination }
}

export async function findAvailableTerritoriesPaginated(
  db: TransactionClient,
  selectors: Prisma.TerritoryWhereInput,
  url: URL,
  congregationId: number,
  proximity?: ProximityOptions,
) {
  const where = { ...selectors, congregationId }

  if (proximity != null) {
    const all = await db.territory.findMany({
      where,
      include: {
        entrances: { include: { buildings: true } },
        attributions: { orderBy: { endDate: 'desc' }, take: 1 },
      },
    })
    const result = paginateByProximity(
      all,
      proximity.origin,
      t => closestTerritoryPoint(proximity.origin, t.entrances),
      url,
    )
    return {
      territories: result.items,
      pagination: result.pagination,
      distances: result.distances,
      withCoordsCount: result.withCoordsCount,
      withoutCoordsCount: result.withoutCoordsCount,
    }
  }

  const total = await db.territory.count({ where })
  const pagination = paginationFromUrl(url, total)

  const territories = await db.territory.findMany({
    skip: pagination.offset,
    take: pagination.size,
    where,
    include: {
      entrances: { include: { buildings: true } },
      attributions: { orderBy: { endDate: 'desc' }, take: 1 },
    },
    orderBy: { attributions: { _count: 'asc' } },
  })

  return { territories, pagination }
}
