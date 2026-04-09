import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'

export interface StatsFilterParams {
  territoryKind: TerritoryKind[]
  attributionKind: TerritoryAttributionKind[]
  startDate: Date
  endDate: Date
  groupId?: number
}
