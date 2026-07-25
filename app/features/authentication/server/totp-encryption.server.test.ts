import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The key is derived lazily from UNITAE_SESSION_SECRET, so stubbing it before the
// first encrypt/decrypt call is enough.
beforeAll(() => {
  vi.stubEnv('UNITAE_SESSION_SECRET', 'a-sufficiently-long-test-session-secret-value')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('totp-encryption', () => {
  it('round-trips a secret back to the original plaintext', async () => {
    const { encryptSecret, decryptSecret } = await import('./totp-encryption.server')

    const plaintext = 'JBSWY3DPEHPK3PXP'
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext)
  })

  it('produces ciphertext that does not contain the plaintext', async () => {
    const { encryptSecret } = await import('./totp-encryption.server')

    const plaintext = 'JBSWY3DPEHPK3PXP'
    expect(encryptSecret(plaintext)).not.toContain(plaintext)
  })

  it('produces different ciphertext for the same plaintext each time (random IV)', async () => {
    const { encryptSecret } = await import('./totp-encryption.server')

    expect(encryptSecret('JBSWY3DPEHPK3PXP')).not.toBe(encryptSecret('JBSWY3DPEHPK3PXP'))
  })

  it('rejects a tampered payload (authentication tag mismatch)', async () => {
    const { encryptSecret, decryptSecret } = await import('./totp-encryption.server')

    const payload = encryptSecret('JBSWY3DPEHPK3PXP')
    const [iv, tag, data] = payload.split(':')
    // Flip the first character of the ciphertext (always significant, never padding).
    const corruptedData = `${data[0] === 'A' ? 'B' : 'A'}${data.slice(1)}`

    expect(() => decryptSecret(`${iv}:${tag}:${corruptedData}`)).toThrow()
  })

  it('rejects a malformed payload', async () => {
    const { decryptSecret } = await import('./totp-encryption.server')

    expect(() => decryptSecret('not-a-valid-payload')).toThrow()
  })
})
