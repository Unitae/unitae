import type { StatsAttribution } from './stats-attribution.type'

export interface RankedTerritory {
  id: number
  number: string
  count: number
}

export interface RankedTerritoriesResult {
  most: RankedTerritory | null
  least: RankedTerritory | null
}

export function computeRankedTerritories(attributions: StatsAttribution[]): RankedTerritoriesResult {
  if (attributions.length === 0) {
    return { most: null, least: null }
  }

  const byTerritory = new Map<number, { id: number; number: string; count: number }>()
  for (const a of attributions) {
    const existing = byTerritory.get(a.territoryId)
    if (existing == null) {
      byTerritory.set(a.territoryId, { id: a.territoryId, number: a.territoryNumber, count: 1 })
    } else {
      existing.count += 1
    }
  }

  let most: RankedTerritory | null = null
  let least: RankedTerritory | null = null

  for (const territory of byTerritory.values()) {
    if (most == null || territory.count > most.count) {
      most = territory
    }
    if (least == null || territory.count < least.count) {
      least = territory
    }
  }

  return { most, least }
}
