import type { TransactionClient } from '~/shared/infra/db.server'
import { buildAttributionCategoryWhere } from './attribution-category-where.server'
import { buildAttributionDateOverlapWhere } from './attribution-date-overlap.server'
import type { StatsAttribution } from './stats-attribution.type'
import type { StatsFilterParams } from './stats-filter-params.type'

export async function fetchAttributionsForStats(
  db: TransactionClient,
  params: StatsFilterParams,
  congregationId: number,
): Promise<StatsAttribution[]> {
  const attributions = await db.attribution.findMany({
    where: {
      congregationId,
      ...(params.territoryKind.length > 0 ? { territory: { type: { in: params.territoryKind } } } : {}),
      ...buildAttributionCategoryWhere(params.attributionKind),
      ...buildAttributionDateOverlapWhere(params.startDate, params.endDate),
      ...(params.groupId != null ? { publisher: { publisherGroupId: params.groupId } } : {}),
    },
    select: {
      id: true,
      territoryId: true,
      territory: {
        select: {
          number: true,
          type: true,
        },
      },
      type: true,
      campaignId: true,
      startDate: true,
      endDate: true,
      lateDate: true,
    },
    orderBy: [{ territoryId: 'asc' }, { startDate: 'asc' }],
  })

  return attributions.map(a => ({
    id: a.id,
    territoryId: a.territoryId,
    territoryNumber: a.territory.number,
    territoryType: a.territory.type,
    type: a.type,
    campaignId: a.campaignId,
    startDate: a.startDate,
    endDate: a.endDate,
    lateDate: a.lateDate,
  }))
}
