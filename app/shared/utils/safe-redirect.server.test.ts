import { describe, expect, it } from 'vitest'
import { normalizeRedirectPath, safeRedirectUrl } from './safe-redirect.server'

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

// Regression: a client-side navigation fetches `/programs.data`, not `/programs`. The session
// guard captured that pathname verbatim, so signing in again dropped the user on the loader
// endpoint — a raw payload or a 404 — instead of the page they were on.
describe('normalizeRedirectPath', () => {
  it('strips the single-fetch suffix from a page path', () => {
    expect(normalizeRedirectPath('/programs.data')).toBe('/programs')
  })

  it('strips it from a nested path', () => {
    expect(normalizeRedirectPath('/settings/congregation/templates.data')).toBe('/settings/congregation/templates')
  })

  // The URL this was actually reported from.
  it('strips it from the organigram path', () => {
    expect(normalizeRedirectPath('/congregation/roles/organigram.data')).toBe('/congregation/roles/organigram')
  })

  // The root route decorates as `/_.data`, not `/.data` — stripping only `.data` would leave
  // `/_`, which is not a route either.
  it('maps the decorated root back to the root path', () => {
    expect(normalizeRedirectPath('/_.data')).toBe('/')
  })

  it('does not leave a trailing slash on a nested decorated path', () => {
    expect(normalizeRedirectPath('/settings/_.data')).toBe('/settings')
  })

  it('drops the _routes single-fetch parameter', () => {
    expect(normalizeRedirectPath('/programs.data?_routes=routes%2Fprograms')).toBe('/programs')
  })

  it('keeps real query parameters while dropping _routes', () => {
    expect(normalizeRedirectPath('/programs.data?from=2026-09-01&_routes=x')).toBe('/programs?from=2026-09-01')
  })

  it('leaves an ordinary page path untouched', () => {
    expect(normalizeRedirectPath('/territories')).toBe('/territories')
  })

  // `.data` only decorates the end of the pathname; a route segment that merely contains the
  // word must survive intact.
  it('does not touch a path that merely contains "data"', () => {
    expect(normalizeRedirectPath('/exports/data')).toBe('/exports/data')
  })
})

describe('safeRedirectUrl — single-fetch targets', () => {
  it('normalises a .data target rather than sending the user to the loader endpoint', () => {
    expect(safeRedirectUrl('/programs.data', '/')).toBe('/programs')
  })

  // The query string is attacker-reachable, so the funnel has to clean it too — not just the
  // guard that builds the target.
  it('normalises a hand-edited redirectTo', () => {
    expect(safeRedirectUrl('/settings/_.data?_routes=root', '/')).toBe('/settings')
  })

  it('still refuses an absolute URL that ends in .data', () => {
    expect(safeRedirectUrl('https://evil.com/steal.data', '/')).toBe('/')
  })
})
