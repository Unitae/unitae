import { beforeEach, describe, expect, it, vi } from 'vitest'

// Pending reset links, keyed by account, written through the same transaction as the password.
const { pendingLinks } = vi.hoisted(() => ({ pendingLinks: [] as { userId: number }[] }))

vi.mock('~/shared/infra/db.server', () => {
  const client = {
    userAccount: { update: vi.fn(), findUnique: vi.fn() },
    passwordResetToken: {
      deleteMany: vi.fn(({ where }: { where: { userId: number } }) => {
        const before = pendingLinks.length
        pendingLinks.splice(0, pendingLinks.length, ...pendingLinks.filter(link => link.userId !== where.userId))
        return Promise.resolve({ count: before - pendingLinks.length })
      }),
    },
  }
  return {
    unscopedDb: {
      ...client,
      $transaction: vi.fn((run: (tx: typeof client) => Promise<unknown>) => run(client)),
    },
  }
})

vi.mock('~/shared/auth/crypto.server', () => ({
  hash: vi.fn().mockResolvedValue('new-hashed-password' as never),
}))

const { resetAccountPassword } = await import('./reset-account-password.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { hash } = await import('~/shared/auth/crypto.server')

beforeEach(() => {
  vi.resetAllMocks()
  pendingLinks.length = 0
  vi.mocked(db.$transaction).mockImplementation(((run: (tx: typeof db) => Promise<unknown>) => run(db)) as never)
  vi.mocked(db.passwordResetToken.deleteMany).mockImplementation((({ where }: { where: { userId: number } }) => {
    const kept = pendingLinks.filter(link => link.userId !== where.userId)
    const count = pendingLinks.length - kept.length
    pendingLinks.splice(0, pendingLinks.length, ...kept)
    return Promise.resolve({ count })
  }) as never)
  vi.mocked(db.userAccount.update).mockResolvedValue({} as never)
  vi.mocked(db.userAccount.findUnique).mockResolvedValue({ emailVerifiedAt: new Date() } as never)
  vi.mocked(hash).mockResolvedValue('new-hashed-password' as never)
})

describe('resetAccountPassword', () => {
  // Changing the password and ending the account's reset links happen together: an older link
  // must not be able to reset the new password.
  it('ends every pending reset link of the account with the password change', async () => {
    pendingLinks.splice(0, pendingLinks.length, { userId: 1 }, { userId: 1 }, { userId: 2 })

    await resetAccountPassword(1, 'nouveau-mdp')

    expect(pendingLinks).toEqual([{ userId: 2 }])
  })

  it("ne lance pas d'erreur en fonctionnement normal", async () => {
    await expect(resetAccountPassword(1, 'nouveau-mdp')).resolves.toBeUndefined()
  })

  it('stamps emailVerifiedAt when the account has not yet been verified', async () => {
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ emailVerifiedAt: null } as never)

    await resetAccountPassword(1, 'nouveau-mdp')

    expect(db.userAccount.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { password: 'new-hashed-password', sessionEpoch: { increment: 1 }, emailVerifiedAt: expect.any(Date) },
    })
  })

  it('does not touch emailVerifiedAt when the account is already verified', async () => {
    const verifiedDate = new Date('2024-01-01')
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ emailVerifiedAt: verifiedDate } as never)

    await resetAccountPassword(1, 'nouveau-mdp')

    expect(db.userAccount.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { password: 'new-hashed-password', sessionEpoch: { increment: 1 } },
    })
  })
})
