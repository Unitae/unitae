import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventPart: { findMany: vi.fn() },
    eventServicePart: { findMany: vi.fn() },
  },
}))

// The board deep-link resolver is shared with the assignment notification
// emails; we mock it here and assert we hand it the right event, rather than
// re-testing its own board-document lookup (covered in event-link.server.test).
vi.mock('~/features/display-board/index.server', () => ({
  resolveProgrammeLink: vi.fn(),
}))

const { getUpcomingAssignments } = await import('./get-upcoming-assignments.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { resolveProgrammeLink } = await import('~/features/display-board/index.server')

const CONGREGATION_ID = 55
const NOW = new Date('2026-04-20T10:00:00.000Z')
// 28 days after NOW — the far edge of the look-ahead window.
const FOUR_WEEKS_LATER = new Date('2026-05-18T10:00:00.000Z')

function partRow(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    name: 'Discours public',
    topic: 'Un thème',
    speakerLabel: null,
    readerLabel: null,
    assigneeId: 100,
    assistantId: null,
    event: { id: 1, templateId: 9, name: 'Réunion du week-end', startDate: new Date('2026-04-22T18:00:00.000Z') },
    ...over,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.eventPart.findMany).mockResolvedValue([] as never)
  vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)
  vi.mocked(resolveProgrammeLink).mockResolvedValue('/board')
})

describe('getUpcomingAssignments', () => {
  it('returns an empty list when the member has no upcoming assignments', async () => {
    const result = await getUpcomingAssignments(db, 42, CONGREGATION_ID, NOW)
    expect(result).toEqual([])
  })

  // The card is a forward view: only released events between now and four
  // weeks out, and never day-off pseudo-events. Parts match the member as
  // either the speaker (assignee) or the assistant (assistant).
  it('scopes the part query to my released events within the four-week window', async () => {
    await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)

    const where = vi.mocked(db.eventPart.findMany).mock.calls[0][0]?.where as Record<string, unknown>
    expect(where.OR).toEqual([{ assigneeId: 100 }, { assistantId: 100 }])
    expect(where.event).toEqual({
      status: 'released',
      startDate: { gte: NOW, lte: FOUR_WEEKS_LATER },
      NOT: { template: { key: 'day-off' } },
    })
  })

  it('scopes the service-role query to my released events within the four-week window', async () => {
    await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)

    const where = vi.mocked(db.eventServicePart.findMany).mock.calls[0][0]?.where as Record<string, unknown>
    expect(where.assigneeId).toBe(100)
    expect(where.event).toEqual({
      status: 'released',
      startDate: { gte: NOW, lte: FOUR_WEEKS_LATER },
      NOT: { template: { key: 'day-off' } },
    })
  })

  it('maps a part where I am the assignee to a speaker role', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([partRow()] as never)
    vi.mocked(resolveProgrammeLink).mockResolvedValue('/board/dynamic/5/viewer?eventId=1')

    const [item] = await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)
    expect(item).toEqual({
      key: 'part-7',
      role: 'speaker',
      name: 'Discours public',
      topic: 'Un thème',
      speakerLabel: null,
      readerLabel: null,
      eventName: 'Réunion du week-end',
      eventStartDate: new Date('2026-04-22T18:00:00.000Z'),
      link: '/board/dynamic/5/viewer?eventId=1',
    })
  })

  it('maps a part where I am the assistant to a reader role', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      partRow({
        id: 8,
        name: 'Lecture de la Bible',
        topic: '',
        readerLabel: 'Élève',
        assigneeId: 999,
        assistantId: 100,
      }),
    ] as never)

    const [item] = await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)
    expect(item.role).toBe('reader')
    expect(item.readerLabel).toBe('Élève')
    // An empty topic collapses to null so the UI can skip it cleanly.
    expect(item.topic).toBeNull()
  })

  it('maps a service role to a service item', async () => {
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([
      {
        id: 3,
        name: 'Sonorisation',
        event: { id: 2, templateId: 4, name: 'Réunion de semaine', startDate: new Date('2026-04-23T18:00:00.000Z') },
      },
    ] as never)

    const [item] = await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)
    expect(item).toEqual({
      key: 'service-3',
      role: 'service',
      name: 'Sonorisation',
      topic: null,
      speakerLabel: null,
      readerLabel: null,
      eventName: 'Réunion de semaine',
      eventStartDate: new Date('2026-04-23T18:00:00.000Z'),
      link: '/board',
    })
  })

  it('merges parts and service roles sorted by event start date, soonest first', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      partRow({
        id: 7,
        name: 'Discours',
        topic: '',
        event: { id: 1, templateId: 9, name: 'Week-end', startDate: new Date('2026-04-26T18:00:00.000Z') },
      }),
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([
      {
        id: 3,
        name: 'Sonorisation',
        event: { id: 2, templateId: 4, name: 'Semaine', startDate: new Date('2026-04-23T18:00:00.000Z') },
      },
    ] as never)

    const result = await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)
    expect(result.map(a => a.key)).toEqual(['service-3', 'part-7'])
  })

  // The deep link is shared with notification emails: same resolver, same
  // (event id, templateId) input, same congregation.
  it('resolves each assignment link through resolveProgrammeLink with its event', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([partRow()] as never)

    await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)
    expect(resolveProgrammeLink).toHaveBeenCalledWith(db, { id: 1, templateId: 9 }, CONGREGATION_ID)
  })

  // Two assignments on the same meeting share one resolved link — we must not
  // hit the resolver (and its board-document query) once per row.
  it('gives assignments on the same event one shared link, resolving it once', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      partRow({ id: 7 }),
      partRow({ id: 8, name: 'Lecture' }),
    ] as never)
    vi.mocked(resolveProgrammeLink).mockResolvedValue('/board/dynamic/5/viewer?eventId=1')

    const result = await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)
    // Observable outcome: both rows (same meeting) carry the same resolved link.
    expect(result).toHaveLength(2)
    expect(result[0].link).toBe('/board/dynamic/5/viewer?eventId=1')
    expect(result[1].link).toBe(result[0].link)
    // ...and the resolver's board-document lookup ran once, not once per row.
    expect(resolveProgrammeLink).toHaveBeenCalledTimes(1)
  })

  it('caps the list at five items', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) =>
        partRow({
          id: i + 1,
          name: `Partie ${i + 1}`,
          topic: '',
          event: { id: i + 1, templateId: 9, name: 'Réunion', startDate: new Date(`2026-04-2${i}T18:00:00.000Z`) },
        }),
      ) as never,
    )

    const result = await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)
    expect(result).toHaveLength(5)
  })
})

describe('slot labels when the part carries a kind', () => {
  // The kind owns the wording, and a seeded one stores null and takes it from
  // the catalogue. Reading the part's own column here showed every assignee a
  // generic "Orateur" on the one screen where they read their own assignment.
  it("uses the kind's label rather than the part's empty column", async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      partRow({
        speakerLabel: null,
        readerLabel: null,
        preset: { key: 'watchtower-study', speakerLabel: null, readerLabel: null },
      }),
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)
    vi.mocked(resolveProgrammeLink).mockResolvedValue('/board/1')

    const [assignment] = await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)

    expect(assignment?.speakerLabel).toBe('Conducteur')
    expect(assignment?.readerLabel).toBe('Lecteur')
  })

  it("prefers the kind's own wording over the catalogue", async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      partRow({
        speakerLabel: 'IGNORED-PART-SENTINEL',
        preset: { key: 'watchtower-study', speakerLabel: 'PRESET-SENTINEL', readerLabel: null },
      }),
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)
    vi.mocked(resolveProgrammeLink).mockResolvedValue('/board/1')

    const [assignment] = await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)

    expect(assignment?.speakerLabel).toBe('PRESET-SENTINEL')
  })

  it("keeps the part's own label when it has no kind", async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      partRow({ speakerLabel: 'PART-SENTINEL', preset: null }),
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)
    vi.mocked(resolveProgrammeLink).mockResolvedValue('/board/1')

    const [assignment] = await getUpcomingAssignments(db, 100, CONGREGATION_ID, NOW)

    expect(assignment?.speakerLabel).toBe('PART-SENTINEL')
  })
})
