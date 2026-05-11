import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberId } from '~/shared/types/branded'

const memberId = 1 as MemberId

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { MemberLeft: 'member.left' },
  audit: vi.fn(),
}))
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))
vi.mock('~/shared/domain/built-in-roles.server', () => ({ syncBuiltInRoleAssignments: vi.fn() }))

const { setMemberLeft } = await import('./set-member-left.server')
const { audit } = await import('~/shared/domain/audit.server')
const { syncBuiltInRoleAssignments } = await import('~/shared/domain/built-in-roles.server')
const { NotFoundError } = await import('~/shared/errors/app-error.server')

const mockDb = {
  member: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  userRoleAssignment: {
    deleteMany: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('setMemberLeft', () => {
  it('throws NotFoundError when the member does not exist', async () => {
    mockDb.member.findFirst.mockResolvedValue(null)

    await expect(setMemberLeft(mockDb as never, memberId, 10, 99)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('returns early without writing when leftAt is already set', async () => {
    const sentinel = { id: 1, leftAt: new Date('2024-01-01'), account: null }
    mockDb.member.findFirst.mockResolvedValue(sentinel)

    const result = await setMemberLeft(mockDb as never, memberId, 10, 99)

    expect(result).toBe(sentinel)
    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('sets leftAt and audits MemberLeft on a still-active member', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, leftAt: null, account: null })
    const updated = { id: 1, leftAt: new Date('2026-05-10'), congregationId: 10 }
    mockDb.member.update.mockResolvedValue(updated)

    const result = await setMemberLeft(mockDb as never, memberId, 10, 99)

    expect(result).toBe(updated)
    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 1, congregationId: 10 } },
      data: { leftAt: expect.any(Date) },
    })
    expect(syncBuiltInRoleAssignments).toHaveBeenCalledWith(mockDb, 1, 10, 99)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'member.left',
        congregationId: 10,
        actorId: 99,
        entityType: 'Member',
        entityId: 1,
      }),
    )
  })

  it('drops UserRoleAssignment rows when the member has a linked account', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, leftAt: null, account: { id: 42 } })
    mockDb.member.update.mockResolvedValue({ id: 1, leftAt: new Date() })

    await setMemberLeft(mockDb as never, memberId, 10, 99)

    expect(mockDb.userRoleAssignment.deleteMany).toHaveBeenCalledWith({ where: { userId: 42 } })
  })

  it('skips the role-assignment cleanup when no account is linked', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, leftAt: null, account: null })
    mockDb.member.update.mockResolvedValue({ id: 1, leftAt: new Date() })

    await setMemberLeft(mockDb as never, memberId, 10, 99)

    expect(mockDb.userRoleAssignment.deleteMany).not.toHaveBeenCalled()
  })
})
