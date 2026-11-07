import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { member: { count: vi.fn() } } }))

const { getRollChanges, rollServiceYearBounds } = await import('./get-roll-changes.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

describe('rollServiceYearBounds', () => {
  it('bounds date-only fields by calendar day and timestamps by the congregation clock', () => {
    const now = new Date(Date.UTC(2026, 10, 7, 12))
    const bounds = rollServiceYearBounds('Europe/Paris', now)
    // Arrival dates are stored at UTC midnight of their calendar day: 1 September to today included.
    expect(bounds.days).toEqual({ gte: new Date(Date.UTC(2026, 8, 1)), lt: new Date(Date.UTC(2026, 10, 8)) })
    // Departures are instants: the service year starts at 22:00 UTC on 31 August in Paris.
    expect(bounds.instants).toEqual({ gte: new Date(Date.UTC(2026, 7, 31, 22)), lte: now })
  })

  it('starts the service year in September of the previous year until September comes', () => {
    const bounds = rollServiceYearBounds('Europe/Paris', new Date(Date.UTC(2026, 7, 15, 12)))
    expect(bounds.days.gte).toEqual(new Date(Date.UTC(2025, 8, 1)))
  })

  it('follows the congregation calendar into a new service year', () => {
    // Already 1 September in Paris.
    const bounds = rollServiceYearBounds('Europe/Paris', new Date(Date.UTC(2026, 7, 31, 22, 30)))
    expect(bounds.days).toEqual({ gte: new Date(Date.UTC(2026, 8, 1)), lt: new Date(Date.UTC(2026, 8, 2)) })
  })
})

describe('getRollChanges', () => {
  it('reports the roll and the arrivals and departures since the service year began', async () => {
    vi.mocked(db.member.count).mockResolvedValueOnce(45 as never)
    vi.mocked(db.member.count).mockResolvedValueOnce(5 as never)
    vi.mocked(db.member.count).mockResolvedValueOnce(2 as never)
    expect(await getRollChanges(db, 1, 'Europe/Paris')).toEqual({ total: 45, arrived: 5, left: 2 })
  })
})
