import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { type Readable, Transform } from 'node:stream'
import { ValidationError } from '~/shared/errors/app-error.server'
import { assertAllowedOpenDataUrl } from './open-data-allowlist.server'

export const FETCH_TIMEOUT_MS = 15_000
export const MAX_REDIRECTS = 5
export const MAX_RESPONSE_BYTES = 50 * 1024 * 1024

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) {
    return true
  }

  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8 (unspecified)
  if (a === 10) return true // 10.0.0.0/8 (private)
  if (a === 127) return true // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true // 169.254.0.0/16 (link-local)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 (private)
  if (a === 192 && b === 168) return true // 192.168.0.0/16 (private)
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 (CGNAT)
  return false
}

/**
 * True for loopback, private, link-local, CGNAT and unspecified ranges (IPv4
 * and IPv6, including IPv4-mapped IPv6). Anything that is not a valid IP is
 * treated as blocked (fail closed).
 */
export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return isBlockedIpv4(ip)
  if (kind !== 6) return true

  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true // unspecified / loopback
  if (lower.startsWith('::ffff:') && lower.includes('.')) {
    return isBlockedIpv4(lower.slice('::ffff:'.length))
  }

  const firstHextet = Number.parseInt(lower.split(':')[0] || '0', 16)
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true // fe80::/10 (link-local)
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true // fc00::/7 (unique-local)
  return false
}

async function assertPublicHost(url: URL): Promise<void> {
  let addresses: { address: string }[]
  try {
    addresses = await lookup(url.hostname, { all: true })
  } catch {
    throw new ValidationError('bano-url', "Résolution DNS impossible pour l'hôte des données ouvertes")
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new ValidationError('bano-url', "L'hôte des données ouvertes résout vers une adresse interne")
  }
}

/**
 * Fetch an open-data URL with SSRF protections: https-only, host allowlist,
 * pre-connect DNS/private-range block, and manual redirect handling that
 * re-validates every hop. Returns the final non-redirect response.
 */
export async function safeOpenDataFetch(value: string): Promise<Response> {
  let target = assertAllowedOpenDataUrl(value)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(target)

    const response = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response
    }

    const location = response.headers.get('location')
    if (!location) {
      return response
    }

    // Re-validate the redirect target against the same allowlist + scheme rules.
    target = assertAllowedOpenDataUrl(new URL(location, target).toString())
  }

  throw new ValidationError('bano-url', 'Trop de redirections pour les données ouvertes')
}

/**
 * Wrap a readable so it errors out once more than `maxBytes` have flowed
 * through — a defence against a hostile endpoint streaming an unbounded body.
 */
export function capBytes(source: Readable, maxBytes = MAX_RESPONSE_BYTES): Readable {
  let seen = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      seen += chunk.length
      if (seen > maxBytes) {
        callback(new Error(`Open-data response exceeded ${maxBytes} bytes`))
        return
      }
      callback(null, chunk)
    },
  })

  source.on('error', error => limiter.destroy(error))
  return source.pipe(limiter)
}
