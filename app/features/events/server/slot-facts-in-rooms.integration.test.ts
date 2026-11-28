import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedMeetingsInRooms } from '~/tests/helpers/rooms-fixture'

// The assignment dialog's facts read the rooms (parallel rooms R4, before its writers): a turn in any room is a turn
// on the part, and only the room being assigned is left out of « already at this meeting ». A part in two rooms, Paul
// in the main room and Marc in « Salle B », on the fixture's meeting with one item and a row per room (and on its twin
// of copies the week before). In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { listSlotCandidateFacts } = await import('./slot-candidate-facts.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface Read {
  /** When Marc and the outside speaker last held the part, read for a meeting after both. */
  lastMarc?: string
  lastSpeaker?: string
  /** « Already at this meeting » while assigning « Salle B », then the main room. */
  assigningSecond: Record<number, string[]>
  assigningMain: Record<number, string[]>
  ids: { paul: number; marc: number }
}

async function read(): Promise<Read> {
  let out: Read | undefined
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `slot-rooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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
        // The copies the week before hold nobody: what is known of « Salle B » is its row on the later meeting.
        const seeded = await seedMeetingsInRooms(
          db,
          { kindId: kind.id, days: ['2099-03-04', '2099-03-11'], speakers: [paul, marc] },
          { congregationId, actorId },
        )
        await tx.item.updateMany({ where: { eventId: seeded.copies }, data: { assigneeId: null } })
        const speaker = (await tx.externalSpeaker.create({ data: { name: 'Orateur', congregationId } })).id
        await tx.itemRoom.updateMany({
          where: { assigneeId: marc, item: { eventId: seeded.rows } },
          data: { externalSpeakerId: speaker },
        })
        const part = await tx.item.findFirstOrThrow({
          where: { eventId: seeded.rows, rooms: { some: { assigneeId: marc } } },
          select: { id: true, rooms: { select: { roomId: true, room: { select: { key: true } } } } },
        })
        const salleB = part.rooms.find(row => row.room.key !== 'main')?.roomId
        const event = await tx.event.findFirstOrThrow({ where: { id: seeded.rows } })
        const target = (roomId?: number) => ({
          kind: 'part' as const,
          assignmentId: part.id,
          partName: seeded.partName,
          partSection: seeded.partSection,
          slot: 'assignee' as const,
          ...(roomId == null ? {} : { roomId }),
        })
        const later = {
          id: -1,
          templateId: kind.id,
          startDate: new Date('2099-04-01'),
          endDate: new Date('2099-04-01'),
        }
        const history = await listSlotCandidateFacts(db, { event: later, congregationId, target: target() })
        const second = await listSlotCandidateFacts(db, { event, congregationId, target: target(salleB) })
        const main = await listSlotCandidateFacts(db, { event, congregationId, target: target() })
        out = {
          lastMarc: history.lastAssignedAt[marc],
          lastSpeaker: history.speakers.lastAssignedAt[speaker],
          assigningSecond: second.elsewhere,
          assigningMain: main.elsewhere,
          ids: { paul, marc },
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

describe('the assignment dialog’s facts, a part held in two rooms', () => {
  it('counts a turn in « Salle B » as a turn on the part, for a member and an outside speaker', async () => {
    const { lastMarc, lastSpeaker } = await read()
    expect(lastMarc?.slice(0, 10)).toBe('2099-03-11')
    expect(lastSpeaker?.slice(0, 10)).toBe('2099-03-11')
  })

  it('leaves out only the room being assigned: the other room’s speaker is already at the meeting', async () => {
    const { assigningSecond, assigningMain, ids } = await read()
    expect(assigningSecond[ids.paul]).toHaveLength(1)
    expect(assigningSecond[ids.marc]).toBeUndefined()
    expect(assigningMain[ids.marc]).toHaveLength(1)
    expect(assigningMain[ids.paul]).toBeUndefined()
  })
})
