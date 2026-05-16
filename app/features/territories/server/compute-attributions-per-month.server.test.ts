import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { computeAttributionsPerMonth } from './compute-attributions-per-month.server'
import type { StatsAttribution } from './stats-attribution.type'

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

  it("génère les 12 mois d'une année théocratique complète", () => {
    const result = computeAttributionsPerMonth([], new Date(2025, 8, 1), new Date(2026, 7, 31))
    expect(result).toHaveLength(12)
    expect(result[0].month).toBe('2025-09')
    expect(result[11].month).toBe('2026-08')
  })

  it('ignore les attributions dont le mois de début est hors période', () => {
    const attributions = [
      makeAttribution(new Date(2025, 7, 15), 1), // août, hors période sept-nov
      makeAttribution(new Date(2025, 8, 10), 2), // septembre, dans la période
    ]

    const result = computeAttributionsPerMonth(attributions, new Date(2025, 8, 1), new Date(2025, 10, 30))

    expect(result[0].count).toBe(1) // Seule l'attribution de septembre compte
    expect(result[1].count).toBe(0)
    expect(result[2].count).toBe(0)
  })

  it("compte une attribution démarrée le dernier jour du mois (avec une heure non-zéro)", () => {
    // Attribution at 18:30 on the last day of September must still bucket into Sept.
    const attributions = [makeAttribution(new Date(2025, 8, 30, 18, 30, 0), 1)]

    const result = computeAttributionsPerMonth(attributions, new Date(2025, 8, 1), new Date(2025, 9, 31))

    expect(result[0].count).toBe(1)
    expect(result[1].count).toBe(0)
  })
})
