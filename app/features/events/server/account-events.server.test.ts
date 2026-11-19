import { beforeEach, describe, expect, it, vi } from 'vitest'

const refreshConflictFlags = vi.fn()
vi.mock('~/features/events/server/refresh-conflict-flags.server', () => ({
  refreshConflictFlags: (...args: unknown[]) => refreshConflictFlags(...args),
}))

const { releaseAccountEvents } = await import('./account-events.server')

const db = {
  event: { updateMany: vi.fn() },
  absence: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
}

const ROW = { id: 5, startDate: new Date('2027-01-12T00:00:00Z'), endDate: new Date('2027-01-14T22:59:00Z') }

beforeEach(() => {
  vi.resetAllMocks()
  db.event.updateMany.mockResolvedValue({ count: 0 })
  db.absence.findMany.mockResolvedValue([])
  db.absence.updateMany.mockResolvedValue({ count: 0 })
  db.absence.deleteMany.mockResolvedValue({ count: 0 })
})

describe('releaseAccountEvents', () => {
  // Nobody else is away on them: they go with the account, and the audit trail lists them.
  it('deletes the absences of an account without a record and clears its author elsewhere', async () => {
    db.absence.findMany.mockResolvedValue([ROW])
    db.event.updateMany.mockResolvedValue({ count: 2 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: null }, 10)

    expect(released).toEqual({ absencesDeleted: [ROW], absencesKept: 0, eventsUnattributed: 2 })
    expect(db.absence.deleteMany).toHaveBeenCalledWith({ where: { congregationId: 10, accountId: 7 } })
    expect(db.absence.updateMany).not.toHaveBeenCalled()
    expect(db.event.updateMany).toHaveBeenCalledWith({
      where: { congregationId: 10, createdById: 7 },
      data: { createdById: null },
    })
  })

  // The absences are the person's: they stay on the record, which every list reads them by, without the account.
  it('keeps the absences of an account linked to a record, on the record', async () => {
    db.absence.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: 42 }, 10)

    expect(released).toEqual({ absencesDeleted: [], absencesKept: 1, eventsUnattributed: 0 })
    expect(db.absence.updateMany).toHaveBeenCalledWith({
      where: { congregationId: 10, accountId: 7, memberId: { not: null } },
      data: { accountId: null },
    })
    // Nothing of the person's is deleted, and the record already flags what it had.
    expect(db.absence.deleteMany).not.toHaveBeenCalled()
    expect(refreshConflictFlags).not.toHaveBeenCalled()
  })

  // A row on no record (declared while the account was being linked) is the person's too: it moves onto the record,
  // as linking does, and starts flagging their assignments.
  it('moves a row on no record onto the record', async () => {
    db.absence.findMany.mockResolvedValue([ROW])
    db.absence.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: 42 }, 10)

    expect(released.absencesKept).toBe(1)
    expect(db.absence.updateMany).toHaveBeenCalledWith({
      where: { congregationId: 10, accountId: 7, memberId: null },
      data: { memberId: 42, accountId: null },
    })
    expect(refreshConflictFlags).toHaveBeenCalledWith(db, 42, ROW.startDate, ROW.endDate, 10)
  })
})
