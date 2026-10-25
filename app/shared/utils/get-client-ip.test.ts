import { describe, expect, it } from 'vitest'
import { getClientIp } from './get-client-ip'

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request('https://example.test/login', { headers })
}

describe('getClientIp', () => {
  // server.js resolves the client address with Express `trust proxy` (walking X-Forwarded-For from
  // the right, past trusted proxies) and passes it on in this header, overwriting any sent value.
  it('prefers the address server.js resolved over the raw forwarding headers', () => {
    const request = requestWithHeaders({
      'x-unitae-client-ip': '198.51.100.20',
      'x-forwarded-for': '203.0.113.99, 198.51.100.20',
      'x-real-ip': '203.0.113.98',
    })
    expect(getClientIp(request)).toBe('198.51.100.20')
  })

  it('returns the x-forwarded-for value when it is a single address', () => {
    const request = requestWithHeaders({ 'x-forwarded-for': '203.0.113.7' })
    expect(getClientIp(request)).toBe('203.0.113.7')
  })

  it('returns the first hop when x-forwarded-for is a comma-separated list', () => {
    const request = requestWithHeaders({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })
    expect(getClientIp(request)).toBe('203.0.113.7')
  })

  it('trims surrounding whitespace from the returned address', () => {
    const request = requestWithHeaders({ 'x-forwarded-for': '  203.0.113.7  , 70.41.3.18' })
    expect(getClientIp(request)).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const request = requestWithHeaders({ 'x-real-ip': '198.51.100.4' })
    expect(getClientIp(request)).toBe('198.51.100.4')
  })

  it('returns undefined when no forwarding header is present', () => {
    const request = requestWithHeaders({})
    expect(getClientIp(request)).toBeUndefined()
  })

  it('falls back to x-real-ip when x-forwarded-for is present but empty', () => {
    const request = requestWithHeaders({ 'x-forwarded-for': '   ', 'x-real-ip': '198.51.100.4' })
    expect(getClientIp(request)).toBe('198.51.100.4')
  })
})
