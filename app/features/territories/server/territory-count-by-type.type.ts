import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

export interface TerritoryCountByType {
  type: TerritoryKindKey
  count: number
}

export function getTotalTerritoryCount(counts: TerritoryCountByType[]): number {
  return counts.reduce((sum, c) => sum + c.count, 0)
}
