import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  unscopedDb: {
    user: { findFirst: vi.fn() },
  },
}))

vi.mock('~/shared/libs/crypto.server', () => ({
  compare: vi.fn(),
}))

const { validateCredentials } = await import('./validate-credentials.server')
const { unscopedDb: db } = await import('~/shared/libs/db.server')
const { compare } = await import('~/shared/libs/crypto.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('validateCredentials', () => {
  const fakeUser = { id: 42, email: 'test@example.com', password: 'hashed.password', active: true }

  it('retourne l\'id de l\'utilisateur pour des identifiants valides', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(fakeUser)
    vi.mocked(compare).mockResolvedValue(true)

    const result = await validateCredentials('test@example.com', 'motdepasse')
    expect(result).toBe(42)
  })

  it('normalise l\'email en minuscules', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(fakeUser)
    vi.mocked(compare).mockResolvedValue(true)

    const result = await validateCredentials('TEST@EXAMPLE.COM', 'motdepasse')
    expect(result).toBe(42)
  })

  it('retourne undefined pour un utilisateur inexistant', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(null)

    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await validateCredentials('inconnu@example.com', 'motdepasse')
    expect(result).toBeUndefined()
    expect(result).not.toBe(sentinel) // prouve que le code a bien tourné
  })

  it('retourne undefined pour un utilisateur inactif', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue({ ...fakeUser, active: false })

    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await validateCredentials('test@example.com', 'motdepasse')
    expect(result).toBeUndefined()
    expect(result).not.toBe(sentinel)
  })

  it('retourne undefined pour un mauvais mot de passe', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(fakeUser)
    vi.mocked(compare).mockResolvedValue(false)

    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await validateCredentials('test@example.com', 'mauvais')
    expect(result).toBeUndefined()
    expect(result).not.toBe(sentinel)
  })

  it('retourne undefined si compare lance une erreur', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(fakeUser)
    vi.mocked(compare).mockRejectedValue(new Error('crypto error'))

    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await validateCredentials('test@example.com', 'motdepasse')
    expect(result).toBeUndefined()
    expect(result).not.toBe(sentinel)
  })
})
