import { describe, expect, it } from 'vitest'
import { safeRedirectUrl } from './safe-redirect.server'

describe('safeRedirectUrl', () => {
  it('returns a valid relative path unchanged', () => {
    expect(safeRedirectUrl('/dashboard', '/')).toBe('/dashboard')
  })

  it('returns a nested relative path unchanged', () => {
    expect(safeRedirectUrl('/settings/users', '/')).toBe('/settings/users')
  })

  it('returns a path with query string unchanged', () => {
    expect(safeRedirectUrl('/search?q=test', '/')).toBe('/search?q=test')
  })

  it('returns fallback for null url', () => {
    expect(safeRedirectUrl(null, '/fallback')).toBe('/fallback')
  })

  it('returns fallback for empty string', () => {
    expect(safeRedirectUrl('', '/fallback')).toBe('/fallback')
  })

  it('returns fallback for absolute http URL — open redirect prevention', () => {
    expect(safeRedirectUrl('http://evil.com', '/')).toBe('/')
  })

  it('returns fallback for absolute https URL — open redirect prevention', () => {
    expect(safeRedirectUrl('https://evil.com/steal', '/')).toBe('/')
  })

  it('returns fallback for protocol-relative URL — open redirect prevention', () => {
    expect(safeRedirectUrl('//evil.com', '/')).toBe('/')
  })

  it('returns fallback for URL without leading slash', () => {
    expect(safeRedirectUrl('evil.com', '/')).toBe('/')
  })

  it('returns fallback for relative path disguised as absolute (no slash)', () => {
    expect(safeRedirectUrl('javascript:alert(1)', '/')).toBe('/')
  })

  it('uses the provided fallback value', () => {
    expect(safeRedirectUrl(null, '/login')).toBe('/login')
  })
})
