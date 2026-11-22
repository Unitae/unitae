import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { settleFixtureSchedules } from '~/tests/helpers/settle-fixture-schedules'

// Parts and duties share one table and one id space (plan T12, 5i-b): the assignment writers tell them apart by their
// schedule's kind, so a duty's id given to a part's writer, or the reverse, finds nothing and writes nothing. Against
// the database, in a congregation of its own, inside a transaction rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { assignPart, assignServicePart, unassignPart, unassignServicePart } = await import(
  './event-part-assignments.server'
)

class Rollback extends Error {}

interface Fixture {
  db: TransactionClient
  congregationId: number
  memberId: number
  partItemId: number
  dutyItemId: number
}

async function withMeeting(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(async tx => {
      const stamp = `assign-kind-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      const db = tx as unknown as TransactionClient
      const memberId = (await tx.member.create({ data: { firstname: 'Luc', lastname: 'ROUX', congregationId } })).id
      const event = await tx.event.create({
        data: {
          name: 'Réunion',
          startDate: new Date('2027-06-03T17:00:00Z'),
          endDate: new Date('2027-06-03T19:00:00Z'),
          congregationId,
        },
      })
      const part = await tx.eventPart.create({ data: { eventId: event.id, name: 'Discours', congregationId } })
      const duty = await tx.eventServicePart.create({
        data: { eventId: event.id, name: 'Sono', congregationId, assigneeId: memberId },
      })
      await settleFixtureSchedules(db, congregationId)
      const partItemId = (await tx.item.findUniqueOrThrow({ where: { legacyPartId: part.id } })).id
      const dutyItemId = (await tx.item.findUniqueOrThrow({ where: { legacyServiceId: duty.id } })).id
      await fn({ db, congregationId, memberId, partItemId, dutyItemId })
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('the assignment writers and the kind of an item', () => {
  it('refuse a duty given as a part, and a part given as a duty, writing nothing', async () => {
    await withMeeting(async ({ db, congregationId, memberId, partItemId, dutyItemId }) => {
      const before = await db.item.findMany({ where: { congregationId }, orderBy: { id: 'asc' } })

      expect(await assignPart(db, dutyItemId, null, null, null, 'Sujet', congregationId)).toHaveProperty('error')
      expect(await assignServicePart(db, partItemId, memberId, congregationId)).toHaveProperty('error')
      expect(await unassignPart(db, dutyItemId, congregationId)).toBeNull()
      expect(await unassignServicePart(db, partItemId, congregationId)).toBeNull()

      expect(await db.item.findMany({ where: { congregationId }, orderBy: { id: 'asc' } })).toEqual(before)
    })
  })

  it('write the item of their own kind', async () => {
    await withMeeting(async ({ db, congregationId, dutyItemId }) => {
      const result = await unassignServicePart(db, dutyItemId, congregationId)

      expect(result).not.toBeNull()
      expect((await db.item.findUniqueOrThrow({ where: { id: dutyItemId } })).assigneeId).toBeNull()
    })
  })
})
