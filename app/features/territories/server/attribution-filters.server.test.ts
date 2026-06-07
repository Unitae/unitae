import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { computeFilters } from './attribution-filters.server'

describe('computeFilters', () => {
  it('returns empty object when no params', () => {
    const result = computeFilters(new URLSearchParams())
    expect(result).toEqual({})
  })

  it('applies group filter when group param is a numeric ID', () => {
    const result = computeFilters(new URLSearchParams({ group: '5' }))
    expect(result).toMatchObject({ publisher: { publisherGroupId: { equals: 5 } } })
  })

  it('ignores group filter when group param is "none"', () => {
    const result = computeFilters(new URLSearchParams({ group: 'none' }))
    expect(result).not.toHaveProperty('publisher')
  })

  it('applies type filter for a valid attribution kind', () => {
    const result = computeFilters(new URLSearchParams({ type: TerritoryAttributionKind.Phone }))
    expect(result).toMatchObject({ type: { equals: TerritoryAttributionKind.Phone } })
  })

  it('ignores type filter when type param is "none"', () => {
    const result = computeFilters(new URLSearchParams({ type: 'none' }))
    expect(result).not.toHaveProperty('type')
  })

  it('applies late status filter with lateDate less than now', () => {
    const before = new Date()
    const result = computeFilters(new URLSearchParams({ status: 'late' }))
    const after = new Date()

    expect(result).toHaveProperty('lateDate')
    const ltDate = (result.lateDate as { lt: Date }).lt
    expect(ltDate.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(ltDate.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('applies active status filter with lateDate greater than now', () => {
    const before = new Date()
    const result = computeFilters(new URLSearchParams({ status: 'active' }))
    const after = new Date()

    const gtDate = (result.lateDate as { gt: Date }).gt
    expect(gtDate.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(gtDate.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('ignores status filter when status param is "none"', () => {
    const result = computeFilters(new URLSearchParams({ status: 'none' }))
    expect(result).not.toHaveProperty('lateDate')
  })

  it('applies search filter with OR across publisher name, territory number and building', () => {
    const result = computeFilters(new URLSearchParams({ search: 'Dupont' }))
    expect(result).toHaveProperty('OR')
    const or = result.OR as unknown[]
    expect(or).toHaveLength(3)
  })

  it('search filter matches publisher firstname and lastname via normalized columns', () => {
    const result = computeFilters(new URLSearchParams({ search: 'Pâjot' }))
    const or = result.OR as { publisher?: { OR?: Record<string, unknown>[] } }[]
    const publisherClause = or.find(c => c.publisher)
    expect(publisherClause?.publisher?.OR).toEqual(
      expect.arrayContaining([
        { firstnameNormalized: { contains: 'pajot' } },
        { lastnameNormalized: { contains: 'pajot' } },
      ]),
    )
  })

  it('search filter matches territory number case-insensitively', () => {
    const result = computeFilters(new URLSearchParams({ search: 'T-42' }))
    const or = result.OR as { territory?: { number?: { contains: string } } }[]
    const territoryClause = or.find(c => c.territory && 'number' in (c.territory ?? {}))
    expect(territoryClause?.territory?.number).toMatchObject({ contains: 'T-42', mode: 'insensitive' })
  })

  it('search filter matches building street through territory entrances', () => {
    const result = computeFilters(new URLSearchParams({ search: 'paix' }))
    const or = result.OR as { territory?: { entrances?: { some?: { buildings?: { some?: unknown } } } } }[]
    const buildingClause = or.find(c => c.territory?.entrances)
    expect(buildingClause).toBeDefined()
  })

  it('trims whitespace before searching', () => {
    const result = computeFilters(new URLSearchParams({ search: '   Dupont   ' }))
    const or = result.OR as { territory?: { number?: { contains: string } } }[]
    const territoryClause = or.find(c => c.territory && 'number' in (c.territory ?? {}))
    expect(territoryClause?.territory?.number).toMatchObject({ contains: 'Dupont' })
  })

  it('strips a leading @ proximity marker', () => {
    const result = computeFilters(new URLSearchParams({ search: '@bastille' }))
    const or = result.OR as { territory?: { number?: { contains: string } } }[]
    const territoryClause = or.find(c => c.territory && 'number' in (c.territory ?? {}))
    expect(territoryClause?.territory?.number).toMatchObject({ contains: 'bastille' })
  })

  it('ignores search filter when search param is empty string', () => {
    const result = computeFilters(new URLSearchParams({ search: '' }))
    expect(result).not.toHaveProperty('OR')
  })

  it('combines multiple filters into a single where object', () => {
    const result = computeFilters(
      new URLSearchParams({ group: '3', type: TerritoryAttributionKind.Default, status: 'late' }),
    )
    expect(result).toHaveProperty('publisher')
    expect(result).toHaveProperty('type')
    expect(result).toHaveProperty('lateDate')
  })
})
