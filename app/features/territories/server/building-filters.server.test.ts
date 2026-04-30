import { describe, expect, it } from 'vitest'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { computeFilters } from './building-filters.server'

describe('computeFilters', () => {
  it('returns empty object when no params', () => {
    const result = computeFilters(new URLSearchParams())
    expect(result).toEqual({})
  })

  it('applies zip filter', () => {
    const result = computeFilters(new URLSearchParams({ zip: '75001' }))
    expect(result).toMatchObject({ zip: { equals: '75001' } })
  })

  it('ignores zip filter when zip is "none"', () => {
    const result = computeFilters(new URLSearchParams({ zip: 'none' }))
    expect(result).not.toHaveProperty('zip')
  })

  it('applies type filter for Classical → residential entrances with homes', () => {
    const result = computeFilters(new URLSearchParams({ type: TerritoryKind.Classical }))
    expect(result).toMatchObject({
      entrances: { some: { kind: EntranceKind.Residential, homes: { gt: 0 } } },
    })
  })

  it('applies type filter for Phone → residential entrances with phones', () => {
    const result = computeFilters(new URLSearchParams({ type: TerritoryKind.Phone }))
    expect(result).toMatchObject({
      entrances: { some: { kind: EntranceKind.Residential, phones: { gt: 0 } } },
    })
  })

  it('applies type filter for Commerce → commerce entrances', () => {
    const result = computeFilters(new URLSearchParams({ type: TerritoryKind.Commerces }))
    expect(result).toMatchObject({ entrances: { some: { kind: EntranceKind.Commerce } } })
  })

  it('applies type filter for Hotel → hotel entrances', () => {
    const result = computeFilters(new URLSearchParams({ type: TerritoryKind.Hotel }))
    expect(result).toMatchObject({ entrances: { some: { kind: EntranceKind.Hotel } } })
  })

  it('applies type filter for Univ → campus entrances', () => {
    const result = computeFilters(new URLSearchParams({ type: TerritoryKind.Univ }))
    expect(result).toMatchObject({ entrances: { some: { kind: EntranceKind.Campus } } })
  })

  it('ignores type filter when type is "none"', () => {
    const result = computeFilters(new URLSearchParams({ type: 'none' }))
    expect(result).not.toHaveProperty('entrances')
  })

  it('applies access filter', () => {
    const result = computeFilters(new URLSearchParams({ access: '2' }))
    expect(result).toMatchObject({ entrances: { some: { access: { equals: 2 } } } })
  })

  it('ignores access filter when access is "none"', () => {
    const result = computeFilters(new URLSearchParams({ access: 'none' }))
    expect(result).not.toHaveProperty('entrances')
  })

  it('applies shop filter with entrance kind Commerce and shop kind', () => {
    const result = computeFilters(new URLSearchParams({ shops: 'restaurant' }))
    expect(result).toMatchObject({
      entrances: { some: { kind: EntranceKind.Commerce, shopKind: 'restaurant' } },
    })
  })

  it('ignores shop filter when shops is "none"', () => {
    const result = computeFilters(new URLSearchParams({ shops: 'none' }))
    expect(result).not.toHaveProperty('entrances')
  })

  it('applies plain street search when search has no number prefix', () => {
    const result = computeFilters(new URLSearchParams({ search: 'Rue de la Paix' }))
    expect(result).toMatchObject({
      OR: [{ street: { contains: 'Rue de la Paix' } }],
    })
  })

  it('applies AND(number, street) when search starts with a number', () => {
    const result = computeFilters(new URLSearchParams({ search: '42 Rue de la Paix' }))
    const or = result.OR as Array<{ AND?: unknown[] }>
    expect(or[0]).toHaveProperty('AND')
    const and = or[0].AND!
    expect(and).toContainEqual({ number: { contains: '42' } })
    expect(and).toContainEqual({ street: { contains: 'Rue de la Paix' } })
  })

  it('parses address with bis suffix', () => {
    const result = computeFilters(new URLSearchParams({ search: '42 bis Rue de la Paix' }))
    const or = result.OR as Array<{ AND?: unknown[] }>
    const and = or[0].AND!
    expect(and).toContainEqual({ number: { contains: '42 bis' } })
  })

  it('ignores search filter when search is empty', () => {
    const result = computeFilters(new URLSearchParams({ search: '' }))
    expect(result).not.toHaveProperty('OR')
  })

  it('combines zip and type filters', () => {
    const result = computeFilters(new URLSearchParams({ zip: '75001', type: TerritoryKind.Classical }))
    expect(result).toHaveProperty('zip')
    expect(result).toHaveProperty('entrances')
  })
})
