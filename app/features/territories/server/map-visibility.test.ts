import { describe, expect, it } from 'vitest'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { contentPresentClause, mapVisibleWhere } from './map-visibility'

const digicodeUnknown = {
  AND: [{ homes: null }, { accesses: { some: { type: TerritoryAccess.Code } } }],
}

describe('contentPresentClause', () => {
  it('returns null for Commerces territories (prospection alone is enough)', () => {
    expect(contentPresentClause(TerritoryKind.Commerces, { phoneTypeActive: true })).toBeNull()
    expect(contentPresentClause(TerritoryKind.Commerces, { phoneTypeActive: false })).toBeNull()
  })

  it('returns null for Hotel territories', () => {
    expect(contentPresentClause(TerritoryKind.Hotel, { phoneTypeActive: true })).toBeNull()
  })

  it('returns null for Univ territories', () => {
    expect(contentPresentClause(TerritoryKind.Univ, { phoneTypeActive: false })).toBeNull()
  })

  it('Classical with phone toggle ON requires homes > 0 or digicode-unknown', () => {
    expect(contentPresentClause(TerritoryKind.Classical, { phoneTypeActive: true })).toEqual({
      OR: [{ homes: { gt: 0 } }, digicodeUnknown],
    })
  })

  it('Classical with phone toggle OFF falls back to homes OR phones OR digicode-unknown', () => {
    expect(contentPresentClause(TerritoryKind.Classical, { phoneTypeActive: false })).toEqual({
      OR: [{ homes: { gt: 0 } }, { phones: { gt: 0 } }, digicodeUnknown],
    })
  })

  it('Phone requires phones > 0 or digicode-unknown', () => {
    expect(contentPresentClause(TerritoryKind.Phone, { phoneTypeActive: true })).toEqual({
      OR: [{ phones: { gt: 0 } }, digicodeUnknown],
    })
  })
})

describe('mapVisibleWhere', () => {
  it('always includes the own-territory branch, keyed by territoryId', () => {
    const result = mapVisibleWhere(TerritoryKind.Classical, 42, { phoneTypeActive: true })
    expect(result.OR?.[0]).toEqual({ territories: { some: { id: 42 } } })
  })

  it('wraps the content clause under a prospected-buildings AND for residential kinds', () => {
    const result = mapVisibleWhere(TerritoryKind.Classical, 1, { phoneTypeActive: true })
    expect(result.OR?.[1]).toEqual({
      AND: [
        { buildings: { some: { prospectionDate: { not: null } } } },
        { OR: [{ homes: { gt: 0 } }, digicodeUnknown] },
      ],
    })
  })

  it('drops the content clause for non-residential kinds — prospection alone', () => {
    const result = mapVisibleWhere(TerritoryKind.Commerces, 1, { phoneTypeActive: true })
    expect(result.OR?.[1]).toEqual({ buildings: { some: { prospectionDate: { not: null } } } })
  })

  it('composes the Classical toggle-off clause into the prospected branch', () => {
    const result = mapVisibleWhere(TerritoryKind.Classical, 7, { phoneTypeActive: false })
    expect(result).toEqual({
      OR: [
        { territories: { some: { id: 7 } } },
        {
          AND: [
            { buildings: { some: { prospectionDate: { not: null } } } },
            { OR: [{ homes: { gt: 0 } }, { phones: { gt: 0 } }, digicodeUnknown] },
          ],
        },
      ],
    })
  })

  it('composes the Phone clause into the prospected branch', () => {
    const result = mapVisibleWhere(TerritoryKind.Phone, 3, { phoneTypeActive: true })
    expect(result).toEqual({
      OR: [
        { territories: { some: { id: 3 } } },
        {
          AND: [
            { buildings: { some: { prospectionDate: { not: null } } } },
            { OR: [{ phones: { gt: 0 } }, digicodeUnknown] },
          ],
        },
      ],
    })
  })
})
