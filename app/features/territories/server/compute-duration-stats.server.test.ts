import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { StatsAttribution } from './stats-attribution.type'
import { computeDurationStats } from './compute-duration-stats.server'

function makeAttribution(startDate: Date, endDate: Date | null): StatsAttribution {
  return {
    id: 1,
    territoryId: 1,
    territoryNumber: 'T-1',
    territoryType: TerritoryKind.Classical,
    type: TerritoryAttributionKind.Default,
    startDate,
    endDate,
    lateDate: new Date(2026, 0, 1),
  }
}

describe('computeDurationStats', () => {
  it('retourne des zéros quand il n\'y a aucune attribution', () => {
    expect(computeDurationStats([])).toEqual({ averageDays: 0, longestDays: 0, shortestDays: 0 })
  })

  it('ignore les attributions en cours (endDate null)', () => {
    const attributions = [makeAttribution(new Date(2025, 9, 1), null)]
    expect(computeDurationStats(attributions)).toEqual({ averageDays: 0, longestDays: 0, shortestDays: 0 })
  })

  it('calcule correctement avec une seule attribution complétée', () => {
    const attributions = [makeAttribution(new Date(2025, 9, 1), new Date(2025, 10, 1))]
    // 31 jours entre le 1er octobre et le 1er novembre
    expect(computeDurationStats(attributions)).toEqual({ averageDays: 31, longestDays: 31, shortestDays: 31 })
  })

  it('calcule la moyenne, le plus long et le plus court', () => {
    const attributions = [
      makeAttribution(new Date(2025, 0, 1), new Date(2025, 0, 11)), // 10 jours
      makeAttribution(new Date(2025, 1, 1), new Date(2025, 2, 3)), // 30 jours
      makeAttribution(new Date(2025, 3, 1), new Date(2025, 4, 21)), // 50 jours
    ]

    const result = computeDurationStats(attributions)
    expect(result.averageDays).toBe(30)
    expect(result.longestDays).toBe(50)
    expect(result.shortestDays).toBe(10)
  })
})
