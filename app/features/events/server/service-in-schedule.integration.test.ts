import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// A service added to a meeting holding several duties schedules (one per template its type uses, user 2026-11-27)
// goes into the one named, after that schedule's services; one naming none goes into the first, as before. A schedule
// of another event, or a programme, is refused. In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { addServicePartAssignment } = await import('./event-parts.server')

class Rollback extends Error {}

afterAll(async () => {
  await flushPendingAuditWrites()
  await testDb.$disconnect()
})

describe('addServicePartAssignment', () => {
  it('puts a service in the duties schedule named, after its own services, and refuses one not the event’s', async () => {
    let read: Record<string, unknown> | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `svc-sched-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          const event = (name: string) =>
            tx.event.create({
              data: {
                name,
                startDate: new Date('2027-03-02T18:00:00Z'),
                endDate: new Date('2027-03-02T19:45:00Z'),
                congregationId,
              },
            })
          const meeting = await event('Réunion')
          const other = await event('Autre')
          const schedule = (eventId: number, kind: string, name: string, order: number) =>
            tx.schedule.create({ data: { eventId, kind, name, order, status: 'draft', congregationId } })
          const services = await schedule(meeting.id, 'duty', 'Services', 1)
          const visio = await schedule(meeting.id, 'duty', 'Visioconférence', 2)
          const programme = await schedule(meeting.id, 'programme', 'Programme', 0)
          const elsewhere = await schedule(other.id, 'duty', 'Services', 1)
          // The first schedule's last service is far down: the named one starts its own count.
          await tx.item.create({
            data: { eventId: meeting.id, scheduleId: services.id, name: 'Sono', order: 40, congregationId },
          })
          const add = (name: string, scheduleId?: number) =>
            addServicePartAssignment(
              db,
              { eventId: meeting.id, name, allowedRoleIds: [], congregationId, scheduleId },
              actorId,
            )

          const intoVisio = await add('Zoom', visio.id)
          const unnamed = await add('Accueil')
          const refusals = []
          for (const scheduleId of [elsewhere.id, programme.id]) {
            refusals.push(
              await add('Refusé', scheduleId).then(
                () => 'written',
                () => 'refused',
              ),
            )
          }
          const row = (id: number) =>
            tx.item.findUniqueOrThrow({ where: { id }, select: { scheduleId: true, order: true } })
          read = {
            visio: await row(intoVisio.id),
            unnamed: await row(unnamed.id),
            refusals,
            expected: { visio: visio.id, services: services.id },
            refusedRows: await tx.item.count({ where: { name: 'Refusé' } }),
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    const expected = read?.expected as { visio: number; services: number }
    expect(read?.visio).toEqual({ scheduleId: expected.visio, order: 0 })
    expect(read?.unnamed).toEqual({ scheduleId: expected.services, order: 45 })
    expect(read?.refusals).toEqual(['refused', 'refused'])
    expect(read?.refusedRows).toBe(0)
  })
})
