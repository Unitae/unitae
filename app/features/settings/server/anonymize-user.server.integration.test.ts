import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { UserId } from '~/shared/types/branded'

const ANONYMIZED_EMAIL_RE = /^deleted-.+@anonymized\.local$/
const ALREADY_ANONYMIZED_RE = /deja anonymise/
const USER_NOT_FOUND_RE = /introuvable/

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
let otherUserId: number
let adminPermissionId: number

const { anonymizeUser } = await import('./anonymize-user.server')

beforeAll(async () => {
  const adminPermission = await testDb.permission.findFirst({ where: { key: 'admin' } })
  if (!adminPermission) throw new Error('Permission "admin" not found — run pnpm prisma db seed first')
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

    await tx.congregationUserPermission.create({
      data: { userId: user.id, permissionId: adminPermissionId, congregationId: primaryCongId },
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
      await tx.congregationUserPermission.deleteMany({})
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
    await withScope(primaryCongId, tx => anonymizeUser(tx, primaryUserId as UserId, 'admin@test.com'))

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
  })

  it('deletes congregation roles for the anonymized user', async () => {
    const roles = await testDb.congregationUserPermission.findMany({ where: { userId: primaryUserId } })
    expect(roles).toHaveLength(0)
  })

  it('creates a data deletion record for GDPR compliance', async () => {
    const record = await testDb.dataDeletionRecord.findFirst({ where: { entityId: primaryUserId } })
    expect(record).not.toBeNull()
    expect(record?.entityType).toBe('User')
    expect(record?.congregationId).toBe(primaryCongId)
  })

  it('throws when the user is already anonymized', async () => {
    await expect(
      withScope(primaryCongId, tx => anonymizeUser(tx, primaryUserId as UserId, 'admin@test.com')),
    ).rejects.toThrow(ALREADY_ANONYMIZED_RE)
  })

  it('throws when the user does not exist', async () => {
    await expect(withScope(primaryCongId, tx => anonymizeUser(tx, 999999 as UserId, 'admin@test.com'))).rejects.toThrow(
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
    await expect(
      withScope(primaryCongId, tx => anonymizeUser(tx, otherUserId as UserId, 'admin@test.com')),
    ).rejects.toThrow(USER_NOT_FOUND_RE)

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
    await withScope(primaryCongId, tx => anonymizeUser(tx, deputyUserId as UserId, 'admin@test.com'))

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
