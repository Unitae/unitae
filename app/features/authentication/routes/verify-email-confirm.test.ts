import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory token "database": verify reads it, consume removes the row — so tests assert on
// observable token state (still valid vs. burnt) rather than on spy call counts.
const { tokenStore, sessionState } = vi.hoisted(() => ({
  tokenStore: new Map<string, { id: number; email: string }>(),
  sessionState: { userId: undefined as string | undefined },
}))

vi.mock('~/features/authentication/server/email-verification.server', () => ({
  verifyEmailVerificationToken: vi.fn(async (token: string) => tokenStore.get(token) ?? null),
  consumeEmailVerificationToken: vi.fn(async (token: string) => {
    tokenStore.delete(token)
  }),
}))

vi.mock('~/features/authentication/server/session.server', () => ({
  getSession: vi.fn(async () => ({
    get: (key: string) => (key === 'userId' ? sessionState.userId : undefined),
    flash: vi.fn(),
  })),
  commitSession: vi.fn(async () => '__session=committed'),
}))

const { action, isConfirmable, loader } = await import('./verify-email-confirm')
const { verifyEmailVerificationToken } = await import('~/features/authentication/server/email-verification.server')

const request = new Request('https://unitae.app/verify-email/abc')

beforeEach(() => {
  tokenStore.clear()
  sessionState.userId = undefined
  vi.clearAllMocks()
})

// Redirects are thrown Responses in react-router; capture the Response so tests can inspect it.
async function captureRedirect(run: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await run()
    throw new Error(`expected a redirect Response, got a normal return: ${JSON.stringify(result)}`)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
}

describe('verify-email-confirm loader', () => {
  it('reports a valid token WITHOUT consuming it (prefetch-safe)', async () => {
    tokenStore.set('good', { id: 7, email: 'user@example.com' })

    const result = await loader({ request, params: { token: 'good' } } as Parameters<typeof loader>[0])

    expect(result).toEqual({ valid: true })
    // The token survives the GET — a subsequent verification still resolves the user.
    expect(await verifyEmailVerificationToken('good')).not.toBeNull()
  })

  it('reports an invalid token', async () => {
    const result = await loader({ request, params: { token: 'missing' } } as Parameters<typeof loader>[0])

    expect(result).toEqual({ valid: false })
  })
})

describe('isConfirmable', () => {
  it('shows the confirm form when the GET validated the token and there is no action yet', () => {
    expect(isConfirmable({ valid: true }, undefined)).toBe(true)
  })

  it('hides the form when the token became invalid between the GET and the POST', () => {
    // e.g. the token expired or was consumed after the page loaded.
    expect(isConfirmable({ valid: true }, { valid: false })).toBe(false)
  })

  it('hides the form when the GET already found the token invalid', () => {
    expect(isConfirmable({ valid: false }, undefined)).toBe(false)
  })
})

describe('verify-email-confirm action', () => {
  it('consumes the token and redirects home when the session owner confirms', async () => {
    tokenStore.set('good', { id: 7, email: 'user@example.com' })
    sessionState.userId = '7'

    const response = await captureRedirect(() =>
      action({ request, params: { token: 'good' } } as Parameters<typeof action>[0]),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/')
    // The token is now burnt.
    expect(await verifyEmailVerificationToken('good')).toBeNull()
  })

  it('consumes the token and redirects to login when no matching session', async () => {
    tokenStore.set('good', { id: 7, email: 'user@example.com' })
    sessionState.userId = undefined

    const response = await captureRedirect(() =>
      action({ request, params: { token: 'good' } } as Parameters<typeof action>[0]),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/login')
    expect(response.headers.get('Set-Cookie')).toContain('__session=')
    expect(await verifyEmailVerificationToken('good')).toBeNull()
  })

  it('does not consume an invalid token', async () => {
    tokenStore.set('good', { id: 7, email: 'user@example.com' })

    const result = await action({ request, params: { token: 'missing' } } as Parameters<typeof action>[0])

    expect(result).toEqual({ valid: false })
    // The unrelated valid token is untouched.
    expect(await verifyEmailVerificationToken('good')).not.toBeNull()
  })
})
