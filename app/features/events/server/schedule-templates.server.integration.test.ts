import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import type { TransactionClient } from '~/shared/infra/db.server'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { deleteTemplateScheduleTemplates, syncTemplateScheduleTemplates } = await import('./schedule-templates.server')

class Rollback extends Error {}

interface Fixture {
  db: TransactionClient
  congregationId: number
  template: (name: string, key?: string) => Promise<number>
  part: (templateId: number) => Promise<number>
  service: (templateId: number) => Promise<number>
  role: (name: string) => Promise<number>
  responsible: (templateId: number, roleId: number, scope: string) => Promise<void>
  /** The template's schedule templates, in order, and which of them its items point at. */
  read: (templateId: number) => Promise<{
    scheduleTemplates: {
      id: number
      kind: string
      name: string | null
      key: string | null
      responsibleRoleId: number | null
      order: number
    }[]
    parts: (number | null)[]
    services: (number | null)[]
  }>
}

/** Runs `fn` in a congregation of its own, inside a transaction that is rolled back. */
async function inCongregation(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(async tx => {
      const stamp = `st-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      let counter = 0
      const db = tx as unknown as TransactionClient
      await fn({
        db,
        congregationId,
        template: async (name, key) =>
          (await tx.eventTemplate.create({ data: { name, key: key ?? `${stamp}-${counter++}`, congregationId } })).id,
        part: async templateId =>
          (await tx.templatePart.create({ data: { name: 'Partie', order: counter++, templateId, congregationId } })).id,
        service: async templateId =>
          (
            await tx.templateServicePart.create({
              data: { name: 'Sono', key: `${stamp}-s${counter++}`, templateId, congregationId },
            })
          ).id,
        role: async name => (await tx.role.create({ data: { key: `${stamp}-${name}`, name, congregationId } })).id,
        responsible: async (templateId, roleId, scope) => {
          await tx.templateResponsible.create({ data: { templateId, roleId, scope, congregationId } })
        },
        read: async templateId => {
          const links = await tx.eventKindScheduleTemplate.findMany({
            where: { eventKindId: templateId },
            include: { scheduleTemplate: true },
            orderBy: { order: 'asc' },
          })
          const parts = await tx.templatePart.findMany({ where: { templateId }, orderBy: { id: 'asc' } })
          const services = await tx.templateServicePart.findMany({ where: { templateId }, orderBy: { id: 'asc' } })
          return {
            scheduleTemplates: links.map(link => ({
              id: link.scheduleTemplateId,
              kind: link.scheduleTemplate.kind,
              name: link.scheduleTemplate.name,
              key: link.scheduleTemplate.key,
              responsibleRoleId: link.scheduleTemplate.responsibleRoleId,
              order: link.order,
            })),
            parts: parts.map(item => item.scheduleTemplateId),
            services: services.map(item => item.scheduleTemplateId),
          }
        },
      })
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('syncTemplateScheduleTemplates', () => {
  it('gives a template its programme, named after it, and its duties, each with its responsible, items inside', async () => {
    await inCongregation(async ({ db, congregationId, template, part, service, role, responsible, read }) => {
      const midweek = await template('Réunion de semaine')
      await part(midweek)
      await part(midweek)
      await service(midweek)
      const programmeRole = await role('programme')
      const serviceRole = await role('service')
      await responsible(midweek, programmeRole, ResponsibilityScope.Programme)
      await responsible(midweek, serviceRole, ResponsibilityScope.Service)

      await syncTemplateScheduleTemplates(db, midweek, congregationId)

      const { scheduleTemplates, parts, services } = await read(midweek)
      expect(scheduleTemplates).toEqual([
        {
          id: expect.any(Number),
          kind: 'programme',
          name: 'Réunion de semaine',
          key: null,
          responsibleRoleId: programmeRole,
          order: 0,
        },
        { id: expect.any(Number), kind: 'duty', name: null, key: 'services', responsibleRoleId: serviceRole, order: 1 },
      ])
      expect(parts).toEqual([scheduleTemplates[0].id, scheduleTemplates[0].id])
      expect(services).toEqual([scheduleTemplates[1].id])
    })
  })

  it('leaves the duties without a responsible when the template names only a programme one (user, 2026-11-24)', async () => {
    await inCongregation(async ({ db, congregationId, template, service, role, responsible, read }) => {
      const cleaning = await template('Nettoyage')
      await service(cleaning)
      const programmeRole = await role('programme')
      await responsible(cleaning, programmeRole, ResponsibilityScope.Programme)

      await syncTemplateScheduleTemplates(db, cleaning, congregationId)

      expect((await read(cleaning)).scheduleTemplates).toMatchObject([
        { kind: 'duty', responsibleRoleId: null, order: 1 },
      ])
    })
  })

  it('makes nothing for a template with neither parts nor services, nor for the freeform one', async () => {
    await inCongregation(async ({ db, congregationId, template, part, read }) => {
      const visit = await template('Visite')
      const freeform = await template('Autre évènement', 'freeform')
      await part(freeform)

      await syncTemplateScheduleTemplates(db, visit, congregationId)
      await syncTemplateScheduleTemplates(db, freeform, congregationId)

      expect((await read(visit)).scheduleTemplates).toEqual([])
      expect(await read(freeform)).toEqual({ scheduleTemplates: [], parts: [null], services: [] })
    })
  })

  it('creates nothing twice, and follows what changed since: a new item, a responsible — never a rename', async () => {
    await inCongregation(async ({ db, congregationId, template, part, service, role, responsible, read }) => {
      const weekend = await template('Réunion de week-end')
      await part(weekend)
      const first = await role('first')
      await responsible(weekend, first, ResponsibilityScope.Programme)
      await syncTemplateScheduleTemplates(db, weekend, congregationId)
      const before = (await read(weekend)).scheduleTemplates

      await part(weekend)
      await service(weekend)
      await db.eventTemplate.update({
        where: { id_congregationId: { id: weekend, congregationId } },
        data: { name: 'Réunion publique' },
      })
      const second = await role('second')
      await db.templateResponsible.updateMany({ where: { templateId: weekend }, data: { roleId: second } })
      await syncTemplateScheduleTemplates(db, weekend, congregationId)
      await syncTemplateScheduleTemplates(db, weekend, congregationId)

      const after = await read(weekend)
      expect(after.scheduleTemplates).toMatchObject([
        // Its name belongs to Réglages › « Modèles de planning » since 6a: the kind's rename leaves it.
        { id: before[0].id, kind: 'programme', name: 'Réunion de week-end', responsibleRoleId: second },
        { kind: 'duty', responsibleRoleId: null },
      ])
      expect(after.parts).toEqual([before[0].id, before[0].id])
      expect(after.services).toEqual([after.scheduleTemplates[1].id])
    })
  })

  it('clears a responsible the template no longer names', async () => {
    await inCongregation(async ({ db, congregationId, template, part, role, responsible, read }) => {
      const midweek = await template('Réunion de semaine')
      await part(midweek)
      await responsible(midweek, await role('programme'), ResponsibilityScope.Programme)
      await syncTemplateScheduleTemplates(db, midweek, congregationId)

      await db.templateResponsible.deleteMany({ where: { templateId: midweek } })
      await syncTemplateScheduleTemplates(db, midweek, congregationId)

      expect((await read(midweek)).scheduleTemplates).toMatchObject([{ kind: 'programme', responsibleRoleId: null }])
    })
  })

  it("never shows a congregation another one's schedule templates", async () => {
    await inCongregation(async ({ db, congregationId, template, part }) => {
      const midweek = await template('Réunion de semaine')
      await part(midweek)
      await syncTemplateScheduleTemplates(db, midweek, congregationId)
      expect(await db.scheduleTemplate.count()).toBe(1)

      await db.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId + 1_000_000)}'`)
      expect(await db.scheduleTemplate.count()).toBe(0)
      expect(await db.eventKindScheduleTemplate.count()).toBe(0)
    })
  })
})

describe('syncTemplateScheduleTemplates at the same moment', () => {
  it('gives a template one schedule template of a kind when two writers sync it together', async () => {
    const stamp = `st-race-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
    const congregationId = (await testDb.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
    const scoped = <T>(fn: (db: TransactionClient) => Promise<T>) =>
      testDb.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        return fn(tx as unknown as TransactionClient)
      })
    try {
      const templateId = await scoped(async db => {
        const template = await db.eventTemplate.create({ data: { name: 'Réunion', key: stamp, congregationId } })
        await db.templatePart.create({ data: { name: 'Discours', order: 0, templateId: template.id, congregationId } })
        return template.id
      })

      await Promise.all(
        [1, 2].map(() =>
          scoped(async db => {
            await syncTemplateScheduleTemplates(db, templateId, congregationId)
            // Holds the transaction open a moment, as the write that follows a sync would.
            await db.$executeRawUnsafe('SELECT pg_sleep(0.2)')
          }),
        ),
      )

      expect(await scoped(db => db.scheduleTemplate.count({ where: { congregationId } }))).toBe(1)
    } finally {
      await scoped(async db => {
        await db.scheduleTemplate.deleteMany({ where: { congregationId } })
        await db.templatePart.deleteMany({ where: { congregationId } })
        await db.eventTemplate.deleteMany({ where: { congregationId } })
      })
      await testDb.congregation.delete({ where: { id: congregationId } })
    }
  })
})

describe('deleteTemplateScheduleTemplates', () => {
  it('deletes the schedule templates a template suggests, before the template goes', async () => {
    await inCongregation(async ({ db, congregationId, template, part, service }) => {
      const midweek = await template('Réunion de semaine')
      await part(midweek)
      await service(midweek)
      const kept = await template('Réunion de week-end')
      await part(kept)
      await syncTemplateScheduleTemplates(db, midweek, congregationId)
      await syncTemplateScheduleTemplates(db, kept, congregationId)

      await deleteTemplateScheduleTemplates(db, midweek, congregationId)

      expect(await db.scheduleTemplate.count()).toBe(1)
      expect(await db.eventKindScheduleTemplate.findMany({ select: { eventKindId: true } })).toEqual([
        { eventKindId: kept },
      ])
    })
  })

  it('keeps a schedule template another template suggests too', async () => {
    await inCongregation(async ({ db, congregationId, template, part }) => {
      const midweek = await template('Réunion de semaine')
      await part(midweek)
      const other = await template('Réunion spéciale')
      await syncTemplateScheduleTemplates(db, midweek, congregationId)
      const shared = await db.eventKindScheduleTemplate.findFirstOrThrow({ where: { eventKindId: midweek } })
      await db.eventKindScheduleTemplate.create({
        data: { eventKindId: other, scheduleTemplateId: shared.scheduleTemplateId, order: 0, congregationId },
      })

      await deleteTemplateScheduleTemplates(db, midweek, congregationId)

      expect(await db.scheduleTemplate.count({ where: { id: shared.scheduleTemplateId } })).toBe(1)
    })
  })
})
