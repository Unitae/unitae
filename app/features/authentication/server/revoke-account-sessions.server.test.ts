import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { update: vi.fn(), updateMany: vi.fn() },
  },
}))

const { endCurrentSessions, revokeAccountSessions } = await import('./revoke-account-sessions.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.userAccount.update).mockResolvedValue({} as never)
})

describe('revokeAccountSessions', () => {
  it("incrémente l'epoch de session du compte ciblé", async () => {
    await revokeAccountSessions(7)

    expect(db.userAccount.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { sessionEpoch: { increment: 1 } },
    })
  })

  it("ne lance pas d'erreur en fonctionnement normal", async () => {
    await expect(revokeAccountSessions(7)).resolves.toBeUndefined()
  })
})

// In-memory account, so these tests assert on whether the epoch moved, not on the query sent.
describe('endCurrentSessions', () => {
  type Account = { id: number; sessionEpoch: number; active: boolean; anonymizedAt: Date | null }
  let account: Account

  beforeEach(() => {
    account = { id: 7, sessionEpoch: 3, active: true, anonymizedAt: null }
    vi.mocked(db.userAccount.updateMany).mockImplementation((({ where }: { where: Partial<Account> }) => {
      const matches = (Object.keys(where) as (keyof Account)[]).every(key => account[key] === where[key])
      if (matches) account.sessionEpoch++
      return Promise.resolve({ count: matches ? 1 : 0 })
    }) as never)
  })

  it('ends the sessions of an account whose session is still current', async () => {
    expect(await endCurrentSessions(7, 3)).toBe(true)
    expect(account.sessionEpoch).toBe(4)
  })

  // A cookie from before an earlier revocation must not be able to sign the real user out again.
  it('leaves the account alone when the session epoch is stale', async () => {
    expect(await endCurrentSessions(7, 2)).toBe(false)
    expect(account.sessionEpoch).toBe(3)
  })

  it('leaves a deactivated account alone', async () => {
    account.active = false

    expect(await endCurrentSessions(7, 3)).toBe(false)
    expect(account.sessionEpoch).toBe(3)
  })

  it('leaves an anonymized account alone', async () => {
    account.anonymizedAt = new Date(0)

    expect(await endCurrentSessions(7, 3)).toBe(false)
    expect(account.sessionEpoch).toBe(3)
  })
})
