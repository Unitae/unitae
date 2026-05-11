import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { Permission } from '~/shared/types/permission'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {
    RoleCreated: 'role.created',
    RoleUpdated: 'role.updated',
    RoleDeleted: 'role.deleted',
    RolePermissionChanged: 'role.permission.changed',
    UserRoleAssignmentChanged: 'user.role_assignment.changed',
  },
}))

const { seedBuiltInRoles, seedPermissions } = await import('~/shared/domain/setup.server')
const {
  createRole,
  updateRoleIdentity,
  updateRolePermissions,
  deleteRole,
  listRoles,
  setUserCustomRoleAssignments,
  addUserToRole,
  removeUserFromRole,
} = await import('./roles.server')
const { resolveEffectivePermissions } = await import('~/shared/auth/permissions.server')

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

function withScope<T>(congregationId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

const BUILT_IN_MESSAGE_PATTERN = /Built-in role memberships/i

const ts = Date.now()
let congregationId: number
let userId: number

beforeAll(async () => {
  await seedPermissions(testDb)

  const cong = await testDb.congregation.create({
    data: { name: `Roles ${ts}`, slug: `roles-${ts}`, active: true },
  })
  congregationId = cong.id

  await seedBuiltInRoles(testDb, congregationId)

  const user = await testDb.userAccount.create({
    data: {
      email: `roles-${ts}@test.com`,
      password: 'hashed',
      firstname: 'Test',
      lastname: 'User',
      active: true,
      congregationId,
    },
  })
  userId = user.id
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.userRoleAssignment.deleteMany({})
    await tx.rolePermission.deleteMany({})
    await tx.role.deleteMany({})
    await tx.congregationUserPermission.deleteMany({})
    await tx.userAccount.deleteMany({})
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('roles.server (integration)', () => {
  it('creates a custom role with permissions and persists everything', async () => {
    const role = await withScope(congregationId, tx =>
      createRole(tx, congregationId, userId, {
        name: 'Speaker',
        description: 'Frères qualifiés pour parler',
        permissionKeys: [Permission.ProgramViewer, Permission.BoardUploader],
      }),
    )

    const fetched = await testDb.role.findFirst({
      where: { id: role.id },
      include: { permissions: { include: { permission: true } } },
    })
    expect(fetched?.name).toBe('Speaker')
    expect(fetched?.isBuiltIn).toBe(false)
    expect(fetched?.permissions.map(p => p.permission.key).sort()).toEqual(
      [Permission.BoardUploader, Permission.ProgramViewer].sort(),
    )

    await withScope(congregationId, tx => deleteRole(tx, role.id, congregationId, userId))
  })

  it('updateRole audits permission changes and reflects in resolveEffectivePermissions', async () => {
    const role = await withScope(congregationId, tx =>
      createRole(tx, congregationId, userId, {
        name: `Editor ${ts}`,
        description: null,
        permissionKeys: [],
      }),
    )

    await withScope(congregationId, tx =>
      tx.userRoleAssignment.create({ data: { userId, roleId: role.id, congregationId } }),
    )

    const beforeGrant = await resolveEffectivePermissions(userId, congregationId)
    expect(beforeGrant.has(Permission.ExternalSpeakerManager)).toBe(false)

    await withScope(congregationId, tx =>
      updateRolePermissions(tx, role.id, congregationId, userId, [Permission.ExternalSpeakerManager]),
    )

    const afterGrant = await resolveEffectivePermissions(userId, congregationId)
    expect(afterGrant.has(Permission.ExternalSpeakerManager)).toBe(true)

    await withScope(congregationId, tx => deleteRole(tx, role.id, congregationId, userId))
  })

  it('deleting a custom role cascades assignments but leaves users intact', async () => {
    const role = await withScope(congregationId, tx =>
      createRole(tx, congregationId, userId, {
        name: `Cascade ${ts}`,
        description: null,
        permissionKeys: [Permission.ActivityViewer],
      }),
    )

    await withScope(congregationId, tx =>
      tx.userRoleAssignment.create({ data: { userId, roleId: role.id, congregationId } }),
    )

    const assignmentsBefore = await testDb.userRoleAssignment.findMany({ where: { roleId: role.id } })
    expect(assignmentsBefore).toHaveLength(1)

    await withScope(congregationId, tx => deleteRole(tx, role.id, congregationId, userId))

    const roleAfter = await testDb.role.findFirst({ where: { id: role.id } })
    expect(roleAfter).toBeNull()

    const assignmentsAfter = await testDb.userRoleAssignment.findMany({ where: { roleId: role.id } })
    expect(assignmentsAfter).toHaveLength(0)

    const userAfter = await testDb.userAccount.findUnique({ where: { id: userId } })
    expect(userAfter).not.toBeNull()
  })

  it('setUserCustomRoleAssignments only touches non-built-in assignments', async () => {
    const elder = await testDb.role.findFirst({ where: { congregationId, key: 'elder' } })
    if (!elder) throw new Error('elder role not seeded')

    await withScope(congregationId, tx =>
      tx.userRoleAssignment.upsert({
        where: { userId_roleId: { userId, roleId: elder.id } },
        update: {},
        create: { userId, roleId: elder.id, congregationId },
      }),
    )

    const customRole = await withScope(congregationId, tx =>
      createRole(tx, congregationId, userId, {
        name: `Custom ${ts}`,
        description: null,
        permissionKeys: [],
      }),
    )

    await withScope(congregationId, tx =>
      setUserCustomRoleAssignments(tx, userId, congregationId, userId, [customRole.id]),
    )

    const assignments = await testDb.userRoleAssignment.findMany({
      where: { userId },
      include: { role: true },
    })
    const keys = assignments.map(a => a.role.key)
    expect(keys).toContain('elder')
    expect(keys).toContain(customRole.key)

    await withScope(congregationId, tx => setUserCustomRoleAssignments(tx, userId, congregationId, userId, []))

    const after = await testDb.userRoleAssignment.findMany({
      where: { userId },
      include: { role: true },
    })
    const afterKeys = after.map(a => a.role.key)
    expect(afterKeys).toContain('elder')
    expect(afterKeys).not.toContain(customRole.key)

    await withScope(congregationId, tx => deleteRole(tx, customRole.id, congregationId, userId))
  })

  it('addUserToRole and removeUserFromRole toggle a single membership idempotently', async () => {
    const role = await withScope(congregationId, tx =>
      createRole(tx, congregationId, userId, { name: `Toggle ${ts}`, description: null, permissionKeys: [] }),
    )

    await withScope(congregationId, tx => addUserToRole(tx, userId, role.id, congregationId, userId))
    await withScope(congregationId, tx => addUserToRole(tx, userId, role.id, congregationId, userId))

    const afterAdd = await testDb.userRoleAssignment.findMany({ where: { userId, roleId: role.id } })
    expect(afterAdd).toHaveLength(1)

    await withScope(congregationId, tx => removeUserFromRole(tx, userId, role.id, congregationId, userId))
    await withScope(congregationId, tx => removeUserFromRole(tx, userId, role.id, congregationId, userId))

    const afterRemove = await testDb.userRoleAssignment.findMany({ where: { userId, roleId: role.id } })
    expect(afterRemove).toHaveLength(0)

    await withScope(congregationId, tx => deleteRole(tx, role.id, congregationId, userId))
  })

  it('addUserToRole rejects built-in role assignment with ForbiddenError', async () => {
    const elder = await testDb.role.findFirst({ where: { congregationId, key: 'elder' } })
    if (!elder) throw new Error('elder role not seeded')

    let caught: unknown = null
    try {
      await withScope(congregationId, tx => addUserToRole(tx, userId, elder.id, congregationId, userId))
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toMatch(BUILT_IN_MESSAGE_PATTERN)
  })

  it('updateRoleIdentity rejects built-in roles', async () => {
    const elder = await testDb.role.findFirst({ where: { congregationId, key: 'elder' } })
    if (!elder) throw new Error('elder role not seeded')

    let caught: unknown = null
    try {
      await withScope(congregationId, tx =>
        updateRoleIdentity(tx, elder.id, congregationId, userId, { name: 'Anciens locaux' }),
      )
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
  })

  it('listRoles orders built-ins before custom roles', async () => {
    const customA = await withScope(congregationId, tx =>
      createRole(tx, congregationId, userId, { name: `Z-Last ${ts}`, description: null, permissionKeys: [] }),
    )
    const customB = await withScope(congregationId, tx =>
      createRole(tx, congregationId, userId, { name: `A-First ${ts}`, description: null, permissionKeys: [] }),
    )

    const roles = await withScope(congregationId, tx => listRoles(tx, congregationId))
    const builtInPositions = roles.map((r, i) => (r.isBuiltIn ? i : -1)).filter(i => i >= 0)
    const customPositions = roles.map((r, i) => (!r.isBuiltIn ? i : -1)).filter(i => i >= 0)

    expect(Math.max(...builtInPositions)).toBeLessThan(Math.min(...customPositions))

    await withScope(congregationId, tx => deleteRole(tx, customA.id, congregationId, userId))
    await withScope(congregationId, tx => deleteRole(tx, customB.id, congregationId, userId))
  })
})
