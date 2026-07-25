import { describe, expect, it } from 'vitest'

import {
  getExpectedHost,
  hostOf,
  isAllowedOrigin,
  isMutatingMethod,
  originCheck,
} from '~/shared/middleware/origin-check.server'

describe('isMutatingMethod', () => {
  it('flags the state-changing methods', () => {
    expect(isMutatingMethod('POST')).toBe(true)
    expect(isMutatingMethod('PUT')).toBe(true)
    expect(isMutatingMethod('PATCH')).toBe(true)
    expect(isMutatingMethod('DELETE')).toBe(true)
  })

  it('ignores safe methods regardless of case', () => {
    expect(isMutatingMethod('GET')).toBe(false)
    expect(isMutatingMethod('HEAD')).toBe(false)
    expect(isMutatingMethod('OPTIONS')).toBe(false)
    expect(isMutatingMethod('get')).toBe(false)
    expect(isMutatingMethod('post')).toBe(true)
  })
})

describe('getExpectedHost', () => {
  it('trusts the X-Forwarded-Host set by a reverse proxy over the internal Host', () => {
    const request = new Request('http://internal:8080/dashboard', {
      headers: { host: 'internal:8080', 'x-forwarded-host': 'congA.unitae.app' },
    })

    expect(getExpectedHost(request)).toBe('congA.unitae.app')
  })

  it('takes the first value of a comma-separated X-Forwarded-Host chain', () => {
    const request = new Request('http://internal:8080/', {
      headers: { 'x-forwarded-host': 'congA.unitae.app, proxy.internal' },
    })

    expect(getExpectedHost(request)).toBe('congA.unitae.app')
  })

  it('falls back to the Host header when there is no forwarded host', () => {
    const request = new Request('http://localhost:5173/', { headers: { host: 'localhost:5173' } })

    expect(getExpectedHost(request)).toBe('localhost:5173')
  })
})

describe('hostOf', () => {
  it('extracts the host from an Origin value', () => {
    expect(hostOf('https://unitae.app')).toBe('unitae.app')
    expect(hostOf('http://localhost:5173')).toBe('localhost:5173')
  })

  it('extracts the host from a Referer value with a path', () => {
    expect(hostOf('https://unitae.app/verify-email/abc?x=1')).toBe('unitae.app')
  })

  it('returns null for a missing or unparseable value', () => {
    expect(hostOf(null)).toBeNull()
    expect(hostOf('')).toBeNull()
    expect(hostOf('not a url')).toBeNull()
  })
})

describe('isAllowedOrigin', () => {
  function post(headers: Record<string, string>) {
    return new Request('https://unitae.app/login', { method: 'POST', headers })
  }

  it('allows a matching Origin', () => {
    expect(isAllowedOrigin(post({ host: 'unitae.app', origin: 'https://unitae.app' }))).toBe(true)
  })

  it('rejects a cross-origin Origin', () => {
    expect(isAllowedOrigin(post({ host: 'unitae.app', origin: 'https://evil.test' }))).toBe(false)
  })

  it('falls back to Referer when Origin is absent', () => {
    expect(isAllowedOrigin(post({ host: 'unitae.app', referer: 'https://unitae.app/login' }))).toBe(true)
    expect(isAllowedOrigin(post({ host: 'unitae.app', referer: 'https://evil.test/login' }))).toBe(false)
  })

  it('prefers Origin over Referer when both are present', () => {
    // A matching Origin wins even if the Referer host somehow differs.
    expect(
      isAllowedOrigin(post({ host: 'unitae.app', origin: 'https://unitae.app', referer: 'https://evil.test/x' })),
    ).toBe(true)
    // A mismatching Origin is rejected even if a Referer would have matched.
    expect(
      isAllowedOrigin(post({ host: 'unitae.app', origin: 'https://evil.test', referer: 'https://unitae.app/x' })),
    ).toBe(false)
  })

  it('allows a request that carries neither header (non-browser / cron)', () => {
    expect(isAllowedOrigin(post({ host: 'unitae.app' }))).toBe(true)
  })

  it('compares against the forwarded host behind a proxy', () => {
    const request = new Request('http://internal:8080/login', {
      method: 'POST',
      headers: { host: 'internal:8080', 'x-forwarded-host': 'congA.unitae.app', origin: 'https://congA.unitae.app' },
    })

    expect(isAllowedOrigin(request)).toBe(true)
  })
})

describe('originCheck middleware', () => {
  function fakeContext() {
    const store = new Map<unknown, unknown>()
    return {
      set: (key: unknown, value: unknown) => store.set(key, value),
      get: (key: unknown) => store.get(key),
    }
  }

  async function run(request: Request) {
    const middleware = originCheck()
    let reached = false
    const response = await middleware({ request, context: fakeContext() }, async () => {
      reached = true
      return new Response('ok')
    })
    return { response, reached }
  }

  it('lets a safe method through even with a foreign Origin', async () => {
    const request = new Request('https://unitae.app/dashboard', {
      headers: { host: 'unitae.app', origin: 'https://evil.test' },
    })

    const { response, reached } = await run(request)

    expect(reached).toBe(true)
    expect(response.status).toBe(200)
  })

  it('lets a same-origin mutation through', async () => {
    const request = new Request('https://unitae.app/login', {
      method: 'POST',
      headers: { host: 'unitae.app', origin: 'https://unitae.app' },
    })

    const { response, reached } = await run(request)

    expect(reached).toBe(true)
    expect(response.status).toBe(200)
  })

  it('blocks a cross-origin mutation with a 403 and never reaches the handler', async () => {
    const request = new Request('https://unitae.app/login', {
      method: 'POST',
      headers: { host: 'unitae.app', origin: 'https://evil.test' },
    })

    const { response, reached } = await run(request)

    expect(reached).toBe(false)
    expect(response.status).toBe(403)
  })

  it('blocks a cross-origin mutation identified only by Referer', async () => {
    const request = new Request('https://unitae.app/login', {
      method: 'POST',
      headers: { host: 'unitae.app', referer: 'https://evil.test/login' },
    })

    const { response, reached } = await run(request)

    expect(reached).toBe(false)
    expect(response.status).toBe(403)
  })

  it('allows a mutation with neither Origin nor Referer (cron / non-browser)', async () => {
    const request = new Request('https://unitae.app/cron/retention', {
      method: 'POST',
      headers: { host: 'unitae.app', authorization: 'Bearer secret' },
    })

    const { response, reached } = await run(request)

    expect(reached).toBe(true)
    expect(response.status).toBe(200)
  })
})
