import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { groupBy: vi.fn(), count: vi.fn() },
  },
}))

const { fetchTerritoryCounts, countTerritoriesExistingBefore } = await import('./fetch-territory-counts.server')
const { getTotalTerritoryCount } = await import('./territory-count-by-type.type')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('fetchTerritoryCounts', () => {
  it('retourne les compteurs par type', async () => {
    vi.mocked(db.territory.groupBy).mockResolvedValue([
      { type: TerritoryKind.Classical, _count: { id: 30 } },
      { type: TerritoryKind.Commerces, _count: { id: 5 } },
    ] as never)

    const result = await fetchTerritoryCounts(db, 1, [TerritoryKind.Classical, TerritoryKind.Commerces])

    expect(result).toEqual([
      { type: TerritoryKind.Classical, count: 30 },
      { type: TerritoryKind.Commerces, count: 5 },
    ])
  })

  it('fonctionne sans filtre de types', async () => {
    vi.mocked(db.territory.groupBy).mockResolvedValue([{ type: TerritoryKind.Classical, _count: { id: 20 } }] as never)

    const result = await fetchTerritoryCounts(db, 1)

    expect(result).toEqual([{ type: TerritoryKind.Classical, count: 20 }])
  })
})

describe('countTerritoriesExistingBefore', () => {
  it('counts territories with createdAt <= cutoff', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(3)

    const cutoff = new Date(2025, 7, 31)
    const result = await countTerritoriesExistingBefore(db, 1, cutoff)

    expect(result).toBe(3)
    const where = vi.mocked(db.territory.count).mock.calls[0][0]?.where
    expect(where?.createdAt).toEqual({ lte: cutoff })
  })

  it('applies the kind filter when provided', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    await countTerritoriesExistingBefore(db, 1, new Date(2025, 7, 31), [TerritoryKind.Classical])

    const where = vi.mocked(db.territory.count).mock.calls[0][0]?.where
    expect(where?.type).toEqual({ in: [TerritoryKind.Classical] })
  })

  it('omits the kind filter when the array is empty', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    await countTerritoriesExistingBefore(db, 1, new Date(2025, 7, 31), [])

    const where = vi.mocked(db.territory.count).mock.calls[0][0]?.where
    expect(where).not.toHaveProperty('type')
  })
})

describe('getTotalTerritoryCount', () => {
  it('retourne la somme des compteurs', () => {
    const counts = [
      { type: TerritoryKind.Classical, count: 30 },
      { type: TerritoryKind.Commerces, count: 5 },
    ]
    expect(getTotalTerritoryCount(counts)).toBe(35)
  })

  it('retourne 0 pour un tableau vide', () => {
    expect(getTotalTerritoryCount([])).toBe(0)
  })
})
