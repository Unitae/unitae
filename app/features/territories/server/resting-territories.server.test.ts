import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { count: vi.fn() },
    campaign: { findMany: vi.fn() },
  },
}))

const { countRestingTerritories } = await import('./resting-territories.server')
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

describe('countRestingTerritories', () => {
  it('rests each campaign on its own restPeriodDays window', async () => {
    vi.mocked(db.campaign.findMany).mockResolvedValue([{ id: 5, restPeriodDays: 30 }] as never)
    vi.mocked(db.territory.count).mockResolvedValue(0)

    await countRestingTerritories(db, 1)

    const call = vi.mocked(db.territory.count).mock.calls[0][0] as {
      where: { attributions: { some: { OR: unknown[] } } }
    }
    const or = call.where.attributions.some.OR
    const cutoff = new Date(new Date(2025, 3, 8).getTime() - 30 * 24 * 3600 * 1000)
    expect(or).toContainEqual({ campaignId: 5, endDate: { gt: cutoff } })
  })

  it('retourne le nombre de territoires au repos', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(7)

    expect(await countRestingTerritories(db, 1)).toBe(7)
  })

  it('retourne 0 quand aucun territoire ne se repose', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    expect(await countRestingTerritories(db, 1)).toBe(0)
  })

  it('exclut les territoires avec une attribution en cours (mutuelle exclusion avec "working")', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    await countRestingTerritories(db, 1)

    const where = vi.mocked(db.territory.count).mock.calls[0][0]?.where
    const attributions = where?.attributions as { none?: unknown; some?: unknown } | undefined
    expect(attributions?.none).toEqual({ endDate: null })
    expect(attributions?.some).toBeDefined()
  })
})
