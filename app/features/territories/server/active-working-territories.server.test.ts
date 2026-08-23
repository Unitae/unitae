import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { count: vi.fn() },
  },
}))

const { countActiveWorkingTerritories } = await import('./active-working-territories.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

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

    const result = await countActiveWorkingTerritories(db, 1)
    expect(result).toBe(5)
  })

  it("retourne 0 quand aucun territoire n'est actif", async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    const result = await countActiveWorkingTerritories(db, 1)
    expect(result).toBe(0)
  })
})

describe('countActiveWorkingTerritories — pause semantics', () => {
  it('does not count territories whose only open attribution is paused', async () => {
    const countMock = vi.fn().mockResolvedValue(0)
    const mockDb = { territory: { count: countMock } }

    await countActiveWorkingTerritories(mockDb as never, 10)

    const some = countMock.mock.calls[0][0].where.attributions.some
    expect(some).toMatchObject({ pausedAt: null })
  })
})
