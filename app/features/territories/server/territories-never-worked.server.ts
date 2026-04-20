import type { Prisma } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { StatsFilterParams } from './stats-filter-params.type'

export interface NeverWorkedTerritory {
  id: number
  number: string
}

export async function getTerritoriesNeverWorked(
  db: TransactionClient,
  params: StatsFilterParams,
  congregationId: number,
): Promise<NeverWorkedTerritory[]> {
  const dateOverlap: Prisma.AttributionWhereInput = {
    startDate: { lte: params.endDate },
    // biome-ignore lint/style/useNamingConvention: Prisma OR operator
    OR: [{ endDate: null }, { endDate: { gte: params.startDate } }],
  }

  const territories = await db.territory.findMany({
    where: {
      congregationId,
      type: { in: params.territoryKind },
      attributions: {
        none: {
          type: { in: params.attributionKind },
          ...dateOverlap,
          ...(params.groupId != null ? { publisher: { publisherGroupId: params.groupId } } : {}),
        },
      },
    },
    select: {
      id: true,
      number: true,
    },
    orderBy: { number: 'asc' },
  })

  return territories
}
