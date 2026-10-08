import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/authentication/server/session.server', () => ({
  getSession: vi.fn(),
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findUnique: vi.fn() },
    congregation: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('~/shared/domain/congregation.server', () => ({
  findCongregation: vi.fn(),
  resolveCongregationFromRequest: vi.fn(),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { resolveDocumentLocale, resolveLocaleFromRequest } = await import('./locale.server')
const { getSession } = await import('~/features/authentication/server/session.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { findCongregation, resolveCongregationFromRequest } = await import('~/shared/domain/congregation.server')

beforeEach(() => {
  vi.resetAllMocks()
  delete process.env.UNITAE_MULTI_TENANT
})

function makeRequest(url = 'http://localhost:5173/board') {
  return new Request(url)
}

function mockSession(userId: number | typeof NaN) {
  vi.mocked(getSession).mockResolvedValue({
    get: vi.fn((key: string) => (key === 'userId' ? userId : undefined)),
  } as never)
}

describe('resolveLocaleFromRequest', () => {
  it('returns the congregation locale for an authenticated user', async () => {
    mockSession(42)
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ congregationId: 1 } as never)
    vi.mocked(findCongregation).mockResolvedValue({ locale: 'en' } as never)

    const result = await resolveLocaleFromRequest(makeRequest())
    expect(result).toBe('en')
  })

  it("returns 'fr' when authenticated user's congregation has locale 'fr'", async () => {
    mockSession(42)
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ congregationId: 1 } as never)
    vi.mocked(findCongregation).mockResolvedValue({ locale: 'fr' } as never)

    const result = await resolveLocaleFromRequest(makeRequest())
    expect(result).toBe('fr')
  })

  it('falls through when session has no valid userId', async () => {
    mockSession(NaN)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)

    const result = await resolveLocaleFromRequest(makeRequest())
    expect(result).toBe('fr')
  })

  it('falls through when session user is not found in DB', async () => {
    mockSession(42)
    vi.mocked(db.userAccount.findUnique).mockResolvedValue(null as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)

    const result = await resolveLocaleFromRequest(makeRequest())
    expect(result).toBe('fr')
  })

  it('returns locale from subdomain congregation in multi-tenant mode', async () => {
    mockSession(NaN)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue({ id: 5, slug: 'alpha' } as never)
    vi.mocked(db.congregation.findUnique).mockResolvedValue({ locale: 'en' } as never)

    const result = await resolveLocaleFromRequest(makeRequest())
    expect(result).toBe('en')
  })

  it('falls through when subdomain resolves no congregation', async () => {
    mockSession(NaN)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)

    const result = await resolveLocaleFromRequest(makeRequest())
    expect(result).toBe('fr')
  })

  it('returns first congregation locale in single-tenant mode', async () => {
    mockSession(NaN)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(db.congregation.findFirst).mockResolvedValue({ locale: 'en' } as never)

    const result = await resolveLocaleFromRequest(makeRequest())
    expect(result).toBe('en')
  })

  it("returns 'fr' when single-tenant has no congregation", async () => {
    mockSession(NaN)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)

    const result = await resolveLocaleFromRequest(makeRequest())
    expect(result).toBe('fr')
  })

  it("returns 'fr' in multi-tenant mode when no subdomain match and no session", async () => {
    process.env.UNITAE_MULTI_TENANT = 'true'
    mockSession(NaN)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)

    const result = await resolveLocaleFromRequest(makeRequest())
    expect(result).toBe('fr')
  })

  it("returns 'fr' when subdomain congregation has null locale", async () => {
    mockSession(NaN)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue({ id: 5, slug: 'alpha' } as never)
    vi.mocked(db.congregation.findUnique).mockResolvedValue({ locale: null } as never)

    const result = await resolveLocaleFromRequest(makeRequest())
    expect(result).toBe('fr')
  })
})

// Regression: a session whose congregation was deleted threw out of the locale lookup, which runs
// for every page, so that visitor got a 500 everywhere instead of the sign-in page.
describe("resolveLocaleFromRequest — the session's congregation no longer exists", () => {
  it("falls through to the request's congregation", async () => {
    mockSession(42)
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ congregationId: 1 } as never)
    vi.mocked(findCongregation).mockResolvedValue(null as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue({ id: 5, slug: 'alpha' } as never)
    vi.mocked(db.congregation.findUnique).mockResolvedValue({ locale: 'en' } as never)

    await expect(resolveLocaleFromRequest(makeRequest())).resolves.toBe('en')
  })
})

// resolveDocumentLocale runs in entry.server's handleRequest, after the loaders: a Response thrown
// there is not turned into the response, React Router re-renders, the lookup throws again and the
// visitor gets the last-resort 500. Every outcome has to come back as a value.
describe('resolveDocumentLocale', () => {
  const notFoundRedirect = () => new Response(null, { status: 302, headers: { Location: '/congregation-not-found' } })

  it("returns the request's locale", async () => {
    mockSession(42)
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ congregationId: 1 } as never)
    vi.mocked(findCongregation).mockResolvedValue({ locale: 'en' } as never)

    await expect(resolveDocumentLocale(makeRequest())).resolves.toEqual({ locale: 'en' })
  })

  // Regression: any page on a subdomain no congregation owns, and any unknown path there, was a 500.
  it('returns the not-found redirect for a subdomain no congregation owns instead of throwing it', async () => {
    mockSession(NaN)
    vi.mocked(resolveCongregationFromRequest).mockRejectedValue(notFoundRedirect())

    const result = await resolveDocumentLocale(makeRequest('https://inconnu.unitae.app/nope'))

    expect('redirect' in result && result.redirect.status).toBe(302)
    expect('redirect' in result && result.redirect.headers.get('Location')).toBe('/congregation-not-found')
  })

  // Regression: the page that redirect leads to resolved the locale too, threw the same redirect,
  // and was itself a 500.
  it('renders the page the redirect leads to in the default locale rather than redirecting it to itself', async () => {
    mockSession(NaN)
    vi.mocked(resolveCongregationFromRequest).mockRejectedValue(notFoundRedirect())

    await expect(
      resolveDocumentLocale(makeRequest('https://inconnu.unitae.app/congregation-not-found')),
    ).resolves.toEqual({ locale: 'fr' })
  })

  it('falls back to the default locale when the lookup fails', async () => {
    mockSession(42)
    vi.mocked(db.userAccount.findUnique).mockRejectedValue(new Error('connection refused'))

    await expect(resolveDocumentLocale(makeRequest())).resolves.toEqual({ locale: 'fr' })
  })
})

// Same defect as getBrandingName: the single-tenant fallback means "the congregation", and an
// unordered findFirst can hand back a different one from one request to the next.
describe('resolveLocaleFromRequest — deterministic single-tenant fallback', () => {
  it('asks for a deterministic congregation rather than any row', async () => {
    vi.mocked(getSession).mockResolvedValue({ get: () => undefined } as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(db.congregation.findFirst).mockResolvedValue({ locale: 'en' } as never)

    await resolveLocaleFromRequest(new Request('http://localhost/'))

    const call = vi.mocked(db.congregation.findFirst).mock.calls[0][0]
    expect(call?.orderBy).toEqual({ id: 'asc' })
  })
})
