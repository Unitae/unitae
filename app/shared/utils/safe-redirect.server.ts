import logger from '~/shared/infra/logger.server'

/**
 * Strips React Router's single-fetch decoration off a path.
 *
 * A client-side navigation does not fetch `/programs`, it fetches `/programs.data`. When the
 * session guard bounces such a request it captures that pathname verbatim, so the login page
 * is handed `?redirectTo=/programs.data` and sends the browser to the loader endpoint after a
 * successful sign-in — the user lands on raw loader output, or a 404, instead of the page they
 * were on.
 *
 * The rules mirror React Router's own `getNormalizedPath` (lib/server-runtime/urls.ts), which
 * is internal and cannot be imported: the root route decorates as `/_.data` rather than
 * `/.data`, and `_routes` is a single-fetch implementation detail that must not survive into a
 * user-visible URL.
 */
const ROOT_DATA_SUFFIX = /_\.data$/
const DATA_SUFFIX = /\.data$/

export function normalizeRedirectPath(url: string): string {
  // Split on the FIRST '?' only. `url.split('?')` discards everything after a second one, and a
  // literal '?' inside a query value is common enough that browsers pass it through unencoded —
  // truncating it would silently lose part of the destination.
  const queryAt = url.indexOf('?')
  const rawPath = queryAt === -1 ? url : url.slice(0, queryAt)
  const rawSearch = queryAt === -1 ? null : url.slice(queryAt + 1)

  // Only a decorated path is rewritten. Touching every path would quietly turn this into a
  // general URL normaliser and start "fixing" trailing slashes that were never the problem.
  let pathname = rawPath
  if (rawPath.endsWith('.data')) {
    pathname = rawPath.endsWith('/_.data') ? rawPath.replace(ROOT_DATA_SUFFIX, '') : rawPath.replace(DATA_SUFFIX, '')
    // `/_.data` strips to `/`, but a nested `/settings/_.data` strips to `/settings/` — trailing
    // slashes are not how routes are addressed here, so drop it unless the path IS the root.
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1)
    if (pathname === '') pathname = '/'
  }

  if (rawSearch == null) return pathname

  // Rebuild the query string only when there is something to remove. Round-tripping through
  // URLSearchParams rewrites `%20` as `+` and turns a bare `?flag` into `?flag=` — gratuitous
  // edits to a URL the user is about to be sent to.
  const params = new URLSearchParams(rawSearch)
  if (!params.has('_routes')) return `${pathname}?${rawSearch}`

  params.delete('_routes')
  const search = params.toString()
  return search ? `${pathname}?${search}` : pathname
}

/**
 * Validates that a redirect URL is a safe relative path.
 * Prevents open redirect attacks via attacker-controlled URLs (e.g., Referer header).
 * Logs a warning when a non-empty url is rejected — useful for spotting phishing probes.
 *
 * Normalisation happens here rather than only at the call site that builds the target: this is
 * the funnel every redirect target passes through, including one supplied by the query string,
 * so a stale bookmark or a hand-edited `?redirectTo=` cannot reintroduce the `.data` landing.
 */
export function safeRedirectUrl(url: string | null, fallback: string): string {
  if (url?.startsWith('/') && !url.startsWith('//')) return normalizeRedirectPath(url)
  if (url != null && url.length > 0) {
    logger.warn(`safeRedirectUrl: rejected potentially unsafe redirect target (${url})`)
  }
  return fallback
}
