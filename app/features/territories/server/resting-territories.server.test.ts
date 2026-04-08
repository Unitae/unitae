import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    territory: { count: vi.fn() },
  },
}))

const { countRestingTerritories } = await import('./resting-territories.server')
const { db } = await import('~/shared/libs/db.server')

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

    const result = await countRestingTerritories()
    expect(result).toBe(7)
  })

  it('retourne 0 quand aucun territoire ne se repose', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    const result = await countRestingTerritories()
    expect(result).toBe(0)
  })
})
