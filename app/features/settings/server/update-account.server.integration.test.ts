import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: { UserUpdated: 'user.updated' },
}))

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

const ts = Date.now()
let primaryCongId: number
let otherCongId: number
let primaryUserId: number
let otherUserId: number
let adminPermissionId: number

const { updateAccount } = await import('./update-account.server')

beforeAll(async () => {
  const adminPermission = await testDb.permission.findFirst({ where: { key: 'admin' } })
  if (!adminPermission) throw new Error('Permission "admin" not found — run pnpm prisma db seed first')
  adminPermissionId = adminPermission.id

  const primaryCong = await testDb.congregation.create({
    data: { name: `UpdateUser Primary ${ts}`, slug: `update-user-primary-${ts}`, active: true },
  })
  primaryCongId = primaryCong.id

  const otherCong = await testDb.congregation.create({
    data: { name: `UpdateUser Other ${ts}`, slug: `update-user-other-${ts}`, active: true },
  })
  otherCongId = otherCong.id

  await withScope(primaryCongId, async tx => {
    const user = await tx.userAccount.create({
      data: {
        email: `update-user-primary-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Alice',
        lastname: 'Before',
        active: true,
        congregationId: primaryCongId,
      },
    })
    primaryUserId = user.id

    // Admin arrives through the auto-role the #149 backfill mints.
    const adminRole = await tx.role.create({
      data: { key: 'admin', isBuiltIn: true, congregationId: primaryCongId },
    })
    await tx.rolePermission.create({
      data: { roleId: adminRole.id, permissionId: adminPermissionId, congregationId: primaryCongId },
    })
    await tx.userRoleAssignment.create({
      data: { userId: user.id, roleId: adminRole.id, congregationId: primaryCongId },
    })

    // Spare admin, kept from the era when this service could demote the primary
    // user away from Admin. Never touched.
    const sentinelAdmin = await tx.userAccount.create({
      data: {
        email: `update-user-primary-sentinel-${ts}@test.com`,
        password: 'hashed',
        active: true,
        congregationId: primaryCongId,
      },
    })
    await tx.userRoleAssignment.create({
      data: { userId: sentinelAdmin.id, roleId: adminRole.id, congregationId: primaryCongId },
    })
  })

  await withScope(otherCongId, async tx => {
    const user = await tx.userAccount.create({
      data: {
        email: `update-user-other-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Bob',
        lastname: 'Other',
        active: true,
        congregationId: otherCongId,
      },
    })
    otherUserId = user.id

    const otherAdminRole = await tx.role.create({
      data: { key: 'admin', isBuiltIn: true, congregationId: otherCongId },
    })
    await tx.rolePermission.create({
      data: { roleId: otherAdminRole.id, permissionId: adminPermissionId, congregationId: otherCongId },
    })
    await tx.userRoleAssignment.create({
      data: { userId: user.id, roleId: otherAdminRole.id, congregationId: otherCongId },
    })
  })
})

afterAll(async () => {
  for (const congId of [primaryCongId, otherCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.userRoleAssignment.deleteMany({})
      await tx.rolePermission.deleteMany({})
      await tx.role.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('updateAccount (integration)', () => {
  it('updates user personal data', async () => {
    await withScope(primaryCongId, tx =>
      updateAccount(tx, primaryUserId, primaryCongId, primaryUserId, {
        firstname: 'Alice',
        lastname: 'After',
        email: `update-user-primary-${ts}@test.com`,
        active: false,
      }),
    )

    const user = await testDb.userAccount.findUnique({ where: { id: primaryUserId } })
    expect(user?.lastname).toBe('After')
    expect(user?.active).toBe(false)
  })

  it("leaves the account's role assignments untouched", async () => {
    // Editing identity must not disturb access. Since #149 this service has no
    // permission arm at all; granting and revoking live in
    // setUserCustomRoleAssignments, covered by roles.server.integration.test.ts.
    const before = await testDb.userRoleAssignment.findMany({
      where: { userId: primaryUserId, congregationId: primaryCongId },
      select: { roleId: true },
    })

    await withScope(primaryCongId, tx =>
      updateAccount(tx, primaryUserId, primaryCongId, primaryUserId, {
        firstname: 'Alice',
        lastname: 'After',
        email: `update-user-primary-${ts}@test.com`,
        active: true,
      }),
    )

    const after = await testDb.userRoleAssignment.findMany({
      where: { userId: primaryUserId, congregationId: primaryCongId },
      select: { roleId: true },
    })
    expect(before.length).toBeGreaterThan(0)
    expect(after.map(a => a.roleId).sort()).toEqual(before.map(a => a.roleId).sort())
  })

  it("does not touch another congregation's role assignments — RLS isolation", async () => {
    const otherRolesBefore = await testDb.userRoleAssignment.findMany({
      where: { userId: otherUserId, congregationId: otherCongId },
    })
    expect(otherRolesBefore.length).toBeGreaterThan(0)

    await withScope(primaryCongId, tx =>
      updateAccount(tx, primaryUserId, primaryCongId, primaryUserId, {
        firstname: 'Alice',
        lastname: 'After',
        email: `update-user-primary-${ts}@test.com`,
        active: true,
      }),
    )

    const otherRolesAfter = await testDb.userRoleAssignment.findMany({
      where: { userId: otherUserId, congregationId: otherCongId },
    })
    expect(otherRolesAfter).toHaveLength(otherRolesBefore.length)
  })

  it('normalises email to lowercase', async () => {
    await withScope(primaryCongId, tx =>
      updateAccount(tx, primaryUserId, primaryCongId, primaryUserId, {
        firstname: 'Alice',
        lastname: 'After',
        email: `Update-User-PRIMARY-${ts}@TEST.COM`,
        active: true,
      }),
    )

    const user = await testDb.userAccount.findUnique({ where: { id: primaryUserId } })
    expect(user?.email).toBe(`update-user-primary-${ts}@test.com`)
  })
})
