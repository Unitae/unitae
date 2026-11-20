import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Absence.legacyEventId is @ignore: the client never names the column, so the migration that drops it cannot break a
// version still serving. Proved here by dropping it in a transaction that is rolled back, then using the client as the
// app does. Runs against DB_URL: dropping a column takes the schema owner.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('the absences without their legacy event column', () => {
  it('are written, read, counted, updated and deleted as the app does', async () => {
    let outcome: Record<string, unknown> | undefined
    try {
      await testDb.$transaction(async tx => {
        await tx.$executeRawUnsafe('ALTER TABLE "Absence" DROP COLUMN "legacyEventId"')
        const stamp = `no-legacy-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        const member = await tx.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })
        const day = new Date('2027-05-03T00:00:00Z')

        const created = await tx.absence.create({
          data: { startDate: day, endDate: day, memberId: member.id, congregationId },
        })
        await tx.absence.createMany({ data: [{ startDate: day, endDate: day, memberId: member.id, congregationId }] })
        const all = await tx.absence.findMany({ where: { congregationId } })
        const one = await tx.absence.findFirst({ where: { id: created.id } })
        const withRecord = await tx.member.findFirst({
          where: { id: member.id },
          include: { absences: true, _count: { select: { absences: true } } },
        })
        await tx.absence.update({
          where: { id_congregationId: { id: created.id, congregationId } },
          data: { note: 'Vacances' },
        })
        const deleted = await tx.absence.deleteMany({ where: { congregationId } })

        outcome = {
          created: created.id > 0,
          read: all.length,
          one: one?.id === created.id,
          included: withRecord?.absences.length,
          counted: withRecord?._count.absences,
          deleted: deleted.count,
        }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }

    expect(outcome).toEqual({ created: true, read: 2, one: true, included: 2, counted: 2, deleted: 2 })
  })
})
