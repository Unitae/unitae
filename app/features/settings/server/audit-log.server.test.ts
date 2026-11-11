import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuditLogCount = vi.fn()
const mockAuditLogFindMany = vi.fn()
const mockUserFindMany = vi.fn()

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    auditLog: { count: mockAuditLogCount, findMany: mockAuditLogFindMany },
    userAccount: { findMany: mockUserFindMany },
  },
}))

const { findAuditLogsPaginated } = await import('./audit-log.server')

const base = { congregationId: 42, page: 1, pageSize: 25, timeZone: 'Europe/Paris' }
const lastQuery = () => mockAuditLogFindMany.mock.calls.at(-1)?.[0]

beforeEach(() => {
  vi.resetAllMocks()
  mockAuditLogCount.mockResolvedValue(0)
  mockAuditLogFindMany.mockResolvedValue([])
  mockUserFindMany.mockResolvedValue([])
})

describe('findAuditLogsPaginated', () => {
  it('reads only the congregation’s lines, the newest first', async () => {
    await findAuditLogsPaginated(base)

    expect(mockAuditLogCount).toHaveBeenCalledWith({ where: { congregationId: 42 } })
    expect(lastQuery()).toMatchObject({ where: { congregationId: 42 }, orderBy: { createdAt: 'desc' } })
  })

  it('keeps one action when asked', async () => {
    await findAuditLogsPaginated({ ...base, action: 'user.created' })

    expect(lastQuery().where.action).toBe('user.created')
  })

  // The page count followed the page size while the query always took 25 lines.
  it('takes as many lines as the page size it is given', async () => {
    mockAuditLogCount.mockResolvedValue(500)

    const result = await findAuditLogsPaginated({ ...base, page: 3, pageSize: 50 })

    expect(lastQuery()).toMatchObject({ skip: 100, take: 50 })
    expect(result).toMatchObject({ page: 3, pageSize: 50, pages: 10 })
  })

  // ?page=0 sent a negative offset to the database.
  it('never asks for a page before the first or past the last', async () => {
    mockAuditLogCount.mockResolvedValue(60)

    expect(await findAuditLogsPaginated({ ...base, page: 0 })).toMatchObject({ page: 1 })
    expect(lastQuery().skip).toBe(0)
    expect(await findAuditLogsPaginated({ ...base, page: 99 })).toMatchObject({ page: 3 })
    expect(lastQuery().skip).toBe(50)
  })

  // The days are the congregation's, and the last day counts whole: it was left out.
  it('reads a period from the start of its first day to the end of its last, in the congregation’s time zone', async () => {
    await findAuditLogsPaginated({ ...base, from: '2026-03-01', to: '2026-03-31' })

    expect(lastQuery().where.createdAt).toEqual({
      gte: new Date('2026-02-28T23:00:00.000Z'),
      lt: new Date('2026-03-31T22:00:00.000Z'),
    })
  })

  it('names who did each action after their record, or their account, rather than by their address', async () => {
    mockAuditLogCount.mockResolvedValue(2)
    mockAuditLogFindMany.mockResolvedValue([
      { id: 1, action: 'user.login', actorId: 10, actorEmail: 'claire@example.org', createdAt: new Date() },
      { id: 2, action: 'user.login', actorId: 11, actorEmail: null, createdAt: new Date() },
    ])
    mockUserFindMany.mockResolvedValue([
      {
        id: 10,
        email: 'claire@example.org',
        firstname: null,
        lastname: null,
        member: { firstname: 'Claire', lastname: 'André' },
      },
      { id: 11, email: 'secretariat@example.org', firstname: 'Secrétariat', lastname: null, member: null },
    ])

    const result = await findAuditLogsPaginated(base)

    expect(result.logs.map(log => [log.actorName, log.actorEmail])).toEqual([
      ['Claire ANDRÉ', 'claire@example.org'],
      ['Secrétariat', 'secretariat@example.org'],
    ])
  })

  it('keeps the address of someone whose account is gone', async () => {
    mockAuditLogCount.mockResolvedValue(1)
    mockAuditLogFindMany.mockResolvedValue([
      { id: 1, action: 'user.login', actorId: 99, actorEmail: 'gone@example.org', createdAt: new Date() },
    ])

    const [log] = (await findAuditLogsPaginated(base)).logs

    expect(log).toMatchObject({ actorName: null, actorEmail: 'gone@example.org' })
  })

  it('looks a person up by their name or their address', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 10 }])

    await findAuditLogsPaginated({ ...base, search: 'andré' })

    expect(lastQuery().where.OR).toEqual([
      { actorEmail: { contains: 'andré', mode: 'insensitive' } },
      { actorId: { in: [10] } },
    ])
  })
})
