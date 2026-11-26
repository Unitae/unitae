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

describe('counts, a part open in one of its rooms', () => {
  it('counts the open room on a meeting of copies and on the same meeting with a row per room alike', async () => {
    let read: { open: unknown; list: unknown; preview: unknown } | undefined
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
          const paul = (await tx.member.create({ data: { firstname: 'Paul', lastname: 'TEST', congregationId } })).id
          const seeded = await seedMeetingsInRooms(
            db,
            { kindId: kind.id, days: ['2099-03-04', '2099-03-11'], speakers: [paul, null] },
            { congregationId, actorId },
          )
          const now = new Date('2099-03-01')
          const open = await getOpenParts(db, congregationId, { roleIds: null, days: 60, now })
          const list = await listProgrammes(db, {
            congregationId,
            from: new Date('2099-03-01'),
            to: new Date('2099-03-31'),
          })
          const preview = await bulkPublishPreview(
            db,
            () => true,
            actorId,
            [seeded.copies, seeded.rows],
            congregationId,
          )
          const byEvent = <T>(rows: T[], eventOf: (row: T) => number, count: (row: T) => unknown) => ({
            copies: rows.filter(row => eventOf(row) === seeded.copies).map(count),
            rows: rows.filter(row => eventOf(row) === seeded.rows).map(count),
          })
          read = {
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
            preview: byEvent(
              preview.publish.filter(each => each.kind === 'programme'),
              row => row.eventId,
              row => row.unfilled,
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
    const each = read as Record<string, { copies: unknown[]; rows: unknown[] }>
    for (const [name, counts] of Object.entries(each)) {
      expect(counts.copies, name).toHaveLength(1)
      expect(counts.rows, name).toEqual(counts.copies)
    }
  })
})
