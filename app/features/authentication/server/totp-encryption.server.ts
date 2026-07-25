import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

// TOTP seeds must be recoverable to verify codes, so they are encrypted (not
// hashed) at rest with AES-256-GCM. The 32-byte key is derived from
// UNITAE_SESSION_SECRET — no extra env var to configure for self-hosters. A
// leaked session secret is already catastrophic, so binding the two is
// acceptable; the trade-off is that rotating the session secret invalidates
// enrolled TOTP secrets (users simply re-enroll).
const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
// Non-secret, fixed salt: the entropy comes from the high-entropy session secret.
const KEY_SALT = 'unitae-totp-v1'

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey

  const secret = process.env.UNITAE_SESSION_SECRET
  if (!secret) {
    throw new Error('UNITAE_SESSION_SECRET is required to encrypt TOTP secrets')
  }

  cachedKey = scryptSync(secret, KEY_SALT, KEY_LENGTH)
  return cachedKey
}

/**
 * Encrypts a plaintext TOTP seed. Output format: `iv:authTag:ciphertext`,
 * each part base64-encoded. A fresh random IV is used per call.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':')
}

/**
 * Decrypts a payload produced by {@link encryptSecret}. Throws on a malformed
 * payload or a failed authentication tag (tampering).
 */
export function decryptSecret(payload: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(':')
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Invalid encrypted TOTP secret format')
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))

  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()])
  return plaintext.toString('utf8')
}
