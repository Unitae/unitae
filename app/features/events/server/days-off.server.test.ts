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

  // An absence is its Absence row alone: no event, so nothing can show as an empty meeting in the programme.
  it('writes the absence as its row alone', async () => {
    const result = await createDayOff(db, 1, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)

    expect(result).toEqual({ absenceId: 900 })
    expect(db.event.create).not.toHaveBeenCalled()
    expect(db.absence.create).toHaveBeenCalledWith({
      data: {
        startDate: new Date(2025, 3, 8),
        endDate: new Date(2025, 3, 10),
        memberId: 1,
        accountId: 1,
        congregationId: 1,
      },
    })
    // The record's assignments during it are flagged.
    expect(db.event.findMany).toHaveBeenCalled()
  })

  it('writes an absence of a single day', async () => {
    const sameDate = new Date(2025, 3, 8)

    expect(await createDayOff(db, 1, 1, sameDate, sameDate, 1)).toEqual({ absenceId: 900 })
  })

  it('records who declared the absence in the audit trail', async () => {
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
    await createDayOff(db, 1, null, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)

    expect(db.event.findMany).not.toHaveBeenCalled()
  })
})

describe('deleteDayOff', () => {
  const ACCOUNT_ID = 12
  const MEMBER_ID = 1
  const absence = { id: 42, startDate: new Date(2025, 3, 8), endDate: new Date(2025, 3, 10) }

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

  it("deletes the caller's own absence and returns it", async () => {
    ownAbsenceLookup()

    const result = await deleteDayOff(db, {
      absenceId: 42,
      accountId: ACCOUNT_ID,
      memberId: MEMBER_ID,
      congregationId: 1,
    })

    expect(result).toEqual(absence)
    expect(db.absence.deleteMany).toHaveBeenCalledWith({ where: { id: 42, congregationId: 1 } })
    expect(db.event.deleteMany).not.toHaveBeenCalled()
  })

  it("refuses someone else's absence", async () => {
    ownAbsenceLookup()

    const result = await deleteDayOff(db, { absenceId: 42, accountId: 99, memberId: 5, congregationId: 1 })

    expect(result).toBeNull()
    expect(db.absence.deleteMany).not.toHaveBeenCalled()
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
