import type { Prisma } from '~/database/generated/client'
import { AttributionCategory } from '~/features/territories/model/attribution-category'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'

/**
 * Translate a category filter into the two-layer model: `Campaign` matches any
 * attribution linked to a campaign regardless of method; the method categories
 * only match regular (non-campaign) work, so the three buckets partition rows.
 */
export function buildAttributionCategoryWhere(categories: AttributionCategory[]): Prisma.AttributionWhereInput {
  if (categories.length === 0) return {}
  return {
    OR: categories.map(category =>
      category === AttributionCategory.Campaign
        ? { campaignId: { not: null } }
        : { campaignId: null, type: category as TerritoryAttributionKind },
    ),
  }
}
