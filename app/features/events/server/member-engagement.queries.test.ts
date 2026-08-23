import { describe, expect, it, vi } from 'vitest'

import { findUpcomingAbsencesForMember, findUpcomingAssignmentsForMember } from './member-engagement.queries'

const NOW = new Date(2026, 7, 23)
const CONGREGATION_ID = 42
const MEMBER_ID = 7

describe('findUpcomingAssignmentsForMember', () => {
  it('merges part and service assignments sorted by event date', async () => {
    const db = {
      eventPart: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            name: 'Discours public',
            event: { id: 10, name: 'Réunion du week-end', startDate: new Date(2026, 8, 5) },
          },
        ]),
      },
      eventServicePart: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 2,
            name: 'Sonorisation',
            event: { id: 11, name: 'Réunion de semaine', startDate: new Date(2026, 8, 1) },
          },
        ]),
      },
    }

    const assignments = await findUpcomingAssignmentsForMember(db as never, MEMBER_ID, CONGREGATION_ID, NOW)

    expect(assignments.map(a => a.partName)).toEqual(['Sonorisation', 'Discours public'])
    expect(assignments[0]).toMatchObject({
      eventId: 11,
      eventName: 'Réunion de semaine',
      partName: 'Sonorisation',
    })
    // Only released events count, and both the assignee and assistant slots.
    const partWhere = db.eventPart.findMany.mock.calls[0][0].where
    expect(partWhere.OR).toEqual([{ assigneeId: MEMBER_ID }, { assistantId: MEMBER_ID }])
    expect(partWhere.event.congregationId).toBe(CONGREGATION_ID)
  })

  it('caps the merged list at five entries', async () => {
    const part = (id: number, day: number) => ({
      id,
      name: `Part ${id}`,
      event: { id: 100 + id, name: 'Réunion', startDate: new Date(2026, 8, day) },
    })
    const db = {
      eventPart: { findMany: vi.fn().mockResolvedValue([part(1, 1), part(2, 2), part(3, 3), part(4, 4)]) },
      eventServicePart: { findMany: vi.fn().mockResolvedValue([part(5, 5), part(6, 6)]) },
    }

    const assignments = await findUpcomingAssignmentsForMember(db as never, MEMBER_ID, CONGREGATION_ID, NOW)

    expect(assignments).toHaveLength(5)
  })
})

describe('findUpcomingAbsencesForMember', () => {
  it('queries day-off events created by the member linked account', async () => {
    const db = {
      event: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 20, startDate: new Date(2026, 8, 10), endDate: new Date(2026, 8, 14) }]),
      },
    }

    const absences = await findUpcomingAbsencesForMember(db as never, MEMBER_ID, CONGREGATION_ID, NOW)

    expect(absences).toEqual([{ id: 20, startDate: new Date(2026, 8, 10), endDate: new Date(2026, 8, 14) }])
    const where = db.event.findMany.mock.calls[0][0].where
    expect(where.congregationId).toBe(CONGREGATION_ID)
    expect(where.createdBy).toEqual({ member: { id: MEMBER_ID } })
  })
})
