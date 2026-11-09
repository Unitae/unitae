import { beforeEach, describe, expect, it, vi } from 'vitest'

const { conflicts } = vi.hoisted(() => ({ conflicts: { calls: [] as unknown[][], rows: [] as unknown[] } }))

vi.mock('~/features/events/server/list-user-conflicts-in-range.server', () => ({
  listUserConflictsInRange: (...args: unknown[]) => {
    conflicts.calls.push(args)
    return Promise.resolve(conflicts.rows)
  },
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { event: { findMany: vi.fn(), findFirst: vi.fn() } },
}))

const { findOwnDayOff, listMyAbsences } = await import('./days-off.queries')
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
