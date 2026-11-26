import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedMeetingsInRooms } from '~/tests/helpers/rooms-fixture'

// A programme's parts read with their rooms (ITEM_ROOMS) through `partsInRooms`: a meeting holding copies (today's
// writers) and the same meeting with one item and a row per room (R4's) read alike. In a congregation of its own,
// rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { ITEM_ROOMS } = await import('./item-rooms.queries')
const { partsInRooms } = await import('~/features/events/model/part-rooms')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('a programme’s parts read in their rooms', () => {
  it('reads a meeting of copies and the same meeting with a row per room alike', async () => {
    let read: { copies: unknown; rows: unknown; partName: string; paul: number; jean: number } | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `rooms-read-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          await seedDefaultTemplates(db, congregationId, 'fr')
          const kindId = (await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })).id
          await syncTemplateScheduleTemplates(db, kindId, congregationId)
          const person = async (firstname: string) =>
            (await tx.member.create({ data: { firstname, lastname: 'TEST', congregationId } })).id
          const [paul, jean] = [await person('Paul'), await person('Jean')]
          const seeded = await seedMeetingsInRooms(
            db,
            { kindId, days: ['2027-03-03', '2027-03-10'], speakers: [paul, jean] },
            { congregationId, actorId },
          )
          const partsOf = async (eventId: number) => {
            const items = await tx.item.findMany({
              where: { eventId, schedule: { kind: 'programme' } },
              orderBy: [{ order: 'asc' }, { id: 'asc' }],
              include: ITEM_ROOMS,
            })
            return partsInRooms(items).map(part => ({
              name: part.part.name,
              parallel: part.parallel,
              rooms: part.rooms.map(room => [room.room, room.isMain, room.assigneeId]),
            }))
          }
          read = {
            copies: await partsOf(seeded.copies),
            rows: await partsOf(seeded.rows),
            partName: seeded.partName,
            paul,
            jean,
          }
          throw new Rollback()
        },
        { timeout: 20_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (read == null) throw new Error('nothing read')
    expect(read.rows).toEqual(read.copies)
    // And what both read: the part once, in the main room and « Salle B », a speaker in each.
    const parts = read.copies as { name: string; parallel: boolean; rooms: unknown[] }[]
    expect(parts.find(part => part.name === read?.partName)).toEqual({
      name: read.partName,
      parallel: true,
      rooms: [
        ['Salle principale', true, read.paul],
        ['Salle B', false, read.jean],
      ],
    })
    expect(parts.filter(part => part.parallel)).toHaveLength(1)
  })
})
