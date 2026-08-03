import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    member: { findMany: vi.fn() },
    pioneerGoal: { findFirst: vi.fn() },
  },
}))

const { getPioneerActivitySummary } = await import('./pioneer-activity.queries')
const { deriveStintsFromActivity } = await import('./pioneer-enrolment-backfill.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const SY = 2025
const NOW = new Date(2026, 0, 15) // 15 Jan 2026

let nextId = 1
function activity(month: number, year: number, type: PublisherType, hours: number | null) {
  return { id: nextId++, month, year, type, hours, isPublisher: true }
}
// Each member's enrolments are the backfill of their activity — so the enrolment-driven summary is
// exercised with the same fixtures (and must reach the same expected values) as the old inference.
function member(id: number, type: PublisherType, activities: ReturnType<typeof activity>[], publisherGroup = null) {
  return {
    id,
    firstname: `F${id}`,
    lastname: `L${id}`,
    type,
    publisherGroup,
    activities,
    pioneerEnrolments: deriveStintsFromActivity(activities, type),
  }
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

    // Latest row's 20h wins (not 70 summed). They started in Sept but reported nothing
    // since, so they're enrolled Sept–Dec (4 months) and behind — the goal isn't shrunk.
    expect(result.annual[0].pace.actualToDate).toBe(20)
    expect(result.annual[0].pace.elapsedEnrolled).toBe(4)
  })

  it('treats a continuing pioneer as enrolled since September even without a September report', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([
      member(1, PublisherType.PionnierPermanant, [
        activity(7, 2025, PublisherType.PionnierPermanant, 50), // Aug of the PRIOR service year → continuing
        activity(9, 2025, PublisherType.PionnierPermanant, 50), // this year: first report is Oct
        activity(10, 2025, PublisherType.PionnierPermanant, 50), // Nov
        activity(11, 2025, PublisherType.PionnierPermanant, 50), // Dec
      ]),
    ] as never)

    const result = await getPioneerActivitySummary(db, 42, SY, NOW)

    // Enrolled Sept–Dec (4) though Sept was never reported this year; one month behind.
    expect(result.annual[0].pace.elapsedEnrolled).toBe(4)
    expect(result.annual[0].pace.actualToDate).toBe(150)
    expect(result.annual[0].pace.paceDelta).toBe(-50)
  })

  it('places a mid-year type switcher in one section and excludes off-type months from proration', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([
      member(1, PublisherType.PionnierPermanant, [
        activity(8, 2025, PublisherType.PionnierAuxiliaires, 30), // Sept: auxiliary
        activity(9, 2025, PublisherType.PionnierAuxiliaires, 30), // Oct: auxiliary
        activity(10, 2025, PublisherType.PionnierPermanant, 50), // Nov: switched to permanent
        activity(11, 2025, PublisherType.PionnierPermanant, 50), // Dec: permanent
      ]),
    ] as never)

    const result = await getPioneerActivitySummary(db, 42, SY, NOW)

    // Latest row is permanent → the member appears only in the annual section.
    expect(result.annual.map(r => r.memberId)).toEqual([1])
    expect(result.auxiliary).toHaveLength(0)
    // Only the two permanent months count; the auxiliary months are excluded.
    expect(result.annual[0].pace.elapsedEnrolled).toBe(2)
    expect(result.annual[0].pace.actualToDate).toBe(100)
  })

  it('excludes a mid-year publisher gap (stopped then restarted) from the pioneer goal', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([
      member(1, PublisherType.PionnierPermanant, [
        activity(8, 2025, PublisherType.PionnierPermanant, 50), // Sept
        activity(9, 2025, PublisherType.PionnierPermanant, 50), // Oct
        activity(10, 2025, PublisherType.PionnierPermanant, 50), // Nov
        activity(11, 2025, PublisherType.Normal, null), // Dec: stopped — regular publisher
        activity(0, 2026, PublisherType.Normal, null), // Jan: still a regular publisher
        activity(1, 2026, PublisherType.PionnierPermanant, 50), // Feb: restarted
        activity(2, 2026, PublisherType.PionnierPermanant, 50), // Mar
      ]),
    ] as never)

    const result = await getPioneerActivitySummary(db, 42, SY, new Date(2026, 3, 15)) // 15 Apr → expected Mar

    // Five months actually pioneered, not the seven-month span — the two publisher months in
    // the middle are not owed, so he is on track rather than two months behind.
    expect(result.annual[0].pace.elapsedEnrolled).toBe(5)
    expect(result.annual[0].pace.actualToDate).toBe(250)
    expect(result.annual[0].pace.paceDelta).toBe(0)
  })

  it('excludes members who left or are inactive from the roster query', async () => {
    // A pioneer preaches, so cannot be inactive (inactive = 6 missed-preach reports) and
    // must not appear once they have left the congregation.
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)

    await getPioneerActivitySummary(db, 42, SY, NOW)

    const where = vi.mocked(db.member.findMany).mock.calls[0][0]?.where
    expect(where).toMatchObject({ leftAt: null, inactiveAt: null })
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
