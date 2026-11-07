import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { calendarFeedToken: { findUnique: vi.fn() } } }))

const { hasCalendarFeed } = await import('./has-calendar-feed.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

describe('hasCalendarFeed', () => {
  it('is true when the account has a calendar subscription link', async () => {
    vi.mocked(db.calendarFeedToken.findUnique).mockResolvedValue({ id: 1 } as never)
    expect(await hasCalendarFeed(db, 3)).toBe(true)
  })

  it('is false when it has none (never created, or revoked)', async () => {
    vi.mocked(db.calendarFeedToken.findUnique).mockResolvedValue(null as never)
    expect(await hasCalendarFeed(db, 3)).toBe(false)
  })
})
