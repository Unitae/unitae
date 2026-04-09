import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { StatsAttribution } from './stats-attribution.type'
import { computeAttributionsPerMonth } from './compute-attributions-per-month.server'

function makeAttribution(startDate: Date, id = 1): StatsAttribution {
  return {
    id,
    territoryId: 1,
    territoryNumber: 'T-1',
    territoryType: TerritoryKind.Classical,
    type: TerritoryAttributionKind.Default,
    startDate,
    endDate: null,
    lateDate: new Date(2026, 0, 1),
  }
}

describe('computeAttributionsPerMonth', () => {
  it('génère tous les mois de la période même sans attributions', () => {
    const result = computeAttributionsPerMonth([], new Date(2025, 8, 1), new Date(2025, 11, 31))

    expect(result).toEqual([
      { month: '2025-09', count: 0 },
      { month: '2025-10', count: 0 },
      { month: '2025-11', count: 0 },
      { month: '2025-12', count: 0 },
    ])
  })

  it('compte les attributions par mois de début', () => {
    const attributions = [
      makeAttribution(new Date(2025, 8, 5), 1),
      makeAttribution(new Date(2025, 8, 20), 2),
      makeAttribution(new Date(2025, 9, 10), 3),
    ]

    const result = computeAttributionsPerMonth(attributions, new Date(2025, 8, 1), new Date(2025, 10, 30))

    expect(result).toEqual([
      { month: '2025-09', count: 2 },
      { month: '2025-10', count: 1 },
      { month: '2025-11', count: 0 },
    ])
  })

  it('génère les 12 mois d\'une année théocratique complète', () => {
    const result = computeAttributionsPerMonth([], new Date(2025, 8, 1), new Date(2026, 7, 31))
    expect(result).toHaveLength(12)
    expect(result[0].month).toBe('2025-09')
    expect(result[11].month).toBe('2026-08')
  })
})
