import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedMeetingsInRooms } from '~/tests/helpers/rooms-fixture'

// Assigning writes the room's row (parallel rooms R4, no dual-write): the room being assigned, or (none named) the
// part's only or main room; nobody twice in one part (user, 2026-11-28: « prevent it »); its item marked changed. A
// part in two rooms, Paul in the main room and Marc in « Salle B », on the fixture's meeting with a row per room. In a
// congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { assignPart, unassignPart } = await import('./event-part-assignments.server')
const { refreshConflictFlags } = await import('./refresh-conflict-flags.server')
const { deleteExternalSpeaker } = await import('./external-speakers.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface Fixture {
  tx: TransactionClient
  congregationId: number
  actorId: number
  people: { paul: number; marc: number; jean: number }
  part: { id: number; mainRoom: number; secondRoom: number; mainRow: number; secondRow: number }
}

async function inFixture<T>(fn: (fixture: Fixture) => Promise<T>): Promise<T> {
  let result: T | undefined
  try {
    await testDb.$transaction(
      async raw => {
        const tx = raw as unknown as TransactionClient
        const stamp = `assign-rooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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
        const item = await tx.item.findFirstOrThrow({
          where: { eventId: seeded.rows, rooms: { some: { assigneeId: people.marc } } },
          select: { id: true, rooms: { select: { id: true, roomId: true, room: { select: { key: true } } } } },
        })
        // Everyone here may take the part: its speaker's slot allows a role all three hold.
        const role = (await tx.role.create({ data: { key: `speakers-${stamp}`, name: 'Orateurs', congregationId } })).id
        await tx.itemAllowedRole.deleteMany({ where: { itemId: item.id } })
        await tx.itemAllowedRole.create({ data: { itemId: item.id, roleId: role, slot: 'main', congregationId } })
        for (const memberId of Object.values(people)) {
          await tx.memberRoleAssignment.create({ data: { memberId, roleId: role, congregationId } })
        }
        const main = item.rooms.find(row => row.room.key === 'main')
        const second = item.rooms.find(row => row.room.key !== 'main')
        if (main == null || second == null) throw new Error('not a part in two rooms')
        result = await fn({
          tx,
          congregationId,
          actorId,
          people,
          part: {
            id: item.id,
            mainRoom: main.roomId,
            secondRoom: second.roomId,
            mainRow: main.id,
            secondRow: second.id,
          },
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

const rowsOf = async (tx: TransactionClient, part: Fixture['part']) => {
  const [main, second] = await Promise.all(
    [part.mainRow, part.secondRow].map(id =>
      tx.itemRoom.findUniqueOrThrow({
        where: { id },
        select: { assigneeId: true, assistantId: true, externalSpeakerId: true },
      }),
    ),
  )
  return { main, second }
}

describe('assigning a part held in two rooms', () => {
  it('writes the room being assigned, its other room kept, and marks its item changed', async () => {
    const read = await inFixture(async ({ tx, congregationId, people, part }) => {
      const stale = new Date('2000-01-01T00:00:00Z')
      await tx.$executeRawUnsafe('UPDATE "Item" SET "updatedAt" = $1 WHERE "id" = $2', stale, part.id)
      const result = await assignPart(tx, part.id, people.jean, null, null, '', congregationId, null, part.secondRoom)
      const item = await tx.item.findUniqueOrThrow({ where: { id: part.id }, select: { updatedAt: true } })
      return { result, rows: await rowsOf(tx, part), touched: item.updatedAt > stale, people }
    })
    expect(read.result).toMatchObject({ previousAssigneeId: read.people.marc })
    expect(read.rows.second.assigneeId).toBe(read.people.jean)
    expect(read.rows.main.assigneeId).toBe(read.people.paul)
    expect(read.touched).toBe(true)
  })

  it('writes its main room when no room is named', async () => {
    const read = await inFixture(async ({ tx, congregationId, people, part }) => {
      await assignPart(tx, part.id, people.jean, null, null, '', congregationId)
      return { rows: await rowsOf(tx, part), people }
    })
    expect(read.rows.main.assigneeId).toBe(read.people.jean)
    expect(read.rows.second.assigneeId).toBe(read.people.marc)
  })

  it('refuses someone who holds another of its rooms, writing nothing', async () => {
    const read = await inFixture(async ({ tx, congregationId, people, part }) => {
      const result = await assignPart(tx, part.id, people.paul, null, null, '', congregationId, null, part.secondRoom)
      return { result, rows: await rowsOf(tx, part), people }
    })
    expect(read.result).toHaveProperty('error')
    expect(read.rows.second.assigneeId).toBe(read.people.marc)
  })

  it('puts an outside speaker on the room being assigned', async () => {
    const read = await inFixture(async ({ tx, congregationId, part }) => {
      const speaker = (await tx.externalSpeaker.create({ data: { name: 'Orateur', congregationId } })).id
      await assignPart(tx, part.id, null, null, speaker, '', congregationId, null, part.secondRoom)
      return { rows: await rowsOf(tx, part), speaker }
    })
    expect(read.rows.second).toMatchObject({ assigneeId: null, externalSpeakerId: read.speaker })
    expect(read.rows.main.externalSpeakerId).toBeNull()
  })

  it('refuses a room that is not the part’s', async () => {
    const read = await inFixture(async ({ tx, congregationId, people, part }) =>
      assignPart(tx, part.id, people.jean, null, null, '', congregationId, null, -1),
    )
    expect(read).toHaveProperty('error')
  })

  it('frees one room on unassigning it, the other kept', async () => {
    const read = await inFixture(async ({ tx, congregationId, people, part }) => {
      const result = await unassignPart(tx, part.id, congregationId, part.secondRoom)
      return { result, rows: await rowsOf(tx, part), people }
    })
    expect(read.result).toMatchObject({ previousAssigneeId: read.people.marc })
    expect(read.rows.second.assigneeId).toBeNull()
    expect(read.rows.main.assigneeId).toBe(read.people.paul)
  })

  it('flags the room an absent person holds, not the other', async () => {
    const read = await inFixture(async ({ tx, congregationId, people, part }) => {
      const meeting = await tx.item.findUniqueOrThrow({ where: { id: part.id }, select: { event: true } })
      const { startDate, endDate } = meeting.event
      await tx.absence.create({ data: { memberId: people.marc, startDate, endDate, congregationId } })
      await refreshConflictFlags(tx, people.marc, startDate, endDate, congregationId)
      const flagOf = (id: number) =>
        tx.itemRoom.findUniqueOrThrow({ where: { id }, select: { hasConflict: true } }).then(row => row.hasConflict)
      return { main: await flagOf(part.mainRow), second: await flagOf(part.secondRow) }
    })
    expect(read).toEqual({ main: false, second: true })
  })

  it('frees a retired outside speaker’s planned talk in « Salle B » on deleting him', async () => {
    const read = await inFixture(async ({ tx, congregationId, actorId, part }) => {
      const speaker = (
        await tx.externalSpeaker.create({ data: { name: 'Orateur', archivedAt: new Date(), congregationId } })
      ).id
      await tx.itemRoom.update({
        where: { id: part.secondRow },
        data: { assigneeId: null, externalSpeakerId: speaker },
      })
      const deleted = await deleteExternalSpeaker(tx, speaker, congregationId, actorId)
      return { deleted, rows: await rowsOf(tx, part) }
    })
    expect(read.deleted.freedParts).toBe(1)
    expect(read.rows.second.externalSpeakerId).toBeNull()
  })
})
