import { beforeEach, describe, expect, it, vi } from 'vitest'

const refreshConflictFlags = vi.fn()
vi.mock('~/features/events/server/refresh-conflict-flags.server', () => ({
  refreshConflictFlags: (...args: unknown[]) => refreshConflictFlags(...args),
}))

const { releaseAccountEvents } = await import('./account-events.server')

const db = {
  event: { findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
  absence: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
}

const ABSENCE = {
  id: 31,
  startDate: new Date('2027-01-12T00:00:00Z'),
  endDate: new Date('2027-01-14T22:59:00Z'),
  description: 'Vacances',
  createdAt: new Date('2026-12-01T08:00:00Z'),
}

beforeEach(() => {
  vi.resetAllMocks()
  db.event.findMany.mockResolvedValue([])
  db.event.deleteMany.mockResolvedValue({ count: 0 })
  db.event.updateMany.mockResolvedValue({ count: 0 })
  db.absence.findMany.mockResolvedValue([])
  db.absence.createMany.mockResolvedValue({ count: 0 })
  db.absence.updateMany.mockResolvedValue({ count: 0 })
  db.absence.deleteMany.mockResolvedValue({ count: 0 })
})

describe('releaseAccountEvents', () => {
  // Every row goes, with its event or without one (written alone when the congregation has no day-off template), and
  // the audit trail lists them all.
  it('deletes the absences of an account without a record and clears its author elsewhere', async () => {
    const alone = { id: 6, startDate: new Date('2027-02-01T00:00:00Z'), endDate: new Date('2027-02-02T22:59:00Z') }
    db.event.findMany.mockResolvedValue([ABSENCE])
    db.event.deleteMany.mockResolvedValue({ count: 1 })
    db.event.updateMany.mockResolvedValue({ count: 2 })
    db.absence.findMany.mockResolvedValue([{ id: 5, startDate: ABSENCE.startDate, endDate: ABSENCE.endDate }, alone])

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: null }, 10)

    expect(released).toEqual({
      absencesDeleted: [{ id: 5, startDate: ABSENCE.startDate, endDate: ABSENCE.endDate }, alone],
      absencesKept: 0,
      eventsUnattributed: 2,
    })
    expect(db.event.deleteMany).toHaveBeenCalledWith({ where: { congregationId: 10, id: { in: [31] } } })
    expect(db.absence.deleteMany).toHaveBeenCalledWith({ where: { congregationId: 10, accountId: 7 } })
    expect(db.absence.updateMany).not.toHaveBeenCalled()
    expect(db.event.updateMany).toHaveBeenCalledWith({
      where: { congregationId: 10, createdById: 7 },
      data: { createdById: null },
    })
  })

  // The absences are the person's: they stay on the record, which every list reads them by. Only their day-off events
  // go, and the rows stop naming the account.
  it('keeps the absences of an account linked to a record, on the record, and deletes their events', async () => {
    db.event.findMany.mockResolvedValue([ABSENCE])
    db.absence.findMany.mockResolvedValueOnce([{ legacyEventId: 31 }]).mockResolvedValueOnce([])
    db.absence.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: 42 }, 10)

    expect(released).toEqual({ absencesDeleted: [], absencesKept: 1, eventsUnattributed: 0 })
    expect(db.absence.createMany).not.toHaveBeenCalled()
    expect(db.event.deleteMany).toHaveBeenCalledWith({ where: { congregationId: 10, id: { in: [31] } } })
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
    const range = { startDate: new Date('2027-02-01T00:00:00Z'), endDate: new Date('2027-02-02T22:59:00Z') }
    db.absence.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([range])
    db.absence.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: 42 }, 10)

    expect(released.absencesKept).toBe(1)
    expect(db.absence.updateMany).toHaveBeenCalledWith({
      where: { congregationId: 10, accountId: 7, memberId: null },
      data: { memberId: 42, accountId: null },
    })
    expect(refreshConflictFlags).toHaveBeenCalledWith(db, 42, range.startDate, range.endDate, 10)
  })

  // A day-off the previous image wrote alone during the rollout would be lost with its event: it gets its row, on the
  // record, first — only the one without, next to one that has its row.
  it('gives a day-off without its Absence row one on the record before deleting the event', async () => {
    const other = { ...ABSENCE, id: 32, startDate: new Date('2027-03-01T00:00:00Z') }
    db.event.findMany.mockResolvedValue([ABSENCE, other])
    db.absence.findMany.mockResolvedValueOnce([{ legacyEventId: 32 }]).mockResolvedValueOnce([])
    db.absence.createMany.mockResolvedValue({ count: 1 })
    db.absence.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: 42 }, 10)

    expect(db.absence.createMany).toHaveBeenCalledWith({
      data: [
        {
          startDate: ABSENCE.startDate,
          endDate: ABSENCE.endDate,
          note: 'Vacances',
          memberId: 42,
          accountId: null,
          legacyEventId: 31,
          createdAt: ABSENCE.createdAt,
          congregationId: 10,
        },
      ],
    })
    expect(db.absence.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.event.deleteMany.mock.invocationCallOrder[0],
    )
    expect(released.absencesKept).toBe(2)
    expect(db.event.deleteMany).toHaveBeenCalledWith({ where: { congregationId: 10, id: { in: [31, 32] } } })
    // The record had no row for it: its assignments on those days are flagged now.
    expect(refreshConflictFlags).toHaveBeenCalledWith(db, 42, ABSENCE.startDate, ABSENCE.endDate, 10)
  })

  it('only clears the author of an account linked to a record without absences', async () => {
    db.event.updateMany.mockResolvedValue({ count: 1 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: 42 }, 10)

    expect(released).toEqual({ absencesDeleted: [], absencesKept: 0, eventsUnattributed: 1 })
    expect(db.event.deleteMany).not.toHaveBeenCalled()
  })
})
