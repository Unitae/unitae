import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventPart: { findMany: vi.fn() },
    eventServiceRole: { findMany: vi.fn() },
  },
}))

const { getResponsibleConflicts } = await import('./get-responsible-conflicts.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.eventPart.findMany).mockResolvedValue([] as never)
  vi.mocked(db.eventServiceRole.findMany).mockResolvedValue([] as never)
})

describe('getResponsibleConflicts', () => {
  it('returns zero count with no names when no conflicts exist', async () => {
    const result = await getResponsibleConflicts(db, 42, false)
    expect(result).toEqual({ count: 0, absenteeNames: [], totalAbsenteesCount: 0 })
  })

  // Non-manager users only see conflicts on templates they are the
  // responsible for. The join goes through
  // event.template.responsibles.some.userId.
  it('scopes the query to templates the user is responsible for (non-manager)', async () => {
    const userId = 100
    await getResponsibleConflicts(db, userId, false)

    const partCall = vi.mocked(db.eventPart.findMany).mock.calls[0][0]
    const partWhere = partCall?.where as Record<string, unknown>
    expect(partWhere.hasConflict).toBe(true)
    expect(partWhere.event).toEqual({
      startDate: { gte: expect.any(Date) },
      status: 'released',
      template: { responsibles: { some: { userId } } },
    })
  })

  it('scopes the service-role query with the same template filter (non-manager)', async () => {
    const userId = 100
    await getResponsibleConflicts(db, userId, false)

    const serviceCall = vi.mocked(db.eventServiceRole.findMany).mock.calls[0][0]
    const serviceWhere = serviceCall?.where as Record<string, unknown>
    expect(serviceWhere.event).toEqual({
      startDate: { gte: expect.any(Date) },
      status: 'released',
      template: { responsibles: { some: { userId } } },
    })
  })

  // ProgramManager sees everything — including untemplated events (which
  // have no responsible relation at all) — but still only released ones.
  // Draft-event conflicts are not urgent enough for the dashboard; managers
  // see them on the events list amber badge and get blocked at release.
  it('drops the template filter for ProgramManager users but keeps the released filter', async () => {
    await getResponsibleConflicts(db, 100, true)

    const partCall = vi.mocked(db.eventPart.findMany).mock.calls[0][0]
    const partWhere = partCall?.where as Record<string, unknown>
    expect(partWhere.event).toEqual({ startDate: { gte: expect.any(Date) }, status: 'released' })
    expect(partWhere.event).not.toHaveProperty('template')
  })

  it('only considers upcoming events (startDate >= now)', async () => {
    await getResponsibleConflicts(db, 100, true)

    const [partCall] = vi.mocked(db.eventPart.findMany).mock.calls[0]
    const event = (partCall as { where: { event: { startDate: { gte: Date } } } }).where.event
    expect(event.startDate.gte.getTime()).toBeGreaterThan(Date.now() - 5000)
  })

  // Two rows for the same member on the same event (one row lists them as
  // assignee, another where they're the assistant on a different part of
  // the same event) collapse to one conflict. Otherwise a member appearing
  // twice double-counts the badge.
  it('dedupes by (memberId, eventId) when computing count', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        eventId: 1,
        assigneeId: 100,
        assignee: { firstname: 'Alice', lastname: 'Dupont' },
        assistantId: null,
        assistant: null,
      },
      {
        eventId: 1,
        assigneeId: null,
        assignee: null,
        assistantId: 100,
        assistant: { firstname: 'Alice', lastname: 'Dupont' },
      },
    ] as never)

    const result = await getResponsibleConflicts(db, 999, true)
    expect(result.count).toBe(1)
    expect(result.absenteeNames).toEqual(['Alice Dupont'])
  })

  it('counts one conflict per (member × event) — same member on two events counts twice', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        eventId: 1,
        assigneeId: 100,
        assignee: { firstname: 'Alice', lastname: 'Dupont' },
        assistantId: null,
        assistant: null,
      },
      {
        eventId: 2,
        assigneeId: 100,
        assignee: { firstname: 'Alice', lastname: 'Dupont' },
        assistantId: null,
        assistant: null,
      },
    ] as never)

    const result = await getResponsibleConflicts(db, 999, true)
    expect(result.count).toBe(2)
    expect(result.absenteeNames).toEqual(['Alice Dupont'])
  })

  it('merges names across part and service assignments (deduped)', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        eventId: 1,
        assigneeId: 100,
        assignee: { firstname: 'Alice', lastname: 'Dupont' },
        assistantId: null,
        assistant: null,
      },
    ] as never)
    vi.mocked(db.eventServiceRole.findMany).mockResolvedValue([
      { eventId: 2, assigneeId: 100, assignee: { firstname: 'Alice', lastname: 'Dupont' } },
    ] as never)

    const result = await getResponsibleConflicts(db, 999, true)
    expect(result.absenteeNames).toEqual(['Alice Dupont'])
    expect(result.count).toBe(2)
  })

  it('caps absenteeNames at 3, sorted alphabetically; count still reflects all conflicts', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        eventId: 1,
        assigneeId: 100,
        assignee: { firstname: 'Charlie', lastname: 'C' },
        assistantId: null,
        assistant: null,
      },
      {
        eventId: 2,
        assigneeId: 200,
        assignee: { firstname: 'Alice', lastname: 'A' },
        assistantId: null,
        assistant: null,
      },
      {
        eventId: 3,
        assigneeId: 300,
        assignee: { firstname: 'Bob', lastname: 'B' },
        assistantId: null,
        assistant: null,
      },
      {
        eventId: 4,
        assigneeId: 400,
        assignee: { firstname: 'Diane', lastname: 'D' },
        assistantId: null,
        assistant: null,
      },
      {
        eventId: 5,
        assigneeId: 500,
        assignee: { firstname: 'Eve', lastname: 'E' },
        assistantId: null,
        assistant: null,
      },
    ] as never)

    const result = await getResponsibleConflicts(db, 999, true)
    expect(result.absenteeNames).toEqual(['Alice A', 'Bob B', 'Charlie C'])
    expect(result.count).toBe(5)
    expect(result.totalAbsenteesCount).toBe(5)
  })

  // A row can arrive with a null assigneeId when the assignment slot is
  // held but no member is booked yet, or via an integrity issue where the
  // related member could not be joined. Either way it must not corrupt the
  // aggregation. This pin guards the `record()` null-skip at line 66.
  it('silently skips rows whose assignee is null (no assignee booked or join failed)', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        eventId: 1,
        assigneeId: null,
        assignee: null,
        assistantId: null,
        assistant: null,
      },
      {
        eventId: 2,
        assigneeId: 100,
        assignee: { firstname: 'Alice', lastname: 'Dupont' },
        assistantId: null,
        assistant: null,
      },
    ] as never)

    const result = await getResponsibleConflicts(db, 999, true)
    expect(result.count).toBe(1)
    expect(result.absenteeNames).toEqual(['Alice Dupont'])
    expect(result.totalAbsenteesCount).toBe(1)
  })

  // A part row can carry both an assignee and an assistant — both are
  // potentially the absentee, so both are enumerated. Downstream the
  // responsible sees them and can click through for detail.
  it('includes both assignee and assistant of a part row', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        eventId: 1,
        assigneeId: 100,
        assignee: { firstname: 'Speaker', lastname: 'One' },
        assistantId: 200,
        assistant: { firstname: 'Reader', lastname: 'Two' },
      },
    ] as never)

    const result = await getResponsibleConflicts(db, 999, true)
    expect(result.absenteeNames.sort()).toEqual(['Reader Two', 'Speaker One'])
  })
})
