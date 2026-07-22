import { randomBytes } from 'node:crypto'

import { createContext, type RouterContext } from 'react-router'

/**
 * Per-request CSP nonce, produced by {@link securityHeaders} and consumed by the
 * root loader so the inline scripts we control (`<Scripts>`, `<ScrollRestoration>`,
 * the dark-mode boot script) can be allow-listed by the same nonce the header carries.
 */
export const nonceContext = createContext<string>()

// Disable powerful features the app never uses; keep geolocation available to
// `self` for the maps "locate me" control.
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()'

// Two years, preloadable. Only emitted over HTTPS (see `applySecurityHeaders`).
const STRICT_TRANSPORT_SECURITY = 'max-age=63072000; includeSubDomains; preload'

/**
 * Report-Only Content-Security-Policy. Shipped in report mode first (per issue #284)
 * so real violations surface in the browser console without breaking Google Maps,
 * Google Fonts, or hydration while the policy is tightened toward enforcement.
 */
export function buildContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://maps.googleapis.com`,
    // Tailwind + the maps SDK inject inline styles; fonts.googleapis.com serves the font CSS.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.ggpht.com",
    'font-src https://fonts.gstatic.com',
    "connect-src 'self' https://maps.googleapis.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

interface SecurityHeaderOptions {
  nonce: string
  isSecure: boolean
}

export function applySecurityHeaders(headers: Headers, { nonce, isSecure }: SecurityHeaderOptions): void {
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', PERMISSIONS_POLICY)
  headers.set('Content-Security-Policy-Report-Only', buildContentSecurityPolicy(nonce))

  // HSTS is meaningful (and spec-honoured) only over HTTPS; emitting it on plain
  // HTTP would be ignored and risks trapping self-hosters who serve over http on a LAN.
  if (isSecure) {
    headers.set('Strict-Transport-Security', STRICT_TRANSPORT_SECURITY)
  }
}

export function generateNonce(): string {
  return randomBytes(16).toString('base64')
}

export function isSecureRequest(request: Request): boolean {
  if (request.headers.get('x-forwarded-proto') === 'https') return true
  return new URL(request.url).protocol === 'https:'
}

interface MiddlewareArgs {
  request: Request
  context: {
    set<C extends RouterContext>(context: C, value: C extends RouterContext<infer T> ? T : never): void
  }
}

/**
 * Root-route middleware that hardens every response (documents, data requests,
 * resource routes) with security headers and publishes a per-request CSP nonce.
 *
 * Apply on the root route so it cascades to the whole app.
 */
export function securityHeaders() {
  return async ({ request, context }: MiddlewareArgs, next: () => Promise<Response>) => {
    const nonce = generateNonce()
    context.set(nonceContext, nonce)

    const isSecure = isSecureRequest(request)

    try {
      const response = await next()
      applySecurityHeaders(response.headers, { nonce, isSecure })
      return response
    } catch (thrown) {
      // Loaders/guards throw `redirect()` Responses — harden those too before they leave.
      if (thrown instanceof Response) {
        applySecurityHeaders(thrown.headers, { nonce, isSecure })
      }
      throw thrown
    }
  }
}
