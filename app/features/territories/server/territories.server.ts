import type { Prisma } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { paginationFromUrl } from '~/shared/utils/pagination.server'

export async function findTerritoriesWithDetailsPaginated(
  db: TransactionClient,
  selectors: Prisma.TerritoryWhereInput,
  url: URL,
  congregationId: number,
) {
  const total = await db.territory.count({ where: { ...selectors, congregationId } })
  const pagination = paginationFromUrl(url, total)

  const territories = await db.territory.findMany({
    skip: pagination.offset,
    take: pagination.size,
    where: { ...selectors, congregationId },
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
) {
  const total = await db.territory.count({ where: { ...selectors, congregationId } })
  const pagination = paginationFromUrl(url, total)

  const territories = await db.territory.findMany({
    skip: pagination.offset,
    take: pagination.size,
    where: { ...selectors, congregationId },
    include: {
      entrances: { include: { buildings: true } },
      attributions: { orderBy: { endDate: 'desc' }, take: 1 },
    },
    orderBy: { attributions: { _count: 'asc' } },
  })

  return { territories, pagination }
}
