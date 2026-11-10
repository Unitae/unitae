import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory account "database": the setup service adds to it, needSetupProcess reads it, so tests
// assert on observable state (was an account created?) rather than on spy call counts.
const { accounts, signedIn } = vi.hoisted(() => ({ accounts: [] as { email: string }[], signedIn: [] as number[] }))

vi.mock('~/features/authentication/server/need-setup-process.server', () => ({
  needSetupProcess: vi.fn(async () => accounts.length === 0),
}))

vi.mock('~/features/authentication/server/setup-first-account.server', () => ({
  setupFirstAccount: vi.fn(async (email: string, _password: string, congregationName: string) => {
    accounts.push({ email, congregationName } as { email: string })
    return accounts.length
  }),
}))

vi.mock('~/features/authentication/server/password-policy.server', () => ({
  checkNewPasswordPolicy: vi.fn(async () => null),
}))

vi.mock('~/features/authentication/server/session.server', () => ({
  getSession: vi.fn(async () => ({ get: vi.fn(), flash: vi.fn() })),
  commitSession: vi.fn(async () => '__session=committed'),
  establishAuthenticatedSession: vi.fn(async (_session: unknown, userId: number) => {
    signedIn.push(userId)
  }),
}))

const { action } = await import('./setup')

const PASSWORD = 'Str0ng-Setup-Passphrase-42'

function setupRequest(email = 'intruder@example.com') {
  const body = new URLSearchParams({
    'congregation-name': 'Assemblée des Lilas',
    email,
    locale: 'fr',
    password: PASSWORD,
  })
  return new Request('https://unitae.example.test/setup', { method: 'POST', body })
}

// Redirects are thrown or returned Responses in react-router; normalise both to the Response.
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
  accounts.length = 0
  signedIn.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('setup action', () => {
  it('creates the first admin account, under the congregation name typed, and signs the admin in', async () => {
    const response = await respond(setupRequest('admin@example.com'))

    expect(response.headers.get('Location')).toBe('/')
    expect(accounts).toEqual([{ email: 'admin@example.com', congregationName: 'Assemblée des Lilas' }])
    expect(signedIn).toEqual([1])
  })

  // The action repeats the loader's "setup still needed" check: React Router does not run the loader
  // before an action.
  it('refuses once an account exists, without creating another', async () => {
    accounts.push({ email: 'admin@example.com' })

    const response = await respond(setupRequest())

    expect(response.headers.get('Location')).toBe('/login')
    expect(accounts).toEqual([{ email: 'admin@example.com' }])
    expect(signedIn).toEqual([])
  })

  it('refuses in multi-tenant mode, where congregations are created by registration', async () => {
    vi.stubEnv('UNITAE_MULTI_TENANT', 'true')

    const response = await respond(setupRequest())

    expect(response.headers.get('Location')).toBe('/register')
    expect(accounts).toEqual([])
  })
})
