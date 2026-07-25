import { describe, expect, it } from 'vitest'
import { compare } from '~/shared/auth/crypto.server'
import { DECOY_HASH } from './validate-credentials.server'

const SALT_RE = /^[0-9a-f]{32}$/
const KEY_RE = /^[0-9a-f]{64}$/

// The decoy hash is the whole timing-equalization mechanism: unknown/inactive logins
// run a full scrypt against it instead of returning early. If it is ever edited into a
// malformed shape, `compare` rejects *before* running scrypt (see crypto.server), that
// rejection is swallowed by validateCredentials' catch, and the timing oracle silently
// returns — while every mocked-`compare` unit test stays green. This test uses the REAL
// compare so a broken decoy fails in the commit-gating suite, not only in integration.
describe('DECOY_HASH', () => {
  it('est un hash scrypt valide contre lequel compare tourne sans lever', async () => {
    // Resolves (does not reject) → the format is valid and a full scrypt + timingSafeEqual ran.
    await expect(compare('any-password', DECOY_HASH)).resolves.toBe(false)
  })

  it('a la forme sel.clé attendue (sel 32 hex, clé 64 hex)', () => {
    const [salt, key] = DECOY_HASH.split('.')
    expect(salt).toMatch(SALT_RE)
    expect(key).toMatch(KEY_RE)
  })
})
