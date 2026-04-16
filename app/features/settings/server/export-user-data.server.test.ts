import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  user: { findUnique: vi.fn() },
  congregationUserRole: { findMany: vi.fn() },
  publisherActivity: { findMany: vi.fn() },
  attribution: { findMany: vi.fn() },
  publisherGroup: { findFirst: vi.fn() },
  event: { findMany: vi.fn() },
  boardDocument: { findMany: vi.fn() },
  boardDocumentVersion: { findMany: vi.fn() },
  consentRecord: { findMany: vi.fn() },
}

const { exportUserData } = await import('./export-user-data.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('exportUserData', () => {
  it('retourne toutes les donnees personnelles de l utilisateur', async () => {
    const fakeUser = {
      id: 1,
      firstname: 'Jean',
      lastname: 'Dupont',
      email: 'jean@test.com',
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
      active: true,
      anonymizedAt: null,
      publisherGroupId: 1,
    }

    mockDb.user.findUnique.mockResolvedValue(fakeUser as never)
    mockDb.congregationUserRole.findMany.mockResolvedValue([
      { role: { key: 'Admin', description: 'Administrateur' } },
    ] as never)
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

    const result = await exportUserData(mockDb as never, 1)

    expect(result.user).toEqual(fakeUser)
    expect(result.roles).toEqual([{ key: 'Admin', description: 'Administrateur' }])
    expect(result.publisherActivities).toHaveLength(1)
    expect(result.attributions).toHaveLength(1)
    expect(result.publisherGroup).not.toBeNull()
    expect(result.exportVersion).toBe('1.0')
    expect(result.exportDate).toBeDefined()
  })

  it('lance une erreur si l utilisateur n existe pas', async () => {
    mockDb.user.findUnique.mockResolvedValue(null as never)

    await expect(exportUserData(mockDb as never, 999)).rejects.toThrow('Utilisateur introuvable : 999')
  })
})
