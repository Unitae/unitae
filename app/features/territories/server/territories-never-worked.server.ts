import type { TransactionClient } from '~/shared/infra/db.server'
import { buildAttributionCategoryWhere } from './attribution-category-where.server'
import { buildAttributionDateOverlapWhere } from './attribution-date-overlap.server'
import type { StatsFilterParams } from './stats-filter-params.type'

export interface NeverWorkedTerritory {
  id: number
  number: string
}

export interface NeverWorkedResult {
  territories: NeverWorkedTerritory[]
  isCapped: boolean
}

// Matches the UI's MAX_DISPLAY. We fetch one row past it so the caller can
// tell whether the list was capped without doing a second COUNT query.
export const NEVER_WORKED_MAX = 20

export async function getTerritoriesNeverWorked(
  db: TransactionClient,
  params: StatsFilterParams,
  congregationId: number,
): Promise<NeverWorkedResult> {
  const rows = await db.territory.findMany({
    where: {
      congregationId,
      ...(params.territoryKind.length > 0 ? { type: { in: params.territoryKind } } : {}),
      attributions: {
        none: {
          ...buildAttributionCategoryWhere(params.attributionKind),
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
    take: NEVER_WORKED_MAX + 1,
  })

  return {
    territories: rows.slice(0, NEVER_WORKED_MAX),
    isCapped: rows.length > NEVER_WORKED_MAX,
  }
}
