import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    member: { findMany: vi.fn() },
    pioneerGoal: { findFirst: vi.fn() },
  },
}))

const { getPioneerActivitySummary } = await import('./pioneer-activity.queries')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const SY = 2025
const NOW = new Date(2026, 0, 15) // 15 Jan 2026

let nextId = 1
function activity(month: number, year: number, type: PublisherType, hours: number | null) {
  return { id: nextId++, month, year, type, hours, isPublisher: true }
}
function member(id: number, type: PublisherType, activities: ReturnType<typeof activity>[], publisherGroup = null) {
  return { id, firstname: `F${id}`, lastname: `L${id}`, type, publisherGroup, activities }
}

beforeEach(() => {
  vi.resetAllMocks()
  nextId = 1
  vi.mocked(db.pioneerGoal.findFirst).mockResolvedValue(null) // use built-in defaults
})

describe('getPioneerActivitySummary', () => {
  it('splits pioneers into annual and auxiliary sections by roster type', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([
      member(1, PublisherType.PionnierPermanant, [
        activity(8, 2025, PublisherType.PionnierPermanant, 50),
        activity(9, 2025, PublisherType.PionnierPermanant, 50),
      ]),
      member(2, PublisherType.PionnierAuxiliaires, [activity(10, 2025, PublisherType.PionnierAuxiliaires, 30)]),
    ] as never)

    const result = await getPioneerActivitySummary(db, 42, SY, NOW)

    expect(result.annual.map(r => r.memberId)).toEqual([1])
    expect(result.auxiliary.map(r => r.memberId)).toEqual([2])
    expect(result.serviceYear).toBe(SY)
  })

  it('sorts annual pioneers most-at-risk first', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([
      member(1, PublisherType.PionnierPermanant, [
        activity(8, 2025, PublisherType.PionnierPermanant, 50),
        activity(9, 2025, PublisherType.PionnierPermanant, 50),
        activity(10, 2025, PublisherType.PionnierPermanant, 50),
        activity(11, 2025, PublisherType.PionnierPermanant, 50),
      ]), // on pace → green
      member(2, PublisherType.PionnierPermanant, [
        activity(8, 2025, PublisherType.PionnierPermanant, 10),
        activity(9, 2025, PublisherType.PionnierPermanant, 10),
        activity(10, 2025, PublisherType.PionnierPermanant, 10),
        activity(11, 2025, PublisherType.PionnierPermanant, 10),
      ]), // far behind → red
    ] as never)

    const result = await getPioneerActivitySummary(db, 42, SY, NOW)

    expect(result.annual.map(r => r.memberId)).toEqual([2, 1])
    expect(result.annual[0].pace.riskBucket).toBe('red')
    expect(result.totals.atRisk).toBe(1)
    expect(result.totals.onTrack).toBe(1)
  })

  it('dedups duplicate rows for a month, keeping the latest id', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([
      member(1, PublisherType.PionnierPermanant, [
        activity(8, 2025, PublisherType.PionnierPermanant, 50), // id 1 (stale)
        activity(8, 2025, PublisherType.PionnierPermanant, 20), // id 2 (latest, wins)
      ]),
    ] as never)

    const result = await getPioneerActivitySummary(db, 42, SY, NOW)

    // Only one enrolled month, using the latest row's 20h — not 70 summed.
    expect(result.annual[0].pace.actualToDate).toBe(20)
    expect(result.annual[0].pace.elapsedEnrolled).toBe(1)
  })

  it('flags concluded pioneers (reverted to Normal) and excludes them from totals', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([
      member(1, PublisherType.Normal, [
        activity(8, 2025, PublisherType.PionnierPermanant, 50),
        activity(9, 2025, PublisherType.Normal, null), // latest snapshot: no longer a pioneer
      ]),
    ] as never)

    const result = await getPioneerActivitySummary(db, 42, SY, NOW)

    const row = result.annual.find(r => r.memberId === 1)
    expect(row?.concluded).toBe(true)
    expect(result.totals.onTrack + result.totals.behind + result.totals.atRisk).toBe(0)
  })
})
