import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    territory: { count: vi.fn() },
  },
}))

const { countActiveWorkingTerritories } = await import('./active-working-territories.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2025, 3, 8))
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('countActiveWorkingTerritories', () => {
  it('retourne le nombre de territoires en cours de travail', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(5)

    const result = await countActiveWorkingTerritories(db)
    expect(result).toBe(5)
  })

  it("retourne 0 quand aucun territoire n'est actif", async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    const result = await countActiveWorkingTerritories(db)
    expect(result).toBe(0)
  })
})
