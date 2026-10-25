import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { UserUpdated: 'UserUpdated' },
  audit: vi.fn(),
}))
vi.mock('~/shared/domain/built-in-roles.server', () => ({
  syncBuiltInRoleAssignments: vi.fn(),
}))
// The grant guards have their own tests (update-account-guards.server.test.ts).
vi.mock('~/shared/domain/role-grant-limits.server', () => ({ assertMayChangeAccountAccess: vi.fn() }))
vi.mock('~/shared/auth/permissions.server', () => ({ requireNotLastAdmin: vi.fn() }))

const mockDb = {
  userAccount: { update: vi.fn(), findUnique: vi.fn() },
  member: { update: vi.fn() },
}

const { updateAccount } = await import('./update-account.server')
const { audit } = await import('~/shared/domain/audit.server')

// The actor's permissions: an admin, so grant limits never interfere with what these tests cover.
const ADMIN_ACTOR = new Set(['can-do-anything'])

beforeEach(() => {
  vi.resetAllMocks()
  // Default: account exists with no linked Member (admin / CO account)
  mockDb.userAccount.findUnique.mockResolvedValue({ memberId: null })
})

describe('updateAccount', () => {
  it('updates user data', async () => {
    mockDb.userAccount.update.mockResolvedValue({} as never)

    await updateAccount(
      mockDb as never,
      1,
      10,
      99,
      {
        firstname: 'Marie',
        lastname: 'Martin',
        email: 'Marie.Martin@Example.COM',
        active: true,
      },
      ADMIN_ACTOR,
    )

    const call = mockDb.userAccount.update.mock.calls[0][0]
    expect(call.data.firstname).toBe('Marie')
    expect(call.data.lastname).toBe('Martin')
    expect(call.data.email).toBe('marie.martin@example.com')
    expect(call.data.active).toBe(true)
  })

  it('touches no permission table — access is granted by role assignment alone', async () => {
    mockDb.userAccount.update.mockResolvedValue({} as never)

    // The mock deliberately exposes no permission or role accessors. Since #149
    // this service edits identity only; a regression that reintroduced a
    // permission write here would throw rather than silently re-open the
    // direct grant path.
    await expect(
      updateAccount(
        mockDb as never,
        5,
        10,
        99,
        {
          firstname: 'Paul',
          lastname: 'Durand',
          email: 'paul@example.com',
          active: true,
        },
        ADMIN_ACTOR,
      ),
    ).resolves.toBeUndefined()
  })

  it('calls audit with correct action', async () => {
    mockDb.userAccount.update.mockResolvedValue({} as never)

    await updateAccount(
      mockDb as never,
      7,
      10,
      99,
      {
        firstname: 'Luc',
        lastname: 'Bernard',
        email: 'luc@example.com',
        active: false,
      },
      ADMIN_ACTOR,
    )

    expect(vi.mocked(audit)).toHaveBeenCalledWith({
      action: 'UserUpdated',
      congregationId: 10,
      actorId: 99,
      entityType: 'UserAccount',
      entityId: 7,
    })
  })
})
