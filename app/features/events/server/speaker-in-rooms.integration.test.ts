import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedMeetingsInRooms } from '~/tests/helpers/rooms-fixture'

// An outside speaker's visits read from the rooms (parallel rooms R3): Anne speaks in « Salle B » of the first part,
// on a meeting of copies and on the same meeting with one item and a row per room. Both visits are found, and they are
// hers, not the part's main room's. In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { getSpeakerVisits, listSpeakerDirectory } = await import('./external-speakers.queries')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface Read {
  events: { copies: number; rows: number }
  partName: string
  visits: { eventId: number; partName: string }[]
  directory: Record<string, number>
}

describe('an outside speaker in another room', () => {
  it('has the visits of the room they speak in, whatever the shape', async () => {
    let read: Read | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `speaker-rooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          await seedDefaultTemplates(db, congregationId, 'fr')
          const kind = await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })
          await syncTemplateScheduleTemplates(db, kind.id, congregationId)
          const paul = (await tx.member.create({ data: { firstname: 'Paul', lastname: 'TEST', congregationId } })).id
          const speaker = async (name: string) =>
            (await tx.externalSpeaker.create({ data: { name, congregationId } })).id
          // Bruno speaks nowhere: a visit read from the part rather than its room would not reach him either.
          const [anne] = [await speaker('Anne'), await speaker('Bruno')]
          const seeded = await seedMeetingsInRooms(
            db,
            { kindId: kind.id, days: ['2099-03-04', '2099-03-11'], speakers: [paul, null] },
            { congregationId, actorId },
          )
          // Anne in « Salle B »: on the copies' through its copy (its trigger mirrors it), on the other through its row.
          await tx.item.updateMany({
            where: { eventId: seeded.copies, name: seeded.partName, assigneeId: null, track: { not: '' } },
            data: { externalSpeakerId: anne },
          })
          await tx.itemRoom.updateMany({
            where: { item: { eventId: seeded.rows, name: seeded.partName }, NOT: { room: { key: 'main' } } },
            data: { externalSpeakerId: anne },
          })
          const now = new Date('2099-03-01')
          const visits = await getSpeakerVisits(db, congregationId, anne, now)
          const directory = await listSpeakerDirectory(db, congregationId, now)
          read = {
            events: { copies: seeded.copies, rows: seeded.rows },
            partName: seeded.partName,
            visits: [...visits.upcoming, ...visits.past].map(({ eventId, partName }) => ({ eventId, partName })),
            directory: Object.fromEntries(directory.speakers.map(each => [each.name, each.visitCount])),
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (read == null) throw new Error('nothing read')
    expect(read.visits).toEqual([
      { eventId: read.events.copies, partName: read.partName },
      { eventId: read.events.rows, partName: read.partName },
    ])
    expect(read.directory).toEqual({ Anne: 2, Bruno: 0 })
  })
})
