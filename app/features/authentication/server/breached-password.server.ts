import { createHash } from 'node:crypto'

import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('breached-password')

const HIBP_RANGE_ENDPOINT = 'https://api.pwnedpasswords.com/range'
const REQUEST_TIMEOUT_MS = 2_500
// A well-formed range line is `<35-hex-suffix>:<count>`.
const RANGE_LINE_RE = /^[0-9A-F]{35}:\d+/i

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

    // The range endpoint returns newline-delimited `<35-hex-suffix>:<count>`
    // lines. `Add-Padding: true` (above) mixes in decoy entries to defeat
    // response-size analysis; they need no filtering here since a decoy suffix
    // cannot match our real one.
    const body = await response.text()
    const lines = body
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    // A 200 can still carry a CDN/proxy error page or a changed format. Treat an
    // unparseable body as "not known-breached" (degrade-open) but log it, so a
    // silent drift in the integration is observable rather than invisible.
    const looksLikeRange = lines.length > 0 && lines.every(line => RANGE_LINE_RE.test(line))
    if (!looksLikeRange) {
      logger.warn('HIBP range body looked malformed; skipping breach check (degrade-open)', {
        status: response.status,
        lineCount: lines.length,
      })
      return false
    }

    return lines.some(line => line.split(':')[0]?.toUpperCase() === suffix)
  } catch (error) {
    logger.warn('HIBP range lookup failed; skipping breach check (degrade-open)', { error })
    return false
  }
}
