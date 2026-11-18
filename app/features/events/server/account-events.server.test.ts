import { beforeEach, describe, expect, it, vi } from 'vitest'

const { releaseAccountEvents, AccountHasAbsencesError } = await import('./account-events.server')

const db = {
  event: { findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
}

const ABSENCE = { id: 31, startDate: new Date('2027-01-12T00:00:00Z'), endDate: new Date('2027-01-14T22:59:00Z') }

beforeEach(() => {
  vi.resetAllMocks()
  db.event.findMany.mockResolvedValue([])
  db.event.deleteMany.mockResolvedValue({ count: 0 })
  db.event.updateMany.mockResolvedValue({ count: 0 })
})

describe('releaseAccountEvents', () => {
  it('deletes the absences of an account without a record and clears its author elsewhere', async () => {
    db.event.findMany.mockResolvedValue([ABSENCE])
    db.event.deleteMany.mockResolvedValue({ count: 1 })
    db.event.updateMany.mockResolvedValue({ count: 2 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: null }, 10)

    expect(released).toEqual({ absencesDeleted: [ABSENCE], eventsUnattributed: 2 })
    expect(db.event.deleteMany).toHaveBeenCalledWith({ where: { congregationId: 10, id: { in: [31] } } })
    expect(db.event.updateMany).toHaveBeenCalledWith({
      where: { congregationId: 10, createdById: 7 },
      data: { createdById: null },
    })
  })

  it('refuses, writing nothing, an account linked to a record that has absences', async () => {
    db.event.findMany.mockResolvedValue([ABSENCE])

    await expect(releaseAccountEvents(db as never, { id: 7, memberId: 42 }, 10)).rejects.toBeInstanceOf(
      AccountHasAbsencesError,
    )
    expect(db.event.deleteMany).not.toHaveBeenCalled()
    expect(db.event.updateMany).not.toHaveBeenCalled()
  })

  it('only clears the author of an account linked to a record without absences', async () => {
    db.event.updateMany.mockResolvedValue({ count: 1 })

    const released = await releaseAccountEvents(db as never, { id: 7, memberId: 42 }, 10)

    expect(released).toEqual({ absencesDeleted: [], eventsUnattributed: 1 })
    expect(db.event.deleteMany).not.toHaveBeenCalled()
  })
})
