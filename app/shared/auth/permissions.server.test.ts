import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/authentication/server/session.server', () => ({
  getSession: vi.fn(),
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    user: { findUnique: vi.fn() },
    congregationUserPermission: { findFirst: vi.fn() },
  },
}))

const { verifyPermission } = await import('./permissions.server')
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

describe('verifyPermission', () => {
  it("retourne false quand userId n'est pas dans la session", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession(undefined) as never)

    const result = await verifyPermission(makeRequest(), 'board-uploader' as never)
    expect(result).toBe(false)
  })

  it("retourne false quand userId n'est pas un nombre", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('abc') as never)

    const result = await verifyPermission(makeRequest(), 'board-uploader' as never)
    expect(result).toBe(false)
  })

  it("retourne true quand l'utilisateur a le rôle admin", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(unscopedDb.user.findUnique).mockResolvedValue({ congregationId: 1 } as never)
    // Premier findFirst: admin role → trouvé
    vi.mocked(unscopedDb.congregationUserPermission.findFirst).mockResolvedValueOnce({ id: 1 } as never)

    const result = await verifyPermission(makeRequest(), 'board-uploader' as never)
    expect(result).toBe(true)
  })

  it("retourne true quand l'utilisateur a le rôle demandé (pas admin)", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(unscopedDb.user.findUnique).mockResolvedValue({ congregationId: 1 } as never)
    // Premier findFirst: admin role → pas trouvé
    vi.mocked(unscopedDb.congregationUserPermission.findFirst).mockResolvedValueOnce(null as never)
    // Deuxième findFirst: rôle demandé → trouvé
    vi.mocked(unscopedDb.congregationUserPermission.findFirst).mockResolvedValueOnce({ id: 2 } as never)

    const result = await verifyPermission(makeRequest(), 'board-uploader' as never)
    expect(result).toBe(true)
  })

  it("retourne false quand l'utilisateur n'a ni admin ni le rôle demandé", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(unscopedDb.user.findUnique).mockResolvedValue({ congregationId: 1 } as never)
    vi.mocked(unscopedDb.congregationUserPermission.findFirst).mockResolvedValue(null as never)

    const result = await verifyPermission(makeRequest(), 'board-uploader' as never)
    expect(result).toBe(false)
  })

  it("retourne false quand l'utilisateur n'existe pas", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(unscopedDb.user.findUnique).mockResolvedValue(null as never)

    const result = await verifyPermission(makeRequest(), 'territories-manager' as never)
    expect(result).toBe(false)
  })
})
