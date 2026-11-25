import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// 20261129090000_parallel_rooms: rooms for every programme schedule template and schedule, a room row for every
// template part and meeting part, kept in step by triggers while today's code writes `track` copies. CI applies the
// migration before the suite, so the tables and triggers exist: the trigger path is exercised by writing rows the way
// today's code does, and the backfill by deleting a fixture's rooms and running the shipped backfill statements again.

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

afterAll(async () => {
  await testDb.$disconnect()
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
  itemIds: Record<string, number>
}

/**
 * A programme schedule template and one meeting written as today's code writes them: « Discours » for everyone, then
 * « Lecture » held in two rooms as two copies sharing their section and order, no room order (production's shape).
 */
async function inFixture<T>(fn: (fixture: Fixture) => Promise<T>): Promise<T> {
  let result: T | undefined
  try {
    await testDb.$transaction(async tx => {
      const db = tx as unknown as Db
      const stamp = `rooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await db.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      const memberIds = await Promise.all(
        ['a', 'b', 'c'].map(
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
        await db.schedule.create({ data: { name: stamp, eventId, kind: 'programme', congregationId } })
      ).id
      const item = async (name: string, track: string, order: number, assigneeId: number) =>
        (
          await db.item.create({
            data: { name, section: 'Joyaux', track, order, eventId, scheduleId, assigneeId, congregationId },
          })
        ).id
      const itemIds = {
        discours: await item('Discours', '', 1, memberIds[0] as number),
        lectureMain: await item('Lecture', 'Salle principale', 2, memberIds[1] as number),
        lectureSecond: await item('Lecture', 'Deuxième école', 2, memberIds[2] as number),
      }
      result = await fn({ db, congregationId, memberIds, scheduleTemplateId, templatePartIds, scheduleId, itemIds })
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return result as T
}

/** A container's rooms and which room each part sits in, by name (the main room shows its key). */
async function roomsOf(f: Fixture) {
  const templateRooms = await f.db.scheduleTemplateRoom.findMany({
    where: { scheduleTemplateId: f.scheduleTemplateId },
    orderBy: { order: 'asc' },
  })
  const scheduleRooms = await f.db.scheduleRoom.findMany({
    where: { scheduleId: f.scheduleId },
    orderBy: { order: 'asc' },
  })
  const label = (room: { key: string | null; name: string | null }) => `${room.key ?? '-'}:${room.name ?? '-'}`
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
      itemRooms.filter(row => row.itemId === id).map(row => [label(row.room), row.assigneeId]),
    ]),
  )
  return { template: templateRooms.map(label), schedule: scheduleRooms.map(label), byPart, byItem }
}

const EXPECTED_ROOMS = ['main:Salle principale', '-:Deuxième école']

describe('20261129090000_parallel_rooms', () => {
  it('gives the rooms and room rows of copies written by today’s code (the triggers)', async () => {
    const rooms = await inFixture(async f => ({ ...(await roomsOf(f)), members: f.memberIds }))
    expect(rooms.template).toEqual(EXPECTED_ROOMS)
    expect(rooms.schedule).toEqual(EXPECTED_ROOMS)
    expect(rooms.byPart).toEqual({
      discours: ['main:Salle principale'],
      lectureMain: ['main:Salle principale'],
      lectureSecond: ['-:Deuxième école'],
    })
    expect(rooms.byItem).toEqual({
      discours: [['main:Salle principale', rooms.members[0]]],
      lectureMain: [['main:Salle principale', rooms.members[1]]],
      lectureSecond: [['-:Deuxième école', rooms.members[2]]],
    })
  })

  it('keeps a meeting part’s room row in step: a new assignee, another room', async () => {
    const rooms = await inFixture(async f => {
      await f.db.item.update({ where: { id: f.itemIds.discours }, data: { assigneeId: f.memberIds[2] } })
      await f.db.item.update({ where: { id: f.itemIds.lectureSecond }, data: { track: 'Salle C' } })
      return { ...(await roomsOf(f)), members: f.memberIds }
    })
    expect(rooms.byItem.discours).toEqual([['main:Salle principale', rooms.members[2]]])
    expect(rooms.byItem.lectureSecond).toEqual([['-:Salle C', rooms.members[2]]])
    expect(rooms.schedule).toEqual([...EXPECTED_ROOMS, '-:Salle C'])
  })

  it('rebuilds the same rooms from the shipped backfill, and running it twice changes nothing', async () => {
    const { first, second } = await inFixture(async f => {
      await f.db.scheduleTemplateRoom.deleteMany({ where: { scheduleTemplateId: f.scheduleTemplateId } })
      await f.db.scheduleRoom.deleteMany({ where: { scheduleId: f.scheduleId } })
      for (const statement of backfill) await f.db.$executeRawUnsafe(statement)
      const first = await roomsOf(f)
      for (const statement of backfill) await f.db.$executeRawUnsafe(statement)
      return { first, second: await roomsOf(f) }
    })
    expect(backfill.length).toBeGreaterThanOrEqual(6)
    expect(first.template).toEqual(EXPECTED_ROOMS)
    expect(first.schedule).toEqual(EXPECTED_ROOMS)
    expect(first.byPart.lectureSecond).toEqual(['-:Deuxième école'])
    expect(first.byItem.lectureMain.map(([room]) => room)).toEqual(['main:Salle principale'])
    expect(second).toEqual(first)
  })

  it('names the main room after the room of rank 1 when ranks are given', async () => {
    const template = await inFixture(async f => {
      await f.db.scheduleTemplateRoom.deleteMany({ where: { scheduleTemplateId: f.scheduleTemplateId } })
      await f.db.templatePart.update({ where: { id: f.templatePartIds.lectureMain }, data: { trackOrder: 2 } })
      await f.db.templatePart.update({ where: { id: f.templatePartIds.lectureSecond }, data: { trackOrder: 1 } })
      await f.db.scheduleTemplateRoom.deleteMany({ where: { scheduleTemplateId: f.scheduleTemplateId } })
      for (const statement of backfill) await f.db.$executeRawUnsafe(statement)
      return (await roomsOf(f)).template
    })
    expect(template).toEqual(['main:Deuxième école', '-:Salle principale'])
  })

  it('gives a services schedule no room, and its items no room row', async () => {
    const counts = await inFixture(async f => {
      const event = await f.db.event.create({
        data: { name: 'Services', startDate: new Date(), endDate: new Date(), congregationId: f.congregationId },
      })
      const duties = await f.db.schedule.create({
        data: { name: 'Services', eventId: event.id, kind: 'duty', congregationId: f.congregationId },
      })
      const service = await f.db.item.create({
        data: {
          name: 'Sono',
          eventId: event.id,
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
