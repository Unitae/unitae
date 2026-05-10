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

vi.mock('./sanitize-user.server', () => ({
  sanitizeUser: vi.fn((user: Record<string, unknown>) => {
    const { password: _, ...rest } = user
    return rest
  }),
}))

const { verifySession } = await import('./session.server')
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

describe('verifySession', () => {
  it('retourne currentUser, congregation et session pour une session valide', async () => {
    mockSession.get.mockReturnValue('42')
    vi.mocked(db.userAccount.findUnique).mockResolvedValue(fakeUser as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(resolveCongregation).mockResolvedValue(fakeCongregation as never)

    const result = await verifySession(makeRequest())

    expect(result.currentUser.id).toBe(42)
    expect(result.currentUser).not.toHaveProperty('password')
    expect(result.congregation).toEqual(fakeCongregation)
    expect(result.session).toBe(mockSession)
  })

  it('redirige vers /login si le userId est absent de la session', async () => {
    mockSession.get.mockReturnValue(undefined)

    const response = await getRedirectResponse(() => verifySession(makeRequest()))
    expect(response.headers.get('Location')).toBe('/login')
  })

  it('redirige vers /login si le userId est NaN', async () => {
    mockSession.get.mockReturnValue('invalid')

    const response = await getRedirectResponse(() => verifySession(makeRequest()))
    expect(response.headers.get('Location')).toBe('/login')
  })

  it("redirige vers /login si l'utilisateur n'existe pas", async () => {
    mockSession.get.mockReturnValue('42')
    vi.mocked(db.userAccount.findUnique).mockResolvedValue(null as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest()))
    expect(response.headers.get('Location')).toBe('/login')
  })

  it("redirige vers /login si l'utilisateur est inactif", async () => {
    mockSession.get.mockReturnValue('42')
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ ...fakeUser, active: false } as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest()))
    expect(response.headers.get('Location')).toBe('/login')
  })

  it("redirige vers /login si le subdomain ne correspond pas à l'assemblée de l'utilisateur", async () => {
    mockSession.get.mockReturnValue('42')
    vi.mocked(db.userAccount.findUnique).mockResolvedValue(fakeUser as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue({ id: 999 } as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest()))
    expect(response.headers.get('Location')).toBe('/login')
  })

  it("redirige vers /suspended si l'assemblée est suspendue", async () => {
    mockSession.get.mockReturnValue('42')
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
    mockSession.get.mockReturnValue('42')
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

  it('redirige vers /login si findUnique échoue avec P2007', async () => {
    mockSession.get.mockReturnValue('42')
    const p2007Error = Object.assign(new Error('Type mismatch'), { code: 'P2007' })
    vi.mocked(db.userAccount.findUnique).mockRejectedValue(p2007Error)

    const response = await getRedirectResponse(() => verifySession(makeRequest()))
    expect(response.headers.get('Location')).toBe('/login')
  })

  it("redirige vers /verify-email si l'email n'est pas vérifié", async () => {
    mockSession.get.mockReturnValue('42')
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ ...fakeUser, emailVerifiedAt: null } as never)
    vi.mocked(resolveCongregationFromRequest).mockResolvedValue(null as never)
    vi.mocked(resolveCongregation).mockResolvedValue(fakeCongregation as never)

    const response = await getRedirectResponse(() => verifySession(makeRequest()))
    expect(response.headers.get('Location')).toBe('/verify-email')
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
