import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory congregation "database": registration adds to it, so tests assert on whether a
// congregation was created rather than on spy call counts.
const { congregations, takenEmails, provisioning } = vi.hoisted(() => ({
  congregations: [] as { name: string }[],
  takenEmails: new Set<string>(),
  provisioning: { fails: false },
}))

vi.mock('~/features/authentication/server/register-congregation.server', () => ({
  registerCongregation: vi.fn((name: string, _slug: string, email: string) => {
    if (takenEmails.has(email)) return Promise.resolve({ error: 'email_taken' })
    if (provisioning.fails) return Promise.resolve({ error: 'provision_failed' })
    congregations.push({ name })
    return Promise.resolve({ userId: congregations.length })
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
const m = await import('~/i18n/paraglide/messages')

const PASSWORD = 'Str0ng-Register-Passphrase-42'

function registerRequest() {
  const body = new URLSearchParams({
    'congregation-name': 'Intruder Congregation',
    locale: 'fr',
    email: 'intruder@example.com',
    password: PASSWORD,
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
  takenEmails.clear()
  provisioning.fails = false
})

type Refusal = {
  init: { status: number }
  data: { error: Record<string, string[]>; initialValue: Record<string, string> }
}

async function refusal(): Promise<Refusal> {
  return (await action({ request: registerRequest(), params: {}, context: {} } as Parameters<
    typeof action
  >[0])) as unknown as Refusal
}

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

  it('keeps what was typed and says under the email field that it is taken, creating nothing', async () => {
    vi.stubEnv('UNITAE_MULTI_TENANT', 'true')
    takenEmails.add('intruder@example.com')

    const result = await refusal()

    expect(result.init.status).toBe(409)
    expect(result.data.error.email).toEqual([m.auth_register_email_taken_error()])
    expect(result.data.initialValue['congregation-name']).toBe('Intruder Congregation')
    expect(congregations).toEqual([])
  })

  it('says the creation failed above the form, keeping what was typed', async () => {
    vi.stubEnv('UNITAE_MULTI_TENANT', 'true')
    provisioning.fails = true

    const result = await refusal()

    expect(result.init.status).toBe(400)
    expect(result.data.error['']).toEqual([m.auth_register_generic_error()])
    expect(result.data.initialValue.email).toBe('intruder@example.com')
    expect(congregations).toEqual([])
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
