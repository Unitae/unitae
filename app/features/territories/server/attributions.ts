import type { Prisma } from '~/database/generated/client'
import { db } from '~/shared/libs/db.server'
import { paginationFromUrl } from '~/shared/libs/pagination.server'

export async function findActiveAttributionsPaginated(selectors: Prisma.AttributionWhereInput, url: URL) {
  const total = await db.attribution.count({ where: selectors })
  const pagination = paginationFromUrl(url, total)

  const attributions = await db.attribution.findMany({
    skip: pagination.offset,
    take: pagination.size,
    where: selectors,
    include: { territory: true, publisher: true },
    orderBy: [{ startDate: 'asc' }],
  })

  return { attributions, pagination }
}
