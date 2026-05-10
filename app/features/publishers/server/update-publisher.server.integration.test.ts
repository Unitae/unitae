import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {
    PublisherUpdated: 'publisher.updated',
    RoleAssignmentsSynced: 'role.assignments.synced',
  },
}))

const { seedBuiltInRoles } = await import('~/shared/domain/setup.server')
const { updatePublisher } = await import('./update-publisher.server')

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
// `publisherId` is a Member id — `updatePublisher` operates on Member.
let publisherId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `UpdatePub ${ts}`, slug: `update-pub-${ts}`, active: true },
  })
  congregationId = cong.id

  await seedBuiltInRoles(testDb, congregationId)

  const member = await testDb.member.create({
    data: {
      firstname: 'Charlie',
      lastname: 'Wiring',
      isPublisher: true,
      isMale: true,
      // Elder + brother require baptism per the CHECK
      baptismDate: new Date('2010-01-01'),
      type: PublisherType.Normal,
      congregationId,
    },
  })
  publisherId = member.id
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
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
  firstname: 'Charlie',
  lastname: 'Wiring',
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
}

describe('updatePublisher (integration) — built-in role wiring', () => {
  it('adds the elder role assignment when isHelder flips to true', async () => {
    await withScope(congregationId, tx =>
      updatePublisher(tx, publisherId, congregationId, publisherId, { ...baseParams, isHelder: true }),
    )

    const keys = (
      await testDb.memberRoleAssignment.findMany({ where: { memberId: publisherId }, include: { role: true } })
    )
      .map(a => a.role.key)
      .sort()
    expect(keys).toContain('elder')
  })

  it('removes the elder role assignment when isHelder flips back to false', async () => {
    await withScope(congregationId, tx =>
      updatePublisher(tx, publisherId, congregationId, publisherId, { ...baseParams, isHelder: false }),
    )

    const keys = (
      await testDb.memberRoleAssignment.findMany({ where: { memberId: publisherId }, include: { role: true } })
    )
      .map(a => a.role.key)
      .sort()
    expect(keys).not.toContain('elder')
  })
})
