import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { StatsFilterParams } from './stats-filter-params.type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    attribution: { count: vi.fn(), findMany: vi.fn() },
  },
}))

const { aggregateAttributionStatsForWindow } = await import('./aggregate-attribution-stats.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const baseParams: StatsFilterParams = {
  territoryKind: [TerritoryKind.Classical],
  attributionKind: [TerritoryAttributionKind.Default],
  startDate: new Date(2025, 0, 1),
  endDate: new Date(2025, 11, 31),
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.attribution.count).mockResolvedValue(0)
  vi.mocked(db.attribution.findMany).mockResolvedValue([])
})

describe('aggregateAttributionStatsForWindow', () => {
  it('returns zeros when there are no attributions', async () => {
    const result = await aggregateAttributionStatsForWindow(db, baseParams, 1)

    expect(result).toEqual({
      attributionCount: 0,
      distinctTerritoryCount: 0,
      averageDurationDays: 0,
      overdueRate: 0,
    })
  })

  it('computes counts, distinct territories, average duration and overdue rate', async () => {
    vi.mocked(db.attribution.count).mockResolvedValue(5)
    vi.mocked(db.attribution.findMany)
      .mockResolvedValueOnce([{ territoryId: 1 }, { territoryId: 2 }, { territoryId: 3 }] as never) // distinct
      .mockResolvedValueOnce([
        // 30-day duration, on-time
        { startDate: new Date(2025, 0, 1), endDate: new Date(2025, 0, 31), lateDate: new Date(2025, 1, 15) },
        // 60-day duration, overdue (endDate > lateDate)
        { startDate: new Date(2025, 1, 1), endDate: new Date(2025, 3, 2), lateDate: new Date(2025, 2, 1) },
      ] as never)

    const result = await aggregateAttributionStatsForWindow(db, baseParams, 1)

    expect(result.attributionCount).toBe(5)
    expect(result.distinctTerritoryCount).toBe(3)
    // (30 + 60) / 2 = 45
    expect(result.averageDurationDays).toBe(45)
    // 1 overdue out of 2 completed = 50%
    expect(result.overdueRate).toBe(50)
  })

  it('gates the overdue numerator by lateDate-in-window (#13)', async () => {
    vi.mocked(db.attribution.count).mockResolvedValue(0)
    vi.mocked(db.attribution.findMany).mockResolvedValue([])

    await aggregateAttributionStatsForWindow(db, baseParams, 1)

    // The third call is the "completed in window" query — assert its where contains
    // a `lateDate` predicate gated to the window.
    const completedCallArgs = vi.mocked(db.attribution.findMany).mock.calls[1][0]
    const lateDate = (completedCallArgs?.where as { lateDate?: { gte?: Date; lt?: Date } } | undefined)?.lateDate
    expect(lateDate?.gte).toEqual(baseParams.startDate)
    // lt = startOfNextDay(endDate) — Jan 1, 2026 local midnight
    expect(lateDate?.lt).toEqual(new Date(2026, 0, 1))
  })

  it('applies the group filter to all three queries', async () => {
    await aggregateAttributionStatsForWindow(db, { ...baseParams, groupId: 42 }, 1)

    const countWhere = vi.mocked(db.attribution.count).mock.calls[0][0]?.where
    const distinctWhere = vi.mocked(db.attribution.findMany).mock.calls[0][0]?.where
    const completedWhere = vi.mocked(db.attribution.findMany).mock.calls[1][0]?.where

    expect(countWhere?.publisher).toEqual({ publisherGroupId: 42 })
    expect(distinctWhere?.publisher).toEqual({ publisherGroupId: 42 })
    expect(completedWhere?.publisher).toEqual({ publisherGroupId: 42 })
  })

  it("n'applique pas de filtre `type` quand territoryKind est vide", async () => {
    await aggregateAttributionStatsForWindow(db, { ...baseParams, territoryKind: [] }, 1)

    const countWhere = vi.mocked(db.attribution.count).mock.calls[0][0]?.where
    expect(countWhere).not.toHaveProperty('territory')
  })
})
