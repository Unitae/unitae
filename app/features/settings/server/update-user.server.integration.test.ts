import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'

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

const { updateUser } = await import('./update-user.server')

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
    const user = await tx.user.create({
      data: {
        email: `update-user-primary-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Alice',
        lastname: 'Before',
        active: true,
        isPublisher: true,
        type: PublisherType.Normal,
        congregationId: primaryCongId,
      },
    })
    primaryUserId = user.id

    await tx.congregationUserPermission.create({
      data: { userId: user.id, permissionId: adminPermissionId, congregationId: primaryCongId },
    })
  })

  await withScope(otherCongId, async tx => {
    const user = await tx.user.create({
      data: {
        email: `update-user-other-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Bob',
        lastname: 'Other',
        active: true,
        isPublisher: false,
        type: PublisherType.Normal,
        congregationId: otherCongId,
      },
    })
    otherUserId = user.id

    await tx.congregationUserPermission.create({
      data: { userId: user.id, permissionId: adminPermissionId, congregationId: otherCongId },
    })
  })
})

afterAll(async () => {
  for (const congId of [primaryCongId, otherCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.congregationUserPermission.deleteMany({})
      await tx.user.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('updateUser (integration)', () => {
  it('updates user personal data', async () => {
    await withScope(primaryCongId, tx =>
      updateUser(tx, primaryUserId, primaryCongId, primaryUserId, {
        firstname: 'Alice',
        lastname: 'After',
        email: `update-user-primary-${ts}@test.com`,
        active: false,
        permissions: ['admin'],
      }),
    )

    const user = await testDb.userAccount.findUnique({ where: { id: primaryUserId } })
    expect(user?.lastname).toBe('After')
    expect(user?.active).toBe(false)
  })

  it('replaces congregation roles — removes old, creates new', async () => {
    // Start with admin role, switch to board-uploader role
    await withScope(primaryCongId, tx =>
      updateUser(tx, primaryUserId, primaryCongId, primaryUserId, {
        firstname: 'Alice',
        lastname: 'After',
        email: `update-user-primary-${ts}@test.com`,
        active: true,
        permissions: ['board-uploader'],
      }),
    )

    const assignments = await testDb.congregationUserPermission.findMany({
      where: { userId: primaryUserId, congregationId: primaryCongId },
      include: { permission: true },
    })
    const assignedKeys = assignments.map(a => a.permission.key)
    expect(assignedKeys).not.toContain('admin')
    expect(assignedKeys).toContain('board-uploader')
  })

  it('removes all permissions when empty permissions array is given', async () => {
    await withScope(primaryCongId, tx =>
      updateUser(tx, primaryUserId, primaryCongId, primaryUserId, {
        firstname: 'Alice',
        lastname: 'After',
        email: `update-user-primary-${ts}@test.com`,
        active: true,
        permissions: [],
      }),
    )

    const roles = await testDb.congregationUserPermission.findMany({
      where: { userId: primaryUserId, congregationId: primaryCongId },
    })
    expect(roles).toHaveLength(0)
  })

  it('role deleteMany does not touch other congregation user roles — RLS isolation', async () => {
    // Ensure other congregation user has their admin role
    const otherRolesBefore = await testDb.congregationUserPermission.findMany({
      where: { userId: otherUserId, congregationId: otherCongId },
    })
    expect(otherRolesBefore.length).toBeGreaterThan(0)

    // Update primary user (deletes roles for primary user in primary congregation)
    await withScope(primaryCongId, tx =>
      updateUser(tx, primaryUserId, primaryCongId, primaryUserId, {
        firstname: 'Alice',
        lastname: 'After',
        email: `update-user-primary-${ts}@test.com`,
        active: true,
        permissions: ['admin'],
      }),
    )

    // Other congregation user's roles must be intact
    const otherRolesAfter = await testDb.congregationUserPermission.findMany({
      where: { userId: otherUserId, congregationId: otherCongId },
    })
    expect(otherRolesAfter).toHaveLength(otherRolesBefore.length)
  })

  it('normalises email to lowercase', async () => {
    await withScope(primaryCongId, tx =>
      updateUser(tx, primaryUserId, primaryCongId, primaryUserId, {
        firstname: 'Alice',
        lastname: 'After',
        email: `Update-User-PRIMARY-${ts}@TEST.COM`,
        active: true,
        permissions: [],
      }),
    )

    const user = await testDb.userAccount.findUnique({ where: { id: primaryUserId } })
    expect(user?.email).toBe(`update-user-primary-${ts}@test.com`)
  })
})
