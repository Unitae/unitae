import { describe, expect, it, vi } from 'vitest'

const { disableTwoFactor } = await import('./disable-two-factor.server')

describe('disableTwoFactor', () => {
  it('clears both the secret and the enabled flag', async () => {
    const update = vi.fn().mockResolvedValue({})
    const db = { userAccount: { update } }

    await disableTwoFactor(db as never, 7)

    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { twoFactorSecret: null, twoFactorEnabledAt: null },
    })
  })

  it('is idempotent — resolves without a value', async () => {
    const db = { userAccount: { update: vi.fn().mockResolvedValue({}) } }

    await expect(disableTwoFactor(db as never, 7)).resolves.toBeUndefined()
  })
})
