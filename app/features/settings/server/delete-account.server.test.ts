import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountId } from '~/shared/types/branded'

const accountId = 1 as AccountId

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { AccountDeleted: 'account.deleted' },
  audit: vi.fn(),
}))
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))
vi.mock('~/shared/auth/permissions.server', () => ({ requireNotLastAdmin: vi.fn() }))

const { deleteAccount } = await import('./delete-account.server')
const { audit } = await import('~/shared/domain/audit.server')
const { NotFoundError } = await import('~/shared/errors/app-error.server')

const mockDb = {
  userAccount: { findFirst: vi.fn(), delete: vi.fn() },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('deleteAccount', () => {
  it('throws NotFoundError when the account does not exist', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue(null)

    await expect(deleteAccount(mockDb as never, accountId, 10, 99)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('deletes the account and audits with deleted=true metadata', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 1, email: 'a@b.test', memberId: 42 })
    mockDb.userAccount.delete.mockResolvedValue({ id: 1 })

    const result = await deleteAccount(mockDb as never, accountId, 10, 99)

    expect(result).toEqual({ accountId: 1, memberId: 42 })
    expect(mockDb.userAccount.delete).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'account.deleted',
        congregationId: 10,
        actorId: 99,
        entityType: 'UserAccount',
        entityId: 1,
        metadata: { email: 'a@b.test', memberId: 42 },
      }),
    )
  })

  it('returns memberId: null for account-only deletions', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 1, email: 'admin@test', memberId: null })
    mockDb.userAccount.delete.mockResolvedValue({ id: 1 })

    const result = await deleteAccount(mockDb as never, accountId, 10, 99)

    expect(result).toEqual({ accountId: 1, memberId: null })
  })
})
