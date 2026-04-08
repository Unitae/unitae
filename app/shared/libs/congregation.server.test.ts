import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  unscopedDb: {
    congregation: { findUnique: vi.fn() },
  },
  congregationContext: {
    getStore: vi.fn(),
  },
}))

const { resolveCongregation, getCongregationFromContext, requireCongregation, getPlatformName } = await import(
  './congregation.server'
)
const { unscopedDb: db, congregationContext } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

const baseCongregation = {
  id: 1,
  name: 'Congrégation Test',
  slug: 'test',
  displayName: null,
  emailFromName: null,
  emailFromAddress: null,
  baseUrl: null,
  plan: null,
  maxPublishers: null,
  maxTerritories: null,
  maxUsers: null,
  maxStorageBytes: null,
  maxBoardDocuments: null,
  suspendedAt: null,
  suspendedReason: null,
}

describe('resolveCongregation', () => {
  it('lance une erreur si la congrégation n\'existe pas', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue(null)

    await expect(resolveCongregation(999)).rejects.toThrow('Congregation 999 not found')
  })

  it('utilise le nom comme displayName par défaut', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation)

    const result = await resolveCongregation(1)
    expect(result.displayName).toBe('Congrégation Test')
  })

  it('utilise displayName quand il est défini', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      displayName: 'Nom affiché',
    })

    const result = await resolveCongregation(1)
    expect(result.displayName).toBe('Nom affiché')
  })

  it('utilise l\'email par défaut quand emailFromAddress est null', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation)

    const result = await resolveCongregation(1)
    expect(result.emailFrom).toBe('Unitae <noreply@unitae.app>')
  })

  it('construit l\'emailFrom à partir de emailFromAddress et emailFromName', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      emailFromName: 'Ma Congré',
      emailFromAddress: 'contact@congregation.org',
    })

    const result = await resolveCongregation(1)
    expect(result.emailFrom).toBe('Ma Congré <contact@congregation.org>')
  })

  it('utilise le nom de congrégation quand emailFromName est null', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      emailFromAddress: 'contact@test.org',
    })

    const result = await resolveCongregation(1)
    expect(result.emailFrom).toBe('Congrégation Test <contact@test.org>')
  })

  it('construit le baseUrl à partir du slug quand baseUrl est null', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation)

    const result = await resolveCongregation(1)
    expect(result.baseUrl).toBe('https://test.unitae.app')
  })

  it('utilise le baseUrl personnalisé quand il est défini', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      baseUrl: 'https://custom.example.com',
    })

    const result = await resolveCongregation(1)
    expect(result.baseUrl).toBe('https://custom.example.com')
  })

  it('transmet les champs de plan et limites', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      plan: 'pro',
      maxPublishers: 100,
      maxTerritories: 50,
      maxUsers: 10,
      maxStorageBytes: 1000000n,
      maxBoardDocuments: 25,
    })

    const result = await resolveCongregation(1)
    expect(result.plan).toBe('pro')
    expect(result.maxPublishers).toBe(100)
    expect(result.maxTerritories).toBe(50)
    expect(result.maxUsers).toBe(10)
    expect(result.maxStorageBytes).toBe(1000000n)
    expect(result.maxBoardDocuments).toBe(25)
  })

  it('transmet les champs de suspension', async () => {
    const suspendedDate = new Date(2025, 3, 1)
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      suspendedAt: suspendedDate,
      suspendedReason: 'Impayé',
    })

    const result = await resolveCongregation(1)
    expect(result.suspendedAt).toBe(suspendedDate)
    expect(result.suspendedReason).toBe('Impayé')
  })
})

describe('getCongregationFromContext', () => {
  it('retourne null quand le contexte n\'est pas défini', () => {
    vi.mocked(congregationContext.getStore).mockReturnValue(undefined)

    expect(getCongregationFromContext()).toBeNull()
  })

  it('retourne la congrégation du contexte', () => {
    const fakeCongregation = { id: 1, name: 'Test' }
    vi.mocked(congregationContext.getStore).mockReturnValue({
      congregationId: 1,
      congregation: fakeCongregation,
    })

    expect(getCongregationFromContext()).toBe(fakeCongregation)
  })

  it('retourne null quand le contexte existe mais sans congrégation', () => {
    vi.mocked(congregationContext.getStore).mockReturnValue({
      congregationId: 1,
    })

    expect(getCongregationFromContext()).toBeNull()
  })
})

describe('requireCongregation', () => {
  it('lance une erreur quand le contexte n\'est pas défini', () => {
    vi.mocked(congregationContext.getStore).mockReturnValue(undefined)

    expect(() => requireCongregation()).toThrow('Congregation context is required but not set')
  })

  it('retourne la congrégation quand le contexte est défini', () => {
    const fakeCongregation = { id: 1, name: 'Test' }
    vi.mocked(congregationContext.getStore).mockReturnValue({
      congregationId: 1,
      congregation: fakeCongregation,
    })

    expect(requireCongregation()).toBe(fakeCongregation)
  })
})

describe('getPlatformName', () => {
  it('retourne "Unitae"', () => {
    expect(getPlatformName()).toBe('Unitae')
  })
})
