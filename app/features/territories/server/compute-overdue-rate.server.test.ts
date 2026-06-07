import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { computeOverdueRate } from './compute-overdue-rate.server'
import type { StatsAttribution } from './stats-attribution.type'

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

const WINDOW_START = new Date(2025, 0, 1)
const WINDOW_END = new Date(2025, 11, 31)

describe('computeOverdueRate', () => {
  it("retourne 0 quand il n'y a aucune attribution", () => {
    expect(computeOverdueRate([], WINDOW_START, WINDOW_END)).toBe(0)
  })

  it('retourne 0 quand toutes les attributions sont en cours', () => {
    const attributions = [makeAttribution(null, new Date(2025, 5, 1))]
    expect(computeOverdueRate(attributions, WINDOW_START, WINDOW_END)).toBe(0)
  })

  it("retourne 0 quand aucune attribution n'est en retard", () => {
    const attributions = [
      makeAttribution(new Date(2025, 4, 1), new Date(2025, 5, 1)), // rendue avant la date limite
    ]
    expect(computeOverdueRate(attributions, WINDOW_START, WINDOW_END)).toBe(0)
  })

  it('retourne 100 quand toutes les attributions sont en retard', () => {
    const attributions = [
      makeAttribution(new Date(2025, 6, 1), new Date(2025, 5, 1)), // rendue après la date limite
    ]
    expect(computeOverdueRate(attributions, WINDOW_START, WINDOW_END)).toBe(100)
  })

  it('calcule le pourcentage correct', () => {
    const attributions = [
      makeAttribution(new Date(2025, 6, 1), new Date(2025, 5, 1)), // en retard
      makeAttribution(new Date(2025, 4, 1), new Date(2025, 5, 1)), // à temps
      makeAttribution(new Date(2025, 4, 15), new Date(2025, 5, 1)), // à temps
      makeAttribution(null, new Date(2025, 5, 1)), // en cours, ignorée
    ]
    // 1 en retard sur 3 complétées = 33.33%
    expect(computeOverdueRate(attributions, WINDOW_START, WINDOW_END)).toBeCloseTo(33.33, 1)
  })

  it('ignore les attributions dont la `lateDate` est avant la fenêtre', () => {
    const attributions = [
      // Completed in window but lateDate is before windowStart — must NOT count.
      makeAttribution(new Date(2025, 6, 1), new Date(2024, 5, 1)),
      // Completed in window AND lateDate in window — counts.
      makeAttribution(new Date(2025, 6, 1), new Date(2025, 5, 1)),
    ]
    expect(computeOverdueRate(attributions, WINDOW_START, WINDOW_END)).toBe(100)
  })

  it('inclut une attribution dont la `lateDate` est le dernier jour de la fenêtre', () => {
    const attributions = [
      // lateDate is exactly windowEnd (Dec 31). Must be included because the
      // boundary uses startOfNextDay → strict-less than next day's midnight.
      makeAttribution(new Date(2026, 0, 5), WINDOW_END),
    ]
    expect(computeOverdueRate(attributions, WINDOW_START, WINDOW_END)).toBe(100)
  })
})
