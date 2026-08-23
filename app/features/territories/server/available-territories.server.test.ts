import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { count: vi.fn() },
    campaign: { findMany: vi.fn() },
  },
}))

const { countAvailableTerritories } = await import('./available-territories.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2025, 3, 8)) // 8 avril 2025
  vi.mocked(db.campaign.findMany).mockResolvedValue([] as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('countAvailableTerritories', () => {
  it('builds one rest branch per campaign, honoring its restPeriodDays override', async () => {
    vi.mocked(db.campaign.findMany).mockResolvedValue([
      { id: 5, restPeriodDays: 30 },
      { id: 6, restPeriodDays: null },
    ] as never)
    vi.mocked(db.territory.count).mockResolvedValue(0)

    await countAvailableTerritories(db, 1)

    const call = vi.mocked(db.territory.count).mock.calls[0][0] as {
      where: { attributions: { every: { OR: unknown[] } } }
    }
    const or = call.where.attributions.every.OR
    const msPerDay = 24 * 3600 * 1000
    const now = new Date(2025, 3, 8).getTime()
    // 30-day override for campaign 5, default 15 days for campaign 6
    expect(or).toContainEqual({ campaignId: 5, endDate: { lt: new Date(now - 30 * msPerDay), not: null } })
    expect(or).toContainEqual({ campaignId: 6, endDate: { lt: new Date(now - 15 * msPerDay), not: null } })
  })

  it('retourne le nombre de territoires disponibles', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(12)

    const result = await countAvailableTerritories(db, 1)
    expect(result).toBe(12)
  })

  it("retourne 0 quand aucun territoire n'est disponible", async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    const result = await countAvailableTerritories(db, 1)
    expect(result).toBe(0)
  })
})
