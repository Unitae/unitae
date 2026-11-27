import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// « Dupliquer » on a meeting type makes another type using the same schedule templates, not copies of them (user,
// 2026-11-27): its new meetings get the same items, and a part added to a template later reaches both types. In a
// congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { duplicateTemplate } = await import('./duplicate-template.server')
const { kindTemplate, TEMPLATE_INCLUDE } = await import('./give-programme.server')

class Rollback extends Error {}

afterAll(async () => {
  await flushPendingAuditWrites()
  await testDb.$disconnect()
})

describe('duplicateTemplate', () => {
  it('makes a type using the same templates, in their order, copying nothing', async () => {
    let read: Record<string, unknown> | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `dup-kind-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          const kind = await tx.eventTemplate.create({
            data: { name: 'Visite', key: stamp, weekDay: 2, startTime: '19:00', endTime: '20:45', congregationId },
          })
          const programme = await tx.scheduleTemplate.create({
            data: { name: 'Visite', kind: 'programme', congregationId },
          })
          const duties = await tx.scheduleTemplate.create({ data: { name: 'Accueil', kind: 'duty', congregationId } })
          await tx.eventKindScheduleTemplate.createMany({
            data: [
              { eventKindId: kind.id, scheduleTemplateId: duties.id, order: 0, congregationId },
              { eventKindId: kind.id, scheduleTemplateId: programme.id, order: 1, congregationId },
            ],
          })
          const part = { section: '', track: '', scheduleTemplateId: programme.id, congregationId }
          await tx.templatePart.create({ data: { ...part, name: 'Du type', order: 0, templateId: kind.id } })
          await tx.templatePart.create({ data: { ...part, name: 'Du modèle', order: 1 } })
          await tx.templateServicePart.create({
            data: { name: 'Porte', key: 'porte', order: 0, scheduleTemplateId: duties.id, congregationId },
          })
          const counts = async () => ({
            templates: await tx.scheduleTemplate.count({ where: { congregationId } }),
            parts: await tx.templatePart.count({ where: { congregationId } }),
            services: await tx.templateServicePart.count({ where: { congregationId } }),
          })
          const before = await counts()

          const copy = await duplicateTemplate(db, kind.id, congregationId, actorId)
          const copyId = copy?.id ?? -1
          const items = async (id: number) => {
            const loaded = kindTemplate(
              await tx.eventTemplate.findFirstOrThrow({ where: { id }, include: TEMPLATE_INCLUDE }),
            )
            return [...loaded.parts.map(each => each.name), ...loaded.serviceParts.map(each => each.name)]
          }
          const afterCopy = { counts: await counts(), copied: await items(copyId) }
          await tx.templatePart.create({ data: { ...part, name: 'Ajoutée', order: 2 } })
          read = {
            before,
            afterCopy,
            copy: await tx.eventTemplate.findFirstOrThrow({
              where: { id: copyId },
              select: { weekDay: true, startTime: true, endTime: true },
            }),
            links: (
              await tx.eventKindScheduleTemplate.findMany({
                where: { eventKindId: copyId },
                orderBy: { order: 'asc' },
                select: { scheduleTemplateId: true },
              })
            ).map(each => each.scheduleTemplateId),
            expected: [duties.id, programme.id],
            later: [await items(kind.id), await items(copyId)],
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    expect(read?.afterCopy).toEqual({
      counts: read?.before,
      copied: ['Du type', 'Du modèle', 'Porte'],
    })
    expect(read?.copy).toEqual({ weekDay: 2, startTime: '19:00', endTime: '20:45' })
    expect(read?.links).toEqual(read?.expected)
    expect(read?.later).toEqual([
      ['Du type', 'Du modèle', 'Ajoutée', 'Porte'],
      ['Du type', 'Du modèle', 'Ajoutée', 'Porte'],
    ])
  })
})
