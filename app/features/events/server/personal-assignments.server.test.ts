import { describe, expect, it, vi } from 'vitest'
import { getPersonalAssignments } from './personal-assignments.server'

function makeDb(rows: { parts?: unknown[]; serviceParts?: unknown[]; daysOff?: unknown[]; memberId?: number }) {
  // Mirror the new id-resolution: getPersonalAssignments looks up the linked
  // member id from the UserAccount before issuing member-bound queries.
  return {
    userAccount: { findUnique: vi.fn().mockResolvedValue({ memberId: rows.memberId ?? 42 }) },
    eventPart: { findMany: vi.fn().mockResolvedValue(rows.parts ?? []) },
    eventServicePart: { findMany: vi.fn().mockResolvedValue(rows.serviceParts ?? []) },
    event: { findMany: vi.fn().mockResolvedValue(rows.daysOff ?? []) },
  } as never
}

describe('getPersonalAssignments', () => {
  const since = new Date('2026-02-01T00:00:00Z')

  it('queries each source with the user id and time horizon', async () => {
    const db = makeDb({})
    await getPersonalAssignments(db, 42, since)

    const partsCall = (db as never as { eventPart: { findMany: { mock: { calls: unknown[][] } } } }).eventPart.findMany
      .mock.calls[0][0] as { where: Record<string, unknown> }
    // Personal calendar / ICS is publisher-facing — drafts must not appear
    // there. Only released events flow through.
    expect(partsCall.where).toMatchObject({
      OR: [{ assigneeId: 42 }, { assistantId: 42 }],
      event: { startDate: { gte: since }, status: 'released' },
    })

    const rolesCall = (db as never as { eventServicePart: { findMany: { mock: { calls: unknown[][] } } } })
      .eventServicePart.findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(rolesCall.where).toMatchObject({
      assigneeId: 42,
      event: { startDate: { gte: since }, status: 'released' },
    })

    const eventsCall = (db as never as { event: { findMany: { mock: { calls: unknown[][] } } } }).event.findMany.mock
      .calls[0][0] as { where: Record<string, unknown> }
    expect(eventsCall.where).toMatchObject({
      createdById: 42,
      template: { key: 'day-off' },
      startDate: { gte: since },
    })
  })

  it('marks days off as all-day events with end-date shifted by one day', async () => {
    const startDate = new Date('2026-04-10T00:00:00Z')
    const endDate = new Date('2026-04-12T00:00:00Z')
    const db = makeDb({
      daysOff: [
        {
          id: 5,
          name: 'Absence',
          startDate,
          endDate,
          updatedAt: new Date('2026-04-01T00:00:00Z'),
        },
      ],
    })

    const items = await getPersonalAssignments(db, 42, since)

    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('day-off')
    expect(items[0].allDay).toBe(true)
    expect(items[0].start).toEqual(startDate)
    expect(items[0].end.getUTCDate()).toBe(13)
    expect(items[0].uid).toBe('day-off-5')
  })

  it('distinguishes part assignee from assistant in UID and kind', async () => {
    const event = {
      name: 'Réunion',
      startDate: new Date('2026-04-10T18:00:00Z'),
      endDate: new Date('2026-04-10T20:00:00Z'),
    }
    const db = makeDb({
      parts: [
        {
          id: 10,
          assigneeId: 42,
          assistantId: 7,
          name: 'Trésors',
          section: 'Section 1',
          topic: '',
          note: '',
          updatedAt: new Date(),
          event,
        },
        {
          id: 11,
          assigneeId: 99,
          assistantId: 42,
          name: 'Lecture',
          section: 'Section 2',
          topic: '',
          note: '',
          updatedAt: new Date(),
          event,
        },
      ],
    })

    const items = await getPersonalAssignments(db, 42, since)

    expect(items.find(i => i.uid === 'programme-part-assignee-10')?.kind).toBe('programme-part')
    expect(items.find(i => i.uid === 'programme-part-assistant-11')?.kind).toBe('programme-part-assistant')
  })

  it('flattens all sources into one list', async () => {
    const event = {
      name: 'Réunion',
      startDate: new Date('2026-04-10T18:00:00Z'),
      endDate: new Date('2026-04-10T20:00:00Z'),
    }
    const db = makeDb({
      parts: [
        {
          id: 1,
          assigneeId: 42,
          assistantId: null,
          name: 'P',
          section: '',
          topic: '',
          note: '',
          updatedAt: new Date(),
          event,
        },
      ],
      serviceParts: [{ id: 2, assigneeId: 42, name: 'Sono', note: '', updatedAt: new Date(), event }],
      daysOff: [
        {
          id: 3,
          name: 'Absence',
          startDate: new Date('2026-04-12T00:00:00Z'),
          endDate: new Date('2026-04-12T00:00:00Z'),
          updatedAt: new Date(),
        },
      ],
    })

    const items = await getPersonalAssignments(db, 42, since)
    expect(items).toHaveLength(3)
    expect(items.map(i => i.kind).sort()).toEqual(['day-off', 'programme-part', 'programme-service-role'])
  })
})
