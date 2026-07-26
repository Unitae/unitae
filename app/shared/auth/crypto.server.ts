import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/**
 * https://dev.to/advename/comment/24a9e
 */
const keyLength = 32

interface ScryptParams {
  N: number
  r: number
  p: number
}

// OWASP 2024 guidance for scrypt. Pinned explicitly so the cost never silently follows
// Node's (lower) defaults. New hashes embed these values so they stay verifiable even if
// the parameters are raised again later — see `parseStoredHash` / `needsRehash`.
const CURRENT_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1 }

// Node's historical scrypt defaults, used before parameters were pinned. Hashes stored in the
// legacy `salt.key` format (no scheme prefix) were derived with these and must keep verifying.
const LEGACY_PARAMS: ScryptParams = { N: 2 ** 14, r: 8, p: 1 }

// scrypt needs roughly 128 * N * r bytes; at N=2^17/r=8 that is ~128 MiB, above Node's default
// 32 MiB `maxmem` cap. Set with headroom above that largest requirement (~128 MiB) so both
// hashing and verification fit; bump this if CURRENT_PARAMS.N is ever raised past 2^18.
const maxmem = 256 * 1024 * 1024

const SCHEME = 'scrypt'

function derive(password: string, salt: string, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { ...params, maxmem }, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

interface ParsedHash {
  params: ScryptParams
  salt: string
  key: string
}

// New format: `scrypt$N$r$p$salt$key`. Legacy format (no `$`): `salt.key`, N=2^14.
function parseStoredHash(stored: string): ParsedHash {
  if (stored.includes('$')) {
    const [scheme, n, r, p, salt, key] = stored.split('$')
    if (scheme !== SCHEME || !n || !r || !p || !salt || !key) {
      throw new Error('Invalid format for encrypted password')
    }
    const params = { N: Number(n), r: Number(r), p: Number(p) }
    // Reject non-numeric params here so a corrupt stored hash fails as a clean format error
    // rather than a cryptic native scrypt crash ("N out of range … Received NaN") downstream.
    if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) {
      throw new Error('Invalid format for encrypted password')
    }
    return { params, salt, key }
  }

  const [salt, key] = stored.split('.')
  if (salt == null || key == null) {
    throw new Error('Invalid format for encrypted password')
  }
  return { params: LEGACY_PARAMS, salt, key }
}

/**
 * Deterministic SHA-256 hex digest for high-entropy lookup tokens (password-reset, email-verification).
 * Unlike `hash`, this is unsalted so the value stays uniquely indexable and can be looked up directly.
 * SHA-256 is sufficient given the tokens carry 256 bits of entropy (`randomBytes(32)`).
 */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export const hash = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = await derive(password, salt, CURRENT_PARAMS)

  return `${SCHEME}$${CURRENT_PARAMS.N}$${CURRENT_PARAMS.r}$${CURRENT_PARAMS.p}$${salt}$${derivedKey.toString('hex')}`
}

export const compare = async (password: string, stored: string): Promise<boolean> => {
  const { params, salt, key } = parseStoredHash(stored)

  const hashKeyBuff = Buffer.from(key, 'hex')
  const derivedKey = await derive(password, salt, params)

  return timingSafeEqual(hashKeyBuff, derivedKey)
}

/**
 * True when `stored` was derived with parameters *weaker* than the current ones — a signal for
 * the login path to transparently re-hash the password to the stronger cost. Never downgrades:
 * a hash stronger than current (e.g. a higher N after a future bump-then-rollback) is left as-is,
 * matching the conventional `password_needs_rehash` semantics (stored cost only ever increases).
 * Unparseable inputs (e.g. the imported-account sentinel) return false: there is nothing to upgrade.
 */
export const needsRehash = (stored: string): boolean => {
  try {
    const { params } = parseStoredHash(stored)
    return params.N < CURRENT_PARAMS.N || params.r < CURRENT_PARAMS.r || params.p < CURRENT_PARAMS.p
  } catch {
    return false
  }
}
