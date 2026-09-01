import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSession = {
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  unset: vi.fn(),
  flash: vi.fn(),
}

vi.mock('react-router', () => ({
  createCookieSessionStorage: () => ({
    getSession: () => Promise.resolve(mockSession),
    commitSession: () => Promise.resolve('committed'),
    destroySession: () => Promise.resolve('destroyed'),
  }),
  redirect: (url: string, init?: ResponseInit) => {
    const response = new Response(null, {
      status: 302,
      headers: { Location: url, ...(init?.headers as Record<string, string>) },
    })
    throw response
  },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findUnique: vi.fn() },
  },
}))

vi.mock('~/shared/domain/congregation.server', () => ({
  resolveCongregation: vi.fn(),
  resolveCongregationFromRequest: vi.fn(),
}))

vi.mock('./sanitize-account.server', () => ({
  sanitizeAccount: vi.fn((user: Record<string, unknown>) => {
    const { password: _, ...rest } = user
    return rest
  }),
}))

const { verifySession, establishAuthenticatedSession } = await import('./session.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { resolveCongregation, resolveCongregationFromRequest } = await import('~/shared/domain/congregation.server')

const fakeUser = {
  id: 42,
  email: 'test@example.com',
  password: 'hashed',
  active: true,
  congregationId: 1,
  emailVerifiedAt: new Date(),
  platformAdmin: false,
  sessionEpoch: 0,
  responsibleFor: [],
  deputyFor: [],
}

const fakeCongregation = {
  id: 1,
  name: 'Test',
  slug: 'test',
  locale: 'fr',
  displayName: 'Test Congregation',
  emailFrom: 'test@unitae.app',
  baseUrl: 'https://test.unitae.app',
  suspendedAt: null,
  suspendedReason: null,
  trialEndsAt: null,
}

beforeEach(() => {
  vi.resetAllMocks()
})

function makeRequest(url = 'http://localhost/') {
  return new Request(url)
}

// Drive the cookie session per key (userId, sessionEpoch, ...) instead of a single
// blanket return value, so the epoch check can be exercised independently of userId.
function setSession(values: Record<string, string | undefined>) {
  mockSession.get.mockImplementation((key: string) => values[key])
}

describe('verifySession', () => {
  it('retourne currentUser, congregation et session pour une session valide', async () => {
    setSession({ userId: '42', sessionEpoch: '0' })
    vi.mocked(db.userAccount.findUnique).mockResolvedValue(fakeUser as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(resolveCongregation).mockResolvedValue(fakeCongregation as never)

    const result = await verifySession(makeRequest())

    expect(result.currentUser.id).toBe(42)
    expect(result.currentUser).not.toHaveProperty('password')
    expect(result.congregation).toEqual(fakeCongregation)
    expect(result.session).toBe(mockSession)
  })

  it("redirige vers /login si l'epoch du cookie est périmé par rapport à celui du compte", async () => {
    // Cookie was issued at epoch 0; a password change bumped the account to epoch 1.
    setSession({ userId: '42', sessionEpoch: '0' })
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ ...fakeUser, sessionEpoch: 1 } as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest('http://localhost/territories/1?x=2')))
    expect(response.headers.get('Location')).toBe('/login?redirectTo=%2Fterritories%2F1%3Fx%3D2')
  })

  it("redirige vers /login si l'epoch du cookie est supérieur à celui du compte (comparaison stricte)", async () => {
    // Guards the strict `!==`: a cookie epoch ahead of the account (e.g. after a DB restore)
    // must also be rejected, not just an older one.
    setSession({ userId: '42', sessionEpoch: '2' })
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ ...fakeUser, sessionEpoch: 1 } as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest('http://localhost/territories/1?x=2')))
    expect(response.headers.get('Location')).toBe('/login?redirectTo=%2Fterritories%2F1%3Fx%3D2')
  })

  it("accepte la session quand l'epoch du cookie correspond à un epoch non nul du compte", async () => {
    setSession({ userId: '42', sessionEpoch: '3' })
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ ...fakeUser, sessionEpoch: 3 } as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(resolveCongregation).mockResolvedValue(fakeCongregation as never)

    const result = await verifySession(makeRequest())

    expect(result.currentUser.id).toBe(42)
  })

  it("accepte une session sans epoch dans le cookie quand le compte est encore à l'epoch 0", async () => {
    // Backward compatibility: cookies issued before this feature carry no epoch.
    setSession({ userId: '42' })
    vi.mocked(db.userAccount.findUnique).mockResolvedValue(fakeUser as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(resolveCongregation).mockResolvedValue(fakeCongregation as never)

    const result = await verifySession(makeRequest())

    expect(result.currentUser.id).toBe(42)
  })

  it('redirige vers /login avec redirectTo si le userId est absent de la session', async () => {
    setSession({})

    const response = await getRedirectResponse(() => verifySession(makeRequest('http://localhost/territories/1?x=2')))
    expect(response.headers.get('Location')).toBe('/login?redirectTo=%2Fterritories%2F1%3Fx%3D2')
  })

  it('redirige vers /login avec redirectTo si le userId est NaN', async () => {
    setSession({ userId: 'invalid' })

    const response = await getRedirectResponse(() => verifySession(makeRequest('http://localhost/territories/1?x=2')))
    expect(response.headers.get('Location')).toBe('/login?redirectTo=%2Fterritories%2F1%3Fx%3D2')
  })

  it("redirige vers /login avec redirectTo si l'utilisateur n'existe pas", async () => {
    setSession({ userId: '42', sessionEpoch: '0' })
    vi.mocked(db.userAccount.findUnique).mockResolvedValue(null as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest('http://localhost/territories/1?x=2')))
    expect(response.headers.get('Location')).toBe('/login?redirectTo=%2Fterritories%2F1%3Fx%3D2')
  })

  it("redirige vers /login avec redirectTo si l'utilisateur est inactif", async () => {
    setSession({ userId: '42', sessionEpoch: '0' })
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ ...fakeUser, active: false } as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest('http://localhost/territories/1?x=2')))
    expect(response.headers.get('Location')).toBe('/login?redirectTo=%2Fterritories%2F1%3Fx%3D2')
  })

  // Regression: the request that trips the guard is usually a single-fetch one, so the captured
  // path used to be `/territories/1.data` and signing back in landed the user on the loader
  // endpoint instead of the page.
  it('nettoie le suffixe single-fetch du redirectTo', async () => {
    setSession({})

    const response = await getRedirectResponse(() =>
      verifySession(makeRequest('http://localhost/territories/1.data?_routes=routes%2Fterritories')),
    )
    expect(response.headers.get('Location')).toBe('/login?redirectTo=%2Fterritories%2F1')
  })

  it('ramène la racine décorée à /', async () => {
    setSession({})

    const response = await getRedirectResponse(() => verifySession(makeRequest('http://localhost/_.data')))
    // buildLoginRedirectUrl drops a redirectTo of '/' entirely — nothing to preserve.
    expect(response.headers.get('Location')).toBe('/login')
  })

  it("redirige vers /login sans redirectTo si le subdomain ne correspond pas à l'assemblée de l'utilisateur", async () => {
    setSession({ userId: '42', sessionEpoch: '0' })
    vi.mocked(db.userAccount.findUnique).mockResolvedValue(fakeUser as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue({ id: 999 } as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest('http://localhost/territories/1?x=2')))
    expect(response.headers.get('Location')).toBe('/login')
    expect(response.headers.get('Location')).not.toContain('redirectTo')
  })

  it("redirige vers /suspended si l'assemblée est suspendue", async () => {
    setSession({ userId: '42', sessionEpoch: '0' })
    vi.mocked(db.userAccount.findUnique).mockResolvedValue(fakeUser as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(resolveCongregation).mockResolvedValue({
      ...fakeCongregation,
      suspendedAt: new Date(),
      suspendedReason: null,
    } as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest()))
    expect(response.headers.get('Location')).toBe('/suspended')
  })

  it("redirige vers /trial-expired si l'essai est terminé", async () => {
    setSession({ userId: '42', sessionEpoch: '0' })
    vi.mocked(db.userAccount.findUnique).mockResolvedValue(fakeUser as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 1)
    vi.mocked(resolveCongregation).mockResolvedValue({
      ...fakeCongregation,
      trialEndsAt: pastDate,
    } as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest()))
    expect(response.headers.get('Location')).toBe('/trial-expired')
  })

  it('redirige vers /login avec redirectTo si findUnique échoue avec P2007', async () => {
    setSession({ userId: '42', sessionEpoch: '0' })
    const p2007Error = Object.assign(new Error('Type mismatch'), { code: 'P2007' })
    vi.mocked(db.userAccount.findUnique).mockRejectedValue(p2007Error)

    const response = await getRedirectResponse(() => verifySession(makeRequest('http://localhost/territories/1?x=2')))
    expect(response.headers.get('Location')).toBe('/login?redirectTo=%2Fterritories%2F1%3Fx%3D2')
  })

  it("redirige vers /verify-email si l'email n'est pas vérifié", async () => {
    setSession({ userId: '42', sessionEpoch: '0' })
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ ...fakeUser, emailVerifiedAt: null } as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(resolveCongregation).mockResolvedValue(fakeCongregation as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest()))
    expect(response.headers.get('Location')).toBe('/verify-email')
  })

  it('redirige vers /login sans redirectTo quand request.url est mal formée', async () => {
    setSession({})
    const badRequest = { url: 'not-a-valid-url', headers: { get: () => null } } as unknown as Request

    const response = await getRedirectResponse(() => verifySession(badRequest))
    expect(response.headers.get('Location')).toBe('/login')
  })
})

describe('establishAuthenticatedSession', () => {
  it("inscrit le userId et l'epoch courant du compte dans la session", async () => {
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ sessionEpoch: 3 } as never)

    await establishAuthenticatedSession(mockSession as never, 42)

    expect(mockSession.set).toHaveBeenCalledWith('userId', '42')
    expect(mockSession.set).toHaveBeenCalledWith('sessionEpoch', '3')
  })

  it("retombe sur l'epoch 0 quand le compte est introuvable", async () => {
    vi.mocked(db.userAccount.findUnique).mockResolvedValue(null as never)

    await establishAuthenticatedSession(mockSession as never, 42)

    expect(mockSession.set).toHaveBeenCalledWith('userId', '42')
    expect(mockSession.set).toHaveBeenCalledWith('sessionEpoch', '0')
  })
})

// verifySession throws redirect responses — this helper catches them
async function getRedirectResponse(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await fn()
    // React Router redirect() returns a Response that gets thrown by the framework,
    // but in tests it may be returned directly from the mock
    if (result instanceof Response) return result
    throw new Error('Expected a redirect response')
  } catch (error) {
    if (error instanceof Response) return error
    throw error
  }
}
