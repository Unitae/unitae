import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findFirst: vi.fn() },
  },
}))

vi.mock('./totp.server', () => ({
  verifyTotpCode: vi.fn(),
}))

vi.mock('./totp-encryption.server', () => ({
  decryptSecret: vi.fn(),
}))

const { verifyTwoFactorChallenge } = await import('./verify-two-factor-challenge.server')
const { unscopedDb } = await import('~/shared/infra/db.server')
const { verifyTotpCode } = await import('./totp.server')
const { decryptSecret } = await import('./totp-encryption.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(decryptSecret).mockReturnValue('THESECRET')
})

const enrolledActiveAccount = {
  twoFactorSecret: 'enc(THESECRET)',
  twoFactorEnabledAt: new Date(),
  active: true,
}

describe('verifyTwoFactorChallenge', () => {
  it('returns true for a valid code on an enrolled, active account', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue(enrolledActiveAccount as never)
    vi.mocked(verifyTotpCode).mockReturnValue(true)

    expect(await verifyTwoFactorChallenge(7, '123456')).toBe(true)
  })

  it('returns false for an invalid code', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue(enrolledActiveAccount as never)
    vi.mocked(verifyTotpCode).mockReturnValue(false)

    expect(await verifyTwoFactorChallenge(7, '000000')).toBe(false)
  })

  it('returns false when the account is not enrolled (enabledAt null)', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({
      twoFactorSecret: 'enc(THESECRET)',
      twoFactorEnabledAt: null,
      active: true,
    } as never)

    expect(await verifyTwoFactorChallenge(7, '123456')).toBe(false)
    expect(verifyTotpCode).not.toHaveBeenCalled()
  })

  it('returns false when the account has been deactivated', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({ ...enrolledActiveAccount, active: false } as never)

    expect(await verifyTwoFactorChallenge(7, '123456')).toBe(false)
    expect(verifyTotpCode).not.toHaveBeenCalled()
  })

  it('returns false when the account does not exist', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue(null as never)

    expect(await verifyTwoFactorChallenge(999, '123456')).toBe(false)
  })
})
