import { describe, expect, it } from 'vitest'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { computeFilters } from './territory-filters.server'

describe('computeFilters', () => {
  it('returns empty object when no params', () => {
    const result = computeFilters(new URLSearchParams())
    expect(result).toEqual({})
  })

  it('applies zip filter through nested buildings lookup', () => {
    const result = computeFilters(new URLSearchParams({ zip: '75001' }))
    expect(result).toMatchObject({
      entrances: {
        some: {
          buildings: {
            some: {
              zip: { equals: '75001' },
            },
          },
        },
      },
    })
  })

  it('ignores zip filter when zip is "none"', () => {
    const result = computeFilters(new URLSearchParams({ zip: 'none' }))
    expect(result).not.toHaveProperty('entrances')
  })

  it('applies type filter', () => {
    const result = computeFilters(new URLSearchParams({ type: TerritoryKindKey.Classical }))
    expect(result).toMatchObject({ type: { equals: TerritoryKindKey.Classical } })
  })

  it('ignores type filter when type is "none"', () => {
    const result = computeFilters(new URLSearchParams({ type: 'none' }))
    expect(result).not.toHaveProperty('type')
  })

  it('applies access filter', () => {
    const result = computeFilters(new URLSearchParams({ access: '3' }))
    expect(result).toMatchObject({
      entrances: {
        some: {
          access: { equals: 3 },
        },
      },
    })
  })

  it('ignores access filter when access is "none"', () => {
    const result = computeFilters(new URLSearchParams({ access: 'none' }))
    expect(result).not.toHaveProperty('entrances')
  })

  it('applies search filter matching territory number case-insensitively', () => {
    const result = computeFilters(new URLSearchParams({ search: 'D012' }))
    const or = result.OR as unknown[]
    expect(or).toContainEqual({ number: { contains: 'D012', mode: 'insensitive' } })
  })

  it('strips diacritics and lowercases the street branch', () => {
    const result = computeFilters(new URLSearchParams({ search: 'Pâix' }))
    const or = result.OR as { entrances?: { some?: { buildings?: { some?: { streetNormalized?: unknown } } } } }[]
    const buildingsClause = or.find(c => c.entrances)
    expect(buildingsClause?.entrances?.some?.buildings?.some).toMatchObject({
      streetNormalized: { contains: 'paix' },
    })
  })

  it('trims whitespace before searching', () => {
    const result = computeFilters(new URLSearchParams({ search: '   muguets   ' }))
    const or = result.OR as { number?: { contains: string } }[]
    expect(or).toContainEqual({ number: { contains: 'muguets', mode: 'insensitive' } })
  })

  it('strips a leading @ proximity marker', () => {
    const result = computeFilters(new URLSearchParams({ search: '@bastille' }))
    const or = result.OR as { number?: { contains: string } }[]
    expect(or).toContainEqual({ number: { contains: 'bastille', mode: 'insensitive' } })
  })

  it('applies AND(number, street) when search starts with a number', () => {
    const result = computeFilters(new URLSearchParams({ search: '42 Rue de la Paix' }))
    const or = result.OR as { entrances?: { some?: { buildings?: { some?: { AND?: unknown[] } } } } }[]
    const buildingsClause = or.find(c => c.entrances)
    const buildingsAnd = buildingsClause?.entrances?.some?.buildings?.some?.AND
    expect(buildingsAnd).toBeDefined()
  })

  it('searches publisher first/last name on current attribution', () => {
    const result = computeFilters(new URLSearchParams({ search: 'Päjot' }))
    const or = result.OR as { attributions?: { some?: { publisher?: { OR?: Record<string, unknown>[] } } } }[]
    const publisherClause = or.find(c => c.attributions)
    const publisherOr = publisherClause?.attributions?.some?.publisher?.OR
    expect(publisherOr).toEqual(
      expect.arrayContaining([
        { firstnameNormalized: { contains: 'pajot' } },
        { lastnameNormalized: { contains: 'pajot' } },
      ]),
    )
  })

  it('ignores search filter when search is empty', () => {
    const result = computeFilters(new URLSearchParams({ search: '' }))
    expect(result).not.toHaveProperty('OR')
  })

  it('ignores search filter when query is only whitespace', () => {
    const result = computeFilters(new URLSearchParams({ search: '   ' }))
    expect(result).not.toHaveProperty('OR')
  })

  it('combines zip and access filters merging into entrances without losing fields', () => {
    const result = computeFilters(new URLSearchParams({ zip: '75001', access: '2' }))
    expect(result).toHaveProperty('entrances')
  })

  it('search OR has territory-number, buildings and publisher branches', () => {
    const result = computeFilters(new URLSearchParams({ search: 'Test' }))
    const or = result.OR as unknown[]
    expect(or.length).toBe(3)
  })
})

describe('computeFilters — pmr', () => {
  const notPmr = { kind: EntranceKind.Residential, OR: [{ isPMR: false }, { isPMR: null }] }

  it('restricts full to door-to-door territories whose residential entrances are all PMR', () => {
    const result = computeFilters(new URLSearchParams({ pmr: 'full' }))
    expect(result.AND).toEqual([
      { type: TerritoryKindKey.Classical },
      { entrances: { some: { kind: EntranceKind.Residential } } },
      { entrances: { none: notPmr } },
    ])
  })

  it('restricts partial to territories with both a PMR and a non-PMR residential entrance', () => {
    const result = computeFilters(new URLSearchParams({ pmr: 'partial' }))
    expect(result.AND).toEqual([
      { type: TerritoryKindKey.Classical },
      { entrances: { some: { kind: EntranceKind.Residential, isPMR: true } } },
      { entrances: { some: notPmr } },
    ])
  })

  it('restricts not to territories with residential entrances, none of them PMR', () => {
    const result = computeFilters(new URLSearchParams({ pmr: 'not' }))
    expect(result.AND).toEqual([
      { type: TerritoryKindKey.Classical },
      { entrances: { some: { kind: EntranceKind.Residential } } },
      { entrances: { none: { kind: EntranceKind.Residential, isPMR: true } } },
    ])
  })

  it('ignores an unknown or "none" pmr value', () => {
    expect(computeFilters(new URLSearchParams({ pmr: 'none' }))).toEqual({})
    expect(computeFilters(new URLSearchParams({ pmr: 'mystery' }))).toEqual({})
  })

  it('keeps zip, access and type on their own keys next to the pmr clauses', () => {
    const result = computeFilters(
      new URLSearchParams({ pmr: 'full', zip: '75001', access: '2', type: TerritoryKindKey.Classical }),
    )
    expect(result).toMatchObject({
      type: { equals: TerritoryKindKey.Classical },
      entrances: { some: { access: { equals: 2 }, buildings: { some: { zip: { equals: '75001' } } } } },
    })
    expect(result.AND).toHaveLength(3)
  })
})
