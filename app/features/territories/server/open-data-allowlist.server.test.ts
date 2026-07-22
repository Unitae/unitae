import { afterEach, describe, expect, it } from 'vitest'
import { ValidationError } from '~/shared/errors/app-error.server'
import { assertAllowedOpenDataUrl, OPEN_DATA_DEFAULT_HOSTS } from './open-data-allowlist.server'

const originalAllowlist = process.env.UNITAE_OPEN_DATA_ALLOWLIST

afterEach(() => {
  if (originalAllowlist === undefined) {
    delete process.env.UNITAE_OPEN_DATA_ALLOWLIST
  } else {
    process.env.UNITAE_OPEN_DATA_ALLOWLIST = originalAllowlist
  }
})

describe('assertAllowedOpenDataUrl', () => {
  it('accepts an https URL on a default allowlisted host', () => {
    delete process.env.UNITAE_OPEN_DATA_ALLOWLIST
    const url = assertAllowedOpenDataUrl(`https://${OPEN_DATA_DEFAULT_HOSTS[0]}/data/bano.csv`)
    expect(url.hostname).toBe(OPEN_DATA_DEFAULT_HOSTS[0])
  })

  it('accepts a host added through UNITAE_OPEN_DATA_ALLOWLIST', () => {
    process.env.UNITAE_OPEN_DATA_ALLOWLIST = 'mirror.example.com, other.example.org'
    const url = assertAllowedOpenDataUrl('https://mirror.example.com/bano.csv')
    expect(url.hostname).toBe('mirror.example.com')
  })

  it('matches allowlisted hosts case-insensitively', () => {
    delete process.env.UNITAE_OPEN_DATA_ALLOWLIST
    const url = assertAllowedOpenDataUrl(`https://${OPEN_DATA_DEFAULT_HOSTS[0].toUpperCase()}/x.csv`)
    expect(url.hostname).toBe(OPEN_DATA_DEFAULT_HOSTS[0])
  })

  it('rejects a host that is not on the allowlist', () => {
    delete process.env.UNITAE_OPEN_DATA_ALLOWLIST
    expect(() => assertAllowedOpenDataUrl('https://evil.example.com/bano.csv')).toThrow(ValidationError)
  })

  it('rejects a non-https scheme', () => {
    delete process.env.UNITAE_OPEN_DATA_ALLOWLIST
    expect(() => assertAllowedOpenDataUrl(`http://${OPEN_DATA_DEFAULT_HOSTS[0]}/bano.csv`)).toThrow(ValidationError)
  })

  it('rejects a syntactically invalid URL', () => {
    delete process.env.UNITAE_OPEN_DATA_ALLOWLIST
    expect(() => assertAllowedOpenDataUrl('not a url')).toThrow(ValidationError)
  })

  it('throws a ValidationError scoped to the bano-url field', () => {
    delete process.env.UNITAE_OPEN_DATA_ALLOWLIST
    try {
      assertAllowedOpenDataUrl('https://evil.example.com/bano.csv')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).field).toBe('bano-url')
    }
  })
})
