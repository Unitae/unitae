// Set by server.js from Express' `trust proxy` resolution, after removing any value the client
// sent under the same name.
const RESOLVED_CLIENT_IP_HEADER = 'x-unitae-client-ip'

/**
 * Best-effort client IP extraction from a proxied request.
 *
 * The production server (server.js) resolves the client address with Express `trust proxy`:
 * X-Forwarded-For walked from the right, past proxies on loopback or private networks. It passes
 * that address on in `x-unitae-client-ip`. The leftmost X-Forwarded-For entry is not usable on its
 * own: behind a proxy that appends to the header, it is whatever the client sent.
 *
 * Without server.js (the dev server), fall back to the raw headers.
 */
export function getClientIp(request: Request): string | undefined {
  const resolved = request.headers.get(RESOLVED_CLIENT_IP_HEADER)?.trim()
  if (resolved) return resolved

  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const firstHop = forwardedFor.split(',')[0]?.trim()
    if (firstHop) return firstHop
  }

  const realIp = request.headers.get('x-real-ip')?.trim()
  return realIp || undefined
}
