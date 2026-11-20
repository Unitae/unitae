import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { importSchedules } = await import('./import-schedules.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('importSchedules', () => {
  it("gives a restored congregation's templates and events the schedules the migration gives live ones", async () => {
    let outcome: unknown
    try {
      await testDb.$transaction(async tx => {
        const stamp = `is-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const role = await tx.role.create({ data: { key: `${stamp}-r`, name: 'Responsable', congregationId } })
        const template = await tx.eventTemplate.create({ data: { name: 'Réunion', key: stamp, congregationId } })
        await tx.templatePart.create({ data: { name: 'Discours', order: 0, templateId: template.id, congregationId } })
        await tx.templateServicePart.create({
          data: { name: 'Sono', key: `${stamp}-s`, templateId: template.id, congregationId },
        })
        await tx.templateResponsible.create({ data: { templateId: template.id, roleId: role.id, congregationId } })
        const event = (status: string) =>
          tx.event.create({
            data: {
              name: 'Réunion',
              startDate: new Date('2027-05-04T17:00:00Z'),
              endDate: new Date('2027-05-04T19:00:00Z'),
              status,
              templateId: template.id,
              congregationId,
            },
          })
        const released = await event('released')
        const empty = await event('draft')
        await tx.eventPart.create({ data: { eventId: released.id, name: 'Discours', congregationId } })
        await tx.eventServicePart.create({ data: { eventId: released.id, name: 'Sono', congregationId } })

        await importSchedules(tx as unknown as TransactionClient, congregationId)

        outcome = {
          scheduleTemplates: await tx.scheduleTemplate.findMany({
            select: { kind: true, name: true, key: true, responsibleRoleId: true },
            orderBy: { id: 'asc' },
          }),
          schedules: await tx.schedule.findMany({
            select: {
              eventId: true,
              kind: true,
              status: true,
              _count: { select: { parts: true, serviceParts: true } },
            },
            orderBy: { order: 'asc' },
          }),
          templateItemsWithout:
            (await tx.templatePart.count({ where: { scheduleTemplateId: null } })) +
            (await tx.templateServicePart.count({ where: { scheduleTemplateId: null } })),
          emptyId: empty.id,
          releasedId: released.id,
          roleId: role.id,
        }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }

    const { releasedId, roleId } = outcome as { releasedId: number; roleId: number }
    expect(outcome).toMatchObject({
      scheduleTemplates: [
        { kind: 'programme', name: 'Réunion', key: null, responsibleRoleId: roleId },
        { kind: 'duty', name: null, key: 'services', responsibleRoleId: roleId },
      ],
      schedules: [
        { eventId: releasedId, kind: 'programme', status: 'published', _count: { parts: 1, serviceParts: 0 } },
        { eventId: releasedId, kind: 'duty', status: 'published', _count: { parts: 0, serviceParts: 1 } },
      ],
      templateItemsWithout: 0,
    })
  })
})
