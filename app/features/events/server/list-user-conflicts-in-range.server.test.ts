import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', async () => {
  const { withItemMock } = await import('~/tests/helpers/item-mock')
  return {
    unscopedDb: withItemMock({
      eventPart: { findMany: vi.fn() },
      eventServicePart: { findMany: vi.fn() },
    }),
  }
})

const { listUserConflictsInRange } = await import('./list-user-conflicts-in-range.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.eventPart.findMany).mockResolvedValue([] as never)
  vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)
})

describe('listUserConflictsInRange', () => {
  it('returns an empty array when the member has no conflicting assignments', async () => {
    const result = await listUserConflictsInRange(db, 42, new Date(2026, 6, 1), new Date(2026, 6, 3))
    expect(result).toEqual([])
  })

  // Filters must be by memberId (assigneeId / assistantId reference Member.id),
  // hasConflict: true, event range overlap, and a published schedule. Drafts are
  // the manager's scratch space and must never surface to consumers of this
  // query (days-off modal, responsibles dashboard card).
  it('filters part assignments by memberId, hasConflict, event overlap, and published schedule', async () => {
    const memberId = 5000
    const start = new Date(2026, 6, 1)
    const end = new Date(2026, 6, 3)

    await listUserConflictsInRange(db, memberId, start, end)

    const call = vi.mocked(db.eventPart.findMany).mock.calls[0][0]
    const where = call?.where as Record<string, unknown>
    expect(where.hasConflict).toBe(true)
    expect(where.OR).toEqual([{ assigneeId: memberId }, { assistantId: memberId }])
    expect(where.schedule).toEqual({ status: 'published' })
    expect(where.event).toEqual({ startDate: { lte: end }, endDate: { gte: start } })
  })

  it('filters service-role assignments by memberId as assignee and published schedule', async () => {
    const memberId = 5000
    await listUserConflictsInRange(db, memberId, new Date(2026, 6, 1), new Date(2026, 6, 3))

    const call = vi.mocked(db.eventServicePart.findMany).mock.calls[0][0]
    const where = call?.where as Record<string, unknown>
    expect(where.hasConflict).toBe(true)
    expect(where.assigneeId).toBe(memberId)
    expect(where.schedule).toEqual({ status: 'published' })
  })

  it('names the responsible of the item’s own schedule template, through accountDisplayName', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        name: 'Discours public',
        event: {
          startDate: new Date(2026, 6, 5),
        },
        schedule: {
          scheduleTemplate: {
            responsibleRole: {
              key: 'responsable-vcm',
              name: 'Responsable VCM',
              members: [{ user: { firstname: 'Jean', lastname: 'Dupont', member: null } }],
              memberAssignments: [],
            },
          },
        },
      },
    ] as never)

    const result = await listUserConflictsInRange(db, 5000, new Date(2026, 6, 1), new Date(2026, 6, 10))

    expect(result).toEqual([
      { eventDate: new Date(2026, 6, 5), assignmentName: 'Discours public', responsibleName: 'Jean Dupont' },
    ])
  })

  // Prefers the linked Member's name over the account fallback fields, per
  // accountDisplayName semantics — matches what shows up everywhere else in
  // the app.
  it("uses the responsible's linked Member name when present", async () => {
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([
      {
        name: 'Micros',
        event: {
          startDate: new Date(2026, 6, 5),
        },
        schedule: {
          scheduleTemplate: {
            responsibleRole: {
              key: 'responsable-vcm',
              name: 'Responsable VCM',
              members: [
                {
                  user: {
                    firstname: 'account-first',
                    lastname: 'account-last',
                    member: { firstname: 'Pierre', lastname: 'Martin' },
                  },
                },
              ],
              memberAssignments: [],
            },
          },
        },
      },
    ] as never)

    const result = await listUserConflictsInRange(db, 5000, new Date(2026, 6, 1), new Date(2026, 6, 10))

    expect(result[0].responsibleName).toBe('Pierre Martin')
  })

  it('returns responsibleName as null for a schedule without a template', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        name: 'Custom part',
        event: {
          startDate: new Date(2026, 6, 5),
        },
        schedule: { scheduleTemplate: null },
      },
    ] as never)

    const result = await listUserConflictsInRange(db, 5000, new Date(2026, 6, 1), new Date(2026, 6, 10))

    expect(result[0].responsibleName).toBeNull()
  })

  // When a templated event has no responsible assigned yet, the UI still
  // shows the generic fallback wording — the query surfaces null the same
  // way as for untemplated events.
  it('returns responsibleName as null when the schedule template has no responsible', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        name: 'Prière',
        event: {
          startDate: new Date(2026, 6, 5),
        },
        schedule: { scheduleTemplate: { responsibleRole: null } },
      },
    ] as never)

    const result = await listUserConflictsInRange(db, 5000, new Date(2026, 6, 1), new Date(2026, 6, 10))

    expect(result[0].responsibleName).toBeNull()
  })

  // One responsible role, but a role can seat several people — each must surface so the
  // absentee knows who to reach. Sorted alphabetically so the modal reads the same across
  // renders.
  it('joins every holder of the responsible role, sorted alphabetically', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        name: 'Discours public',
        event: {
          startDate: new Date(2026, 6, 5),
        },
        schedule: {
          scheduleTemplate: {
            responsibleRole: {
              key: 'responsable-vcm',
              name: 'Responsable VCM',
              members: [
                { user: { firstname: 'Zoé', lastname: 'Petit', member: null } },
                { user: { firstname: 'Alain', lastname: 'Roux', member: null } },
              ],
              memberAssignments: [],
            },
          },
        },
      },
    ] as never)

    const result = await listUserConflictsInRange(db, 5000, new Date(2026, 6, 1), new Date(2026, 6, 10))

    expect(result[0].responsibleName).toBe('Alain Roux, Zoé Petit')
  })

  // Since roles given by hand moved onto publisher records (2.12), most holders sit there, not on an account.
  it('names the holders seated through their publisher record too, once each', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        name: 'Discours public',
        event: {
          startDate: new Date(2026, 6, 5),
        },
        schedule: {
          scheduleTemplate: {
            responsibleRole: {
              key: 'elder',
              name: null,
              members: [{ user: { firstname: 'Paul', lastname: 'MARTIN', member: null } }],
              memberAssignments: [
                { member: { firstname: 'Jean', lastname: 'DURAND' } },
                { member: { firstname: 'Paul', lastname: 'MARTIN' } },
              ],
            },
          },
        },
      },
    ] as never)

    const result = await listUserConflictsInRange(db, 5000, new Date(2026, 6, 1), new Date(2026, 6, 10))

    expect(result[0].responsibleName).toBe('Jean DURAND, Paul MARTIN')
  })

  // A responsible role nobody is seated in. Naming the role still beats the generic
  // no-responsible line: it tells the absentee which post to chase, and it makes the gap
  // visible instead of silently reading as "no responsible assigned".
  it('falls back to the role name when the responsible role has no holders', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        name: 'Discours public',
        event: { startDate: new Date(2026, 6, 5) },
        schedule: {
          scheduleTemplate: {
            responsibleRole: { key: 'responsable-vcm', name: 'Responsable VCM', members: [], memberAssignments: [] },
          },
        },
      },
    ] as never)

    const result = await listUserConflictsInRange(db, 5000, new Date(2026, 6, 1), new Date(2026, 6, 10))

    expect(result[0].responsibleName).toBe('Responsable VCM')
  })

  it('merges part + service conflicts and sorts by eventDate ascending', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        name: 'Later part',
        event: { startDate: new Date(2026, 6, 10) },
        schedule: { scheduleTemplate: null },
      },
      {
        name: 'Earlier part',
        event: { startDate: new Date(2026, 6, 2) },
        schedule: { scheduleTemplate: null },
      },
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([
      {
        name: 'Middle service',
        event: { startDate: new Date(2026, 6, 5) },
        schedule: { scheduleTemplate: null },
      },
    ] as never)

    const result = await listUserConflictsInRange(db, 5000, new Date(2026, 6, 1), new Date(2026, 6, 15))

    expect(result.map((r: { assignmentName: string }) => r.assignmentName)).toEqual([
      'Earlier part',
      'Middle service',
      'Later part',
    ])
  })
})
