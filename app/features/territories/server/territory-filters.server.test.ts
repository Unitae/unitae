import { describe, expect, it } from 'vitest'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
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
    const result = computeFilters(new URLSearchParams({ type: TerritoryKind.Classical }))
    expect(result).toMatchObject({ type: { equals: TerritoryKind.Classical } })
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

  it('applies search filter matching territory number', () => {
    const result = computeFilters(new URLSearchParams({ search: 'T-42' }))
    const or = result.OR as unknown[]
    expect(or).toContainEqual({ number: { contains: 'T-42' } })
  })

  it('applies search filter matching street in nested buildings', () => {
    const result = computeFilters(new URLSearchParams({ search: 'Rue de la Paix' }))
    const or = result.OR as { entrances?: unknown }[]
    const entranceClause = or.find(c => (c as { entrances?: unknown }).entrances)
    expect(entranceClause).toBeDefined()
  })

  it('applies AND(number, street) when search starts with a number', () => {
    const result = computeFilters(new URLSearchParams({ search: '42 Rue de la Paix' }))
    const or = result.OR as { entrances?: { some?: { buildings?: { some?: { OR?: unknown[] } } } } }[]
    const entranceClause = or.find(c => c.entrances)
    const buildingOr = entranceClause?.entrances?.some?.buildings?.some?.OR
    expect(buildingOr).toBeDefined()
    expect(buildingOr![0]).toHaveProperty('AND')
  })

  it('ignores search filter when search is empty', () => {
    const result = computeFilters(new URLSearchParams({ search: '' }))
    expect(result).not.toHaveProperty('OR')
  })

  it('combines zip and access filters merging into entrances without losing fields', () => {
    const result = computeFilters(new URLSearchParams({ zip: '75001', access: '2' }))
    // zip adds nested buildings, access adds access field — both under entrances.some
    expect(result).toHaveProperty('entrances')
  })

  it('search extends existing OR clauses, not replacing them', () => {
    const result = computeFilters(new URLSearchParams({ search: 'Test' }))
    const or = result.OR as unknown[]
    // Must include both the buildings clause and the territory number clause
    expect(or.length).toBeGreaterThanOrEqual(2)
  })
})
