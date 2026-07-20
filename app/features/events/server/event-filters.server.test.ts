import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeFilters, getDefaultDateRange } from './event-filters.server'

describe('getDefaultDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 3, 8, 12, 0, 0)) // 8 April 2025
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns today as the from date', () => {
    const { from } = getDefaultDateRange()

    expect(from).toEqual(new Date(2025, 3, 8))
  })

  it('returns the last day of next month as the to date', () => {
    const { to } = getDefaultDateRange()

    expect(to).toEqual(new Date(2025, 4, 31)) // 31 May 2025
  })
})

describe('computeFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 3, 8, 12, 0, 0)) // 8 April 2025
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses defaults when no params are provided', () => {
    const params = new URLSearchParams()
    const result = computeFilters(params)

    expect(result.startDate).toEqual({ lte: new Date(2025, 4, 31) })
    expect(result.endDate).toEqual({ gte: new Date(2025, 3, 8) })
    expect(result.createdById).toBeUndefined()
  })

  it('uses explicit from and to params', () => {
    const params = new URLSearchParams({ from: '2025-06-01', to: '2025-06-30' })
    const result = computeFilters(params)

    expect(result.startDate).toEqual({ lte: new Date('2025-06-30') })
    expect(result.endDate).toEqual({ gte: new Date('2025-06-01') })
  })

  it('defaults to when only from is provided', () => {
    const params = new URLSearchParams({ from: '2025-06-01' })
    const result = computeFilters(params)

    expect(result.startDate).toEqual({ lte: new Date(2025, 4, 31) })
    expect(result.endDate).toEqual({ gte: new Date('2025-06-01') })
  })

  it('defaults from when only to is provided', () => {
    const params = new URLSearchParams({ to: '2025-06-30' })
    const result = computeFilters(params)

    expect(result.startDate).toEqual({ lte: new Date('2025-06-30') })
    expect(result.endDate).toEqual({ gte: new Date(2025, 3, 8) })
  })

  it('uses defaults when from is none', () => {
    const params = new URLSearchParams({ from: 'none', to: 'none' })
    const result = computeFilters(params)

    expect(result.startDate).toEqual({ lte: new Date(2025, 4, 31) })
    expect(result.endDate).toEqual({ gte: new Date(2025, 3, 8) })
  })

  it('filters by publisher when param is provided', () => {
    const params = new URLSearchParams({ publisher: '42' })
    const result = computeFilters(params)

    expect(result.createdById).toBe(42)
  })

  it('does not filter by publisher when param is none', () => {
    const params = new URLSearchParams({ publisher: 'none' })
    const result = computeFilters(params)

    expect(result.createdById).toBeUndefined()
  })

  it('does not filter by publisher when param is absent', () => {
    const params = new URLSearchParams()
    const result = computeFilters(params)

    expect(result.createdById).toBeUndefined()
  })

  it('filters by hasConflicts when param is true', () => {
    const params = new URLSearchParams({ hasConflicts: 'true' })
    const result = computeFilters(params)

    expect(result.AND).toEqual([
      {
        OR: [{ eventParts: { some: { hasConflict: true } } }, { eventServiceParts: { some: { hasConflict: true } } }],
      },
    ])
  })

  it('does not filter by hasConflicts when param is absent', () => {
    const params = new URLSearchParams()
    const result = computeFilters(params)

    expect(result.AND).toBeUndefined()
  })

  it('does not filter by hasConflicts when param is false', () => {
    const params = new URLSearchParams({ hasConflicts: 'false' })
    const result = computeFilters(params)

    expect(result.AND).toBeUndefined()
  })

  // Powers a future "Brouillons" / "Publiés" toggle on the list. The filter is
  // plumbing only — the UI in this MVP does not surface it — but it's cheap
  // enough to add now so the query shape stays stable.
  it('filters by status=draft when param is draft', () => {
    const params = new URLSearchParams({ status: 'draft' })
    const result = computeFilters(params)
    expect(result.status).toBe('draft')
  })

  it('filters by status=released when param is released', () => {
    const params = new URLSearchParams({ status: 'released' })
    const result = computeFilters(params)
    expect(result.status).toBe('released')
  })

  it('ignores unknown status values', () => {
    const params = new URLSearchParams({ status: 'wat' })
    const result = computeFilters(params)
    expect(result.status).toBeUndefined()
  })

  it('does not filter by status when param is absent', () => {
    const params = new URLSearchParams()
    const result = computeFilters(params)
    expect(result.status).toBeUndefined()
  })

  // Combined-param pin: hasConflicts must compose cleanly with date + publisher
  // filters. A regression that spread over `startDate` / `endDate` (or drops
  // `createdById`) would slip through the single-param tests above.
  it('preserves date and publisher filters when hasConflicts is applied', () => {
    const params = new URLSearchParams({
      from: '2025-06-01',
      to: '2025-06-30',
      publisher: '42',
      hasConflicts: 'true',
    })
    const result = computeFilters(params)

    expect(result.startDate).toEqual({ lte: new Date('2025-06-30') })
    expect(result.endDate).toEqual({ gte: new Date('2025-06-01') })
    expect(result.createdById).toBe(42)
    expect(result.AND).toEqual([
      {
        OR: [{ eventParts: { some: { hasConflict: true } } }, { eventServiceParts: { some: { hasConflict: true } } }],
      },
    ])
  })
})
