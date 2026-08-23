import type { AttributionCategory } from '~/features/territories/model/attribution-category'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { buildAttributionCategoryWhere } from './attribution-category-where.server'
import { buildAttributionDateOverlapWhere } from './attribution-date-overlap.server'

export async function computeTerritoryCoverage(
  db: TransactionClient,
  congregationId: number,
  territoryKind: TerritoryKind[],
  attributionKind: AttributionCategory[],
  startDate: Date,
  endDate: Date,
  groupId?: number,
) {
  const kindWhere = territoryKind.length > 0 ? { type: { in: territoryKind } } : {}
  const groupWhere = groupId != null ? { publisher: { publisherGroupId: groupId } } : {}

  const [total, count] = await Promise.all([
    db.territory.count({
      where: {
        congregationId,
        ...kindWhere,
      },
    }),
    db.attribution.count({
      where: {
        congregationId,
        ...(territoryKind.length > 0 ? { territory: { type: { in: territoryKind } } } : {}),
        ...buildAttributionCategoryWhere(attributionKind),
        ...buildAttributionDateOverlapWhere(startDate, endDate),
        ...groupWhere,
      },
    }),
  ])

  return total === 0 ? 0 : (count / total) * 100
}
