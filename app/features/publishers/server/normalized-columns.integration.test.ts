/**
 * Confirms the normalized search columns (`firstnameNormalized`,
 * `lastnameNormalized`) actually land on disk through every Member write
 * path the PR touched — not just that the value was passed to the Prisma
 * mock. A regression here would silently break accent-insensitive name
 * search.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {
    PublisherCreated: 'publisher.created',
    PublisherUpdated: 'publisher.updated',
    UserAnonymized: 'user.anonymized',
    AccountLinkedToMember: 'account.linked_to_member',
    UserUpdated: 'user.updated',
    RoleAssignmentsSynced: 'role.assignments.synced',
  },
}))

vi.mock('~/features/authentication/server/invalidate-account-password.server', () => ({
  createPasswordResetToken: vi.fn(async () => 'fake-token'),
}))

const { seedBuiltInRoles } = await import('~/shared/domain/setup.server')
const { createMember } = await import('./create-member.server')
const { updateMember } = await import('./update-member.server')
const { anonymizeMember } = await import('~/features/settings/server/anonymize-member.server')

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
let congregationId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `NormalizedCols ${ts}`, slug: `normalized-cols-${ts}`, active: true },
  })
  congregationId = cong.id
  await seedBuiltInRoles(testDb, congregationId)
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.dataDeletionRecord.deleteMany({})
    await tx.memberRoleAssignment.deleteMany({})
    await tx.userRoleAssignment.deleteMany({})
    await tx.role.deleteMany({})
    await tx.userAccount.deleteMany({})
    await tx.member.deleteMany({})
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

const baseParams = {
  email: '',
  gender: 'male',
  birthDate: null,
  baptismDate: '2010-01-01',
  isHelder: false,
  isServant: false,
  isAnointed: false,
  groupId: null,
  type: PublisherType.Normal,
  phone: '',
  address: '',
} as const

describe('Member normalized columns — write-through', () => {
  it('createMember writes diacritic-stripped firstname/lastname to disk', async () => {
    const member = await withScope(congregationId, tx =>
      createMember(tx, { id: congregationId, name: 'NormalizedCols', plan: 'free' } as never, {
        ...baseParams,
        firstname: 'François',
        lastname: 'Péréz',
        actorId: 1,
        congregationId,
      }),
    )

    const row = await testDb.member.findUnique({
      where: { id: member.id },
      select: { firstnameNormalized: true, lastnameNormalized: true },
    })

    expect(row).toEqual({ firstnameNormalized: 'francois', lastnameNormalized: 'perez' })
  })

  it('updateMember refreshes the normalized columns when the name changes', async () => {
    const created = await withScope(congregationId, tx =>
      createMember(tx, { id: congregationId, name: 'NormalizedCols', plan: 'free' } as never, {
        ...baseParams,
        firstname: 'Anne',
        lastname: 'Initial',
        actorId: 1,
        congregationId,
      }),
    )

    await withScope(congregationId, tx =>
      updateMember(tx, created.id, congregationId, 1, {
        ...baseParams,
        firstname: 'Hélène',
        lastname: 'Côté',
      }),
    )

    const row = await testDb.member.findUnique({
      where: { id: created.id },
      select: { firstnameNormalized: true, lastnameNormalized: true },
    })

    expect(row).toEqual({ firstnameNormalized: 'helene', lastnameNormalized: 'cote' })
  })

  it('anonymizeMember overwrites the normalized columns with the scrub placeholder', async () => {
    const created = await withScope(congregationId, tx =>
      createMember(tx, { id: congregationId, name: 'NormalizedCols', plan: 'free' } as never, {
        ...baseParams,
        firstname: 'Sébastien',
        lastname: 'Roux',
        actorId: 1,
        congregationId,
      }),
    )

    await withScope(congregationId, tx => anonymizeMember(tx, created.id as never, congregationId, 1))

    const row = await testDb.member.findUnique({
      where: { id: created.id },
      select: { firstnameNormalized: true, lastnameNormalized: true, firstname: true, lastname: true },
    })

    expect(row?.firstname).toBe('Utilisateur')
    expect(row?.lastname).toBe('supprime')
    expect(row?.firstnameNormalized).toBe('utilisateur')
    expect(row?.lastnameNormalized).toBe('supprime')
  })
})
