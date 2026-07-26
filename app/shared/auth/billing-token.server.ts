import { createHmac, timingSafeEqual } from 'node:crypto'

// Signed token (HMAC-SHA256) that lets a logged-in admin open the SaaS billing flow on the
// marketing site without exposing the slug in cleartext in the URL. The site verifies the
// signature instead of trusting a raw `?congregation=slug`. The `BILLING_LINK_SECRET` secret is
// shared between the issuers (main app + platform emails) and the site (verification).
//
// The token wire format (JSON serialization + base64url + HMAC) must stay byte-identical across
// the three copies (app / platform / site) or signatures won't validate; the golden-vector test
// pins it. Keep this file in sync across the repos.

// TTL for links opened from the app (active session): short.
export const BILLING_TOKEN_TTL_MS = 15 * 60 * 1000
// TTL for links sent by email (unauthenticated click): longer, magic-link style.
export const BILLING_EMAIL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type BillingTokenPurpose = 'billing' | 'checkout'

export interface BillingTokenPayload {
  slug: string
  purpose: BillingTokenPurpose
  exp: number // unix timestamp in ms
}

export type VerifyResult =
  | { valid: true; payload: BillingTokenPayload }
  | { valid: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'bad-purpose' }

// Verifier-side defense-in-depth: after the signature passes, the signed slug is re-validated
// before the site reinjects it into API calls / URLs — it is not trusted on the signature alone.
// (Issuers never run this pattern; only the verifying site does.)
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length >= 2 && slug.length <= 63 && SLUG_PATTERN.test(slug)
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

export function mintBillingToken(payload: BillingTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

export function mintBillingLink(
  slug: string,
  purpose: BillingTokenPurpose,
  secret: string,
  opts: { now: number; ttlMs: number },
): string {
  return mintBillingToken({ slug, purpose, exp: opts.now + opts.ttlMs }, secret)
}

export function verifyBillingToken(
  token: string,
  secret: string,
  opts: { purpose: BillingTokenPurpose; now: number },
): VerifyResult {
  const parts = token.split('.')
  if (parts.length !== 2) return { valid: false, reason: 'malformed' }

  const [body, signature] = parts
  const expected = sign(body, secret)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false, reason: 'bad-signature' }
  }

  let payload: BillingTokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { valid: false, reason: 'malformed' }
  }

  if (payload.purpose !== opts.purpose) return { valid: false, reason: 'bad-purpose' }
  if (typeof payload.exp !== 'number' || payload.exp < opts.now) return { valid: false, reason: 'expired' }
  if (!isValidSlug(payload.slug)) return { valid: false, reason: 'malformed' }

  return { valid: true, payload }
}
