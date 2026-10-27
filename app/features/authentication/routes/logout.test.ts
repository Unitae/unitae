import { beforeEach, describe, expect, it, vi } from 'vitest'

// Real cookie sessions (signed with a test secret) over an in-memory account, so the test checks
// what matters: whether a cookie copied before logout still opens a session afterwards.
const { account, db, errors } = vi.hoisted(() => {
  process.env.UNITAE_SESSION_SECRET = 'logout-test-secret-at-least-thirty-two-characters'
  return {
    account: {
      id: 42,
      congregationId: 1,
      active: true,
      anonymizedAt: null as Date | null,
      emailVerifiedAt: new Date(0),
      sessionEpoch: 0,
    },
    db: { failing: false },
    errors: [] as string[],
  }
})

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: {
      findUnique: vi.fn(({ where }: { where: { id: number } }) =>
        Promise.resolve(where.id === account.id ? { ...account, member: null } : null),
      ),
      updateMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        if (db.failing) return Promise.reject(new Error('database unavailable'))
        const matches = Object.entries(where).every(([key, value]) => account[key as keyof typeof account] === value)
        if (matches) account.sessionEpoch++
        return Promise.resolve({ count: matches ? 1 : 0 })
      }),
    },
  },
}))

vi.mock('~/shared/domain/congregation.server', () => ({
  findCongregation: vi.fn(() => Promise.resolve({ id: 1 })),
  resolveCongregationFromRequest: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  AuditAction: { UserLogout: 'user.logout' },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn((message: string) => {
      errors.push(message)
    }),
  },
}))

const { action, loader } = await import('./logout')

const CLEARED_COOKIE = /Max-Age=0|Expires=Thu, 01 Jan 1970/i
const { commitSession, establishAuthenticatedSession, getSession, verifySession } = await import(
  '~/features/authentication/server/session.server'
)

async function signedInCookie(): Promise<string> {
  const session = await getSession(null)
  await establishAuthenticatedSession(session, account.id)
  return (await commitSession(session)).split(';')[0]
}

async function opensASession(cookie: string): Promise<boolean> {
  try {
    await verifySession(new Request('https://unitae.example.test/', { headers: { Cookie: cookie } }))
    return true
  } catch (thrown) {
    if (thrown instanceof Response) return false
    throw thrown
  }
}

beforeEach(() => {
  account.sessionEpoch = 0
  account.active = true
  account.anonymizedAt = null
  db.failing = false
  errors.length = 0
})

function logout(cookie?: string) {
  return action({
    request: new Request('https://unitae.example.test/logout', {
      method: 'POST',
      headers: cookie ? { Cookie: cookie } : {},
    }),
    params: {},
    context: {},
  } as Parameters<typeof action>[0])
}

function clearsTheCookie(response: Response) {
  return CLEARED_COOKIE.test(response.headers.get('Set-Cookie') ?? '')
}

describe('logout action', () => {
  it('ends the session server-side, so a copy of the cookie stops working', async () => {
    const cookie = await signedInCookie()
    expect(await opensASession(cookie)).toBe(true)

    await action({
      request: new Request('https://unitae.example.test/logout', { method: 'POST', headers: { Cookie: cookie } }),
      params: {},
      context: {},
    } as Parameters<typeof action>[0])

    expect(await opensASession(cookie)).toBe(false)
  })

  it('still logs out a request that carries no session', async () => {
    const response = await action({
      request: new Request('https://unitae.example.test/logout', { method: 'POST' }),
      params: {},
      context: {},
    } as Parameters<typeof action>[0])

    expect(response.status).toBe(302)
    expect(account.sessionEpoch).toBe(0)
  })
})

describe('logout action, stale or failing sessions', () => {
  // Only a session that would still pass the session check may end the account's sessions:
  // an already-invalidated cookie must not be able to sign the real user out everywhere.
  it('does not end the account sessions from a stale cookie, but still clears it', async () => {
    const staleCookie = await signedInCookie()
    account.sessionEpoch = 1 // revoked since the cookie was issued

    const response = await logout(staleCookie)

    expect(account.sessionEpoch).toBe(1)
    expect(clearsTheCookie(response)).toBe(true)
  })

  it('does not end the sessions of a deactivated account', async () => {
    const cookie = await signedInCookie()
    account.active = false

    await logout(cookie)

    expect(account.sessionEpoch).toBe(0)
  })

  it('clears the cookie and reports the failure when the session cannot be ended', async () => {
    const cookie = await signedInCookie()
    db.failing = true

    const response = await logout(cookie)

    expect(clearsTheCookie(response)).toBe(true)
    expect(errors.some(message => message.includes('logout'))).toBe(true)
  })

  it('never ends sessions on a GET', async () => {
    await signedInCookie()

    expect(() => loader({} as Parameters<typeof loader>[0])).toThrow()
    expect(account.sessionEpoch).toBe(0)
  })
})
