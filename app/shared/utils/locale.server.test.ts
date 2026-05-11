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
  resolveCongregation: vi.fn(),
  resolveCongregationFromRequest: vi.fn(),
}))

const { resolveLocaleFromRequest } = await import('./locale.server')
const { getSession } = await import('~/features/authentication/server/session.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { resolveCongregation, resolveCongregationFromRequest } = await import('~/shared/domain/congregation.server')

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
    vi.mocked(resolveCongregation).mockResolvedValue({ locale: 'en' } as never)

    const result = await resolveLocaleFromRequest(makeRequest())
    expect(result).toBe('en')
  })

  it("returns 'fr' when authenticated user's congregation has locale 'fr'", async () => {
    mockSession(42)
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ congregationId: 1 } as never)
    vi.mocked(resolveCongregation).mockResolvedValue({ locale: 'fr' } as never)

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
