import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'
import { BUILT_IN_ROLE_KEYS, SYSTEM_ROLE_KEYS } from './built-in-roles.server'

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
// Member ids — identity roles attach to Member, so the test operates on the member side.
let primaryMemberId: number
let otherMemberId: number

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

  const primaryMember = await testDb.member.create({
    data: {
      firstname: 'Alice',
      lastname: 'Primary',
      isPublisher: true,
      isMale: false,
      type: PublisherType.Normal,
      congregationId: primaryCongId,
    },
  })
  primaryMemberId = primaryMember.id

  const otherMember = await testDb.member.create({
    data: {
      firstname: 'Bob',
      lastname: 'Other',
      isPublisher: true,
      isMale: true,
      isHelder: true,
      // Elder requires baptism
      baptismDate: new Date('2000-01-01'),
      type: PublisherType.Normal,
      congregationId: otherCongId,
    },
  })
  otherMemberId = otherMember.id
})

afterAll(async () => {
  for (const congId of [primaryCongId, otherCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.memberRoleAssignment.deleteMany({})
      await tx.userRoleAssignment.deleteMany({})
      await tx.role.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('seedBuiltInRoles', () => {
  // Both kinds of undeletable role, not just the identity ones: `admin` is seeded here
  // too, and a congregation provisioned without it cannot be administered.
  const SEEDED_KEYS = [...BUILT_IN_ROLE_KEYS, ...SYSTEM_ROLE_KEYS]

  it('creates exactly the configured identity and system roles per congregation', async () => {
    const roles = await testDb.role.findMany({
      where: { congregationId: primaryCongId, isBuiltIn: true },
      select: { key: true },
    })
    expect(roles.map(r => r.key).sort()).toEqual([...SEEDED_KEYS].sort())
  })

  it('seeds the admin system role', async () => {
    const admin = await testDb.role.findFirst({
      where: { congregationId: primaryCongId, key: 'admin' },
      select: { isBuiltIn: true, name: true },
    })
    // Undeletable, and unnamed so the label comes from the message catalogue.
    expect(admin).not.toBeNull()
    expect(admin?.isBuiltIn).toBe(true)
    expect(admin?.name).toBeNull()
  })

  it('is idempotent — calling twice does not duplicate', async () => {
    await seedRoles(testDb, primaryCongId)
    const count = await testDb.role.count({ where: { congregationId: primaryCongId, isBuiltIn: true } })
    expect(count).toBe(SEEDED_KEYS.length)
  })
})

describe('syncBuiltInRoleAssignments (integration)', () => {
  it('assigns roles matching current member flags', async () => {
    await withScope(primaryCongId, tx =>
      syncBuiltInRoleAssignments(tx, primaryMemberId, primaryCongId, primaryMemberId),
    )

    const assignments = await testDb.memberRoleAssignment.findMany({
      where: { memberId: primaryMemberId, congregationId: primaryCongId },
      include: { role: true },
    })
    const keys = assignments.map(a => a.role.key).sort()
    // Alice is a non-baptized female publisher → publisher + member only
    expect(keys).toEqual(['member', 'publisher'])
  })

  it('removes every identity role when leftAt is set', async () => {
    await withScope(primaryCongId, tx =>
      syncBuiltInRoleAssignments(tx, primaryMemberId, primaryCongId, primaryMemberId),
    )

    await testDb.member.update({ where: { id: primaryMemberId }, data: { leftAt: new Date() } })

    await withScope(primaryCongId, tx =>
      syncBuiltInRoleAssignments(tx, primaryMemberId, primaryCongId, primaryMemberId),
    )

    const keys = (
      await testDb.memberRoleAssignment.findMany({
        where: { memberId: primaryMemberId },
        include: { role: true },
      })
    )
      .map(a => a.role.key)
      .sort()
    expect(keys).toEqual([])

    // Restore for downstream tests
    await testDb.member.update({ where: { id: primaryMemberId }, data: { leftAt: null } })
  })

  it('emits no audit when nothing changes (idempotent re-run)', async () => {
    vi.mocked(audit).mockClear()

    await withScope(primaryCongId, tx =>
      syncBuiltInRoleAssignments(tx, primaryMemberId, primaryCongId, primaryMemberId),
    )
    await withScope(primaryCongId, tx =>
      syncBuiltInRoleAssignments(tx, primaryMemberId, primaryCongId, primaryMemberId),
    )

    const callsAfterIdempotentRun = vi.mocked(audit).mock.calls.length
    await withScope(primaryCongId, tx =>
      syncBuiltInRoleAssignments(tx, primaryMemberId, primaryCongId, primaryMemberId),
    )
    expect(vi.mocked(audit).mock.calls.length).toBe(callsAfterIdempotentRun)
  })

  it('does not touch assignments in another congregation (RLS isolation)', async () => {
    await withScope(otherCongId, tx => syncBuiltInRoleAssignments(tx, otherMemberId, otherCongId, otherMemberId))

    // Mutate the primary member, sync them — must not affect the other member.
    // Alice is female + non-baptized, so toggling baptism (a valid mutation
    // under the CHECK constraints) is enough to trigger a sync.
    await testDb.member.update({
      where: { id: primaryMemberId },
      data: { baptismDate: new Date('2005-01-01') },
    })
    await withScope(primaryCongId, tx =>
      syncBuiltInRoleAssignments(tx, primaryMemberId, primaryCongId, primaryMemberId),
    )

    const otherKeys = (
      await testDb.memberRoleAssignment.findMany({
        where: { memberId: otherMemberId },
        include: { role: true },
      })
    )
      .map(a => a.role.key)
      .sort()
    // Bob: baptized male elder publisher → baptized, brother, elder, member, publisher
    expect(otherKeys).toEqual(['baptized', 'brother', 'elder', 'member', 'publisher'])

    // Restore for downstream tests
    await testDb.member.update({ where: { id: primaryMemberId }, data: { baptismDate: null } })
  })
})
