import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/authentication/server/session.server', () => ({
  getSession: vi.fn(),
}))

vi.mock('~/shared/libs/db.server', () => ({
  unscopedDb: {
    user: { findUnique: vi.fn() },
  },
}))

const { verifyPlatformAdmin } = await import('./verify-platform-admin.server')
const { getSession } = await import('~/features/authentication/server/session.server')
const { unscopedDb } = await import('~/shared/libs/db.server')

function makeRequest() {
  return new Request('http://localhost/', {
    // biome-ignore lint/style/useNamingConvention: HTTP header name
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
    vi.mocked(getSession).mockResolvedValue(makeSession('42'))
    vi.mocked(unscopedDb.user.findUnique).mockResolvedValue({
      id: 42,
      email: 'admin@unitae.app',
      platformAdmin: true,
    })

    const result = await verifyPlatformAdmin(makeRequest())
    expect(result).toEqual({ userId: 42, email: 'admin@unitae.app' })
  })

  it('lance une redirection vers /login quand le userId est invalide', async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession(undefined))

    try {
      await verifyPlatformAdmin(makeRequest())
      expect.unreachable('devrait lancer une redirection')
    } catch (thrown) {
      const response = thrown as Response
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/login')
    }
  })

  it('lance une redirection vers / quand l\'utilisateur n\'est pas admin plateforme', async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42'))
    vi.mocked(unscopedDb.user.findUnique).mockResolvedValue({
      id: 42,
      email: 'user@test.com',
      platformAdmin: false,
    })

    try {
      await verifyPlatformAdmin(makeRequest())
      expect.unreachable('devrait lancer une redirection')
    } catch (thrown) {
      const response = thrown as Response
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/')
    }
  })

  it('lance une redirection vers / quand l\'utilisateur n\'existe pas', async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42'))
    vi.mocked(unscopedDb.user.findUnique).mockResolvedValue(null)

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
