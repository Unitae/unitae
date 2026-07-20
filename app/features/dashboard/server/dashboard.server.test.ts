import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    attribution: { findMany: vi.fn() },
    boardDocument: { findMany: vi.fn(), count: vi.fn() },
    boardDynamicDocumentSettings: { findMany: vi.fn(), count: vi.fn() },
    event: { findFirst: vi.fn(), findMany: vi.fn() },
    programmePartAssignment: { findMany: vi.fn() },
    programmeServiceRoleAssignment: { findMany: vi.fn() },
    role: { findMany: vi.fn() },
  },
}))

vi.mock('~/features/events/server/days-off.server', () => ({
  getNextDaysOffs: vi.fn(),
}))

const {
  getUserTerritories,
  getRecentDocuments,
  getUnreadDocumentCount,
  getNextMeeting,
  getUpcomingAbsences,
  getUpcomingAssignments,
  getConflictingAssignments,
} = await import('./dashboard.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { getNextDaysOffs } = await import('~/features/events/server/days-off.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.role.findMany).mockResolvedValue([] as never)
})

// --- getUserTerritories ---

describe('getUserTerritories', () => {
  it('returns territories with computed status', async () => {
    const now = new Date()
    const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const soonDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    vi.mocked(db.attribution.findMany).mockResolvedValue([
      { id: 1, startDate: now, lateDate: pastDate, territory: { id: 10, number: 'T-1', type: 'classical' } },
      { id: 2, startDate: now, lateDate: soonDate, territory: { id: 20, number: 'T-2', type: 'classical' } },
      { id: 3, startDate: now, lateDate: futureDate, territory: { id: 30, number: 'T-3', type: 'classical' } },
    ] as never)

    const result = await getUserTerritories(db, 1)
    expect(result).toHaveLength(3)
    expect(result[0].status).toBe('overdue')
    expect(result[1].status).toBe('due-soon')
    expect(result[2].status).toBe('on-time')
  })

  it('returns empty array when user has no attributions', async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([] as never)
    const result = await getUserTerritories(db, 1)
    expect(result).toEqual([])
  })
})

// --- getUnreadDocumentCount ---

describe('getUnreadDocumentCount', () => {
  it('sums unread PDFs and dynamic documents', async () => {
    vi.mocked(db.boardDocument.count).mockResolvedValue(3 as never)
    vi.mocked(db.boardDynamicDocumentSettings.count).mockResolvedValue(2 as never)

    const result = await getUnreadDocumentCount(db, 1, 1)
    expect(result).toBe(5)
  })

  it('returns 0 when all documents are read', async () => {
    vi.mocked(db.boardDocument.count).mockResolvedValue(0 as never)
    vi.mocked(db.boardDynamicDocumentSettings.count).mockResolvedValue(0 as never)

    const result = await getUnreadDocumentCount(db, 1, 1)
    expect(result).toBe(0)
  })
})

// --- getRecentDocuments ---

describe('getRecentDocuments', () => {
  it('merges and sorts PDF and dynamic documents by date', async () => {
    const older = new Date(2026, 3, 20)
    const newer = new Date(2026, 3, 22)
    const newest = new Date(2026, 3, 24)

    vi.mocked(db.boardDocument.findMany).mockResolvedValue([
      { id: 1, title: 'PDF doc', createdAt: older, viewedBy: [] },
      { id: 2, title: 'PDF doc 2', createdAt: newest, viewedBy: [{ id: 1 }] },
    ] as never)
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      { id: 10, title: 'Dynamic doc', createdAt: newer, dynamicType: 'programme', views: [] },
    ] as never)

    const result = await getRecentDocuments(db, 1, 1)
    expect(result).toHaveLength(3)
    expect(result[0].title).toBe('PDF doc 2')
    expect(result[0].alreadyViewed).toBe(true)
    expect(result[1].title).toBe('Dynamic doc')
    expect(result[1].alreadyViewed).toBe(false)
    expect(result[2].title).toBe('PDF doc')
  })

  it('caps at 5 documents', async () => {
    vi.mocked(db.boardDocument.findMany).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: i,
        title: `PDF ${i}`,
        createdAt: new Date(2026, 3, 20 + i),
        viewedBy: [],
      })) as never,
    )
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        id: 100 + i,
        title: `Dynamic ${i}`,
        createdAt: new Date(2026, 3, 10 + i),
        dynamicType: 'programme',
        views: [],
      })) as never,
    )

    const result = await getRecentDocuments(db, 1, 1)
    expect(result).toHaveLength(5)
  })
})

// --- getNextMeeting ---

describe('getNextMeeting', () => {
  it('returns null when no upcoming event exists', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    const result = await getNextMeeting(db, 1)
    expect(result).toBeNull()
  })

  it('returns event with user part IDs identified and viewerRole tagged as speaker when viewer is the assignee', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      id: 1,
      name: 'Midweek',
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 3, 25),
      template: { name: 'Midweek', color: '#000' },
      partAssignments: [
        {
          id: 10,
          name: 'Talk',
          section: 'main',
          topic: 'Topic',
          order: 1,
          speakerLabel: null,
          readerLabel: null,
          assignee: { id: 42, firstname: 'John', lastname: 'Doe' },
          assistant: null,
        },
        {
          id: 11,
          name: 'Reading',
          section: 'main',
          topic: null,
          order: 2,
          speakerLabel: null,
          readerLabel: null,
          assignee: { id: 99, firstname: 'Jane', lastname: 'Smith' },
          assistant: null,
        },
      ],
      serviceRoleAssignments: [
        { id: 20, name: 'Sound', assignee: { id: 42, firstname: 'John', lastname: 'Doe' } },
        { id: 21, name: 'Stage', assignee: { id: 50, firstname: 'Bob', lastname: 'Brown' } },
      ],
    } as never)

    const result = await getNextMeeting(db, 42)
    expect(result).not.toBeNull()
    expect(result?.userPartIds).toEqual([10])
    expect(result?.userServiceRoleIds).toEqual([20])
    // Viewer is the assignee on part 10 → speaker. Part 11 belongs to someone
    // else so the viewer has no role there.
    const parts = result?.partAssignments ?? []
    expect(parts.find(p => p.id === 10)?.viewerRole).toBe('speaker')
    expect(parts.find(p => p.id === 11)?.viewerRole).toBeNull()
  })

  it('tags viewerRole as reader when viewer is the assistant (previously mislabeled speaker in the UI)', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      id: 1,
      name: 'Midweek',
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 3, 25),
      template: null,
      partAssignments: [
        {
          id: 10,
          name: 'Study',
          section: 'main',
          topic: null,
          order: 1,
          speakerLabel: null,
          readerLabel: null,
          // Different people in the two slots — this is the exact shape the
          // NextMeetingCard used to compare assignee.id vs assistant.id and
          // always return "speaker" for. The viewer here is the assistant.
          assignee: { id: 99, firstname: 'Jane', lastname: 'Smith' },
          assistant: { id: 42, firstname: 'John', lastname: 'Doe' },
        },
      ],
      serviceRoleAssignments: [],
    } as never)

    const result = await getNextMeeting(db, 42)
    expect(result?.userPartIds).toEqual([10])
    expect(result?.partAssignments[0].viewerRole).toBe('reader')
  })

  // Locks the shape: the Prisma select MUST project speakerLabel and readerLabel
  // on each partAssignment so the UI can render per-part role labels. A
  // regression that drops either field from the select would make the label
  // helper fall back to defaults for every part, silently masking whatever
  // admins configured.
  it('projects speakerLabel and readerLabel on every partAssignment (sentinel test)', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      id: 1,
      name: 'Midweek',
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 3, 25),
      template: null,
      partAssignments: [
        {
          id: 10,
          name: 'Bible reading',
          section: 'main',
          topic: null,
          order: 1,
          speakerLabel: 'STUDENT-SENTINEL-42',
          readerLabel: null,
          assignee: { id: 42, firstname: 'John', lastname: 'Doe' },
          assistant: null,
        },
        {
          id: 11,
          name: 'Return visit',
          section: 'main',
          topic: null,
          order: 2,
          speakerLabel: 'STUDENT-SENTINEL-99',
          readerLabel: 'HOUSEHOLDER-SENTINEL-99',
          assignee: null,
          assistant: null,
        },
      ],
      serviceRoleAssignments: [],
    } as never)

    const result = await getNextMeeting(db, 42)

    expect(result?.partAssignments[0]).toMatchObject({ speakerLabel: 'STUDENT-SENTINEL-42', readerLabel: null })
    expect(result?.partAssignments[1]).toMatchObject({
      speakerLabel: 'STUDENT-SENTINEL-99',
      readerLabel: 'HOUSEHOLDER-SENTINEL-99',
    })

    // Also assert the Prisma select requested the fields — a fixture that
    // happened to include the sentinels would pass without this.
    const call = vi.mocked(db.event.findFirst).mock.calls[0][0]
    const select = call?.select as { partAssignments?: { select?: Record<string, unknown> } }
    expect(select.partAssignments?.select).toMatchObject({ speakerLabel: true, readerLabel: true })
  })

  it('returns empty arrays when user has no assignments', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      id: 1,
      name: 'Midweek',
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 3, 25),
      template: null,
      partAssignments: [
        {
          id: 10,
          name: 'Talk',
          section: 'main',
          topic: null,
          order: 1,
          assignee: { id: 99, firstname: 'Jane', lastname: 'Smith' },
          assistant: null,
        },
      ],
      serviceRoleAssignments: [],
    } as never)

    const result = await getNextMeeting(db, 42)
    expect(result?.userPartIds).toEqual([])
    expect(result?.userServiceRoleIds).toEqual([])
  })

  // The dashboard is publisher-facing. Drafts must not surface — same
  // rationale as the other dashboard queries in this file.
  it('filters to status=released', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)

    await getNextMeeting(db, 42)

    const call = vi.mocked(db.event.findFirst).mock.calls[0][0]
    const where = call?.where as Record<string, unknown>
    expect(where.status).toBe('released')
  })

  // Same Prisma inner-join trap the codebase kept hitting with EventKind:
  // `template: { key: { not: 'day-off' } }` silently drops null-template
  // rows, which legacy imports and older data may still carry. Must use
  // NOT: { template: { key } } so null-template rows stay in the result.
  it('uses NOT: { template: { key } } so null-template events are not silently dropped', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)

    await getNextMeeting(db, 42)

    const call = vi.mocked(db.event.findFirst).mock.calls[0][0]
    const where = call?.where as Record<string, unknown>
    expect(where.NOT).toEqual({ template: { key: 'day-off' } })
    expect(where).not.toHaveProperty('template')
  })
})

// --- getUpcomingAbsences ---

describe('getUpcomingAbsences', () => {
  it('returns up to 3 upcoming absences', async () => {
    const absences = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      startDate: new Date(2026, 4, 1 + i),
      endDate: new Date(2026, 4, 2 + i),
    }))
    vi.mocked(getNextDaysOffs).mockResolvedValue(absences as never)

    const result = await getUpcomingAbsences(db, 1, 1)
    expect(result.upcoming).toHaveLength(3)
  })

  it('sets shouldNudge to true when no absences exist', async () => {
    vi.mocked(getNextDaysOffs).mockResolvedValue([] as never)
    const result = await getUpcomingAbsences(db, 1, 1)
    expect(result.shouldNudge).toBe(true)
    expect(result.upcoming).toEqual([])
  })

  it('sets shouldNudge to true when all absences are more than 2 months away', async () => {
    const farAway = new Date()
    farAway.setMonth(farAway.getMonth() + 3)
    vi.mocked(getNextDaysOffs).mockResolvedValue([{ id: 1, startDate: farAway, endDate: farAway }] as never)

    const result = await getUpcomingAbsences(db, 1, 1)
    expect(result.shouldNudge).toBe(true)
  })

  it('sets shouldNudge to false when an absence is within 2 months', async () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 14)
    vi.mocked(getNextDaysOffs).mockResolvedValue([{ id: 1, startDate: soon, endDate: soon }] as never)

    const result = await getUpcomingAbsences(db, 1, 1)
    expect(result.shouldNudge).toBe(false)
  })
})

// --- getUpcomingAssignments: draft events hidden ---
//
// The publisher dashboard is a public view of the schedule; draft assignments
// must not preview here or a publisher sees a mid-edit programme.

describe('getUpcomingAssignments', () => {
  it('filters part and service-role assignments to released events', async () => {
    vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([] as never)
    vi.mocked(db.programmeServiceRoleAssignment.findMany).mockResolvedValue([] as never)

    await getUpcomingAssignments(db, 42)

    const [partCall] = vi.mocked(db.programmePartAssignment.findMany).mock.calls[0]
    expect((partCall as { where: { event: unknown } }).where.event).toMatchObject({ status: 'released' })

    const [serviceCall] = vi.mocked(db.programmeServiceRoleAssignment.findMany).mock.calls[0]
    expect((serviceCall as { where: { event: unknown } }).where.event).toMatchObject({ status: 'released' })
  })
})

describe('getConflictingAssignments', () => {
  it('only surfaces conflicts on released events', async () => {
    vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([] as never)
    vi.mocked(db.programmeServiceRoleAssignment.findMany).mockResolvedValue([] as never)

    await getConflictingAssignments(db, 42)

    const [partCall] = vi.mocked(db.programmePartAssignment.findMany).mock.calls[0]
    expect((partCall as { where: { event: unknown } }).where.event).toMatchObject({ status: 'released' })

    const [serviceCall] = vi.mocked(db.programmeServiceRoleAssignment.findMany).mock.calls[0]
    expect((serviceCall as { where: { event: unknown } }).where.event).toMatchObject({ status: 'released' })
  })
})
