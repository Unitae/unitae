import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    attribution: { findMany: vi.fn() },
  },
}))

const { fetchAttributionsForStats } = await import('./fetch-attributions-for-stats.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('fetchAttributionsForStats', () => {
  it('retourne les attributions formatées', async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([
      {
        id: 1,
        territoryId: 10,
        territory: { number: 'T-1', type: 'doors-to-doors' },
        type: 'default',
        startDate: new Date(2025, 9, 1),
        endDate: new Date(2025, 10, 15),
        lateDate: new Date(2025, 11, 1),
      },
    ] as never)

    const result = await fetchAttributionsForStats({
      territoryKind: [TerritoryKind.Classical],
      attributionKind: [TerritoryAttributionKind.Default],
      startDate: new Date(2025, 8, 1),
      endDate: new Date(2026, 7, 31),
    })

    expect(result).toEqual([
      {
        id: 1,
        territoryId: 10,
        territoryNumber: 'T-1',
        territoryType: TerritoryKind.Classical,
        type: 'default',
        startDate: new Date(2025, 9, 1),
        endDate: new Date(2025, 10, 15),
        lateDate: new Date(2025, 11, 1),
      },
    ])
  })

  it('retourne un tableau vide quand il n\'y a aucune attribution', async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([])

    const result = await fetchAttributionsForStats({
      territoryKind: [TerritoryKind.Classical],
      attributionKind: [TerritoryAttributionKind.Default],
      startDate: new Date(2025, 8, 1),
      endDate: new Date(2026, 7, 31),
    })

    expect(result).toEqual([])
  })
})
