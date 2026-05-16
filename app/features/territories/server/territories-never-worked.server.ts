import type { TransactionClient } from '~/shared/infra/db.server'
import { buildAttributionDateOverlapWhere } from './attribution-date-overlap.server'
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
  const territories = await db.territory.findMany({
    where: {
      congregationId,
      ...(params.territoryKind.length > 0 ? { type: { in: params.territoryKind } } : {}),
      attributions: {
        none: {
          type: { in: params.attributionKind },
          ...buildAttributionDateOverlapWhere(params.startDate, params.endDate),
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
