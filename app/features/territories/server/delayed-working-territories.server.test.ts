import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { count: vi.fn() },
  },
}))

const { countDelayedWorkingTerritories } = await import('./delayed-working-territories.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2025, 3, 8))
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('countDelayedWorkingTerritories', () => {
  it('retourne le nombre de territoires en retard', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(3)

    const result = await countDelayedWorkingTerritories(db, 1)
    expect(result).toBe(3)
  })

  it("retourne 0 quand aucun territoire n'est en retard", async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    const result = await countDelayedWorkingTerritories(db, 1)
    expect(result).toBe(0)
  })
})
