import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    passwordResetToken: { deleteMany: vi.fn() },
    consentRecord: { deleteMany: vi.fn() },
  },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

const { cleanupExpiredPasswordResetTokens, cleanupOldWithdrawnConsents } = await import('./retention.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('cleanupExpiredPasswordResetTokens', () => {
  it('supprime les tokens expires et retourne le nombre', async () => {
    vi.mocked(db.passwordResetToken.deleteMany).mockResolvedValue({ count: 5 } as never)

    const count = await cleanupExpiredPasswordResetTokens()

    expect(count).toBe(5)
    expect(db.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    })
  })

  it('retourne 0 si aucun token expire', async () => {
    vi.mocked(db.passwordResetToken.deleteMany).mockResolvedValue({ count: 0 } as never)

    const count = await cleanupExpiredPasswordResetTokens()

    expect(count).toBe(0)
  })
})

describe('cleanupOldWithdrawnConsents', () => {
  it('supprime les consentements retires depuis plus de 2 ans', async () => {
    vi.mocked(db.consentRecord.deleteMany).mockResolvedValue({ count: 3 } as never)

    const count = await cleanupOldWithdrawnConsents()

    expect(count).toBe(3)
    expect(db.consentRecord.deleteMany).toHaveBeenCalledWith({
      where: {
        withdrawnAt: { not: null, lt: expect.any(Date) },
      },
    })
  })
})
