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
let publisherId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `UpdatePub ${ts}`, slug: `update-pub-${ts}`, active: true },
  })
  congregationId = cong.id

  await seedBuiltInRoles(testDb, congregationId)

  const user = await testDb.userAccount.create({
    data: {
      email: `update-pub-${ts}@test.com`,
      password: 'hashed',
      firstname: 'Charlie',
      lastname: 'Wiring',
      active: true,
      isPublisher: true,
      isMale: true,
      type: PublisherType.Normal,
      congregationId,
    },
  })
  publisherId = user.id
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.userRoleAssignment.deleteMany({})
    await tx.role.deleteMany({})
    await tx.userAccount.deleteMany({})
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('updatePublisher (integration) — built-in role wiring', () => {
  it('adds the elder role assignment when isHelder flips to true', async () => {
    await withScope(congregationId, tx =>
      updatePublisher(tx, publisherId, congregationId, publisherId, {
        firstname: 'Charlie',
        lastname: 'Wiring',
        email: `update-pub-${ts}@test.com`,
        gender: 'male',
        birthDate: null,
        baptismDate: null,
        isHelder: true,
        isServant: false,
        isAnointed: false,
        groupId: null,
        type: PublisherType.Normal,
        phone: '',
        address: '',
      }),
    )

    const keys = (await testDb.userRoleAssignment.findMany({ where: { userId: publisherId }, include: { role: true } }))
      .map(a => a.role.key)
      .sort()
    expect(keys).toContain('elder')
  })

  it('removes the elder role assignment when isHelder flips back to false', async () => {
    await withScope(congregationId, tx =>
      updatePublisher(tx, publisherId, congregationId, publisherId, {
        firstname: 'Charlie',
        lastname: 'Wiring',
        email: `update-pub-${ts}@test.com`,
        gender: 'male',
        birthDate: null,
        baptismDate: null,
        isHelder: false,
        isServant: false,
        isAnointed: false,
        groupId: null,
        type: PublisherType.Normal,
        phone: '',
        address: '',
      }),
    )

    const keys = (await testDb.userRoleAssignment.findMany({ where: { userId: publisherId }, include: { role: true } }))
      .map(a => a.role.key)
      .sort()
    expect(keys).not.toContain('elder')
  })
})
