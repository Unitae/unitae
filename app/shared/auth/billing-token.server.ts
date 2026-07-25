import { createHmac, timingSafeEqual } from 'node:crypto'

// Jeton signé (HMAC-SHA256) qui autorise un admin connecté à ouvrir la facturation SaaS sur le
// site marketing sans exposer le slug en clair dans l'URL. Le site vérifie la signature au lieu
// de faire confiance à un `?congregation=slug` brut. Le secret `BILLING_LINK_SECRET` est partagé
// entre l'app principale (émission) et le site (vérification).

// TTL des liens ouverts depuis l'app (session active) : court.
export const BILLING_TOKEN_TTL_MS = 15 * 60 * 1000
// TTL des liens envoyés par email (clic non authentifié) : plus long, façon magic-link.
export const BILLING_EMAIL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type BillingTokenPurpose = 'billing' | 'checkout'

export interface BillingTokenPayload {
  slug: string
  purpose: BillingTokenPurpose
  exp: number // horodatage unix en ms
}

export type VerifyResult =
  | { valid: true; payload: BillingTokenPayload }
  | { valid: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'bad-purpose' }

// Doit rester identique dans les trois copies (app/site/plateforme). Le slug signé est réinjecté
// dans des appels API / URLs côté site : on le revalide après parsing plutôt que de lui faire
// confiance sur la seule signature (défense en profondeur).
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
