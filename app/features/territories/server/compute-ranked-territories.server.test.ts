import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { computeRankedTerritories } from './compute-ranked-territories.server'
import type { StatsAttribution } from './stats-attribution.type'

function makeAttribution(overrides: Partial<StatsAttribution> = {}): StatsAttribution {
  return {
    id: 1,
    territoryId: 1,
    territoryNumber: 'T-1',
    territoryType: TerritoryKind.Classical,
    type: TerritoryAttributionKind.Default,
    startDate: new Date(2025, 9, 1),
    endDate: new Date(2025, 10, 1),
    lateDate: new Date(2025, 11, 1),
    ...overrides,
  }
}

describe('computeRankedTerritories', () => {
  it("retourne null quand il n'y a aucune attribution", () => {
    const result = computeRankedTerritories([])
    expect(result).toEqual({ most: null, least: null })
  })

  it('retourne le même territoire pour most et least avec une seule attribution', () => {
    const result = computeRankedTerritories([makeAttribution()])
    expect(result.most).toEqual({ number: 'T-1', count: 1 })
    expect(result.least).toEqual({ number: 'T-1', count: 1 })
  })

  it('identifie le territoire le plus et le moins travaillé', () => {
    const attributions = [
      makeAttribution({ territoryId: 1, territoryNumber: 'T-1', id: 1 }),
      makeAttribution({ territoryId: 1, territoryNumber: 'T-1', id: 2 }),
      makeAttribution({ territoryId: 1, territoryNumber: 'T-1', id: 3 }),
      makeAttribution({ territoryId: 2, territoryNumber: 'T-2', id: 4 }),
      makeAttribution({ territoryId: 3, territoryNumber: 'T-3', id: 5 }),
      makeAttribution({ territoryId: 3, territoryNumber: 'T-3', id: 6 }),
    ]

    const result = computeRankedTerritories(attributions)
    expect(result.most).toEqual({ number: 'T-1', count: 3 })
    expect(result.least).toEqual({ number: 'T-2', count: 1 })
  })
})
