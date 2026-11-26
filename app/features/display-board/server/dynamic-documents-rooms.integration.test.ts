import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedMeetingsInRooms } from '~/tests/helpers/rooms-fixture'

// The programme document reads a part held in several rooms the same whatever its shape (parallel rooms R3): a
// meeting of copies, as the app writes it today, and the same meeting with one item and a row per room, as R4 will.
// In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { getDynamicDocumentData } = await import('./dynamic-documents.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('the programme document, a part in two rooms', () => {
  it('reads a meeting of copies and the same meeting with a row per room alike', async () => {
    let read: { copies: unknown; rows: unknown } | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `board-rooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          await seedDefaultTemplates(db, congregationId, 'fr')
          const kind = await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })
          await syncTemplateScheduleTemplates(db, kind.id, congregationId)
          const person = async (firstname: string) =>
            (await tx.member.create({ data: { firstname, lastname: 'TEST', congregationId } })).id
          const seeded = await seedMeetingsInRooms(
            db,
            {
              kindId: kind.id,
              days: ['2027-03-03', '2027-03-10'],
              speakers: [await person('Paul'), await person('Jean')],
            },
            { congregationId, actorId },
          )
          // Published, as the board shows nothing else.
          await tx.event.updateMany({
            where: { id: { in: [seeded.copies, seeded.rows] } },
            data: { status: 'released' },
          })
          await tx.schedule.updateMany({
            where: { eventId: { in: [seeded.copies, seeded.rows] } },
            data: { status: 'published' },
          })
          const data = await getDynamicDocumentData(db, DynamicType.Programme, kind.key, congregationId)
          if (data?.type !== DynamicType.Programme || data.events == null) throw new Error('not a programme')
          const partsOf = (eventId: number) =>
            data.events
              .find(event => event.id === eventId)
              ?.eventParts.map(part => ({
                name: part.name,
                section: part.section,
                order: part.order,
                track: part.track,
                trackOrder: part.trackOrder,
                assignee: part.assignee?.firstname ?? null,
              }))
          read = { copies: partsOf(seeded.copies), rows: partsOf(seeded.rows) }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (read == null) throw new Error('nothing read')
    expect(read.copies).toBeDefined()
    expect(read.rows).toEqual(read.copies)
    // The part in both rooms, a speaker in each, as the board draws copies sharing an order.
    expect((read.copies as { track: string; assignee: string | null }[]).filter(part => part.track !== '')).toEqual([
      expect.objectContaining({ track: 'Salle principale', assignee: 'Paul' }),
      expect.objectContaining({ track: 'Salle B', assignee: 'Jean' }),
    ])
  })
})
