import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    rolePermission: { findMany: vi.fn() },
    role: { findMany: vi.fn() },
    userAccount: { findMany: vi.fn() },
    member: { findMany: vi.fn() },
  },
}))

const {
  resolveEffectivePermissions,
  resolveEffectiveRoleIds,
  findAccountsWithPermission,
  findNotificationRecipientsWithPermission,
  findMembersWithAnyRole,
  notificationRecipientFilter,
  requireNotLastAdmin,
} = await import('./permissions.server')
const { unscopedDb } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('resolveEffectivePermissions', () => {
  it('returns every permission the user reaches through a role', async () => {
    vi.mocked(unscopedDb.rolePermission.findMany).mockResolvedValue([
      { permission: { key: 'territories-manager' } },
      { permission: { key: 'publisher-viewer' } },
    ] as never)

    const result = await resolveEffectivePermissions(42, 1)

    expect(result).toEqual(new Set(['territories-manager', 'publisher-viewer']))
  })

  it("deduplicates a permission two of the user's roles both grant", async () => {
    vi.mocked(unscopedDb.rolePermission.findMany).mockResolvedValue([
      { permission: { key: 'territories-manager' } },
      { permission: { key: 'territories-manager' } },
    ] as never)

    const result = await resolveEffectivePermissions(42, 1)

    expect([...result]).toEqual(['territories-manager'])
  })

  it('expands admin to every permission so feature checks pass without explicit grants', async () => {
    vi.mocked(unscopedDb.rolePermission.findMany).mockResolvedValue([{ permission: { key: 'admin' } }] as never)

    const result = await resolveEffectivePermissions(42, 1)

    for (const value of Object.values(Permission)) {
      expect(result.has(value)).toBe(true)
    }
  })

  it('returns an empty set when the user holds no role that grants anything', async () => {
    vi.mocked(unscopedDb.rolePermission.findMany).mockResolvedValue([] as never)

    const result = await resolveEffectivePermissions(42, 1)

    expect(result.size).toBe(0)
  })

  it('matches roles via both assignment tables and reads nothing else', async () => {
    vi.mocked(unscopedDb.rolePermission.findMany).mockResolvedValue([] as never)

    await resolveEffectivePermissions(42, 7)

    // Roles are now the only path. A second source reappearing here would mean
    // the direct user->permission edge had crept back in.
    expect(unscopedDb.rolePermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          congregationId: 7,
          role: {
            OR: [
              { members: { some: { userId: 42 } } },
              { memberAssignments: { some: { member: { account: { id: 42 } } } } },
            ],
          },
        }),
      }),
    )
  })
})

describe('resolveEffectiveRoleIds', () => {
  it('returns the deduplicated set of role IDs assigned via either assignment table', async () => {
    vi.mocked(unscopedDb.role.findMany).mockResolvedValue([{ id: 11 }, { id: 13 }, { id: 11 }] as never)

    const result = await resolveEffectiveRoleIds(unscopedDb, 42, 1)

    expect(result.sort()).toEqual([11, 13])
  })

  it('queries Role with the three-source role filter scoped to the congregation', async () => {
    vi.mocked(unscopedDb.role.findMany).mockResolvedValue([] as never)

    await resolveEffectiveRoleIds(unscopedDb, 42, 7)

    expect(unscopedDb.role.findMany).toHaveBeenCalledWith({
      where: {
        congregationId: 7,
        OR: [
          { members: { some: { userId: 42 } } },
          { memberAssignments: { some: { member: { account: { id: 42 } } } } },
        ],
      },
      select: { id: true },
    })
  })
})

describe('findAccountsWithPermission', () => {
  it('returns UserAccounts matched via any of the three permission sources', async () => {
    vi.mocked(unscopedDb.userAccount.findMany).mockResolvedValue([
      { id: 1, email: 'a@a.test', firstname: 'A', active: true },
      { id: 2, email: 'b@b.test', firstname: null, active: false },
    ] as never)

    const result = await findAccountsWithPermission(unscopedDb, 7, Permission.BoardValidator)

    expect(result).toEqual([
      { id: 1, email: 'a@a.test', firstname: 'A', active: true },
      { id: 2, email: 'b@b.test', firstname: null, active: false },
    ])
  })

  it('queries UserAccount with the three-branch OR fragment scoped to the congregation', async () => {
    vi.mocked(unscopedDb.userAccount.findMany).mockResolvedValue([] as never)

    await findAccountsWithPermission(unscopedDb, 7, Permission.BoardValidator)

    expect(unscopedDb.userAccount.findMany).toHaveBeenCalledWith({
      where: {
        congregationId: 7,
        OR: [
          {
            roleAssignments: {
              some: { role: { permissions: { some: { permission: { key: Permission.BoardValidator } } } } },
            },
          },
          {
            member: {
              roleAssignments: {
                some: { role: { permissions: { some: { permission: { key: Permission.BoardValidator } } } } },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        email: true,
        firstname: true,
        active: true,
        member: { select: { firstname: true } },
      },
    })
  })
})

describe('findMembersWithAnyRole', () => {
  it('returns [] without hitting the database when roleIds is empty', async () => {
    const result = await findMembersWithAnyRole(unscopedDb, [], 7)

    expect(result).toEqual([])
    expect(unscopedDb.member.findMany).not.toHaveBeenCalled()
  })

  it('returns the mapped member IDs', async () => {
    vi.mocked(unscopedDb.member.findMany).mockResolvedValue([{ id: 5 }, { id: 11 }] as never)

    const result = await findMembersWithAnyRole(unscopedDb, [10, 20], 1)

    expect(result).toEqual([5, 11])
  })

  it('queries Member with the two-source role filter scoped to the congregation, excluding leavers and anonymized', async () => {
    vi.mocked(unscopedDb.member.findMany).mockResolvedValue([] as never)

    await findMembersWithAnyRole(unscopedDb, [10, 20], 7)

    expect(unscopedDb.member.findMany).toHaveBeenCalledWith({
      where: {
        congregationId: 7,
        leftAt: null,
        anonymizedAt: null,
        OR: [
          { roleAssignments: { some: { roleId: { in: [10, 20] } } } },
          { account: { roleAssignments: { some: { roleId: { in: [10, 20] } } } } },
        ],
      },
      select: { id: true },
    })
  })
})

describe('notificationRecipientFilter', () => {
  it('excludes deactivated accounts, left members, and anonymized members — admin accounts (no linked Member) pass through', () => {
    // The filter is a shared Prisma WHERE fragment. Assert its shape so
    // every caller inherits the same recipient-eligibility semantics.
    expect(notificationRecipientFilter).toEqual({
      active: true,
      OR: [{ memberId: null }, { member: { leftAt: null, anonymizedAt: null } }],
    })
  })
})

describe('findNotificationRecipientsWithPermission', () => {
  it('composes the permission fan-out with the recipient filter via AND so both must match', async () => {
    vi.mocked(unscopedDb.userAccount.findMany).mockResolvedValue([] as never)

    await findNotificationRecipientsWithPermission(unscopedDb, 7, Permission.BoardValidator)

    expect(unscopedDb.userAccount.findMany).toHaveBeenCalledWith({
      where: {
        congregationId: 7,
        AND: [
          {
            OR: [
              {
                roleAssignments: {
                  some: { role: { permissions: { some: { permission: { key: Permission.BoardValidator } } } } },
                },
              },
              {
                member: {
                  roleAssignments: {
                    some: { role: { permissions: { some: { permission: { key: Permission.BoardValidator } } } } },
                  },
                },
              },
            ],
          },
          notificationRecipientFilter,
        ],
      },
      select: {
        id: true,
        email: true,
        firstname: true,
        active: true,
        member: { select: { firstname: true } },
      },
    })
  })
})

describe('requireNotLastAdmin', () => {
  it('returns silently when the target account is not an admin', async () => {
    vi.mocked(unscopedDb.userAccount.findMany).mockResolvedValue([
      { id: 1, email: 'a@a.test', firstname: 'A', active: true },
      { id: 2, email: 'b@b.test', firstname: 'B', active: true },
    ] as never)

    await expect(requireNotLastAdmin(99, 7)).resolves.toBeUndefined()
  })

  it('returns when other admins remain in the congregation', async () => {
    vi.mocked(unscopedDb.userAccount.findMany).mockResolvedValue([
      { id: 1, email: 'a@a.test', firstname: 'A', active: true },
      { id: 2, email: 'b@b.test', firstname: 'B', active: true },
    ] as never)

    await expect(requireNotLastAdmin(1, 7)).resolves.toBeUndefined()
  })

  it('throws ConflictError when the target is the only admin', async () => {
    vi.mocked(unscopedDb.userAccount.findMany).mockResolvedValue([
      { id: 1, email: 'a@a.test', firstname: 'A', active: true },
    ] as never)

    await expect(requireNotLastAdmin(1, 7)).rejects.toThrow('Cannot remove the last admin from the congregation.')
  })
})
