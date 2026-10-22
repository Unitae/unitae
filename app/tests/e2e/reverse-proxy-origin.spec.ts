import { expect, test } from '@playwright/test'

// Deployments end TLS at a reverse proxy that forwards plain HTTP with `X-Forwarded-Proto: https`.
// React Router (since 8.3.1) refuses an action whose `Origin` does not match the request URL,
// scheme included, before any route middleware runs, so the `originCheck` unit tests cannot see
// it. `server.js` enables Express `trust proxy` so the URL is rebuilt as https://. This replays the
// proxy's headers against the production server.
//
// Probe: `/livez` has no action. A request that clears the origin check gets 405; one React Router
// refuses gets 400. Not `/login.data`: its action answers 400 to an invalid body either way.
const PUBLIC_HOST = 'unitae.example.test'

function viaTlsProxy(origin: string) {
  return { host: PUBLIC_HOST, 'x-forwarded-host': PUBLIC_HOST, 'x-forwarded-proto': 'https', origin }
}

test.describe('Behind a TLS-terminating reverse proxy', () => {
  // The dev server honours X-Forwarded-Proto on its own: only the production server is meaningful.
  test.skip(!process.env.CI, 'runs against the production server (pnpm start) in CI')

  test('a same-origin form action clears the origin check', async ({ request }) => {
    const response = await request.post('/livez.data', {
      headers: viaTlsProxy(`https://${PUBLIC_HOST}`),
      form: { probe: '1' },
    })
    expect(response.status(), 'server.js must trust X-Forwarded-Proto from the proxy').toBe(405)
  })

  test('a cross-site origin is still refused behind the proxy', async ({ request }) => {
    const response = await request.post('/livez.data', {
      headers: viaTlsProxy('https://evil.example'),
      form: { probe: '1' },
    })
    expect(response.status()).toBe(400)
  })
})
