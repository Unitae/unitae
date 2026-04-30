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

  it('applies search filter with OR across publisher name and territory number', () => {
    const result = computeFilters(new URLSearchParams({ search: 'Dupont' }))
    expect(result).toHaveProperty('OR')
    const or = result.OR as unknown[]
    expect(or).toHaveLength(2)
  })

  it('search filter matches publisher firstname and lastname', () => {
    const result = computeFilters(new URLSearchParams({ search: 'Jean' }))
    const or = result.OR as Array<{ publisher?: unknown; territory?: unknown }>
    const publisherClause = or.find(c => c.publisher)
    expect(publisherClause?.publisher).toMatchObject({
      OR: expect.arrayContaining([{ firstname: { contains: 'Jean' } }, { lastname: { contains: 'Jean' } }]),
    })
  })

  it('search filter matches territory number', () => {
    const result = computeFilters(new URLSearchParams({ search: 'T-42' }))
    const or = result.OR as Array<{ territory?: unknown }>
    const territoryClause = or.find(c => c.territory)
    expect(territoryClause?.territory).toMatchObject({ number: { contains: 'T-42' } })
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
