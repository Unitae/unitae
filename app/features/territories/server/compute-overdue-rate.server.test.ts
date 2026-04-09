import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { StatsAttribution } from './stats-attribution.type'
import { computeOverdueRate } from './compute-overdue-rate.server'

function makeAttribution(endDate: Date | null, lateDate: Date): StatsAttribution {
  return {
    id: 1,
    territoryId: 1,
    territoryNumber: 'T-1',
    territoryType: TerritoryKind.Classical,
    type: TerritoryAttributionKind.Default,
    startDate: new Date(2025, 0, 1),
    endDate,
    lateDate,
  }
}

describe('computeOverdueRate', () => {
  it('retourne 0 quand il n\'y a aucune attribution', () => {
    expect(computeOverdueRate([])).toBe(0)
  })

  it('retourne 0 quand toutes les attributions sont en cours', () => {
    const attributions = [makeAttribution(null, new Date(2025, 5, 1))]
    expect(computeOverdueRate(attributions)).toBe(0)
  })

  it('retourne 0 quand aucune attribution n\'est en retard', () => {
    const attributions = [
      makeAttribution(new Date(2025, 4, 1), new Date(2025, 5, 1)), // rendue avant la date limite
    ]
    expect(computeOverdueRate(attributions)).toBe(0)
  })

  it('retourne 100 quand toutes les attributions sont en retard', () => {
    const attributions = [
      makeAttribution(new Date(2025, 6, 1), new Date(2025, 5, 1)), // rendue après la date limite
    ]
    expect(computeOverdueRate(attributions)).toBe(100)
  })

  it('calcule le pourcentage correct', () => {
    const attributions = [
      makeAttribution(new Date(2025, 6, 1), new Date(2025, 5, 1)), // en retard
      makeAttribution(new Date(2025, 4, 1), new Date(2025, 5, 1)), // à temps
      makeAttribution(new Date(2025, 4, 15), new Date(2025, 5, 1)), // à temps
      makeAttribution(null, new Date(2025, 5, 1)), // en cours, ignorée
    ]
    // 1 en retard sur 3 complétées = 33.33%
    expect(computeOverdueRate(attributions)).toBeCloseTo(33.33, 1)
  })
})
