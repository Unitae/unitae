import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findFirst: vi.fn() },
  },
}))

vi.mock('~/shared/auth/crypto.server', () => ({
  compare: vi.fn(),
}))

const { validateCredentials } = await import('./validate-credentials.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { compare } = await import('~/shared/auth/crypto.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('validateCredentials', () => {
  const fakeUser = { id: 42, email: 'test@example.com', password: 'hashed.password', active: true }

  it("retourne l'id de l'utilisateur pour des identifiants valides", async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockResolvedValue(true as never)

    const result = await validateCredentials('test@example.com', 'motdepasse')
    expect(result).toBe(42)
  })

  it("normalise l'email en minuscules", async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockResolvedValue(true as never)

    const result = await validateCredentials('TEST@EXAMPLE.COM', 'motdepasse')
    expect(result).toBe(42)
  })

  it('retourne undefined pour un utilisateur inexistant', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(null as never)

    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await validateCredentials('inconnu@example.com', 'motdepasse')
    expect(result).toBeUndefined()
    expect(result).not.toBe(sentinel) // prouve que le code a bien tourné
  })

  it('exécute quand même un scrypt pour un utilisateur inexistant (égalisation du timing)', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(null as never)
    vi.mocked(compare).mockResolvedValue(false as never)

    await validateCredentials('inconnu@example.com', 'motdepasse')

    // Sans compte, on doit tout de même payer le coût scrypt contre un hash leurre
    // pour ne pas exposer d'oracle de timing.
    expect(compare).toHaveBeenCalledWith('motdepasse', expect.any(String))
  })

  it('retourne undefined pour un utilisateur inactif', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ ...fakeUser, active: false } as never)

    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await validateCredentials('test@example.com', 'motdepasse')
    expect(result).toBeUndefined()
    expect(result).not.toBe(sentinel)
  })

  it('exécute quand même un scrypt pour un utilisateur inactif (égalisation du timing)', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ ...fakeUser, active: false } as never)
    vi.mocked(compare).mockResolvedValue(false as never)

    await validateCredentials('test@example.com', 'motdepasse')

    expect(compare).toHaveBeenCalledWith('motdepasse', expect.any(String))
  })

  it('retourne undefined pour un mauvais mot de passe', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockResolvedValue(false as never)

    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await validateCredentials('test@example.com', 'mauvais')
    expect(result).toBeUndefined()
    expect(result).not.toBe(sentinel)
  })

  it('retourne undefined si compare lance une erreur', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockRejectedValue(new Error('crypto error'))

    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await validateCredentials('test@example.com', 'motdepasse')
    expect(result).toBeUndefined()
    expect(result).not.toBe(sentinel)
  })

  it('filtre par congregationId quand il est fourni', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockResolvedValue(true as never)

    await validateCredentials('test@example.com', 'motdepasse', 5)
    expect(db.userAccount.findFirst).toHaveBeenCalledWith({
      where: { email: 'test@example.com', congregationId: 5 },
    })
  })

  it("ne filtre pas par congregationId quand il n'est pas fourni", async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockResolvedValue(true as never)

    await validateCredentials('test@example.com', 'motdepasse')
    expect(db.userAccount.findFirst).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    })
  })
})
