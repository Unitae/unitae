import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('react-router', () => ({
  redirect: vi.fn((url: string) => {
    // biome-ignore lint/style/useNamingConvention: standard HTTP header
    throw new Response(null, { status: 302, headers: { Location: url } })
  }),
}))

const { resolveCongregation, resolveCongregationFromRequest, getPlatformName } = await import('./congregation.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

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
  it("lance une erreur si la congrégation n'existe pas", async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue(null as never)

    await expect(resolveCongregation(999)).rejects.toThrow('Congregation 999 not found')
  })

  it('utilise le nom comme displayName par défaut', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation as never)

    const result = await resolveCongregation(1)
    expect(result.displayName).toBe('Congrégation Test')
  })

  it('utilise displayName quand il est défini', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      displayName: 'Nom affiché',
    } as never)

    const result = await resolveCongregation(1)
    expect(result.displayName).toBe('Nom affiché')
  })

  it("utilise l'email par défaut quand emailFromAddress est null", async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation as never)

    const result = await resolveCongregation(1)
    expect(result.emailFrom).toBe('Unitae <noreply@unitae.app>')
  })

  it("construit l'emailFrom à partir de emailFromAddress et emailFromName", async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      emailFromName: 'Ma Congré',
      emailFromAddress: 'contact@congregation.org',
    } as never)

    const result = await resolveCongregation(1)
    expect(result.emailFrom).toBe('Ma Congré <contact@congregation.org>')
  })

  it('utilise le nom de congrégation quand emailFromName est null', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      emailFromAddress: 'contact@test.org',
    } as never)

    const result = await resolveCongregation(1)
    expect(result.emailFrom).toBe('Congrégation Test <contact@test.org>')
  })

  it('construit le baseUrl à partir du slug quand baseUrl est null', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation as never)

    const result = await resolveCongregation(1)
    expect(result.baseUrl).toBe('https://test.unitae.app')
  })

  it('utilise le baseUrl personnalisé quand il est défini', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      baseUrl: 'https://custom.example.com',
    } as never)

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
    } as never)

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
    } as never)

    const result = await resolveCongregation(1)
    expect(result.suspendedAt).toBe(suspendedDate)
    expect(result.suspendedReason).toBe('Impayé')
  })
})

describe('getPlatformName', () => {
  it('retourne "Unitae"', () => {
    expect(getPlatformName()).toBe('Unitae')
  })
})

describe('resolveCongregationFromRequest', () => {
  function makeRequest(url: string) {
    return new Request(url)
  }

  it('retourne null en mode mono-tenant', async () => {
    delete process.env.MULTI_TENANT

    const result = await resolveCongregationFromRequest(makeRequest('https://tenant-alpha.unitae.app/'))
    expect(result).toBeNull()
  })

  it('retourne la congrégation correspondant au slug du sous-domaine', async () => {
    process.env.MULTI_TENANT = 'true'
    process.env.APP_BASE_URL = 'unitae.app'
    vi.mocked(db.congregation.findUnique).mockResolvedValue({ id: 1, slug: 'tenant-alpha' } as never)

    const result = await resolveCongregationFromRequest(makeRequest('https://tenant-alpha.unitae.app/'))
    expect(result).toEqual({ id: 1, slug: 'tenant-alpha' })
    expect(db.congregation.findUnique).toHaveBeenCalledWith({
      where: { slug: 'tenant-alpha' },
      select: { id: true, slug: true },
    })
  })

  it('redirige vers /congregation-not-found si le slug ne correspond à aucune assemblée', async () => {
    process.env.MULTI_TENANT = 'true'
    process.env.APP_BASE_URL = 'unitae.app'
    vi.mocked(db.congregation.findUnique).mockResolvedValue(null as never)

    await expect(resolveCongregationFromRequest(makeRequest('https://inconnu.unitae.app/'))).rejects.toSatisfy(
      (error: Response) => error instanceof Response && error.headers.get('Location') === '/congregation-not-found',
    )
  })

  it("résout par domaine personnalisé quand il n'y a pas de slug", async () => {
    process.env.MULTI_TENANT = 'true'
    process.env.APP_BASE_URL = 'unitae.app'
    vi.mocked(db.congregation.findFirst).mockResolvedValue({ id: 2, slug: 'paris' } as never)

    const result = await resolveCongregationFromRequest(makeRequest('https://custom.example.com/'))
    expect(result).toEqual({ id: 2, slug: 'paris' })
    expect(db.congregation.findFirst).toHaveBeenCalledWith({
      where: { domain: 'custom.example.com' },
      select: { id: true, slug: true },
    })
  })

  it('retourne null pour le domaine racine sans slug ni domaine personnalisé', async () => {
    process.env.MULTI_TENANT = 'true'
    process.env.APP_BASE_URL = 'unitae.app'
    vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)

    const result = await resolveCongregationFromRequest(makeRequest('https://custom-unknown.example.com/'))
    expect(result).toBeNull()
  })
})
