import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    passwordResetToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

const { createPasswordResetToken, verifyPasswordResetToken, consumePasswordResetToken } = await import(
  './invalidate-account-password.server'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2025, 3, 8, 12, 0, 0)) // 8 avril 2025, midi
  vi.resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createPasswordResetToken', () => {
  it('retourne un token non vide', async () => {
    vi.mocked(db.passwordResetToken.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(db.passwordResetToken.create).mockResolvedValue({
      id: 1,
      token: 'abc',
      userId: 42,
      expiresAt: new Date(),
    } as never)

    const token = await createPasswordResetToken(42)
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('stocke le hash SHA-256 du token, pas le token en clair', async () => {
    vi.mocked(db.passwordResetToken.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(db.passwordResetToken.create).mockResolvedValue({} as never)

    const token = await createPasswordResetToken(42)

    const storedToken = vi.mocked(db.passwordResetToken.create).mock.calls[0][0].data.token
    expect(storedToken).toBe(sha256(token))
    expect(storedToken).not.toBe(token)
    expect(storedToken).toHaveLength(64)
  })
})

describe('verifyPasswordResetToken', () => {
  it("retourne l'utilisateur pour un token valide non expiré", async () => {
    const futureDate = new Date()
    futureDate.setHours(futureDate.getHours() + 12) // expire dans 12h

    const fakeUser = { id: 42, email: 'test@example.com' }
    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue({
      id: 1,
      token: 'valid-token',
      userId: 42,
      expiresAt: futureDate,
      user: fakeUser,
    } as never)

    const result = await verifyPasswordResetToken('valid-token')
    expect(result).toEqual(fakeUser)
    expect(db.passwordResetToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: sha256('valid-token') } }),
    )
  })

  it('retourne null pour un token inexistant', async () => {
    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue(null as never)

    const result = await verifyPasswordResetToken('inexistant')
    expect(result).toBeNull()
    expect(db.passwordResetToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: sha256('inexistant') } }),
    )
  })

  it('retourne null et supprime un token expiré', async () => {
    const pastDate = new Date()
    pastDate.setHours(pastDate.getHours() - 1) // expiré il y a 1h

    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue({
      id: 1,
      token: 'expired-token',
      userId: 42,
      expiresAt: pastDate,
      userAccount: { id: 42 },
    } as never)
    vi.mocked(db.passwordResetToken.delete).mockResolvedValue({} as never)

    const result = await verifyPasswordResetToken('expired-token')
    expect(result).toBeNull()
  })
})

describe('consumePasswordResetToken', () => {
  it("ne lance pas d'erreur pour un token existant", async () => {
    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue({
      id: 1,
      token: 'to-consume',
      userId: 42,
      expiresAt: new Date(),
    } as never)
    vi.mocked(db.passwordResetToken.delete).mockResolvedValue({} as never)

    await expect(consumePasswordResetToken('to-consume')).resolves.toBeUndefined()
    expect(db.passwordResetToken.findUnique).toHaveBeenCalledWith({ where: { token: sha256('to-consume') } })
  })

  it("ne lance pas d'erreur pour un token inexistant", async () => {
    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue(null as never)

    await expect(consumePasswordResetToken('inexistant')).resolves.toBeUndefined()
  })
})
