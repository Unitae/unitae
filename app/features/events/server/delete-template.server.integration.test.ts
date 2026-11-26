import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Deleting a meeting type takes the schedule templates only it uses, with every item in them: its own rows, and those a
// template holds under no kind (written from « Modèles de planning », 6b-1). A template another type uses stays. In a
// congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { deleteTemplate } = await import('./delete-template.server')

class Rollback extends Error {}

afterAll(async () => {
  await flushPendingAuditWrites()
  await testDb.$disconnect()
})

describe('deleteTemplate', () => {
  it('takes the templates only the type uses, with the items they hold under no kind, and leaves a shared one', async () => {
    let read: Record<string, unknown> | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `delete-kind-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          const kind = (name: string) =>
            tx.eventTemplate.create({ data: { name, key: `${stamp}-${name}`, congregationId } })
          const gone = await kind('Partant')
          const other = await kind('Restant')
          const own = await tx.scheduleTemplate.create({ data: { name: 'Propre', kind: 'programme', congregationId } })
          const shared = await tx.scheduleTemplate.create({ data: { name: 'Partagé', kind: 'duty', congregationId } })
          await tx.eventKindScheduleTemplate.createMany({
            data: [
              { eventKindId: gone.id, scheduleTemplateId: own.id, congregationId },
              { eventKindId: gone.id, scheduleTemplateId: shared.id, congregationId },
              { eventKindId: other.id, scheduleTemplateId: shared.id, congregationId },
            ],
          })
          await tx.templatePart.create({
            data: {
              name: 'Du type',
              section: '',
              track: '',
              order: 0,
              templateId: gone.id,
              scheduleTemplateId: own.id,
              congregationId,
            },
          })
          await tx.templatePart.create({
            data: { name: 'Du modèle', section: '', track: '', order: 1, scheduleTemplateId: own.id, congregationId },
          })
          await tx.templateServicePart.create({
            data: { name: 'Zoom', key: 'zoom', scheduleTemplateId: shared.id, congregationId },
          })

          const result = await deleteTemplate(db, gone.id, congregationId, actorId)
          read = {
            ok: (result as { ok?: boolean }).ok,
            templates: (await tx.scheduleTemplate.findMany({ where: { congregationId }, select: { name: true } })).map(
              each => each.name,
            ),
            parts: await tx.templatePart.count({ where: { congregationId } }),
            services: await tx.templateServicePart.count({ where: { congregationId } }),
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    expect(read).toEqual({ ok: true, templates: ['Partagé'], parts: 0, services: 1 })
  })
})
