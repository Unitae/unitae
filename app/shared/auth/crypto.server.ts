import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/**
 * https://dev.to/advename/comment/24a9e
 */
const keyLength = 32

/**
 * Deterministic SHA-256 hex digest for high-entropy lookup tokens (password-reset, email-verification).
 * Unlike `hash`, this is unsalted so the value stays uniquely indexable and can be looked up directly.
 * SHA-256 is sufficient given the tokens carry 256 bits of entropy (`randomBytes(32)`).
 */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export const hash = (password: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex')

    scrypt(password, salt, keyLength, (error, derivedKey) => {
      if (error) reject(error)
      resolve(`${salt}.${derivedKey.toString('hex')}`)
    })
  })
}

export const compare = (password: string, hash: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const [salt, hashKey] = hash.split('.')

    if (salt == null || hashKey == null) {
      reject(new Error('Invalid format for encrypted password'))
      return
    }

    const hashKeyBuff = Buffer.from(hashKey, 'hex')
    scrypt(password, salt, keyLength, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }

      resolve(timingSafeEqual(hashKeyBuff, derivedKey))
    })
  })
}
