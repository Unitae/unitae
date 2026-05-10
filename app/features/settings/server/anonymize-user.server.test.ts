import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserId } from '~/shared/types/branded'

vi.mock('~/shared/domain/built-in-roles.server', () => ({ syncBuiltInRoleAssignments: vi.fn() }))

const ANONYMIZED_EMAIL_PATTERN = /^deleted-.*@anonymized\.local$/

const mockDb = {
  userAccount: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  member: { findFirst: vi.fn(), update: vi.fn() },
  publisherGroup: { updateMany: vi.fn() },
  attribution: { updateMany: vi.fn() },
  congregationUserPermission: { deleteMany: vi.fn() },
  passwordResetToken: { deleteMany: vi.fn() },
  boardDocumentVersion: { updateMany: vi.fn() },
  dataDeletionRecord: { create: vi.fn() },
}

const { anonymizeUser } = await import('./anonymize-user.server')
const { NotFoundError, ConflictError } = await import('~/shared/errors/app-error.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('anonymizeUser', () => {
  it('anonymise les donnees personnelles de l utilisateur et du membre lie', async () => {
    mockDb.userAccount.findUnique.mockResolvedValue({
      id: 1,
      congregationId: 10,
      memberId: 1,
    } as never)
    mockDb.member.findFirst.mockResolvedValue({ id: 1, anonymizedAt: null } as never)
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 1, anonymizedAt: null } as never)
    mockDb.userAccount.update.mockResolvedValue({} as never)
    mockDb.member.update.mockResolvedValue({} as never)
    mockDb.publisherGroup.updateMany.mockResolvedValue({ count: 0 } as never)
    mockDb.attribution.updateMany.mockResolvedValue({ count: 1 } as never)
    mockDb.congregationUserPermission.deleteMany.mockResolvedValue({ count: 2 } as never)
    mockDb.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 } as never)
    mockDb.boardDocumentVersion.updateMany.mockResolvedValue({ count: 0 } as never)
    mockDb.dataDeletionRecord.create.mockResolvedValue({} as never)

    await anonymizeUser(mockDb as never, 1 as UserId, 'admin:5')

    const accountUpdate = mockDb.userAccount.update.mock.calls[0][0]
    expect(accountUpdate.where).toEqual({ id: 1 })
    expect(accountUpdate.data.firstname).toBeNull()
    expect(accountUpdate.data.lastname).toBeNull()
    expect(accountUpdate.data.email).toMatch(ANONYMIZED_EMAIL_PATTERN)
    expect(accountUpdate.data.password).toBe('')
    expect(accountUpdate.data.active).toBe(false)
    expect(accountUpdate.data.anonymizedAt).toBeInstanceOf(Date)

    const memberUpdate = mockDb.member.update.mock.calls[0][0]
    expect(memberUpdate.where).toEqual({ id_congregationId: { id: 1, congregationId: 10 } })
    expect(memberUpdate.data.firstname).toBe('Utilisateur')
    expect(memberUpdate.data.lastname).toBe('supprime')
    expect(memberUpdate.data.phone).toBe('')
    expect(memberUpdate.data.address).toBe('')
    expect(memberUpdate.data.birthDate).toBeNull()
    expect(memberUpdate.data.baptismDate).toBeNull()
    expect(memberUpdate.data.anonymizedAt).toBeInstanceOf(Date)

    expect(mockDb.publisherGroup.updateMany).toHaveBeenCalledWith({ where: { deputyId: 1 }, data: { deputyId: null } })
    expect(mockDb.attribution.updateMany).toHaveBeenCalledWith({
      where: { publisherId: 1, endDate: null },
      data: { endDate: expect.any(Date) },
    })
    expect(mockDb.congregationUserPermission.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } })
    expect(mockDb.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } })
    expect(mockDb.boardDocumentVersion.updateMany).toHaveBeenCalledWith({
      where: { uploadedById: 1 },
      data: { uploadedById: null },
    })

    const deletionEntityTypes = mockDb.dataDeletionRecord.create.mock.calls.map(c => c[0].data.entityType)
    expect(deletionEntityTypes).toEqual(expect.arrayContaining(['Member', 'UserAccount']))
  })

  it('anonymise un compte sans membre lie sans toucher aux tables de membres', async () => {
    mockDb.userAccount.findUnique.mockResolvedValue({
      id: 7,
      congregationId: 10,
      memberId: null,
    } as never)
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 7, anonymizedAt: null } as never)

    await anonymizeUser(mockDb as never, 7 as UserId, 'admin:5')

    expect(mockDb.userAccount.update).toHaveBeenCalled()
    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(mockDb.publisherGroup.updateMany).not.toHaveBeenCalled()
    expect(mockDb.attribution.updateMany).not.toHaveBeenCalled()
  })

  it('refuse d anonymiser un utilisateur inexistant', async () => {
    mockDb.userAccount.findUnique.mockResolvedValue(null as never)

    await expect(anonymizeUser(mockDb as never, 999 as UserId, 'admin:5')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuse d anonymiser un compte deja anonymise', async () => {
    mockDb.userAccount.findUnique.mockResolvedValue({
      id: 1,
      congregationId: 10,
      memberId: null,
    } as never)
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 1, anonymizedAt: new Date() } as never)

    await expect(anonymizeUser(mockDb as never, 1 as UserId, 'admin:5')).rejects.toBeInstanceOf(ConflictError)
  })
})
