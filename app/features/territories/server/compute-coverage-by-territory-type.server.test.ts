import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { computeCoverageByTerritoryType } from './compute-coverage-by-territory-type.server'
import type { StatsAttribution } from './stats-attribution.type'
import type { TerritoryCountByType } from './territory-count-by-type.type'

function makeAttribution(territoryId: number, territoryType: TerritoryKindKey): StatsAttribution {
  return {
    id: territoryId,
    territoryId,
    territoryNumber: `T-${territoryId}`,
    territoryType,
    type: TerritoryAttributionKind.Default,
    campaignId: null,
    campaignRestPeriodDays: null,
    startDate: new Date(2025, 9, 1),
    endDate: new Date(2025, 10, 1),
    lateDate: new Date(2025, 11, 1),
  }
}

describe('computeCoverageByTerritoryType', () => {
  it("retourne des couvertures à 0 quand il n'y a aucune attribution", () => {
    const counts: TerritoryCountByType[] = [{ type: TerritoryKindKey.Classical, count: 10 }]
    const result = computeCoverageByTerritoryType([], counts)

    expect(result).toHaveLength(1)
    expect(result[0].coverage).toBe(0)
    expect(result[0].totalCoverage).toBe(0)
    expect(result[0].label).toBe('Porte à porte')
  })

  it('calcule la couverture par type de territoire', () => {
    const counts: TerritoryCountByType[] = [
      { type: TerritoryKindKey.Classical, count: 10 },
      { type: TerritoryKindKey.Commerces, count: 5 },
    ]
    const attributions = [
      makeAttribution(1, TerritoryKindKey.Classical),
      makeAttribution(2, TerritoryKindKey.Classical),
      makeAttribution(2, TerritoryKindKey.Classical), // même territoire, 2 fois
      makeAttribution(10, TerritoryKindKey.Commerces),
    ]

    const result = computeCoverageByTerritoryType(attributions, counts)

    // Classique : 3 attributions / 10 territoires = 30%, 2 territoires distincts / 10 = 20%
    expect(result[0].coverage).toBe(30)
    expect(result[0].totalCoverage).toBe(20)

    // Commerces : 1 attribution / 5 territoires = 20%, 1 territoire / 5 = 20%
    expect(result[1].coverage).toBe(20)
    expect(result[1].totalCoverage).toBe(20)
  })

  it('gère un type avec 0 territoires', () => {
    const counts: TerritoryCountByType[] = [{ type: TerritoryKindKey.Hotel, count: 0 }]
    const result = computeCoverageByTerritoryType([], counts)

    expect(result[0].coverage).toBe(0)
    expect(result[0].totalCoverage).toBe(0)
  })

  it('utilise le type brut comme label pour un type inconnu avec 0 territoires', () => {
    const counts: TerritoryCountByType[] = [{ type: 'special' as TerritoryKindKey, count: 0 }]
    const result = computeCoverageByTerritoryType([], counts)

    expect(result[0].label).toBe('special')
  })

  it('utilise le type brut comme label quand le type est inconnu', () => {
    const counts: TerritoryCountByType[] = [{ type: 'unknown-type' as TerritoryKindKey, count: 5 }]
    const result = computeCoverageByTerritoryType([], counts)

    expect(result[0].label).toBe('unknown-type')
    expect(result[0].kind).toBe('unknown-type')
  })

  it('utilise le type brut comme label pour un type inconnu avec des attributions', () => {
    const counts: TerritoryCountByType[] = [{ type: 'custom' as TerritoryKindKey, count: 2 }]
    const attributions = [makeAttribution(1, 'custom' as TerritoryKindKey)]

    const result = computeCoverageByTerritoryType(attributions, counts)

    expect(result[0].label).toBe('custom')
    expect(result[0].coverage).toBe(50)
  })
})
