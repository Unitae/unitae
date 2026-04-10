import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    territory: { groupBy: vi.fn() },
  },
}))

const { fetchTerritoryCounts } = await import('./fetch-territory-counts.server')
const { getTotalTerritoryCount } = await import('./territory-count-by-type.type')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('fetchTerritoryCounts', () => {
  it('retourne les compteurs par type', async () => {
    vi.mocked(db.territory.groupBy).mockResolvedValue([
      { type: 'doors-to-doors', _count: { id: 30 } },
      { type: 'commerces', _count: { id: 5 } },
    ] as never)

    const result = await fetchTerritoryCounts(db, [TerritoryKind.Classical, TerritoryKind.Commerces])

    expect(result).toEqual([
      { type: TerritoryKind.Classical, count: 30 },
      { type: TerritoryKind.Commerces, count: 5 },
    ])
  })

  it('fonctionne sans filtre de types', async () => {
    vi.mocked(db.territory.groupBy).mockResolvedValue([{ type: 'doors-to-doors', _count: { id: 20 } }] as never)

    const result = await fetchTerritoryCounts(db)

    expect(result).toEqual([{ type: TerritoryKind.Classical, count: 20 }])
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
