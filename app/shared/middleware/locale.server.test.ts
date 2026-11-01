import { describe, expect, it, vi } from 'vitest'

// The generated runtime keeps the getLocale override in module state; this stand-in does the same,
// so the tests can read the locale the middleware put in place the way any m.*() call would.
const runtime = vi.hoisted(() => ({ getLocale: (): string => 'fr' }))

vi.mock('~/i18n/paraglide/runtime', () => ({
  baseLocale: 'fr',
  isLocale: (value: unknown) => value === 'fr' || value === 'en',
  overwriteGetLocale: (fn: () => string) => {
    runtime.getLocale = fn
  },
}))

vi.mock('~/shared/utils/locale.server', () => ({
  resolveDocumentLocale: vi.fn(),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { documentLocaleContext, requestLocale } = await import('./locale.server')
const { resolveDocumentLocale } = await import('~/shared/utils/locale.server')

function fakeContext() {
  const store = new Map<unknown, unknown>()
  return {
    set: (key: unknown, value: unknown) => store.set(key, value),
    get: (key: unknown) => store.get(key),
  }
}

function makeRequest(headers: Record<string, string> = {}) {
  return new Request('https://lyon.unitae.app/board', { headers })
}

// What a loader or an action downstream of the middleware would translate into.
function localeSeenDownstream() {
  return Promise.resolve(new Response(runtime.getLocale()))
}

describe('requestLocale', () => {
  // Regression: the locale used to be applied by entry.server, which React Router calls after the
  // loaders and actions have run. Every message they produced came out in the base locale.
  it('runs the loaders and actions in the locale resolved for the request', async () => {
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ locale: 'en', persist: true })

    const response = await requestLocale()({ request: makeRequest(), context: fakeContext() }, localeSeenDownstream)

    await expect(response.text()).resolves.toBe('en')
  })

  it('applies the locale for this request only', async () => {
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ locale: 'en', persist: true })

    await requestLocale()({ request: makeRequest(), context: fakeContext() }, localeSeenDownstream)

    expect(runtime.getLocale()).toBe('fr')
  })

  it('hands what it resolved to entry.server, so the document is not resolved twice', async () => {
    const resolved = { locale: 'en', persist: true } as const
    vi.mocked(resolveDocumentLocale).mockResolvedValue(resolved)
    const context = fakeContext()

    await requestLocale()({ request: makeRequest(), context }, localeSeenDownstream)

    expect(context.get(documentLocaleContext)).toEqual(resolved)
  })

  // Data requests never reach entry.server: without this, a member kept the language of their last
  // full page load after an admin changed the congregation's.
  it('remembers the locale in the cookie the client translates with', async () => {
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ locale: 'en', persist: true })

    const response = await requestLocale()(
      { request: makeRequest({ Cookie: 'PARAGLIDE_LOCALE=fr' }), context: fakeContext() },
      localeSeenDownstream,
    )

    expect(response.headers.get('Set-Cookie')).toContain('PARAGLIDE_LOCALE=en;')
  })

  it('leaves the cookie alone when it already holds the locale', async () => {
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ locale: 'en', persist: true })

    const response = await requestLocale()(
      { request: makeRequest({ Cookie: 'theme=dark; PARAGLIDE_LOCALE=en' }), context: fakeContext() },
      localeSeenDownstream,
    )

    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('leaves the cookie alone when the locale is a fallback', async () => {
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ locale: 'fr', persist: false })

    const response = await requestLocale()(
      { request: makeRequest({ Cookie: 'PARAGLIDE_LOCALE=en' }), context: fakeContext() },
      localeSeenDownstream,
    )

    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  // The middleware also runs for resource routes (health, cron, feeds), which an unknown subdomain
  // must not turn into redirects. Answering a document with it stays entry.server's job.
  it('carries on in the visitor’s locale for a subdomain no congregation owns', async () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/congregation-not-found' } })
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ redirect })

    const response = await requestLocale()(
      { request: makeRequest({ Cookie: 'PARAGLIDE_LOCALE=en' }), context: fakeContext() },
      localeSeenDownstream,
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('en')
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('carries on in the base locale for a subdomain no congregation owns and no cookie', async () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/congregation-not-found' } })
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ redirect })

    const response = await requestLocale()({ request: makeRequest(), context: fakeContext() }, localeSeenDownstream)

    await expect(response.text()).resolves.toBe('fr')
  })

  // Response.redirect() and fetched responses have immutable headers. The locale cookie is a
  // convenience: failing to write it must not fail the request.
  it('returns a response whose headers cannot be changed as it is', async () => {
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ locale: 'en', persist: true })
    const immutable = Response.redirect('https://lyon.unitae.app/', 302)

    const response = await requestLocale()({ request: makeRequest(), context: fakeContext() }, async () => immutable)

    expect(response).toBe(immutable)
  })
})
