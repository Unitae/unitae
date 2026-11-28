import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedMeetingsInRooms } from '~/tests/helpers/rooms-fixture'

// Publishing reads the rooms (parallel rooms R4, before its writers): a part held in two rooms, Paul in the main room
// and Jean in « Salle B », on a meeting of copies (today's writers) and on the same meeting with one item and a row per
// room (R4's). A conflict flagged in « Salle B » alone holds back the meeting and its programme on both, and releasing
// tells Jean on both. In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { releaseEvent } = await import('./event-status.server')
const { publishSchedule } = await import('./schedule-status.server')
const { deleteSchedule } = await import('./schedule-changes.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

type Shapes<T> = { copies: T; rows: T }
interface Read {
  release: Shapes<unknown>
  publish: Shapes<unknown>
  /** Who deleting the published programme tells. */
  deleted: Shapes<number[]>
}

async function read({ flagSecond }: { flagSecond: boolean }): Promise<Read & { jean: number }> {
  let out: (Read & { jean: number }) | undefined
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `release-rooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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
        const jean = await person('Jean')
        const seeded = await seedMeetingsInRooms(
          db,
          { kindId: kind.id, days: ['2099-03-04', '2099-03-11'], speakers: [paul, jean] },
          { congregationId, actorId },
        )
        if (flagSecond) {
          await tx.item.updateMany({ where: { eventId: seeded.copies, assigneeId: jean }, data: { hasConflict: true } })
          await tx.itemRoom.updateMany({
            where: { assigneeId: jean, item: { eventId: seeded.rows } },
            data: { hasConflict: true },
          })
        }
        const programmeOf = async (eventId: number) =>
          (await tx.schedule.findFirstOrThrow({ where: { eventId, kind: 'programme' } })).id
        const releaseOf = async (eventId: number) => {
          const result = await releaseEvent(db, eventId, congregationId, actorId)
          if (result == null) return null
          return 'reason' in result
            ? { reason: result.reason }
            : { told: result.notifyTargets.filter(t => t.role === 'speaker').map(t => t.memberId) }
        }
        const publishOf = async (eventId: number) => {
          const result = await publishSchedule(db, await programmeOf(eventId), congregationId, actorId)
          if (result == null) return null
          return 'reason' in result
            ? { reason: result.reason }
            : { told: result.notifyTargets.filter(t => t.role === 'speaker').map(t => t.memberId) }
        }
        // The programme published alone first; held back, the meeting's release is read after it.
        const publish = { copies: await publishOf(seeded.copies), rows: await publishOf(seeded.rows) }
        const release = flagSecond
          ? { copies: await releaseOf(seeded.copies), rows: await releaseOf(seeded.rows) }
          : { copies: null, rows: null }
        const deletedOf = async (eventId: number) => {
          if (flagSecond) return []
          const result = await deleteSchedule(db, await programmeOf(eventId), congregationId, actorId)
          return (result?.notifyTargets ?? []).filter(t => t.role === 'speaker').map(t => t.memberId)
        }
        const deleted = { copies: await deletedOf(seeded.copies), rows: await deletedOf(seeded.rows) }
        out = { release, publish, deleted, jean }
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

describe('publishing a part held in two rooms', () => {
  it('holds back the meeting and its programme for a conflict in « Salle B » alone, on both shapes', async () => {
    const { release, publish } = await read({ flagSecond: true })
    expect(publish).toEqual({ copies: { reason: 'conflicts' }, rows: { reason: 'conflicts' } })
    expect(release).toEqual({ copies: { reason: 'conflicts' }, rows: { reason: 'conflicts' } })
  })

  it('tells « Salle B »’s speaker on publishing, and on deleting the published programme, on both shapes', async () => {
    const { publish, deleted, jean } = await read({ flagSecond: false })
    expect((publish.copies as { told: number[] }).told).toContain(jean)
    expect((publish.rows as { told: number[] }).told).toContain(jean)
    expect(deleted.copies).toContain(jean)
    expect(deleted.rows).toContain(jean)
  })
})
