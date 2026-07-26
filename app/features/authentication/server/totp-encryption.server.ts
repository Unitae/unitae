import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { getSessionSecrets } from '~/shared/utils/env.server'

// TOTP seeds must be recoverable to verify codes, so they are encrypted (not
// hashed) at rest with AES-256-GCM. The 32-byte key is derived from
// UNITAE_SESSION_SECRET — no extra env var to configure for self-hosters. A
// leaked session secret is already catastrophic, so binding the two is
// acceptable. Rotation is supported: new seeds are encrypted with the current
// (first) secret, while decryption tries every configured secret in turn, so
// rotating the session secret no longer forces users to re-enroll — as long as
// the previous secret stays in the list. Seeds are never re-encrypted, so
// dropping a still-in-use previous secret locks those users out (they re-enroll).
const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
// Non-secret, fixed salt: the entropy comes from the high-entropy session secret.
const KEY_SALT = 'unitae-totp-v1'

let cachedKeys: Buffer[] | null = null

// Keys derived from [current, ...previous] session secrets. keys[0] is the current one.
function getKeys(): Buffer[] {
  if (cachedKeys) return cachedKeys

  const secrets = getSessionSecrets()
  if (secrets.length === 0) {
    throw new Error('UNITAE_SESSION_SECRET is required to encrypt TOTP secrets')
  }

  cachedKeys = secrets.map(secret => scryptSync(secret, KEY_SALT, KEY_LENGTH))
  return cachedKeys
}

/**
 * Encrypts a plaintext TOTP seed. Output format: `iv:authTag:ciphertext`,
 * each part base64-encoded. A fresh random IV is used per call.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKeys()[0], iv)
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

  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')

  // Try the current secret first, then any previous ones — a seed encrypted before a rotation
  // still decrypts with the secret that was current at the time. The auth tag rejects wrong keys,
  // so a mismatch simply moves on; if none authenticate we rethrow the last failure (tampering
  // or a fully rotated-out secret).
  let lastError: unknown
  for (const key of getKeys()) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(authTag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to decrypt TOTP secret')
}
