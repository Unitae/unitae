import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

vi.mock('~/paraglide/messages', () => ({
  dashboard_urgent_territory_overdue: ({ number }: { number: string }) => `Territory ${number} — overdue`,
  dashboard_urgent_territory_due_soon: ({ number }: { number: string }) => `Territory ${number} — due soon`,
  dashboard_urgent_assignment_soon: ({ name, eventName }: { name: string; eventName: string }) =>
    `${name} — ${eventName}`,
  dashboard_urgent_service_role_soon: ({ name, eventName }: { name: string; eventName: string }) =>
    `${name} — ${eventName}`,
  dashboard_urgent_dayoff_conflict: ({ eventName }: { eventName: string }) => `Conflict with ${eventName}`,
  dashboard_urgent_unread_documents: ({ count }: { count: string }) => `${count} unread documents`,
}))

const {
  buildUrgentItems,
  urgentTerritoriesItems,
  urgentPartAssignmentItems,
  urgentServiceRoleItems,
  urgentDayoffConflictItems,
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

type Person = { id: number; firstname: string | null; lastname: string | null }
type PartAssignment = {
  id: number
  name: string
  section: string
  topic: string
  order: number
  assignee: Person | null
  assistant: Person | null
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
    kind: { name: 'Midweek', color: '#000' } as { name: string; color: string } | null,
    partAssignments,
    serviceRoleAssignments,
    userPartIds,
    userServiceRoleIds,
  }
}

function makeAbsence(id: number, startDate: Date, endDate: Date) {
  return {
    id,
    startDate,
    endDate,
    name: 'Absence',
    description: '',
    congregationId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: 1,
    kindId: 1,
    templateId: null as number | null,
  }
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
  it('returns empty array for null meeting', () => {
    expect(urgentDayoffConflictItems(null, [makeAbsence(1, new Date(), new Date())])).toEqual([])
  })

  it('returns empty array for null absences', () => {
    const meeting = makeNextMeeting(new Date(2026, 3, 25), { userPartIds: [10] })
    expect(urgentDayoffConflictItems(meeting, null)).toEqual([])
  })

  it('returns empty array when user has no assignments', () => {
    const meeting = makeNextMeeting(new Date(2026, 3, 25))
    const absences = [makeAbsence(1, new Date(2026, 3, 25), new Date(2026, 3, 25))]
    expect(urgentDayoffConflictItems(meeting, absences)).toEqual([])
  })

  it('returns empty array when absence does not overlap meeting', () => {
    const meetingDate = new Date(2026, 3, 25, 19, 0)
    const meeting = makeNextMeeting(meetingDate, {
      userPartIds: [10],
      partAssignments: [
        { id: 10, name: 'Discours', section: 'main', topic: '', order: 1, assignee: null, assistant: null },
      ],
    })
    // Absence is the day before the meeting
    const absences = [makeAbsence(1, new Date(2026, 3, 20), new Date(2026, 3, 23))]
    expect(urgentDayoffConflictItems(meeting, absences)).toEqual([])
  })

  it('returns conflict item when absence overlaps meeting date', () => {
    const meetingDate = new Date(2026, 3, 25, 19, 0)
    const meeting = makeNextMeeting(meetingDate, {
      userPartIds: [10],
      partAssignments: [
        { id: 10, name: 'Discours', section: 'main', topic: '', order: 1, assignee: null, assistant: null },
      ],
    })
    // Absence spans the meeting day
    const absences = [makeAbsence(7, new Date(2026, 3, 24), new Date(2026, 3, 26))]
    const items = urgentDayoffConflictItems(meeting, absences)
    expect(items).toHaveLength(1)
    expect(items[0].priority).toBe(2)
    expect(items[0].to).toBe('/me/days-off')
    expect(items[0].label).toContain('Réunion de semaine')
  })

  it('detects conflict when absence starts same day as meeting', () => {
    const meetingDate = new Date(2026, 3, 25, 19, 0)
    const meeting = makeNextMeeting(meetingDate, {
      userServiceRoleIds: [5],
      serviceRoleAssignments: [{ id: 5, name: 'Son', assignee: null }],
    })
    const absences = [makeAbsence(8, new Date(2026, 3, 25, 0, 0), new Date(2026, 3, 27))]
    expect(urgentDayoffConflictItems(meeting, absences)).toHaveLength(1)
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
    expect(buildUrgentItems(null, null, null, null)).toEqual([])
  })

  it('returns items sorted by priority', () => {
    const territories = [makeTerritory(1, 'T-1', 'overdue', new Date(2026, 3, 20))]
    const items = buildUrgentItems(territories, 5, null, null)
    expect(items[0].priority).toBeLessThan(items[1].priority)
  })

  it('caps at 3 items maximum', () => {
    const territories = [
      makeTerritory(1, 'T-1', 'overdue', new Date(2026, 3, 20)),
      makeTerritory(2, 'T-2', 'overdue', new Date(2026, 3, 19)),
      makeTerritory(3, 'T-3', 'due-soon', new Date(2026, 4, 1)),
      makeTerritory(4, 'T-4', 'due-soon', new Date(2026, 4, 2)),
    ]
    const items = buildUrgentItems(territories, 10, null, null)
    expect(items).toHaveLength(3)
  })

  it('prioritizes part assignment (0) over overdue territory (1)', () => {
    const territories = [makeTerritory(1, 'T-1', 'overdue', new Date(2026, 3, 20))]
    const meeting = makeNextMeeting(new Date(2026, 3, 25, 19, 0), {
      userPartIds: [10],
      partAssignments: [
        { id: 10, name: 'Discours', section: 'main', topic: '', order: 1, assignee: null, assistant: null },
      ],
    })
    const items = buildUrgentItems(territories, null, meeting, null)
    expect(items[0].key).toContain('part-')
    expect(items[1].key).toContain('territory-overdue-')
  })

  it('prioritizes day-off conflict (2) over service role (3)', () => {
    const meetingDate = new Date(2026, 3, 25, 19, 0)
    const meeting = makeNextMeeting(meetingDate, {
      userPartIds: [10],
      userServiceRoleIds: [5],
      partAssignments: [
        { id: 10, name: 'Discours', section: 'main', topic: '', order: 1, assignee: null, assistant: null },
      ],
      serviceRoleAssignments: [{ id: 5, name: 'Son', assignee: null }],
    })
    const absences = [makeAbsence(7, new Date(2026, 3, 24), new Date(2026, 3, 26))]
    const items = buildUrgentItems(null, null, meeting, absences)
    const priorities = items.map(i => i.priority)
    expect(priorities).toEqual([0, 2, 3])
  })
})
