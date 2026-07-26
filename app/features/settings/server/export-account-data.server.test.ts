import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  userAccount: { findUnique: vi.fn() },
  congregationUserPermission: { findMany: vi.fn() },
  publisherActivity: { findMany: vi.fn() },
  attribution: { findMany: vi.fn() },
  publisherGroup: { findFirst: vi.fn() },
  event: { findMany: vi.fn() },
  boardDocument: { findMany: vi.fn() },
  boardDocumentVersion: { findMany: vi.fn() },
  consentRecord: { findMany: vi.fn() },
}

const { exportAccountData } = await import('./export-account-data.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('exportAccountData', () => {
  it('retourne toutes les donnees personnelles de l utilisateur', async () => {
    const fakeAccount = {
      id: 1,
      firstname: null,
      lastname: null,
      email: 'jean@test.com',
      active: true,
      platformAdmin: false,
      anonymizedAt: null,
      memberId: 7,
      member: {
        id: 7,
        firstname: 'Jean',
        lastname: 'Dupont',
        phone: '0600000000',
        address: '1 rue de la Paix',
        isMale: true,
        birthDate: new Date('1990-01-01'),
        baptismDate: new Date('2010-06-15'),
        isPublisher: true,
        type: 'normal',
        isHelder: false,
        isServant: true,
        isAnointed: false,
        publisherGroupId: 1,
        leftAt: null,
        anonymizedAt: null,
      },
    }

    mockDb.userAccount.findUnique.mockResolvedValue(fakeAccount as never)
    mockDb.congregationUserPermission.findMany.mockResolvedValue([{ permission: { key: 'Admin' } }] as never)
    mockDb.publisherActivity.findMany.mockResolvedValue([
      { month: 3, year: 2025, hours: 10, studies: 1, type: 'normal', isPublisher: true, notes: '' },
    ] as never)
    mockDb.attribution.findMany.mockResolvedValue([
      {
        territory: { number: '42', type: 'doors-to-doors' },
        type: 'default',
        startDate: new Date(),
        endDate: null,
        lateDate: new Date(),
        notes: '',
      },
    ] as never)
    mockDb.publisherGroup.findFirst.mockResolvedValue({
      name: 'Groupe 1',
      adress: '5 rue Test',
      responsibleId: 1,
      deputyId: null,
    } as never)
    mockDb.event.findMany.mockResolvedValue([] as never)
    mockDb.boardDocument.findMany.mockResolvedValue([] as never)
    mockDb.boardDocumentVersion.findMany.mockResolvedValue([] as never)
    mockDb.consentRecord.findMany.mockResolvedValue([] as never)

    const result = await exportAccountData(mockDb as never, 1, 42)

    expect(mockDb.userAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_congregationId: { id: 1, congregationId: 42 } } }),
    )
    expect(result.user).toEqual(fakeAccount)
    expect(result.permissions).toEqual([{ key: 'Admin' }])
    expect(result.publisherActivities).toHaveLength(1)
    expect(result.attributions).toHaveLength(1)
    expect(result.publisherGroup).not.toBeNull()
    expect(result.exportVersion).toBe('2.0')
    expect(result.exportDate).toBeDefined()
  })

  it('lance une erreur si l utilisateur n existe pas', async () => {
    mockDb.userAccount.findUnique.mockResolvedValue(null as never)

    await expect(exportAccountData(mockDb as never, 999, 42)).rejects.toThrow('Utilisateur introuvable : 999')
  })
})
