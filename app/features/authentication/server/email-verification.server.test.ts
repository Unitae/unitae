import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    emailVerificationToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
    user: { update: vi.fn() },
    $transaction: vi.fn((fns: Promise<unknown>[]) => Promise.all(fns)),
  },
}))

vi.mock('node:crypto', () => ({
  default: {
    randomBytes: vi.fn(() => ({
      toString: vi.fn(() => 'mock-token-base64url'),
    })),
  },
}))

const {
  createEmailVerificationToken,
  verifyEmailVerificationToken,
  consumeEmailVerificationToken,
  getLatestVerificationToken,
} = await import('./email-verification.server')

const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createEmailVerificationToken', () => {
  it('supprime les anciens tokens et crée un nouveau', async () => {
    vi.mocked(db.emailVerificationToken.create).mockResolvedValue({
      id: 1,
      token: 'mock-token-base64url',
      userId: 42,
      expiresAt: new Date(),
      createdAt: new Date(),
    } as never)

    const token = await createEmailVerificationToken(42)

    expect(token).toBe('mock-token-base64url')
    expect(db.emailVerificationToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 42 } })
    expect(db.emailVerificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ token: 'mock-token-base64url', userId: 42 }),
    })
  })
})

describe('verifyEmailVerificationToken', () => {
  it("retourne l'utilisateur pour un token valide et non expiré", async () => {
    const futureDate = new Date()
    futureDate.setHours(futureDate.getHours() + 1)
    const fakeUser = { id: 42, email: 'test@example.com' }

    vi.mocked(db.emailVerificationToken.findUnique).mockResolvedValue({
      id: 1,
      token: 'valid-token',
      userId: 42,
      expiresAt: futureDate,
      createdAt: new Date(),
      user: fakeUser,
    } as never)

    const result = await verifyEmailVerificationToken('valid-token')
    expect(result).toEqual(fakeUser)
  })

  it('retourne null pour un token inexistant', async () => {
    vi.mocked(db.emailVerificationToken.findUnique).mockResolvedValue(null as never)

    const result = await verifyEmailVerificationToken('nonexistent-token')
    expect(result).toBeNull()
  })

  it('retourne null et supprime un token expiré', async () => {
    const pastDate = new Date()
    pastDate.setHours(pastDate.getHours() - 1)

    vi.mocked(db.emailVerificationToken.findUnique).mockResolvedValue({
      id: 1,
      token: 'expired-token',
      userId: 42,
      expiresAt: pastDate,
      createdAt: new Date(),
      user: { id: 42 },
    } as never)

    const result = await verifyEmailVerificationToken('expired-token')
    expect(result).toBeNull()
    expect(db.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})

describe('consumeEmailVerificationToken', () => {
  it('met à jour emailVerifiedAt et supprime le token', async () => {
    vi.mocked(db.emailVerificationToken.findUnique).mockResolvedValue({
      id: 1,
      token: 'valid-token',
      userId: 42,
      expiresAt: new Date(),
      createdAt: new Date(),
    } as never)

    await consumeEmailVerificationToken('valid-token')

    expect(db.$transaction).toHaveBeenCalled()
    expect(db.userAccount.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { emailVerifiedAt: expect.any(Date) },
    })
    expect(db.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it("ne fait rien si le token n'existe pas", async () => {
    vi.mocked(db.emailVerificationToken.findUnique).mockResolvedValue(null as never)

    await consumeEmailVerificationToken('nonexistent-token')

    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe('getLatestVerificationToken', () => {
  it('retourne le token le plus récent pour un utilisateur', async () => {
    const fakeToken = { id: 1, token: 'latest', userId: 42, createdAt: new Date() }
    vi.mocked(db.emailVerificationToken.findFirst).mockResolvedValue(fakeToken as never)

    const result = await getLatestVerificationToken(42)
    expect(result).toEqual(fakeToken)
    expect(db.emailVerificationToken.findFirst).toHaveBeenCalledWith({
      where: { userId: 42 },
      orderBy: { createdAt: 'desc' },
    })
  })
})
