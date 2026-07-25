import { Secret, TOTP } from 'otpauth'
import { describe, expect, it } from 'vitest'
import { buildOtpAuthUri, generateTotpSecret, verifyTotpCode } from './totp.server'

const BASE32_PATTERN = /^[A-Z2-7]+$/
const OTPAUTH_PREFIX_PATTERN = /^otpauth:\/\/totp\//

describe('generateTotpSecret', () => {
  it('returns a base32 string', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(BASE32_PATTERN)
    expect(secret.length).toBeGreaterThanOrEqual(16)
  })

  it('returns a different secret each call', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret())
  })
})

describe('buildOtpAuthUri', () => {
  it('builds an otpauth URI carrying the issuer and secret', () => {
    const secret = 'JBSWY3DPEHPK3PXP'
    const uri = buildOtpAuthUri('alice@example.com', secret)

    expect(uri).toMatch(OTPAUTH_PREFIX_PATTERN)
    expect(uri).toContain('issuer=Unitae')
    expect(uri).toContain(`secret=${secret}`)
    expect(uri).toContain('alice%40example.com')
  })
})

describe('verifyTotpCode', () => {
  it('accepts a freshly generated code for the same secret', () => {
    const secret = 'JBSWY3DPEHPK3PXP'
    const code = new TOTP({ secret: Secret.fromBase32(secret) }).generate()

    expect(verifyTotpCode(secret, code)).toBe(true)
  })

  it('rejects a code generated for a different secret', () => {
    const code = new TOTP({ secret: Secret.fromBase32('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ') }).generate()

    expect(verifyTotpCode('JBSWY3DPEHPK3PXP', code)).toBe(false)
  })

  it('rejects a non-numeric code', () => {
    expect(verifyTotpCode('JBSWY3DPEHPK3PXP', 'abcdef')).toBe(false)
  })

  it('rejects an empty code', () => {
    expect(verifyTotpCode('JBSWY3DPEHPK3PXP', '')).toBe(false)
  })
})
