import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { type Readable, Transform } from 'node:stream'
import { ValidationError } from '~/shared/errors/app-error.server'
import { assertAllowedOpenDataUrl } from './open-data-allowlist.server'

export const FETCH_TIMEOUT_MS = 15_000
export const MAX_REDIRECTS = 5
export const MAX_RESPONSE_BYTES = 50 * 1024 * 1024

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const IPV4_MAPPED_HEX = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/

// `BlockList` matches on the parsed numeric address, so it canonicalises
// compressed/expanded IPv6 forms (`::1` and `0:0:0:0:0:0:0:1` both match) —
// unlike a string-prefix check, which fails open on the expanded form.
const ipv4BlockList = new BlockList()
ipv4BlockList.addSubnet('0.0.0.0', 8, 'ipv4') // unspecified
ipv4BlockList.addSubnet('10.0.0.0', 8, 'ipv4') // private
ipv4BlockList.addSubnet('127.0.0.0', 8, 'ipv4') // loopback
ipv4BlockList.addSubnet('169.254.0.0', 16, 'ipv4') // link-local
ipv4BlockList.addSubnet('172.16.0.0', 12, 'ipv4') // private
ipv4BlockList.addSubnet('192.168.0.0', 16, 'ipv4') // private
ipv4BlockList.addSubnet('100.64.0.0', 10, 'ipv4') // CGNAT

const ipv6BlockList = new BlockList()
ipv6BlockList.addAddress('::', 'ipv6') // unspecified
ipv6BlockList.addAddress('::1', 'ipv6') // loopback
ipv6BlockList.addSubnet('fe80::', 10, 'ipv6') // link-local
ipv6BlockList.addSubnet('fc00::', 7, 'ipv6') // unique-local

// Extract the embedded IPv4 of an IPv4-mapped IPv6 address — both the dotted
// form (`::ffff:127.0.0.1`) and the hex form (`::ffff:7f00:1`) — else null.
// `BlockList` does not match IPv4-mapped addresses against IPv4 rules, so we
// route them through the IPv4 list explicitly.
function mappedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase()
  if (!lower.startsWith('::ffff:')) return null

  const rest = lower.slice('::ffff:'.length)
  if (isIP(rest) === 4) return rest

  const hex = rest.match(IPV4_MAPPED_HEX)
  if (!hex) return null

  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

/**
 * True for loopback, private, link-local, CGNAT and unspecified ranges (IPv4
 * and IPv6, including IPv4-mapped IPv6). Anything that is not a valid IP is
 * treated as blocked (fail closed).
 */
export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return ipv4BlockList.check(ip, 'ipv4')
  if (kind !== 6) return true // not a valid IP → block (fail closed)

  const mapped = mappedIpv4(ip)
  if (mapped) return ipv4BlockList.check(mapped, 'ipv4')

  return ipv6BlockList.check(ip, 'ipv6')
}

async function assertPublicHost(url: URL): Promise<void> {
  let addresses: { address: string }[]
  try {
    addresses = await lookup(url.hostname, { all: true })
  } catch (cause) {
    const error = new ValidationError('bano-url', "Résolution DNS impossible pour l'hôte des données ouvertes")
    error.cause = cause // preserve EAI_AGAIN vs ENOTFOUND for operators
    throw error
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new ValidationError('bano-url', "L'hôte des données ouvertes résout vers une adresse interne")
  }
}

/**
 * Fetch an open-data URL with SSRF protections: https-only, host allowlist,
 * pre-connect DNS/private-range block, and manual redirect handling that
 * re-validates every hop. Returns the response once it stops redirecting (or a
 * redirect response that carries no Location header).
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
