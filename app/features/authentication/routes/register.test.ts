import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory congregation "database": registration adds to it, so tests assert on whether a
// congregation was created rather than on spy call counts.
const { congregations } = vi.hoisted(() => ({ congregations: [] as { name: string }[] }))

vi.mock('~/features/authentication/server/register-congregation.server', () => ({
  registerCongregation: vi.fn(async (name: string) => {
    congregations.push({ name })
    return { userId: congregations.length }
  }),
}))

vi.mock('~/features/authentication/server/password-policy.server', () => ({
  checkNewPasswordPolicy: vi.fn(async () => null),
}))

vi.mock('~/features/authentication/server/session.server', () => ({
  getSession: vi.fn(async () => ({ get: vi.fn(), flash: vi.fn() })),
  commitSession: vi.fn(async () => '__session=committed'),
  establishAuthenticatedSession: vi.fn(async () => undefined),
}))

const { action } = await import('./register')

const PASSWORD = 'Str0ng-Register-Passphrase-42'

function registerRequest() {
  const body = new URLSearchParams({
    'congregation-name': 'Intruder Congregation',
    locale: 'fr',
    email: 'intruder@example.com',
    password: PASSWORD,
    'repeat-password': PASSWORD,
  })
  return new Request('https://unitae.example.test/register', { method: 'POST', body })
}

async function respond(request: Request): Promise<Response> {
  try {
    const result = await action({ request, params: {}, context: {} } as Parameters<typeof action>[0])
    if (result instanceof Response) return result
    throw new Error(`expected a redirect Response, got ${JSON.stringify(result)}`)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
}

beforeEach(() => {
  congregations.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('register action', () => {
  it('registers a congregation in multi-tenant mode', async () => {
    vi.stubEnv('UNITAE_MULTI_TENANT', 'true')

    const response = await respond(registerRequest())

    expect(response.headers.get('Location')).toBe('/')
    expect(congregations).toEqual([{ name: 'Intruder Congregation' }])
  })

  // The action repeats the loader's multi-tenant check: React Router does not run the loader before
  // an action.
  it('refuses on a single-tenant instance, without creating a congregation', async () => {
    vi.stubEnv('UNITAE_MULTI_TENANT', '')

    const response = await respond(registerRequest())

    expect(response.headers.get('Location')).toBe('/login')
    expect(congregations).toEqual([])
  })
})
