import { beforeEach, describe, expect, it, vi } from 'vitest'

const { conflicts } = vi.hoisted(() => ({ conflicts: { calls: [] as unknown[][], rows: [] as unknown[] } }))

vi.mock('~/features/events/server/list-user-conflicts-in-range.server', () => ({
  listUserConflictsInRange: (...args: unknown[]) => {
    conflicts.calls.push(args)
    return Promise.resolve(conflicts.rows)
  },
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findMany: vi.fn(), findFirst: vi.fn() },
    eventPart: { findMany: vi.fn() },
    eventServicePart: { findMany: vi.fn() },
  },
}))

const { findOwnDayOff, listCongregationAbsences, listMyAbsences } = await import('./days-off.queries')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const NOW = new Date('2026-11-11T12:00:00Z')
const current = { id: 1, startDate: new Date('2026-11-09T23:00:00Z'), endDate: new Date('2026-11-13T22:59:59.999Z') }
const later = { id: 2, startDate: new Date('2026-12-20T23:00:00Z'), endDate: new Date('2027-01-03T22:59:59.999Z') }

beforeEach(() => {
  vi.resetAllMocks()
  conflicts.calls = []
  conflicts.rows = []
})

describe('listMyAbsences', () => {
  it('gives each upcoming absence the assignments that fall during it', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([current, later] as never)
    conflicts.rows = [
      {
        eventDate: new Date('2026-11-12T18:00:00Z'),
        assignmentName: 'Lecture de la Bible',
        responsibleName: 'Jean M.',
      },
      { eventDate: new Date('2026-12-27T09:00:00Z'), assignmentName: 'Discours public', responsibleName: null },
    ]

    const result = await listMyAbsences(db, { accountId: 12, memberId: 5, congregationId: 1, now: NOW })

    expect(result.map(a => [a.id, a.conflicts.map(c => c.assignmentName)])).toEqual([
      [1, ['Lecture de la Bible']],
      [2, ['Discours public']],
    ])
  })

  it('asks for the assignments of the whole span at once', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([current, later] as never)

    await listMyAbsences(db, { accountId: 12, memberId: 5, congregationId: 1, now: NOW })

    expect(conflicts.calls).toEqual([[db, 5, current.startDate, later.endDate]])
  })

  it('looks for no assignment for an account without a member, which cannot hold any', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([current] as never)

    const result = await listMyAbsences(db, { accountId: 12, memberId: null, congregationId: 1, now: NOW })

    expect(result[0].conflicts).toEqual([])
    expect(conflicts.calls).toEqual([])
  })
})

describe('findOwnDayOff', () => {
  it('finds only an absence the caller declared', async () => {
    vi.mocked(db.event.findFirst).mockImplementation((({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where.id === 1 &&
          where.createdById === 12 &&
          JSON.stringify(where.template) === JSON.stringify({ key: 'day-off' })
          ? current
          : null,
      )) as never)

    expect(await findOwnDayOff(db, { eventId: 1, accountId: 12, congregationId: 1 })).toEqual(current)
    expect(await findOwnDayOff(db, { eventId: 1, accountId: 99, congregationId: 1 })).toBeNull()
  })
})

describe('listCongregationAbsences', () => {
  const FROM = new Date('2026-11-08T23:00:00Z')
  const TO = new Date('2026-12-31T22:59:59.999Z')
  const declared = new Date('2026-11-02T10:00:00Z')
  const account = (memberId: number | null, firstname: string, lastname: string) => ({
    firstname: `${firstname} (compte)`,
    lastname: `${lastname} (compte)`,
    member: memberId == null ? null : { id: memberId, firstname, lastname },
  })
  const meeting = (id: number, startDate: string, templateId: number | null = 4, status = 'released') => ({
    id,
    startDate: new Date(startDate),
    endDate: new Date(new Date(startDate).getTime() + 2 * 60 * 60 * 1000),
    templateId,
    status,
  })
  // Élodie (member 5) is away 10–13 Nov; Paul (member 7) 21 Dec – 3 Jan.
  const elodie = { ...current, createdAt: declared, createdBy: account(5, 'Élodie', 'Martin') }
  const paul = { ...later, createdAt: declared, createdBy: account(7, 'Paul', 'Roux') }

  // Regression: the page offered people by member id and filtered absences by the account that declared them, so
  // picking someone matched nobody. An absence now names its person by their member record.
  it('names the person away by their member record, not by the account that declared the absence', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([elodie] as never)
    vi.mocked(db.eventPart.findMany).mockResolvedValue([])
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([])

    const [absence] = await listCongregationAbsences(db, { congregationId: 1, from: FROM, to: TO })

    expect(absence).toMatchObject({ id: 1, memberId: 5, firstname: 'Élodie', lastname: 'Martin', declaredAt: declared })
  })

  // Whether its programme is published already: red once people rely on it, orange while it is a draft.
  it('gives each absence the flagged assignments of its own person that fall during it', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([elodie, paul] as never)
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      {
        id: 12,
        name: 'Lecture de la Bible',
        assigneeId: 5,
        assistantId: null,
        event: meeting(31, '2026-11-12T18:00:00Z'),
      },
      // Élodie's part the week after her absence: not during it.
      { id: 13, name: 'Prière', assigneeId: 5, assistantId: null, event: meeting(32, '2026-11-19T18:00:00Z') },
      // Paul as the assistant of someone else's part.
      {
        id: 14,
        name: 'Démonstration',
        assigneeId: 9,
        assistantId: 7,
        event: meeting(40, '2026-12-27T09:00:00Z', null, 'draft'),
      },
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([
      { id: 7, name: 'Sonorisation', assigneeId: 7, event: meeting(39, '2026-12-24T18:00:00Z') },
    ] as never)

    const result = await listCongregationAbsences(db, { congregationId: 1, from: FROM, to: TO })

    expect(result.map(a => [a.id, a.conflicts])).toEqual([
      [
        1,
        [
          {
            kind: 'part',
            id: 12,
            name: 'Lecture de la Bible',
            eventId: 31,
            eventDate: new Date('2026-11-12T18:00:00Z'),
            templateId: 4,
            published: true,
          },
        ],
      ],
      [
        2,
        [
          {
            kind: 'service',
            id: 7,
            name: 'Sonorisation',
            eventId: 39,
            eventDate: new Date('2026-12-24T18:00:00Z'),
            templateId: 4,
            published: true,
          },
          {
            kind: 'part',
            id: 14,
            name: 'Démonstration',
            eventId: 40,
            eventDate: new Date('2026-12-27T09:00:00Z'),
            templateId: null,
            published: false,
          },
        ],
      ],
    ])
  })

  // The old page ran two queries per absence.
  it('reads the flagged assignments of everyone away in one query per kind', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([elodie, paul] as never)
    vi.mocked(db.eventPart.findMany).mockResolvedValue([])
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([])

    await listCongregationAbsences(db, { congregationId: 1, from: FROM, to: TO })

    expect(vi.mocked(db.eventPart.findMany).mock.calls).toHaveLength(1)
    expect(vi.mocked(db.eventServicePart.findMany).mock.calls).toHaveLength(1)
  })

  it('looks for no assignment when nobody away has a member, which alone can hold one', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { ...elodie, createdBy: account(null, 'Admin', 'Compte') },
    ] as never)

    const [absence] = await listCongregationAbsences(db, { congregationId: 1, from: FROM, to: TO })

    expect(absence).toMatchObject({ memberId: null, firstname: 'Admin (compte)', conflicts: [] })
    expect(vi.mocked(db.eventPart.findMany).mock.calls).toHaveLength(0)
  })
})
