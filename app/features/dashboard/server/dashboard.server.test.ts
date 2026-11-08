import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    attribution: { findMany: vi.fn() },
    boardDocument: { findMany: vi.fn(), count: vi.fn() },
    boardDynamicDocumentSettings: { findMany: vi.fn(), count: vi.fn() },
    event: { findFirst: vi.fn(), findMany: vi.fn() },
    eventPart: { findMany: vi.fn() },
    eventServicePart: { findMany: vi.fn() },
    role: { findMany: vi.fn() },
  },
}))

vi.mock('~/features/events/server/days-off.server', () => ({
  getNextDaysOffs: vi.fn(),
}))

// getNextMeeting deep-links via the shared board resolver (same one the
// assignment emails use); mock it and assert the event handed to it.
vi.mock('~/features/display-board/index.server', () => ({
  resolveProgrammeLink: vi.fn(),
  // The board owns the visibility rule; the dashboard only spreads it into a
  // where, so the shape is all that matters here.
  buildSectionVisibilityFilter: vi.fn(async () => ({
    OR: [{ visibilityRoles: { none: {} } }, { visibilityRoles: { some: { roleId: { in: [] } } } }],
  })),
  // The board decides what is visible and unread; the dashboard only orders and counts its list.
  listBoardItems: vi.fn(),
}))

const { getUserTerritories, getBoardDocuments, getNextMeeting, getUpcomingAbsences, getConflictingAssignments } =
  await import('./dashboard.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { getNextDaysOffs } = await import('~/features/events/server/days-off.server')
const { listBoardItems, resolveProgrammeLink } = await import('~/features/display-board/index.server')

const CONGREGATION_ID = 7

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.role.findMany).mockResolvedValue([] as never)
  vi.mocked(resolveProgrammeLink).mockResolvedValue('/board')
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

  it('excludes attributions paused for a campaign (frozen clock must not read as overdue)', async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([] as never)

    await getUserTerritories(db as never, 7)

    const where = vi.mocked(db.attribution.findMany).mock.calls[0][0]?.where
    expect(where).toMatchObject({ pausedAt: null })
  })

  it('returns empty array when user has no attributions', async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([] as never)
    const result = await getUserTerritories(db, 1)
    expect(result).toEqual([])
  })
})

// --- getBoardDocuments ---

describe('getBoardDocuments', () => {
  const item = (kind: 'pdf' | 'dynamic', id: number, title: string, createdAt: Date, unread: boolean) =>
    ({ kind, id, title, createdAt, unread }) as never

  it('shows the latest documents first, read or not, with the board’s unread count', async () => {
    vi.mocked(listBoardItems).mockResolvedValue({
      sections: [],
      items: [
        item('pdf', 1, 'PDF doc', new Date(2026, 3, 20), true),
        item('pdf', 2, 'PDF doc 2', new Date(2026, 3, 24), false),
        item('dynamic', 10, 'Dynamic doc', new Date(2026, 3, 22), true),
      ],
      unreadCount: 2,
    })

    const { recent, unread } = await getBoardDocuments(db, 1, 1)

    expect(recent.map(d => [d.title, d.alreadyViewed])).toEqual([
      ['PDF doc 2', true],
      ['Dynamic doc', false],
      ['PDF doc', false],
    ])
    expect(unread).toBe(2)
  })

  it('caps the list at 5 documents', async () => {
    vi.mocked(listBoardItems).mockResolvedValue({
      sections: [],
      items: Array.from({ length: 8 }, (_, i) => item('pdf', i, `PDF ${i}`, new Date(2026, 3, 10 + i), false)),
      unreadCount: 0,
    })

    expect((await getBoardDocuments(db, 1, 1)).recent).toHaveLength(5)
  })
})

// --- getNextMeeting ---

describe('getNextMeeting', () => {
  it('returns null when no upcoming event exists', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    const result = await getNextMeeting(db, 1, CONGREGATION_ID)
    expect(result).toBeNull()
  })

  it('returns event with user part IDs identified and viewerRole tagged as speaker when viewer is the assignee', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      id: 1,
      name: 'Midweek',
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 3, 25),
      template: { name: 'Midweek', color: '#000' },
      eventParts: [
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
      eventServiceParts: [
        { id: 20, name: 'Sound', assignee: { id: 42, firstname: 'John', lastname: 'Doe' } },
        { id: 21, name: 'Stage', assignee: { id: 50, firstname: 'Bob', lastname: 'Brown' } },
      ],
    } as never)

    const result = await getNextMeeting(db, 42, CONGREGATION_ID)
    expect(result).not.toBeNull()
    expect(result?.userPartIds).toEqual([10])
    expect(result?.userServicePartIds).toEqual([20])
    // Viewer is the assignee on part 10 → speaker. Part 11 belongs to someone
    // else so the viewer has no role there.
    const parts = result?.eventParts ?? []
    expect(parts.find(p => p.id === 10)?.viewerRole).toBe('speaker')
    expect(parts.find(p => p.id === 11)?.viewerRole).toBeNull()
  })

  // The meeting carries its own board deep link so the urgent strip can point
  // at the specific programme viewer instead of a generic /board — resolved
  // through the same shared resolver as the assignment emails and the
  // upcoming-assignments card.
  it('resolves the board deep link via resolveProgrammeLink and returns it', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      id: 55,
      templateId: 9,
      name: 'Midweek',
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 3, 25),
      template: null,
      eventParts: [],
      eventServiceParts: [],
    } as never)
    vi.mocked(resolveProgrammeLink).mockResolvedValue('/board/dynamic/3/viewer?eventId=55')

    const result = await getNextMeeting(db, 42, CONGREGATION_ID)
    expect(result?.link).toBe('/board/dynamic/3/viewer?eventId=55')
    expect(resolveProgrammeLink).toHaveBeenCalledWith(db, { id: 55, templateId: 9 }, CONGREGATION_ID)
  })

  it('tags viewerRole as reader when viewer is the assistant (previously mislabeled speaker in the UI)', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      id: 1,
      name: 'Midweek',
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 3, 25),
      template: null,
      eventParts: [
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
      eventServiceParts: [],
    } as never)

    const result = await getNextMeeting(db, 42, CONGREGATION_ID)
    expect(result?.userPartIds).toEqual([10])
    expect(result?.eventParts[0].viewerRole).toBe('reader')
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
      eventParts: [
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
      eventServiceParts: [],
    } as never)

    const result = await getNextMeeting(db, 42, CONGREGATION_ID)

    expect(result?.eventParts[0]).toMatchObject({ speakerLabel: 'STUDENT-SENTINEL-42', readerLabel: null })
    expect(result?.eventParts[1]).toMatchObject({
      speakerLabel: 'STUDENT-SENTINEL-99',
      readerLabel: 'HOUSEHOLDER-SENTINEL-99',
    })

    // Also assert the Prisma select requested the fields — a fixture that
    // happened to include the sentinels would pass without this.
    const call = vi.mocked(db.event.findFirst).mock.calls[0][0]
    const select = call?.select as { eventParts?: { select?: Record<string, unknown> } }
    expect(select.eventParts?.select).toMatchObject({ speakerLabel: true, readerLabel: true })
  })

  it('returns empty arrays when user has no assignments', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      id: 1,
      name: 'Midweek',
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 3, 25),
      template: null,
      eventParts: [
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
      eventServiceParts: [],
    } as never)

    const result = await getNextMeeting(db, 42, CONGREGATION_ID)
    expect(result?.userPartIds).toEqual([])
    expect(result?.userServicePartIds).toEqual([])
  })

  // The dashboard is publisher-facing. Drafts must not surface — same
  // rationale as the other dashboard queries in this file.
  it('filters to status=released', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)

    await getNextMeeting(db, 42, CONGREGATION_ID)

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

    await getNextMeeting(db, 42, CONGREGATION_ID)

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

describe('getConflictingAssignments', () => {
  it('only surfaces conflicts on released events', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)

    await getConflictingAssignments(db, 42)

    const [partCall] = vi.mocked(db.eventPart.findMany).mock.calls[0]
    expect((partCall as { where: { event: unknown } }).where.event).toMatchObject({ status: 'released' })

    const [serviceCall] = vi.mocked(db.eventServicePart.findMany).mock.calls[0]
    expect((serviceCall as { where: { event: unknown } }).where.event).toMatchObject({ status: 'released' })
  })
})
