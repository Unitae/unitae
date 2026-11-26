import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// « Dupliquer » copies what a new meeting of the type gets (6b-0): its schedule templates' items, those filed under the
// type and those written from « Modèles de planning » under none (6b-1), with who may take each. In a congregation of
// its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { duplicateTemplate } = await import('./duplicate-template.server')

class Rollback extends Error {}

afterAll(async () => {
  await flushPendingAuditWrites()
  await testDb.$disconnect()
})

describe('duplicateTemplate', () => {
  it('copies the items of the type’s schedule templates, whatever kind they are filed under', async () => {
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
          const role = await tx.role.create({ data: { key: `r-${stamp}`, name: 'Sono', congregationId } })
          const kind = await tx.eventTemplate.create({ data: { name: 'Visite', key: stamp, congregationId } })
          const programme = await tx.scheduleTemplate.create({
            data: { name: 'Visite', kind: 'programme', congregationId },
          })
          const duties = await tx.scheduleTemplate.create({ data: { name: 'Accueil', kind: 'duty', congregationId } })
          await tx.eventKindScheduleTemplate.createMany({
            data: [
              { eventKindId: kind.id, scheduleTemplateId: programme.id, order: 0, congregationId },
              { eventKindId: kind.id, scheduleTemplateId: duties.id, order: 1, congregationId },
            ],
          })
          const part = { section: '', track: '', scheduleTemplateId: programme.id, congregationId }
          await tx.templatePart.create({ data: { ...part, name: 'Du type', order: 0, templateId: kind.id } })
          await tx.templatePart.create({ data: { ...part, name: 'Du modèle', order: 1 } })
          const service = await tx.templateServicePart.create({
            data: { name: 'Porte', key: 'porte', order: 0, scheduleTemplateId: duties.id, congregationId },
          })
          await tx.templateServicePartAllowedRole.create({
            data: { servicePartId: service.id, roleId: role.id, congregationId },
          })

          const copy = await duplicateTemplate(db, kind.id, congregationId, actorId)
          const copied = await tx.eventTemplate.findFirstOrThrow({
            where: { id: copy?.id ?? -1 },
            select: {
              parts: { orderBy: { order: 'asc' }, select: { name: true } },
              serviceParts: { select: { name: true, allowedRoles: { select: { roleId: true } } } },
            },
          })
          read = {
            parts: copied.parts.map(each => each.name),
            services: copied.serviceParts.map(
              each => `${each.name}:${each.allowedRoles.map(r => r.roleId === role.id)}`,
            ),
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    expect(read).toEqual({ parts: ['Du type', 'Du modèle'], services: ['Porte:true'] })
  })
})
