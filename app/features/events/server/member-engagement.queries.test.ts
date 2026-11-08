import { describe, expect, it, vi } from 'vitest'

import type { CongregationId, MemberId } from '~/shared/types/branded'

import {
  findLastAssignmentsForMembers,
  findNextAbsencesForMembers,
  findUpcomingAbsencesForMember,
  findUpcomingAssignmentsForMember,
} from './member-engagement.queries'

const NOW = new Date(2026, 7, 23)
const CONGREGATION_ID = 42 as CongregationId
const MEMBER_ID = 7 as MemberId

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

  it('keeps a deterministic order when a part and a service share the same date', async () => {
    const sameDay = new Date(2026, 8, 3)
    const db = {
      eventPart: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 1, name: 'Partie', event: { id: 10, name: 'R', startDate: sameDay } }]),
      },
      eventServicePart: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 2, name: 'Sono', event: { id: 11, name: 'R', startDate: sameDay } }]),
      },
    }

    const assignments = await findUpcomingAssignmentsForMember(db as never, MEMBER_ID, CONGREGATION_ID, NOW)

    // Stable sort: on a date tie, programme parts precede service parts.
    expect(assignments.map(a => a.key)).toEqual(['part-1', 'service-2'])
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

describe('findLastAssignmentsForMembers', () => {
  it('keeps each member’s latest past part, as assignee, assistant or on a service part', async () => {
    const event = (day: number) => ({ startDate: new Date(2026, 7, day) })
    const db = {
      eventPart: {
        findMany: vi.fn().mockResolvedValue([
          { name: 'Discours', assigneeId: 1, assistantId: null, event: event(20) },
          { name: 'Lecture de la Bible', assigneeId: 1, assistantId: null, event: event(6) },
          { name: 'Engage la conversation', assigneeId: 3, assistantId: 2, event: event(13) },
        ]),
      },
      eventServicePart: {
        findMany: vi.fn().mockResolvedValue([{ name: 'Sonorisation', assigneeId: 2, event: event(16) }]),
      },
    }

    const last = await findLastAssignmentsForMembers(db as never, [1, 2, 3] as MemberId[], CONGREGATION_ID, NOW)

    expect(last.get(1 as MemberId)).toEqual({ partName: 'Discours', date: new Date(2026, 7, 20) })
    expect(last.get(2 as MemberId)).toEqual({ partName: 'Sonorisation', date: new Date(2026, 7, 16) })
    expect(last.get(3 as MemberId)).toEqual({ partName: 'Engage la conversation', date: new Date(2026, 7, 13) })
  })

  it('asks nothing for an empty list', async () => {
    const db = { eventPart: { findMany: vi.fn() }, eventServicePart: { findMany: vi.fn() } }
    expect((await findLastAssignmentsForMembers(db as never, [], CONGREGATION_ID, NOW)).size).toBe(0)
  })
})

describe('findNextAbsencesForMembers', () => {
  it('keeps each member’s earliest absence still to come or under way', async () => {
    const db = {
      event: {
        findMany: vi.fn().mockResolvedValue([
          { startDate: new Date(2026, 7, 21), endDate: new Date(2026, 7, 25), createdBy: { member: { id: 4 } } },
          { startDate: new Date(2026, 9, 1), endDate: new Date(2026, 9, 8), createdBy: { member: { id: 4 } } },
          { startDate: new Date(2026, 8, 3), endDate: new Date(2026, 8, 4), createdBy: { member: { id: 5 } } },
        ]),
      },
    }

    const next = await findNextAbsencesForMembers(db as never, [4, 5, 6] as MemberId[], CONGREGATION_ID, NOW)

    expect(next.get(4 as MemberId)).toEqual({ startDate: new Date(2026, 7, 21), endDate: new Date(2026, 7, 25) })
    expect(next.get(5 as MemberId)).toEqual({ startDate: new Date(2026, 8, 3), endDate: new Date(2026, 8, 4) })
    expect(next.has(6 as MemberId)).toBe(false)
  })
})
