import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/authentication/server/session.server', () => ({
  getSession: vi.fn(),
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findUnique: vi.fn() },
  },
}))

const { verifyPlatformAdmin } = await import('./verify-platform-admin.server')
const { getSession } = await import('~/features/authentication/server/session.server')
const { unscopedDb } = await import('~/shared/infra/db.server')

function makeRequest() {
  return new Request('http://localhost/', {
    headers: { Cookie: 'session=abc' },
  })
}

function makeSession(userId: string | undefined) {
  return {
    get: vi.fn((key: string) => (key === 'userId' ? userId : undefined)),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('verifyPlatformAdmin', () => {
  it('retourne userId et email pour un admin plateforme', async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(unscopedDb.userAccount.findUnique).mockResolvedValue({
      id: 42,
      email: 'admin@unitae.app',
      platformAdmin: true,
    } as never)

    const result = await verifyPlatformAdmin(makeRequest())
    expect(result).toEqual({ userId: 42, email: 'admin@unitae.app' })
  })

  it('lance une redirection vers /login quand le userId est invalide', async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession(undefined) as never)

    try {
      await verifyPlatformAdmin(makeRequest())
      expect.unreachable('devrait lancer une redirection')
    } catch (thrown) {
      const response = thrown as Response
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/login')
    }
  })

  it("lance une redirection vers / quand l'utilisateur n'est pas admin plateforme", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(unscopedDb.userAccount.findUnique).mockResolvedValue({
      id: 42,
      email: 'user@test.com',
      platformAdmin: false,
    } as never)

    try {
      await verifyPlatformAdmin(makeRequest())
      expect.unreachable('devrait lancer une redirection')
    } catch (thrown) {
      const response = thrown as Response
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/')
    }
  })

  it("lance une redirection vers / quand l'utilisateur n'existe pas", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(unscopedDb.userAccount.findUnique).mockResolvedValue(null as never)

    try {
      await verifyPlatformAdmin(makeRequest())
      expect.unreachable('devrait lancer une redirection')
    } catch (thrown) {
      const response = thrown as Response
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/')
    }
  })
})
