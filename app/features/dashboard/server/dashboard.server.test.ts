import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    attribution: { findMany: vi.fn() },
    boardDocument: { findMany: vi.fn(), count: vi.fn() },
    boardDynamicDocumentSettings: { findMany: vi.fn(), count: vi.fn() },
    event: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock('~/features/events/server/days-off.server', () => ({
  getNextDaysOffs: vi.fn(),
}))

const { getUserTerritories, getRecentDocuments, getUnreadDocumentCount, getNextMeeting, getUpcomingAbsences } =
  await import('./dashboard.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { getNextDaysOffs } = await import('~/features/events/server/days-off.server')

beforeEach(() => {
  vi.resetAllMocks()
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

  it('returns event with user part IDs identified', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      id: 1,
      name: 'Midweek',
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 3, 25),
      kind: { name: 'Midweek', color: '#000' },
      partAssignments: [
        {
          id: 10,
          name: 'Talk',
          section: 'main',
          topic: 'Topic',
          order: 1,
          assignee: { id: 42, firstname: 'John', lastname: 'Doe' },
          assistant: null,
        },
        {
          id: 11,
          name: 'Reading',
          section: 'main',
          topic: null,
          order: 2,
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
  })

  it('identifies user as assistant', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      id: 1,
      name: 'Midweek',
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 3, 25),
      kind: null,
      partAssignments: [
        {
          id: 10,
          name: 'Study',
          section: 'main',
          topic: null,
          order: 1,
          assignee: { id: 99, firstname: 'Jane', lastname: 'Smith' },
          assistant: { id: 42, firstname: 'John', lastname: 'Doe' },
        },
      ],
      serviceRoleAssignments: [],
    } as never)

    const result = await getNextMeeting(db, 42)
    expect(result?.userPartIds).toEqual([10])
  })

  it('returns empty arrays when user has no assignments', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      id: 1,
      name: 'Midweek',
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 3, 25),
      kind: null,
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
