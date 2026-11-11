import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberId } from '~/shared/types/branded'

const memberId = 1 as MemberId

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { AccountLinkedToMember: 'account.linked_to_member' },
  audit: vi.fn(),
}))
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))
const { openAccessChecks } = vi.hoisted(() => ({ openAccessChecks: [] as number[] }))
vi.mock('~/shared/domain/role-membership.server', async () => {
  const { GrantBeyondActorError } = await import('~/shared/domain/role-grant-limits.server')
  return {
    // Member 66's record holds a role whose rights the actor lacks.
    assertMayOpenAccessForRecord: vi.fn(async (_db: unknown, memberId: number) => {
      openAccessChecks.push(memberId)
      if (memberId === 66) throw new GrantBeyondActorError('Cannot grant can-do-anything: not held by the actor')
    }),
  }
})
vi.mock('~/features/authentication/server/invalidate-account-password.server', () => ({
  createPasswordResetToken: vi.fn().mockResolvedValue('token-xyz'),
}))

const { linkAccountToMember } = await import('./link-account-to-member.server')
const { audit } = await import('~/shared/domain/audit.server')
const { createPasswordResetToken } = await import('~/features/authentication/server/invalidate-account-password.server')
const { ConflictError, NotFoundError } = await import('~/shared/errors/app-error.server')

const mockDb = {
  member: { findFirst: vi.fn() },
  userAccount: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(createPasswordResetToken).mockResolvedValue('token-xyz')
})

describe('linkAccountToMember', () => {
  it('throws NotFoundError when the member does not exist', async () => {
    mockDb.member.findFirst.mockResolvedValue(null)

    await expect(
      linkAccountToMember(mockDb as never, {
        memberId: memberId,
        email: 'a@b.test',
        congregationId: 10,
        actorId: 99,
        actorPermissions: new Set(['can-manage-publishers']),
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws ConflictError when the member already has an account', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, account: { id: 7 } })

    await expect(
      linkAccountToMember(mockDb as never, {
        memberId: memberId,
        email: 'a@b.test',
        congregationId: 10,
        actorId: 99,
        actorPermissions: new Set(['can-manage-publishers']),
      }),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('throws ConflictError when the email is already taken', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, firstname: 'Marie', account: null })
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 12 })

    await expect(
      linkAccountToMember(mockDb as never, {
        memberId: memberId,
        email: 'a@b.test',
        congregationId: 10,
        actorId: 99,
        actorPermissions: new Set(['can-manage-publishers']),
      }),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('creates the account, generates a reset token, and audits', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, firstname: 'Marie', account: null })
    mockDb.userAccount.findFirst.mockResolvedValue(null)
    mockDb.userAccount.create.mockResolvedValue({ id: 42 })

    const result = await linkAccountToMember(mockDb as never, {
      memberId: memberId,
      email: 'A@B.test',
      congregationId: 10,
      actorId: 99,
      actorPermissions: new Set(['can-manage-publishers']),
    })

    expect(result).toEqual({ accountId: 42, resetToken: 'token-xyz', memberFirstname: 'Marie' })
    // Email is normalized to lowercase before insert
    expect(mockDb.userAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'a@b.test', memberId: 1, congregationId: 10 }),
    })
    expect(createPasswordResetToken).toHaveBeenCalledWith(42, mockDb)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'account.linked_to_member',
        congregationId: 10,
        actorId: 99,
        entityType: 'UserAccount',
        entityId: 42,
        metadata: { memberId: 1 },
      }),
    )
  })
})

describe('linkAccountToMember — the record’s roles', () => {
  it('refuses to open an access whose roles would grant rights the actor lacks, before creating anything', async () => {
    const { GrantBeyondActorError } = await import('~/shared/domain/role-grant-limits.server')
    mockDb.member.findFirst.mockResolvedValue({ id: 66, firstname: 'Paul', account: null })
    mockDb.userAccount.findFirst.mockResolvedValue(null)

    await expect(
      linkAccountToMember(mockDb as never, {
        memberId: 66 as MemberId,
        email: 'paul@b.test',
        congregationId: 10,
        actorId: 99,
        actorPermissions: new Set(['can-manage-publishers']),
      }),
    ).rejects.toBeInstanceOf(GrantBeyondActorError)
    expect(mockDb.userAccount.create).not.toHaveBeenCalled()
  })
})
