import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberId } from '~/shared/types/branded'

const memberId = 1 as MemberId

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { AccountUnlinkedFromMember: 'account.unlinked_from_member' },
  audit: vi.fn(),
}))
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))
vi.mock('~/shared/auth/permissions.server', async () => {
  const { ConflictError } = await import('~/shared/errors/app-error.server')
  return {
    isAccountAdmin: vi.fn(),
    requireNotLastAdmin: vi.fn(async (accountId: number) => {
      if (lastAdminIds.has(accountId)) throw new ConflictError('last admin')
    }),
  }
})

const { lastAdminIds } = vi.hoisted(() => ({ lastAdminIds: new Set<number>() }))
const MANAGER = new Set(['can-manage-publishers'])
const ADMIN = new Set(['can-do-anything'])

const { unlinkAccountFromMember } = await import('./unlink-account-from-member.server')
const { audit } = await import('~/shared/domain/audit.server')
const { ConflictError, ForbiddenError, NotFoundError } = await import('~/shared/errors/app-error.server')
const { OwnAccountError } = await import('~/shared/domain/account-protection.server')
const { isAccountAdmin } = await import('~/shared/auth/permissions.server')

const mockDb = {
  member: { findFirst: vi.fn() },
  userAccount: { delete: vi.fn() },
}

beforeEach(() => {
  vi.resetAllMocks()
  lastAdminIds.clear()
})

describe('unlinkAccountFromMember', () => {
  it('refuses to take away the actor’s own login', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, account: { id: 99, email: 'me@b.test' } })

    await expect(unlinkAccountFromMember(mockDb as never, memberId, 10, 99, ADMIN)).rejects.toBeInstanceOf(
      OwnAccountError,
    )
    expect(mockDb.userAccount.delete).not.toHaveBeenCalled()
  })

  it('keeps an administrator’s login to administrators', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, account: { id: 5, email: 'admin@b.test' } })
    vi.mocked(isAccountAdmin).mockResolvedValue(true)

    await expect(unlinkAccountFromMember(mockDb as never, memberId, 10, 99, MANAGER)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(mockDb.userAccount.delete).not.toHaveBeenCalled()
  })

  it('refuses to take away the last administrator’s login', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, account: { id: 5, email: 'admin@b.test' } })
    lastAdminIds.add(5)

    await expect(unlinkAccountFromMember(mockDb as never, memberId, 10, 99, ADMIN)).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(mockDb.userAccount.delete).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the member does not exist', async () => {
    mockDb.member.findFirst.mockResolvedValue(null)

    await expect(unlinkAccountFromMember(mockDb as never, memberId, 10, 99, MANAGER)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('returns null when the member has no linked account', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, account: null })

    const result = await unlinkAccountFromMember(mockDb as never, memberId, 10, 99, MANAGER)

    expect(result).toBeNull()
    expect(mockDb.userAccount.delete).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('deletes the account and audits AccountUnlinkedFromMember', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, account: { id: 42, email: 'a@b.test' } })
    mockDb.userAccount.delete.mockResolvedValue({ id: 42 })

    const result = await unlinkAccountFromMember(mockDb as never, memberId, 10, 99, MANAGER)

    expect(result).toEqual({ accountId: 42, email: 'a@b.test' })
    expect(mockDb.userAccount.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 42, congregationId: 10 } },
    })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'account.unlinked_from_member',
        congregationId: 10,
        actorId: 99,
        entityType: 'UserAccount',
        entityId: 42,
        metadata: { memberId: 1, email: 'a@b.test' },
      }),
    )
  })
})
