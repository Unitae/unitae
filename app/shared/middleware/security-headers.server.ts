import { randomBytes } from 'node:crypto'

import { createContext, type RouterContext } from 'react-router'

import logger from '~/shared/infra/logger.server'

/**
 * Per-request CSP nonce, produced by {@link securityHeaders} and consumed by the
 * root loader so the inline scripts we control (`<Scripts>`, `<ScrollRestoration>`,
 * the dark-mode boot script) carry the same nonce the CSP header advertises. While the
 * CSP is Report-Only nothing is actually blocked; the nonce is what will keep those
 * scripts allow-listed once the policy is switched to enforcement.
 */
export const nonceContext = createContext<string>()

// Disable powerful features the app never uses; keep geolocation available to
// `self` for the maps "locate me" control.
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()'

// Two years, emitted only over HTTPS (see `applySecurityHeaders`). We deliberately omit
// `includeSubDomains`/`preload` from this in-app default: the app can't know a
// self-hoster's subdomain topology, and those directives are near-irreversible for the
// max-age window. Operators who control their whole domain (e.g. the managed
// *.unitae.app deployment) opt into a stronger policy via `UNITAE_HSTS_HEADER`.
const DEFAULT_STRICT_TRANSPORT_SECURITY = 'max-age=63072000'

// Characters `Headers.set` rejects in a header value (CR/LF/NUL) — used to reject a
// malformed UNITAE_HSTS_HEADER before it can throw.
const INVALID_HEADER_VALUE_CHARS = /[\r\n\0]/

/**
 * The `Strict-Transport-Security` value to emit. Defaults to a conservative
 * subdomain-agnostic policy; override the full header value with `UNITAE_HSTS_HEADER`
 * (e.g. `max-age=63072000; includeSubDomains; preload`) when you control every
 * subdomain of the registrable domain.
 *
 * A malformed override (e.g. a stray CR/LF from multi-line env interpolation) would make
 * `Headers.set` throw on every request, so we ignore it and fall back to the safe default
 * — a valid HSTS header is always emitted rather than silently lost.
 */
export function getStrictTransportSecurity(): string {
  const override = process.env.UNITAE_HSTS_HEADER
  if (override && !INVALID_HEADER_VALUE_CHARS.test(override)) return override
  return DEFAULT_STRICT_TRANSPORT_SECURITY
}

/**
 * Builds the Content-Security-Policy value. Allow-lists the external origins the app
 * depends on (Google Maps SDK, Google Fonts) and locks down framing, base-uri, and
 * objects. Shipped in report mode first (per issue #284) — the header name that makes it
 * Report-Only is chosen in `applySecurityHeaders` — so real violations surface without
 * breaking Maps, Fonts, or hydration while the policy is tightened toward enforcement.
 */
export function buildContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://maps.googleapis.com https://maps.gstatic.com`,
    // Tailwind + the maps SDK inject inline styles; fonts.googleapis.com serves the font CSS.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.ggpht.com",
    'font-src https://fonts.gstatic.com',
    "connect-src 'self' https://maps.googleapis.com https://maps.gstatic.com",
    // Maps vector/WebGL rendering spawns blob: web workers.
    "worker-src 'self' blob:",
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
  // Report-Only (not the enforcing `Content-Security-Policy`) is authoritative here:
  // violations are reported, nothing is blocked, until the policy is tightened.
  headers.set('Content-Security-Policy-Report-Only', buildContentSecurityPolicy(nonce))

  // HSTS is meaningful (and spec-honoured) only over HTTPS; emitting it on plain
  // HTTP would be ignored and risks trapping self-hosters who serve over http on a LAN.
  if (isSecure) {
    headers.set('Strict-Transport-Security', getStrictTransportSecurity())
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
 * Applies the headers but never lets a header-mutation failure mask the underlying
 * response. `Headers.set` throws on responses with an immutable header guard
 * (`Response.redirect()`, a proxied `fetch()` body); if that ever happens we log and
 * ship the response un-hardened rather than replacing a valid redirect/response with an
 * opaque, un-traceable 500.
 */
function hardenResponse(response: Response, options: SecurityHeaderOptions): void {
  try {
    applySecurityHeaders(response.headers, options)
  } catch (error) {
    // Pass the message string, not the Error object: the logger's redaction pipeline
    // iterates enumerable keys and would drop an Error's non-enumerable message/stack.
    logger.warn('Failed to apply security headers to response', {
      error: error instanceof Error ? error.message : String(error),
      status: response.status,
    })
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

    const options: SecurityHeaderOptions = { nonce, isSecure: isSecureRequest(request) }

    try {
      const response = await next()
      hardenResponse(response, options)
      return response
    } catch (thrown) {
      // Loaders/guards throw `redirect()` Responses — harden those too before they leave.
      if (thrown instanceof Response) {
        hardenResponse(thrown, options)
      }
      throw thrown
    }
  }
}
