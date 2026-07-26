import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockLoggerError = vi.fn()

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('~/shared/auth/crypto.server', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { error: mockLoggerError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('./reset-account-password.server', () => ({
  resetAccountPassword: vi.fn(),
}))

const { changeAccountPassword } = await import('./change-account-password.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { compare } = await import('~/shared/auth/crypto.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('changeAccountPassword', () => {
  const fakeUser = { id: 1, password: 'old.hashed' }

  it('retourne true quand le mot de passe actuel est correct', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockResolvedValue(true as never)

    const result = await changeAccountPassword(1, 'ancien', 'nouveau')
    expect(result).toBe(true)
  })

  it("retourne false quand l'utilisateur n'existe pas", async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(null as never)

    const result = await changeAccountPassword(999, 'ancien', 'nouveau')
    expect(result).toBe(false)
  })

  it('retourne false quand le mot de passe actuel est incorrect', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockResolvedValue(false as never)

    const result = await changeAccountPassword(1, 'mauvais', 'nouveau')
    expect(result).toBe(false)
  })

  it('retourne false ET journalise quand compare lance une erreur (pas d’échec silencieux)', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockRejectedValue(new Error('crypto error'))

    const result = await changeAccountPassword(1, 'ancien', 'nouveau')

    // A corrupt stored hash or systemic scrypt fault must not be swallowed silently — it would
    // look identical to a wrong current password, leaving the user unable to change it with no
    // trace for operators. Mirror validateCredentials: log before returning false.
    expect(result).toBe(false)
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Password comparison failed during password change',
      expect.objectContaining({ userId: 1 }),
    )
  })
})
