import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'
import { BUILT_IN_ROLE_KEYS } from './built-in-roles.server'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: { RoleAssignmentsSynced: 'role.assignments.synced' },
}))

vi.mock('~/shared/domain/setup.server', async () => {
  const actual = await vi.importActual<typeof import('~/shared/domain/setup.server')>('~/shared/domain/setup.server')
  return actual
})

const { syncBuiltInRoleAssignments } = await import('./built-in-roles.server')
const { audit } = await import('~/shared/domain/audit.server')
const { seedBuiltInRoles: seedRoles } = await import('./setup.server')

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

beforeAll(async () => {
  const primaryCong = await testDb.congregation.create({
    data: { name: `BIRoles Primary ${ts}`, slug: `bi-roles-primary-${ts}`, active: true },
  })
  primaryCongId = primaryCong.id

  const otherCong = await testDb.congregation.create({
    data: { name: `BIRoles Other ${ts}`, slug: `bi-roles-other-${ts}`, active: true },
  })
  otherCongId = otherCong.id

  await seedRoles(testDb, primaryCongId)
  await seedRoles(testDb, otherCongId)

  const primaryUser = await testDb.user.create({
    data: {
      email: `bi-roles-primary-${ts}@test.com`,
      password: 'hashed',
      firstname: 'Alice',
      lastname: 'Primary',
      active: true,
      isPublisher: true,
      isMale: false,
      type: PublisherType.Normal,
      congregationId: primaryCongId,
    },
  })
  primaryUserId = primaryUser.id

  const otherUser = await testDb.user.create({
    data: {
      email: `bi-roles-other-${ts}@test.com`,
      password: 'hashed',
      firstname: 'Bob',
      lastname: 'Other',
      active: true,
      isPublisher: true,
      isMale: true,
      isHelder: true,
      type: PublisherType.Normal,
      congregationId: otherCongId,
    },
  })
  otherUserId = otherUser.id
})

afterAll(async () => {
  for (const congId of [primaryCongId, otherCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.userRoleAssignment.deleteMany({})
      await tx.role.deleteMany({})
      await tx.user.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('seedBuiltInRoles', () => {
  it('creates exactly the seven built-in roles per congregation', async () => {
    const roles = await testDb.role.findMany({
      where: { congregationId: primaryCongId, isBuiltIn: true },
      select: { key: true },
    })
    expect(roles.map(r => r.key).sort()).toEqual([...BUILT_IN_ROLE_KEYS].sort())
  })

  it('is idempotent — calling twice does not duplicate', async () => {
    await seedRoles(testDb, primaryCongId)
    const count = await testDb.role.count({ where: { congregationId: primaryCongId, isBuiltIn: true } })
    expect(count).toBe(BUILT_IN_ROLE_KEYS.length)
  })
})

describe('syncBuiltInRoleAssignments (integration)', () => {
  it('assigns roles matching current boolean fields', async () => {
    await withScope(primaryCongId, tx => syncBuiltInRoleAssignments(tx, primaryUserId, primaryCongId, primaryUserId))

    const assignments = await testDb.userRoleAssignment.findMany({
      where: { userId: primaryUserId, congregationId: primaryCongId },
      include: { role: true },
    })
    const keys = assignments.map(a => a.role.key).sort()
    expect(keys).toEqual(['female', 'publisher'])
  })

  it('removes every domain role when isPublisher flips to false', async () => {
    await withScope(primaryCongId, tx => syncBuiltInRoleAssignments(tx, primaryUserId, primaryCongId, primaryUserId))

    await testDb.user.update({ where: { id: primaryUserId }, data: { isPublisher: false } })

    await withScope(primaryCongId, tx => syncBuiltInRoleAssignments(tx, primaryUserId, primaryCongId, primaryUserId))

    const keys = (
      await testDb.userRoleAssignment.findMany({
        where: { userId: primaryUserId },
        include: { role: true },
      })
    )
      .map(a => a.role.key)
      .sort()
    expect(keys).toEqual([])
  })

  it('emits no audit when nothing changes (idempotent re-run)', async () => {
    vi.mocked(audit).mockClear()

    await withScope(primaryCongId, tx => syncBuiltInRoleAssignments(tx, primaryUserId, primaryCongId, primaryUserId))
    await withScope(primaryCongId, tx => syncBuiltInRoleAssignments(tx, primaryUserId, primaryCongId, primaryUserId))

    // First call may emit (state-dependent); second call must not.
    const callsAfterIdempotentRun = vi.mocked(audit).mock.calls.length
    await withScope(primaryCongId, tx => syncBuiltInRoleAssignments(tx, primaryUserId, primaryCongId, primaryUserId))
    expect(vi.mocked(audit).mock.calls.length).toBe(callsAfterIdempotentRun)
  })

  it('does not touch assignments in another congregation (RLS isolation)', async () => {
    await withScope(otherCongId, tx => syncBuiltInRoleAssignments(tx, otherUserId, otherCongId, otherUserId))

    // Mutate the primary user, sync them — must not affect the other user
    await testDb.user.update({ where: { id: primaryUserId }, data: { isHelder: true } })
    await withScope(primaryCongId, tx => syncBuiltInRoleAssignments(tx, primaryUserId, primaryCongId, primaryUserId))

    const otherKeys = (
      await testDb.userRoleAssignment.findMany({
        where: { userId: otherUserId },
        include: { role: true },
      })
    )
      .map(a => a.role.key)
      .sort()
    expect(otherKeys).toEqual(['elder', 'male', 'publisher'])
  })
})
