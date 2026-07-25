import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { update: vi.fn() },
  },
}))

const { revokeAccountSessions } = await import('./revoke-account-sessions.server')
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
