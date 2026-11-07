import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { member: { count: vi.fn() } } }))

const { getRollChanges, rollMonthBounds } = await import('./get-roll-changes.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

describe('rollMonthBounds', () => {
  it('bounds date-only fields by calendar day and timestamps by the congregation clock', () => {
    const bounds = rollMonthBounds('Europe/Paris', new Date(Date.UTC(2026, 10, 7, 12)))
    // Arrival dates are stored at UTC midnight of their calendar day.
    expect(bounds.days).toEqual({ gte: new Date(Date.UTC(2026, 10, 1)), lt: new Date(Date.UTC(2026, 11, 1)) })
    // Departures are instants: November starts at 23:00 UTC on 31 October in Paris.
    expect(bounds.instants).toEqual({
      gte: new Date(Date.UTC(2026, 9, 31, 23)),
      lt: new Date(Date.UTC(2026, 10, 30, 23)),
    })
  })

  it('follows the congregation calendar across a month boundary', () => {
    // Already 1 December in Paris.
    const bounds = rollMonthBounds('Europe/Paris', new Date(Date.UTC(2026, 10, 30, 23, 30)))
    expect(bounds.days.gte).toEqual(new Date(Date.UTC(2026, 11, 1)))
  })
})

describe('getRollChanges', () => {
  it('reports the roll and this month’s arrivals and departures', async () => {
    vi.mocked(db.member.count).mockResolvedValueOnce(45 as never)
    vi.mocked(db.member.count).mockResolvedValueOnce(2 as never)
    vi.mocked(db.member.count).mockResolvedValueOnce(1 as never)
    expect(await getRollChanges(db, 1, 'Europe/Paris')).toEqual({ total: 45, arrived: 2, left: 1 })
  })
})
