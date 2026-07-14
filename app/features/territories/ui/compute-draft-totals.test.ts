import { describe, expect, it } from 'vitest'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { computeDraftTotals } from './compute-draft-totals'

function entrance(overrides: Partial<BboxEntrance> = {}): BboxEntrance {
  return {
    id: 1,
    latitude: 0,
    longitude: 0,
    kind: EntranceKind.Residential,
    shopKind: '',
    homes: 0,
    phones: 0,
    liberals: 0,
    address: { number: '', street: '', zip: '' },
    buildingId: 1,
    status: 'available',
    otherTerritory: null,
    access: null,
    accesses: [],
    isPMR: null,
    isOpenEarly: null,
    isMailboxOpen: null,
    prospectionDate: null,
    ...overrides,
  }
}

describe('computeDraftTotals', () => {
  it('sums homes for Classical territories, count is entrance count', () => {
    const result = computeDraftTotals(TerritoryKind.Classical, [entrance({ homes: 12 }), entrance({ homes: 8 })])
    expect(result).toEqual({ metric: 'homes', primary: 20, count: 2 })
  })

  it('for Classical, falls back to phones when homes is zero (mirrors computeTerritoryQuantity)', () => {
    const result = computeDraftTotals(TerritoryKind.Classical, [entrance({ homes: 0, phones: 15 })])
    expect(result.primary).toBe(15)
  })

  it('sums phones for Phone territories', () => {
    const result = computeDraftTotals(TerritoryKind.Phone, [entrance({ phones: 40 }), entrance({ phones: 25 })])
    expect(result).toEqual({ metric: 'phones', primary: 65, count: 2 })
  })

  it('sums homes-or-phones for Univ (campus) territories', () => {
    const result = computeDraftTotals(TerritoryKind.Univ, [entrance({ homes: 5 }), entrance({ homes: 0, phones: 12 })])
    expect(result).toEqual({ metric: 'homes', primary: 17, count: 2 })
  })

  it('reports only entrance count for Commerces (no per-entrance quantity)', () => {
    const result = computeDraftTotals(TerritoryKind.Commerces, [entrance(), entrance()])
    expect(result).toEqual({ metric: 'count', primary: 2, count: 2 })
  })

  it('reports only entrance count for Hotel', () => {
    const result = computeDraftTotals(TerritoryKind.Hotel, [entrance(), entrance(), entrance()])
    expect(result).toEqual({ metric: 'count', primary: 3, count: 3 })
  })

  it('handles the empty draft cleanly', () => {
    expect(computeDraftTotals(TerritoryKind.Classical, [])).toEqual({ metric: 'homes', primary: 0, count: 0 })
    expect(computeDraftTotals(TerritoryKind.Commerces, [])).toEqual({ metric: 'count', primary: 0, count: 0 })
  })
})
