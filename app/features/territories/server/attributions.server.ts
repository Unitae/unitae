import type { Prisma } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { paginationFromUrl } from '~/shared/utils/pagination.server'

export async function findActiveAttributionsPaginated(
  db: TransactionClient,
  selectors: Prisma.AttributionWhereInput,
  url: URL,
  congregationId: number,
) {
  const total = await db.attribution.count({ where: { ...selectors, congregationId } })
  const pagination = paginationFromUrl(url, total)

  const attributions = await db.attribution.findMany({
    skip: pagination.offset,
    take: pagination.size,
    where: { ...selectors, congregationId },
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
      entrances: { include: { buildings: { where: { active: true } } } },
      attributions: {
        include: { publisher: true },
        orderBy: [{ startDate: 'desc' }],
      },
    },
  })
}
