import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'

export type DraftTotals = {
  metric: 'homes' | 'phones' | 'count'
  primary: number
  count: number
}

/**
 * Running totals for the split-tool draft rail. Mirrors `computeTerritoryQuantity`
 * so the number the user sees while drafting matches what the created territory
 * will display afterwards.
 */
export function computeDraftTotals(kind: TerritoryKindKey, entrances: readonly BboxEntrance[]): DraftTotals {
  const count = entrances.length

  if (kind === TerritoryKindKey.Phone) {
    return { metric: 'phones', primary: entrances.reduce((s, e) => s + e.phones, 0), count }
  }
  if (kind === TerritoryKindKey.Classical || kind === TerritoryKindKey.Univ) {
    return { metric: 'homes', primary: entrances.reduce((s, e) => s + (e.homes || e.phones), 0), count }
  }
  return { metric: 'count', primary: count, count }
}
