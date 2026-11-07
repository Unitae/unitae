import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { attribution: { findMany: vi.fn() } } }))

const { getTerritoryTrend, summarizeTerritoryTrend, trendSnapshots } = await import('./get-territory-trend.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const PARIS = 'Europe/Paris'
const at = (month: number, day = 1, year = 2026) => new Date(Date.UTC(year, month, day))

describe('trendSnapshots', () => {
  it('reads each past month at the first moment of the next one on the congregation clock, then now', () => {
    const now = new Date(Date.UTC(2026, 10, 7, 12))
    const snapshots = trendSnapshots(PARIS, now)
    expect(snapshots).toHaveLength(12)
    // December 2025 ends when 1 January starts in Paris: 23:00 UTC the day before.
    expect(snapshots[0]).toEqual(new Date(Date.UTC(2025, 11, 31, 23)))
    // Summer time: October starts at 22:00 UTC on 30 September.
    expect(snapshots[9]).toEqual(new Date(Date.UTC(2026, 8, 30, 22)))
    expect(snapshots[10]).toEqual(new Date(Date.UTC(2026, 9, 31, 23)))
    expect(snapshots[11]).toEqual(now)
  })

  it('follows the congregation calendar across a month boundary', () => {
    // Already 1 December in Paris: November is the last full month.
    const snapshots = trendSnapshots(PARIS, new Date(Date.UTC(2026, 10, 30, 23, 30)))
    expect(snapshots[10]).toEqual(new Date(Date.UTC(2026, 10, 30, 23)))
  })
})

describe('summarizeTerritoryTrend', () => {
  it('counts the territories out and late at each point', () => {
    const trend = summarizeTerritoryTrend(
      [
        // Out since mid-January, late since mid-May.
        { startDate: at(0, 15), endDate: null, lateDate: at(4, 15), pausedAt: null },
        // Out for two weeks in March.
        { startDate: at(2, 10), endDate: at(2, 25), lateDate: at(5, 10), pausedAt: null },
        // Late since April, then paused by a campaign in June: its clock froze.
        { startDate: at(0, 2), endDate: null, lateDate: at(3, 2), pausedAt: at(5, 5) },
      ],
      [at(1), at(2, 20), at(4), at(6)],
      at(5),
    )
    expect(trend).toEqual({
      out: [2, 3, 2, 2],
      late: [0, 0, 1, 1],
      monthAgo: { out: 2, late: 2 },
    })
  })

  it('no longer counts a territory from the moment it is returned', () => {
    const trend = summarizeTerritoryTrend(
      [{ startDate: at(0), endDate: at(3), lateDate: at(1), pausedAt: null }],
      [at(2), at(3)],
      at(2),
    )
    expect(trend.out).toEqual([1, 0])
    expect(trend.late).toEqual([1, 0])
  })
})

describe('getTerritoryTrend', () => {
  it('returns twelve points ending now, and the counts a month ago', async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([
      { startDate: at(5, 1, 2025), endDate: null, lateDate: at(9, 20), pausedAt: null },
    ] as never)
    const trend = await getTerritoryTrend(db, 1, PARIS, new Date(Date.UTC(2026, 10, 7, 12)))
    expect(trend.out).toEqual(Array(12).fill(1))
    // Late from 20 October: the end-of-October point and now.
    expect(trend.late).toEqual([...Array(10).fill(0), 1, 1])
    // 8 October: out, not yet late.
    expect(trend.monthAgo).toEqual({ out: 1, late: 0 })
  })
})
