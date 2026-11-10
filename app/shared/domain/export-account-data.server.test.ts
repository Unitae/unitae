import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  userAccount: { findUnique: vi.fn() },
  rolePermission: { findMany: vi.fn() },
  publisherActivity: { findMany: vi.fn() },
  attribution: { findMany: vi.fn() },
  publisherGroup: { findFirst: vi.fn() },
  event: { findMany: vi.fn() },
  boardDocumentView: { findMany: vi.fn() },
  boardDocumentVersion: { findMany: vi.fn() },
  consentRecord: { findMany: vi.fn() },
}

const { accountDataDownload, exportAccountData } = await import('./export-account-data.server')

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
        pioneerEnrolments: [],
        isHelder: false,
        isServant: true,
        isAnointed: false,
        publisherGroupId: 1,
        leftAt: null,
        anonymizedAt: null,
      },
    }

    mockDb.userAccount.findUnique.mockResolvedValue(fakeAccount as never)
    // Permissions reach an account only through roles since #149.
    mockDb.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'Admin' } }] as never)
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
    const readAt = new Date('2026-11-08T09:00:00Z')
    mockDb.boardDocumentView.findMany.mockResolvedValue([
      { viewedAt: readAt, document: { title: 'Lettre', type: 'pdf', createdAt: new Date('2026-11-01') } },
      { viewedAt: null, document: { title: 'Ancien', type: 'pdf', createdAt: new Date('2026-01-01') } },
    ] as never)
    mockDb.boardDocumentVersion.findMany.mockResolvedValue([] as never)
    mockDb.consentRecord.findMany.mockResolvedValue([] as never)

    const result = await exportAccountData(mockDb as never, 1, 42)

    // Each board document the person opened, with when, where that is known.
    expect(result.boardDocumentsViewed).toEqual([
      { title: 'Lettre', type: 'pdf', createdAt: new Date('2026-11-01'), viewedAt: readAt },
      { title: 'Ancien', type: 'pdf', createdAt: new Date('2026-01-01'), viewedAt: null },
    ])

    expect(mockDb.userAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_congregationId: { id: 1, congregationId: 42 } } }),
    )
    // The pastoral follow-up dates are part of what the app holds about the person.
    expect(mockDb.userAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          member: { select: expect.objectContaining({ arrivedAt: true, lastPastoralVisitAt: true }) },
        }),
      }),
    )
    // The language the person chose for themselves is part of what the app holds about them.
    expect(mockDb.userAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ locale: true }) }),
    )
    expect(result.user).toEqual(fakeAccount)
    expect(result.permissions).toEqual([{ key: 'Admin' }])
    expect(result.publisherActivities).toHaveLength(1)
    expect(result.attributions).toHaveLength(1)
    expect(result.publisherGroup).not.toBeNull()
    expect(result.exportVersion).toBe('2.0')
    expect(result.exportDate).toBeDefined()
  })

  // Regression: the select still asked for Member.type, dropped with the pioneer enrolments. The client rejected
  // the query at runtime (tsc does not check nested selects), so every export failed with a 500.
  it('reads the pioneer service from the enrolments, not from the dropped Member.type', async () => {
    mockDb.userAccount.findUnique.mockResolvedValue(null as never)

    await exportAccountData(mockDb as never, 1, 42).catch(() => undefined)

    const select = mockDb.userAccount.findUnique.mock.calls[0]?.[0]?.select?.member?.select
    expect(select).not.toHaveProperty('type')
    expect(select).toHaveProperty('pioneerEnrolments')
  })

  // Same failure: events still asked for their `kind`, replaced by the programme template.
  it('names the template of the events the person created, not the dropped Event.kind', async () => {
    mockDb.userAccount.findUnique.mockResolvedValue({ memberId: null } as never)
    for (const table of [
      mockDb.rolePermission,
      mockDb.event,
      mockDb.boardDocumentView,
      mockDb.boardDocumentVersion,
      mockDb.consentRecord,
    ]) {
      table.findMany.mockResolvedValue([] as never)
    }

    await exportAccountData(mockDb as never, 1, 42)

    const select = mockDb.event.findMany.mock.calls[0]?.[0]?.select
    expect(select).not.toHaveProperty('kind')
    expect(select).toHaveProperty('template')
  })

  it('lance une erreur si l utilisateur n existe pas', async () => {
    mockDb.userAccount.findUnique.mockResolvedValue(null as never)

    await expect(exportAccountData(mockDb as never, 999, 42)).rejects.toThrow('Utilisateur introuvable : 999')
  })
})

describe('accountDataDownload', () => {
  it('hands the export over as a JSON file named after the account, in no particular language', async () => {
    const response = accountDataDownload({ exportVersion: '2.0' } as never, 775)

    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="unitae-account-775.json"')
    expect(await response.json()).toEqual({ exportVersion: '2.0' })
  })
})
