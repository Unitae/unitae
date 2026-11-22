import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EventOrigin } from '~/features/events/model/event-origin.type'
import { EMPTY_MEETING } from './empty-meetings.queries'

// EMPTY_MEETING decides which meetings the recurring job may move or delete: one created ahead with nothing in it. A
// duty is something in it (plan T12: the filter reads items, parts and duties alike), so a meeting holding only its
// duties is never empty.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('EMPTY_MEETING', () => {
  it('takes a meeting created ahead with nothing in it, never one holding a duty or a part', async () => {
    let empty: string[] | undefined
    try {
      await testDb.$transaction(async tx => {
        const stamp = `empty-filter-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const meeting = async (name: string) =>
          tx.event.create({
            data: {
              name,
              origin: EventOrigin.Job,
              startDate: new Date('2027-06-03T18:00:00Z'),
              endDate: new Date('2027-06-03T19:45:00Z'),
              congregationId,
            },
          })
        await meeting('Vide')
        const withDuty = await meeting('Avec un service')
        await tx.eventServicePart.create({ data: { name: 'Sono', eventId: withDuty.id, congregationId } })
        const withPart = await meeting('Avec une partie')
        await tx.eventPart.create({ data: { name: 'Discours', eventId: withPart.id, congregationId } })

        empty = (await tx.event.findMany({ where: { congregationId, ...EMPTY_MEETING }, select: { name: true } })).map(
          event => event.name,
        )
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }

    expect(empty).toEqual(['Vide'])
  })
})
