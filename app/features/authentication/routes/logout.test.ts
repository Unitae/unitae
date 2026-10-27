import { beforeEach, describe, expect, it, vi } from 'vitest'

// Real cookie sessions (signed with a test secret) over an in-memory account, so the test checks
// what matters: whether a cookie copied before logout still opens a session afterwards.
const { account } = vi.hoisted(() => {
  process.env.UNITAE_SESSION_SECRET = 'logout-test-secret-at-least-thirty-two-characters'
  return { account: { id: 42, congregationId: 1, active: true, emailVerifiedAt: new Date(0), sessionEpoch: 0 } }
})

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: {
      findUnique: vi.fn(({ where }: { where: { id: number } }) =>
        Promise.resolve(where.id === account.id ? { ...account, member: null } : null),
      ),
      update: vi.fn(({ data }: { data: { sessionEpoch?: { increment: number } } }) => {
        account.sessionEpoch += data.sessionEpoch?.increment ?? 0
        return Promise.resolve({ ...account })
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
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { action } = await import('./logout')
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
})

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
