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
}

const mockDb = {
  member: {
    findUnique: vi.fn<(...args: unknown[]) => Promise<MockMemberRow | null>>(),
    update: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  },
  publisherActivity: {
    findMany: vi.fn<(...args: unknown[]) => Promise<MockActivityRow[]>>(),
  },
}

function missed(): MockActivityRow {
  return { isPublisher: false, hours: 0 }
}

function missedNullHours(): MockActivityRow {
  return { isPublisher: false, hours: null }
}

function preached(hours = 5): MockActivityRow {
  return { isPublisher: true, hours }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.member.update.mockResolvedValue(undefined)
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
      triggeringActivity: missed(),
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
      triggeringActivity: missed(),
    })

    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('does not set inactive when the publisher has fewer than 6 reports', async () => {
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue([missed(), missed(), missed(), missed(), missed()])

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(),
    })

    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('sets inactive when the most recent 6 reports are all missed-preach (hours=0)', async () => {
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue([missed(), missed(), missed(), missed(), missed(), missed()])

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missed(),
    })

    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: publisherId, congregationId } },
      data: { inactiveAt: expect.any(Date) },
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

  it('treats null-hours reports as missed-preach', async () => {
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue([
      missedNullHours(),
      missedNullHours(),
      missedNullHours(),
      missedNullHours(),
      missedNullHours(),
      missedNullHours(),
    ])

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: missedNullHours(),
    })

    expect(mockDb.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { inactiveAt: expect.any(Date) } }),
    )
  })

  it('does not set inactive when a preached report breaks the streak', async () => {
    mockDb.member.findUnique.mockResolvedValue({ inactiveAt: null, isPublisher: true, leftAt: null })
    mockDb.publisherActivity.findMany.mockResolvedValue([preached(), missed(), missed(), missed(), missed(), missed()])

    await evaluateInactiveStatus(mockDb as never, {
      publisherId,
      congregationId,
      actorId,
      trigger: 'activity-created',
      triggeringActivity: preached(),
    })

    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('clears inactive when an hours report arrives via create', async () => {
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
      triggeringActivity: preached(2),
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
      triggeringActivity: missed(),
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
