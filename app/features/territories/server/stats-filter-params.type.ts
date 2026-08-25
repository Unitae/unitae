import type { AttributionCategory } from '~/features/territories/model/attribution-category'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

export interface StatsFilterParams {
  territoryKind: TerritoryKindKey[]
  attributionKind: AttributionCategory[]
  startDate: Date
  endDate: Date
  groupId?: number
}
