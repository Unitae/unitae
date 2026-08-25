import { describe, expect, it } from 'vitest'
import { AttributionCategory } from '~/features/territories/model/attribution-category'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { parseStatsFilterParams } from './parse-stats-filter-params.server'

describe('parseStatsFilterParams', () => {
  it("retourne les valeurs par défaut quand aucun paramètre n'est fourni", () => {
    const params = new URLSearchParams()
    const result = parseStatsFilterParams(params, 2025)

    expect(result.territoryKind).toEqual([TerritoryKindKey.Classical])
    expect(result.attributionKind).toEqual([AttributionCategory.Default, AttributionCategory.Campaign])
    expect(result.startDate).toEqual(new Date(2025, 8, 1))
    expect(result.endDate).toEqual(new Date(2026, 7, 31))
    expect(result.groupId).toBeUndefined()
  })

  it('utilise les paramètres fournis', () => {
    const params = new URLSearchParams()
    params.append('kind', TerritoryKindKey.Phone)
    params.append('kind', TerritoryKindKey.Commerces)
    params.append('attributionKind', AttributionCategory.Campaign)
    params.set('startDate', '2025-01-01')
    params.set('endDate', '2025-06-30')
    params.set('group', '42')

    const result = parseStatsFilterParams(params, 2025)

    expect(result.territoryKind).toEqual([TerritoryKindKey.Phone, TerritoryKindKey.Commerces])
    expect(result.attributionKind).toEqual([AttributionCategory.Campaign])
    expect(result.startDate).toEqual(new Date(2025, 0, 1))
    expect(result.endDate).toEqual(new Date(2025, 5, 30))
    expect(result.groupId).toBe(42)
  })

  it('ignore le groupe quand la valeur est "none"', () => {
    const params = new URLSearchParams()
    params.set('group', 'none')

    const result = parseStatsFilterParams(params, 2025)
    expect(result.groupId).toBeUndefined()
  })

  it('retourne un tableau vide quand kind=none ("Tous types")', () => {
    const params = new URLSearchParams()
    params.set('kind', 'none')

    const result = parseStatsFilterParams(params, 2025)
    expect(result.territoryKind).toEqual([])
  })

  it('parse les dates en heure locale (pas en UTC)', () => {
    const params = new URLSearchParams()
    params.set('startDate', '2025-09-01')
    params.set('endDate', '2026-08-31')

    const result = parseStatsFilterParams(params, 2025)

    // Local midnight, identical to the constructor used by getBeginingDateOfTheocraticYear.
    expect(result.startDate).toEqual(new Date(2025, 8, 1))
    expect(result.endDate).toEqual(new Date(2026, 7, 31))
  })

  it('retombe sur les dates par défaut quand startDate est vide', () => {
    const params = new URLSearchParams()
    params.set('startDate', '')
    params.set('endDate', '2026-08-31')

    const result = parseStatsFilterParams(params, 2025)

    expect(result.startDate).toEqual(new Date(2025, 8, 1))
    expect(result.endDate).toEqual(new Date(2026, 7, 31))
  })

  it("retombe sur les dates par défaut quand startDate n'est pas une date", () => {
    const params = new URLSearchParams()
    params.set('startDate', 'not-a-date')

    const result = parseStatsFilterParams(params, 2025)

    expect(result.startDate).toEqual(new Date(2025, 8, 1))
  })

  it('échange start/end quand la plage est inversée', () => {
    const params = new URLSearchParams()
    params.set('startDate', '2026-01-01')
    params.set('endDate', '2025-01-01')

    const result = parseStatsFilterParams(params, 2025)

    expect(result.startDate).toEqual(new Date(2025, 0, 1))
    expect(result.endDate).toEqual(new Date(2026, 0, 1))
  })
})
