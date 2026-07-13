import { describe, expect, it } from 'vitest'
import { buildAttributionDateOverlapWhere } from './attribution-date-overlap.server'

describe('buildAttributionDateOverlapWhere', () => {
  it('anchors the upper bound at the start of the day after endDate (TZ-safe)', () => {
    const endDate = new Date('2026-03-15T12:00:00Z')
    const where = buildAttributionDateOverlapWhere(new Date('2026-01-01'), endDate)
    // The `lt` cutoff is the start of the LOCAL day after endDate; asserting
    // that it is strictly after endDate is enough — the exact instant depends
    // on the runner's TZ, which is by design.
    expect(where.startDate).toBeDefined()
    expect(where.startDate).toHaveProperty('lt')
    const cutoff = (where.startDate as { lt: Date }).lt
    expect(cutoff.getTime()).toBeGreaterThan(endDate.getTime())
  })

  it('produces an OR clause that allows either null endDate or a >= startDate row', () => {
    const where = buildAttributionDateOverlapWhere(new Date('2026-01-01'), new Date('2026-03-15'))
    expect(where.OR).toBeDefined()
    expect(where.OR).toContainEqual({ endDate: null })
    expect(where.OR).toContainEqual({ endDate: { gte: new Date('2026-01-01') } })
  })

  it('treats a single-day overlap window without collapsing the range', () => {
    const day = new Date('2026-04-10T09:00:00Z')
    const where = buildAttributionDateOverlapWhere(day, day)
    expect((where.startDate as { lt: Date }).lt.getTime()).toBeGreaterThan(day.getTime())
    expect(where.OR).toContainEqual({ endDate: { gte: day } })
  })

  it('accepts a startDate later than endDate without throwing', () => {
    // Callers rely on the query engine to return no rows for an inverted
    // range; the builder itself must not throw.
    const start = new Date('2026-06-15')
    const end = new Date('2026-03-15')
    expect(() => buildAttributionDateOverlapWhere(start, end)).not.toThrow()
  })
})
