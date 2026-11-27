import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

// The list's counts by schedule (user, 2026-11-27: a reader is not counted what they cannot see): each schedule of a
// meeting with its status and its own slots, so the page adds up only those the reader sees. In a congregation of its
// own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { scheduleSlotCounts } = await import('./programme-list.queries')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

// Rooms count as the list's own counts do (counts-in-rooms.integration.test.ts).
it('counts each schedule’s own slots, with its status', async () => {
  let read: unknown
  try {
    await testDb.$transaction(async tx => {
      const stamp = `list-counts-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      const paul = (await tx.member.create({ data: { firstname: 'Paul', lastname: 'L', congregationId } })).id
      const day = new Date('2027-03-04T18:00:00Z')
      const eventId = (
        await tx.event.create({
          data: { name: 'Réunion', startDate: day, endDate: day, status: 'released', congregationId },
        })
      ).id
      const schedule = (kind: string, order: number, status: string, name: string) =>
        tx.schedule.create({ data: { eventId, kind, order, status, name, congregationId } }).then(row => row.id)
      const programme = await schedule('programme', 0, 'published', 'Programme')
      const visio = await schedule('duty', 1, 'published', 'Visio')
      const cleaning = await schedule('duty', 2, 'draft', 'Nettoyage')
      const item = (scheduleId: number, assigneeId: number | null, hasConflict = false) =>
        tx.item.create({ data: { eventId, scheduleId, assigneeId, hasConflict, congregationId } }).then(row => row.id)
      await item(programme, paul)
      await item(visio, paul)
      await item(cleaning, paul, true)
      await item(cleaning, null)
      const counts = await scheduleSlotCounts(tx as unknown as TransactionClient, [eventId], congregationId)
      read = (counts.get(eventId) ?? []).map(({ id, ...rest }) => ({
        which: id === programme ? 'programme' : id === visio ? 'visio' : 'cleaning',
        ...rest,
      }))
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  expect(read).toEqual([
    { which: 'programme', kind: 'programme', status: 'published', slots: { total: 1, filled: 1, flagged: 0 } },
    { which: 'visio', kind: 'duty', status: 'published', slots: { total: 1, filled: 1, flagged: 0 } },
    { which: 'cleaning', kind: 'duty', status: 'draft', slots: { total: 2, filled: 1, flagged: 1 } },
  ])
})
