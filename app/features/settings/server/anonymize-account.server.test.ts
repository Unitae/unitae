import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { AccountId } from '~/shared/types/branded'

const ANON_EMAIL_RE = /^deleted-[0-9a-f-]+@anonymized\.local$/

const mockRequireNotLastAdmin = vi.fn()
const mockAudit = vi.fn()

vi.mock('~/shared/auth/permissions.server', () => ({
  requireNotLastAdmin: mockRequireNotLastAdmin,
}))
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { UserAnonymized: 'user.anonymized' },
  audit: mockAudit,
}))

const mockDb = {
  userAccount: { findFirst: vi.fn(), update: vi.fn() },

  userRoleAssignment: { deleteMany: vi.fn() },
  passwordResetToken: { deleteMany: vi.fn() },
  boardDocumentVersion: { updateMany: vi.fn() },
  dataDeletionRecord: { create: vi.fn() },
}
// biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
const dbCast = mockDb as any

const { anonymizeAccount } = await import('./anonymize-account.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('anonymizeAccount', () => {
  it('throws NotFoundError when the account is missing', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue(null)
    await expect(anonymizeAccount(dbCast, 5 as AccountId, 42, 99)).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when the account was already anonymized', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, anonymizedAt: new Date('2026-01-01') })
    await expect(anonymizeAccount(dbCast, 5 as AccountId, 42, 99)).rejects.toThrow(ConflictError)
  })

  it('refuses to anonymize the last admin (guarded by requireNotLastAdmin)', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, anonymizedAt: null })
    mockRequireNotLastAdmin.mockRejectedValue(new ConflictError('last admin'))

    await expect(anonymizeAccount(dbCast, 5 as AccountId, 42, 99)).rejects.toThrow(ConflictError)
    expect(mockDb.userAccount.update).not.toHaveBeenCalled()
  })

  it('scrambles the email, clears the password + display name, marks inactive, stamps anonymizedAt', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, anonymizedAt: null })

    await anonymizeAccount(dbCast, 5 as AccountId, 42, 99)

    const update = mockDb.userAccount.update.mock.calls[0][0]
    expect(update.where).toEqual({ id_congregationId: { id: 5, congregationId: 42 } })
    expect(update.data.firstname).toBeNull()
    expect(update.data.lastname).toBeNull()
    expect(update.data.password).toBe('')
    expect(update.data.active).toBe(false)
    expect(update.data.anonymizedAt).toBeInstanceOf(Date)
    expect(update.data.email).toMatch(ANON_EMAIL_RE)
  })

  it('purges role assignments and password-reset tokens', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, anonymizedAt: null })

    await anonymizeAccount(dbCast, 5 as AccountId, 42, 99)

    // Dropping the role assignments is what actually revokes access now: since
    // #149 there is no direct grant left to strip alongside them.
    expect(mockDb.userRoleAssignment.deleteMany).toHaveBeenCalledWith({ where: { userId: 5, congregationId: 42 } })
    expect(mockDb.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 5 } })
  })

  it('detaches uploads on BoardDocumentVersion by nulling `uploadedById`', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, anonymizedAt: null })

    await anonymizeAccount(dbCast, 5 as AccountId, 42, 99)

    expect(mockDb.boardDocumentVersion.updateMany).toHaveBeenCalledWith({
      where: { uploadedById: 5, congregationId: 42 },
      data: { uploadedById: null },
    })
  })

  it('writes a DataDeletionRecord attributed to the actor', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, anonymizedAt: null })

    await anonymizeAccount(dbCast, 5 as AccountId, 42, 99)

    expect(mockDb.dataDeletionRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'UserAccount',
        entityId: 5,
        congregationId: 42,
        requestedBy: 'admin:99',
      }),
    })
  })

  it('emits an audit event on success', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, anonymizedAt: null })

    await anonymizeAccount(dbCast, 5 as AccountId, 42, 99)

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.anonymized',
        entityType: 'UserAccount',
        entityId: 5,
        congregationId: 42,
        actorId: 99,
      }),
    )
  })
})
