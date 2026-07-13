import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    buildingEntrance: { aggregate: vi.fn() },
  },
}))

const { computeFoyersReached } = await import('./compute-foyers-reached.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: 0 } } as never)
})

describe('computeFoyersReached', () => {
  it('returns zero count and skips the query when no territory has been touched', async () => {
    const result = await computeFoyersReached(db, 1, [], 3421)

    expect(result).toEqual({ count: 0, percentage: 0 })
    expect(vi.mocked(db.buildingEntrance.aggregate)).not.toHaveBeenCalled()
  })

  it('sums homes on residential entrances of the given territories', async () => {
    vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: 1200 } } as never)

    const result = await computeFoyersReached(db, 1, [1, 2, 3], 3421)

    expect(result.count).toBe(1200)
  })

  it('computes percentage against the total terrain homes rounded to nearest integer', async () => {
    vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: 1200 } } as never)

    const result = await computeFoyersReached(db, 1, [1, 2], 3421)

    // 1200 / 3421 = 0.3507... → 35%
    expect(result.percentage).toBe(35)
  })

  it('returns null percentage when the terrain has no homes', async () => {
    vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: 0 } } as never)

    const result = await computeFoyersReached(db, 1, [1], 0)

    expect(result.percentage).toBeNull()
  })

  it('treats a null aggregate sum as zero foyers reached', async () => {
    vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: null } } as never)

    const result = await computeFoyersReached(db, 1, [1], 3421)

    expect(result.count).toBe(0)
    expect(result.percentage).toBe(0)
  })

  it('scopes the aggregate to residential entrances of the given territories in the congregation', async () => {
    await computeFoyersReached(db, 42, [7, 8, 9], 1000)

    const where = vi.mocked(db.buildingEntrance.aggregate).mock.calls[0][0]?.where
    expect(where).toMatchObject({
      congregationId: 42,
      kind: 'Residential',
      territories: { some: { id: { in: [7, 8, 9] } } },
    })
  })
})
