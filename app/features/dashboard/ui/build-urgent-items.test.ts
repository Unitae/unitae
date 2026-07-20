import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

vi.mock('~/i18n/paraglide/messages', () => ({
  dashboard_urgent_territory_overdue: ({ number }: { number: string }) => `Territory ${number} — overdue`,
  dashboard_urgent_territory_due_soon: ({ number }: { number: string }) => `Territory ${number} — due soon`,
  dashboard_urgent_assignment_soon: ({ name, eventName }: { name: string; eventName: string }) =>
    `${name} — ${eventName}`,
  dashboard_urgent_service_role_soon: ({ name, eventName }: { name: string; eventName: string }) =>
    `${name} — ${eventName}`,
  dashboard_urgent_dayoff_conflict: ({ name }: { name: string }) => `Conflict with ${name}`,
  dashboard_urgent_unread_documents: ({ count }: { count: string }) => `${count} unread documents`,
  dashboard_urgent_responsible_conflict_singular: ({ names }: { names: string }) => `1 responsible conflict: ${names}`,
  dashboard_urgent_responsible_conflict_plural: ({ count, names }: { count: string; names: string }) =>
    `${count} responsible conflicts: ${names}`,
  dashboard_urgent_responsible_conflict_extras: ({ count }: { count: string }) => ` (+${count} more)`,
}))

const {
  buildUrgentItems,
  urgentTerritoriesItems,
  urgentPartAssignmentItems,
  urgentServiceRoleItems,
  urgentDayoffConflictItems,
  urgentResponsibleConflictItems,
  urgentDocumentsItem,
} = await import('./build-urgent-items')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 3, 24, 10, 0, 0)) // 2026-04-24 10:00
})

// --- Helpers ---

function makeTerritory(id: number, number: string, status: 'on-time' | 'due-soon' | 'overdue', lateDate: Date) {
  return {
    id,
    startDate: new Date(2026, 0, 1),
    lateDate,
    territory: { id, number, type: TerritoryKind.Classical },
    status,
  }
}

type Person = { id: number; firstname: string; lastname: string }
type PartAssignment = {
  id: number
  name: string
  section: string
  topic: string
  order: number
  speakerLabel: string | null
  readerLabel: string | null
  assignee: Person | null
  assistant: Person | null
  viewerRole: 'speaker' | 'reader' | null
}
type ServiceRoleAssignment = { id: number; name: string; assignee: Person | null }

function makeNextMeeting(
  startDate: Date,
  {
    userPartIds = [] as number[],
    userServiceRoleIds = [] as number[],
    partAssignments = [] as PartAssignment[],
    serviceRoleAssignments = [] as ServiceRoleAssignment[],
  } = {},
) {
  return {
    id: 1,
    name: 'Réunion de semaine',
    startDate,
    endDate: new Date(startDate.getTime() + 2 * 60 * 60 * 1000), // +2h
    template: { name: 'Midweek', color: '#000' } as { name: string; color: string } | null,
    partAssignments,
    serviceRoleAssignments,
    userPartIds,
    userServiceRoleIds,
  }
}

function makeConflict(id: number, name: string, eventStartDate: Date, kind: 'part' | 'service-role' = 'part') {
  return { kind, id, name, eventStartDate }
}

// --- urgentTerritoriesItems ---

describe('urgentTerritoriesItems', () => {
  it('returns empty array for null territories', () => {
    expect(urgentTerritoriesItems(null)).toEqual([])
  })

  it('returns empty array for empty list', () => {
    expect(urgentTerritoriesItems([])).toEqual([])
  })

  it('ignores on-time territories', () => {
    const territories = [makeTerritory(1, 'T-1', 'on-time', new Date(2026, 5, 1))]
    expect(urgentTerritoriesItems(territories)).toEqual([])
  })

  it('returns overdue territories with priority 1', () => {
    const territories = [makeTerritory(1, 'T-42', 'overdue', new Date(2026, 3, 20))]
    const items = urgentTerritoriesItems(territories)
    expect(items).toHaveLength(1)
    expect(items[0].priority).toBe(1)
    expect(items[0].label).toContain('T-42')
    expect(items[0].to).toBe('/me/territories/1')
  })

  it('returns due-soon territories with priority 4', () => {
    const territories = [makeTerritory(2, 'T-7', 'due-soon', new Date(2026, 4, 1))]
    const items = urgentTerritoriesItems(territories)
    expect(items).toHaveLength(1)
    expect(items[0].priority).toBe(4)
  })

  it('returns both overdue and due-soon territories', () => {
    const territories = [
      makeTerritory(1, 'T-1', 'overdue', new Date(2026, 3, 20)),
      makeTerritory(2, 'T-2', 'due-soon', new Date(2026, 4, 1)),
      makeTerritory(3, 'T-3', 'on-time', new Date(2026, 6, 1)),
    ]
    const items = urgentTerritoriesItems(territories)
    expect(items).toHaveLength(2)
  })
})

// --- urgentPartAssignmentItems ---

describe('urgentPartAssignmentItems', () => {
  it('returns empty array for null meeting', () => {
    expect(urgentPartAssignmentItems(null)).toEqual([])
  })

  it('returns empty array when user has no part assignments', () => {
    const meeting = makeNextMeeting(new Date(2026, 3, 25), { userPartIds: [] })
    expect(urgentPartAssignmentItems(meeting)).toEqual([])
  })

  it('returns empty array when meeting is more than 3 days away', () => {
    const meeting = makeNextMeeting(new Date(2026, 3, 28), {
      userPartIds: [10],
      partAssignments: [
        {
          id: 10,
          name: 'Discours',
          section: 'main',
          topic: '',
          order: 1,
          assignee: { id: 1, firstname: 'John', lastname: 'Doe' },
          assistant: null,
          viewerRole: 'speaker',
          speakerLabel: null,
          readerLabel: null,
        },
      ],
    })
    expect(urgentPartAssignmentItems(meeting)).toEqual([])
  })

  it('returns item when meeting is within 3 days', () => {
    const meeting = makeNextMeeting(new Date(2026, 3, 26, 19, 0), {
      userPartIds: [10],
      partAssignments: [
        {
          id: 10,
          name: 'Discours',
          section: 'main',
          topic: '',
          order: 1,
          assignee: { id: 1, firstname: 'John', lastname: 'Doe' },
          assistant: null,
          viewerRole: 'speaker',
          speakerLabel: null,
          readerLabel: null,
        },
      ],
    })
    const items = urgentPartAssignmentItems(meeting)
    expect(items).toHaveLength(1)
    expect(items[0].priority).toBe(0)
    expect(items[0].to).toBe('/board')
    expect(items[0].label).toContain('Discours')
  })

  it('returns item when meeting is today', () => {
    const meeting = makeNextMeeting(new Date(2026, 3, 24, 19, 0), {
      userPartIds: [10],
      partAssignments: [
        {
          id: 10,
          name: 'Discours',
          section: 'main',
          topic: '',
          order: 1,
          assignee: { id: 1, firstname: 'John', lastname: 'Doe' },
          assistant: null,
          viewerRole: 'speaker',
          speakerLabel: null,
          readerLabel: null,
        },
      ],
    })
    expect(urgentPartAssignmentItems(meeting)).toHaveLength(1)
  })
})

// --- urgentServiceRoleItems ---

describe('urgentServiceRoleItems', () => {
  it('returns empty array for null meeting', () => {
    expect(urgentServiceRoleItems(null)).toEqual([])
  })

  it('returns empty array when user has no service roles', () => {
    const meeting = makeNextMeeting(new Date(2026, 3, 25), { userServiceRoleIds: [] })
    expect(urgentServiceRoleItems(meeting)).toEqual([])
  })

  it('returns empty array when meeting is more than 3 days away', () => {
    const meeting = makeNextMeeting(new Date(2026, 3, 28), {
      userServiceRoleIds: [5],
      serviceRoleAssignments: [{ id: 5, name: 'Son', assignee: { id: 1, firstname: 'John', lastname: 'Doe' } }],
    })
    expect(urgentServiceRoleItems(meeting)).toEqual([])
  })

  it('returns item with priority 3 when meeting is within 3 days', () => {
    const meeting = makeNextMeeting(new Date(2026, 3, 25, 19, 0), {
      userServiceRoleIds: [5],
      serviceRoleAssignments: [{ id: 5, name: 'Son', assignee: { id: 1, firstname: 'John', lastname: 'Doe' } }],
    })
    const items = urgentServiceRoleItems(meeting)
    expect(items).toHaveLength(1)
    expect(items[0].priority).toBe(3)
    expect(items[0].to).toBe('/board')
  })
})

// --- urgentDayoffConflictItems ---

describe('urgentDayoffConflictItems', () => {
  it('returns empty array when there is no conflict', () => {
    expect(urgentDayoffConflictItems(null)).toEqual([])
  })

  // A conflict on MY own assignment is red / priority 1 — it means my
  // personal calendar clashes with something I owe to the congregation, and
  // sits next to the overdue-territory tier (also red / priority 1).
  // The label surfaces the assignment name (e.g. "Discours public"), NOT
  // the event name — the event name is generic and repeats every week
  // ("Réunion de semaine"), whereas the assignment name uniquely identifies
  // which part/role is clashing with the user's absence.
  it('returns conflict item with priority 1 and destructive styling for a part assignment', () => {
    const eventStart = new Date(2026, 3, 25, 19, 0)
    const conflict = makeConflict(7, 'Discours public', eventStart, 'part')
    const items = urgentDayoffConflictItems(conflict)
    expect(items).toHaveLength(1)
    expect(items[0].priority).toBe(1)
    expect(items[0].borderClass).toContain('destructive')
    expect(items[0].iconClass).toContain('destructive')
    expect(items[0].to).toBe('/me/days-off')
    expect(items[0].label).toContain('Discours public')
    expect(items[0].key).toBe('dayoff-conflict-part-7')
    // The relative date must reflect the conflicting event, not the next meeting
    expect(items[0].relativeDate).toBe(eventStart)
  })

  it('returns conflict item for a service role assignment', () => {
    const conflict = makeConflict(5, 'Son', new Date(2026, 5, 1, 9, 30), 'service-role')
    const items = urgentDayoffConflictItems(conflict)
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('dayoff-conflict-service-role-5')
    expect(items[0].label).toContain('Son')
  })

  it('surfaces conflicts well beyond the next meeting horizon', () => {
    // Two months out — old behaviour ignored anything past the next meeting
    const conflict = makeConflict(99, 'Discours public', new Date(2026, 5, 24, 9, 0))
    const items = urgentDayoffConflictItems(conflict)
    expect(items).toHaveLength(1)
  })
})

// --- urgentResponsibleConflictItems ---

describe('urgentResponsibleConflictItems', () => {
  it('returns empty array when the summary is null', () => {
    expect(urgentResponsibleConflictItems(null)).toEqual([])
  })

  it('returns empty array when the summary count is zero', () => {
    expect(urgentResponsibleConflictItems({ count: 0, absenteeNames: [], totalAbsenteesCount: 0 })).toEqual([])
  })

  // The manager's "someone I schedule has an absence" card is amber /
  // priority 2 — one tier below the manager's OWN dayoff conflict so a
  // program manager who is also on a part sees their personal clash first.
  it('returns one item with priority 2 and a deep-link to the filtered programme list', () => {
    const items = urgentResponsibleConflictItems({
      count: 2,
      absenteeNames: ['Marie D.', 'Jean P.'],
      totalAbsenteesCount: 2,
    })
    expect(items).toHaveLength(1)
    expect(items[0].priority).toBe(2)
    expect(items[0].borderClass).toContain('amber')
    expect(items[0].to).toBe('/programs?hasConflicts=true')
    expect(items[0].key).toBe('responsible-conflicts')
  })

  it('uses the singular label with a single name when count is 1', () => {
    const items = urgentResponsibleConflictItems({
      count: 1,
      absenteeNames: ['Marie Dupont'],
      totalAbsenteesCount: 1,
    })
    expect(items[0].label).toBe('1 responsible conflict: Marie Dupont')
  })

  it('uses the plural label with all names joined by comma', () => {
    const items = urgentResponsibleConflictItems({
      count: 3,
      absenteeNames: ['Alice A', 'Bob B', 'Charlie C'],
      totalAbsenteesCount: 3,
    })
    expect(items[0].label).toBe('3 responsible conflicts: Alice A, Bob B, Charlie C')
  })

  it('appends "(+N more)" when there are additional unlisted absentees', () => {
    const items = urgentResponsibleConflictItems({
      count: 5,
      absenteeNames: ['Alice A', 'Bob B', 'Charlie C'],
      totalAbsenteesCount: 5,
    })
    expect(items[0].label).toBe('5 responsible conflicts: Alice A, Bob B, Charlie C (+2 more)')
  })
})

// --- urgentDocumentsItem ---

describe('urgentDocumentsItem', () => {
  it('returns empty array for null count', () => {
    expect(urgentDocumentsItem(null)).toEqual([])
  })

  it('returns empty array for zero unread', () => {
    expect(urgentDocumentsItem(0)).toEqual([])
  })

  it('returns item with correct count and priority 5', () => {
    const items = urgentDocumentsItem(12)
    expect(items).toHaveLength(1)
    expect(items[0].priority).toBe(5)
    expect(items[0].to).toBe('/board')
    expect(items[0].label).toContain('12')
  })
})

// --- buildUrgentItems ---

describe('buildUrgentItems', () => {
  it('returns empty array when all inputs are null/empty', () => {
    expect(buildUrgentItems(null, null, null, null, null)).toEqual([])
  })

  it('returns items sorted by priority', () => {
    const territories = [makeTerritory(1, 'T-1', 'overdue', new Date(2026, 3, 20))]
    const items = buildUrgentItems(territories, 5, null, null, null)
    expect(items[0].priority).toBeLessThan(items[1].priority)
  })

  it('caps at 5 items maximum', () => {
    const territories = [
      makeTerritory(1, 'T-1', 'overdue', new Date(2026, 3, 20)),
      makeTerritory(2, 'T-2', 'overdue', new Date(2026, 3, 19)),
      makeTerritory(3, 'T-3', 'overdue', new Date(2026, 3, 18)),
      makeTerritory(4, 'T-4', 'due-soon', new Date(2026, 4, 1)),
      makeTerritory(5, 'T-5', 'due-soon', new Date(2026, 4, 2)),
      makeTerritory(6, 'T-6', 'due-soon', new Date(2026, 4, 3)),
    ]
    const items = buildUrgentItems(territories, 10, null, null, null)
    expect(items).toHaveLength(5)
  })

  it('prioritizes part assignment (0) over overdue territory (1)', () => {
    const territories = [makeTerritory(1, 'T-1', 'overdue', new Date(2026, 3, 20))]
    const meeting = makeNextMeeting(new Date(2026, 3, 25, 19, 0), {
      userPartIds: [10],
      partAssignments: [
        {
          id: 10,
          name: 'Discours',
          section: 'main',
          topic: '',
          order: 1,
          assignee: null,
          assistant: null,
          viewerRole: null,
          speakerLabel: null,
          readerLabel: null,
        },
      ],
    })
    const items = buildUrgentItems(territories, null, meeting, null, null)
    expect(items[0].key).toContain('part-')
    expect(items[1].key).toContain('territory-overdue-')
  })

  it('prioritizes day-off conflict (1) over service role (3)', () => {
    const meetingDate = new Date(2026, 3, 25, 19, 0)
    const meeting = makeNextMeeting(meetingDate, {
      userPartIds: [10],
      userServiceRoleIds: [5],
      partAssignments: [
        {
          id: 10,
          name: 'Discours',
          section: 'main',
          topic: '',
          order: 1,
          assignee: null,
          assistant: null,
          viewerRole: null,
          speakerLabel: null,
          readerLabel: null,
        },
      ],
      serviceRoleAssignments: [{ id: 5, name: 'Son', assignee: null }],
    })
    const conflict = makeConflict(7, 'Discours public', meetingDate)
    const items = buildUrgentItems(null, null, meeting, conflict, null)
    const priorities = items.map(i => i.priority)
    expect(priorities).toEqual([0, 1, 3])
  })

  it('includes the responsible-conflict card at priority 2 when the summary has conflicts', () => {
    const items = buildUrgentItems(null, null, null, null, {
      count: 3,
      absenteeNames: ['Marie D.', 'Jean P.'],
      totalAbsenteesCount: 2,
    })
    expect(items).toHaveLength(1)
    expect(items[0].priority).toBe(2)
    expect(items[0].key).toBe('responsible-conflicts')
  })

  // A program manager with both their own overlapping absence AND someone
  // else's absence to resolve should see their PERSONAL clash first — the
  // responsible-conflict card is one step below in urgency.
  it('shows my dayoff conflict before the responsible-conflict card when both exist', () => {
    const meetingDate = new Date(2026, 3, 25, 19, 0)
    const myConflict = makeConflict(7, 'Discours public', meetingDate)
    const items = buildUrgentItems(null, null, null, myConflict, {
      count: 2,
      absenteeNames: ['Marie D.', 'Jean P.'],
      totalAbsenteesCount: 2,
    })
    expect(items).toHaveLength(2)
    expect(items[0].key).toBe('dayoff-conflict-part-7')
    expect(items[1].key).toBe('responsible-conflicts')
  })
})
