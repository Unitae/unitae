import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedMeetingsInRooms } from '~/tests/helpers/rooms-fixture'

// One line per part reads its main room (parallel rooms R4, before its writers): the meeting page's data and the
// archive read a part's people from its rows, which R4's writers write alone (no dual-write). On the rooms fixture's
// meeting with one item and a row per room, Paul holds the main room and Marc « Salle B »; a part in one room whose row
// holds Jean, unlike its item, reads Jean. In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { getEventProgramme } = await import('./event-part-assignments.server')
const { buildExportSteps } = await import('~/features/settings/server/export-congregation.server')
const { deleteExternalSpeaker } = await import('./external-speakers.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface Read {
  page: { inRooms?: string; oneRoom?: string }
  archive: { inRooms?: number | null; oneRoom?: number | null }
  ids: { paul: number; jean: number }
  /** The past talks deleting a retired outside speaker counts, who held « Salle B » of a past meeting. */
  pastTalks: number
}

async function read(): Promise<Read> {
  let out: Read | undefined
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `programme-rooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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
        const jean = await person('Jean')
        const seeded = await seedMeetingsInRooms(
          db,
          { kindId: kind.id, days: ['2099-03-04', '2099-03-11'], speakers: [paul, marc] },
          { congregationId, actorId },
        )
        const inRooms = await tx.item.findFirstOrThrow({
          where: { eventId: seeded.rows, rooms: { some: { assigneeId: marc } } },
          select: { id: true },
        })
        const oneRoom = await tx.item.findFirstOrThrow({
          where: { eventId: seeded.rows, track: '', schedule: { kind: 'programme' }, id: { not: inRooms.id } },
          select: { id: true, rooms: { select: { id: true } } },
          orderBy: { order: 'asc' },
        })
        if (oneRoom.rooms.length !== 1) throw new Error('not a one-room part')
        await tx.itemRoom.update({ where: { id: oneRoom.rooms[0].id }, data: { assigneeId: jean } })

        const programme = await getEventProgramme(db, seeded.rows, congregationId)
        const firstname = (id: number) =>
          (programme?.eventParts.find(part => part.id === id)?.assignee as { firstname?: string } | null)?.firstname
        const step = buildExportSteps(db, congregationId, { includeFiles: false, includeAuditLogs: false }).find(
          each => each.name === 'programme-part-assignments',
        )
        const rows = ((await step?.export()) ?? []) as { id: number; assigneeId: number | null }[]
        const assigneeOf = (id: number) => rows.find(row => row.id === id)?.assigneeId
        // A past meeting whose « Salle B » an outside speaker held, retired since.
        const speaker = (
          await tx.externalSpeaker.create({ data: { name: 'Orateur', archivedAt: new Date(), congregationId } })
        ).id
        await tx.event.update({ where: { id: seeded.rows }, data: { startDate: new Date('2020-03-04T18:00:00Z') } })
        await tx.itemRoom.updateMany({
          where: { assigneeId: marc, item: { eventId: seeded.rows } },
          data: { externalSpeakerId: speaker },
        })
        const deleted = await deleteExternalSpeaker(db, speaker, congregationId, actorId)
        out = {
          pastTalks: deleted.pastParts,
          page: { inRooms: firstname(inRooms.id), oneRoom: firstname(oneRoom.id) },
          archive: { inRooms: assigneeOf(inRooms.id), oneRoom: assigneeOf(oneRoom.id) },
          ids: { paul, jean },
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

describe('one line per part, a meeting with a row per room', () => {
  it('reads the main room of a part in two rooms, and the row of a part in one, on the page and in the archive', async () => {
    const { page, archive, ids } = await read()
    expect(page).toEqual({ inRooms: 'Paul', oneRoom: 'Jean' })
    expect(archive).toEqual({ inRooms: ids.paul, oneRoom: ids.jean })
  })

  it('counts the past talk an outside speaker gave in « Salle B »', async () => {
    expect((await read()).pastTalks).toBe(1)
  })
})
