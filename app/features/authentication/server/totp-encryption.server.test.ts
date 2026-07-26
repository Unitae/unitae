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

  describe('secret rotation', () => {
    const OLD_SECRET = 'old-session-secret-value-long-enough-xx'
    const NEW_SECRET = 'new-session-secret-value-long-enough-yy'
    const PLAINTEXT = 'JBSWY3DPEHPK3PXP'

    async function encryptWith(secret: string): Promise<string> {
      vi.resetModules()
      vi.stubEnv('UNITAE_SESSION_SECRET', secret)
      const { encryptSecret } = await import('./totp-encryption.server')
      return encryptSecret(PLAINTEXT)
    }

    async function decryptWith(secret: string, payload: string): Promise<string> {
      vi.resetModules()
      vi.stubEnv('UNITAE_SESSION_SECRET', secret)
      const { decryptSecret } = await import('./totp-encryption.server')
      return decryptSecret(payload)
    }

    it('decrypts a seed encrypted before rotation using a previous secret', async () => {
      const payload = await encryptWith(OLD_SECRET)
      // After rotation the current secret is NEW; OLD is kept as a previous entry.
      expect(await decryptWith(`${NEW_SECRET},${OLD_SECRET}`, payload)).toBe(PLAINTEXT)
    })

    it('still round-trips with a single current secret', async () => {
      const payload = await encryptWith(NEW_SECRET)
      expect(await decryptWith(NEW_SECRET, payload)).toBe(PLAINTEXT)
    })

    it('encrypts new seeds with the current secret, not a previous one', async () => {
      // Encrypt while both secrets are configured, then fully rotate: dropping OLD must not break
      // a seed written after the rotation — proving encryption used the current (first) secret.
      const payload = await encryptWith(`${NEW_SECRET},${OLD_SECRET}`)
      expect(await decryptWith(NEW_SECRET, payload)).toBe(PLAINTEXT)
    })

    it('fails to decrypt when the encrypting secret has been fully rotated out', async () => {
      const payload = await encryptWith(OLD_SECRET)
      await expect(decryptWith(NEW_SECRET, payload)).rejects.toThrow()
    })
  })
})
