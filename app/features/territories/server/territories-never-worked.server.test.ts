import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    territory: { findMany: vi.fn() },
  },
}))

const { getTerritoriesNeverWorked } = await import('./territories-never-worked.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getTerritoriesNeverWorked', () => {
  it('retourne les territoires sans attributions sur la période', async () => {
    vi.mocked(db.territory.findMany).mockResolvedValue([
      { id: 5, number: 'T-5' },
      { id: 12, number: 'T-12' },
    ] as never)

    const result = await getTerritoriesNeverWorked(db, {
      territoryKind: [TerritoryKind.Classical],
      attributionKind: [TerritoryAttributionKind.Default],
      startDate: new Date(2025, 8, 1),
      endDate: new Date(2026, 7, 31),
    }, 1)

    expect(result).toEqual([
      { id: 5, number: 'T-5' },
      { id: 12, number: 'T-12' },
    ])
  })

  it('retourne un tableau vide quand tous les territoires ont été travaillés', async () => {
    vi.mocked(db.territory.findMany).mockResolvedValue([])

    const result = await getTerritoriesNeverWorked(db, {
      territoryKind: [TerritoryKind.Classical],
      attributionKind: [TerritoryAttributionKind.Default],
      startDate: new Date(2025, 8, 1),
      endDate: new Date(2026, 7, 31),
    }, 1)

    expect(result).toEqual([])
  })

  it('fonctionne avec un filtre de groupe', async () => {
    vi.mocked(db.territory.findMany).mockResolvedValue([{ id: 3, number: 'T-3' }] as never)

    const result = await getTerritoriesNeverWorked(db, {
      territoryKind: [TerritoryKind.Classical],
      attributionKind: [TerritoryAttributionKind.Default],
      startDate: new Date(2025, 8, 1),
      endDate: new Date(2026, 7, 31),
      groupId: 7,
    }, 1)

    expect(result).toEqual([{ id: 3, number: 'T-3' }])
  })
})
