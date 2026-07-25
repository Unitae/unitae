import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./totp.server', () => ({
  generateTotpSecret: vi.fn(),
  buildOtpAuthUri: vi.fn(),
}))

vi.mock('./totp-encryption.server', () => ({
  encryptSecret: vi.fn(),
}))

const { startTwoFactorEnrollment } = await import('./start-two-factor-enrollment.server')
const { generateTotpSecret, buildOtpAuthUri } = await import('./totp.server')
const { encryptSecret } = await import('./totp-encryption.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(generateTotpSecret).mockReturnValue('THESECRET')
  vi.mocked(buildOtpAuthUri).mockReturnValue('otpauth://totp/Unitae:a@b.com?secret=THESECRET')
  vi.mocked(encryptSecret).mockImplementation(plain => `enc(${plain})`)
})

describe('startTwoFactorEnrollment', () => {
  function fakeDb() {
    return { userAccount: { update: vi.fn().mockResolvedValue({}) } }
  }

  it('returns the plaintext secret and provisioning URI for display', async () => {
    const db = fakeDb()

    const result = await startTwoFactorEnrollment(db as never, 7, 'a@b.com')

    expect(result).toEqual({ secret: 'THESECRET', otpauthUri: 'otpauth://totp/Unitae:a@b.com?secret=THESECRET' })
  })

  it('stores the ENCRYPTED secret as a pending enrollment (enabledAt reset to null)', async () => {
    const db = fakeDb()

    await startTwoFactorEnrollment(db as never, 7, 'a@b.com')

    expect(db.userAccount.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { twoFactorSecret: 'enc(THESECRET)', twoFactorEnabledAt: null },
    })
  })
})
