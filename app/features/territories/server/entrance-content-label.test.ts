import { describe, expect, it } from 'vitest'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { entranceContentLabel } from './entrance-content-label'

const make = (overrides: Partial<Parameters<typeof entranceContentLabel>[1]> = {}) => ({
  kind: EntranceKind.Residential,
  shopKind: null,
  homes: null,
  phones: null,
  ...overrides,
})

describe('entranceContentLabel', () => {
  describe('Commerce entrance', () => {
    it('renders the shopKind capitalised', () => {
      expect(entranceContentLabel(TerritoryKind.Commerces, make({ kind: EntranceKind.Commerce, shopKind: 'boulangerie' }))).toBe('Boulangerie')
    })

    it('trims surrounding whitespace before capitalising', () => {
      expect(entranceContentLabel(TerritoryKind.Commerces, make({ kind: EntranceKind.Commerce, shopKind: '  pharmacie  ' }))).toBe('Pharmacie')
    })

    it('falls back to the kind label when shopKind is empty', () => {
      expect(entranceContentLabel(TerritoryKind.Commerces, make({ kind: EntranceKind.Commerce, shopKind: '' }))).toBe('Commerce')
    })

    it('falls back to the kind label when shopKind is null', () => {
      expect(entranceContentLabel(TerritoryKind.Commerces, make({ kind: EntranceKind.Commerce, shopKind: null }))).toBe('Commerce')
    })
  })

  it('renders the kind label for Hotel entrances', () => {
    expect(entranceContentLabel(TerritoryKind.Hotel, make({ kind: EntranceKind.Hotel }))).toBe('Hôtel')
  })

  it('renders the kind label for Campus entrances', () => {
    expect(entranceContentLabel(TerritoryKind.Univ, make({ kind: EntranceKind.Campus }))).toBe('Résidence universitaire')
  })

  it('renders the kind label for Laundromat entrances', () => {
    expect(entranceContentLabel(TerritoryKind.Classical, make({ kind: EntranceKind.Laundromat }))).toBe('Laverie')
  })

  describe('Residential entrance', () => {
    it('shows phone count when the territory is a phone territory', () => {
      expect(entranceContentLabel(TerritoryKind.Phone, make({ kind: EntranceKind.Residential, phones: 12 }))).toBe('12 tél.')
    })

    it('shows 0 phones when the entrance has no phones field on a phone territory', () => {
      expect(entranceContentLabel(TerritoryKind.Phone, make({ kind: EntranceKind.Residential }))).toBe('0 tél.')
    })

    it('shows the homes count on a Classical territory', () => {
      expect(entranceContentLabel(TerritoryKind.Classical, make({ kind: EntranceKind.Residential, homes: 8 }))).toBe('8 foyers')
    })

    it('uses the singular key when homes equals 1', () => {
      expect(entranceContentLabel(TerritoryKind.Classical, make({ kind: EntranceKind.Residential, homes: 1 }))).toBe('1 foyer')
    })

    it('falls back to phones when homes is null on a non-phone territory', () => {
      expect(entranceContentLabel(TerritoryKind.Univ, make({ kind: EntranceKind.Residential, homes: null, phones: 5 }))).toBe('5 foyers')
    })

    it('returns 0 in the singular branch when both homes and phones are null', () => {
      expect(entranceContentLabel(TerritoryKind.Classical, make({ kind: EntranceKind.Residential }))).toBe('0 foyer')
    })
  })
})
