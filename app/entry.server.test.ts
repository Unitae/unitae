import { RouterContextProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

// boot.server probes the database when it is evaluated; handleRequest only needs it to have run.
vi.mock('~/shared/infra/boot.server', () => ({}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('~/i18n/paraglide/runtime', () => ({
  baseLocale: 'fr',
  isLocale: (value: unknown) => value === 'fr' || value === 'en',
  overwriteGetLocale: vi.fn(),
}))

vi.mock('~/shared/utils/locale.server', () => ({
  resolveDocumentLocale: vi.fn(),
}))

interface RenderOptions {
  nonce?: string
  onShellReady?: () => void
  onAllReady?: () => void
}

// What handleRequest handed React on its last render: the <ServerRouter> element and the options.
const lastRender: { element?: { props: { nonce?: string } }; options?: RenderOptions } = {}

// Rendering is React's part: report the shell ready at once, so handleRequest answers.
vi.mock('react-dom/server', () => ({
  renderToPipeableStream: (element: { props: { nonce?: string } }, options: RenderOptions) => {
    lastRender.element = element
    lastRender.options = options
    queueMicrotask(() => (options.onShellReady ?? options.onAllReady)?.())
    return { pipe: (body: { end: () => void }) => body.end(), abort: () => {} }
  },
}))

const { default: handleRequest } = await import('./entry.server')
const { resolveDocumentLocale } = await import('~/shared/utils/locale.server')
const { nonceContext } = await import('~/shared/middleware/security-headers.server')

function contextWithNonce(nonce: string) {
  const context = new RouterContextProvider()
  context.set(nonceContext, nonce)
  return context
}

describe('handleRequest', () => {
  // Regression: a subdomain no congregation owns was a 500 on every unknown path, because the
  // redirect was thrown from here. It has to come back from resolveDocumentLocale and be the answer.
  it('answers with the redirect resolveDocumentLocale hands back instead of rendering', async () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/congregation-not-found' } })
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ redirect })
    const responseHeaders = new Headers()

    const response = await handleRequest(
      new Request('https://inconnu.unitae.app/nope'),
      404,
      responseHeaders,
      {} as never,
      {} as never,
    )

    expect(response).toBe(redirect)
    expect(responseHeaders.has('Set-Cookie')).toBe(false)
  })

  it('remembers a resolved locale in the locale cookie', async () => {
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ locale: 'en', persist: true })

    const response = await handleRequest(
      new Request('https://lyon.unitae.app/login'),
      200,
      new Headers(),
      {} as never,
      contextWithNonce('n0nce'),
    )

    expect(response.headers.get('Set-Cookie')).toContain('PARAGLIDE_LOCALE=en;')
  })

  // A failed lookup renders in a fallback locale. Writing that one down replaced the visitor's own.
  it('leaves the locale cookie alone when the locale is a fallback', async () => {
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ locale: 'fr', persist: false })

    const response = await handleRequest(
      new Request('https://lyon.unitae.app/login'),
      200,
      new Headers(),
      {} as never,
      contextWithNonce('n0nce'),
    )

    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  // The nonce is the one securityHeaders() advertises in the CSP. React Router's streaming scripts
  // (the loader data) and React's inline runtime carry it only if both are handed it here; without
  // it an enforced policy blocks them and the page never hydrates.
  it.each([
    ['a browser', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36'],
    ['a bot', 'Googlebot/2.1 (+http://www.google.com/bot.html)'],
  ])('hands the CSP nonce to React Router and to React for %s', async (_label, userAgent) => {
    vi.mocked(resolveDocumentLocale).mockResolvedValue({ locale: 'fr', persist: false })

    await handleRequest(
      new Request('https://lyon.unitae.app/login', { headers: { 'user-agent': userAgent } }),
      200,
      new Headers(),
      {} as never,
      contextWithNonce('n0nce'),
    )

    expect(lastRender.element?.props.nonce).toBe('n0nce')
    expect(lastRender.options?.nonce).toBe('n0nce')
  })
})
