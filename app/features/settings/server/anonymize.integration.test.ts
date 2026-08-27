import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { AccountId, MemberId } from '~/shared/types/branded'

const ANONYMIZED_EMAIL_RE = /^deleted-.+@anonymized\.local$/
const ALREADY_ANONYMIZED_RE = /already anonymized/i
const USER_NOT_FOUND_RE = /useraccount not found/i

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {},
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
let primaryMemberId: number
let otherUserId: number
let adminPermissionId: number

const { anonymizeAccount } = await import('./anonymize-account.server')
const { anonymizeMember } = await import('./anonymize-member.server')

// Mirror what `app/features/settings/routes/users/anonymize.tsx` does: scrub
// the linked Member first (if any), then the UserAccount. Tests that exercise
// the full flow call this helper instead of pulling in route-level concerns.
async function anonymizeUser(tx: Tx, userId: number, actorId: number): Promise<void> {
  const account = await tx.userAccount.findUnique({
    where: { id: userId },
    select: { id: true, congregationId: true, memberId: true },
  })
  if (!account) {
    const { NotFoundError } = await import('~/shared/errors/app-error.server')
    throw new NotFoundError('UserAccount')
  }
  if (account.memberId != null) {
    await anonymizeMember(tx, account.memberId as MemberId, account.congregationId, actorId)
  }
  await anonymizeAccount(tx, account.id as AccountId, account.congregationId, actorId)
}

beforeAll(async () => {
  // The current admin capability. `admin` is no longer a seeded Permission row — it
  // survives only as a legacy row on deployed databases, so a test must not depend on it.
  const adminPermission = await testDb.permission.findFirst({ where: { key: 'can-do-anything' } })
  if (!adminPermission) throw new Error('Permission "can-do-anything" not found — run pnpm prisma db seed first')
  adminPermissionId = adminPermission.id

  const primaryCong = await testDb.congregation.create({
    data: { name: `Anonymize Primary ${ts}`, slug: `anon-primary-${ts}`, active: true },
  })
  primaryCongId = primaryCong.id

  const otherCong = await testDb.congregation.create({
    data: { name: `Anonymize Other ${ts}`, slug: `anon-other-${ts}`, active: true },
  })
  otherCongId = otherCong.id

  await withScope(primaryCongId, async tx => {
    const member = await tx.member.create({
      data: {
        firstname: 'Alice',
        lastname: 'Primary',
        phone: '0600000001',
        isPublisher: true,
        congregationId: primaryCongId,
      },
    })
    primaryMemberId = member.id
    const user = await tx.userAccount.create({
      data: {
        email: `anon-primary-${ts}@test.com`,
        password: 'hashed',
        active: true,
        memberId: member.id,
        congregationId: primaryCongId,
      },
    })
    primaryUserId = user.id

    // Admin arrives through the auto-role the #149 backfill mints — the only
    // path left now the direct grant is gone.
    const adminRole = await tx.role.create({
      data: { key: 'admin', isBuiltIn: true, congregationId: primaryCongId },
    })
    await tx.rolePermission.create({
      data: { roleId: adminRole.id, permissionId: adminPermissionId, congregationId: primaryCongId },
    })
    await tx.userRoleAssignment.create({
      data: { userId: user.id, roleId: adminRole.id, congregationId: primaryCongId },
    })

    // Spare admin so requireNotLastAdmin doesn't block deletion of the
    // primary subject during these tests. Never touched.
    const sentinelAdmin = await tx.userAccount.create({
      data: {
        email: `anon-primary-sentinel-${ts}@test.com`,
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
    const member = await tx.member.create({
      data: {
        firstname: 'Bob',
        lastname: 'Other',
        isPublisher: true,
        congregationId: otherCongId,
      },
    })
    const user = await tx.userAccount.create({
      data: {
        email: `anon-other-${ts}@test.com`,
        password: 'hashed',
        active: true,
        memberId: member.id,
        congregationId: otherCongId,
      },
    })
    otherUserId = user.id
  })
})

afterAll(async () => {
  for (const congId of [primaryCongId, otherCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.dataDeletionRecord.deleteMany({})
      await tx.attribution.deleteMany({})
      await tx.userRoleAssignment.deleteMany({})
      await tx.rolePermission.deleteMany({})
      await tx.role.deleteMany({})
      await tx.publisherGroup.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
      await tx.territory.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('anonymizeUser (integration)', () => {
  it('anonymizes personal data of the target user', async () => {
    await withScope(primaryCongId, tx => anonymizeUser(tx, primaryUserId as AccountId, 1))

    const user = await testDb.userAccount.findUnique({
      where: { id: primaryUserId },
      include: { member: true },
    })
    expect(user?.email).toMatch(ANONYMIZED_EMAIL_RE)
    expect(user?.password).toBe('')
    expect(user?.active).toBe(false)
    expect(user?.anonymizedAt).not.toBeNull()
    // Member-side fields (PII scrubbed; activity-relevant fields preserved)
    expect(user?.member?.firstname).toBe('Utilisateur')
    expect(user?.member?.lastname).toBe('supprime')
    expect(user?.member?.phone).toBe('')
    expect(user?.member?.anonymizedAt).not.toBeNull()
    // leftAt is set so the anonymized row drops from active publisher lists
    expect(user?.member?.leftAt).not.toBeNull()
  })

  it('deletes congregation roles for the anonymized user', async () => {
    const roleAssignments = await testDb.userRoleAssignment.findMany({ where: { userId: primaryUserId } })
    expect(roleAssignments).toHaveLength(0)
  })

  it('creates a data deletion record for GDPR compliance', async () => {
    const records = await testDb.dataDeletionRecord.findMany({
      where: { OR: [{ entityId: primaryUserId }, { entityId: primaryMemberId }], congregationId: primaryCongId },
    })
    const entityTypes = records.map(r => r.entityType).sort()
    expect(entityTypes).toEqual(expect.arrayContaining(['Member', 'UserAccount']))
  })

  it('throws when the user is already anonymized', async () => {
    await expect(withScope(primaryCongId, tx => anonymizeUser(tx, primaryUserId as AccountId, 1))).rejects.toThrow(
      ALREADY_ANONYMIZED_RE,
    )
  })

  it('throws when the user does not exist', async () => {
    await expect(withScope(primaryCongId, tx => anonymizeUser(tx, 999999 as AccountId, 1))).rejects.toThrow(
      USER_NOT_FOUND_RE,
    )
  })

  it('does not anonymize a user from another congregation — RLS isolation', async () => {
    const otherUserBefore = await testDb.userAccount.findUnique({
      where: { id: otherUserId },
      include: { member: true },
    })
    expect(otherUserBefore?.anonymizedAt).toBeNull()
    expect(otherUserBefore?.member?.firstname).toBe('Bob')

    // The primary scope must not be able to locate the other congregation's user
    await expect(withScope(primaryCongId, tx => anonymizeUser(tx, otherUserId as AccountId, 1))).rejects.toThrow(
      USER_NOT_FOUND_RE,
    )

    const otherUserAfter = await testDb.userAccount.findUnique({
      where: { id: otherUserId },
      include: { member: true },
    })
    expect(otherUserAfter?.member?.firstname).toBe('Bob')
    expect(otherUserAfter?.anonymizedAt).toBeNull()
  })
})

describe('anonymizeUser — attribution and group cleanup (integration)', () => {
  let deputyUserId: number
  let groupId: number

  beforeAll(async () => {
    await withScope(primaryCongId, async tx => {
      const responsibleMember = await tx.member.create({
        data: {
          firstname: 'Responsible',
          lastname: 'User',
          isPublisher: true,
          congregationId: primaryCongId,
        },
      })
      await tx.userAccount.create({
        data: {
          email: `anon-resp-${ts}@test.com`,
          password: 'hashed',
          active: true,
          memberId: responsibleMember.id,
          congregationId: primaryCongId,
        },
      })

      const deputyMember = await tx.member.create({
        data: {
          firstname: 'Deputy',
          lastname: 'User',
          isPublisher: true,
          congregationId: primaryCongId,
        },
      })
      const deputy = await tx.userAccount.create({
        data: {
          email: `anon-deputy-${ts}@test.com`,
          password: 'hashed',
          active: true,
          memberId: deputyMember.id,
          congregationId: primaryCongId,
        },
      })
      deputyUserId = deputy.id

      const group = await tx.publisherGroup.create({
        data: {
          name: `Group ${ts}`,
          adress: '1 rue Test',
          responsibleId: responsibleMember.id,
          deputyId: deputyMember.id,
          congregationId: primaryCongId,
        },
      })
      groupId = group.id

      const territory = await tx.territory.create({
        data: { number: `T-ANON-${ts}`, congregationId: primaryCongId },
      })

      await tx.attribution.create({
        data: {
          publisherId: deputyMember.id,
          territoryId: territory.id,
          lateDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          congregationId: primaryCongId,
        },
      })
    })
  })

  it('nulls out deputyId on publisher group when deputy is anonymized', async () => {
    await withScope(primaryCongId, tx => anonymizeUser(tx, deputyUserId as AccountId, 1))

    const group = await testDb.publisherGroup.findUnique({ where: { id: groupId } })
    expect(group?.deputyId).toBeNull()
  })

  it('closes open attributions for the anonymized user', async () => {
    const attributions = await withScope(primaryCongId, tx =>
      tx.attribution.findMany({ where: { publisherId: deputyUserId } }),
    )
    expect(attributions.every(a => a.endDate !== null)).toBe(true)
  })
})
