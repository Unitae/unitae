import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedMeetingsInRooms } from '~/tests/helpers/rooms-fixture'

// Counts read the rooms (parallel rooms R3): a part held in two rooms is two slots, whatever its shape. Its main room
// has a speaker and « Salle B » is open, on a meeting of copies (today's writers) and on the same meeting with one item
// and a row per room (R4's). The dashboard's open parts, the programme list's counts and the publish preview count the
// open room on both. In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { listProgrammes } = await import('./programme-list.queries')
const { bulkPublishPreview } = await import('./bulk-publish-preview.queries')
const { getOpenParts } = await import('~/features/dashboard/server/get-open-parts.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

type Shapes<T> = { copies: T[]; rows: T[] }
interface Read {
  partName: string
  open: Shapes<number>
  list: Shapes<{ total: number; filled: number; flagged: number }>
  unfilled: Shapes<number>
  away: Shapes<string[]>
}

/**
 * The counts of both fixture meetings, its first part with Paul in the main room and `second` in « Salle B » (open
 * without one); `flagSecond` flags « Salle B »'s room for a conflict, on the copies' through the copy (its trigger
 * mirrors it) and on the other through its row.
 */
async function readCounts({ withSecond, flagSecond }: { withSecond: boolean; flagSecond: boolean }): Promise<Read> {
  let read: Read | undefined
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `counts-rooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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
        const jean = withSecond ? await person('Jean') : null
        const seeded = await seedMeetingsInRooms(
          db,
          { kindId: kind.id, days: ['2099-03-04', '2099-03-11'], speakers: [paul, jean] },
          { congregationId, actorId },
        )
        if (flagSecond && jean != null) {
          await tx.item.updateMany({ where: { eventId: seeded.copies, assigneeId: jean }, data: { hasConflict: true } })
          await tx.itemRoom.updateMany({
            where: { assigneeId: jean, item: { eventId: seeded.rows } },
            data: { hasConflict: true },
          })
        }
        const now = new Date('2099-03-01')
        const open = await getOpenParts(db, congregationId, { roleIds: null, days: 60, now })
        const list = await listProgrammes(db, { congregationId, from: now, to: new Date('2099-03-31') })
        const preview = await bulkPublishPreview(db, () => true, actorId, [seeded.copies, seeded.rows], congregationId)
        const byEvent = <R, T>(rows: R[], eventOf: (row: R) => number, value: (row: R) => T): Shapes<T> => ({
          copies: rows.filter(row => eventOf(row) === seeded.copies).map(value),
          rows: rows.filter(row => eventOf(row) === seeded.rows).map(value),
        })
        read = {
          partName: seeded.partName,
          open: byEvent(
            open,
            row => row.eventId,
            row => row.count,
          ),
          list: byEvent(
            list,
            row => row.id,
            row => row.parts,
          ),
          unfilled: byEvent(
            preview.publish.filter(each => each.kind === 'programme'),
            row => row.eventId,
            row => row.unfilled,
          ),
          away: byEvent(
            preview.conflicts,
            row => row.eventId,
            row => row.away,
          ),
        }
        throw new Rollback()
      },
      { timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  if (read == null) throw new Error('nothing read')
  return read
}

describe('counts, a part held in two rooms', () => {
  it('counts an open room on a meeting of copies and on the same meeting with a row per room alike', async () => {
    const read = await readCounts({ withSecond: false, flagSecond: false })
    // 13 parts once its two rooms are counted, Paul the only one filled.
    expect(read.open).toEqual({ copies: [12], rows: [12] })
    expect(read.list).toEqual({
      copies: [{ total: 13, filled: 1, flagged: 0 }],
      rows: [{ total: 13, filled: 1, flagged: 0 }],
    })
    // The 12 open speakers, and one part's empty second speaker.
    expect(read.unfilled).toEqual({ copies: [13], rows: [13] })
  })

  it('counts a conflict in one room, and holds the schedule back naming the part, on both shapes', async () => {
    const read = await readCounts({ withSecond: true, flagSecond: true })
    expect(read.list).toEqual({
      copies: [{ total: 13, filled: 2, flagged: 1 }],
      rows: [{ total: 13, filled: 2, flagged: 1 }],
    })
    expect(read.away).toEqual({ copies: [[read.partName]], rows: [[read.partName]] })
    expect(read.unfilled).toEqual({ copies: [], rows: [] })
  })
})
