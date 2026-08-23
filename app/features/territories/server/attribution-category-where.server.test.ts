import { describe, expect, it } from 'vitest'
import { AttributionCategory } from '~/features/territories/model/attribution-category'
import { buildAttributionCategoryWhere } from './attribution-category-where.server'

describe('buildAttributionCategoryWhere', () => {
  it('returns an empty filter for an empty selection', () => {
    expect(buildAttributionCategoryWhere([])).toEqual({})
  })

  it('maps Campaign to any campaign-linked attribution', () => {
    expect(buildAttributionCategoryWhere([AttributionCategory.Campaign])).toEqual({
      OR: [{ campaignId: { not: null } }],
    })
  })

  it('maps method categories to the regular layer only', () => {
    expect(buildAttributionCategoryWhere([AttributionCategory.Default, AttributionCategory.Phone])).toEqual({
      OR: [
        { campaignId: null, type: 'Default' },
        { campaignId: null, type: 'Phone' },
      ],
    })
  })
})
