import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// The congregation's absences page lists, under each absence, the assignments it clashes with. Several of one meeting
// are listed in the programme's order — its parts, then its services — not in whatever order the table returns them.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
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

const { listCongregationAbsences } = await import('./days-off.queries')

const ts = Date.now()
const ids = { cong: 0 }
const DAY = new Date('2027-03-16T18:00:00Z')

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({
      data: { name: `Absences order ${ts}`, slug: `absences-order-${ts}`, active: true },
    })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    const member = (await tx.member.create({ data: { firstname: 'Pierre', lastname: 'LEROY', congregationId } })).id
    await tx.absence.create({
      data: {
        startDate: new Date('2027-03-16T00:00:00Z'),
        endDate: new Date('2027-03-16T23:59:00Z'),
        memberId: member,
        congregationId,
      },
    })
    const event = await tx.event.create({
      data: { name: 'Réunion', startDate: DAY, endDate: DAY, status: 'released', congregationId },
    })
    const clash = { eventId: event.id, assigneeId: member, hasConflict: true, congregationId }
    // Created in an order the programme does not follow.
    for (const [name, order] of [
      ['Cantique de conclusion', 20],
      ['Lecture de la Bible', 10],
    ] as const) {
      await tx.eventPart.create({ data: { name, order, ...clash } })
    }
    for (const [name, order] of [
      ['Nettoyage', 5],
      ['Accueil', 0],
    ] as const) {
      await tx.eventServicePart.create({ data: { name, order, ...clash } })
    }
  })
})

afterAll(async () => {
  if (ids.cong) {
    await withScope(ids.cong, async tx => {
      await tx.absence.deleteMany({})
      await tx.event.deleteMany({})
      await tx.member.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: ids.cong } })
  }
  await testDb.$disconnect()
})

describe('listCongregationAbsences', () => {
  it('lists one meeting’s clashing parts then services, each in the programme’s order', async () => {
    const [absence] = await withScope(ids.cong, tx =>
      listCongregationAbsences(tx, {
        congregationId: ids.cong,
        from: new Date('2027-03-15T00:00:00Z'),
        to: new Date('2027-03-17T00:00:00Z'),
      }),
    )

    expect(absence.conflicts.map(conflict => conflict.name)).toEqual([
      'Lecture de la Bible',
      'Cantique de conclusion',
      'Accueil',
      'Nettoyage',
    ])
  })
})
