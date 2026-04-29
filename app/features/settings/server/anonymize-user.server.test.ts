import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserId } from '~/shared/types/branded'

const ANONYMIZED_EMAIL_PATTERN = /^deleted-.*@anonymized\.local$/

const mockDb = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  publisherGroup: { updateMany: vi.fn() },
  attribution: { updateMany: vi.fn() },
  congregationUserRole: { deleteMany: vi.fn() },
  passwordResetToken: { deleteMany: vi.fn() },
  boardDocumentVersion: { updateMany: vi.fn() },
  dataDeletionRecord: { create: vi.fn() },
}

const { anonymizeUser } = await import('./anonymize-user.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('anonymizeUser', () => {
  it('anonymise les donnees personnelles de l utilisateur', async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: 1,
      anonymizedAt: null,
      congregationId: 10,
    } as never)
    mockDb.user.update.mockResolvedValue({} as never)
    mockDb.publisherGroup.updateMany.mockResolvedValue({ count: 0 } as never)
    mockDb.attribution.updateMany.mockResolvedValue({ count: 1 } as never)
    mockDb.congregationUserRole.deleteMany.mockResolvedValue({ count: 2 } as never)
    mockDb.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 } as never)
    mockDb.boardDocumentVersion.updateMany.mockResolvedValue({ count: 0 } as never)
    mockDb.dataDeletionRecord.create.mockResolvedValue({} as never)

    await anonymizeUser(mockDb as never, 1 as UserId, 'admin:5')

    const updateCall = mockDb.user.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: 1 })
    expect(updateCall.data.firstname).toBe('Utilisateur')
    expect(updateCall.data.lastname).toBe('supprime')
    expect(updateCall.data.email).toMatch(ANONYMIZED_EMAIL_PATTERN)
    expect(updateCall.data.password).toBe('')
    expect(updateCall.data.phone).toBeNull()
    expect(updateCall.data.address).toBeNull()
    expect(updateCall.data.birthDate).toBeNull()
    expect(updateCall.data.baptismDate).toBeNull()
    expect(updateCall.data.active).toBe(false)
    expect(updateCall.data.anonymizedAt).toBeInstanceOf(Date)

    expect(mockDb.publisherGroup.updateMany).toHaveBeenCalledWith({ where: { deputyId: 1 }, data: { deputyId: null } })
    expect(mockDb.attribution.updateMany).toHaveBeenCalledWith({
      where: { publisherId: 1, endDate: null },
      data: { endDate: expect.any(Date) },
    })
    expect(mockDb.congregationUserRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } })
    expect(mockDb.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } })
    expect(mockDb.boardDocumentVersion.updateMany).toHaveBeenCalledWith({
      where: { uploadedById: 1 },
      data: { uploadedById: null },
    })

    const deletionRecord = mockDb.dataDeletionRecord.create.mock.calls[0][0]
    expect(deletionRecord.data.entityType).toBe('User')
    expect(deletionRecord.data.entityId).toBe(1)
    expect(deletionRecord.data.requestedBy).toBe('admin:5')
  })

  it('refuse d anonymiser un utilisateur inexistant', async () => {
    mockDb.user.findUnique.mockResolvedValue(null as never)

    await expect(anonymizeUser(mockDb as never, 999 as UserId, 'admin:5')).rejects.toThrow('Utilisateur introuvable : 999')
  })

  it('refuse d anonymiser un utilisateur deja anonymise', async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: 1,
      anonymizedAt: new Date(),
      congregationId: 10,
    } as never)

    await expect(anonymizeUser(mockDb as never, 1 as UserId, 'admin:5')).rejects.toThrow('Utilisateur deja anonymise : 1')
  })
})
