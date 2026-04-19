import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  db: {
    territory: { count: vi.fn() },
  },
}))

const { countAvailableTerritories } = await import('./available-territories.server')
const { db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2025, 3, 8)) // 8 avril 2025
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('countAvailableTerritories', () => {
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
