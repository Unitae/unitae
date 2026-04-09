import type { StatsAttribution } from './stats-attribution.type'

interface RankedTerritory {
  number: string
  count: number
}

interface RankedTerritoriesResult {
  most: RankedTerritory | null
  least: RankedTerritory | null
}

export function computeRankedTerritories(attributions: StatsAttribution[]): RankedTerritoriesResult {
  if (attributions.length === 0) {
    return { most: null, least: null }
  }

  const countByTerritory = new Map<string, number>()
  for (const a of attributions) {
    countByTerritory.set(a.territoryNumber, (countByTerritory.get(a.territoryNumber) ?? 0) + 1)
  }

  let most: RankedTerritory | null = null
  let least: RankedTerritory | null = null

  for (const [number, count] of countByTerritory) {
    if (most == null || count > most.count) {
      most = { number, count }
    }
    if (least == null || count < least.count) {
      least = { number, count }
    }
  }

  return { most, least }
}
