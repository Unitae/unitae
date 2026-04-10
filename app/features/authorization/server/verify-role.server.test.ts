import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/authentication/server/session.server', () => ({
  getSession: vi.fn(),
}))

vi.mock('~/shared/libs/db.server', () => ({
  unscopedDb: {
    user: { findUnique: vi.fn() },
    congregationUserRole: { findFirst: vi.fn() },
  },
  congregationContext: {
    getStore: vi.fn(),
    enterWith: vi.fn(),
  },
}))

const { verifyRole } = await import('./verify-role.server')
const { getSession } = await import('~/features/authentication/server/session.server')
const { unscopedDb, congregationContext } = await import('~/shared/libs/db.server')

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

describe('verifyRole', () => {
  it("retourne false quand userId n'est pas dans la session", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession(undefined) as never)

    const result = await verifyRole(makeRequest(), 'board-uploader' as never)
    expect(result).toBe(false)
  })

  it("retourne false quand userId n'est pas un nombre", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('abc') as never)

    const result = await verifyRole(makeRequest(), 'board-uploader' as never)
    expect(result).toBe(false)
  })

  it("retourne true quand l'utilisateur a le rôle admin", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(congregationContext.getStore).mockReturnValue({ congregationId: 1 } as never)
    // Premier findFirst: admin role → trouvé
    vi.mocked(unscopedDb.congregationUserRole.findFirst).mockResolvedValueOnce({ id: 1 } as never)

    const result = await verifyRole(makeRequest(), 'board-uploader' as never)
    expect(result).toBe(true)
  })

  it("retourne true quand l'utilisateur a le rôle demandé (pas admin)", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(congregationContext.getStore).mockReturnValue({ congregationId: 1 } as never)
    // Premier findFirst: admin role → pas trouvé
    vi.mocked(unscopedDb.congregationUserRole.findFirst).mockResolvedValueOnce(null as never)
    // Deuxième findFirst: rôle demandé → trouvé
    vi.mocked(unscopedDb.congregationUserRole.findFirst).mockResolvedValueOnce({ id: 2 } as never)

    const result = await verifyRole(makeRequest(), 'board-uploader' as never)
    expect(result).toBe(true)
  })

  it("retourne false quand l'utilisateur n'a ni admin ni le rôle demandé", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(congregationContext.getStore).mockReturnValue({ congregationId: 1 } as never)
    vi.mocked(unscopedDb.congregationUserRole.findFirst).mockResolvedValue(null as never)

    const result = await verifyRole(makeRequest(), 'board-uploader' as never)
    expect(result).toBe(false)
  })

  it('fait un fallback sur la base quand le contexte AsyncLocalStorage est vide', async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(congregationContext.getStore).mockReturnValue(undefined as never)
    vi.mocked(unscopedDb.user.findUnique).mockResolvedValue({ congregationId: 5 } as never)
    // admin check → non, role check → oui
    vi.mocked(unscopedDb.congregationUserRole.findFirst)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: 3 } as never)

    const result = await verifyRole(makeRequest(), 'territories-manager' as never)
    expect(result).toBe(true)
  })

  it("retourne false quand le fallback ne trouve pas l'utilisateur", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('42') as never)
    vi.mocked(congregationContext.getStore).mockReturnValue(undefined as never)
    vi.mocked(unscopedDb.user.findUnique).mockResolvedValue(null as never)

    const result = await verifyRole(makeRequest(), 'territories-manager' as never)
    expect(result).toBe(false)
  })
})
