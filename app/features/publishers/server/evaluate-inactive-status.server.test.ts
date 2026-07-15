import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: {
    PublisherInactivated: 'publisher.inactivated',
    PublisherReactivated: 'publisher.reactivated',
  },
  audit: vi.fn(),
}))
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))

const { evaluateInactiveStatus } = await import('./evaluate-inactive-status.server')
const { audit } = await import('~/shared/domain/audit.server')

const publisherId = 7
const congregationId = 10
const actorId = 99

interface MockMemberRow {
  inactiveAt: Date | null
  isPublisher: boolean
  leftAt: Date | null
}

interface MockActivityRow {
  isPublisher: boolean
  hours: number | null
  year: number
  month: number
}

const mockDb = {
  member: {
    findUnique: vi.fn<(...args: unknown[]) => Promise<MockMemberRow | null>>(),
    // setLifecycle inside the aggregate does a precondition findFirst
    findFirst: vi.fn<(...args: unknown[]) => Promise<{ id: number; inactiveAt: Date | null } | null>>(),
    update: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  },
  publisherActivity: {
    findMany: vi.fn<(...args: unknown[]) => Promise<MockActivityRow[]>>(),
  },
}

function missed(year: number, month: number): MockActivityRow {
  return { isPublisher: false, hours: 0, year, month }
}

function missedNullHours(year: number, month: number): MockActivityRow {
  return { isPublisher: false, hours: null, year, month }
}

function preached(year: number, month: number, hours = 5): MockActivityRow {
  return { isPublisher: true, hours, year, month }
}

/**
 * Test helper: return activities sorted newest-first, matching the evaluator's
 * `orderBy: [{year: 'desc'}, {month: 'desc'}]` contract.
 */
function newestFirst(rows: MockActivityRow[]): MockActivityRow[] {
  return [...rows].sort((a, b) => (b.year - a.year) * 100 + (b.month - a.month))
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.member.update.mockResolvedValue(undefined)
  // setLifecycle precondition — return the member so the transition proceeds
  mockDb.member.findFirst.mockResolvedValue({ id: publisherId, inactiveAt: null })
})

describe('evaluateInactiveStatus', () => {
  it('no-ops when the member has left the congregation', async () => {
    mockDb.member.findUnique.mockResolvedValue({
      inactiveAt: null,
      isPublisher: true,
      leftAt: new Date('2026-01-01'),
    })

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(2026, 0),
    })

    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(mockDb.publisherActivity.findMany).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('no-ops when the member is not a publisher (ministry-school student)', async () => {
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: false, leftAt: null })

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(2026, 0),
    })

    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('does not set inactive when the publisher has fewer than 6 missed reports', async () => {
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue(
      newestFirst([missed(2025, 8), missed(2025, 9), missed(2025, 10), missed(2025, 11), missed(2026, 0)]),
    )

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(2026, 0),
    })

    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('stamps inactiveAt at the first of the month AFTER the 6th missed report (exactly 6 in streak)', async () => {
    // Jan 26 – Jun 26 all missed. 6th oldest in the streak = Jun 26.
    // Publisher becomes inactive as of July 1, 2026: Jun row still shows irregular, Jul+ shows inactive.
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue(
      newestFirst([
        missed(2026, 0),
        missed(2026, 1),
        missed(2026, 2),
        missed(2026, 3),
        missed(2026, 4),
        missed(2026, 5),
      ]),
    )

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(2026, 5),
    })

    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: publisherId, congregationId } },
      data: { inactiveAt: new Date(2026, 6, 1) },
    })
  })

  it('stamps inactiveAt at the first of the month AFTER the 6th-oldest missed report (streak > 6)', async () => {
    // Dec 25 – Jun 26 all missed (7 in a row). 6th oldest = May 26.
    // Publisher becomes inactive as of June 1, 2026 (Jun row shows inactive).
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue(
      newestFirst([
        missed(2025, 11),
        missed(2026, 0),
        missed(2026, 1),
        missed(2026, 2),
        missed(2026, 3),
        missed(2026, 4),
        missed(2026, 5),
      ]),
    )

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(2026, 5),
    })

    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: publisherId, congregationId } },
      data: { inactiveAt: new Date(2026, 5, 1) },
    })
  })

  it('treats null-hours reports as missed-preach', async () => {
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue(
      newestFirst([
        missedNullHours(2026, 0),
        missedNullHours(2026, 1),
        missedNullHours(2026, 2),
        missedNullHours(2026, 3),
        missedNullHours(2026, 4),
        missedNullHours(2026, 5),
      ]),
    )

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missedNullHours(2026, 5),
    })

    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: publisherId, congregationId } },
      data: { inactiveAt: new Date(2026, 6, 1) },
    })
  })

  it('fills a missing month between two missed reports', async () => {
    // Dec 25 missed, no Jan 26 record, Feb 26 – Jun 26 missed. Jan 26 is bracketed
    // by missed records → treated as missed → streak = 7 → inactiveAt = Jun 1 2026.
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue(
      newestFirst([
        missed(2025, 11),
        missed(2026, 1),
        missed(2026, 2),
        missed(2026, 3),
        missed(2026, 4),
        missed(2026, 5),
      ]),
    )

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(2026, 5),
    })

    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: publisherId, congregationId } },
      data: { inactiveAt: new Date(2026, 5, 1) },
    })
  })

  it('does not fill a missing month older than the oldest missed record', async () => {
    // Jan 26 – Jun 26 missed. Dec 25 has no record and is OLDER than the oldest
    // missed record (Jan 26) — must not be filled. Streak = 6 → inactiveAt = Jul 1 2026.
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue(
      newestFirst([
        missed(2026, 0),
        missed(2026, 1),
        missed(2026, 2),
        missed(2026, 3),
        missed(2026, 4),
        missed(2026, 5),
      ]),
    )

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(2026, 5),
    })

    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: publisherId, congregationId } },
      data: { inactiveAt: new Date(2026, 6, 1) },
    })
  })

  it('does not set inactive when an hours report breaks the streak within the last 6 months', async () => {
    // Dec 25 missed, Jan 26 hours, Feb 26 – Jun 26 missed. Walk from Jun back:
    // Jun, May, Apr, Mar, Feb = 5 in streak; Jan is hours → stop. Streak = 5.
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue(
      newestFirst([
        missed(2025, 11),
        preached(2026, 0),
        missed(2026, 1),
        missed(2026, 2),
        missed(2026, 3),
        missed(2026, 4),
        missed(2026, 5),
      ]),
    )

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(2026, 5),
    })

    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('does not set inactive when the newest record is not missed', async () => {
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue(
      newestFirst([
        missed(2025, 11),
        missed(2026, 0),
        missed(2026, 1),
        missed(2026, 2),
        missed(2026, 3),
        missed(2026, 4),
        preached(2026, 5),
      ]),
    )

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: preached(2026, 5),
    })

    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('emits the inactivation audit entry with the trigger metadata', async () => {
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue(
      newestFirst([
        missed(2026, 0),
        missed(2026, 1),
        missed(2026, 2),
        missed(2026, 3),
        missed(2026, 4),
        missed(2026, 5),
      ]),
    )

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(2026, 5),
    })

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'publisher.inactivated',
        congregationId,
        actorId,
        entityType: 'Member',
        entityId: publisherId,
        metadata: { trigger: 'activity-created' },
      }),
    )
  })

  it('clears inactive when an hours report arrives via create', async () => {
    mockDb.member.findUnique.mockResolvedValue({
      inactiveAt: new Date('2026-01-01'),
      isPublisher: true,
      leftAt: null,
    })
    // setLifecycle('active') precondition needs to see inactiveAt != null to transition
    mockDb.member.findFirst.mockResolvedValue({ id: publisherId, inactiveAt: new Date('2026-01-01') })

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: preached(2026, 6, 2),
    })

    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: publisherId, congregationId } },
      data: { inactiveAt: null },
    })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'publisher.reactivated',
        metadata: { trigger: 'activity-created' },
      }),
    )
    expect(mockDb.publisherActivity.findMany).not.toHaveBeenCalled()
  })

  it('keeps inactive when a 0-hour report arrives on an already-inactive publisher', async () => {
    mockDb.member.findUnique.mockResolvedValue({
      inactiveAt: new Date('2026-01-01'),
      isPublisher: true,
      leftAt: null,
    })

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(2026, 6),
    })

    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('does not clear inactive on a deletion even if a previously-active report was the deleted one', async () => {
    mockDb.member.findUnique.mockResolvedValue({
      inactiveAt: new Date('2026-01-01'),
      isPublisher: true,
      leftAt: null,
    })

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-deleted',
      triggeringActivity: null,
    })

    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
})
