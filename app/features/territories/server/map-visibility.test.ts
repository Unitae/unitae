import { describe, expect, it } from 'vitest'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { availableForCreateWhere, contentPresentClause, mapVisibleWhere } from './map-visibility'

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

describe('availableForCreateWhere', () => {
  const prospectedAndActive = { buildings: { some: { active: true, prospectionDate: { not: null } } } }

  it('excludes entrances already attached to a territory of the same kind', () => {
    const result = availableForCreateWhere(TerritoryKind.Commerces, { phoneTypeActive: true })
    expect(result.AND).toContainEqual({ territories: { none: { type: TerritoryKind.Commerces } } })
  })

  it('always requires at least one active building with a prospection date', () => {
    for (const kind of [
      TerritoryKind.Classical,
      TerritoryKind.Phone,
      TerritoryKind.Commerces,
      TerritoryKind.Hotel,
      TerritoryKind.Univ,
    ]) {
      const result = availableForCreateWhere(kind, { phoneTypeActive: false })
      expect(result.AND).toContainEqual(prospectedAndActive)
    }
  })

  it('Classical with phone toggle ON only shows intercom / doorbell / (code + isOpenEarly)', () => {
    const result = availableForCreateWhere(TerritoryKind.Classical, { phoneTypeActive: true })
    expect(result).toEqual({
      AND: [
        { territories: { none: { type: TerritoryKind.Classical } } },
        prospectedAndActive,
        {
          OR: [
            { access: TerritoryAccess.Intercom },
            { access: TerritoryAccess.Doorbell },
            { access: TerritoryAccess.Code, isOpenEarly: true },
          ],
        },
      ],
    })
  })

  it('Classical with phone toggle OFF widens the code branch to any code entrance', () => {
    const result = availableForCreateWhere(TerritoryKind.Classical, { phoneTypeActive: false })
    expect(result.AND).toContainEqual({
      OR: [
        { access: TerritoryAccess.Intercom },
        { access: TerritoryAccess.Doorbell },
        { access: TerritoryAccess.Code },
      ],
    })
  })

  it('Phone requires phones > 0 or a code-locked entrance that stays locked in the morning', () => {
    const result = availableForCreateWhere(TerritoryKind.Phone, { phoneTypeActive: true })
    expect(result).toEqual({
      AND: [
        { territories: { none: { type: TerritoryKind.Phone } } },
        prospectedAndActive,
        {
          OR: [{ phones: { gt: 0 } }, { access: TerritoryAccess.Code, isOpenEarly: false }],
        },
      ],
    })
  })

  it('Phone clause is independent of phoneTypeActive (tab loader gates access to the whole flow)', () => {
    const on = availableForCreateWhere(TerritoryKind.Phone, { phoneTypeActive: true })
    const off = availableForCreateWhere(TerritoryKind.Phone, { phoneTypeActive: false })
    expect(off).toEqual(on)
  })

  it('Commerces has no access clause — prospection + not-already-typed is enough', () => {
    const result = availableForCreateWhere(TerritoryKind.Commerces, { phoneTypeActive: false })
    expect(result).toEqual({
      AND: [{ territories: { none: { type: TerritoryKind.Commerces } } }, prospectedAndActive],
    })
  })

  it('Hotel has no access clause', () => {
    const result = availableForCreateWhere(TerritoryKind.Hotel, { phoneTypeActive: true })
    expect(result).toEqual({
      AND: [{ territories: { none: { type: TerritoryKind.Hotel } } }, prospectedAndActive],
    })
  })

  it('Univ has no access clause', () => {
    const result = availableForCreateWhere(TerritoryKind.Univ, { phoneTypeActive: false })
    expect(result).toEqual({
      AND: [{ territories: { none: { type: TerritoryKind.Univ } } }, prospectedAndActive],
    })
  })
})
