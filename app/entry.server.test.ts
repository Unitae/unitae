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

// Rendering is React's part: report the shell ready at once, so handleRequest answers.
vi.mock('react-dom/server', () => ({
  renderToPipeableStream: (_element: unknown, options: { onShellReady?: () => void; onAllReady?: () => void }) => {
    queueMicrotask(() => (options.onShellReady ?? options.onAllReady)?.())
    return { pipe: (body: { end: () => void }) => body.end(), abort: () => {} }
  },
}))

const { default: handleRequest } = await import('./entry.server')
const { resolveDocumentLocale } = await import('~/shared/utils/locale.server')

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
      {} as never,
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
      {} as never,
    )

    expect(response.headers.get('Set-Cookie')).toBeNull()
  })
})
