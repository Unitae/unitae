import { describe, expect, it } from 'vitest'
import { mintBillingLink, mintBillingToken, verifyBillingToken } from './billing-token.server'

const SECRET = 'test-billing-secret'
const NOW = 1_800_000_000_000

describe('billing token', () => {
  it('round-trips a valid token (slug + purpose)', () => {
    const token = mintBillingLink('grace-community', 'billing', SECRET, { now: NOW, ttlMs: 15 * 60 * 1000 })
    const result = verifyBillingToken(token, SECRET, { purpose: 'billing', now: NOW })
    expect(result).toEqual({
      valid: true,
      payload: { slug: 'grace-community', purpose: 'billing', exp: NOW + 15 * 60 * 1000 },
    })
  })

  it('rejects a tampered signature', () => {
    const token = mintBillingToken({ slug: 's', purpose: 'billing', exp: NOW + 1000 }, SECRET)
    const [body] = token.split('.')
    const forged = `${body}.tampered`
    expect(verifyBillingToken(forged, SECRET, { purpose: 'billing', now: NOW })).toEqual({
      valid: false,
      reason: 'bad-signature',
    })
  })

  it('rejects a token signed with a different secret', () => {
    const token = mintBillingToken({ slug: 's', purpose: 'billing', exp: NOW + 1000 }, 'other-secret')
    expect(verifyBillingToken(token, SECRET, { purpose: 'billing', now: NOW }).valid).toBe(false)
  })

  it('rejects an expired token', () => {
    const token = mintBillingToken({ slug: 's', purpose: 'billing', exp: NOW - 1 }, SECRET)
    expect(verifyBillingToken(token, SECRET, { purpose: 'billing', now: NOW })).toEqual({
      valid: false,
      reason: 'expired',
    })
  })

  it('rejects a purpose mismatch (billing token used for checkout)', () => {
    const token = mintBillingToken({ slug: 's', purpose: 'billing', exp: NOW + 1000 }, SECRET)
    expect(verifyBillingToken(token, SECRET, { purpose: 'checkout', now: NOW })).toEqual({
      valid: false,
      reason: 'bad-purpose',
    })
  })

  it('rejects a malformed token', () => {
    expect(verifyBillingToken('not-a-token', SECRET, { purpose: 'billing', now: NOW })).toEqual({
      valid: false,
      reason: 'malformed',
    })
  })

  it('rejects a signed token whose slug is not a valid slug', () => {
    for (const badSlug of ['Bad Slug', 'a', 'has_underscore', '-leading', '']) {
      const token = mintBillingToken({ slug: badSlug, purpose: 'billing', exp: NOW + 1000 }, SECRET)
      expect(verifyBillingToken(token, SECRET, { purpose: 'billing', now: NOW })).toEqual({
        valid: false,
        reason: 'malformed',
      })
    }
  })
})

// Golden vector — MUST match the platform + website copies byte-for-byte (see their tests).
describe('cross-repo golden vector', () => {
  const GOLDEN_SECRET = 'unitae-golden-vector-secret-v1'
  const GOLDEN_PAYLOAD = { slug: 'golden-congregation', purpose: 'billing', exp: 1_893_456_000_000 } as const
  const GOLDEN_TOKEN =
    'eyJzbHVnIjoiZ29sZGVuLWNvbmdyZWdhdGlvbiIsInB1cnBvc2UiOiJiaWxsaW5nIiwiZXhwIjoxODkzNDU2MDAwMDAwfQ.zCJgTnAVAyxcnB7RKJ0PmtiYVVy9b0vTISU39BPoaNE'

  it('mints the exact golden token', () => {
    expect(mintBillingToken(GOLDEN_PAYLOAD, GOLDEN_SECRET)).toBe(GOLDEN_TOKEN)
  })

  it('verifies the golden token to the golden payload', () => {
    expect(
      verifyBillingToken(GOLDEN_TOKEN, GOLDEN_SECRET, { purpose: 'billing', now: GOLDEN_PAYLOAD.exp - 1 }),
    ).toEqual({
      valid: true,
      payload: GOLDEN_PAYLOAD,
    })
  })
})
