import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { StatsFilterParams } from './stats-filter-params.type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    attribution: { findMany: vi.fn() },
  },
}))

const { fetchAttributionsForStats } = await import('./fetch-attributions-for-stats.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const baseParams: StatsFilterParams = {
  territoryKind: [TerritoryKindKey.Classical],
  attributionKind: [TerritoryAttributionKind.Default],
  startDate: new Date(2025, 8, 1),
  endDate: new Date(2026, 7, 31),
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.attribution.findMany).mockResolvedValue([])
})

describe('fetchAttributionsForStats', () => {
  it('retourne les attributions formatées', async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([
      {
        id: 1,
        territoryId: 10,
        territory: { number: 'T-1', type: TerritoryKindKey.Classical },
        type: TerritoryAttributionKind.Default,
        campaignId: null,
        campaign: null,
        startDate: new Date(2025, 9, 1),
        endDate: new Date(2025, 10, 15),
        lateDate: new Date(2025, 11, 1),
      },
    ] as never)

    const result = await fetchAttributionsForStats(db, baseParams, 1)

    expect(result).toEqual([
      {
        id: 1,
        territoryId: 10,
        territoryNumber: 'T-1',
        territoryType: TerritoryKindKey.Classical,
        type: TerritoryAttributionKind.Default,
        campaignId: null,
        campaignRestPeriodDays: null,
        startDate: new Date(2025, 9, 1),
        endDate: new Date(2025, 10, 15),
        lateDate: new Date(2025, 11, 1),
      },
    ])
  })

  it("retourne un tableau vide quand il n'y a aucune attribution", async () => {
    expect(await fetchAttributionsForStats(db, baseParams, 1)).toEqual([])
  })

  it('utilise `lt: startOfNextDay(endDate)` (inclusive end-of-day boundary)', async () => {
    await fetchAttributionsForStats(db, baseParams, 1)

    const where = vi.mocked(db.attribution.findMany).mock.calls[0][0]?.where
    expect(where?.startDate).toEqual({ lt: new Date(2026, 8, 1) })
  })

  it('conserve la branche `endDate >= startDate OR endDate IS NULL` du chevauchement', async () => {
    await fetchAttributionsForStats(db, baseParams, 1)

    const where = vi.mocked(db.attribution.findMany).mock.calls[0][0]?.where
    expect(where?.OR).toEqual([{ endDate: null }, { endDate: { gte: baseParams.startDate } }])
  })

  it("n'applique pas de filtre `type` quand territoryKind est vide", async () => {
    await fetchAttributionsForStats(db, { ...baseParams, territoryKind: [] }, 1)

    const where = vi.mocked(db.attribution.findMany).mock.calls[0][0]?.where
    expect(where).not.toHaveProperty('territory')
  })

  it('applique le filtre de groupe quand `groupId` est fourni', async () => {
    await fetchAttributionsForStats(db, { ...baseParams, groupId: 42 }, 1)

    const where = vi.mocked(db.attribution.findMany).mock.calls[0][0]?.where
    expect(where?.publisher).toEqual({ publisherGroupId: 42 })
  })

  it("n'applique pas de filtre de groupe par défaut", async () => {
    await fetchAttributionsForStats(db, baseParams, 1)

    const where = vi.mocked(db.attribution.findMany).mock.calls[0][0]?.where
    expect(where).not.toHaveProperty('publisher')
  })
})
