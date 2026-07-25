import { createHash } from 'node:crypto'

import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('breached-password')

const HIBP_RANGE_ENDPOINT = 'https://api.pwnedpasswords.com/range'
const REQUEST_TIMEOUT_MS = 2_500

/**
 * Checks a candidate password against the HaveIBeenPwned "Pwned Passwords"
 * corpus using the k-anonymity range API: only the first 5 hex chars of the
 * SHA-1 hash ever leave the server, and the full hash is never transmitted.
 *
 * Degrades OPEN: any network error, timeout, or non-200 response returns
 * `false` (treated as "not known-breached"). Availability of password changes
 * must never depend on a third-party service being reachable.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)

  try {
    const response = await fetch(`${HIBP_RANGE_ENDPOINT}/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!response.ok) {
      logger.warn('HIBP range lookup returned a non-OK status; skipping breach check', { status: response.status })
      return false
    }

    const body = await response.text()
    return body.split('\n').some(line => {
      const lineSuffix = line.split(':')[0]?.trim()
      return lineSuffix?.toUpperCase() === suffix
    })
  } catch (error) {
    logger.warn('HIBP range lookup failed; skipping breach check (degrade-open)', { error })
    return false
  }
}
