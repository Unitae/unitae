import { isRouteErrorResponse } from 'react-router'

// Route parameters that carry a secret in the URL path: the calendar feed token, the email
// verification token. Their value is replaced before the path is logged.
const SECRET_PARAM = /token|secret|code/i

interface RequestErrorLog {
  message: string
  meta: { error: unknown; method: string; host: string; path: string }
}

/**
 * What entry.server's `handleError` logs for an error React Router caught in a loader, an action
 * or a render, or `null` when there is nothing to report: an abandoned request, or a 4xx React
 * Router answered itself (no route, no action). The default handler printed a bare stack with no
 * route, host or method, so a failure could not be tied to a tenant or a page.
 */
export function describeRequestError(
  error: unknown,
  request: Request,
  params: Record<string, string | undefined> = {},
): RequestErrorLog | null {
  if (request.signal.aborted) return null
  if (isRouteErrorResponse(error) && error.status < 500) return null

  const { host } = new URL(request.url)
  const pathname = redactSecretParams(new URL(request.url).pathname, params)
  // A 5xx route error response carries the error that caused it.
  const cause = isRouteErrorResponse(error) && 'error' in error && error.error ? error.error : error

  return {
    message: `Request failed: ${request.method} ${pathname}`,
    meta: { error: cause, method: request.method, host, path: pathname },
  }
}

function redactSecretParams(pathname: string, params: Record<string, string | undefined>): string {
  return Object.entries(params).reduce((path, [name, value]) => {
    if (!value || !SECRET_PARAM.test(name)) return path
    return path
      .split('/')
      .map(segment => (decodeURIComponent(segment) === value ? '[redacted]' : segment))
      .join('/')
  }, pathname)
}
