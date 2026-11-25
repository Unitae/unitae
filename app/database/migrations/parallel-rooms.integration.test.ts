import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// 20261129090000_parallel_rooms: rooms for every programme schedule template and schedule, a room row for every
// template part and meeting part, kept in step by triggers while today's code writes `track` copies. CI applies the
// migration before the suite, so the tables and triggers exist: the trigger path is exercised by writing rows the way
// today's code does, and the backfill by deleting a fixture's rooms and running the shipped backfill statements again.

// The owner runs migrations; the app's own role writes through tenant isolation, so the triggers run as it too.
const owner = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 }),
})
const runtime = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect()])
})

// The shipped backfill (section 4), statement by statement: plain INSERT/UPDATE statements, no function bodies.
const shipped = readFileSync(join(__dirname, '20261129090000_parallel_rooms', 'migration.sql'), 'utf8')
const backfill = shipped
  .slice(shipped.indexOf('-- 4. The backfill.'), shipped.indexOf('-- 5. The triggers.'))
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement !== '')

class Rollback extends Error {}

type Db = PrismaClient

interface Fixture {
  db: Db
  congregationId: number
  memberIds: number[]
  scheduleTemplateId: number
  templatePartIds: Record<string, number>
  scheduleId: number
  eventId: number
  itemIds: Record<string, number>
}

/**
 * A programme schedule template and one meeting made from it, written as today's code writes them: « Discours » for
 * everyone, then « Lecture » held in two rooms as two copies sharing their section and order, without a room order.
 * On the meeting, the second room's copy is written first, so the template's main room must decide the meeting's.
 */
async function inFixture<T>(fn: (fixture: Fixture) => Promise<T>, client: Db = owner): Promise<T> {
  let result: T | undefined
  try {
    await client.$transaction(async tx => {
      const db = tx as unknown as Db
      const stamp = `rooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await db.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      await db.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      const memberIds = await Promise.all(
        ['a', 'b', 'c', 'd'].map(
          async suffix => (await db.member.create({ data: { firstname: stamp, lastname: suffix, congregationId } })).id,
        ),
      )
      const scheduleTemplateId = (
        await db.scheduleTemplate.create({ data: { name: stamp, kind: 'programme', congregationId } })
      ).id
      const kindId = (await db.eventTemplate.create({ data: { name: stamp, key: `${stamp}-kind`, congregationId } })).id
      const part = async (name: string, track: string, order: number) =>
        (
          await db.templatePart.create({
            data: { name, section: 'Joyaux', track, order, templateId: kindId, scheduleTemplateId, congregationId },
          })
        ).id
      const templatePartIds = {
        discours: await part('Discours', '', 1),
        lectureMain: await part('Lecture', 'Salle principale', 2),
        lectureSecond: await part('Lecture', 'Deuxième école', 2),
      }
      const eventId = (
        await db.event.create({ data: { name: stamp, startDate: new Date(), endDate: new Date(), congregationId } })
      ).id
      const scheduleId = (
        await db.schedule.create({
          data: { name: stamp, eventId, kind: 'programme', scheduleTemplateId, congregationId },
        })
      ).id
      const item = async (name: string, track: string, order: number, assigneeId: number, extra = {}) =>
        (
          await db.item.create({
            data: { name, section: 'Joyaux', track, order, eventId, scheduleId, assigneeId, congregationId, ...extra },
          })
        ).id
      const lectureSecond = await item('Lecture', 'Deuxième école', 2, memberIds[2] as number, {
        assistantId: memberIds[3],
        hasConflict: true,
      })
      const itemIds = {
        discours: await item('Discours', '', 1, memberIds[0] as number),
        lectureMain: await item('Lecture', 'Salle principale', 2, memberIds[1] as number),
        lectureSecond,
      }
      result = await fn({
        db,
        congregationId,
        memberIds,
        scheduleTemplateId,
        templatePartIds,
        scheduleId,
        eventId,
        itemIds,
      })
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return result as T
}

const label = (room: { key: string | null; name: string | null }) => `${room.key ?? '-'}:${room.name ?? '-'}`

/** A container's rooms, the room of each part, and who does each meeting part there. */
async function roomsOf(f: Fixture) {
  const templateRooms = await f.db.scheduleTemplateRoom.findMany({
    where: { scheduleTemplateId: f.scheduleTemplateId },
    orderBy: { order: 'asc' },
  })
  const scheduleRooms = await f.db.scheduleRoom.findMany({
    where: { scheduleId: f.scheduleId },
    orderBy: { order: 'asc' },
  })
  const partRooms = await f.db.templatePartRoom.findMany({
    where: { templatePartId: { in: Object.values(f.templatePartIds) } },
    include: { room: true },
  })
  const itemRooms = await f.db.itemRoom.findMany({
    where: { itemId: { in: Object.values(f.itemIds) } },
    include: { room: true },
  })
  const byPart = Object.fromEntries(
    Object.entries(f.templatePartIds).map(([name, id]) => [
      name,
      partRooms.filter(row => row.templatePartId === id).map(row => label(row.room)),
    ]),
  )
  const byItem = Object.fromEntries(
    Object.entries(f.itemIds).map(([name, id]) => [
      name,
      itemRooms
        .filter(row => row.itemId === id)
        .map(row => ({
          room: label(row.room),
          assignee: row.assigneeId,
          assistant: row.assistantId,
          externalSpeaker: row.externalSpeakerId,
          conflict: row.hasConflict,
        })),
    ]),
  )
  return {
    template: templateRooms.map(room => `${label(room)}@${room.order}`),
    schedule: scheduleRooms.map(room => `${label(room)}@${room.order}`),
    byPart,
    byItem,
  }
}

const EXPECTED_ROOMS = ['main:Salle principale@0', '-:Deuxième école@1']
const EXPECTED_PARTS = {
  discours: ['main:Salle principale'],
  lectureMain: ['main:Salle principale'],
  lectureSecond: ['-:Deuxième école'],
}
const row = (room: string, assignee: number | undefined, assistant: number | null = null, conflict = false) => ({
  room,
  assignee,
  assistant,
  externalSpeaker: null,
  conflict,
})
const expectedItems = (members: number[]) => ({
  discours: [row('main:Salle principale', members[0])],
  lectureMain: [row('main:Salle principale', members[1])],
  lectureSecond: [row('-:Deuxième école', members[2], members[3] ?? null, true)],
})

describe('20261129090000_parallel_rooms', () => {
  it('gives the rooms and rows of copies written by today’s code, the meeting’s main room after its template’s', async () => {
    const { rooms, members } = await inFixture(async f => ({ rooms: await roomsOf(f), members: f.memberIds }))
    expect(rooms.template).toEqual(EXPECTED_ROOMS)
    expect(rooms.schedule).toEqual(EXPECTED_ROOMS)
    expect(rooms.byPart).toEqual(EXPECTED_PARTS)
    expect(rooms.byItem).toEqual(expectedItems(members))
  })

  it('does the same through the app’s own database role and tenant isolation', async () => {
    const { rooms, members } = await inFixture(async f => ({ rooms: await roomsOf(f), members: f.memberIds }), runtime)
    expect(rooms.template).toEqual(EXPECTED_ROOMS)
    expect(rooms.byItem).toEqual(expectedItems(members))
  })

  it('follows a meeting part: assignees, second speaker and conflict, another room under the same row id', async () => {
    const { before, after, rooms, members } = await inFixture(async f => {
      const before = await f.db.itemRoom.findFirstOrThrow({ where: { itemId: f.itemIds.lectureSecond } })
      await f.db.item.update({
        where: { id: f.itemIds.discours },
        data: { assigneeId: f.memberIds[2], assistantId: f.memberIds[1], hasConflict: true },
      })
      await f.db.item.update({ where: { id: f.itemIds.lectureSecond }, data: { track: 'Salle C' } })
      const after = await f.db.itemRoom.findFirstOrThrow({ where: { itemId: f.itemIds.lectureSecond } })
      return { before: before.id, after: after.id, rooms: await roomsOf(f), members: f.memberIds }
    })
    expect(rooms.byItem.discours).toEqual([row('main:Salle principale', members[2], members[1] ?? null, true)])
    expect(rooms.byItem.lectureSecond?.map(each => each.room)).toEqual(['-:Salle C'])
    expect(after).toBe(before)
    // « Deuxième école » lost its last part, so it went.
    expect(rooms.schedule).toEqual(['main:Salle principale@0', '-:Salle C@1'])
  })

  it('follows a template’s renames and removals: a room renamed, the main hall renamed, a room emptied', async () => {
    const steps = await inFixture(async f => {
      const steps: string[][] = []
      // The second room renamed (as a rename does, through an update of its parts).
      await f.db.templatePart.updateMany({ where: { id: f.templatePartIds.lectureSecond }, data: { track: 'Annexe' } })
      steps.push((await roomsOf(f)).template)
      // The main hall renamed: room order 1 is the main room, whatever it is called.
      await f.db.templatePart.updateMany({
        where: { id: f.templatePartIds.lectureMain },
        data: { track: 'Grande salle', trackOrder: 1 },
      })
      steps.push((await roomsOf(f)).template)
      // The second room's only part deleted.
      await f.db.templatePart.delete({ where: { id: f.templatePartIds.lectureSecond } })
      steps.push((await roomsOf(f)).template)
      return steps
    })
    expect(steps).toEqual([
      ['main:Salle principale@0', '-:Annexe@1'],
      ['main:Grande salle@0', '-:Annexe@1'],
      ['main:Grande salle@0'],
    ])
  })

  it('moves a template part’s one room row when its track changes, and keeps one room per name', async () => {
    const { byPart, duplicate } = await inFixture(async f => {
      await f.db.templatePart.update({ where: { id: f.templatePartIds.discours }, data: { track: 'Deuxième école' } })
      const byPart = (await roomsOf(f)).byPart
      const duplicate = await f.db.$executeRawUnsafe(
        `INSERT INTO "ScheduleTemplateRoom" ("name", "order", "scheduleTemplateId", "congregationId", "updatedAt")
         VALUES ('Deuxième école', 9, ${f.scheduleTemplateId}, ${f.congregationId}, CURRENT_TIMESTAMP)
         ON CONFLICT ("scheduleTemplateId", "name") DO NOTHING`,
      )
      return { byPart, duplicate }
    })
    expect(byPart.discours).toEqual(['-:Deuxième école'])
    // The unique name the room helper relies on when two writers make the same room at once.
    expect(duplicate).toBe(0)
  })

  it('rebuilds the same rooms and rows from the shipped backfill, and running it twice changes nothing', async () => {
    const { first, second, members } = await inFixture(async f => {
      await f.db.scheduleTemplateRoom.deleteMany({ where: { scheduleTemplateId: f.scheduleTemplateId } })
      await f.db.scheduleRoom.deleteMany({ where: { scheduleId: f.scheduleId } })
      for (const statement of backfill) await f.db.$executeRawUnsafe(statement)
      const first = await roomsOf(f)
      for (const statement of backfill) await f.db.$executeRawUnsafe(statement)
      return { first, second: await roomsOf(f), members: f.memberIds }
    })
    expect(backfill.length).toBeGreaterThanOrEqual(6)
    expect(first.template).toEqual(EXPECTED_ROOMS)
    expect(first.byPart).toEqual(EXPECTED_PARTS)
    expect(first.byItem).toEqual(expectedItems(members))
    expect(second).toEqual(first)
  })

  it('ranks rooms by their room order, then their oldest part, in the backfill', async () => {
    const { template, schedule } = await inFixture(async f => {
      await f.db.templatePart.update({ where: { id: f.templatePartIds.lectureMain }, data: { trackOrder: 2 } })
      await f.db.templatePart.update({ where: { id: f.templatePartIds.lectureSecond }, data: { trackOrder: 1 } })
      await f.db.item.update({ where: { id: f.itemIds.lectureMain }, data: { trackOrder: 2 } })
      await f.db.item.update({ where: { id: f.itemIds.lectureSecond }, data: { trackOrder: 1 } })
      await f.db.scheduleTemplateRoom.deleteMany({ where: { scheduleTemplateId: f.scheduleTemplateId } })
      await f.db.scheduleRoom.deleteMany({ where: { scheduleId: f.scheduleId } })
      for (const statement of backfill) await f.db.$executeRawUnsafe(statement)
      const rooms = await roomsOf(f)
      return { template: rooms.template, schedule: rooms.schedule }
    })
    expect(template).toEqual(['main:Deuxième école@0', '-:Salle principale@1'])
    expect(schedule).toEqual(['main:Deuxième école@0', '-:Salle principale@1'])
  })

  it('gives a services schedule no room, and its items no room row', async () => {
    const counts = await inFixture(async f => {
      const duties = await f.db.schedule.create({
        data: { name: 'Services', eventId: f.eventId, kind: 'duty', congregationId: f.congregationId },
      })
      const service = await f.db.item.create({
        data: {
          name: 'Sono',
          eventId: f.eventId,
          scheduleId: duties.id,
          assigneeId: f.memberIds[0],
          congregationId: f.congregationId,
        },
      })
      return {
        rooms: await f.db.scheduleRoom.count({ where: { scheduleId: duties.id } }),
        rows: await f.db.itemRoom.count({ where: { itemId: service.id } }),
      }
    })
    expect(counts).toEqual({ rooms: 0, rows: 0 })
  })
})
