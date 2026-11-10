import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('react-router', () => ({
  redirect: vi.fn((url: string) => {
    throw new Response(null, { status: 302, headers: { Location: url } })
  }),
}))

const {
  findCongregation,
  getBrandingName,
  getCongregationBrand,
  resolveCongregation,
  resolveCongregationFromRequest,
  getPlatformName,
} = await import('./congregation.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const ENV_KEYS = ['UNITAE_BASE_URL', 'UNITAE_MULTI_TENANT', 'UNITAE_EMAIL_FROM', 'UNITAE_WEB_PORT', 'PORT'] as const
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))

beforeEach(() => {
  vi.resetAllMocks()
  for (const key of ENV_KEYS) delete process.env[key]
})

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
})

// Answers the slug lookup the way the table would: the row for that slug, or nothing. A test that
// reads the wrong slug from the host then gets no congregation instead of whatever was mocked.
function mockSlugLookup(rows: Record<string, object>) {
  vi.mocked(db.congregation.findUnique).mockImplementation(((args: { where: { slug?: string } }) =>
    Promise.resolve(rows[args.where.slug ?? ''] ?? null)) as never)
}

const baseCongregation = {
  id: 1,
  name: 'Congrégation Test',
  slug: 'test',
  displayName: null,
  domain: null,
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

  it('signs with UNITAE_EMAIL_FROM when the congregation has no sender of its own', async () => {
    process.env.UNITAE_EMAIL_FROM = 'Assemblées du Rhône <ne-pas-repondre@assemblees-rhone.org>'
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation as never)

    const result = await resolveCongregation(1)
    expect(result.emailFrom).toBe('Assemblées du Rhône <ne-pas-repondre@assemblees-rhone.org>')
  })

  // Regression: the default sender was noreply@unitae.app on every instance, a domain a self-hoster cannot send from.
  it("signs from the instance's own domain when UNITAE_EMAIL_FROM is unset", async () => {
    process.env.UNITAE_BASE_URL = 'https://unitae.assemblees-rhone.org'
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation as never)

    const result = await resolveCongregation(1)
    expect(result.emailFrom).toBe('Unitae <noreply@unitae.assemblees-rhone.org>')
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

  it('construit le baseUrl à partir du slug quand baseUrl est null (multi-tenant)', async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = 'https://unitae.app'
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation as never)

    const result = await resolveCongregation(1)
    expect(result.baseUrl).toBe('https://test.unitae.app')
  })

  it('keeps the scheme and port of UNITAE_BASE_URL on a tenant subdomain', async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = 'http://unitae.lan:8080/'
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation as never)

    const result = await resolveCongregation(1)
    expect(result.baseUrl).toBe('http://test.unitae.lan:8080')
  })

  it('utilise UNITAE_BASE_URL directement quand single-tenant', async () => {
    process.env.UNITAE_BASE_URL = 'https://unitae.example.com/'
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation as never)

    const result = await resolveCongregation(1)
    expect(result.baseUrl).toBe('https://unitae.example.com')
  })

  // Regression: without UNITAE_BASE_URL, links in emails (password resets included) pointed at unitae.app, so a
  // self-hosted instance sent its reset tokens to another domain.
  it('keeps links on the server itself when UNITAE_BASE_URL is unset', async () => {
    process.env.UNITAE_WEB_PORT = '8080'
    vi.mocked(db.congregation.findUnique).mockResolvedValue(baseCongregation as never)

    const result = await resolveCongregation(1)
    expect(result.baseUrl).toBe('http://localhost:8080')
  })

  it('utilise le baseUrl personnalisé quand il est défini', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      baseUrl: 'https://custom.example.com',
    } as never)

    const result = await resolveCongregation(1)
    expect(result.baseUrl).toBe('https://custom.example.com')
  })

  it('préfère le domaine personnalisé au slug pour le baseUrl', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      domain: 'app.example.org',
    } as never)

    const result = await resolveCongregation(1)
    expect(result.baseUrl).toBe('https://app.example.org')
  })

  it('préfère le domaine personnalisé au baseUrl explicite', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      domain: 'app.example.org',
      baseUrl: 'https://old.example.com',
    } as never)

    const result = await resolveCongregation(1)
    expect(result.baseUrl).toBe('https://app.example.org')
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

describe('findCongregation', () => {
  it('returns null for a congregation that does not exist', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue(null as never)

    await expect(findCongregation(999)).resolves.toBeNull()
  })

  it('returns the mapped congregation when it exists', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({
      ...baseCongregation,
      locale: 'en',
      timezone: 'Europe/London',
    } as never)

    await expect(findCongregation(1)).resolves.toMatchObject({
      id: 1,
      slug: 'test',
      displayName: 'Congrégation Test',
      locale: 'en',
      timezone: 'Europe/London',
    })
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
    delete process.env.UNITAE_MULTI_TENANT

    const result = await resolveCongregationFromRequest(makeRequest('https://tenant-alpha.unitae.app/'))
    expect(result).toBeNull()
  })

  it('retourne la congrégation correspondant au slug du sous-domaine', async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = 'unitae.app'
    vi.mocked(db.congregation.findUnique).mockResolvedValue({ id: 1, slug: 'tenant-alpha' } as never)

    const result = await resolveCongregationFromRequest(makeRequest('https://tenant-alpha.unitae.app/'))
    expect(result).toEqual({ id: 1, slug: 'tenant-alpha' })
    expect(db.congregation.findUnique).toHaveBeenCalledWith({
      where: { slug: 'tenant-alpha' },
      select: { id: true, slug: true },
    })
  })

  it('redirige vers /congregation-not-found si le slug ne correspond à aucune assemblée', async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = 'unitae.app'
    vi.mocked(db.congregation.findUnique).mockResolvedValue(null as never)

    await expect(resolveCongregationFromRequest(makeRequest('https://inconnu.unitae.app/'))).rejects.toSatisfy(
      (error: Response) => error instanceof Response && error.headers.get('Location') === '/congregation-not-found',
    )
  })

  it("résout par domaine personnalisé quand il n'y a pas de slug", async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = 'unitae.app'
    vi.mocked(db.congregation.findFirst).mockResolvedValue({ id: 2, slug: 'paris' } as never)

    const result = await resolveCongregationFromRequest(makeRequest('https://custom.example.com/'))
    expect(result).toEqual({ id: 2, slug: 'paris' })
    expect(db.congregation.findFirst).toHaveBeenCalledWith({
      where: { domain: 'custom.example.com' },
      select: { id: true, slug: true },
    })
  })

  // The self-hosting guide writes UNITAE_BASE_URL with its scheme: a subdomain has to resolve either way.
  it.each([
    'unitae.app',
    'https://unitae.app',
    'http://unitae.app',
    'https://unitae.app/',
    'https://unitae.app:8443',
    'https://Unitae.App',
  ])('resolves a subdomain when UNITAE_BASE_URL is %s', async baseUrl => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = baseUrl
    mockSlugLookup({ 'tenant-alpha': { id: 1, slug: 'tenant-alpha' } })

    const result = await resolveCongregationFromRequest(makeRequest('https://tenant-alpha.unitae.app/'))
    expect(result).toEqual({ id: 1, slug: 'tenant-alpha' })
  })

  // Set but left empty, the variable matched no host at all: every subdomain was served as the
  // platform root, with nothing to say why.
  it('reads an empty UNITAE_BASE_URL as unset', async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = ''
    mockSlugLookup({ 'tenant-alpha': { id: 1, slug: 'tenant-alpha' } })

    const result = await resolveCongregationFromRequest(makeRequest('http://tenant-alpha.localhost:3000/'))
    expect(result).toEqual({ id: 1, slug: 'tenant-alpha' })
  })

  it('resolves no subdomain of unitae.app on an instance that does not live there', async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    mockSlugLookup({ 'tenant-alpha': { id: 1, slug: 'tenant-alpha' } })
    vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)

    const result = await resolveCongregationFromRequest(makeRequest('https://tenant-alpha.unitae.app/'))
    expect(result).toBeNull()
  })

  // Regression: the base domain itself was read as the slug "unitae.app", so every lookup on it
  // threw the /congregation-not-found redirect.
  it('resolves no congregation for the base domain itself', async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = 'https://unitae.app'
    // Whatever slug is read from the host would find this row: none may be read.
    vi.mocked(db.congregation.findUnique).mockResolvedValue({ id: 9, slug: 'any-slug' } as never)
    vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)

    const result = await resolveCongregationFromRequest(makeRequest('https://unitae.app/'))
    expect(result).toBeNull()
  })

  it('treats a host that only ends with the base domain as a custom domain, not a subdomain', async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = 'unitae.app'
    vi.mocked(db.congregation.findUnique).mockResolvedValue({ id: 9, slug: 'any-slug' } as never)
    vi.mocked(db.congregation.findFirst).mockResolvedValue({ id: 3, slug: 'lyon' } as never)

    const result = await resolveCongregationFromRequest(makeRequest('https://notunitae.app/'))
    expect(result).toEqual({ id: 3, slug: 'lyon' })
  })

  it('retourne null pour le domaine racine sans slug ni domaine personnalisé', async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = 'unitae.app'
    vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)

    const result = await resolveCongregationFromRequest(makeRequest('https://custom-unknown.example.com/'))
    expect(result).toBeNull()
  })
})

// Single-tenant mode assumes one congregation, and `findFirst` with no ordering asks Postgres
// for "any row" — with a second one present (a stale import, a leftover test fixture) it can
// return either, so the login page ends up branded with whichever one the planner reached
// first, and the answer can change between requests.
describe('getBrandingName — deterministic single-tenant pick', () => {
  const singleTenant = { name: 'La Bonne Assemblée', displayName: null }

  it('asks for a deterministic congregation rather than any row', async () => {
    vi.mocked(db.congregation.findFirst).mockResolvedValue(singleTenant as never)

    await getBrandingName()

    const call = vi.mocked(db.congregation.findFirst).mock.calls[0][0]
    expect(call?.orderBy).toEqual({ id: 'asc' })
  })

  it('still returns the congregation name it found', async () => {
    vi.mocked(db.congregation.findFirst).mockResolvedValue(singleTenant as never)

    await expect(getBrandingName()).resolves.toBe('La Bonne Assemblée')
  })
})

describe('getBrandingName — multi-tenant host', () => {
  it('brands the base domain as the platform, not as a congregation', async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = 'unitae.app'
    // Whatever slug is read from the host would find this row: none may be read.
    vi.mocked(db.congregation.findUnique).mockResolvedValue({ name: 'Slug Match', displayName: null } as never)
    vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)

    await expect(getBrandingName(new Request('https://unitae.app/'))).resolves.toBe('Unitae')
  })

  it.each([
    'unitae.app',
    'https://unitae.app',
    'http://unitae.app',
    'https://unitae.app/',
    'https://unitae.app:8443',
    'https://Unitae.App',
  ])("brands a subdomain with its congregation's name when UNITAE_BASE_URL is %s", async baseUrl => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    process.env.UNITAE_BASE_URL = baseUrl
    mockSlugLookup({ lyon: { name: 'Lyon Centre', displayName: null } })

    await expect(getBrandingName(new Request('https://lyon.unitae.app/login'))).resolves.toBe('Lyon Centre')
  })
})

// The sign-in pages show the congregation's monogram and name; with only the platform's name to show, the unitae
// mark stands in its place rather than a « U » monogram.
describe('getCongregationBrand', () => {
  it('names the congregation when it has a name of its own', async () => {
    vi.mocked(db.congregation.findFirst).mockResolvedValue({ name: 'Assemblée des Lilas', displayName: null } as never)

    await expect(getCongregationBrand()).resolves.toBe('Assemblée des Lilas')
  })

  it('is null while the congregation keeps the placeholder name', async () => {
    vi.mocked(db.congregation.findFirst).mockResolvedValue({ name: 'Ma Congrégation', displayName: null } as never)

    await expect(getCongregationBrand()).resolves.toBeNull()
  })

  it('is null without any congregation', async () => {
    vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)

    await expect(getCongregationBrand()).resolves.toBeNull()
  })
})
