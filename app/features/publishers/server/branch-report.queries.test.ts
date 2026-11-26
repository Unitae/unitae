import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

const mockDb = {
  member: { findMany: vi.fn(), count: vi.fn() },
  memberRoleAssignment: { findFirst: vi.fn() },
  userRoleAssignment: { findFirst: vi.fn() },
}

const { getBranchReport } = await import('./branch-report.queries')

function member(type: PublisherType, report: { isPublisher: boolean; hours: number | null; studies: number } | null) {
  return {
    id: Math.random(),
    inactiveAt: null,
    publisherGroup: null,
    activities: report == null ? [] : [{ type, ...report }],
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.member.findMany.mockResolvedValue([
    member(PublisherType.Normal, { isPublisher: true, hours: null, studies: 2 }),
    member(PublisherType.PionnierAuxiliaires, { isPublisher: true, hours: 30, studies: 1 }),
    member(PublisherType.Normal, { isPublisher: false, hours: 0, studies: 0 }),
    member(PublisherType.Normal, null),
  ])
  mockDb.member.count.mockResolvedValue(41)
  mockDb.memberRoleAssignment.findFirst.mockResolvedValue(null)
  mockDb.userRoleAssignment.findFirst.mockResolvedValue(null)
})

describe('getBranchReport', () => {
  it("gives the month's branch figures, as the activity page's strip adds them up", async () => {
    const report = await getBranchReport(mockDb as never, { congregationId: 3, month: 9, year: 2026 })

    expect(report.branch.publishers).toEqual({ reports: 1, studies: 2 })
    expect(report.branch.auxiliary).toEqual({ reports: 1, hours: 30, studies: 1 })
    expect(report.branch.congregation).toMatchObject({ reports: 3, irregular: 1 })
  })

  it('counts as active the publishers who preached in the month or the five before it', async () => {
    const report = await getBranchReport(mockDb as never, { congregationId: 3, month: 9, year: 2026 })

    expect(report.activePublishers).toBe(41)
    const [[{ where }]] = mockDb.member.count.mock.calls
    expect(where.congregationId).toBe(3)
    const window = where.activities.some.OR as { year: number; month: number }[]
    expect(window).toHaveLength(6)
    expect(window[0]).toEqual({ year: 2026, month: 4 })
    expect(window[5]).toEqual({ year: 2026, month: 9 })
    // Preached: the box ticked, or hours given (a pioneer's report).
    expect(where.activities.some.AND).toEqual([{ OR: [{ isPublisher: true }, { hours: { gt: 0 } }] }])
  })

  it('leaves out those who had left before the month began', async () => {
    await getBranchReport(mockDb as never, { congregationId: 3, month: 9, year: 2026 })

    const [[{ where }]] = mockDb.member.count.mock.calls
    expect(where.OR).toEqual([{ leftAt: null }, { leftAt: { gte: new Date(2026, 9, 1) } }])
  })

  // The S-1 is signed by the secretary: the one holding the post, never the deputy.
  it("names the secretary from the organigram's lead seat", async () => {
    mockDb.memberRoleAssignment.findFirst.mockResolvedValue({ member: { firstname: 'Paul', lastname: 'MARTIN' } })

    const report = await getBranchReport(mockDb as never, { congregationId: 3, month: 9, year: 2026 })

    expect(report.secretary).toBe('Paul MARTIN')
    const [[{ where }]] = mockDb.memberRoleAssignment.findFirst.mock.calls
    expect(where).toMatchObject({ congregationId: 3, kind: 'leader', role: { key: 'secretary' } })
  })

  it('reads a seat an older version left on the login', async () => {
    mockDb.userRoleAssignment.findFirst.mockResolvedValue({
      user: { firstname: null, lastname: null, member: { firstname: 'Paul', lastname: 'MARTIN' } },
    })

    const report = await getBranchReport(mockDb as never, { congregationId: 3, month: 9, year: 2026 })

    expect(report.secretary).toBe('Paul MARTIN')
    const [[{ where }]] = mockDb.userRoleAssignment.findFirst.mock.calls
    expect(where).toMatchObject({ congregationId: 3, kind: 'leader', role: { key: 'secretary' } })
  })

  it('leaves the secretary blank when nobody holds the post', async () => {
    const report = await getBranchReport(mockDb as never, { congregationId: 3, month: 9, year: 2026 })

    expect(report.secretary).toBeNull()
  })
})
