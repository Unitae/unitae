import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberId } from '~/shared/types/branded'

const memberId = 1 as MemberId

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { MemberReturned: 'member.returned' },
  audit: vi.fn(),
}))
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))
vi.mock('~/shared/domain/built-in-roles.server', () => ({ syncBuiltInRoleAssignments: vi.fn() }))

const { setMemberReturned } = await import('./set-member-returned.server')
const { audit } = await import('~/shared/domain/audit.server')
const { syncBuiltInRoleAssignments } = await import('~/shared/domain/built-in-roles.server')
const { NotFoundError } = await import('~/shared/errors/app-error.server')

const mockDb = {
  member: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('setMemberReturned', () => {
  it('throws NotFoundError when the member does not exist', async () => {
    mockDb.member.findFirst.mockResolvedValue(null)

    await expect(setMemberReturned(mockDb as never, memberId, 10, 99)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('returns early when leftAt is already null', async () => {
    const sentinel = { id: 1, leftAt: null }
    mockDb.member.findFirst.mockResolvedValue(sentinel)

    const result = await setMemberReturned(mockDb as never, memberId, 10, 99)

    expect(result).toBe(sentinel)
    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('clears leftAt, re-syncs roles, and audits MemberReturned', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, leftAt: new Date('2024-01-01') })
    const updated = { id: 1, leftAt: null }
    mockDb.member.update.mockResolvedValue(updated)

    const result = await setMemberReturned(mockDb as never, memberId, 10, 99)

    expect(result).toBe(updated)
    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 1, congregationId: 10 } },
      data: { leftAt: null },
    })
    expect(syncBuiltInRoleAssignments).toHaveBeenCalledWith(mockDb, 1, 10, 99)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'member.returned',
        congregationId: 10,
        actorId: 99,
        entityType: 'Member',
        entityId: 1,
      }),
    )
  })
})
