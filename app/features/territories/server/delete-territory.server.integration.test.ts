import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: { TerritoryDeleted: 'territory.deleted' },
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

const { deleteTerritory } = await import('./delete-territory.server')

beforeAll(async () => {
  const primaryCong = await testDb.congregation.create({
    data: { name: `DeleteTerritory Primary ${ts}`, slug: `del-terr-primary-${ts}`, active: true },
  })
  primaryCongId = primaryCong.id

  const otherCong = await testDb.congregation.create({
    data: { name: `DeleteTerritory Other ${ts}`, slug: `del-terr-other-${ts}`, active: true },
  })
  otherCongId = otherCong.id

  await withScope(primaryCongId, async tx => {
    const member = await tx.member.create({
      data: {
        firstname: 'Alice',
        lastname: 'Primary',
        isPublisher: true,
        congregationId: primaryCongId,
      },
    })
    primaryUserId = member.id
  })
})

afterAll(async () => {
  for (const congId of [primaryCongId, otherCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.attribution.deleteMany({})
      await tx.territory.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('deleteTerritory (integration)', () => {
  it('deletes a territory from the correct congregation', async () => {
    const territory = await withScope(primaryCongId, tx =>
      tx.territory.create({ data: { number: `T-DEL-1-${ts}`, congregationId: primaryCongId } }),
    )

    await withScope(primaryCongId, tx => deleteTerritory(tx, territory.id, primaryCongId, primaryUserId))

    const found = await testDb.territory.findUnique({ where: { id: territory.id } })
    expect(found).toBeNull()
  })

  it('cannot delete a territory belonging to another congregation — compound key guard', async () => {
    const otherTerritory = await withScope(otherCongId, tx =>
      tx.territory.create({ data: { number: `T-DEL-OTHER-${ts}`, congregationId: otherCongId } }),
    )

    // Attempting to delete with wrong congregationId fails due to compound unique key constraint
    await expect(
      withScope(primaryCongId, tx => deleteTerritory(tx, otherTerritory.id, primaryCongId, primaryUserId)),
    ).rejects.toThrow()

    // Territory must still exist in other congregation
    const found = await testDb.territory.findUnique({ where: { id: otherTerritory.id } })
    expect(found).not.toBeNull()
  })

  it('throws when deleting a territory that has open attributions — FK constraint', async () => {
    const territory = await withScope(primaryCongId, tx =>
      tx.territory.create({ data: { number: `T-DEL-FK-${ts}`, congregationId: primaryCongId } }),
    )

    await withScope(primaryCongId, tx =>
      tx.attribution.create({
        data: {
          publisherId: primaryUserId,
          territoryId: territory.id,
          lateDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          congregationId: primaryCongId,
        },
      }),
    )

    // Attribution has no onDelete: Cascade — must close attributions before deleting territory
    await expect(
      withScope(primaryCongId, tx => deleteTerritory(tx, territory.id, primaryCongId, primaryUserId)),
    ).rejects.toThrow()

    // Territory must still exist since the delete was rejected
    const found = await testDb.territory.findUnique({ where: { id: territory.id } })
    expect(found).not.toBeNull()

    // Cleanup — close attribution then delete territory
    await withScope(primaryCongId, async tx => {
      await tx.attribution.updateMany({ where: { territoryId: territory.id }, data: { endDate: new Date() } })
    })
    await withScope(primaryCongId, async tx => {
      await tx.attribution.deleteMany({ where: { territoryId: territory.id } })
      await tx.territory.delete({ where: { id: territory.id } })
    })
  })
})
