import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedMeetingsInRooms } from '~/tests/helpers/rooms-fixture'

// Cadence reads the rooms (parallel rooms R4, before its writers): who is saved on the room being assigned, the name a
// dot shows (that room's, matched by name), a turn an outside speaker gave in « Salle B », and « elsewhere at this
// meeting » leaving out that room alone. A part in two rooms, Paul in the main room and Marc in « Salle B », on the
// fixture's meeting with one item and a row per room. In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { resolvePublisherCadence } = await import('./resolve-publisher-cadence.server')
const { resolveExternalSpeakerCadence } = await import('./resolve-external-speaker-cadence.server')
const { listUserSameEventAssignments } = await import('./list-user-same-event-assignments.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface Read {
  /** Marc as the one saved: on « Salle B », and on the main room (none named). */
  savedSecond: boolean
  savedMain: boolean
  /** The name the rows meeting's dot shows, read for a meeting after it, assigning « Salle B » then the main room. */
  dotSecond: string | null
  dotMain: string | null
  /** The outside speaker on « Salle B »: saved there, and the rows meeting's dot filled for him. */
  speakerSaved: boolean
  speakerDot: boolean
  /** Paul's other assignments at the meeting while « Salle B » is edited, then the main room. */
  paulElsewhereSecond: number
  paulElsewhereMain: number
}

async function read(): Promise<Read> {
  let out: Read | undefined
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `cadence-rooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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
        const paul = await person('Paul')
        const marc = await person('Marc')
        const seeded = await seedMeetingsInRooms(
          db,
          { kindId: kind.id, days: ['2099-03-04', '2099-03-11'], speakers: [paul, marc] },
          { congregationId, actorId },
        )
        const part = await tx.item.findFirstOrThrow({
          where: { eventId: seeded.rows, rooms: { some: { assigneeId: marc } } },
          select: { id: true, rooms: { select: { roomId: true, room: { select: { key: true } } } } },
        })
        const salleB = part.rooms.find(row => row.room.key !== 'main')?.roomId ?? null
        const event = await tx.event.findFirstOrThrow({ where: { id: seeded.rows } })
        const later = await tx.event.create({
          data: {
            name: 'Plus tard',
            templateId: kind.id,
            startDate: new Date('2099-04-01T18:00:00Z'),
            endDate: new Date('2099-04-01T20:00:00Z'),
            congregationId,
          },
        })
        const laterSchedule = await tx.schedule.create({
          data: { eventId: later.id, kind: 'programme', order: 0, name: 'Programme', congregationId },
        })
        const laterPart = await tx.item.create({
          data: {
            eventId: later.id,
            scheduleId: laterSchedule.id,
            name: seeded.partName,
            section: seeded.partSection,
            congregationId,
          },
        })
        const publisher = (userId: number, eventRow: typeof event, itemId: number, roomId: number | null) =>
          resolvePublisherCadence(db, {
            userId,
            event: eventRow,
            congregationId,
            excludePartAssignmentId: itemId,
            excludeServiceAssignmentId: null,
            partSlot: 'assignee',
            roomId,
          })
        const savedSecond = (await publisher(marc, event, part.id, salleB)).savedMatchesSelection
        const savedMain = (await publisher(marc, event, part.id, null)).savedMatchesSelection
        // The dot of the rows meeting, read from the meeting after it, assigning « Salle B » then the main room.
        const anchor = laterPart.id
        const anchorEvent = later
        // Its own « Salle B » (rooms are a meeting's): the dot names the earlier meeting's room of the same name.
        const laterSalleB = await tx.scheduleRoom.create({
          data: { scheduleId: laterSchedule.id, name: 'Salle B', order: 1, congregationId },
        })
        await tx.itemRoom.create({ data: { itemId: laterPart.id, roomId: laterSalleB.id, congregationId } })
        const dotOf = async (roomId: number | null) =>
          (await publisher(paul, anchorEvent, anchor, roomId)).past.find(
            entry => entry.date.slice(0, 10) === '2099-03-11',
          )?.personName ?? null
        const speaker = (await tx.externalSpeaker.create({ data: { name: 'Orateur', congregationId } })).id
        await tx.itemRoom.updateMany({
          where: { assigneeId: marc, item: { eventId: seeded.rows } },
          data: { externalSpeakerId: speaker },
        })
        const speakerCadence = (eventRow: typeof event, itemId: number, roomId: number | null) =>
          resolveExternalSpeakerCadence(db, {
            externalSpeakerId: speaker,
            event: eventRow,
            congregationId,
            excludePartAssignmentId: itemId,
            roomId,
          })
        const elsewhereOf = async (roomId: number | null) =>
          (
            await listUserSameEventAssignments(db, {
              userId: paul,
              eventId: seeded.rows,
              congregationId,
              excludePartAssignmentId: part.id,
              roomId,
            })
          ).length
        out = {
          savedSecond,
          savedMain,
          dotSecond: await dotOf(laterSalleB.id),
          dotMain: await dotOf(null),
          speakerSaved: (await speakerCadence(event, part.id, salleB)).savedMatchesSelection,
          speakerDot:
            (await speakerCadence(anchorEvent, anchor, null)).past.find(
              entry => entry.date.slice(0, 10) === '2099-03-11',
            )?.assigned ?? false,
          paulElsewhereSecond: await elsewhereOf(salleB),
          paulElsewhereMain: await elsewhereOf(null),
        }
        throw new Rollback()
      },
      { timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  if (out == null) throw new Error('nothing read')
  return out
}

describe('cadence, a part held in two rooms', () => {
  it('reads who is saved on the room being assigned, and names that room’s person on a dot', async () => {
    const r = await read()
    expect([r.savedSecond, r.savedMain]).toEqual([true, false])
    expect([r.dotSecond, r.dotMain]).toEqual(['Marc TEST', 'Paul TEST'])
  })

  it('reads an outside speaker’s turn in « Salle B »', async () => {
    const r = await read()
    expect([r.speakerSaved, r.speakerDot]).toEqual([true, true])
  })

  it('leaves out only the room being assigned from the person’s other assignments at the meeting', async () => {
    const r = await read()
    // Paul holds the main room: while « Salle B » is edited, that is another assignment; while his own, it is not.
    expect([r.paulElsewhereSecond, r.paulElsewhereMain]).toEqual([1, 0])
  })
})
