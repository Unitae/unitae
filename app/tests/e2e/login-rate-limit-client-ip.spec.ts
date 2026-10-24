import { expect, test } from '@playwright/test'

// Behind a reverse proxy that appends to X-Forwarded-For (nginx `$proxy_add_x_forwarded_for`), the
// leftmost entry is whatever the client sent. The per-IP login limit must key on the address the
// proxy appended, resolved by server.js, or a client dodges it by sending a new leftmost value on
// every attempt.
//
// The production server (pnpm start) runs server.js; the dev server does not, so CI only.
const LIMIT = Number(process.env.LOGIN_RATE_LIMIT_IP_MAX) || 10
const RATE_LIMITED = /Trop de tentatives|Too many attempts/

test.describe('Login rate limit behind a reverse proxy', () => {
  test.skip(!process.env.CI, 'runs against the production server (pnpm start) in CI')

  test('a client cannot dodge the per-IP limit by varying X-Forwarded-For', async ({ request, baseURL }) => {
    // One documentation-range address per run, so reruns and other specs never share its counter.
    const proxiedClient = `198.51.100.${1 + Math.floor(Math.random() * 250)}`
    const asProxied = (spoofed: string) => ({
      origin: baseURL ?? '',
      'x-forwarded-for': `${spoofed}, ${proxiedClient}`,
    })

    for (let attempt = 0; attempt <= LIMIT; attempt++) {
      await request.post('/login', {
        headers: asProxied(`203.0.113.${attempt}`),
        form: { email: 'nobody@example.test', password: 'not-the-password' },
        maxRedirects: 0,
      })
    }

    const page = await request.get('/login', { headers: asProxied('203.0.113.250') })
    expect(await page.text()).toMatch(RATE_LIMITED)
  })

  // server.js owns the header it passes the resolved address in: a value the client sends under the
  // same name is overwritten, not trusted.
  test('a client cannot dodge it by sending its own resolved-address header', async ({ request, baseURL }) => {
    const proxiedClient = `198.51.100.${1 + Math.floor(Math.random() * 250)}`
    const asProxied = (spoofed: string) => ({
      origin: baseURL ?? '',
      'x-forwarded-for': proxiedClient,
      'x-unitae-client-ip': spoofed,
    })

    for (let attempt = 0; attempt <= LIMIT; attempt++) {
      await request.post('/login', {
        headers: asProxied(`203.0.113.${attempt}`),
        form: { email: 'nobody@example.test', password: 'not-the-password' },
        maxRedirects: 0,
      })
    }

    const page = await request.get('/login', { headers: asProxied('203.0.113.250') })
    expect(await page.text()).toMatch(RATE_LIMITED)
  })
})
