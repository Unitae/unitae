import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { verifyCronSecret } from './cron.server'

function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {}
  if (authHeader !== undefined) headers.Authorization = authHeader
  return new Request('http://localhost/cron/sync', { headers })
}

describe('verifyCronSecret', () => {
  const originalEnv = process.env.UNITAE_CRON_SECRET

  beforeEach(() => {
    process.env.UNITAE_CRON_SECRET = 'supersecrettoken'
  })

  afterEach(() => {
    process.env.UNITAE_CRON_SECRET = originalEnv
  })

  it('returns true when the Authorization header matches the secret', () => {
    expect(verifyCronSecret(makeRequest('Bearer supersecrettoken'))).toBe(true)
  })

  it('returns false when UNITAE_CRON_SECRET is not set', () => {
    delete process.env.UNITAE_CRON_SECRET
    expect(verifyCronSecret(makeRequest('Bearer supersecrettoken'))).toBe(false)
  })

  it('returns false when UNITAE_CRON_SECRET is empty string', () => {
    process.env.UNITAE_CRON_SECRET = ''
    expect(verifyCronSecret(makeRequest('Bearer '))).toBe(false)
  })

  it('returns false when Authorization header is missing', () => {
    expect(verifyCronSecret(makeRequest())).toBe(false)
  })

  it('returns false when Authorization does not start with "Bearer "', () => {
    expect(verifyCronSecret(makeRequest('Basic supersecrettoken'))).toBe(false)
  })

  it('returns false when Authorization is just "Bearer" without a space', () => {
    expect(verifyCronSecret(makeRequest('Bearersupersecrettoken'))).toBe(false)
  })

  it('returns false when token length differs from secret (timing-safe shortcut)', () => {
    expect(verifyCronSecret(makeRequest('Bearer short'))).toBe(false)
  })

  it('returns false when token has same length but different content', () => {
    expect(verifyCronSecret(makeRequest('Bearer supersecrettokex'))).toBe(false)
  })
})
