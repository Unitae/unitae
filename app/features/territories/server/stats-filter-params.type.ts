import type { AttributionCategory } from '~/features/territories/model/attribution-category'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'

export interface StatsFilterParams {
  territoryKind: TerritoryKind[]
  attributionKind: AttributionCategory[]
  startDate: Date
  endDate: Date
  groupId?: number
}
