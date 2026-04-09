import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { parseStatsFilterParams } from './parse-stats-filter-params.server'

describe('parseStatsFilterParams', () => {
  it('retourne les valeurs par défaut quand aucun paramètre n\'est fourni', () => {
    const params = new URLSearchParams()
    const result = parseStatsFilterParams(params, 2025)

    expect(result.territoryKind).toEqual([TerritoryKind.Classical])
    expect(result.attributionKind).toEqual([TerritoryAttributionKind.Default])
    expect(result.startDate).toEqual(new Date(2025, 8, 1))
    expect(result.endDate).toEqual(new Date(2026, 7, 31))
    expect(result.groupId).toBeUndefined()
  })

  it('utilise les paramètres fournis', () => {
    const params = new URLSearchParams()
    params.append('kind', TerritoryKind.Phone)
    params.append('kind', TerritoryKind.Commerces)
    params.append('attributionKind', TerritoryAttributionKind.Campaign)
    params.set('startDate', '2025-01-01')
    params.set('endDate', '2025-06-30')
    params.set('group', '42')

    const result = parseStatsFilterParams(params, 2025)

    expect(result.territoryKind).toEqual([TerritoryKind.Phone, TerritoryKind.Commerces])
    expect(result.attributionKind).toEqual([TerritoryAttributionKind.Campaign])
    expect(result.startDate).toEqual(new Date('2025-01-01'))
    expect(result.endDate).toEqual(new Date('2025-06-30'))
    expect(result.groupId).toBe(42)
  })

  it('ignore le groupe quand la valeur est "none"', () => {
    const params = new URLSearchParams()
    params.set('group', 'none')

    const result = parseStatsFilterParams(params, 2025)
    expect(result.groupId).toBeUndefined()
  })
})
