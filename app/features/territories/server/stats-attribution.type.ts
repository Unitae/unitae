import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'

export interface StatsAttribution {
  id: number
  territoryId: number
  territoryNumber: string
  territoryType: TerritoryKind
  type: TerritoryAttributionKind
  startDate: Date
  endDate: Date | null
  lateDate: Date
}
