import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/**
 * https://dev.to/advename/comment/24a9e
 */
const keyLength = 32

export const hash = async (password: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex')

    scrypt(password, salt, keyLength, (error, derivedKey) => {
      if (error) reject(error)
      resolve(`${salt}.${derivedKey.toString('hex')}`)
    })
  })
}

export const compare = async (password: string, hash: string): Promise<boolean> => {
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
