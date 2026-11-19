import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { DayOffCreated: 'day_off.created', DayOffDeleted: 'day_off.deleted' },
  auditInTransaction: vi.fn().mockResolvedValue({}),
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    absence: { create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
    eventTemplate: { findFirst: vi.fn() },
    eventPart: { updateMany: vi.fn() },
    eventServicePart: { updateMany: vi.fn() },
  },
}))

const { createDayOff, deleteDayOff } = await import('./days-off.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { auditInTransaction } = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
  // Default: no overlapping programme events for conflict refresh
  vi.mocked(db.event.findMany).mockResolvedValue([] as never)
  vi.mocked(db.absence.create).mockResolvedValue({ id: 900 } as never)
  vi.mocked(db.absence.deleteMany).mockResolvedValue({ count: 0 } as never)
})

describe('createDayOff', () => {
  it('returns null when startDate is null', async () => {
    const result = await createDayOff(db, 1, 1, null, new Date(2025, 3, 10), 1)
    expect(result).toBeNull()
  })

  it('returns null when endDate is null', async () => {
    const result = await createDayOff(db, 1, 1, new Date(2025, 3, 8), null, 1)
    expect(result).toBeNull()
  })

  it('returns null when startDate is undefined', async () => {
    const result = await createDayOff(db, 1, 1, undefined, new Date(2025, 3, 10), 1)
    expect(result).toBeNull()
  })

  it('returns null when startDate > endDate', async () => {
    const result = await createDayOff(db, 1, 1, new Date(2025, 3, 15), new Date(2025, 3, 10), 1)
    expect(result).toBeNull()
  })

  it('creates an event when dates are valid', async () => {
    const fakeEvent = { id: 1, name: 'Absence' }
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ id: 5, key: 'day-off' } as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    const result = await createDayOff(db, 1, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)
    // The event, and the row the absence is deleted by.
    expect(result).toEqual({ ...fakeEvent, absenceId: 900 })
  })

  // Days-off events are not part of the draft/released workflow — they must go
  // live immediately, otherwise the absence-overlap query silently ignores them
  // and the whole conflict-awareness pipeline breaks.
  it('writes status "released" on the created event', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ id: 5, key: 'day-off' } as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1, name: 'Absence' } as never)

    await createDayOff(db, 1, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)

    expect(db.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'released' }) }),
    )
  })

  it('creates an event when startDate == endDate', async () => {
    const sameDate = new Date(2025, 3, 8)
    const fakeEvent = { id: 2, name: 'Absence' }
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ id: 5, key: 'day-off' } as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    const result = await createDayOff(db, 1, 1, sameDate, sameDate, 1)
    // The event, and the row the absence is deleted by.
    expect(result).toEqual({ ...fakeEvent, absenceId: 900 })
  })

  it('throws NotFoundError when the day-off system template is missing', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)

    await expect(createDayOff(db, 1, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)).rejects.toThrow(
      'Day-off template',
    )
    expect(db.event.create).not.toHaveBeenCalled()
  })

  it('connects the event to the day-off template when it exists', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ id: 42, key: 'day-off' } as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)

    await createDayOff(db, 1, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 7)

    expect(db.eventTemplate.findFirst).toHaveBeenCalledWith({
      where: { key: 'day-off', congregationId: 7 },
    })
    expect(db.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ template: { connect: { id: 42 } } }),
      }),
    )
  })

  it('records who declared the absence in the audit trail', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ id: 5, key: 'day-off' } as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 77, name: 'Absence' } as never)

    await createDayOff(db, 12, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 3)

    expect(auditInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: 'day_off.created',
        congregationId: 3,
        actorId: 12,
        entityType: 'Absence',
        entityId: 900,
      }),
    )
  })

  // With a null memberId (account without a linked Member — e.g. circuit
  // overseer or admin), we skip the conflict-flag refresh entirely: there
  // can be no assignments to flag.
  it('skips refreshConflictFlags when memberId is null', async () => {
    const fakeEvent = { id: 4, name: 'Absence' }
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ id: 5, key: 'day-off' } as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    await createDayOff(db, 1, null, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)

    expect(db.event.findMany).not.toHaveBeenCalled()
  })
})

describe('deleteDayOff', () => {
  const ACCOUNT_ID = 12
  const MEMBER_ID = 1
  const absence = { id: 42, startDate: new Date(2025, 3, 8), endDate: new Date(2025, 3, 10), legacyEventId: 77 }

  // Only the caller's own absence answers the lookup — by their record, or by their account when they have none:
  // another person's absence finds nothing.
  function ownAbsenceLookup() {
    vi.mocked(db.absence.findFirst).mockImplementation((({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where.id === absence.id &&
          where.congregationId === 1 &&
          (where.memberId === MEMBER_ID || (where.memberId === null && where.accountId === ACCOUNT_ID))
          ? absence
          : null,
      )) as never)
    vi.mocked(db.absence.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(db.event.deleteMany).mockResolvedValue({ count: 1 } as never)
  }

  it("deletes the caller's own absence, with its event, and returns it", async () => {
    ownAbsenceLookup()

    const result = await deleteDayOff(db, {
      absenceId: 42,
      accountId: ACCOUNT_ID,
      memberId: MEMBER_ID,
      congregationId: 1,
    })

    expect(result).toEqual(absence)
    expect(db.absence.deleteMany).toHaveBeenCalledWith({ where: { id: 42, congregationId: 1 } })
    // Its day-off event only, never whatever event the id might name.
    expect(db.event.deleteMany).toHaveBeenCalledWith({
      where: { id: 77, congregationId: 1, template: { key: 'day-off' } },
    })
  })

  it("refuses someone else's absence", async () => {
    ownAbsenceLookup()

    const result = await deleteDayOff(db, { absenceId: 42, accountId: 99, memberId: 5, congregationId: 1 })

    expect(result).toBeNull()
    expect(db.absence.deleteMany).not.toHaveBeenCalled()
    // Nor its event: the two copies stay together.
    expect(db.event.deleteMany).not.toHaveBeenCalled()
  })

  it('answers as for no absence when it is gone between the lookup and the delete', async () => {
    ownAbsenceLookup()
    vi.mocked(db.absence.deleteMany).mockResolvedValue({ count: 0 } as never)

    const result = await deleteDayOff(db, {
      absenceId: 42,
      accountId: ACCOUNT_ID,
      memberId: MEMBER_ID,
      congregationId: 1,
    })

    expect(result).toBeNull()
    expect(db.event.deleteMany).not.toHaveBeenCalled()
    expect(auditInTransaction).not.toHaveBeenCalled()
  })

  it('records the deletion in the audit trail', async () => {
    ownAbsenceLookup()

    await deleteDayOff(db, { absenceId: 42, accountId: ACCOUNT_ID, memberId: MEMBER_ID, congregationId: 1 })

    expect(auditInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ action: 'day_off.deleted', actorId: ACCOUNT_ID, entityType: 'Absence', entityId: 42 }),
    )
  })

  it('refreshes conflict flags over the deleted range when memberId is provided', async () => {
    ownAbsenceLookup()

    await deleteDayOff(db, { absenceId: 42, accountId: ACCOUNT_ID, memberId: MEMBER_ID, congregationId: 1 })

    expect(db.event.findMany).toHaveBeenCalled()
  })

  // Mirror of createDayOff's null-memberId guard — an account without a
  // linked Member cannot own any conflict-carrying assignments, so refresh
  // is skipped rather than issuing a no-op query.
  it('skips refreshConflictFlags when memberId is null', async () => {
    ownAbsenceLookup()

    await deleteDayOff(db, { absenceId: 42, accountId: ACCOUNT_ID, memberId: null, congregationId: 1 })

    expect(db.event.findMany).not.toHaveBeenCalled()
  })
})
