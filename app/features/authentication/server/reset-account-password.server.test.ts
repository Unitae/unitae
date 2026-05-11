import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { update: vi.fn(), findUnique: vi.fn() },
  },
}))

vi.mock('~/shared/auth/crypto.server', () => ({
  hash: vi.fn().mockResolvedValue('new-hashed-password' as never),
}))

const { resetAccountPassword } = await import('./reset-account-password.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { hash } = await import('~/shared/auth/crypto.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.userAccount.update).mockResolvedValue({} as never)
  vi.mocked(db.userAccount.findUnique).mockResolvedValue({ emailVerifiedAt: new Date() } as never)
  vi.mocked(hash).mockResolvedValue('new-hashed-password' as never)
})

describe('resetAccountPassword', () => {
  it("ne lance pas d'erreur en fonctionnement normal", async () => {
    await expect(resetAccountPassword(1, 'nouveau-mdp')).resolves.toBeUndefined()
  })

  it('stamps emailVerifiedAt when the account has not yet been verified', async () => {
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ emailVerifiedAt: null } as never)

    await resetAccountPassword(1, 'nouveau-mdp')

    expect(db.userAccount.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { password: 'new-hashed-password', emailVerifiedAt: expect.any(Date) },
    })
  })

  it('does not touch emailVerifiedAt when the account is already verified', async () => {
    const verifiedDate = new Date('2024-01-01')
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ emailVerifiedAt: verifiedDate } as never)

    await resetAccountPassword(1, 'nouveau-mdp')

    expect(db.userAccount.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { password: 'new-hashed-password' },
    })
  })
})
