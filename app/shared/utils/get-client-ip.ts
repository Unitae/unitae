/**
 * Best-effort client IP extraction from a proxied request.
 *
 * Behind our Traefik ingress the real client address is carried in
 * `x-forwarded-for` (the first hop is the original client; subsequent hops are
 * proxies), with `x-real-ip` as a fallback. Only trust these headers because the
 * ingress sets them — a direct-to-app request could spoof them, which is why the
 * login limiter also keeps a global counter as a backstop.
 */
export function getClientIp(request: Request): string | undefined {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const firstHop = forwardedFor.split(',')[0]?.trim()
    if (firstHop) return firstHop
  }

  const realIp = request.headers.get('x-real-ip')?.trim()
  return realIp || undefined
}
