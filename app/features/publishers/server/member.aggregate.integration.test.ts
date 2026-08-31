import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { MemberId } from '~/shared/types/branded'
import { PublisherType } from '~/shared/types/publisher-type'

const RESPONSIBLE_ERROR_RE = /responsible/i

// Audit is fire-and-forget; capture calls without touching the DB.
const auditMock = vi.fn()
vi.mock('~/shared/domain/audit.server', () => ({
  audit: (...args: unknown[]) => auditMock(...args),
  auditInTransaction: vi.fn(),
  AuditAction: {
    PublisherCreated: 'publisher.created',
    PublisherUpdated: 'publisher.updated',
    PublisherStatusChanged: 'publisher.status_changed',
    PublisherInactivated: 'publisher.inactivated',
    PublisherReactivated: 'publisher.reactivated',
    MemberLeft: 'member.left',
    MemberReturned: 'member.returned',
    UserAnonymized: 'user.anonymized',
  },
}))

// The aggregate calls createPasswordResetToken from ~/features/authentication
// when a Member is created with an email. Stub it out — the integration test
// is scoped to the aggregate's DB writes + audit surface, not to the auth
// side effect.
vi.mock('~/features/authentication', () => ({
  createPasswordResetToken: vi.fn(),
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
let congId: number
const congregationInfo = { id: 0, maxMembers: null, maxTerritories: null }

const memberAggregate = await import('./member.aggregate')
const { seedBuiltInRoles } = await import('~/shared/domain/setup.server')

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `MemAgg ${ts}`, slug: `mem-agg-${ts}`, active: true },
  })
  congId = cong.id
  congregationInfo.id = congId
  // syncBuiltInRoleAssignments requires the built-in Role rows to exist.
  await withScope(congId, tx => seedBuiltInRoles(tx, congId))
})

afterAll(async () => {
  await withScope(congId, async tx => {
    await tx.memberRoleAssignment.deleteMany({})
    await tx.userRoleAssignment.deleteMany({})
    await tx.rolePermission.deleteMany({})
    await tx.role.deleteMany({})
    await tx.userAccount.deleteMany({})
    await tx.member.deleteMany({})
    await tx.dataDeletionRecord.deleteMany({})
  })
  await testDb.congregation.deleteMany({ where: { id: congId } })
  await testDb.$disconnect()
})

// male + baptized so the DB check constraint permits isServant/isHelder
// in tests that flip those flags.
const baseFormParams = {
  firstname: 'Alice',
  lastname: 'Smith',
  email: '',
  gender: 'male',
  birthDate: null,
  baptismDate: '2010-05-15',
  isHelder: false,
  isServant: false,
  isAnointed: false,
  groupId: null,
  type: PublisherType.Normal,
  phone: '',
  address: '',
}

// setPioneerType and bulkUpdateType are gone with the Member.type column. What bulkUpdateType did
// for the permanent-auxiliary setting now lives in endOngoingEnrolmentsOfType, covered in
// pioneer-enrolment.workflow.integration.test.ts; setPioneerType has no successor because nothing
// caches the status any more.
describe('member.aggregate — integration', () => {
  it('createMember persists the row and audits PublisherCreated', async () => {
    auditMock.mockClear()
    const member = await withScope(congId, tx =>
      memberAggregate.createMember(tx, congregationInfo as never, {
        ...baseFormParams,
        firstname: `Create-${ts}`,
        congregationId: congId,
        actorId: 1,
      }),
    )
    const row = await testDb.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(row.firstname).toBe(`Create-${ts}`)
    expect(row.isPublisher).toBe(true)
    expect(row.isMale).toBe(true)
    expect(row.baptismDate).not.toBeNull()
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'publisher.created', entityId: member.id }),
    )
  })

  it('togglePublisher flips isPublisher and re-syncs identity roles', async () => {
    // No baptismDate — otherwise the member_baptism_requires_publisher DB
    // constraint blocks flipping isPublisher off.
    const member = await withScope(congId, tx =>
      memberAggregate.createMember(tx, congregationInfo as never, {
        ...baseFormParams,
        firstname: `Toggle-${ts}`,
        baptismDate: null,
        congregationId: congId,
        actorId: 1,
      }),
    )

    auditMock.mockClear()
    await withScope(congId, tx => memberAggregate.togglePublisher(tx, member.id as MemberId, congId, false, 1))

    const after = await testDb.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.isPublisher).toBe(false)
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'publisher.status_changed', metadata: { isPublisher: false } }),
    )
  })

  it('setLifecycle(left) stamps leftAt and drops built-in role assignments', async () => {
    const member = await withScope(congId, tx =>
      memberAggregate.createMember(tx, congregationInfo as never, {
        ...baseFormParams,
        firstname: `Left-${ts}`,
        isServant: true,
        congregationId: congId,
        actorId: 1,
      }),
    )
    const rolesBefore = await testDb.memberRoleAssignment.count({ where: { memberId: member.id } })
    expect(rolesBefore).toBeGreaterThan(0)

    auditMock.mockClear()
    await withScope(congId, tx => memberAggregate.setLifecycle(tx, member.id as MemberId, congId, 1, 'left'))

    const after = await testDb.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.leftAt).not.toBeNull()
    const rolesAfter = await testDb.memberRoleAssignment.count({ where: { memberId: member.id } })
    expect(rolesAfter).toBe(0)
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'member.left' }))
  })

  it('setLifecycle(returned) clears leftAt and re-attaches built-in role assignments', async () => {
    const member = await withScope(congId, tx =>
      memberAggregate.createMember(tx, congregationInfo as never, {
        ...baseFormParams,
        firstname: `Returned-${ts}`,
        isServant: true,
        congregationId: congId,
        actorId: 1,
      }),
    )
    await withScope(congId, tx => memberAggregate.setLifecycle(tx, member.id as MemberId, congId, 1, 'left'))

    auditMock.mockClear()
    await withScope(congId, tx => memberAggregate.setLifecycle(tx, member.id as MemberId, congId, 1, 'returned'))

    const after = await testDb.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.leftAt).toBeNull()
    const rolesAfter = await testDb.memberRoleAssignment.count({ where: { memberId: member.id } })
    expect(rolesAfter).toBeGreaterThan(0)
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'member.returned' }))
  })

  it('setLifecycle(inactive) stamps inactiveAt without touching role assignments', async () => {
    const member = await withScope(congId, tx =>
      memberAggregate.createMember(tx, congregationInfo as never, {
        ...baseFormParams,
        firstname: `Inactive-${ts}`,
        isServant: true,
        congregationId: congId,
        actorId: 1,
      }),
    )
    const rolesBefore = await testDb.memberRoleAssignment.count({ where: { memberId: member.id } })

    auditMock.mockClear()
    await withScope(congId, tx =>
      memberAggregate.setLifecycle(tx, member.id as MemberId, congId, 1, 'inactive', 'activity-created'),
    )

    const after = await testDb.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.inactiveAt).not.toBeNull()
    const rolesAfter = await testDb.memberRoleAssignment.count({ where: { memberId: member.id } })
    expect(rolesAfter).toBe(rolesBefore) // identity flags unchanged
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'publisher.inactivated', metadata: { trigger: 'activity-created' } }),
    )
  })

  it('anonymize scrubs PII, drops role assignments, and stamps a deletion record', async () => {
    const member = await withScope(congId, tx =>
      memberAggregate.createMember(tx, congregationInfo as never, {
        ...baseFormParams,
        firstname: `Anon-${ts}`,
        lastname: 'Original',
        phone: '0612345678',
        email: 'contact@example.com',
        isServant: true,
        congregationId: congId,
        actorId: 1,
      }),
    )

    auditMock.mockClear()
    await withScope(congId, tx => memberAggregate.anonymize(tx, member.id as MemberId, congId, 1))

    const after = await testDb.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.firstname).toBe('Utilisateur')
    expect(after.lastname).toBe('supprime')
    expect(after.phone).toBe('')
    expect(after.email).toBe('')
    expect(after.anonymizedAt).not.toBeNull()
    expect(after.leftAt).not.toBeNull()
    expect(after.isServant).toBe(false)
    const rolesAfter = await testDb.memberRoleAssignment.count({ where: { memberId: member.id } })
    expect(rolesAfter).toBe(0)
    const deletion = await testDb.dataDeletionRecord.findFirst({
      where: { entityType: 'Member', entityId: member.id, congregationId: congId },
    })
    expect(deletion).not.toBeNull()
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.anonymized' }))
  })

  it('anonymize nulls the member`s publisherGroupId (Wave 8 regression)', async () => {
    // Seed a group; make the member a plain group member.
    const responsible = await withScope(congId, tx =>
      memberAggregate.createMember(tx, congregationInfo as never, {
        ...baseFormParams,
        firstname: `GrpRespA-${ts}`,
        congregationId: congId,
        actorId: 1,
      }),
    )
    const grouped = await withScope(congId, tx =>
      memberAggregate.createMember(tx, congregationInfo as never, {
        ...baseFormParams,
        firstname: `Grouped-${ts}`,
        congregationId: congId,
        actorId: 1,
      }),
    )
    const group = await testDb.publisherGroup.create({
      data: { name: `WaveGroupA-${ts}`, adress: '', responsibleId: responsible.id, congregationId: congId },
    })
    await testDb.member.update({ where: { id: grouped.id }, data: { publisherGroupId: group.id } })

    await withScope(congId, tx => memberAggregate.anonymize(tx, grouped.id as MemberId, congId, 1))

    const after = await testDb.member.findUniqueOrThrow({ where: { id: grouped.id } })
    expect(after.publisherGroupId).toBeNull()
    // Cleanup: cannot delete a group whose responsible is anonymized — leave it.
    await testDb.publisherGroup.delete({ where: { id: group.id } })
  })

  it('anonymize refuses when the member is a group`s responsible (Wave 8 regression)', async () => {
    const responsible = await withScope(congId, tx =>
      memberAggregate.createMember(tx, congregationInfo as never, {
        ...baseFormParams,
        firstname: `GrpRespB-${ts}`,
        congregationId: congId,
        actorId: 1,
      }),
    )
    const group = await testDb.publisherGroup.create({
      data: { name: `WaveGroupB-${ts}`, adress: '', responsibleId: responsible.id, congregationId: congId },
    })

    await expect(
      withScope(congId, tx => memberAggregate.anonymize(tx, responsible.id as MemberId, congId, 1)),
    ).rejects.toThrow(RESPONSIBLE_ERROR_RE)

    // Untouched — no PII scrub, no deletion record, no anonymizedAt.
    const after = await testDb.member.findUniqueOrThrow({ where: { id: responsible.id } })
    expect(after.anonymizedAt).toBeNull()
    expect(after.firstname).toBe(`GrpRespB-${ts}`)

    await testDb.publisherGroup.delete({ where: { id: group.id } })
  })
})
