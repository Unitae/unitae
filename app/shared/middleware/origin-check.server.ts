import type { RouterContext } from 'react-router'

import logger from '~/shared/infra/logger.server'
import { isSecureRequest } from '~/shared/middleware/security-headers.server'

/**
 * Defence-in-depth CSRF guard: rejects a state-changing request whose `Origin`
 * (or `Referer` fallback) host does not match the site's own host. This sits alongside
 * the primary `SameSite=Lax` cookie protection (see issue #294).
 *
 * The check is deliberately *lenient*: it rejects on a present-but-mismatching `Origin`/
 * `Referer` and allows a request that carries neither header. A browser mounting a cross-site
 * attack always sends `Origin` on a mutating request, so a mismatch catches the attack; a
 * caller with no `Origin`/`Referer` (non-browser callers such as the `Authorization: Bearer`
 * cron endpoints) carries no ambient cookies and so isn't a CSRF vector. Allowing the
 * header-less case keeps those callers working without a path allowlist.
 *
 * A *present* `Origin` is authoritative — a `null`/unparseable value (sandboxed iframes,
 * `data:`/`file:` initiators) is a denial, not a fall-through to `Referer`.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase())
}

/**
 * The host the browser addressed, as seen through a reverse proxy. Trusts `X-Forwarded-Host`
 * (first value of the chain) the same way `isSecureRequest` trusts `X-Forwarded-Proto`, then
 * falls back to the `Host` header. Behind a TLS-terminating proxy the internal `Host` is an
 * internal name, so the forwarded host is what an `Origin`/`Referer` will actually match.
 *
 * Returns the raw header value (case/port preserved); {@link isAllowedOrigin} normalises it
 * before comparison.
 */
export function getExpectedHost(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-host')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('host')
}

/**
 * The host component of an `Origin`/`Referer` header value (lowercased, default port stripped
 * by `URL`), or `null` when the value is absent OR present-but-unparseable. Callers that must
 * distinguish those two cases check header presence themselves before calling this.
 */
export function hostOf(headerValue: string | null): string | null {
  if (!headerValue) return null
  try {
    return new URL(headerValue).host
  } catch {
    return null
  }
}

/**
 * Whether a request passes the Origin/Referer check. A present `Origin` is authoritative (must
 * match, else reject); absent `Origin` falls back to `Referer`; a request carrying neither is
 * allowed (non-browser caller). Returns `true` when the expected host can't be determined —
 * {@link originCheck} logs that separately so the disabled control is observable.
 */
export function isAllowedOrigin(request: Request): boolean {
  const rawExpected = getExpectedHost(request)
  if (rawExpected == null) return true

  // Normalise the expected host the same way `hostOf` normalises Origin/Referer (lowercase,
  // strip the default port for the request's scheme) so `x-forwarded-host: unitae.app:443`
  // still matches a browser's `Origin: https://unitae.app`.
  const scheme = isSecureRequest(request) ? 'https' : 'http'
  const expected = hostOf(`${scheme}://${rawExpected}`) ?? rawExpected.toLowerCase()

  const originHeader = request.headers.get('origin')
  if (originHeader !== null) return hostOf(originHeader) === expected

  const refererHeader = request.headers.get('referer')
  if (refererHeader !== null) return hostOf(refererHeader) === expected

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
    if (isMutatingMethod(request.method)) {
      if (getExpectedHost(request) == null) {
        // No Host/X-Forwarded-Host on a mutating request means the origin check can't run —
        // a proxy misconfiguration that silently disables this control. Surface it.
        logger.warn('Origin check skipped: no Host/X-Forwarded-Host on a mutating request', {
          method: request.method,
          path: new URL(request.url).pathname,
        })
      } else if (!isAllowedOrigin(request)) {
        logger.warn('Blocked cross-origin mutation', {
          method: request.method,
          path: new URL(request.url).pathname,
          origin: request.headers.get('origin') ?? request.headers.get('referer') ?? '(none)',
          expectedHost: getExpectedHost(request) ?? '(none)',
        })
        return new Response('Forbidden', { status: 403 })
      }
    }

    return await next()
  }
}
