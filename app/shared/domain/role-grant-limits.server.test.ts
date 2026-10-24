import { beforeEach, describe, expect, it, vi } from 'vitest'

// An actor may only hand out (or take away) the permissions they hold themselves. The admin role
// carries can-do-anything, so only an admin can grant or revoke it, and only an admin can change an
// admin's roles or the permission set of a built-in role.

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: {
    RolePermissionChanged: 'RolePermissionChanged',
    UserRoleAssignmentChanged: 'UserRoleAssignmentChanged',
  },
  audit: vi.fn(),
}))

const { adminIds, lastAdminGuardCalls } = vi.hoisted(() => ({
  adminIds: new Set<number>(),
  lastAdminGuardCalls: [] as number[],
}))

vi.mock('~/shared/auth/permissions.server', async () => {
  const { ConflictError } = await import('~/shared/errors/app-error.server')
  return {
    isAccountAdmin: vi.fn(async (accountId: number) => adminIds.has(accountId)),
    requireNotLastAdmin: vi.fn(async (accountId: number) => {
      lastAdminGuardCalls.push(accountId)
      if (adminIds.has(accountId) && adminIds.size === 1) throw new ConflictError('last admin')
    }),
  }
})

// In-memory roles, their permissions, and account assignments.
const ROLES = {
  admin: { id: 1, key: 'admin', isBuiltIn: true, isSinglePerson: false, permissions: ['can-do-anything'] },
  member: { id: 2, key: 'member', isBuiltIn: true, isSinglePerson: false, permissions: ['can-view-board'] },
  speakers: { id: 3, key: 'speakers', isBuiltIn: false, isSinglePerson: false, permissions: ['can-view-programs'] },
} as const
type RoleRow = (typeof ROLES)[keyof typeof ROLES]
const byId = (id: number): RoleRow | undefined => Object.values(ROLES).find(r => r.id === id)

const state = { assignments: [] as { userId: number; roleId: number }[], rolePermissions: new Map<number, string[]>() }

const db = {
  role: {
    findFirst: vi.fn(async ({ where }: { where: { id: number } }) => {
      const role = byId(where.id)
      if (!role) return null
      return { ...role, permissions: (state.rolePermissions.get(role.id) ?? []).map(key => ({ permission: { key } })) }
    }),
    findMany: vi.fn(async () => Object.values(ROLES).filter(r => !r.isBuiltIn || r.key === 'admin')),
  },
  rolePermission: {
    findMany: vi.fn(async ({ where }: { where: { roleId: { in: number[] } } }) =>
      where.roleId.in.flatMap(id => (state.rolePermissions.get(id) ?? []).map(key => ({ permission: { key } }))),
    ),
    findFirst: vi.fn(async ({ where }: { where: { roleId: { in: number[] } } }) =>
      where.roleId.in.some(id => state.rolePermissions.get(id)?.includes('can-do-anything')) ? { roleId: 1 } : null,
    ),
    createMany: vi.fn(async ({ data }: { data: { roleId: number; permissionId: number }[] }) => ({
      count: data.length,
    })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  permission: {
    findMany: vi.fn(async () => [
      { id: 50, key: 'can-do-anything' },
      { id: 51, key: 'can-view-programs' },
    ]),
  },
  userRoleAssignment: {
    findFirst: vi.fn(async ({ where }: { where: { userId: number; roleId: number } }) => {
      const found = state.assignments.find(a => a.userId === where.userId && a.roleId === where.roleId)
      return found ? { userId: found.userId, kind: 'member' } : null
    }),
    findMany: vi.fn(async ({ where }: { where: { userId: number } }) =>
      state.assignments.filter(a => a.userId === where.userId).map(a => ({ roleId: a.roleId })),
    ),
    create: vi.fn(async ({ data }: { data: { userId: number; roleId: number } }) => {
      state.assignments.push({ userId: data.userId, roleId: data.roleId })
    }),
    createMany: vi.fn(async ({ data }: { data: { userId: number; roleId: number }[] }) => {
      for (const row of data) state.assignments.push({ userId: row.userId, roleId: row.roleId })
    }),
    deleteMany: vi.fn(async ({ where }: { where: { userId: number; roleId: number | { in: number[] } } }) => {
      const ids = typeof where.roleId === 'number' ? [where.roleId] : where.roleId.in
      state.assignments = state.assignments.filter(a => !(a.userId === where.userId && ids.includes(a.roleId)))
    }),
  },
}

const { addUserToRole, removeUserFromRole, setUserCustomRoleAssignments, updateRolePermissions } = await import(
  './roles.server'
)
const { ConflictError, ForbiddenError } = await import('~/shared/errors/app-error.server')

const ROLE_MANAGER = new Set(['can-manage-roles', 'can-view-programs'])
const ADMIN = new Set(['can-do-anything'])

beforeEach(() => {
  state.assignments = []
  state.rolePermissions = new Map(Object.values(ROLES).map(r => [r.id, [...r.permissions]]))
  adminIds.clear()
  lastAdminGuardCalls.length = 0
})

describe('addUserToRole', () => {
  it('refuses to grant the admin role to an actor who is not an admin', async () => {
    await expect(addUserToRole(db as never, 5, ROLES.admin.id, 10, 7, ROLE_MANAGER)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(state.assignments).toEqual([])
  })

  it('lets an actor grant a role whose permissions they hold', async () => {
    await addUserToRole(db as never, 5, ROLES.speakers.id, 10, 7, ROLE_MANAGER)
    expect(state.assignments).toEqual([{ userId: 5, roleId: ROLES.speakers.id }])
  })

  it('lets an admin grant the admin role', async () => {
    await addUserToRole(db as never, 5, ROLES.admin.id, 10, 7, ADMIN)
    expect(state.assignments).toEqual([{ userId: 5, roleId: ROLES.admin.id }])
  })

  it("refuses to change an admin's roles to an actor who is not an admin", async () => {
    adminIds.add(5)
    await expect(addUserToRole(db as never, 5, ROLES.speakers.id, 10, 7, ROLE_MANAGER)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(state.assignments).toEqual([])
  })
})

describe('removeUserFromRole', () => {
  it('refuses to revoke the admin role to an actor who is not an admin', async () => {
    state.assignments = [{ userId: 5, roleId: ROLES.admin.id }]
    await expect(removeUserFromRole(db as never, 5, ROLES.admin.id, 10, 7, ROLE_MANAGER)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(state.assignments).toEqual([{ userId: 5, roleId: ROLES.admin.id }])
  })

  it('refuses to strip the admin role from the last admin', async () => {
    adminIds.add(5)
    state.assignments = [{ userId: 5, roleId: ROLES.admin.id }]
    await expect(removeUserFromRole(db as never, 5, ROLES.admin.id, 10, 8, ADMIN)).rejects.toBeInstanceOf(ConflictError)
    expect(state.assignments).toEqual([{ userId: 5, roleId: ROLES.admin.id }])
  })
})

describe('setUserCustomRoleAssignments', () => {
  it('refuses to assign the admin role to an actor who is not an admin', async () => {
    await expect(
      setUserCustomRoleAssignments(db as never, 5, 10, 7, [ROLES.admin.id], ROLE_MANAGER),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(state.assignments).toEqual([])
  })

  it("refuses to change an admin's roles to an actor who is not an admin", async () => {
    adminIds.add(5)
    state.assignments = [{ userId: 5, roleId: ROLES.admin.id }]
    await expect(
      setUserCustomRoleAssignments(db as never, 5, 10, 7, [ROLES.admin.id, ROLES.speakers.id], ROLE_MANAGER),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(state.assignments).toEqual([{ userId: 5, roleId: ROLES.admin.id }])
  })

  it('lets an actor assign a role whose permissions they hold', async () => {
    await setUserCustomRoleAssignments(db as never, 5, 10, 7, [ROLES.speakers.id], ROLE_MANAGER)
    expect(state.assignments).toEqual([{ userId: 5, roleId: ROLES.speakers.id }])
  })
})

describe('updateRolePermissions', () => {
  it('refuses to add a permission the actor does not hold', async () => {
    await expect(
      updateRolePermissions(
        db as never,
        ROLES.speakers.id,
        10,
        7,
        ['can-view-programs', 'can-do-anything'],
        ROLE_MANAGER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("refuses to change a built-in role's permissions to an actor who is not an admin", async () => {
    await expect(
      updateRolePermissions(db as never, ROLES.member.id, 10, 7, ['can-view-board', 'can-view-programs'], ROLE_MANAGER),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('lets an admin change any role', async () => {
    await expect(
      updateRolePermissions(db as never, ROLES.member.id, 10, 7, ['can-view-board', 'can-view-programs'], ADMIN),
    ).resolves.toBeUndefined()
  })
})
