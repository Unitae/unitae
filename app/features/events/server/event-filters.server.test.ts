import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeFilters } from './event-filters.server'

describe('computeFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 3, 8, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retourne un filtre sur la date courante par défaut', () => {
    const params = new URLSearchParams()
    const result = computeFilters(params)

    expect(result.startDate).toEqual({ lte: expect.any(Date) })
    expect(result.endDate).toEqual({ gte: expect.any(Date) })
  })

  it('utilise la date fournie dans les paramètres', () => {
    const params = new URLSearchParams({ date: '2025-06-15' })
    const result = computeFilters(params)

    const expectedDate = new Date('2025-06-15')
    expect(result.startDate).toEqual({ lte: expectedDate })
    expect(result.endDate).toEqual({ gte: expectedDate })
  })

  it('retourne le filtre par défaut quand date=none', () => {
    const params = new URLSearchParams({ date: 'none' })
    const result = computeFilters(params)

    // Doit utiliser la date courante, pas "none"
    expect(result.startDate).toEqual({ lte: expect.any(Date) })
    expect(result.endDate).toEqual({ gte: expect.any(Date) })
  })
})
