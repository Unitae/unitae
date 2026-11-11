import { beforeEach, describe, expect, it, vi } from 'vitest'

// Forcing a password reset revokes the target's sessions and emails them. The target must belong to
// the caller's congregation: accounts are looked up within it, never by bare id. Sessions revoked and
// emails sent are recorded in memory, so the tests assert on what happened to each account.

const { revoked, emailed, links, adminIds } = vi.hoisted(() => ({
  adminIds: new Set<number>(),
  revoked: [] as number[],
  emailed: [] as number[],
  // Pending reset links per account, honouring the keepPending option like the real service.
  links: new Map<number, string[]>(),
}))

const ACCOUNTS = [
  { id: 20, congregationId: 1, email: 'same@example.com', member: null },
  { id: 30, congregationId: 2, email: 'other@example.com', member: null },
]

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: {
      findUnique: vi.fn(
        async ({ where }: { where: { id?: number; id_congregationId?: { id: number; congregationId: number } } }) => {
          if (where.id_congregationId) {
            const { id, congregationId } = where.id_congregationId
            return ACCOUNTS.find(a => a.id === id && a.congregationId === congregationId) ?? null
          }
          return ACCOUNTS.find(a => a.id === where.id) ?? null
        },
      ),
    },
  },
}))

vi.mock('~/features/authentication/server/revoke-account-sessions.server', () => ({
  revokeAccountSessions: vi.fn(async (id: number) => {
    revoked.push(id)
  }),
}))
vi.mock('~/features/authentication/server/invalidate-account-password.server', () => ({
  createPasswordResetToken: vi.fn((userId: number, _client?: unknown, options?: { keepPending?: boolean }) => {
    const token = `token-${(links.get(userId)?.length ?? 0) + 1}`
    links.set(userId, [...(options?.keepPending ? (links.get(userId) ?? []) : []), token])
    return Promise.resolve(token)
  }),
}))
vi.mock('~/features/authentication/server/send-reset-account-password-email.server', () => ({
  sendResetAccountPasswordEmail: vi.fn(async (id: number) => {
    emailed.push(id)
    return true
  }),
}))
vi.mock('~/features/authentication/server/session.server', () => ({
  getSession: vi.fn(async () => ({ flash: vi.fn() })),
  commitSession: vi.fn(async () => '__session=committed'),
}))
vi.mock('~/features/authentication/emails/reset-password-required', () => ({ default: () => null }))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: { PasswordResetRequested: 'x' }, audit: vi.fn() }))
vi.mock('~/shared/auth/permissions.server', () => ({
  isAccountAdmin: vi.fn(async (accountId: number) => adminIds.has(accountId)),
}))
vi.mock('~/shared/domain/congregation.server', () => ({
  resolveCongregation: vi.fn(async () => ({ baseUrl: 'https://unitae.example.test', displayName: 'Unitae' })),
}))

const { Permission } = await import('~/shared/types/permission')
const { respond, routeContext } = await import('~/tests/helpers/route-action')
const { action } = await import('./password-invalidation')

function invalidate(userId: number) {
  return respond(() =>
    action({
      request: new Request(`https://unitae.example.test/users/${userId}/password-invalidation`, { method: 'POST' }),
      params: { userId: String(userId) },
      context: routeContext([Permission.CanManageUsers], { congregationId: 1 }),
    } as never),
  )
}

/** What the action answers a fetcher with, a `data()` result rather than a Response. */
function answer(userId: number) {
  return action({
    request: new Request(`https://unitae.example.test/users/${userId}/password-invalidation`, { method: 'POST' }),
    params: { userId: String(userId) },
    context: routeContext([Permission.CanManageUsers], { congregationId: 1 }),
  } as never)
}

beforeEach(() => {
  adminIds.clear()
  revoked.length = 0
  emailed.length = 0
  links.clear()
})

describe('password-invalidation action', () => {
  it("revokes and emails an account of the caller's congregation", async () => {
    await answer(20)
    expect(revoked).toEqual([20])
    expect(emailed).toEqual([20])
  })

  it('leaves an account of another congregation untouched', async () => {
    const response = await invalidate(30)
    expect(response.headers.get('Location')).toBe('/settings/users')
    expect(revoked).toEqual([])
    expect(emailed).toEqual([])
  })

  // A forced reset answers a possibly compromised account: any link sent earlier must stop working.
  it('replaces the reset links sent earlier to the account', async () => {
    links.set(20, ['earlier-link'])

    await answer(20)

    expect(links.get(20)).toEqual(['token-2'])
  })

  it('keeps an administrator’s account to administrators: no session ended, no link sent', async () => {
    adminIds.add(20)

    const result = (await answer(20)) as { data: unknown; init: { status: number } }

    expect(result.init.status).toBe(403)
    expect(revoked).toEqual([])
    expect(emailed).toEqual([])
  })

  it('answers the dialog that sent it, so it closes', async () => {
    const result = (await answer(20)) as { data: unknown }

    expect(result.data).toEqual({ ok: true })
  })
})
