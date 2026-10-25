import { beforeEach, describe, expect, it, vi } from 'vitest'

// The new-user page requires CanManageUsers. Its action must enforce it too: React Router runs only
// the leaf action on a submission, so the page's loader check never applies. Accounts are kept in an
// in-memory store, so the tests assert on whether one was created.

const { accounts } = vi.hoisted(() => ({ accounts: [] as string[] }))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn({}, 1),
}))

vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(async () => ({ flash: vi.fn() })),
  commitSession: vi.fn(async () => '__session=committed'),
}))

vi.mock('~/features/authentication', () => ({ ResetPasswordRequired: () => null }))

vi.mock('~/features/settings/server/create-account.server', () => ({
  UserAlreadyExistsError: class extends Error {},
  createAccount: vi.fn(async (_db: unknown, _congregation: unknown, _actor: number, input: { email: string }) => {
    accounts.push(input.email)
    return { emailSent: true }
  }),
}))

const { Permission } = await import('~/shared/types/permission')
const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const { action } = await import('./new-user')

const USER_FORM = { firstname: 'Mallory', lastname: 'Intruder', email: 'mallory@example.com' }

function submit(permissions: (typeof Permission)[keyof typeof Permission][]) {
  return respond(() =>
    action({
      request: formRequest('https://unitae.example.test/settings/users/new', USER_FORM),
      params: {},
      context: routeContext(permissions),
    } as never),
  )
}

beforeEach(() => {
  accounts.length = 0
})

describe('new-user action', () => {
  it('creates the account for a caller who manages users', async () => {
    const response = await submit([Permission.CanManageUsers])

    expect(response.headers.get('Location')).toBe('/settings/users')
    expect(accounts).toEqual(['mallory@example.com'])
  })

  // The settings layout also admits callers with other permissions (congregation settings, pioneer
  // goals, permissions); none of them may create accounts.
  it('refuses a caller admitted to settings for another reason, without creating an account', async () => {
    const response = await submit([Permission.CanConfigureCongregation, Permission.CanSetPioneerGoals])

    expect(response.headers.get('Location')).toBe('/')
    expect(accounts).toEqual([])
  })
})
