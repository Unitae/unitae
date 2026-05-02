import { describe, expect, it } from 'vitest'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { territoryContentLabel } from './territory-content-label'

const e = (homes: number | null, phones: number | null = null) => ({ homes, phones })

describe('territoryContentLabel', () => {
  describe('Phone territories', () => {
    it('sums the phones field across entrances', () => {
      expect(territoryContentLabel(TerritoryKind.Phone, [e(0, 12), e(0, 8)])).toBe('20 tél.')
    })

    it('treats null phones as 0', () => {
      expect(territoryContentLabel(TerritoryKind.Phone, [e(0, null), e(0, 5)])).toBe('5 tél.')
    })

    it('returns 0 for an empty list', () => {
      expect(territoryContentLabel(TerritoryKind.Phone, [])).toBe('0 tél.')
    })
  })

  describe('Classical / Univ territories', () => {
    it.each([TerritoryKind.Classical, TerritoryKind.Univ])('sums homes for %s', kind => {
      expect(territoryContentLabel(kind, [e(10), e(20), e(5)])).toBe('35 foyers')
    })

    it('falls back to phones when homes is 0 (e.g. residential entrance with no doors but phones)', () => {
      expect(territoryContentLabel(TerritoryKind.Classical, [e(0, 8)])).toBe('8 foyers')
    })

    it('uses the singular key when count is exactly 1', () => {
      expect(territoryContentLabel(TerritoryKind.Classical, [e(1)])).toBe('1 foyer')
    })

    it('returns 0 for an empty list (singular branch)', () => {
      expect(territoryContentLabel(TerritoryKind.Classical, [])).toBe('0 foyer')
    })
  })

  describe('Commerces territories', () => {
    it('counts entrances regardless of homes/phones', () => {
      expect(territoryContentLabel(TerritoryKind.Commerces, [e(0), e(0), e(0)])).toBe('3 commerces')
    })

    it('uses the singular key when there is exactly one entrance', () => {
      expect(territoryContentLabel(TerritoryKind.Commerces, [e(0)])).toBe('1 commerce')
    })

    it('returns 0 for an empty list (singular branch)', () => {
      expect(territoryContentLabel(TerritoryKind.Commerces, [])).toBe('0 commerce')
    })
  })

  describe('Hotel territories', () => {
    it('counts entrances regardless of homes/phones', () => {
      expect(territoryContentLabel(TerritoryKind.Hotel, [e(0), e(0)])).toBe('2 hôtels')
    })

    it('uses the singular key when there is exactly one entrance', () => {
      expect(territoryContentLabel(TerritoryKind.Hotel, [e(0)])).toBe('1 hôtel')
    })
  })

  it('falls back to the entrances key for unknown territory types', () => {
    // Cast through unknown to satisfy the strict signature while exercising the default branch.
    expect(territoryContentLabel('unknown-kind' as unknown as TerritoryKind, [e(0), e(0)])).toBe('2 entrées')
    expect(territoryContentLabel('unknown-kind' as unknown as TerritoryKind, [e(0)])).toBe('1 entrée')
  })
})
