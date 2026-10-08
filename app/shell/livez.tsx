// Liveness: answers as long as the server process can serve a request, and checks nothing else.
// /health also needs PostgreSQL and Redis; as a liveness probe it would restart every pod at once
// when either one blips, which brings neither back. Use /health for readiness, this for liveness
// and startup.
export function loader() {
  return new Response('ok', {
    status: 200,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  })
}
