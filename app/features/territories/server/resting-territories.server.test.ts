import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { count: vi.fn() },
  },
}))

const { countRestingTerritories } = await import('./resting-territories.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2025, 3, 8)) // 8 avril 2025
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('countRestingTerritories', () => {
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
