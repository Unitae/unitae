import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  it('deletes the absences of an account without a record and clears its author elsewhere', async () => {
    db.event.findMany.mockResolvedValue([ABSENCE])
    db.event.deleteMany.mockResolvedValue({ count: 1 })
    db.event.updateMany.mockResolvedValue({ count: 2 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: null }, 10)

    expect(released).toEqual({
      absencesDeleted: [{ id: 31, startDate: ABSENCE.startDate, endDate: ABSENCE.endDate }],
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
    db.absence.findMany.mockResolvedValue([{ legacyEventId: 31 }])
    db.absence.updateMany.mockResolvedValue({ count: 1 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: 42 }, 10)

    expect(released).toEqual({ absencesDeleted: [], absencesKept: 1, eventsUnattributed: 0 })
    expect(db.absence.createMany).not.toHaveBeenCalled()
    expect(db.event.deleteMany).toHaveBeenCalledWith({ where: { congregationId: 10, id: { in: [31] } } })
    expect(db.absence.updateMany).toHaveBeenCalledWith({
      where: { congregationId: 10, accountId: 7, memberId: { not: null } },
      data: { accountId: null },
    })
    // Rows on no record have no one else to belong to: they go with the account.
    expect(db.absence.deleteMany).toHaveBeenCalledWith({ where: { congregationId: 10, accountId: 7, memberId: null } })
  })

  // A day-off written without its row (by a version before the absences table) would be lost with its event: it gets
  // its row, on the record, first.
  it('gives a day-off without its Absence row one on the record before deleting the event', async () => {
    db.event.findMany.mockResolvedValue([ABSENCE])

    await releaseAccountEvents(db as never, { id: 7, memberId: 42 }, 10)

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
  })

  it('only clears the author of an account linked to a record without absences', async () => {
    db.event.updateMany.mockResolvedValue({ count: 1 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: 42 }, 10)

    expect(released).toEqual({ absencesDeleted: [], absencesKept: 0, eventsUnattributed: 1 })
    expect(db.event.deleteMany).not.toHaveBeenCalled()
  })
})
