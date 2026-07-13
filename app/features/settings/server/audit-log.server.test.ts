import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuditLogCount = vi.fn()
const mockAuditLogFindMany = vi.fn()
const mockUserFindMany = vi.fn()

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    auditLog: {
      count: mockAuditLogCount,
      findMany: mockAuditLogFindMany,
    },
    userAccount: { findMany: mockUserFindMany },
  },
}))

const { findAuditLogsPaginated } = await import('./audit-log.server')

beforeEach(() => {
  vi.resetAllMocks()
  mockAuditLogCount.mockResolvedValue(0)
  mockAuditLogFindMany.mockResolvedValue([])
  mockUserFindMany.mockResolvedValue([])
})

describe('findAuditLogsPaginated', () => {
  it('threads congregationId into both count and findMany where', async () => {
    await findAuditLogsPaginated({ congregationId: 42, page: 1, pageSize: 25 })
    expect(mockAuditLogCount).toHaveBeenCalledWith({ where: { congregationId: 42 } })
    expect(mockAuditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { congregationId: 42 } }))
  })

  it('adds an action filter when provided', async () => {
    await findAuditLogsPaginated({ congregationId: 1, page: 1, pageSize: 25, action: 'user.created' })
    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ action: 'user.created' }) }),
    )
  })

  it('adds a createdAt gte/lte range when dateFrom/dateTo are provided', async () => {
    await findAuditLogsPaginated({
      congregationId: 1,
      page: 1,
      pageSize: 25,
      dateFrom: '2026-01-01',
      dateTo: '2026-06-30',
    })
    const call = mockAuditLogFindMany.mock.calls[0][0]
    expect(call.where.createdAt).toEqual({
      gte: new Date('2026-01-01'),
      lte: new Date('2026-06-30'),
    })
  })

  it('applies skip and take from page/pageSize', async () => {
    await findAuditLogsPaginated({ congregationId: 1, page: 3, pageSize: 20 })
    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 40, take: 20, orderBy: { createdAt: 'desc' } }),
    )
  })

  it('backfills actorEmail from UserAccount when the row is missing it', async () => {
    mockAuditLogCount.mockResolvedValue(1)
    mockAuditLogFindMany.mockResolvedValue([
      { id: 1, action: 'x', actorId: 10, actorEmail: null, createdAt: new Date() },
    ])
    mockUserFindMany.mockResolvedValue([{ id: 10, email: 'user@example.com' }])

    const result = await findAuditLogsPaginated({ congregationId: 1, page: 1, pageSize: 25 })

    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { id: { in: [10] } },
      select: { id: true, email: true },
    })
    expect(result.logs[0].actorEmail).toBe('user@example.com')
  })

  it('skips the userAccount lookup when every log already has actorEmail', async () => {
    mockAuditLogFindMany.mockResolvedValue([{ id: 1, actorId: 10, actorEmail: 'stored@example.com' }])
    await findAuditLogsPaginated({ congregationId: 1, page: 1, pageSize: 25 })
    expect(mockUserFindMany).not.toHaveBeenCalled()
  })

  it('leaves actorEmail as null when actorId is null and no email was stored', async () => {
    mockAuditLogFindMany.mockResolvedValue([{ id: 1, actorId: null, actorEmail: null }])
    const result = await findAuditLogsPaginated({ congregationId: 1, page: 1, pageSize: 25 })
    expect(result.logs[0].actorEmail).toBeNull()
  })

  it('returns the total count from the parallel count query', async () => {
    mockAuditLogCount.mockResolvedValue(42)
    const result = await findAuditLogsPaginated({ congregationId: 1, page: 1, pageSize: 25 })
    expect(result.count).toBe(42)
  })
})
