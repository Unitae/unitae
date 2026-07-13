import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { computeDurationStats } from './compute-duration-stats.server'
import type { StatsAttribution } from './stats-attribution.type'

function makeAttribution(
  startDate: Date,
  endDate: Date | null,
  overrides: Partial<Pick<StatsAttribution, 'id' | 'territoryId' | 'territoryNumber'>> = {},
): StatsAttribution {
  return {
    id: overrides.id ?? 1,
    territoryId: overrides.territoryId ?? 1,
    territoryNumber: overrides.territoryNumber ?? 'T-1',
    territoryType: TerritoryKind.Classical,
    type: TerritoryAttributionKind.Default,
    startDate,
    endDate,
    lateDate: new Date(2026, 0, 1),
  }
}

describe('computeDurationStats', () => {
  it('returns zeros and null territories when there are no attributions', () => {
    expect(computeDurationStats([])).toEqual({
      averageDays: 0,
      longestDays: 0,
      longestTerritory: null,
      shortestDays: 0,
      shortestTerritory: null,
    })
  })

  it('ignores ongoing attributions (endDate null)', () => {
    const attributions = [makeAttribution(new Date(2025, 9, 1), null)]
    expect(computeDurationStats(attributions)).toEqual({
      averageDays: 0,
      longestDays: 0,
      longestTerritory: null,
      shortestDays: 0,
      shortestTerritory: null,
    })
  })

  it('computes stats and surfaces the sole territory for a single completed attribution', () => {
    const attributions = [
      makeAttribution(new Date(2025, 9, 1), new Date(2025, 10, 1), { territoryId: 7, territoryNumber: '17' }),
    ]

    expect(computeDurationStats(attributions)).toEqual({
      averageDays: 31,
      longestDays: 31,
      longestTerritory: { id: 7, number: '17' },
      shortestDays: 31,
      shortestTerritory: { id: 7, number: '17' },
    })
  })

  it('computes the average, longest and shortest', () => {
    const attributions = [
      makeAttribution(new Date(2025, 0, 1), new Date(2025, 0, 11), { territoryId: 1, territoryNumber: 'A' }), // 10 days
      makeAttribution(new Date(2025, 1, 1), new Date(2025, 2, 3), { territoryId: 2, territoryNumber: 'B' }), // 30 days
      makeAttribution(new Date(2025, 3, 1), new Date(2025, 4, 21), { territoryId: 3, territoryNumber: 'C' }), // 50 days
    ]

    const result = computeDurationStats(attributions)
    expect(result.averageDays).toBe(30)
    expect(result.longestDays).toBe(50)
    expect(result.shortestDays).toBe(10)
  })

  it('surfaces the territory that owns the longest completed attribution', () => {
    const attributions = [
      makeAttribution(new Date(2025, 0, 1), new Date(2025, 0, 11), { territoryId: 1, territoryNumber: 'A' }), // 10 days
      makeAttribution(new Date(2025, 3, 1), new Date(2025, 4, 21), { territoryId: 3, territoryNumber: 'C' }), // 50 days
      makeAttribution(new Date(2025, 1, 1), new Date(2025, 2, 3), { territoryId: 2, territoryNumber: 'B' }), // 30 days
    ]

    const result = computeDurationStats(attributions)
    expect(result.longestTerritory).toEqual({ id: 3, number: 'C' })
  })

  it('surfaces the territory that owns the shortest completed attribution', () => {
    const attributions = [
      makeAttribution(new Date(2025, 3, 1), new Date(2025, 4, 21), { territoryId: 3, territoryNumber: 'C' }), // 50 days
      makeAttribution(new Date(2025, 0, 1), new Date(2025, 0, 11), { territoryId: 9, territoryNumber: 'S' }), // 10 days
      makeAttribution(new Date(2025, 1, 1), new Date(2025, 2, 3), { territoryId: 2, territoryNumber: 'B' }), // 30 days
    ]

    const result = computeDurationStats(attributions)
    expect(result.shortestTerritory).toEqual({ id: 9, number: 'S' })
  })
})
