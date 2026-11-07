import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { member: { findMany: vi.fn() } } }))

const { getReportProgress, summarizeReportProgress } = await import('./get-report-progress.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const PARIS = 'Europe/Paris'
const OCTOBER = { month: 9, year: 2026 }
const added = (month: number) => new Date(Date.UTC(2026, month, 2, 10))

describe('summarizeReportProgress', () => {
  it('counts the reports expected and received for the month, as the group pages do', () => {
    const progress = summarizeReportProgress(
      [
        { createdAt: added(0), inactiveAt: null, publisherGroupId: 1, activities: [{ isPublisher: true }] },
        // A report without ministry still counts as received (« irrégulier »).
        { createdAt: added(0), inactiveAt: null, publisherGroupId: 1, activities: [{ isPublisher: false }] },
        { createdAt: added(0), inactiveAt: null, publisherGroupId: 2, activities: [] },
        { createdAt: added(0), inactiveAt: null, publisherGroupId: null, activities: [] },
        // Added after October: nobody expected an October report.
        { createdAt: added(10), inactiveAt: null, publisherGroupId: 3, activities: [] },
        // Inactive publishers sit apart on the group page and are not chased for reports.
        { createdAt: added(0), inactiveAt: added(5), publisherGroupId: 3, activities: [] },
      ],
      OCTOBER,
      PARIS,
    )
    expect(progress).toEqual({ month: OCTOBER, expected: 4, received: 2, incompleteGroups: 1 })
  })
})

describe('getReportProgress', () => {
  it('reads the month being collected on the congregation calendar', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)
    // 00:30 in Paris on 1 November is still 31 October in UTC: October is already being collected.
    const progress = await getReportProgress(db, 1, PARIS, new Date(Date.UTC(2026, 9, 31, 23, 30)))
    expect(progress.month).toEqual(OCTOBER)
  })

  it('sets the month before beside it, counted the same way', async () => {
    const report = (month: number) => ({ month, year: 2026, isPublisher: true })
    vi.mocked(db.member.findMany).mockResolvedValue([
      { createdAt: added(0), inactiveAt: null, publisherGroupId: 1, activities: [report(8), report(9)] },
      { createdAt: added(0), inactiveAt: null, publisherGroupId: 1, activities: [report(8)] },
      { createdAt: added(0), inactiveAt: null, publisherGroupId: 2, activities: [] },
      // Added in October: owed an October report, not a September one.
      { createdAt: added(9), inactiveAt: null, publisherGroupId: 2, activities: [report(9)] },
    ] as never)
    const progress = await getReportProgress(db, 1, PARIS, new Date(Date.UTC(2026, 10, 7, 12)))
    expect(progress).toEqual({
      month: OCTOBER,
      expected: 4,
      received: 2,
      incompleteGroups: 2,
      previous: { month: { month: 8, year: 2026 }, expected: 3, received: 2, incompleteGroups: 1 },
    })
  })
})
