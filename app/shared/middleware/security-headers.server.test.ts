import { describe, expect, it } from 'vitest'

import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  generateNonce,
  isSecureRequest,
  nonceContext,
  securityHeaders,
} from '~/shared/middleware/security-headers.server'

describe('generateNonce', () => {
  it('returns a non-empty value', () => {
    expect(generateNonce().length).toBeGreaterThan(0)
  })

  it('returns a different value on each call', () => {
    expect(generateNonce()).not.toBe(generateNonce())
  })
})

describe('buildContentSecurityPolicy', () => {
  it('embeds the given nonce in the script-src directive', () => {
    const csp = buildContentSecurityPolicy('abc123')

    expect(csp).toContain("script-src 'self' 'nonce-abc123'")
  })

  it('blocks framing and locks down base-uri and objects', () => {
    const csp = buildContentSecurityPolicy('abc123')

    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  it('allows the external origins the app depends on', () => {
    const csp = buildContentSecurityPolicy('abc123')

    // Google Maps JS SDK + Google Fonts
    expect(csp).toContain('https://maps.googleapis.com')
    expect(csp).toContain('https://fonts.googleapis.com')
    expect(csp).toContain('https://fonts.gstatic.com')
  })

  it('scopes each external origin to the correct directive', () => {
    const directives = new Map(
      buildContentSecurityPolicy('abc123')
        .split('; ')
        .map(directive => {
          const [name, ...values] = directive.split(' ')
          return [name, values.join(' ')]
        }),
    )

    expect(directives.get('default-src')).toBe("'self'")
    expect(directives.get('connect-src')).toContain('https://maps.googleapis.com')
    expect(directives.get('img-src')).toContain('data:')
    expect(directives.get('img-src')).toContain('blob:')
    expect(directives.get('form-action')).toBe("'self'")
    // Maps vector rendering spawns blob: web workers.
    expect(directives.get('worker-src')).toBe("'self' blob:")
  })
})

describe('isSecureRequest', () => {
  it('trusts the X-Forwarded-Proto header set by a TLS-terminating proxy', () => {
    const request = new Request('http://internal:8080/', { headers: { 'x-forwarded-proto': 'https' } })

    expect(isSecureRequest(request)).toBe(true)
  })

  it('treats a direct https URL as secure', () => {
    expect(isSecureRequest(new Request('https://unitae.app/'))).toBe(true)
  })

  it('treats a plain http request as insecure', () => {
    expect(isSecureRequest(new Request('http://localhost:3000/'))).toBe(false)
  })
})

describe('applySecurityHeaders', () => {
  it('sets the hardening headers', () => {
    const headers = new Headers()

    applySecurityHeaders(headers, { nonce: 'n0nce', isSecure: true })

    expect(headers.get('X-Frame-Options')).toBe('DENY')
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('Permissions-Policy')).toContain('camera=()')
    // Kept open for the maps "locate me" control — guard against a blanket lock-down.
    expect(headers.get('Permissions-Policy')).toContain('geolocation=(self)')
    expect(headers.get('Content-Security-Policy-Report-Only')).toContain("'nonce-n0nce'")
  })

  it('ships CSP in report-only mode, never enforcing', () => {
    const headers = new Headers()

    applySecurityHeaders(headers, { nonce: 'n', isSecure: true })

    expect(headers.get('Content-Security-Policy-Report-Only')).toBeTruthy()
    expect(headers.get('Content-Security-Policy')).toBeNull()
  })

  it('sets HSTS only over a secure connection', () => {
    const secure = new Headers()
    applySecurityHeaders(secure, { nonce: 'n', isSecure: true })
    expect(secure.get('Strict-Transport-Security')).toContain('max-age=')

    const insecure = new Headers()
    applySecurityHeaders(insecure, { nonce: 'n', isSecure: false })
    expect(insecure.get('Strict-Transport-Security')).toBeNull()
  })
})

describe('securityHeaders middleware', () => {
  function fakeContext() {
    const store = new Map<unknown, unknown>()
    return {
      set: (key: unknown, value: unknown) => store.set(key, value),
      get: (key: unknown) => store.get(key),
    }
  }

  it('applies the headers to the downstream response', async () => {
    const middleware = securityHeaders()
    const context = fakeContext()
    const request = new Request('https://unitae.app/dashboard')

    const response = await middleware({ request, context }, async () => new Response('ok'))

    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=')
  })

  it('uses the same nonce in the CSP header and the shared context', async () => {
    const middleware = securityHeaders()
    const context = fakeContext()
    const request = new Request('https://unitae.app/dashboard')

    const response = await middleware({ request, context }, async () => new Response('ok'))

    const nonce = context.get(nonceContext)
    expect(nonce).toBeTruthy()
    expect(response.headers.get('Content-Security-Policy-Report-Only')).toContain(`'nonce-${nonce}'`)
  })

  it('still hardens a thrown redirect response', async () => {
    const middleware = securityHeaders()
    const context = fakeContext()
    const request = new Request('https://unitae.app/private')

    const redirect = new Response(null, { status: 302, headers: { Location: '/login' } })

    await expect(middleware({ request, context }, async () => Promise.reject(redirect))).rejects.toBe(redirect)
    expect(redirect.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('re-throws a non-Response error untouched', async () => {
    const middleware = securityHeaders()
    const context = fakeContext()
    const request = new Request('https://unitae.app/boom')

    const failure = new Error('loader exploded')

    await expect(middleware({ request, context }, async () => Promise.reject(failure))).rejects.toBe(failure)
  })

  it('never masks a response whose headers are immutable', async () => {
    const middleware = securityHeaders()
    const context = fakeContext()
    const request = new Request('https://unitae.app/redirect')

    // Response.redirect() produces an immutable header guard — headers.set() throws.
    const immutable = Response.redirect('https://unitae.app/login', 302)

    const response = await middleware({ request, context }, async () => immutable)

    // The original response survives instead of being replaced by a crash.
    expect(response).toBe(immutable)
    expect(response.status).toBe(302)
  })
})
