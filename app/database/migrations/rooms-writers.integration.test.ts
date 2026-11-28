import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedMeetingsInRooms } from '~/tests/helpers/rooms-fixture'

// 20261204090000_rooms_writers: the Item_room trigger once R4's writers put a part's people on its rows alone. A part
// with a row per room takes a write of the item's people (a version still running) on its main room's row only and
// never fails on its track; a part in one room takes only the columns that changed (its row may hold newer people than
// its item). CI applies the migration before the suite. On the rooms
// fixture's meeting with one item and a row per room (Paul in the main room, Marc in « Salle B »), rolled back.

const runtime = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')

class Rollback extends Error {}

afterAll(async () => {
  await runtime.$disconnect()
})

interface Fixture {
  tx: TransactionClient
  people: { paul: number; marc: number; jean: number }
  /** The part held in two rooms, its rows by room. */
  inRooms: { id: number; main: number; second: number }
  /** A part in one room, its one row. */
  oneRoom: { id: number; row: number }
}

async function inFixture<T>(fn: (fixture: Fixture) => Promise<T>): Promise<T> {
  let result: T | undefined
  try {
    await runtime.$transaction(
      async raw => {
        const tx = raw as unknown as TransactionClient
        const stamp = `rooms-writers-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const actorId = (
          await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
        ).id
        await seedDefaultTemplates(tx, congregationId, 'fr')
        const kind = await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })
        await syncTemplateScheduleTemplates(tx, kind.id, congregationId)
        const person = async (firstname: string) =>
          (await tx.member.create({ data: { firstname, lastname: 'TEST', congregationId } })).id
        const people = { paul: await person('Paul'), marc: await person('Marc'), jean: await person('Jean') }
        const seeded = await seedMeetingsInRooms(
          tx,
          { kindId: kind.id, days: ['2099-03-04', '2099-03-11'], speakers: [people.paul, people.marc] },
          { congregationId, actorId },
        )
        const part = await tx.item.findFirstOrThrow({
          where: { eventId: seeded.rows, rooms: { some: { assigneeId: people.marc } } },
          select: { id: true, rooms: { select: { id: true, room: { select: { key: true } } } } },
        })
        const one = await tx.item.findFirstOrThrow({
          where: { eventId: seeded.rows, track: '', schedule: { kind: 'programme' }, id: { not: part.id } },
          select: { id: true, rooms: { select: { id: true } } },
          orderBy: { order: 'asc' },
        })
        const mainRow = part.rooms.find(row => row.room.key === 'main')?.id ?? 0
        const secondRow = part.rooms.find(row => row.room.key !== 'main')?.id ?? 0
        result = await fn({
          tx,
          people,
          inRooms: { id: part.id, main: mainRow, second: secondRow },
          oneRoom: { id: one.id, row: one.rooms[0]?.id ?? 0 },
        })
        throw new Rollback()
      },
      { timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return result as T
}

const peopleOf = (tx: TransactionClient, rowId: number) =>
  tx.itemRoom.findUniqueOrThrow({
    where: { id: rowId },
    select: { assigneeId: true, assistantId: true, externalSpeakerId: true, hasConflict: true },
  })

describe('a part with a row per room, written the old way', () => {
  it('puts a new speaker on its main room’s row alone', async () => {
    const read = await inFixture(async ({ tx, people, inRooms }) => {
      await tx.item.update({ where: { id: inRooms.id }, data: { assigneeId: people.jean } })
      return { main: await peopleOf(tx, inRooms.main), second: await peopleOf(tx, inRooms.second), people }
    })
    expect(read.main.assigneeId).toBe(read.people.jean)
    expect(read.second.assigneeId).toBe(read.people.marc)
  })

  it('flags its main room alone, the people of both rows kept', async () => {
    const read = await inFixture(async ({ tx, people, inRooms }) => {
      await tx.item.update({ where: { id: inRooms.id }, data: { hasConflict: true } })
      return { main: await peopleOf(tx, inRooms.main), second: await peopleOf(tx, inRooms.second), people }
    })
    expect(read.main).toMatchObject({ assigneeId: read.people.paul, hasConflict: true })
    expect(read.second).toMatchObject({ assigneeId: read.people.marc, hasConflict: false })
  })

  it('takes a write of its track without failing, its rows where they were', async () => {
    const read = await inFixture(async ({ tx, inRooms }) => {
      await tx.item.update({ where: { id: inRooms.id }, data: { track: 'Salle C', trackOrder: 3 } })
      return tx.itemRoom.count({ where: { itemId: inRooms.id } })
    })
    expect(read).toBe(2)
  })
})

describe('a part in one room', () => {
  it('takes only the columns a write changed: a conflict flagged keeps the row’s newer speaker', async () => {
    const read = await inFixture(async ({ tx, people, oneRoom }) => {
      // R4's writer put Jean on the row; the item still says nobody.
      await tx.itemRoom.update({ where: { id: oneRoom.row }, data: { assigneeId: people.jean } })
      await tx.item.update({ where: { id: oneRoom.id }, data: { hasConflict: true } })
      return { row: await peopleOf(tx, oneRoom.row), people }
    })
    expect(read.row).toMatchObject({ assigneeId: read.people.jean, hasConflict: true })
  })
})
