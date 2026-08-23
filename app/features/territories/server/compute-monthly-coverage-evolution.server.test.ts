import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { computeMonthlyCoverageEvolution } from './compute-monthly-coverage-evolution.server'
import type { StatsAttribution } from './stats-attribution.type'
import type { TerritoryCountByType } from './territory-count-by-type.type'

function makeAttribution(territoryId: number, startDate: Date, endDate: Date | null): StatsAttribution {
  return {
    id: territoryId,
    territoryId,
    territoryNumber: `T-${territoryId}`,
    territoryType: TerritoryKind.Classical,
    type: TerritoryAttributionKind.Default,
    campaignId: null,
    startDate,
    endDate,
    lateDate: new Date(2026, 0, 1),
  }
}

describe('computeMonthlyCoverageEvolution', () => {
  const counts: TerritoryCountByType[] = [{ type: TerritoryKind.Classical, count: 10 }]

  it("retourne un tableau vide quand il n'y a aucun territoire", () => {
    const result = computeMonthlyCoverageEvolution([], [], new Date(2025, 8, 1), new Date(2025, 10, 30))
    expect(result).toEqual([])
  })

  it('retourne 0% pour chaque mois sans attributions', () => {
    const result = computeMonthlyCoverageEvolution([], counts, new Date(2025, 8, 1), new Date(2025, 10, 30))

    expect(result).toHaveLength(3)
    expect(result.every(m => m.coverage === 0)).toBe(true)
  })

  it('calcule la couverture cumulative mois par mois', () => {
    const attributions = [
      makeAttribution(1, new Date(2025, 8, 5), new Date(2025, 8, 20)),
      makeAttribution(2, new Date(2025, 9, 10), new Date(2025, 9, 25)),
    ]

    const result = computeMonthlyCoverageEvolution(attributions, counts, new Date(2025, 8, 1), new Date(2025, 10, 30))

    // Sept : territoire 1 touché = 10%
    expect(result[0].coverage).toBe(10)
    // Oct : territoires 1 et 2 touchés = 20%
    expect(result[1].coverage).toBe(20)
    // Nov : mêmes territoires, toujours 20%
    expect(result[2].coverage).toBe(20)
  })

  it('compte une attribution démarrée le dernier jour du mois (avec une heure non-zéro)', () => {
    // Attribution starting on the last day of September, at noon — the old
    // `<= monthEnd` predicate against local midnight of Sept 30 would drop it.
    const attributions = [makeAttribution(1, new Date(2025, 8, 30, 12, 0, 0), null)]

    const result = computeMonthlyCoverageEvolution(attributions, counts, new Date(2025, 8, 1), new Date(2025, 9, 31))

    expect(result[0].coverage).toBe(10)
    expect(result[1].coverage).toBe(10)
  })
})
