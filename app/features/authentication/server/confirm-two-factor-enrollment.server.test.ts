import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./totp.server', () => ({
  verifyTotpCode: vi.fn(),
}))

vi.mock('./totp-encryption.server', () => ({
  decryptSecret: vi.fn(),
}))

const { confirmTwoFactorEnrollment } = await import('./confirm-two-factor-enrollment.server')
const { verifyTotpCode } = await import('./totp.server')
const { decryptSecret } = await import('./totp-encryption.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(decryptSecret).mockReturnValue('THESECRET')
})

function fakeDb(account: unknown) {
  return {
    userAccount: {
      findFirst: vi.fn().mockResolvedValue(account),
      update: vi.fn().mockResolvedValue({}),
    },
  }
}

describe('confirmTwoFactorEnrollment', () => {
  it('confirms enrollment and returns true for a valid code', async () => {
    const db = fakeDb({ twoFactorSecret: 'enc(THESECRET)' })
    vi.mocked(verifyTotpCode).mockReturnValue(true)

    expect(await confirmTwoFactorEnrollment(db as never, 7, '123456')).toBe(true)
    expect(db.userAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ twoFactorEnabledAt: expect.any(Date) }),
      }),
    )
  })

  it('returns false for an invalid code and does not confirm', async () => {
    const db = fakeDb({ twoFactorSecret: 'enc(THESECRET)' })
    vi.mocked(verifyTotpCode).mockReturnValue(false)

    expect(await confirmTwoFactorEnrollment(db as never, 7, '000000')).toBe(false)
    expect(db.userAccount.update).not.toHaveBeenCalled()
  })

  it('returns false when there is no pending secret to confirm', async () => {
    const db = fakeDb({ twoFactorSecret: null })

    expect(await confirmTwoFactorEnrollment(db as never, 7, '123456')).toBe(false)
    expect(verifyTotpCode).not.toHaveBeenCalled()
  })

  it('returns false when the account does not exist', async () => {
    const db = fakeDb(null)

    expect(await confirmTwoFactorEnrollment(db as never, 999, '123456')).toBe(false)
  })
})
