import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  publisherGroup: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}

// biome-ignore lint/suspicious/noExplicitAny: mocked transaction client is intentionally partial
const dbCast = mockDb as any

const { getGroups, getGroup } = await import('./groups.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getGroups', () => {
  it('threads congregationId into the findMany where clause', async () => {
    mockDb.publisherGroup.findMany.mockResolvedValue([])
    await getGroups(dbCast, 42)
    expect(mockDb.publisherGroup.findMany).toHaveBeenCalledWith({ where: { congregationId: 42 } })
  })

  it('returns the rows the query yields', async () => {
    const rows = [{ id: 1, name: 'A' }]
    mockDb.publisherGroup.findMany.mockResolvedValue(rows)
    const result = await getGroups(dbCast, 42)
    expect(result).toBe(rows)
  })
})

// As of 15 July 2026 in Paris: the window runs from January to June 2026.
const AS_OF = { timezone: 'Europe/Paris', now: new Date('2026-07-15T10:00:00Z') }

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    firstname: 'A',
    lastname: 'B',
    email: '',
    inactiveAt: null,
    baptismDate: null,
    arrivedAt: null,
    lastPastoralVisitAt: null,
    createdAt: new Date('2020-01-01T00:00:00Z'),
    dpaCardUpToDate: true,
    survivalBackpackReady: true,
    _count: { emergencyContacts: 1 },
    activities: [],
    ...overrides,
  }
}

function groupRow(members: unknown[], overrides: Record<string, unknown> = {}) {
  return { id: 7, name: 'Group A', adress: '', responsible: null, deputy: null, members, ...overrides }
}

describe('getGroup', () => {
  it('returns null when the group is missing', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue(null)
    const result = await getGroup(dbCast, 99, 42, AS_OF)
    expect(result).toBeNull()
  })

  it('scopes the findUnique by the id_congregationId compound key', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue(null)
    await getGroup(dbCast, 99, 42, AS_OF)
    expect(mockDb.publisherGroup.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_congregationId: { id: 99, congregationId: 42 } } }),
    )
  })

  it('reads the reports of the six ended months, on the congregation calendar', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue(null)
    await getGroup(dbCast, 7, 42, AS_OF)

    const query = mockDb.publisherGroup.findUnique.mock.calls[0][0]
    expect(query.select.members.select.activities.where.OR).toEqual([
      { month: 0, year: 2026 },
      { month: 1, year: 2026 },
      { month: 2, year: 2026 },
      { month: 3, year: 2026 },
      { month: 4, year: 2026 },
      { month: 5, year: 2026 },
    ])
  })

  it('gives each month of the window its report status and, when filed, the report id', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue(
      groupRow([
        memberRow({
          activities: [
            { id: 3, month: 5, year: 2026, isPublisher: true },
            { id: 2, month: 4, year: 2026, isPublisher: false },
          ],
        }),
      ]),
    )

    const result = await getGroup(dbCast, 7, 42, AS_OF)

    expect(result?.reportWindow.at(-1)).toEqual({ month: 5, year: 2026 })
    expect(result?.members[0].reports.slice(-3)).toEqual([
      { month: 3, year: 2026, status: 'not-filed', id: null },
      { month: 4, year: 2026, status: 'irregular', id: 2 },
      { month: 5, year: 2026, status: 'filed', id: 3 },
    ])
  })

  it('lists the missing emergency information and the pastoral signals', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue(
      groupRow([
        memberRow({
          dpaCardUpToDate: false,
          _count: { emergencyContacts: 0 },
          baptismDate: new Date('2025-07-10T08:00:00Z'),
        }),
      ]),
    )

    const result = await getGroup(dbCast, 7, 42, AS_OF)

    expect(result?.members[0].emergencyGaps).toEqual(['card', 'contact'])
    expect(result?.members[0].signals).toEqual([{ kind: 'baptism-anniversary' }])
  })

  it('flags a recent arrival and names the month of the last pastoral visit', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue(
      groupRow([
        memberRow({
          arrivedAt: new Date('2026-06-01T00:00:00Z'),
          lastPastoralVisitAt: new Date('2026-04-01T00:00:00Z'),
        }),
      ]),
    )

    const result = await getGroup(dbCast, 7, 42, { timezone: 'America/New_York', now: AS_OF.now })

    // Date-only fields are stored at UTC midnight: they read as that calendar day, wherever the
    // congregation is. Converted to New York time, 1 April would become 31 March.
    expect(result?.members[0].signals).toEqual([
      { kind: 'new-arrival' },
      { kind: 'last-visit', on: { month: 3, year: 2026 } },
    ])
  })

  it('puts the inactive publishers in a list of their own', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue(
      groupRow([
        memberRow({ id: 1 }),
        memberRow({ id: 2, inactiveAt: new Date('2026-01-31T23:00:00Z') }),
        memberRow({ id: 3 }),
      ]),
    )

    const result = await getGroup(dbCast, 7, 42, AS_OF)

    expect(result?.members.map(each => each.id)).toEqual([1, 3])
    expect(result?.inactiveMembers.map(each => each.id)).toEqual([2])
    // 31 January 23:00 UTC is 1 February in Paris: the congregation's calendar decides.
    expect(result?.inactiveMembers[0].signals).toEqual([{ kind: 'inactive', since: { month: 1, year: 2026 } }])
  })

  it('exposes `address` (typo-fixing rename of the Prisma `adress` column)', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue(groupRow([], { adress: '10 rue de la Paix' }))
    const result = await getGroup(dbCast, 7, 42, AS_OF)
    expect(result?.address).toBe('10 rue de la Paix')
  })
})
