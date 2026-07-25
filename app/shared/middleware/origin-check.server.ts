import type { RouterContext } from 'react-router'

import logger from '~/shared/infra/logger.server'

/**
 * Defence-in-depth CSRF guard: rejects a state-changing request whose `Origin`
 * (or `Referer` fallback) host does not match the site's own host. This sits alongside
 * the primary `SameSite=Lax` cookie protection (see issue #294).
 *
 * The check is deliberately *lenient*: it rejects only on an explicit host mismatch and
 * allows a request that carries neither header. A browser mounting a cross-site attack
 * always sends `Origin` on a mutating request, so a mismatch catches the attack; a caller
 * with no `Origin`/`Referer` (the `Authorization: Bearer` cron endpoints, other non-browser
 * clients) carries no ambient cookies and so isn't a CSRF vector. This keeps cron POSTs
 * working without a path allowlist.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase())
}

/**
 * The host the browser addressed, as seen through a reverse proxy. Trusts `X-Forwarded-Host`
 * (first value of the chain) the same way {@link isSecureRequest} trusts `X-Forwarded-Proto`,
 * then falls back to the `Host` header. Behind a TLS-terminating proxy the internal `Host` is
 * an internal name, so the forwarded host is what an `Origin`/`Referer` will actually match.
 */
export function getExpectedHost(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-host')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('host')
}

/** The host component of an `Origin`/`Referer` header value, or `null` if absent/unparseable. */
export function hostOf(headerValue: string | null): string | null {
  if (!headerValue) return null
  try {
    return new URL(headerValue).host
  } catch {
    return null
  }
}

/**
 * Whether a request is allowed by the Origin/Referer check. Prefers `Origin`, falls back to
 * `Referer`, and allows the request outright when neither header is present. Returns `false`
 * only on a concrete host mismatch.
 */
export function isAllowedOrigin(request: Request): boolean {
  const expected = getExpectedHost(request)?.toLowerCase()
  if (expected == null) return true

  // `hostOf` yields an already-lowercased host (via `URL`); hosts are case-insensitive.
  const originHost = hostOf(request.headers.get('origin'))
  if (originHost != null) return originHost === expected

  const refererHost = hostOf(request.headers.get('referer'))
  if (refererHost != null) return refererHost === expected

  return true
}

interface MiddlewareArgs {
  request: Request
  context: {
    set<C extends RouterContext>(context: C, value: C extends RouterContext<infer T> ? T : never): void
  }
}

/**
 * Root-route middleware that runs the Origin/Referer check on every mutating request before
 * it reaches a loader/action. Apply on the root route so it cascades to the whole app,
 * including the public auth and cron routes that live outside the authenticated layout.
 */
export function originCheck() {
  return async ({ request }: MiddlewareArgs, next: () => Promise<Response>) => {
    if (isMutatingMethod(request.method) && !isAllowedOrigin(request)) {
      logger.warn('Blocked cross-origin mutation', {
        method: request.method,
        origin: request.headers.get('origin') ?? request.headers.get('referer') ?? '(none)',
        expectedHost: getExpectedHost(request) ?? '(none)',
      })
      return new Response('Forbidden', { status: 403 })
    }

    return await next()
  }
}
