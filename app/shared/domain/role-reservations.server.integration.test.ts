import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

// The programmes' slots a role alone may take, against real rows (plan T12): read from the items' allowed roles, per
// slot (a part's speaker the main slot, its reader the second, a duty's single list the main slot). Only upcoming
// meetings count: deleting the role would open those slots to everyone.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { findSoleReservations } = await import('./role-reservations.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('a role alone on a programme slot', () => {
  it('counts each upcoming part or duty it alone may take, by slot, never a past one', async () => {
    let programmeSlots: number | undefined
    try {
      await testDb.$transaction(async tx => {
        const stamp = `reservations-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const role = await tx.role.create({ data: { key: `readers-${stamp}`, name: 'Lecteurs', congregationId } })
        const other = await tx.role.create({ data: { key: `elders-${stamp}`, name: 'Anciens', congregationId } })
        const meeting = (startDate: Date) =>
          tx.event.create({
            data: { name: 'Réunion', startDate, endDate: new Date(startDate.getTime() + 2 * 3600_000), congregationId },
          })
        const upcoming = await meeting(new Date(Date.now() + 7 * 24 * 3600_000))
        const past = await meeting(new Date(Date.now() - 7 * 24 * 3600_000))

        // Shared on the speaker, alone on the reader: one slot, counted once.
        await tx.eventPart.create({
          data: {
            name: 'Lecture',
            eventId: upcoming.id,
            congregationId,
            allowedRoles: {
              create: [
                { roleId: role.id, asKind: 'speaker', congregationId },
                { roleId: other.id, asKind: 'speaker', congregationId },
                { roleId: role.id, asKind: 'reader', congregationId },
              ],
            },
          },
        })
        // Shared on its only slot: not reserved.
        await tx.eventPart.create({
          data: {
            name: 'Discours',
            eventId: upcoming.id,
            congregationId,
            allowedRoles: {
              create: [
                { roleId: role.id, asKind: 'speaker', congregationId },
                { roleId: other.id, asKind: 'speaker', congregationId },
              ],
            },
          },
        })
        // Alone on a duty.
        await tx.eventServicePart.create({
          data: {
            name: 'Sono',
            eventId: upcoming.id,
            congregationId,
            allowedRoles: { create: [{ roleId: role.id, congregationId }] },
          },
        })
        // Alone, but the meeting is past.
        await tx.eventPart.create({
          data: {
            name: 'Lecture',
            eventId: past.id,
            congregationId,
            allowedRoles: { create: [{ roleId: role.id, asKind: 'reader', congregationId }] },
          },
        })

        programmeSlots = (await findSoleReservations(tx as unknown as TransactionClient, role.id, congregationId))
          .programmeSlots
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }

    expect(programmeSlots).toBe(2)
  })
})
