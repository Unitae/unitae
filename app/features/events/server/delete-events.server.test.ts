import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {
    EventDeleted: 'event.deleted',
    ProgrammeRemoved: 'event.programme_removed',
  },
}))

const { bulkDeleteEvents, deleteEvent } = await import('./delete-events.server')
const auditModule = await import('~/shared/domain/audit.server')

const mockDb = {
  event: { delete: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
  eventPart: { deleteMany: vi.fn(), findMany: vi.fn() },
  eventServicePart: { deleteMany: vi.fn(), findMany: vi.fn() },
  attendance: { findMany: vi.fn() },
  notificationEvent: { updateMany: vi.fn() },
  $queryRaw: vi.fn(),
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.attendance.findMany.mockResolvedValue([])
  mockDb.eventPart.deleteMany.mockResolvedValue({ count: 0 })
  mockDb.eventServicePart.deleteMany.mockResolvedValue({ count: 0 })
  mockDb.eventPart.findMany.mockResolvedValue([])
  mockDb.eventServicePart.findMany.mockResolvedValue([])
})

describe('bulkDeleteEvents', () => {
  it('deletes every event in a single scoped deleteMany', async () => {
    mockDb.event.deleteMany.mockResolvedValue({ count: 3 })

    await bulkDeleteEvents(mockDb as never, [1, 2, 3], 42, 7)

    expect(mockDb.event.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2, 3] }, congregationId: 42 },
    })
  })

  // Governance: the same auditInTransaction pattern release/unrelease use.
  // Fire-and-forget audit (unscopedDb) would leave phantom rows if the
  // deleteMany rolls back.
  it('writes an auditInTransaction EventDeleted row for every deleted event', async () => {
    mockDb.event.deleteMany.mockResolvedValue({ count: 2 })

    await bulkDeleteEvents(mockDb as never, [10, 11], 42, 7)

    expect(vi.mocked(auditModule.auditInTransaction)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(auditModule.auditInTransaction)).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        action: 'event.deleted',
        congregationId: 42,
        actorId: 7,
        entityType: 'Event',
        entityId: 10,
      }),
    )
    expect(vi.mocked(auditModule.auditInTransaction)).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        action: 'event.deleted',
        congregationId: 42,
        actorId: 7,
        entityType: 'Event',
        entityId: 11,
      }),
    )
  })

  it('does not fire audit or deleteMany when the id list is empty', async () => {
    await bulkDeleteEvents(mockDb as never, [], 42, 7)

    expect(mockDb.event.deleteMany).not.toHaveBeenCalled()
    expect(vi.mocked(auditModule.auditInTransaction)).not.toHaveBeenCalled()
  })

  it('returns the Prisma delete count so callers can log a truthful number', async () => {
    mockDb.event.deleteMany.mockResolvedValue({ count: 2 })

    const result = await bulkDeleteEvents(mockDb as never, [10, 11, 12], 42, 7)

    // Truthful count from Prisma (12 didn't exist so only 2 were deleted).
    expect(result).toEqual({ count: 2, emptied: 0 })
  })

  // Programmes and attendance are unrelated: tidying programmes never wipes a meeting's counts.
  it('keeps the events that have counts and removes only their programme', async () => {
    mockDb.attendance.findMany.mockResolvedValue([{ eventId: 11 }])
    mockDb.event.deleteMany.mockResolvedValue({ count: 2 })

    const result = await bulkDeleteEvents(mockDb as never, [10, 11, 12], 42, 7)

    expect(mockDb.event.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [10, 12] }, congregationId: 42 } })
    expect(mockDb.eventPart.deleteMany).toHaveBeenCalledWith({ where: { eventId: { in: [11] }, congregationId: 42 } })
    expect(mockDb.eventServicePart.deleteMany).toHaveBeenCalledWith({
      where: { eventId: { in: [11] }, congregationId: 42 },
    })
    // Back to a draft, as a meeting without a programme is: nothing empty shows on the board.
    expect(mockDb.event.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [11] }, congregationId: 42 },
      data: { status: 'draft' },
    })
    expect(result).toEqual({ count: 2, emptied: 1 })
    expect(vi.mocked(auditModule.auditInTransaction)).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ action: 'event.programme_removed', entityId: 11 }),
    )
    expect(vi.mocked(auditModule.auditInTransaction)).not.toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ action: 'event.deleted', entityId: 11 }),
    )
  })

  // A count entered at the same moment must be seen: the events are locked before their counts are read.
  it('locks the events before looking for their counts', async () => {
    mockDb.event.deleteMany.mockResolvedValue({ count: 1 })
    const order: string[] = []
    mockDb.$queryRaw.mockImplementation(() => {
      order.push('lock')
      return Promise.resolve([])
    })
    mockDb.attendance.findMany.mockImplementation(() => {
      order.push('counts')
      return Promise.resolve([])
    })

    await bulkDeleteEvents(mockDb as never, [10], 42, 7)

    expect(order).toEqual(['lock', 'counts'])
  })

  it('only keeps events whose attendance has a count', async () => {
    mockDb.event.deleteMany.mockResolvedValue({ count: 1 })

    await bulkDeleteEvents(mockDb as never, [10], 42, 7)

    const [[{ where }]] = mockDb.attendance.findMany.mock.calls
    expect(where.OR).toEqual([{ inPerson: { not: null } }, { online: { not: null } }])
  })

  it('cancels the pending assignment notices of the parts it removes', async () => {
    mockDb.attendance.findMany.mockResolvedValue([{ eventId: 11 }])
    mockDb.eventPart.findMany.mockResolvedValue([{ id: 100 }])
    mockDb.eventServicePart.findMany.mockResolvedValue([{ id: 200 }])
    mockDb.event.deleteMany.mockResolvedValue({ count: 0 })

    await bulkDeleteEvents(mockDb as never, [11], 42, 7)

    expect(mockDb.notificationEvent.updateMany).toHaveBeenCalledWith({
      where: {
        congregationId: 42,
        status: 'pending',
        OR: [
          { entityType: 'EventPart', entityId: { in: [100] } },
          { entityType: 'EventServicePart', entityId: { in: [200] } },
        ],
      },
      data: { status: 'cancelled', processedAt: expect.any(Date) },
    })
  })
})

describe('deleteEvent', () => {
  it('deletes an event without counts using compound key, and audits it', async () => {
    mockDb.event.delete.mockResolvedValue({ id: 3 })

    const result = await deleteEvent(mockDb as never, 3, 10, 7)

    expect(result).toEqual({ kept: false })
    expect(mockDb.event.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 3, congregationId: 10 } },
    })
    expect(vi.mocked(auditModule.auditInTransaction)).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ action: 'event.deleted', entityId: 3, actorId: 7 }),
    )
  })

  it('keeps an event that has counts and removes only its programme', async () => {
    mockDb.attendance.findMany.mockResolvedValue([{ eventId: 3 }])

    const result = await deleteEvent(mockDb as never, 3, 10, 7)

    expect(result).toEqual({ kept: true })
    expect(mockDb.event.delete).not.toHaveBeenCalled()
    expect(mockDb.eventPart.deleteMany).toHaveBeenCalledWith({ where: { eventId: { in: [3] }, congregationId: 10 } })
    expect(vi.mocked(auditModule.auditInTransaction)).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ action: 'event.programme_removed', entityId: 3 }),
    )
  })
})
